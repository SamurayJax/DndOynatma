// Pencereler ve oyun akışı: preload/sandbox, başlıklar, CSP, monitör yerleşimi, tam ekran,
// oyunu başlatma/bitirme yarışları, arayüz çökmesi ve oyun açıkken çıkış.
// Çalıştırma: node e2e/main/01-pencereler.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makePng } from '../fixtures.mjs'
import {
  check,
  hasCode,
  info,
  lastRunEntries,
  launch,
  makeWorkDir,
  menuPage,
  quitFromUi,
  run,
  sleep,
  waitExit,
  waitFor,
  waitForRole,
  windowInfo,
  windowsInfo
} from './harness.mjs'

const TITLES = { menu: 'DndOynatma', game: 'DndOynatma — Oyun Ekranı', control: 'DndOynatma — Kontrol Paneli' }

// Her yeni belgede CSP ihlallerini toplar; konsol iletisi kaçsa bile burada kalır.
function cspProbe() {
  window.__cspViolations = []
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__cspViolations.push(`${event.violatedDirective} ← ${event.blockedURI}`)
  })
}

const readCsp = (page) => page.evaluate(() => window.__cspViolations ?? null).catch(() => null)
const phaseOf = (page) => page.evaluate(() => window.dnd.getState().then((state) => state.session.phase))
const settingsOf = (page) => page.evaluate(() => window.dnd.getState().then((state) => state.app.settings))
const visibleRoles = async (session) => (await windowsInfo(session)).filter((win) => win.visible).map((win) => win.role).sort()

async function checkBridge(page, role) {
  const bridge = await page.evaluate(() => ({
    role: window.dnd?.role,
    api: ['getState', 'dispatch', 'onState', 'onDiceRoll', 'onNotice', 'mediaUrl', 'log'].every((name) => typeof window.dnd[name] === 'function'),
    groups: ['library', 'game', 'dice', 'app'].every((name) => typeof window.dnd[name] === 'object'),
    node: typeof window.require !== 'undefined' || typeof window.process !== 'undefined' || typeof window.module !== 'undefined'
  }))
  check(`${role}: window.dnd var ve rolü "${role}"`, bridge.role === role && bridge.api && bridge.groups, `rol=${bridge.role}`)
  check(`${role}: sayfada Node erişimi yok`, bridge.node === false)
}

async function startGame(session, menu) {
  await menu.evaluate(() => window.dnd.game.start())
  const game = await waitForRole(session, 'game')
  const control = await waitForRole(session, 'control')
  await waitFor(() => visibleRoles(session), (roles) => roles.join() === 'control,game')
  return { game, control }
}

async function pressKey(session, role, keyCode) {
  await session.app.evaluate(({ BrowserWindow }, [wanted, key]) => {
    const target = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes(`role=${wanted}`))
    target.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
    target.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
  }, [role, keyCode])
}

async function crashRenderer(session, role) {
  await session.app.evaluate(({ BrowserWindow }, wanted) => {
    const target = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes(`role=${wanted}`))
    target.webContents.forcefullyCrashRenderer()
  }, role)
}

/**
 * Kodu pencerenin sayfasında, ana süreç üzerinden çalıştırır. Çökmüş sayfada executeJavaScript
 * hiç sonuçlanmaz; bu yüzden süre sınırı vardır.
 */
function runInWindow(session, role, code) {
  return session.app.evaluate(({ BrowserWindow }, [wanted, source]) => {
    const target = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes(`role=${wanted}`))
    return Promise.race([
      target.webContents.executeJavaScript(source, true),
      new Promise((done) => setTimeout(() => done('zaman aşımı'), 1500))
    ]).catch((error) => `hata: ${error.message}`)
  }, [role, code])
}

async function closeWithX(session, role) {
  await session.app.evaluate(({ BrowserWindow }, wanted) => {
    const target = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes(`role=${wanted}`))
    target?.close()
  }, role)
}

