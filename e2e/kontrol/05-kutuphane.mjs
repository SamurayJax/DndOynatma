// Kontrol panelindeki kütüphane (`play` kipi): hiç pencere yokken ilk tıklama, sürükle-bırak yükleme,
// "pencerede kullanılıyor" uyarılı silme, İtem ↔ Takım Eşyası ve Türkçe karakterli arama.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, dispatch, dropFiles, getState, importImages, launch, run, seedPlayers, setContentSize, sleep, startGame, stubTrash, trashCalls, waitFor, writeImages } from './harness.mjs'

const ITEM_NAMES = ['Kılıç', 'IŞIK Asası', 'İksir', 'Çöp Şiş', 'Gümüş Yüzük', 'ITEM box']

await run(async () => {
  const session = await launch('kutuphane')
  await seedPlayers(session, 2)
  const npcs = await importImages(session, 'npc', ['hancı', 'demirci'])
  const [place] = await importImages(session, 'place', ['kraliyet-içi'], 160, 90)
  await importImages(session, 'item', ITEM_NAMES)
  await stubTrash(session)

  // --- Ayarlar'daki kütüphane (`manage` kipi): kart tıklaması önizleme açar, oyun ekranına bir şey koymaz ---
  const { menu } = session
  await menu.getByRole('button', { name: 'Ayarlar' }).click()
  await menu.getByRole('tab', { name: /Kütüphane/ }).click()
  await menu.locator('.lib-card__main').first().click()
  const previewTitle = await menu.locator('dialog[open] .ui-modal__title').textContent()
  await menu.keyboard.press('Escape')
  await sleep(250)
  const backOnCard = await menu.evaluate(() => document.activeElement?.classList.contains('lib-card__main') ?? false)
  check('Ayarlar: karta tıklamak önizlemeyi açar; Escape kapatır ve odak karta döner', ['hancı', 'demirci'].includes(previewTitle) && backOnCard && (await getState(menu)).app.scenes.length === 0, String(previewTitle))

  const { control } = await startGame(session)
  await setContentSize(session, 'control', 1600, 900)
  const app = async () => (await getState(control)).app
  const card = (name) => control.locator('.lib-card').filter({ has: control.getByText(name, { exact: true }) })
  const tab = (name) => control.getByRole('tab', { name })
  const toastTexts = () => control.locator('.ui-toast').evaluateAll((nodes) => nodes.map((node) => `${node.className.includes('warning') ? 'UYARI' : node.className.includes('error') ? 'HATA' : 'BILGI'} ${node.textContent}`))
  const clearToasts = async () => {
    for (const close of await control.getByRole('button', { name: 'Bildirimi kapat' }).all()) await close.click().catch(() => {})
  }
  const targetName = () => control.locator('.lib-target__name').textContent()

  // --- Hiç pencere yok ---
  check('pencere yokken araç çubuğu ilk görselle "Pencere 1" açılacağını söyler', (await targetName()).includes('Pencere 1') && (await targetName()).startsWith('yok'), await targetName())
  check('pencere yokken üst şerit "Pencere yok" der', (await control.locator('.ctl-topbar__scene').textContent()).includes('Pencere yok'))
  await card('hancı').locator('.lib-card__main').click()
  let state = await waitFor(app, (current) => current.scenes.length === 1)
  check('ilk tıklama "Pencere 1"i oluşturur, etkin yapar ve görseli koyar', state.scenes.length === 1 && state.scenes[0].name === 'Pencere 1' && state.activeSceneId === state.scenes[0].id && state.scenes[0].items.length === 1)
  await sleep(150)
  check('araç çubuğu ve üst şerit yeni pencereyi gösterir', (await targetName()) === 'Pencere 1' && (await control.locator('.ctl-topbar__scene-name').textContent()) === 'Pencere 1')
  await card('hancı').locator('.lib-card__main').click()
  await waitFor(app, (current) => current.scenes[0].items.length === 2)
  await sleep(150)
  check('ikinci tıklama bir kopya daha ekler; rozet sayıyı gösterir', (await card('hancı').locator('.lib-badge--onstage').textContent()) === 'ekranda ×2')

  await tab(/Mekanlar/).click()
  await card('kraliyet-içi').locator('.lib-card__main').click()
  state = await waitFor(app, (current) => current.scenes[0].background !== null)
  check('Mekanlar: tıklama arka plan yapar ve rozet çıkar', state.scenes[0].background?.imageId === place.id && (await card('kraliyet-içi').locator('.lib-badge--background').count()) === 1)
  // DM arka planı oyun ekranında kaydırmış olsun; aynı karta yeniden tıklamak bunu sıfırlamamalı.
  const background = state.scenes[0].background
  await dispatch(control, { type: 'stage/updateItem', sceneId: state.scenes[0].id, itemId: background.id, patch: { x: background.x + 77 } })
  await waitFor(app, (current) => current.scenes[0].background.x !== background.x)
  await card('kraliyet-içi').locator('.lib-card__main').click()
  await sleep(300)
  state = await app()
  check('zaten arka plan olan görsele tıklamak elle verilen yeri sıfırlamaz', state.scenes[0].background.id === background.id && state.scenes[0].background.x === background.x + 77, `x ${state.scenes[0].background.x}`)

  // --- Sürükle-bırak yükleme ---
  await tab(/NPC/).click()
  const dropDir = join(session.samplesDir, 'birak')
  const dropped = writeImages(dropDir, ['bırakılan-şövalye', 'bırakılan-büyücü'])
  const textFile = join(dropDir, 'notlar.txt')
  writeFileSync(textFile, 'görsel değil')
  let result = await dropFiles(control, '.lib-panel', [...dropped, textFile])
  state = await waitFor(app, (current) => current.library.filter((image) => image.kind === 'npc').length === 4)
  check('bırakma sırasında örtü görünür, bırakınca kalkar', result.overlay && result.cleared, JSON.stringify(result))
  check('bırakılan iki görsel açık bölmeye (NPC) eklenir', state.library.filter((image) => image.kind === 'npc').length === 4 && state.library.some((image) => image.originalName === 'bırakılan-şövalye'))
  let shown = await waitFor(toastTexts, (list) => list.length >= 2)
  check('yükleme sonucu bildirilir: eklenen sayısı ve atlanan dosya (DND-201)', shown.some((text) => text.startsWith('BILGI') && text.includes('2 görsel')) && shown.some((text) => text.startsWith('UYARI') && text.includes('notlar.txt') && text.includes('DND-201')), shown.join(' | '))
  check('yeni görseller ızgarada ve sayaçta görünür', (await card('bırakılan-şövalye').count()) === 1 && (await control.locator('.lib-count').textContent()) === '4 görsel')
  await clearToasts()

  result = await dropFiles(control, '.lib-panel', dropped, { leave: true })
  check('sürükleme panelden çıkınca örtü kalkar, yükleme olmaz', result.overlay && result.cleared && (await app()).library.filter((image) => image.kind === 'npc').length === 4)
  await control.getByRole('button', { name: 'Düzenle', exact: true }).click()
  result = await dropFiles(control, '.lib-panel', dropped)
  check('kutu açıkken arkadaki kütüphaneye bırakılamaz', !result.overlay)
  await control.keyboard.press('Escape')
  await sleep(250)

  // --- Silme ---
  await card('demirci').getByRole('button', { name: 'Sil' }).click()
  let dialog = control.locator('dialog[open]')
  let message = await dialog.locator('.ui-modal__body').textContent()
  check('kullanılmayan görselde silme onayı pencere uyarısı içermez', message.includes('demirci') && !message.includes('kullanılıyor'), message)
  await dialog.getByRole('button', { name: 'Vazgeç' }).click()
  await card('hancı').getByRole('button', { name: 'Sil' }).click()
  dialog = control.locator('dialog[open]')
  message = await dialog.locator('.ui-modal__body').textContent()
  check('kullanılan görselde silme onayı pencereyi adıyla sayar', message.includes('kullanılıyor') && message.includes('Pencere 1'), message)
  check('silme onayında ilk odak "Vazgeç"te', (await control.evaluate(() => document.activeElement.textContent)) === 'Vazgeç')
  await dialog.getByRole('button', { name: 'Vazgeç' }).click()
  await sleep(200)
  check('"Vazgeç" hiçbir şeyi silmez', (await app()).library.some((image) => image.id === npcs[0].id) && (await trashCalls(session)).length === 0)
  await card('hancı').getByRole('button', { name: 'Sil' }).click()
  await control.locator('dialog[open]').getByRole('button', { name: 'Sil', exact: true }).click()
  state = await waitFor(app, (current) => !current.library.some((image) => image.id === npcs[0].id))
  await sleep(300)
  const trashed = await trashCalls(session)
  check('"Sil": görsel kütüphaneden ve pencereden kalkar', !state.library.some((image) => image.id === npcs[0].id) && state.scenes[0].items.length === 0)
  check('"Sil": yalnızca o görselin dosyası çöpe gider', trashed.length === 1 && trashed[0].endsWith(npcs[0].fileName), trashed.join(' | '))
  check('"Sil": kart, "Ekrandakiler" satırları ve sayaç güncellenir', (await card('hancı').count()) === 0 && (await control.locator('.ctl-stage__row:not(.ctl-stage__row--background)').count()) === 0 && (await control.locator('.lib-count').textContent()) === '3 görsel')

  // --- İtem ↔ Takım Eşyası ---
  await tab(/İtemler/).click()
  await card('Kılıç').locator('.lib-card__main').click()
  await waitFor(app, (current) => current.scenes[0].items.length === 1)
  await clearToasts()
  // Çift tıklama: ikinci istek "zaten o bölmede" uyarısı üretmemeli.
  await card('Kılıç').getByRole('button', { name: 'Takıma ver' }).dblclick()
  state = await waitFor(app, (current) => current.library.find((image) => image.originalName === 'Kılıç').kind === 'teamItem')
  await sleep(300)
  shown = await toastTexts()
  check('"Takıma ver": eşya Takım Eşyaları bölmesine geçer', state.library.find((image) => image.originalName === 'Kılıç').kind === 'teamItem' && (await card('Kılıç').count()) === 0)
  check('"Takıma ver": çift tıklamada tek bilgi bildirimi, uyarı yok', shown.length === 1 && shown[0].startsWith('BILGI') && shown[0].includes('takıma verildi'), shown.join(' | '))
  check('sekme rozetleri güncellenir (İtemler 5, Takım Eşyaları 1)', (await tab(/İtemler/).textContent()).endsWith('5') && (await tab(/Takım Eşyaları/).textContent()).endsWith('1'))
  await tab(/Takım Eşyaları/).click()
  check('Takım Eşyaları: eşya "ekranda" rozetini korur', (await card('Kılıç').locator('.lib-badge--onstage').count()) === 1)
  await card('Kılıç').getByRole('button', { name: 'Geri al' }).click()
  state = await waitFor(app, (current) => current.library.find((image) => image.originalName === 'Kılıç').kind === 'item')
  check('"Geri al": eşya İtemler bölmesine döner', state.library.find((image) => image.originalName === 'Kılıç').kind === 'item' && state.scenes[0].items.length === 1)
  await sleep(200)
  check('boşalan Takım Eşyaları bölmesi nasıl doldurulacağını anlatır', (await control.locator('.lib-empty').textContent()).includes('Takıma ver'))

  // --- Türkçe karakterli arama ---
  await tab(/İtemler/).click()
  const search = control.locator('.lib-search')
  const visibleNames = () => control.locator('.lib-card__name').allTextContents()
  const cases = [['kilic', 'Kılıç'], ['KILIÇ', 'Kılıç'], ['ISIK', 'IŞIK Asası'], ['ışık', 'IŞIK Asası'], ['iksir', 'İksir'], ['İKSİR', 'İksir'], ['sis', 'Çöp Şiş'], ['gumus yuz', 'Gümüş Yüzük'], ['item', 'ITEM box']]
  const wrong = []
  for (const [query, expected] of cases) {
    await search.fill(query)
    await sleep(80)
    const names = await visibleNames()
    if (names.length !== 1 || names[0] !== expected) wrong.push(`"${query}" → ${names.join(', ') || 'hiçbiri'}`)
  }
  check('arama Türkçe harfleri yalın halleriyle de bulur (ı/i, ş/s, ğ/g, ç/c, büyük/küçük)', wrong.length === 0, wrong.join(' | '))
  await search.fill('ık')
  await sleep(80)
  check('arama sürerken sayaç "bulunan / toplam" gösterir', (await control.locator('.lib-count').textContent()) === `${(await visibleNames()).length} / 6 görsel`, await control.locator('.lib-count').textContent())
  await search.fill('ejderha')
  await sleep(80)
  check('eşleşme yoksa boş durum aramayı adıyla söyler', (await control.locator('.lib-empty').textContent()).includes('ejderha') && (await visibleNames()).length === 0)
  await control.getByRole('button', { name: 'Aramayı temizle' }).click()
  await sleep(150)
  check('"Aramayı temizle" alanı boşaltır ve bütün görselleri geri getirir', (await search.inputValue()) === '' && (await visibleNames()).length === 6)
  await search.fill('kilic')
  await tab(/NPC/).click()
  await tab(/İtemler/).click()
  check('bölme değişince arama sıfırlanır', (await search.inputValue()) === '' && (await visibleNames()).length === 6)

  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
