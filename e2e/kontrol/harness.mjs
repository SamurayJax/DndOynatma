// Kontrol paneli denemelerinin ortak parçaları: derlenmiş uygulamayı geçici bir kayıt klasörüyle açar,
// örnek veriyi kurar, PASS/FAIL satırlarını yazar ve geride çalışan süreç bırakmaz.
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePng } from '../fixtures.mjs'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// Ortak `out/` klasörüne dokunmamak için ayrı derleme kullanılır; başka derleme DND_E2E_KONTROL ile verilir.
export const mainEntry = resolve(root, process.env.DND_E2E_KONTROL ?? '.tmp/kontrol-denetim/out/main/index.js')
const shotDir = join(root, 'e2e', '.cikti')

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// --- Sonuçlar ---

const results = []
const sessions = new Set()

export function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
  return Boolean(ok)
}

export function info(text) {
  console.log(`BILGI ${text}`)
}

/** Beklenmeyen hata da FAIL sayılır; süreçler her durumda kapatılır ve çıkış kodu ayarlanır. */
export async function run(body) {
  if (!existsSync(mainEntry)) {
    console.log(`FAIL  derleme bulunamadı: ${mainEntry}`)
    console.log('      Önce: npx electron-vite build --outDir .tmp/kontrol-denetim/out')
    process.exitCode = 1
    return
  }
  try {
    await body()
  } catch (error) {
    check('betik hatasız tamamlandı', false, error instanceof Error ? (error.stack ?? error.message) : String(error))
  } finally {
    for (const session of sessions) await close(session)
    const failed = results.filter((entry) => !entry.ok)
    console.log(`\n${results.length - failed.length}/${results.length} denetim geçti`)
    for (const entry of failed) console.log(`  FAIL: ${entry.name}`)
    process.exitCode = failed.length === 0 && results.length > 0 ? 0 : 1
  }
}

// --- Uygulama ---

export function roleOf(page) {
  try {
    return new URL(page.url()).searchParams.get('role')
  } catch {
    return null
  }
}

/**
 * Uygulamayı yeni bir geçici kayıt klasörüyle açar. Kullanıcının gerçek kayıt klasörüne dokunulmasın
 * diye DND_DATA_DIR her zaman verilir; oyun ekranı da tam ekran açılmasın diye ayar kapatılır.
 */
export async function launch(label) {
  const base = mkdtempSync(join(tmpdir(), `dnd-kontrol-${label}-`))
  const dataDir = join(base, 'kayit')
  const samplesDir = join(base, 'ornek')
  mkdirSync(samplesDir, { recursive: true })

  const env = { ...process.env, DND_DATA_DIR: dataDir }
  // Başka bir Electron uygulamasının içinden çalıştırıldığında bu değişken Electron'u düz Node'a çevirir.
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [mainEntry, `--user-data-dir=${join(base, 'profil')}`], cwd: root, env })
  const session = { app, pid: app.process().pid, base, dataDir, samplesDir, pageErrors: [], closed: false }
  sessions.add(session)

  const attach = (page) => page.on('pageerror', (error) => session.pageErrors.push(`${roleOf(page)}: ${error.message}`))
  app.on('window', attach)
  for (const page of app.windows()) attach(page)

  const menu = await app.firstWindow()
  await menu.waitForLoadState('domcontentloaded')
  await menu.waitForFunction(() => typeof window.dnd === 'object' && window.dnd !== null, null, { timeout: 15000 })
  await menu.getByRole('button', { name: 'Oyna' }).waitFor({ timeout: 15000 })
  await menu.evaluate(() => window.dnd.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } }))
  session.menu = menu
  return session
}