await run(async () => {
  const work = makeWorkDir('pencere')
  writeFileSync(join(work.samplesDir, 'mekan.png'), makePng(320, 180))
  writeFileSync(join(work.samplesDir, 'npc.png'), makePng(90, 120, [30, 110, 50], [10, 40, 30]))
  writeFileSync(join(work.samplesDir, 'portre.png'), makePng(96, 96, [60, 120, 180], [20, 30, 60]))
  const samples = { place: join(work.samplesDir, 'mekan.png'), npc: join(work.samplesDir, 'npc.png'), portrait: join(work.samplesDir, 'portre.png') }

  // ---------- 1. açılış: menü, yerleşim, tam ekran, oyun akışı ----------
  let session = await launch(work)
  await session.app.context().addInitScript(cspProbe)
  let menu = await menuPage(session)
  await menu.reload()
  menu = await menuPage(session)

  const userData = await session.app.evaluate(({ app }) => app.getPath('userData'))
  check('tarayıcı profili geçici klasörde', userData.toLowerCase() === work.profileDir.toLowerCase(), userData)

  await checkBridge(menu, 'menu')
  const menuWin = await windowInfo(session, 'menu')
  check('menu: pencere başlığı', menuWin?.title === TITLES.menu, menuWin?.title)
  check(
    'menu: sandbox + contextIsolation açık, nodeIntegration kapalı',
    menuWin?.prefs.sandbox === true && menuWin?.prefs.contextIsolation === true && menuWin?.prefs.nodeIntegration === false
  )

  // Sahnenin dolu olması için: arka plan, bir görsel ve bir portre.
  const prepared = await menu.evaluate(async (paths) => {
    window.dnd.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } })
    const place = await window.dnd.library.importFiles('place', [paths.place])
    const npc = await window.dnd.library.importFiles('npc', [paths.npc])
    const portrait = await window.dnd.library.importPortraitFile(0, paths.portrait)
    window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Deneme', level: 3 } })
    window.dnd.dispatch({ type: 'stage/setBackground', fallbackSceneId: 'sahne-1', itemId: 'arka-1', imageId: place.added[0]?.id })
    window.dnd.dispatch({ type: 'stage/addItem', fallbackSceneId: 'sahne-1', itemId: 'oge-1', imageId: npc.added[0]?.id })
    const state = await window.dnd.getState()
    return { added: place.added.length + npc.added.length + portrait.added.length, scenes: state.app.scenes.length, fullscreen: state.app.settings.gameFullscreen }
  }, samples)
  check('hazırlık: görseller yüklendi, sahne kuruldu', prepared.added === 3 && prepared.scenes === 1 && prepared.fullscreen === false, JSON.stringify(prepared))

  // Ayarlar görünümünü de dolaş: CSP denetimi menünün iki yüzünü de görsün.
  await menu.getByRole('button', { name: 'Ayarlar' }).click().catch(() => {})
  await sleep(500)

  const displays = await session.app.evaluate(({ screen }) => {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((display) => ({
      id: display.id,
      primary: display.id === primaryId,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor
    }))
  })
  for (const display of displays) {
    const { x, y, width, height } = display.bounds
    info(`monitör ${display.id}${display.primary ? ' (ana)' : ''}: ${width}x${height} @ (${x},${y}), ölçek ${display.scaleFactor}`)
  }

  // --- oyunu başlat ---
  let { game, control } = await startGame(session, menu)
  await checkBridge(game, 'game')
  await checkBridge(control, 'control')
  await game.waitForLoadState('load')
  await control.waitForLoadState('load')

  let wins = await windowsInfo(session)
  for (const win of wins) {
    const { x, y, width, height } = win.bounds
    info(`pencere ${win.role}: monitör ${win.displayId}, ${width}x${height} @ (${x},${y}), görünür=${win.visible}, tam ekran=${win.fullscreen}, büyütülmüş=${win.maximized}`)
  }
  const gameWin = wins.find((win) => win.role === 'game')
  const controlWin = wins.find((win) => win.role === 'control')
  check('game: pencere başlığı (yüklendikten sonra)', gameWin?.title === TITLES.game, gameWin?.title)
  check('control: pencere başlığı (yüklendikten sonra)', controlWin?.title === TITLES.control, controlWin?.title)
  check('game + control: sandbox açık', gameWin?.prefs.sandbox === true && controlWin?.prefs.sandbox === true)
  check(
    'yalnızca oyun ekranında arka plan kısıtlaması kapalı (paylaşılan ekran donmasın)',
    gameWin?.backgroundThrottling === false && controlWin?.backgroundThrottling === true && menuWin?.backgroundThrottling === true,
    `oyun=${gameWin?.backgroundThrottling}, kontrol=${controlWin?.backgroundThrottling}, menü=${menuWin?.backgroundThrottling}`
  )
  check('oyun başlayınca ana menü gizlenir', wins.find((win) => win.role === 'menu')?.visible === false)
  check('oyun açıkken phase = playing', (await phaseOf(control)) === 'playing')
  if (displays.length >= 2) {
    const primary = displays.find((display) => display.primary)
    check('oyun ekranı ve kontrol paneli farklı monitörlerde', gameWin.displayId !== controlWin.displayId, `oyun=${gameWin.displayId}, kontrol=${controlWin.displayId}`)
    // Otomatik kural: oyuncuların izlediği ekran en büyük monitöre, kontrol paneli diğerine gider.
    const pixels = (display) => display.bounds.width * display.bounds.height * display.scaleFactor ** 2
    const largest = [...displays].sort((a, b) => pixels(b) - pixels(a) || Number(a.primary) - Number(b.primary))[0]
    check(
      'oyun ekranı en büyük monitörde, kontrol paneli diğerinde',
      gameWin.displayId === largest.id && controlWin.displayId !== largest.id,
      `en büyük=${largest.id}, ana=${primary.id}, oyun=${gameWin.displayId}, kontrol=${controlWin.displayId}`
    )
    check('kontrol paneli büyütülmüş açılır', controlWin.maximized === true)
  } else {
    info('tek monitör bulundu: farklı monitör denetimi atlandı')
    check('tek monitörde pencereler yan yana, üst üste değil', gameWin.bounds.x + gameWin.bounds.width <= controlWin.bounds.x)
  }
  check('tam ekran kapalıyken oyun ekranı pencere olarak açılır', gameWin.fullscreen === false)

  // --- ikinci başlatma isteği ---
  await control.evaluate(() => window.dnd.game.start())
  await sleep(300)
  check('ikinci game.start() yok sayılır (DND-304)', hasCode(lastRunEntries(work.dataDir), 'DND-304') && (await windowsInfo(session)).length === 3)

  // --- tam ekran: düğme ve F11 ---
  await control.evaluate(() => window.dnd.app.toggleGameFullscreen())
  let state = await waitFor(() => windowInfo(session, 'game'), (win) => win?.fullscreen === true)
  check('toggleGameFullscreen oyun ekranını tam ekran yapar', state?.fullscreen === true)
  check('tam ekran ayarı duruma yazılır (true)', (await settingsOf(control)).gameFullscreen === true)
  check('tam ekranda oyun ekranı aynı monitörde kalır', state?.displayId === gameWin.displayId, `monitör ${state?.displayId}`)

  // Playwright'ın klavyesi (CDP) before-input-event üretmez; tuş Electron'un kendi yolundan gönderilir.
  await pressKey(session, 'game', 'F11')
  state = await waitFor(() => windowInfo(session, 'game'), (win) => win?.fullscreen === false, 3000)
  check('oyun ekranında F11 tam ekrandan çıkarır', state?.fullscreen === false)
  check('tam ekran ayarı duruma yazılır (false)', (await settingsOf(control)).gameFullscreen === false)
  await pressKey(session, 'control', 'F11')
  await sleep(500)
  check('kontrol panelinde F11 oyun ekranını etkilemez', (await windowInfo(session, 'game'))?.fullscreen === false && (await settingsOf(control)).gameFullscreen === false)
  await sleep(700)
  const savedSettings = JSON.parse(readFileSync(join(work.dataDir, 'kayit.json'), 'utf8')).settings
  check('tam ekran ayarı kayit.json dosyasına yazılır', savedSettings.gameFullscreen === false, JSON.stringify(savedSettings))

  // --- zar + CSP (oyun açıkken) ---
  const roll = await control.evaluate(() => window.dnd.dice.roll())
  check('oyun açıkken zar atılır', Number.isInteger(roll?.value) && roll.value >= 1 && roll.value <= 20, `d20=${roll?.value}`)
  await sleep(1500)
  const csp = { menu: await readCsp(menu), game: await readCsp(game), control: await readCsp(control) }
  for (const [role, list] of Object.entries(csp)) {
    check(`${role}: CSP ihlali yok`, Array.isArray(list) && list.length === 0, list === null ? 'ölçülemedi' : list.join(' | '))
  }

  // --- kontrol panelini X ile kapat ---
  await closeWithX(session, 'control')
  let roles = await waitFor(() => visibleRoles(session), (list) => list.join() === 'menu')
  check('kontrol paneli X ile kapanınca oyun biter ve menü görünür', roles.join() === 'menu', `görünen: ${roles.join()}`)
  check('oyun ekranı da kapanır', (await waitFor(() => windowsInfo(session), (list) => list.length === 1)).length === 1)
  check('phase = menu', (await phaseOf(menu)) === 'menu')
  check('log: oyun bitti (control penceresi kapatıldı)', lastRunEntries(work.dataDir).some((entry) => entry.includes('Oyun bitti (control penceresi kapatıldı)')))
  check('oyun bitince zar geçmişi boşalır', (await menu.evaluate(() => window.dnd.getState().then((s) => s.session.diceHistory.length))) === 0)
  check('oyun bitince zar.json temizlenir', readFileSync(join(work.dataDir, 'zar.json'), 'utf8').trim() === '[]')

  // --- oyun ekranını X ile kapat ---
  ;({ game, control } = await startGame(session, menu))
  await closeWithX(session, 'game')
  roles = await waitFor(() => visibleRoles(session), (list) => list.join() === 'menu')
  check('oyun ekranı X ile kapanınca oyun biter ve menü görünür', roles.join() === 'menu', `görünen: ${roles.join()}`)
  check('kontrol paneli de kapanır', (await waitFor(() => windowsInfo(session), (list) => list.length === 1)).length === 1)
  check('log: oyun bitti (game penceresi kapatıldı)', lastRunEntries(work.dataDir).some((entry) => entry.includes('Oyun bitti (game penceresi kapatıldı)')))

  // --- oyun açık değilken bitirme ---
  const before304 = lastRunEntries(work.dataDir).filter((entry) => entry.includes('[DND-304]')).length
  await menu.evaluate(() => window.dnd.game.end())
  await sleep(200)
  const after304 = lastRunEntries(work.dataDir).filter((entry) => entry.includes('[DND-304]')).length
  check('oyun açık değilken game.end() yok sayılır (DND-304)', after304 === before304 + 1 && (await phaseOf(menu)) === 'menu')
  check('menü hâlâ görünür', (await visibleRoles(session)).join() === 'menu')

  // --- game.end() ile bitirme (çağıran pencere kendisi kapanır) ---
  ;({ game, control } = await startGame(session, menu))
  control.evaluate(() => window.dnd.game.end()).catch(() => {})
  roles = await waitFor(() => visibleRoles(session), (list) => list.join() === 'menu')
  check('kontrol panelinden game.end() oyunu bitirir', roles.join() === 'menu' && (await phaseOf(menu)) === 'menu')
  await waitFor(() => windowsInfo(session), (list) => list.length === 1)

  // --- art arda başlat/bitir: eski pencereler kapanırken yenisi açılır ---
  await menu.evaluate(async () => {
    await window.dnd.game.start()
    await window.dnd.game.end()
    await window.dnd.game.start()
  })
  await waitFor(() => visibleRoles(session), (list) => list.join() === 'control,game')
  await sleep(2000)
  wins = await windowsInfo(session)
  check(
    'başlat → bitir → başlat: tek oyun ekranı ve tek kontrol paneli kalır',
    wins.length === 3 && wins.filter((win) => win.role === 'game').length === 1 && wins.filter((win) => win.role === 'control').length === 1,
    wins.map((win) => `${win.role}:${win.visible}`).join(' ')
  )
  check('yeniden başlatılan oyun açık kalır', (await phaseOf(menu)) === 'playing')

  // --- oyun ekranının arayüz süreci çöker ---
  await crashRenderer(session, 'game')
  roles = await waitFor(() => visibleRoles(session), (list) => list.join() === 'menu')
  check('oyun ekranı çökünce oyun biter, menü görünür', roles.join() === 'menu' && (await phaseOf(menu)) === 'menu', `görünen: ${roles.join()}`)
  check('çökme DND-305 ile loga yazılır', hasCode(lastRunEntries(work.dataDir), 'DND-305'))
  const crashToast = await menu
    .getByText('DND-305')
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false)
  check('çökme bildirimi menüde görünür (DND-305)', crashToast)
  check('çöken pencereler kapanır', (await waitFor(() => windowsInfo(session), (list) => list.length === 1, 4000)).length === 1)

  // --- kontrol panelinin arayüz süreci çöker ---
  ;({ game, control } = await startGame(session, menu))
  await crashRenderer(session, 'control')
  roles = await waitFor(() => visibleRoles(session), (list) => list.join() === 'menu')
  check('kontrol paneli çökünce oyun biter, menü görünür', roles.join() === 'menu' && (await phaseOf(menu)) === 'menu', `görünen: ${roles.join()}`)
  check('ikinci çökme de DND-305 ile loga yazılır', lastRunEntries(work.dataDir).filter((entry) => entry.includes('[DND-305]')).length === 2)
  await waitFor(() => windowsInfo(session), (list) => list.length === 1, 4000)

  // --- oyun açıkken çıkış ---
  ;({ game, control } = await startGame(session, menu))
  await control.evaluate(() => window.dnd.dice.roll())
  check('zar.json oyun sırasında dolu', JSON.parse(readFileSync(join(work.dataDir, 'zar.json'), 'utf8')).length === 1)
  let exit = await quitFromUi(session, control)
  check('oyun açıkken çıkış: süreç kendiliğinden ve 0 koduyla kapanır', exit?.code === 0, JSON.stringify(exit))
  let entries = lastRunEntries(work.dataDir)
  check('log son satırı: Uygulama kapandı', entries.at(-1)?.endsWith('Uygulama kapandı'), entries.at(-1))
  check('çıkışta çökme işareti silinir', !existsSync(join(work.dataDir, 'calisiyor.kilit')))
  check('çıkışta zar.json temizlenir', readFileSync(join(work.dataDir, 'zar.json'), 'utf8').trim() === '[]')
  check('akış boyunca DND-901/902 yok', !hasCode(entries, 'DND-901') && !hasCode(entries, 'DND-902'))
  check('sayfalarda yakalanmamış hata yok', session.pageErrors.length === 0, session.pageErrors.map((e) => `${e.role}: ${e.text}`).join(' | '))
  const cspConsole = session.console.filter((message) => /Content Security Policy|Refused to/i.test(message.text))
  check('konsolda CSP iletisi yok', cspConsole.length === 0, cspConsole.map((m) => `${m.role}: ${m.text}`).join(' | '))

  // ---------- 2. açılış: kalıcı tam ekran ayarıyla başlatma ----------
  session = await launch(work)
  menu = await menuPage(session)
  await menu.evaluate(() => window.dnd.app.toggleGameFullscreen())
  const persisted = await waitFor(() => settingsOf(menu), (settings) => settings.gameFullscreen === true)
  check('oyun kapalıyken toggleGameFullscreen yalnızca ayarı değiştirir', persisted.gameFullscreen === true && (await windowsInfo(session)).length === 1)
  await menu.evaluate(() => window.dnd.game.start())
  await waitForRole(session, 'game')
  control = await waitForRole(session, 'control')
  state = await waitFor(() => windowInfo(session, 'game'), (win) => win?.visible === true && win?.fullscreen === true)
  check('tam ekran ayarı açıkken oyun ekranı tam ekran açılır', state?.fullscreen === true)
  const controlNow = await waitFor(() => windowInfo(session, 'control'), (win) => win?.visible === true)
  check('tam ekran oyunda kontrol paneli görünür', controlNow?.visible === true)
  if (displays.length >= 2) check('tam ekran oyun kontrol panelinden farklı monitörde', state.displayId !== controlNow.displayId, `oyun=${state.displayId}, kontrol=${controlNow.displayId}`)
  // Kullanıcının ekranı tam ekranla kapalı kalmasın.
  await control.evaluate(() => window.dnd.app.toggleGameFullscreen())
  state = await waitFor(() => windowInfo(session, 'game'), (win) => win?.fullscreen === false)
  check('düğme tam ekrandan çıkarır', state?.fullscreen === false && (await settingsOf(control)).gameFullscreen === false)

  // --- ana menünün arayüz süreci çöker: pencere yeniden yüklenir ---
  await menu.evaluate(() => window.dnd.game.end())
  await waitFor(() => visibleRoles(session), (list) => list.join() === 'menu')
  await crashRenderer(session, 'menu')
  // Playwright çöken sayfayı bir daha kullanamaz; yeniden yüklenen pencere ana süreç üzerinden sorulur.
  const reloaded = await waitFor(
    () => runInWindow(session, 'menu', 'window.dnd.getState().then((full) => full.session.phase)'),
    (phase) => phase === 'menu',
    10000,
    250
  )
  check('ana menü çökünce yeniden yüklenir ve çalışır', reloaded === 'menu' && (await visibleRoles(session)).join() === 'menu', String(reloaded))
  check('menü çökmesi DND-902 ile loga yazılır', lastRunEntries(work.dataDir).some((entry) => entry.includes('[DND-902]') && entry.includes('menu penceresi')))
  runInWindow(session, 'menu', 'window.dnd.app.quit()').catch(() => {})
  exit = await waitExit(session)
  check('ikinci açılış da 0 koduyla kapanır', exit?.code === 0, JSON.stringify(exit))
  check('ayar kapanışta diske yazılmış', JSON.parse(readFileSync(join(work.dataDir, 'kayit.json'), 'utf8')).settings.gameFullscreen === false)
})
