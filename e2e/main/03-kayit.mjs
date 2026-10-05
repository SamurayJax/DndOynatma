// Kayıt: otomatik kayıt ve geri yükleme, yedek, zar kaydı, çökme sonrası açılış,
// bozuk kayıt (DND-101 / DND-102), daha yeni şema (DND-106) ve log dosyası.
// Çalıştırma: node e2e/main/03-kayit.mjs
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makePng } from '../fixtures.mjs'
import {
  check,
  hasCode,
  info,
  killAndWait,
  lastRunEntries,
  launch,
  lockFile,
  logEntries,
  makeWorkDir,
  menuPage,
  quitFromUi,
  readLogText,
  run,
  sleep,
  waitExit,
  waitFor,
  waitForRole
} from './harness.mjs'

const stateOf = (page) => page.evaluate(() => window.dnd.getState())
const infoOf = (page) => page.evaluate(() => window.dnd.app.getInfo())
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const exists = (work, name) => existsSync(join(work.dataDir, name))
const filesIn = (work) => readdirSync(work.dataDir).sort()
const diceFileEmpty = (work) => !exists(work, 'zar.json') || ['', '[]'].includes(readFileSync(join(work.dataDir, 'zar.json'), 'utf8').trim())

/** Bildirimleri olabildiğince erken dinlemeye başlar; ekrandaki bildirimi de ayrıca arar. */
async function startupNotice(page, code) {
  await page.evaluate(() => {
    window.__notices = []
    window.dnd.onNotice((notice) => window.__notices.push(notice))
  })
  const shown = await page
    .locator('.ui-toast', { hasText: code })
    .first()
    .waitFor({ timeout: 6000 })
    .then(() => true, () => false)
  const received = await page.evaluate((wanted) => window.__notices.some((notice) => notice.code === wanted), code)
  return { shown, received }
}