export async function close(session) {
  if (session.closed) return
  session.closed = true
  sessions.delete(session)
  await Promise.race([session.app.close().catch(() => {}), sleep(5000)])
  try {
    execFileSync('taskkill', ['/PID', String(session.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    // Süreç zaten kapanmış.
  }
}

export async function waitForRole(session, role, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = session.app.windows().find((candidate) => !candidate.isClosed() && roleOf(candidate) === role)
    if (page) {
      await page.waitForLoadState('domcontentloaded')
      await page.waitForFunction(() => typeof window.dnd === 'object' && window.dnd !== null, null, { timeout: 15000 })
      return page
    }
    await sleep(100)
  }
  throw new Error(`pencere açılmadı: ${role}`)
}

/** Oyunu başlatır; iki pencere de ilk durumu çizene kadar bekler. */
export async function startGame(session) {
  await session.menu.evaluate(() => window.dnd.game.start())
  const game = await waitForRole(session, 'game')
  const control = await waitForRole(session, 'control')
  await control.locator('.ctl-root').waitFor({ timeout: 15000 })
  await game.locator('canvas').first().waitFor({ timeout: 15000 })
  return { game, control }
}

/** Pencerenin iç (içerik) boyutunu ayarlar; ekrana sığmıyorsa işletim sistemi kırpar, gerçek boyut döner. */
export async function setContentSize(session, role, width, height) {
  await session.app.evaluate(
    async ({ BrowserWindow }, target) => {
      const win = BrowserWindow.getAllWindows().find((w) => new URL(w.webContents.getURL()).searchParams.get('role') === target.role)
      if (!win) throw new Error(`pencere yok: ${target.role}`)
      if (win.isMaximized()) {
        // Büyütülmüş pencere eski boyutuna gecikmeyle döner; boyut ondan sonra verilmezse ezilir.
        win.unmaximize()
        for (let i = 0; i < 40 && win.isMaximized(); i++) await new Promise((done) => setTimeout(done, 25))
        await new Promise((done) => setTimeout(done, 150))
      }
      win.setContentSize(target.width, target.height)
    },
    { role, width, height }
  )
  const page = await waitForRole(session, role)
  const read = () => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  // Sayfa yeni boyutu bir-iki kare sonra görür.
  return waitFor(read, (size) => size.width === width && size.height === height, 1500)
}

export function windowState(session, role) {
  return session.app.evaluate(({ BrowserWindow }, target) => {
    const win = BrowserWindow.getAllWindows().find((w) => new URL(w.webContents.getURL()).searchParams.get('role') === target)
    return win ? { fullscreen: win.isFullScreen(), bounds: win.getBounds(), focused: win.isFocused() } : null
  }, role)
}

/** Koşul sağlanana kadar bekler; süre dolarsa son değeri döner. */
export async function waitFor(read, accept = Boolean, timeoutMs = 5000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (!accept(value) && Date.now() < deadline) {
    await sleep(stepMs)
    value = await read()
  }
  return value
}

export const getState = (page) => page.evaluate(() => window.dnd.getState())
export const dispatch = (page, action) => page.evaluate((a) => window.dnd.dispatch(a), action)

export async function shot(page, name) {
  mkdirSync(shotDir, { recursive: true })
  await page.screenshot({ path: join(shotDir, `kontrol-${name}.png`) })
}

// --- Örnek veri ---

const TINTS = [
  [[190, 120, 60], [60, 30, 20]],
  [[60, 120, 180], [20, 30, 60]],
  [[40, 130, 60], [10, 40, 30]],
  [[150, 60, 150], [40, 10, 60]],
  [[170, 40, 40], [50, 10, 20]],
  [[200, 190, 90], [80, 70, 20]]
]

/** Küçük örnek PNG'ler yazar; yollarını verilen adlarla aynı sırada döndürür. */
export function writeImages(dir, names, width = 96, height = 96) {
  mkdirSync(dir, { recursive: true })
  return names.map((name, index) => {
    const [from, to] = TINTS[index % TINTS.length]
    const file = join(dir, `${name}.png`)
    writeFileSync(file, makePng(width, height, from, to))
    return file
  })
}

/** Görselleri kütüphaneye ekler ve eklenen kayıtları döndürür. */
export async function importImages(session, kind, names, width = 96, height = 96) {
  const paths = writeImages(join(session.samplesDir, `${kind}-${Date.now()}`), names, width, height)
  const result = await session.menu.evaluate(([k, p]) => window.dnd.library.importFiles(k, p), [kind, paths])
  if (result.added.length !== names.length) throw new Error(`örnek görseller eklenemedi (${kind}): ${JSON.stringify(result.skipped)}`)
  return result.added
}

export const PLAYER_NAMES = ['Kenji', 'Jasper', 'Mira', 'Şahin Çağrı']

/** Oyuncu kartlarını doldurur (portresiz; ad kartı "dolu" yapmaya yeter). */
export async function seedPlayers(session, count = 4) {
  await session.menu.evaluate(
    (names) => names.forEach((name, slot) => window.dnd.dispatch({ type: 'player/update', slot, patch: { name, level: 3 + slot } })),
    PLAYER_NAMES.slice(0, count)
  )
}

/** Pencereleri oluşturur; `scenes`: [{ name, hotkey }]. Kimlikleri aynı sırada döndürür. */
export async function seedScenes(session, scenes) {
  return session.menu.evaluate((list) => {
    return list.map((entry) => {
      const sceneId = crypto.randomUUID()
      window.dnd.dispatch({ type: 'scene/add', sceneId, name: entry.name })
      if (entry.hotkey != null) window.dnd.dispatch({ type: 'scene/update', sceneId, patch: { hotkey: entry.hotkey } })
      return sceneId
    })
  }, scenes)
}

// --- Sayfa içi yardımcılar ---

/**
 * Sayfada çalışır (`page.evaluate(probeLayout)`): sütunların, satırların ve kontrollerin yerleşimini ölçer;
 * üst üste binen, satırından taşan, kırpılan ya da çok küçük kalan kontrolleri `problems` içinde sayar.
 */
export function probeLayout() {
  const rect = (el) => {
    const r = el.getBoundingClientRect()
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }
  }
  const all = (selector) => Array.from(document.querySelectorAll(selector))
  const shown = (el) => el.getClientRects().length > 0
  const overlaps = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5
  const nameOf = (el) => el.getAttribute('aria-label') || String(el.className) || el.tagName

  const columns = ['.ctl-col--players', '.ctl-col--library', '.ctl-col--side'].map((selector) => document.querySelector(selector))
  const visibleColumns = columns.filter(shown)
  const columnRects = visibleColumns.map(rect)
  let columnOverlap = false
  for (let i = 0; i + 1 < columnRects.length; i++) if (overlaps(columnRects[i], columnRects[i + 1])) columnOverlap = true

  // Yan yana duran parçalar birbirinin üstüne binmemeli, satırından taşmamalı.
  const rows = ['.ctl-topbar', '.ctl-player__head', '.ctl-hp__row', '.ctl-hp__controls', '.ctl-hp__bar', '.lib-toolbar', '.ctl-stage__row', '.ctl-dice__top', '.ctl-tools', '.ctl-tools__footer', '.ui-panel__header', '.ctl-views']
  const problems = []
  for (const selector of rows) {
    for (const row of all(selector).filter(shown)) {
      const bounds = rect(row)
      const kids = Array.from(row.children).filter(shown).map((el) => ({ el, box: rect(el) }))
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].box.l < bounds.l - 1 || kids[i].box.r > bounds.r + 1) problems.push(`${selector}: "${nameOf(kids[i].el)}" satırdan taşıyor`)
        for (let j = i + 1; j < kids.length; j++) {
          if (overlaps(kids[i].box, kids[j].box)) problems.push(`${selector}: "${nameOf(kids[i].el)}" ile "${nameOf(kids[j].el)}" üst üste`)
        }
      }
    }
  }

  // Her kontrol görünür boyutta olmalı ve kaydırılamayan bir kabın dışında kalmamalı.
  for (const el of all('.ctl-root button, .ctl-root input, .ctl-root textarea').filter(shown)) {
    const box = rect(el)
    if (box.w < 16 || box.h < 16) problems.push(`"${nameOf(el)}" çok küçük (${Math.round(box.w)}×${Math.round(box.h)})`)
    for (let parent = el.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const area = rect(parent)
      const clipsX = style.overflowX !== 'visible'
      const clipsY = style.overflowY !== 'visible'
      const scrollsX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && parent.scrollWidth > parent.clientWidth
      const scrollsY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight
      if (clipsX && !scrollsX && (box.l < area.l - 3 || box.r > area.r + 3)) problems.push(`"${nameOf(el)}" yatayda kırpılıyor (${parent.className})`)
      if (clipsY && !scrollsY && (box.t < area.t - 3 || box.b > area.b + 3)) problems.push(`"${nameOf(el)}" dikeyde kırpılıyor (${parent.className})`)
      if (clipsX || clipsY) break
    }
  }

  const page = document.scrollingElement
  const scrollOf = (el) => (el !== null && shown(el) ? el.scrollHeight - el.clientHeight : 0)
  return {
    pageOverflowX: page.scrollWidth - window.innerWidth,
    pageOverflowY: page.scrollHeight - window.innerHeight,
    visibleColumns: visibleColumns.length,
    columnOverlap,
    playersScroll: scrollOf(columns[0]),
    sideScroll: scrollOf(columns[2]),
    cards: all('.ctl-player').filter(shown).length,
    stageRows: all('.ctl-stage__row').length,
    libraryCards: all('.lib-card').length,
    tabsShown: shown(document.querySelector('.ctl-views')),
    problems: Array.from(new Set(problems))
  }
}

