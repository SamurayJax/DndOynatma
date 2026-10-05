// Kayıt yeri: ilk açılışta klasör sorusu, bulunamayan klasör, eski kaydı (Belgeler\DndOynatma) taşıma,
// ayarlardan klasör değiştirme, var olan kaydı kullanma ve bulut uyarısı.
// Çalıştırma: node e2e/main/04-kayit-yeri.mjs
//
// Bu betik DND_DATA_DIR vermez; ayar, eski kayıt ve önerilen yer için kendi geçici klasörlerini
// kullanır. Geri Dönüşüm Kutusu sahtesiyle değiştirilir (klasörü geçici bir yere taşır).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makePng } from '../fixtures.mjs'
import { check, info, launch, makeWorkDir, menuPage, quitFromUi, roleOf, run, sleep, waitExit, waitFor, waitForRole } from './harness.mjs'

const FOLDER = 'DndOynatma-Kayit'

/** Uygulamayı kayıt klasörü sorusu açık olacak şekilde başlatır. */
function open(work, extra = {}) {
  return launch(work, {
    fixedDataDir: false,
    env: {
      DND_CONFIG_DIR: join(work.base, 'ayar'),
      DND_LEGACY_DIR: join(work.base, 'eski-belgeler', 'DndOynatma'),
      DND_HOME_DIR: join(work.base, 'ev'),
      DND_NO_RELAUNCH: '1',
      // Gerçek OneDrive kökü denemeyi etkilemesin; bulut klasörü olarak bu sayılır.
      OneDrive: join(work.base, 'bulut'),
      OneDriveConsumer: '',
      OneDriveCommercial: '',
      ...extra
    }
  })
}

const firstPage = async (session) => {
  const page = await session.app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => typeof window.dnd === 'object' && window.dnd !== null, null, { timeout: 15000 })
  return page
}

/** Geri Dönüşüm Kutusu yerine klasörü `cop` altına taşır; çağrılar kaydedilir. */
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

/** Klasör seçme penceresi yerine verilen yolu döndürür. */
const stubDialog = (session, chosen) =>
  session.app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] })
  }, chosen)

const configOf = (work) => JSON.parse(readFileSync(join(work.base, 'ayar', 'ayar.json'), 'utf8'))
const stateOf = (page) => page.evaluate(() => window.dnd.getState())
const infoOf = (page) => page.evaluate(() => window.dnd.app.getInfo())
const setupLog = (work) => {
  const dir = join(work.base, 'ayar', 'log')
  return existsSync(dir) ? readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8')).join('\n') : ''
}

