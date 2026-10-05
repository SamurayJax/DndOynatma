// Karakterleri dışa / içe aktarma: Ayarlar › Oyuncular'daki iki düğme, dosyanın yazılması,
// başka bir kayıt klasöründe onay kutusu ve kartların portreleriyle gelmesi, bozuk dosya.
// Çalıştırma: node e2e/main/05-karakter-aktarma.mjs
//
// Dosya seçme ve kaydetme pencereleri yerel pencerelerdir; yerlerine verilen yolu döndüren
// sahteleri konur. Geri Dönüşüm Kutusu da sahtedir (dosyayı geçici bir klasöre taşır).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makePng } from '../fixtures.mjs'
import { check, hasCode, lastRunEntries, launch, makeWorkDir, menuPage, quitFromUi, root, run, sleep, waitFor, waitForRole } from './harness.mjs'

const outDir = join(root, 'e2e', '.cikti')
mkdirSync(outDir, { recursive: true })

const stateOf = (page) => page.evaluate(() => window.dnd.getState())
const imagesIn = (work) => readdirSync(join(work.dataDir, 'gorseller')).sort()
const cardsOf = (state) => state.app.players.map(({ name, level, hp, note }) => ({ name, level, hp, note }))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const stubSave = (session, target) =>
  session.app.evaluate(({ dialog }, filePath) => {
    globalThis.__saveCalls = []
    dialog.showSaveDialog = async (...args) => {
      globalThis.__saveCalls.push(args.at(-1))
      return filePath === null ? { canceled: true, filePath: '' } : { canceled: false, filePath }
    }
  }, target)

const stubOpen = (session, target) =>
  session.app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => (filePath === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [filePath] })
  }, target)

const stubTrash = (session, trashDir) =>
  session.app.evaluate(({ shell }, dir) => {
    const fs = process.getBuiltinModule('node:fs')
    const path = process.getBuiltinModule('node:path')
    fs.mkdirSync(dir, { recursive: true })
    globalThis.__trashCalls = []
    shell.trashItem = async (target) => {
      globalThis.__trashCalls.push(target)
      fs.renameSync(target, path.join(dir, `${Date.now()}-${path.basename(target)}`))
    }
  }, trashDir)

const trashCalls = (session) => session.app.evaluate(() => globalThis.__trashCalls.length)

async function openPlayersTab(menu) {
  await menu.getByRole('button', { name: 'Ayarlar' }).click()
  await menu.getByRole('button', { name: 'İçe aktar', exact: true }).waitFor({ timeout: 8000 })
}

const toastTexts = (page) => page.locator('.ui-toast').allTextContents()
const waitToast = (page, text) => waitFor(() => toastTexts(page), (texts) => texts.some((entry) => entry.includes(text)), 6000)
const rowsOf = (page) =>
  page.locator('.set-import__row').evaluateAll((rows) =>
    rows.map((row) => ({
      slot: row.querySelector('.set-import__slot')?.textContent ?? '',
      status: row.querySelector('.set-chip')?.textContent ?? '',
      text: row.querySelector('.set-import__detail')?.textContent ?? '',
      changing: row.classList.contains('is-changing')
    }))
  )
const modalOpen = (page) => page.locator('dialog.ui-modal[open]').count().then((count) => count > 0)