/**
 * Dosya sürükleyip bırakmayı taklit eder. Uygulama bırakılan dosyanın yolunu `webUtils` ile okur; bu
 * yalnızca diskten gelen gerçek `File` nesnelerinde çalışır. O yüzden dosyalar önce gizli bir dosya
 * girişine verilir, sonra aynı nesnelerle `dragenter` → `dragover` → `drop` olayları gönderilir.
 * `leave`: bırakmak yerine sürükleme panelden çıkar. Dönen değer: örtü göründü mü, sonunda kalktı mı.
 */
export async function dropFiles(page, selector, paths, { leave = false } = {}) {
  await page.evaluate(() => {
    if (document.getElementById('drop-probe') !== null) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.id = 'drop-probe'
    input.style.cssText = 'position:fixed;left:-200px;top:0;opacity:0'
    document.body.append(input)
  })
  await page.setInputFiles('#drop-probe', paths)
  return page.evaluate(
    async ([target, leaving]) => {
      const transfer = new DataTransfer()
      for (const file of document.getElementById('drop-probe').files) transfer.items.add(file)
      const fire = (type, node) => node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
      const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 30)))
      fire('dragenter', document.querySelector(target))
      await frame()
      const overlay = document.querySelector('.lib-drop')
      if (overlay === null) return { overlay: false, cleared: true }
      if (leaving) {
        fire('dragleave', overlay)
      } else {
        fire('dragover', overlay)
        fire('drop', overlay)
      }
      await frame()
      return { overlay: true, cleared: document.querySelector('.lib-drop') === null }
    },
    [selector, leave]
  )
}