await run(async () => {
  // ===== 1. İlk açılış, eski kayıt yok =====
  const work = makeWorkDir('kayit-yeri')
  mkdirSync(join(work.base, 'ev'), { recursive: true })
  const target = join(work.base, 'ev', FOLDER)

  let session = await open(work)
  let page = await firstPage(session)
  check('ilk açılışta kayıt klasörü penceresi açılır', roleOf(page) === 'setup', roleOf(page))
  const setup = await page.evaluate(() => window.dnd.storage.getSetup())
  check('ilk açılış bilgisi: neden, klasör adı, önerilen yer', setup.reason === 'first-run' && setup.folderName === FOLDER && setup.suggestedParent === join(work.base, 'ev') && setup.legacy === null, JSON.stringify(setup))
  await page.getByText('Kayıt şuraya yapılacak').waitFor({ timeout: 8000 })
  check('önerilen klasör ekranda gösterilir', (await page.locator('.setup-target .setup-path').textContent()) === target)
  check('klasör sorulurken henüz hiçbir şey oluşturulmaz', !existsSync(target) && !existsSync(join(work.base, 'ayar', 'ayar.json')))
  check('kayıt yüklenmeden menü açılmaz', session.app.windows().length === 1)

  await page.getByRole('button', { name: 'Bu klasörü kullan' }).click()
  let menu = await waitForRole(session, 'menu')
  let appInfo = await infoOf(menu)
  check('seçilen klasörle uygulama açılır', appInfo.dataDir === target && appInfo.dataDirFixed === false && appInfo.dataDirCloud === null, JSON.stringify(appInfo))
  check('seçim ayar dosyasına yazılır', configOf(work).dataDir === target)
  check('kayıt klasörü ve log oluşur', existsSync(join(target, 'log')) && existsSync(join(target, 'gorseller')))
  check('kayıt klasörü penceresi kapanır', session.app.windows().every((win) => roleOf(win) !== 'setup'))

  const sample = join(work.samplesDir, 'kurt.png')
  writeFileSync(sample, makePng(64, 96, [120, 120, 130], [40, 40, 50]))
  await menu.evaluate(() => window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } }))
  const imported = await menu.evaluate((file) => window.dnd.library.importFiles('enemy', [file]), sample)
  check('seçilen klasöre görsel yüklenir', imported.added.length === 1 && existsSync(join(target, 'gorseller', imported.added[0].fileName)))
  await sleep(600)
  let exit = await quitFromUi(session, menu)
  check('uygulama düzgün kapanır', exit !== null && exit.code === 0)

  // ===== 2. İkinci açılış: soru sorulmaz =====
  session = await open(work)
  page = await firstPage(session)
  check('klasör belliyken soru sorulmaz, menü açılır', roleOf(page) === 'menu', roleOf(page))
  let state = await stateOf(page)
  check('kayıt aynı klasörden geri gelir', state.app.players[0].name === 'Kenji' && state.app.library.length === 1)
  exit = await quitFromUi(session, page)

  // ===== 3. Klasör bulunamıyor =====
  const hidden = join(work.base, 'ev', 'takili-degil')
  renameSync(target, hidden)
  session = await open(work)
  page = await firstPage(session)
  check('klasör yokken kayıt klasörü penceresi açılır', roleOf(page) === 'setup')
  const missing = await page.evaluate(() => window.dnd.storage.getSetup())
  check('neden: bulunamadı; bulunamayan klasör bildirilir', missing.reason === 'missing' && missing.missingDir === target)
  await page.getByText('Kayıt klasörü bulunamadı').waitFor({ timeout: 8000 })
  check('bulunamayan klasör yeniden oluşturulmaz (boş kayıt açılmaz)', !existsSync(target))
  check('DND-107 loga yazılır', setupLog(work).includes('[DND-107]'))
  await page.getByRole('button', { name: 'Yeniden dene' }).click()
  await page.getByText('Klasör hâlâ bulunamıyor').waitFor({ timeout: 5000 })
  check('yeniden deneme: klasör hâlâ yoksa bildirir', true)

  renameSync(hidden, target)
  await page.getByRole('button', { name: 'Yeniden dene' }).click()
  menu = await waitForRole(session, 'menu')
  state = await stateOf(menu)
  check('klasör geri gelince kayıt kaldığı yerden açılır', state.app.players[0].name === 'Kenji' && state.app.library.length === 1)

  // ===== 4. Ayarlardan klasör değiştirme =====
  await stubTrash(session, join(work.base, 'cop'))
  const newParent = join(work.base, 'disk-d')
  mkdirSync(newParent, { recursive: true })
  const newTarget = join(newParent, FOLDER)
  const checked = await menu.evaluate((parent) => window.dnd.storage.check(parent), newParent)
  check('yeni yer denetimi: hedef, yazılabilir, kayıt yok', checked.target === newTarget && checked.writable && !checked.hasSave && !checked.sameAsCurrent && checked.cloud === null, JSON.stringify(checked))
  const same = await menu.evaluate((parent) => window.dnd.storage.check(parent), join(work.base, 'ev'))
  check('aynı klasör seçilirse tanınır', same.sameAsCurrent === true)
  const cloud = await menu.evaluate((parent) => window.dnd.storage.check(parent), join(work.base, 'bulut', 'Belgeler'))
  check('bulut eşitlemeli yer tanınır', cloud.cloud === 'OneDrive', JSON.stringify(cloud))

  // Oyun açıkken taşınmaz.
  await menu.evaluate(() => window.dnd.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } }))
  await menu.evaluate(() => window.dnd.game.start())
  await waitForRole(session, 'control')
  const refused = await menu.evaluate((parent) => window.dnd.storage.move(parent), newParent)
  check('oyun açıkken klasör değiştirilemez', refused.ok === false && refused.code === 'DND-304' && !existsSync(newTarget), JSON.stringify(refused))
  await menu.evaluate(() => window.dnd.game.end())
  await sleep(700)

  // Arayüzden: Ayarlar › Genel › Klasörü değiştir.
  await stubDialog(session, newParent)
  const win = await session.app.browserWindow(menu)
  await win.evaluate((w) => w.show())
  await menu.getByRole('button', { name: 'Ayarlar' }).click()
  await menu.getByRole('tab', { name: /Genel/ }).click()
  const changeButton = menu.getByRole('button', { name: 'Klasörü değiştir' })
  check('Ayarlar › Genel: "Klasörü değiştir" düğmesi var ve açık', (await changeButton.count()) === 1 && (await changeButton.isEnabled()))
  await changeButton.click()
  await menu.getByText('Kayıt bu klasöre taşınsın mı?').waitFor({ timeout: 5000 })
  check('onay kutusu hedef klasörü gösterir', (await menu.locator('dialog .menu-path').textContent()) === newTarget)
  await menu.getByRole('button', { name: 'Taşı ve yeniden başlat' }).click()
  exit = await waitExit(session)
  check('taşıma sonrası uygulama kapanır (yeniden başlamak üzere)', exit !== null && exit.code === 0, JSON.stringify(exit))
  check('ayar dosyası yeni klasörü gösterir', configOf(work).dataDir === newTarget)
  check('kayıt ve görseller yeni klasörde', existsSync(join(newTarget, 'kayit.json')) && readdirSync(join(newTarget, 'gorseller')).length === 1)
  check('eski klasör kaldırıldı (Geri Dönüşüm Kutusu)', !existsSync(target) && readdirSync(join(work.base, 'cop')).length === 1)
  check('çalışma işareti yeni klasöre taşınmaz', !existsSync(join(newTarget, 'calisiyor.kilit')))

  session = await open(work)
  page = await firstPage(session)
  appInfo = await infoOf(page)
  state = await stateOf(page)
  check('yeniden açılışta yeni klasör kullanılır, soru sorulmaz', roleOf(page) === 'menu' && appInfo.dataDir === newTarget)
  check('taşınan kayıt eksiksiz: oyuncu ve görsel yerinde', state.app.players[0].name === 'Kenji' && state.app.library.length === 1)
  check('taşıma sonrası açılış çökme sayılmaz', appInfo.crashedLastTime === false)
  const loaded = await page.evaluate(
    (fileName) =>
      new Promise((done) => {
        const image = new Image()
        image.onload = () => done(image.naturalWidth)
        image.onerror = () => done(0)
        image.src = window.dnd.mediaUrl(fileName)
      }),
    state.app.library[0].fileName
  )
  check('taşınan görsel yeni klasörden yüklenir', loaded === 64, String(loaded))

  // Var olan kaydı kullanma: hedefte kayıt varsa taşınmaz, o kullanılır; şu anki yerinde kalır.
  const otherParent = join(work.base, 'baska')
  const otherTarget = join(otherParent, FOLDER)
  mkdirSync(join(otherTarget, 'gorseller'), { recursive: true })
  writeFileSync(join(otherTarget, 'kayit.json'), JSON.stringify({ schema: 1, players: [{ name: 'Mira', level: 3, hp: 10, note: '', portraitId: null }] }))
  await stubTrash(session, join(work.base, 'cop2'))
  const adoptCheck = await page.evaluate((parent) => window.dnd.storage.check(parent), otherParent)
  const adopted = await page.evaluate((parent) => window.dnd.storage.move(parent), otherParent)
  exit = await waitExit(session)
  check('hedefte kayıt varsa bildirilir ve taşıma yerine o kullanılır', adoptCheck.hasSave === true && adopted.ok === true && configOf(work).dataDir === otherTarget)
  check('var olan kayıt kullanılırken eski kayıt yerinde kalır', existsSync(join(newTarget, 'kayit.json')) && readdirSync(join(work.base, 'cop2')).length === 0)
  session = await open(work)
  page = await firstPage(session)
  state = await stateOf(page)
  check('var olan kayıt açılır', state.app.players[0].name === 'Mira')
  await quitFromUi(session, page)

  // ===== 5. Eski kaydı (Belgeler\DndOynatma) taşıma =====
  const second = makeWorkDir('kayit-eski')
  mkdirSync(join(second.base, 'ev'), { recursive: true })
  const legacyDir = join(second.base, 'eski-belgeler', 'DndOynatma')
  // Eski sürümün yaptığı gibi doğrudan o klasöre yazan bir çalıştırma.
  session = await launch(second, { env: { DND_DATA_DIR: legacyDir }, fixedDataDir: false })
  page = await menuPage(session)
  const fixedInfo = await infoOf(page)
  check('DND_DATA_DIR verilince klasör sabittir, soru sorulmaz', fixedInfo.dataDir === legacyDir && fixedInfo.dataDirFixed === true)
  await page.evaluate(() => window.dnd.dispatch({ type: 'player/update', slot: 1, patch: { name: 'Jasper', level: 7 } }))
  const legacyImage = await page.evaluate((file) => window.dnd.library.importFiles('npc', [file]), sample)
  await sleep(600)
  await quitFromUi(session, page)
  check('eski kayıt hazır', existsSync(join(legacyDir, 'kayit.json')) && legacyImage.added.length === 1)

  session = await open(second)
  page = await firstPage(session)
  const withLegacy = await page.evaluate(() => window.dnd.storage.getSetup())
  check('ilk açılışta eski kayıt bulunur', withLegacy.reason === 'first-run' && withLegacy.legacy?.dir === legacyDir && withLegacy.legacy.images === 1, JSON.stringify(withLegacy))
  await page.getByText('Eski kaydımı buraya taşı').waitFor({ timeout: 8000 })
  check('taşıma seçeneği varsayılan olarak açık', await page.getByRole('switch').isChecked().catch(async () => page.locator('.setup-legacy input').isChecked()))

  // Bulut uyarısı: klasör seçme penceresi bulut klasörünü döndürürse uyarı görünür.
  mkdirSync(join(second.base, 'bulut', 'Belgeler'), { recursive: true })
  await stubDialog(session, join(second.base, 'bulut', 'Belgeler'))
  await page.getByRole('button', { name: 'Başka yer seç…' }).click()
  await page.getByText('OneDrive içinde').waitFor({ timeout: 5000 })
  check('bulut eşitlemeli klasör seçilince uyarı gösterilir', true)
  // Yerel bir yere dön.
  await stubDialog(session, join(second.base, 'ev'))
  await page.getByRole('button', { name: 'Başka yer seç…' }).click()
  const secondTarget = join(second.base, 'ev', FOLDER)
  await waitFor(() => page.locator('.setup-target .setup-path').textContent(), (text) => text === secondTarget)
  check('yerel klasöre dönünce uyarı kalkar', (await page.getByText('OneDrive içinde').count()) === 0)

  await stubTrash(session, join(second.base, 'cop'))
  await page.getByRole('button', { name: 'Bu klasörü kullan' }).click()
  menu = await waitForRole(session, 'menu')
  state = await stateOf(menu)
  check('eski kayıt yeni klasöre taşındı: oyuncu ve görsel yerinde', state.app.players[1].name === 'Jasper' && state.app.players[1].level === 7 && state.app.library.length === 1)
  check('görsel dosyası yeni klasörde', existsSync(join(secondTarget, 'gorseller', state.app.library[0].fileName)))
  check('eski klasör Geri Dönüşüm Kutusu\'na gönderildi', !existsSync(legacyDir) && readdirSync(join(second.base, 'cop')).length === 1)
  check('ayar dosyası yeni klasörü gösterir (eski kayıt taşıma)', configOf(second).dataDir === secondTarget)
  await quitFromUi(session, menu)

  // Taşımadan devam: eski kayıt yerinde kalır, boş kayıt açılır.
  const third = makeWorkDir('kayit-tasimadan')
  mkdirSync(join(third.base, 'ev'), { recursive: true })
  const thirdLegacy = join(third.base, 'eski-belgeler', 'DndOynatma')
  mkdirSync(thirdLegacy, { recursive: true })
  writeFileSync(join(thirdLegacy, 'kayit.json'), JSON.stringify({ schema: 1, players: [{ name: 'Eski', level: 2, hp: 10, note: '', portraitId: null }] }))
  session = await open(third)
  page = await firstPage(session)
  // Başarılı olunca pencere kapanır; yanıt gelmeden kapanmış olabilir.
  const result = await page.evaluate((parent) => window.dnd.storage.confirmSetup(parent, false), join(third.base, 'ev')).catch(() => null)
  menu = await waitForRole(session, 'menu')
  state = await stateOf(menu)
  check('taşıma istenmezse boş kayıtla başlanır ve eski kayıt yerinde kalır', (result === null || result.ok === true) && state.app.players[0].name === '' && existsSync(join(thirdLegacy, 'kayit.json')))
  await quitFromUi(session, menu)

  // Yazılamayan yer: hata koduyla reddedilir, ayar yazılmaz.
  const fourth = makeWorkDir('kayit-yazilamaz')
  mkdirSync(join(fourth.base, 'ev'), { recursive: true })
  const blocker = join(fourth.base, 'ev', 'dosya.txt')
  writeFileSync(blocker, 'klasör değil')
  session = await open(fourth)
  page = await firstPage(session)
  const blocked = await page.evaluate((parent) => window.dnd.storage.confirmSetup(parent, false), blocker)
  check('yazılamayan yer DND-108 ile reddedilir, ayar yazılmaz', blocked.ok === false && blocked.code === 'DND-108' && !existsSync(join(fourth.base, 'ayar', 'ayar.json')), JSON.stringify(blocked))
  check('reddedildikten sonra pencere açık kalır', roleOf(page) === 'setup' && !page.isClosed())
  // Pencere kapatılırsa uygulama kapanır.
  page.evaluate(() => window.dnd.app.quit()).catch(() => {})
  exit = await waitExit(session)
  check('klasör seçilmeden çıkılırsa uygulama kapanır, hiçbir şey oluşturulmaz', exit !== null && !existsSync(join(fourth.base, 'ev', FOLDER)))

  info('gerçek Geri Dönüşüm Kutusu ve gerçek klasör seçme penceresi bu betikte kullanılmadı')
})