await run(async () => {
  const work = makeWorkDir('kayit')
  const saveFile = join(work.dataDir, 'kayit.json')
  const backupFile = join(work.dataDir, 'kayit.yedek.json')
  const diceFile = join(work.dataDir, 'zar.json')

  // ---------- otomatik kayıt, yedek, normal çıkış ----------
  let session = await launch(work)
  let menu = await menuPage(session)
  check('ilk açılış: çökme uyarısı yok', (await infoOf(menu)).crashedLastTime === false)
  check('uygulama açıkken çökme işareti durur', exists(work, 'calisiyor.kilit'))

  await menu.evaluate(() => {
    window.dnd.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } })
    window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } })
  })
  check('değişiklik kendiliğinden kaydedilir (kayit.json oluşur)', await waitFor(() => existsSync(saveFile), (ok) => ok, 3000))
  check('ilk kayıtta yedek yok, geçici dosya kalmaz', !existsSync(backupFile) && !exists(work, 'kayit.json.tmp'), filesIn(work).join(', '))

  await menu.evaluate(() => window.dnd.dispatch({ type: 'player/setHp', slot: 0, hp: 7 }))
  check('ikinci kayıttan sonra kayit.yedek.json var', await waitFor(() => existsSync(backupFile), (ok) => ok, 3000))
  check('yedek bir önceki kaydı tutar', readJson(backupFile).players[0].hp === 10 && readJson(saveFile).players[0].hp === 7)

  // Bekleyen (henüz yazılmamış) değişiklik çıkışta diske inmeli.
  await menu.evaluate(() => window.dnd.dispatch({ type: 'note/setGeneral', text: 'Son not' }))
  let exit = await quitFromUi(session, menu)
  check('normal çıkış: 0 koduyla kapanır', exit?.code === 0, JSON.stringify(exit))
  check('çıkıştan hemen önceki değişiklik de yazılır', readJson(saveFile).generalNote === 'Son not')
  check('normal çıkışta çökme işareti silinir', !exists(work, 'calisiyor.kilit'))
  check('normal çıkışta zar.json boş', diceFileEmpty(work))
  check('geçici dosya kalmaz', !filesIn(work).some((name) => name.endsWith('.tmp')), filesIn(work).join(', '))

  session = await launch(work)
  menu = await menuPage(session)
  let state = await stateOf(menu)
  const player = state.app.players[0]
  check(
    'yeniden açılışta durum geri gelir',
    player.name === 'Kenji' && player.level === 4 && player.hp === 7 && state.app.generalNote === 'Son not' && state.app.settings.gameFullscreen === false,
    JSON.stringify(player)
  )
  check('normal çıkıştan sonra çökme uyarısı yok', (await infoOf(menu)).crashedLastTime === false && !hasCode(lastRunEntries(work.dataDir), 'DND-903'))
  check('normal açılışta kayıt uyarısı yok', !hasCode(lastRunEntries(work.dataDir), 'DND-101') && !hasCode(lastRunEntries(work.dataDir), 'DND-102'))

  // ---------- çökme ----------
  await menu.evaluate(() => window.dnd.game.start())
  let control = await waitForRole(session, 'control')
  const rolled = []
  for (let i = 0; i < 3; i++) rolled.unshift(await control.evaluate(() => window.dnd.dice.roll(20)))
  await control.evaluate(() => window.dnd.dispatch({ type: 'player/adjustHp', slot: 0, delta: -2 }))
  await waitFor(() => readJson(saveFile).players[0].hp, (hp) => hp === 5, 3000)
  check('çökmeden önce: can kaydedildi, zar.json dolu', readJson(saveFile).players[0].hp === 5 && readJson(diceFile).length === 3)
  // Son değişiklik yazılmadan süreç ağacı zorla kapatılır.
  await control.evaluate(() => window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { level: 9 } }))
  await killAndWait(session)
  check('zorla kapatma: süreç bitti', session.exited)
  check('çökme işareti yerinde kalır', exists(work, 'calisiyor.kilit'))
  check('zar.json temizlenmez', readJson(diceFile).length === 3)
  let saved = null
  try {
    saved = readJson(saveFile)
  } catch {
    saved = null
  }
  check('kayit.json sağlam (son kaydedilen haliyle)', saved?.players[0].hp === 5 && saved?.players[0].name === 'Kenji')

  session = await launch(work)
  menu = await menuPage(session)
  check('çökmeden sonra getInfo().crashedLastTime = true', (await infoOf(menu)).crashedLastTime === true)
  let entries = lastRunEntries(work.dataDir)
  check('yeni açılışın logunda DND-903 var', hasCode(entries, 'DND-903'))
  check('log: zar atışları geri yüklendi', entries.some((entry) => entry.includes('3 zar atışı geri yüklendi')))
  state = await stateOf(menu)
  check(
    'zar geçmişi geri gelir (aynı atışlar, aynı sırayla)',
    state.session.diceHistory.length === 3 && state.session.diceHistory.every((roll, index) => roll.id === rolled[index].id && roll.value === rolled[index].value),
    state.session.diceHistory.map((roll) => roll.value).join(',')
  )
  check('kaydedilmiş durum çökmeden etkilenmez', state.app.players[0].hp === 5 && state.app.players[0].name === 'Kenji' && state.app.generalNote === 'Son not')
  info(`çökmeden hemen önceki (yazılmamış) değişiklik: seviye ${state.app.players[0].level} (9 ise yazılmış, 4 ise kaybolmuş)`)
  const banner = await menu
    .getByText('DND-903')
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false)
  check('menüde çökme uyarısı görünür (DND-903)', banner)

  await menu.evaluate(() => window.dnd.game.start())
  control = await waitForRole(session, 'control')
  check('oyun yeniden başlayınca zar geçmişi yerinde', (await stateOf(control)).session.diceHistory.length === 3)
  await control.evaluate(() => window.dnd.dice.roll(20))
  check('yeni atış geçmişe ve zar.json dosyasına eklenir', readJson(diceFile).length === 4 && (await stateOf(control)).session.diceHistory.length === 4)
  exit = await quitFromUi(session, control)
  check('çökme sonrası oturum normal kapanır', exit?.code === 0 && diceFileEmpty(work) && !exists(work, 'calisiyor.kilit'), JSON.stringify(exit))

  session = await launch(work)
  menu = await menuPage(session)
  state = await stateOf(menu)
  check('sonraki açılışta çökme uyarısı ve zar geçmişi yok', (await infoOf(menu)).crashedLastTime === false && state.session.diceHistory.length === 0)
  // Yedek ile asıl kayıt ayrışsın diye iki ayrı kayıt.
  await menu.evaluate(() => window.dnd.dispatch({ type: 'note/setGeneral', text: 'yedekteki not' }))
  await waitFor(() => readJson(saveFile).generalNote, (note) => note === 'yedekteki not', 3000)
  await menu.evaluate(() => window.dnd.dispatch({ type: 'note/setGeneral', text: 'asıl kayıttaki not' }))
  await waitFor(() => readJson(saveFile).generalNote, (note) => note === 'asıl kayıttaki not', 3000)
  exit = await quitFromUi(session, menu)
  check('hazırlık: yedek ve asıl kayıt farklı', readJson(backupFile).generalNote === 'yedekteki not' && readJson(saveFile).generalNote === 'asıl kayıttaki not')

  // ---------- kayit.json bozuk, yedek sağlam (DND-101) ----------
  const garbage = '{"schema":1,"players":[{"name":"Yarım kalmış kay'
  writeFileSync(saveFile, garbage, 'utf8')
  const backupHash = sha(backupFile)
  session = await launch(work)
  menu = await menuPage(session)
  let notice = await startupNotice(menu, 'DND-101')
  state = await stateOf(menu)
  check('bozuk kayıtta durum yedekten gelir', state.app.generalNote === 'yedekteki not' && state.app.players[0].name === 'Kenji', state.app.generalNote)
  check('DND-101 loga yazılır', hasCode(lastRunEntries(work.dataDir), 'DND-101'))
  let quarantined = filesIn(work).filter((name) => name.startsWith('kayit.json.bozuk-'))
  check('bozuk dosya .bozuk-… adıyla saklanır', quarantined.length === 1 && readFileSync(join(work.dataDir, quarantined[0]), 'utf8') === garbage, quarantined.join(', '))
  check('ana menü açılış bildirimini alır (DND-101)', notice.shown || notice.received, `ekranda=${notice.shown}, dinleyici=${notice.received}`)
  check('yedek dosyasına dokunulmaz', sha(backupFile) === backupHash)
  await menu.evaluate(() => window.dnd.dispatch({ type: 'note/setGeneral', text: 'yedekten sonra' }))
  await waitFor(() => existsSync(saveFile), (ok) => ok, 3000)
  exit = await quitFromUi(session, menu)
  check('yedekten açılan oturum yeniden kaydeder', exit?.code === 0 && readJson(saveFile).generalNote === 'yedekten sonra')
  check('ilk kayıt sağlam yedeğin üzerine yazmaz', sha(backupFile) === backupHash)

  // ---------- ikisi de bozuk (DND-102) ----------
  const garbage2 = 'bu bir kayıt değil \u0000\u0001'
  writeFileSync(saveFile, garbage, 'utf8')
  writeFileSync(backupFile, garbage2, 'utf8')
  const before = filesIn(work)
  session = await launch(work)
  menu = await menuPage(session)
  notice = await startupNotice(menu, 'DND-102')
  state = await stateOf(menu)
  check('iki dosya da bozuksa boş kayıtla açılır', state.app.players.every((p) => p.name === '') && state.app.library.length === 0 && state.app.generalNote === '')
  check('DND-102 loga yazılır', hasCode(lastRunEntries(work.dataDir), 'DND-102'))
  check('ana menü açılış bildirimini alır (DND-102)', notice.shown || notice.received, `ekranda=${notice.shown}, dinleyici=${notice.received}`)
  const after = filesIn(work)
  const keptMain = after.filter((name) => name.startsWith('kayit.json.bozuk-')).map((name) => readFileSync(join(work.dataDir, name), 'utf8'))
  const keptBackup = after.filter((name) => name.startsWith('kayit.yedek.json.bozuk-')).map((name) => readFileSync(join(work.dataDir, name), 'utf8'))
  check('iki bozuk dosya da saklanır, içerikleri aynen durur', keptMain.length === 2 && keptMain.every((text) => text === garbage) && keptBackup.length === 1 && keptBackup[0] === garbage2, after.join(', '))
  check(
    'hiçbir dosya silinmez',
    before.every((name) => after.includes(name) || name === 'kayit.json' || name === 'kayit.yedek.json') && after.length >= before.length,
    `önce ${before.length}, sonra ${after.length}`
  )
  exit = await quitFromUi(session, menu)
  check('boş kayıtla açılan oturum normal kapanır', exit?.code === 0)

  // ---------- daha yeni şema (DND-106) ----------
  const future = JSON.stringify({
    schema: 999,
    players: [{ portraitId: null, name: 'Gelecek', level: 9, hp: 3, note: 'yeni sürüm notu' }],
    library: [],
    scenes: [],
    activeSceneId: null,
    generalNote: 'gelecekten',
    settings: { gameDisplayId: null, gameFullscreen: false },
    yeniAlan: { bilinmeyen: [1, 2, 3] }
  })
  writeFileSync(saveFile, future, 'utf8')
  const futureHash = sha(saveFile)
  const hadBackup = existsSync(backupFile)
  session = await launch(work)
  menu = await menuPage(session)
  notice = await startupNotice(menu, 'DND-106')
  state = await stateOf(menu)
  check('yeni şemalı kayıt okunur ve gösterilir', state.app.players[0].name === 'Gelecek' && state.app.generalNote === 'gelecekten')
  check('DND-106 loga yazılır', hasCode(lastRunEntries(work.dataDir), 'DND-106'))
  check('ana menü açılış bildirimini alır (DND-106)', notice.shown || notice.received, `ekranda=${notice.shown}, dinleyici=${notice.received}`)
  await menu.evaluate(async () => {
    window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Değişti' } })
    window.dnd.dispatch({ type: 'note/setGeneral', text: 'bu oturumda yazıldı' })
    await window.dnd.game.start()
  })
  control = await waitForRole(session, 'control')
  await control.evaluate(() => window.dnd.dice.roll(20))
  await sleep(2200)
  check('değişiklik bellekte uygulanır', (await stateOf(control)).app.players[0].name === 'Değişti')
  exit = await quitFromUi(session, control)
  check('yeni şemalı kayıtla oturum normal kapanır', exit?.code === 0, JSON.stringify(exit))
  check('kayit.json bayt bayt aynı kalır', sha(saveFile) === futureHash && readFileSync(saveFile, 'utf8') === future)
  check('yedek ve geçici dosya oluşmaz', existsSync(backupFile) === hadBackup && !filesIn(work).some((name) => name.endsWith('.tmp')), filesIn(work).join(', '))

  // ---------- kayıt dosyaları başka bir süreçte açık (kilitli) ----------
  const lockWork = makeWorkDir('kilit')
  const lockSave = join(lockWork.dataDir, 'kayit.json')
  const lockBackup = join(lockWork.dataDir, 'kayit.yedek.json')
  const noteOf = (file) => readJson(file).generalNote
  const setNote = (page, text) => page.evaluate((value) => window.dnd.dispatch({ type: 'note/setGeneral', text: value }), text)
  session = await launch(lockWork)
  menu = await menuPage(session)
  await setNote(menu, 'bir')
  await waitFor(() => existsSync(lockSave), (ok) => ok, 3000)
  await setNote(menu, 'iki')
  await waitFor(() => existsSync(lockBackup), (ok) => ok, 3000)
  await menu.evaluate(() => {
    window.__notices = []
    window.dnd.onNotice((entry) => window.__notices.push(entry))
  })
  const saveNotices = () => menu.evaluate(() => window.__notices.filter((entry) => entry.code === 'DND-103').length)

  // Yedek okunamaz/yazılamaz durumda: asıl kayıt bundan etkilenmemeli.
  let lock = await lockFile(lockBackup, 'None', 2500)
  await setNote(menu, 'üç')
  check('yedek kilitliyken kayit.json yine yazılır', (await waitFor(() => noteOf(lockSave), (text) => text === 'üç', 2000)) === 'üç')
  await lock.released
  entries = lastRunEntries(lockWork.dataDir)
  check('log: yedek güncellenemedi uyarısı', entries.some((entry) => entry.includes('[UYARI]') && entry.includes('Yedek güncellenemedi')))
  check('yedek kilidi DND-103 üretmez, yedek eski haliyle sağlam', !hasCode(entries, 'DND-103') && noteOf(lockBackup) === 'bir')

  // kayit.json üzerine yazılamaz durumda (okunabilir): DND-103, kilit kalkınca kendiliğinden yazılır.
  lock = await lockFile(lockSave, 'Read', 3000)
  await setNote(menu, 'dört')
  const failed = await waitFor(saveNotices, (count) => count > 0, 3000)
  check('kayit.json kilitliyken DND-103 bildirilir', failed === 1 && hasCode(lastRunEntries(lockWork.dataDir), 'DND-103'))
  check('kilitliyken eski kayıt olduğu gibi durur', noteOf(lockSave) === 'üç')
  await lock.released
  // Burada yeni bir değişiklik yapılmaz: yeniden deneme zamanlayıcısı yazmalı.
  check('kilit kalkınca kayıt kendiliğinden yeniden yazılır', (await waitFor(() => noteOf(lockSave), (text) => text === 'dört', 8000)) === 'dört')
  entries = lastRunEntries(lockWork.dataDir)
  check('log: kayıt yeniden yazılabildi', entries.some((entry) => entry.includes('Kayıt yeniden yazılabildi')))
  check('arıza boyunca bildirim bir kez gösterilir', (await saveNotices()) === 1)
  check('yeniden yazılan kayıtla birlikte yedek de ilerler', noteOf(lockBackup) === 'üç')

  // Kilitliyken çıkış: uygulama takılmadan kapanır, eski kayıt bozulmaz.
  lock = await lockFile(lockSave, 'Read', 4000)
  await setNote(menu, 'beş')
  exit = await quitFromUi(session, menu)
  check('kayıt kilitliyken çıkış takılmaz (0 koduyla kapanır)', exit?.code === 0, JSON.stringify(exit))
  check('log: son değişiklikler yazılamadı', lastRunEntries(lockWork.dataDir).at(-1)?.includes('son değişiklikler yazılamadı') === true, lastRunEntries(lockWork.dataDir).at(-1))
  check('yazılamayan çıkıştan sonra kayit.json sağlam (bir önceki haliyle)', noteOf(lockSave) === 'dört')
  await lock.released

  // ---------- kayıt klasörü kullanılamıyor (DND-104) ----------
  const badBase = makeWorkDir('klasor')
  const blocker = join(badBase.base, 'dosya.txt')
  writeFileSync(blocker, 'klasör değil', 'utf8')
  // Bir dosyanın altında klasör açılamaz.
  session = await launch({ ...badBase, dataDir: join(blocker, 'kayit') })
  menu = await menuPage(session)
  notice = await startupNotice(menu, 'DND-104')
  check('kayıt klasörü açılamazsa uygulama yine açılır ve DND-104 bildirir', notice.shown || notice.received, `ekranda=${notice.shown}, dinleyici=${notice.received}`)
  await setNote(menu, 'yalnızca bellekte')
  await menu.evaluate(() => window.dnd.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } }))
  const anyPng = join(badBase.samplesDir, 'ornek.png')
  writeFileSync(anyPng, makePng(40, 40))
  const badImport = await menu.evaluate((file) => window.dnd.library.importFiles('npc', [file]), anyPng)
  check('klasör yokken görsel yükleme DND-202 ile atlanır', badImport.added.length === 0 && badImport.skipped[0]?.code === 'DND-202', JSON.stringify(badImport.skipped))
  await menu.evaluate(() => window.dnd.game.start())
  control = await waitForRole(session, 'control')
  const badRoll = await control.evaluate(() => window.dnd.dice.roll(20))
  state = await stateOf(control)
  check('klasör yokken oyun ve zar bellekte çalışır', state.app.generalNote === 'yalnızca bellekte' && state.session.diceHistory.length === 1 && Number.isInteger(badRoll?.value))
  exit = await quitFromUi(session, control)
  check('klasör yokken de 0 koduyla kapanır', exit?.code === 0, JSON.stringify(exit))
  check('klasörün yerindeki dosyaya dokunulmaz', readFileSync(blocker, 'utf8') === 'klasör değil')

  // ---------- ana süreçte yakalanmamış hata (DND-901) ----------
  const fatalWork = makeWorkDir('hata')
  const fatalSave = join(fatalWork.dataDir, 'kayit.json')
  for (const [origin, thrower] of [
    ['uncaughtException', () => void setTimeout(() => { throw new Error('deneme: yakalanmamış hata') }, 0)],
    ['unhandledRejection', () => void Promise.reject(new Error('deneme: yakalanmamış hata'))]
  ]) {
    session = await launch(fatalWork)
    menu = await menuPage(session)
    await setNote(menu, `${origin} öncesi`)
    await waitFor(() => stateOf(menu), (full) => full.app.generalNote === `${origin} öncesi`, 2000)
    await session.app.evaluate(thrower)
    exit = await waitExit(session, 10000)
    if (exit === null) await killAndWait(session)
    check(`${origin}: uygulama 1 koduyla kapanır`, exit?.code === 1, JSON.stringify(exit))
    entries = lastRunEntries(fatalWork.dataDir)
    check(`${origin}: DND-901 ayrıntısıyla loga yazılır`, entries.some((entry) => entry.includes('[HATA] [DND-901]') && entry.includes(origin) && entry.includes('deneme: yakalanmamış hata')))
    check(`${origin}: bekleyen değişiklik kapanmadan önce yazılır`, existsSync(fatalSave) && noteOf(fatalSave) === `${origin} öncesi`)
    check(`${origin}: çökme işareti kalır`, existsSync(join(fatalWork.dataDir, 'calisiyor.kilit')))
  }
  session = await launch(fatalWork)
  menu = await menuPage(session)
  check('yakalanmamış hatadan sonraki açılış: çökme uyarısı var, kayıt yerinde', (await infoOf(menu)).crashedLastTime === true && (await stateOf(menu)).app.generalNote === 'unhandledRejection öncesi')
  exit = await quitFromUi(session, menu)
  check('sonraki oturum normal kapanır', exit?.code === 0)

  // ---------- log dosyası ----------
  const logWork = makeWorkDir('log')
  const secretFile = join(logWork.samplesDir, 'GizliDosyaXYZ.png')
  writeFileSync(secretFile, makePng(40, 40))
  session = await launch(logWork)
  menu = await menuPage(session)
  const sent = await menu.evaluate(async (file) => {
    const imported = await window.dnd.library.importFiles('npc', [file])
    const imageId = imported.added[0].id
    const actions = [
      { type: 'settings/update', patch: { gameFullscreen: false } },
      { type: 'player/update', slot: 0, patch: { name: 'GizliIsimXYZ' } },
      { type: 'player/update', slot: 0, patch: { note: 'GizliNotXYZ' } },
      { type: 'note/setGeneral', text: 'GizliGenelXYZ' },
      { type: 'scene/add', sceneId: 'sahne-a', name: 'GizliPencereXYZ' },
      { type: 'scene/add', sceneId: 'sahne-b', name: 'GizliPencere2XYZ' },
      { type: 'scene/update', sceneId: 'sahne-a', patch: { hotkey: 1 } },
      // Tuş başka pencereden alınır (DND-303).
      { type: 'scene/update', sceneId: 'sahne-b', patch: { hotkey: 1 } },
      { type: 'stage/addItem', sceneId: 'sahne-a', fallbackSceneId: 'sahne-x', itemId: 'oge-1', imageId },
      { type: 'stage/updateItem', sceneId: 'sahne-a', itemId: 'oge-1', patch: { label: 'GizliEtiketXYZ' } },
      { type: 'player/setHp', slot: 0, hp: 4 }
    ]
    for (const action of actions) window.dnd.dispatch(action)
    // Durumu değiştirmeyen ve geçersiz işlemler: "İşlem" satırı üretmemeli.
    window.dnd.dispatch({ type: 'player/setHp', slot: 0, hp: 4 })
    window.dnd.dispatch({ type: 'player/update', slot: 9, patch: { name: 'GizliIsimXYZ' } })
    window.dnd.dispatch({ type: 'scene/update', sceneId: 'olmayan-pencere', patch: { name: 'GizliPencereXYZ' } })
    window.dnd.dispatch({ type: 'bilinmeyen/islem', text: 'GizliGenelXYZ' })
    window.dnd.dispatch('GizliGenelXYZ')
    const state = await window.dnd.getState()
    return { count: actions.length, name: state.app.players[0].name, label: state.app.scenes[0].items[0]?.label, hotkeys: state.app.scenes.map((scene) => scene.hotkey) }
  }, secretFile)
  check('hazırlık: işlemler uygulandı', sent.name === 'GizliIsimXYZ' && sent.label === 'GizliEtiketXYZ' && sent.hotkeys.join() === ',1', JSON.stringify(sent))
  await menu.evaluate(() => window.dnd.game.start())
  control = await waitForRole(session, 'control')
  await control.evaluate(() => window.dnd.dice.roll(20))
  exit = await quitFromUi(session, control)
  check('log oturumu normal kapanır', exit?.code === 0)

  const logText = readLogText(logWork.dataDir)
  const parsed = logEntries(logText)
  check('her log satırı "SS:DD:SN.mmm [SEVIYE] [KOD] mesaj" biçiminde', parsed.stray.length === 0 && parsed.entries.length > 0, parsed.stray.slice(0, 3).join(' | '))
  const actionLines = parsed.entries.filter((entry) => entry.includes('] İşlem: '))
  // library/add ana süreçten gelir; arayüzün gönderdiği her etkili işlem + o.
  check('her işlem için tam bir satır', actionLines.length === sent.count + 1, `${actionLines.length} satır, ${sent.count + 1} işlem`)
  check('log: açılış, zar ve kapanış satırları var', ['Uygulama açıldı', 'Kayıt yüklendi', 'Oyun başladı', 'Zar atıldı: d20 = ', 'Uygulama kapandı'].every((text) => logText.includes(text)))
  check('log: tuş devri DND-303 ile yazılır', hasCode(parsed.entries, 'DND-303'))
  const leaks = parsed.entries.filter((entry) => entry.includes('Gizli'))
  check('logda isim, not, etiket ya da pencere adı yok', leaks.length === 0, leaks.slice(0, 4).join(' | '))
  const bigLog = logEntries(readLogText(work.dataDir))
  check('uzun oturumun logu da biçime uyar', bigLog.stray.length === 0, bigLog.stray.slice(0, 3).join(' | '))
  check('kayıt denemelerinde DND-901/902 yok', !hasCode(bigLog.entries, 'DND-901') && !hasCode(bigLog.entries, 'DND-902'))
})