await run(async () => {
  const shared = makeWorkDir('aktarma-dosya')
  const exportFile = join(shared.base, 'ekibim.dndkarakter')
  const portraitA = makePng(400, 400, [180, 120, 60], [60, 30, 20])
  const portraitB = makePng(360, 480, [60, 120, 180], [20, 30, 60])
  writeFileSync(join(shared.samplesDir, 'kenji.png'), portraitA)
  writeFileSync(join(shared.samplesDir, 'jasper.png'), portraitB)

  // ===== 1. Kaynak bilgisayar: dışa aktarma =====
  const source = makeWorkDir('aktarma-kaynak')
  let session = await launch(source)
  let menu = await menuPage(session)
  await menu.evaluate(async (dir) => {
    const d = window.dnd
    await d.library.importPortraitFile(0, `${dir}\\kenji.png`)
    await d.library.importPortraitFile(1, `${dir}\\jasper.png`)
    d.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4, note: 'Gümüş kılıç onda' } })
    d.dispatch({ type: 'player/update', slot: 1, patch: { name: 'Jasper', level: 5 } })
    d.dispatch({ type: 'player/update', slot: 3, patch: { name: 'Mira', level: 2 } })
    d.dispatch({ type: 'player/setHp', slot: 0, hp: 7 })
    d.dispatch({ type: 'player/setHp', slot: 3, hp: 0 })
  }, shared.samplesDir)
  const sourceState = await stateOf(menu)
  const sourceImages = imagesIn(source)

  await openPlayersTab(menu)
  const exportButton = menu.getByRole('button', { name: 'Dışa aktar', exact: true })
  const importButton = menu.getByRole('button', { name: 'İçe aktar', exact: true })
  check('Oyuncular sekmesinde "İçe aktar" ve "Dışa aktar" düğmeleri var', (await exportButton.isVisible()) && (await importButton.isVisible()))
  check('dolu kart varken "Dışa aktar" etkin', await exportButton.isEnabled())
  await menu.screenshot({ path: join(outDir, 'aktarma-01-oyuncular.png') })

  await stubSave(session, null)
  await exportButton.click()
  await sleep(500)
  check('kaydetme penceresi iptal edilince dosya yazılmaz, bildirim çıkmaz', !existsSync(exportFile) && (await toastTexts(menu)).length === 0)
  const saveOptions = await session.app.evaluate(() => globalThis.__saveCalls[0])
  check('kaydetme penceresi tarihli ad ve .dndkarakter uzantısı önerir', /^DndOynatma-Karakterler-\d{4}-\d{2}-\d{2}\.dndkarakter$/.test(saveOptions?.defaultPath ?? ''), saveOptions?.defaultPath)

  await stubSave(session, exportFile)
  await exportButton.click()
  const exportToasts = await waitToast(menu, 'kart dışa aktarıldı')
  check('dışa aktarınca bildirim: kart sayısı ve dosya adı', exportToasts.some((text) => text.includes('3 kart dışa aktarıldı: ekibim.dndkarakter')), JSON.stringify(exportToasts))
  check('dosya seçilen yere yazıldı', existsSync(exportFile))
  const fileBytes = readFileSync(exportFile)
  check('dosya imzayla başlar ve iki portreyi ham olarak taşır', fileBytes.subarray(0, 20).toString('latin1') === 'DNDOYNATMA-KARAKTER\n' && fileBytes.includes(portraitA) && fileBytes.includes(portraitB))
  check('dosya, portrelerin toplamından yalnızca biraz büyük', fileBytes.length < portraitA.length + portraitB.length + 2048, `${fileBytes.length} bayt`)
  check('yan dosya kalmadı', readdirSync(shared.base).filter((name) => name.includes('yaziliyor')).length === 0)
  check('dışa aktarma kaynağın kaydına ve görsellerine dokunmaz', same(await stateOf(menu), sourceState) && same(imagesIn(source), sourceImages))
  const sourceLog = lastRunEntries(source.dataDir).join('\n')
  check('log: kart sayısı yazılır, isim ve not yazılmaz', sourceLog.includes('Karakterler dışa aktarıldı: 3 kart') && !/Kenji|Jasper|Mira|Gümüş/.test(sourceLog))
  let exit = await quitFromUi(session, menu)
  check('kaynak uygulama düzgün kapanır', exit !== null && exit.code === 0)

  // ===== 2. Hedef bilgisayar: boş kayda içe aktarma =====
  const target = makeWorkDir('aktarma-hedef')
  session = await launch(target)
  menu = await menuPage(session)
  await stubTrash(session, join(target.base, 'cop'))
  await openPlayersTab(menu)
  check('dolu kart yokken "Dışa aktar" kapalı', await menu.getByRole('button', { name: 'Dışa aktar', exact: true }).isDisabled())

  await stubOpen(session, null)
  await menu.getByRole('button', { name: 'İçe aktar', exact: true }).click()
  await sleep(500)
  check('dosya seçme penceresi iptal edilince onay kutusu açılmaz', !(await modalOpen(menu)))

  await stubOpen(session, exportFile)
  await menu.getByRole('button', { name: 'İçe aktar', exact: true }).click()
  await menu.locator('.set-import__row').first().waitFor({ timeout: 8000 })
  let rows = await rowsOf(menu)
  check('onay kutusu dört kartı da gösterir', rows.length === 4 && same(rows.map((row) => row.slot), ['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3', 'Oyuncu 4']))
  check('dosyadaki üç kart "Değişecek", olmayan kart "Dosyada yok"', same(rows.map((row) => row.status), ['Değişecek', 'Değişecek', 'Dosyada yok', 'Değişecek']), JSON.stringify(rows.map((row) => row.status)))
  check('satırda gelen kartın adı, seviyesi, canı, portresi ve notu yazar', rows[0].text.includes('Kenji · seviye 4') && rows[0].text.includes('Can 7/10') && rows[0].text.includes('portre var') && rows[0].text.includes('not var'), rows[0].text)
  check('portresiz ve notsuz kart öyle gösterilir', rows[3].text.includes('Mira · seviye 2') && rows[3].text.includes('Can 0/10') && rows[3].text.includes('portre yok') && rows[3].text.includes('not yok'), rows[3].text)
  check('dosya adı kutuda yazar', (await menu.locator('.set-import__file-name').textContent()) === 'ekibim.dndkarakter')
  check('onay verilmeden kayda dokunulmaz', same(cardsOf(await stateOf(menu)), cardsOf({ app: { players: Array(4).fill({ name: '', level: 1, hp: 10, note: '' }) } })) && imagesIn(target).length === 0)
  await sleep(400) // kutunun açılış animasyonu bitsin
  await menu.screenshot({ path: join(outDir, 'aktarma-02-onay-bos-kayit.png') })

  await menu.keyboard.press('Escape')
  await sleep(300)
  check('Escape onay kutusunu kapatır, kartlar değişmez', !(await modalOpen(menu)) && (await stateOf(menu)).app.players.every((player) => player.name === ''))

  await menu.getByRole('button', { name: 'İçe aktar', exact: true }).click()
  const confirm = menu.getByRole('button', { name: '3 kartı içe aktar' })
  await confirm.waitFor({ timeout: 8000 })
  await confirm.click()
  const importToasts = await waitToast(menu, 'kart içe aktarıldı')
  check('içe aktarınca bildirim çıkar ve kutu kapanır', importToasts.some((text) => text.includes('3 kart içe aktarıldı')) && !(await modalOpen(menu)), JSON.stringify(importToasts))

  let state = await stateOf(menu)
  check('dört kart kaynaktakiyle aynı: isim, seviye, can, not', same(cardsOf(state), cardsOf(sourceState)), JSON.stringify(cardsOf(state)))
  const portraitOf = (appState, work, slot) => {
    const image = appState.app.library.find((entry) => entry.id === appState.app.players[slot].portraitId)
    return image ? readFileSync(join(work.dataDir, 'gorseller', image.fileName)) : null
  }
  check('portreler bayt bayt aynı geldi', portraitOf(state, target, 0)?.equals(portraitA) === true && portraitOf(state, target, 1)?.equals(portraitB) === true && portraitOf(state, target, 3) === null)
  check('kütüphaneye yalnızca iki portre girdi', state.app.library.length === 2 && state.app.library.every((image) => image.kind === 'portrait') && imagesIn(target).length === 2)
  const shown = await waitFor(
    () => menu.locator('.set-portrait__img img, img.set-portrait__img').evaluateAll((images) => images.map((img) => img.naturalWidth)),
    (widths) => widths.length === 2 && widths.every((width) => width > 0),
    6000
  )
  check('kartlarda portreler görünüyor', same(shown, [400, 360]), JSON.stringify(shown))
  check('isimler kartlara yazıldı', same(await menu.locator('.set-player__name input').evaluateAll((inputs) => inputs.map((input) => input.value)), ['Kenji', 'Jasper', '', 'Mira']))
  await menu.screenshot({ path: join(outDir, 'aktarma-03-ice-aktarildi.png') })

  // ===== 3. Aynı dosya ikinci kez =====
  const filesAfterFirst = imagesIn(target)
  await menu.getByRole('button', { name: 'İçe aktar', exact: true }).click()
  await menu.locator('.set-import__row').first().waitFor({ timeout: 8000 })
  rows = await rowsOf(menu)
  check('aynı dosyada kartlar "Zaten aynı" görünür', same(rows.map((row) => row.status), ['Zaten aynı', 'Zaten aynı', 'Dosyada yok', 'Zaten aynı']), JSON.stringify(rows.map((row) => row.status)))
  check('değişecek kart yokken onay düğmesi kapalı', await menu.locator('.ui-modal__footer .ui-btn--primary').isDisabled())
  await menu.getByRole('button', { name: 'Vazgeç' }).click()
  await sleep(300)
  check('vazgeçince hiçbir şey değişmez', !(await modalOpen(menu)) && same(await stateOf(menu), state) && same(imagesIn(target), filesAfterFirst))

  // ===== 4. Dolu kartların üzerine =====
  await menu.evaluate(() => {
    window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Değişmiş', level: 9, note: 'silinecek' } })
    window.dnd.dispatch({ type: 'player/update', slot: 2, patch: { name: 'Dokunulmaz', level: 6, note: 'kalacak' } })
    window.dnd.dispatch({ type: 'player/update', slot: 1, patch: { portraitId: null } })
  })
  await sleep(400)
  check('portresi kaldırılan kartın eski portresi çöpe gitti', (await trashCalls(session)) === 1)
  await menu.getByRole('button', { name: 'İçe aktar', exact: true }).click()
  await menu.locator('.set-import__row').first().waitFor({ timeout: 8000 })
  rows = await rowsOf(menu)
  check('değişen iki kart "Değişecek", dosyada olmayan dolu kart "Dosyada yok"', same(rows.map((row) => row.status), ['Değişecek', 'Değişecek', 'Dosyada yok', 'Zaten aynı']), JSON.stringify(rows.map((row) => row.status)))
  check('yerine geçilecek kartın şimdiki adı üstü çizili gösterilir', rows[0].text.includes('Değişmiş · seviye 9') && (await menu.locator('.set-import__row[data-slot="0"] .set-import__old.is-replaced').count()) === 1)
  check('dosyada olmayan kart kendi adıyla durur', rows[2].text.includes('Dokunulmaz · seviye 6') && rows[2].changing === false)
  const note = (await menu.locator('.set-import__note').textContent()) ?? ''
  check('kutuda bilgilerin silineceği ve dosyada olmayana dokunulmayacağı yazar', note.includes('silinir') && note.includes('Dosyada olmayan kartlara dokunulmaz'), note)
  await sleep(400) // kutunun açılış animasyonu bitsin
  await menu.screenshot({ path: join(outDir, 'aktarma-04-onay-dolu-kayit.png') })

  await menu.getByRole('button', { name: '2 kartı içe aktar' }).click()
  await waitToast(menu, '2 kart içe aktarıldı')
  state = await stateOf(menu)
  check('dosyadaki kartlar geri geldi, dosyada olmayan kart yerinde', same(cardsOf(state), [{ name: 'Kenji', level: 4, hp: 7, note: 'Gümüş kılıç onda' }, { name: 'Jasper', level: 5, hp: 10, note: '' }, { name: 'Dokunulmaz', level: 6, hp: 10, note: 'kalacak' }, { name: 'Mira', level: 2, hp: 0, note: '' }]), JSON.stringify(cardsOf(state)))
  check('portresi aynı kalan kart yeniden yazılmadı; kaldırılan portre geri geldi', imagesIn(target).length === 2 && portraitOf(state, target, 0)?.equals(portraitA) === true && portraitOf(state, target, 1)?.equals(portraitB) === true && (await trashCalls(session)) === 1)

  // ===== 5. Bozuk ve yabancı dosyalar =====
  const before = await stateOf(menu)
  const filesBefore = imagesIn(target)
  const broken = join(shared.base, 'bozuk.dndkarakter')
  writeFileSync(broken, fileBytes.subarray(0, fileBytes.length - 100))
  const foreign = join(shared.base, 'resim.dndkarakter')
  writeFileSync(foreign, portraitA)
  for (const [label, file] of [['kesik dosya', broken], ['başka türde dosya', foreign]]) {
    await stubOpen(session, file)
    await menu.getByRole('button', { name: 'İçe aktar', exact: true }).click()
    const texts = await waitToast(menu, 'Karakter dosyası okunamadı')
    check(`${label}: uyarı çıkar (DND-112), onay kutusu açılmaz`, texts.some((text) => text.includes('Karakter dosyası okunamadı') && text.includes('DND-112')) && !(await modalOpen(menu)), JSON.stringify(texts))
    await menu.locator('.ui-toast button').first().click().catch(() => {})
    await sleep(200)
  }
  check('bozuk dosyalar kayda ve görsellere dokunmadı', same(await stateOf(menu), before) && same(imagesIn(target), filesBefore))
  check('DND-112 loga yazıldı', hasCode(lastRunEntries(target.dataDir), 'DND-112'))

  // ===== 6. Yalnızca ana menüden =====
  await menu.evaluate(() => window.dnd.game.start())
  const control = await waitForRole(session, 'control')
  const refused = await control.evaluate(async () => ({
    exported: await window.dnd.characters.export(),
    picked: await window.dnd.characters.pickImport(),
    applied: await window.dnd.characters.applyImport('anahtar')
  }))
  check('kontrol panelinden aktarma yapılamaz (DND-306)', refused.exported.code === 'DND-306' && refused.picked.code === 'DND-306' && refused.applied.code === 'DND-306' && !refused.exported.ok && !refused.picked.ok, JSON.stringify(refused))
  // Çağrı sürerken kontrol paneli kapanır; bu yüzden yanıt beklenmez.
  control.evaluate(() => void window.dnd.game.end()).catch(() => {})
  menu = await waitForRole(session, 'menu')

  // ===== 7. Kalıcılık =====
  await sleep(700)
  exit = await quitFromUi(session, menu)
  check('hedef uygulama düzgün kapanır', exit !== null && exit.code === 0)
  session = await launch(target)
  menu = await menuPage(session)
  const reopened = await stateOf(menu)
  check('yeniden açılınca içe aktarılan kartlar ve portreler yerinde', same(cardsOf(reopened), cardsOf(state)) && portraitOf(reopened, target, 0)?.equals(portraitA) === true && portraitOf(reopened, target, 1)?.equals(portraitB) === true)
  check('pencerelerde sayfa hatası yok', session.pageErrors.length === 0, JSON.stringify(session.pageErrors))
  await quitFromUi(session, menu)
})