/** Kare sürelerini ölçer: `action` çalışırken requestAnimationFrame aralıklarını toplar. */
export async function measureFrames(page, action) {
  await page.evaluate(() => {
    const frames = []
    let last = performance.now()
    let active = true
    const tick = (now) => {
      frames.push(now - last)
      last = now
      if (active) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__frames = { frames, stop: () => (active = false) }
  })
  await action()
  return page.evaluate(() => {
    window.__frames.stop()
    const frames = window.__frames.frames.slice(1).sort((a, b) => a - b)
    const at = (q) => frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] ?? 0
    return { count: frames.length, median: at(0.5), p95: at(0.95), max: frames[frames.length - 1] ?? 0 }
  })
}

export function readLog(session) {
  const dir = join(session.dataDir, 'log')
  if (!existsSync(dir)) return ''
  return readdirSync(dir)
    .filter((name) => name.endsWith('.log'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('')
}

export const SCENES = [
  { name: 'Kraliyet İçi', hotkey: 1 },
  { name: 'Orman Yolu', hotkey: 2 },
  { name: 'Ejderha Mağarası — Derin Kat', hotkey: 3 },
  { name: 'Liman', hotkey: 4 },
  { name: 'Han', hotkey: 5 },
  { name: 'Çok uzun adlı bir pencere daha burada', hotkey: null }
]

const LIBRARY_COUNTS = { npc: 30, merchant: 10, place: 15, scene: 15, enemy: 40, boss: 10, teamItem: 10, item: 20 }

/**
 * Gerçek bir oturumun büyüklüğünde veri: 4 oyuncu, 6 pencere, 150 görsel; ilk pencerede arka plan ve
 * 10 görsel, ikincide arka plan ve 2 görsel. Dönen değer: pencere kimlikleri ve bölmelere göre görseller.
 */
export async function seedFullSession(session) {
  await seedPlayers(session, 4)
  const sceneIds = await seedScenes(session, SCENES)
  const library = {}
  for (const [kind, count] of Object.entries(LIBRARY_COUNTS)) {
    const landscape = kind === 'place' || kind === 'scene'
    const names = Array.from({ length: count }, (_, index) => `${kind}-görsel-${String(index + 1).padStart(2, '0')}`)
    library[kind] = await importImages(session, kind, names, landscape ? 160 : 90, landscape ? 90 : 120)
  }
  await session.menu.evaluate(
    ([first, second, backgrounds, firstItems, secondItems]) => {
      const d = window.dnd
      const place = (sceneId, images) =>
        images.forEach((imageId, index) => {
          const itemId = crypto.randomUUID()
          d.dispatch({ type: 'stage/addItem', sceneId, fallbackSceneId: sceneId, itemId, imageId })
          const patch = { x: 340 + (index % 5) * 300, y: 120 + Math.floor(index / 5) * 420, width: 180, label: index % 2 ? `${index} LVL` : '' }
          d.dispatch({ type: 'stage/updateItem', sceneId, itemId, patch })
        })
      d.dispatch({ type: 'stage/setBackground', sceneId: first, fallbackSceneId: first, itemId: crypto.randomUUID(), imageId: backgrounds[0] })
      d.dispatch({ type: 'stage/setBackground', sceneId: second, fallbackSceneId: second, itemId: crypto.randomUUID(), imageId: backgrounds[1] })
      place(first, firstItems)
      place(second, secondItems)
      d.dispatch({ type: 'scene/setActive', sceneId: first })
    },
    [
      sceneIds[0],
      sceneIds[1],
      [library.place[0].id, library.scene[0].id],
      [...library.enemy.slice(0, 6), ...library.npc.slice(0, 4)].map((image) => image.id),
      [library.boss[0].id, library.npc[0].id]
    ]
  )
  return { sceneIds, library }
}

/**
 * Silinen görseller gerçek Geri Dönüşüm Kutusu'na gitmesin diye `shell.trashItem` yerine dosyayı
 * geçici klasöre taşıyan bir sahte konur. Çağrılan yollar `trashCalls` ile okunur.
 */
export async function stubTrash(session) {
  const target = join(session.base, 'cop')
  mkdirSync(target, { recursive: true })
  await session.app.evaluate(({ shell }, dir) => {
    const fs = process.getBuiltinModule('node:fs')
    const path = process.getBuiltinModule('node:path')
    globalThis.__trashCalls = []
    shell.trashItem = async (file) => {
      globalThis.__trashCalls.push(file)
      fs.renameSync(file, path.join(dir, path.basename(file)))
    }
  }, target)
}

export const trashCalls = (session) => session.app.evaluate(() => globalThis.__trashCalls ?? [])

/** Oyun ekranında sanal (1920×1080) koordinatın sayfa içindeki karşılığı. */
export async function stagePoint(game, x, y) {
  const rect = await game.evaluate(() => {
    const box = document.querySelector('.konvajs-content').getBoundingClientRect()
    return { left: box.left, top: box.top, width: box.width, height: box.height }
  })
  return { x: rect.left + (x / 1920) * rect.width, y: rect.top + (y / 1080) * rect.height }
}
