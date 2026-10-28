// Oyun ekranı denemelerinin ortak parçaları: derlenmiş uygulamayı geçici bir kayıt klasörüyle açar,
// oyun ekranına sanal (1920x1080) koordinatla fare gönderir, Konva sahnesini ve ekran piksellerini okur.
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// Ortak `out/` klasörüne dokunmamak için ayrı derleme kullanılır; başka derleme DND_E2E_OYUN ile verilir.
export const mainEntry = resolve(root, process.env.DND_E2E_OYUN ?? '.tmp/oyun-denetim/out/main/index.js')
export const shotDir = join(root, 'e2e', '.cikti', 'oyun')

export const STAGE_W = 1920
export const STAGE_H = 1080
export const COLUMN_W = 300

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
export const uuid = () => globalThis.crypto.randomUUID()
export const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance

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

function killTree(session) {
  if (session.exited) return
  try {
    execFileSync('taskkill', ['/PID', String(session.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    // Süreç zaten kapanmış olabilir.
  }
}

/** Betiğin gövdesini çalıştırır; beklenmeyen hata da FAIL sayılır ve açık kalan süreçler kapatılır. */
export async function run(body) {
  if (!existsSync(mainEntry)) {
    console.log(`FAIL  derleme bulunamadı: ${mainEntry}`)
    console.log('      Önce: npx electron-vite build --outDir .tmp/oyun-denetim/out')
    process.exitCode = 1
    return
  }
  try {
    await body()
  } catch (error) {
    check('betik hatasız tamamlandı', false, error instanceof Error ? (error.stack ?? error.message) : String(error))
  } finally {
    for (const session of [...sessions]) await session.close()
    const failed = results.filter((entry) => !entry.ok)
    console.log(`\n${results.length - failed.length}/${results.length} denetim geçti`)
    for (const entry of failed) console.log(`  FAIL: ${entry.name}`)
    process.exitCode = failed.length === 0 && results.length > 0 ? 0 : 1
  }
}

// --- Sayfa içi yardımcı (oyun ekranına bir kez yüklenir) ---

function installProbe() {
  if (window.__oyun) return
  /** react-konva sahneyi dışarı açmaz; kapsayıcı öğenin React düğümünden bulunur. */
  const findStage = () => {
    const container = document.querySelector('.konvajs-content')?.parentElement
    if (!container) return null
    const key = Object.keys(container).find((name) => name.startsWith('__reactFiber$'))
    for (let fiber = key ? container[key] : null; fiber; fiber = fiber.return) {
      let hook = fiber.memoizedState
      for (let i = 0; hook && typeof hook === 'object' && i < 40; i++, hook = hook.next) {
        const value = hook.memoizedState
        const current = value && typeof value === 'object' && 'current' in value ? value.current : null
        if (current && typeof current.getLayers === 'function') return current
      }
    }
    return null
  }
  /** Sahne kutusundaki dikdörtgeni pencere (client) koordinatına çevirir. */
  const toClient = (stage, rect) => {
    const box = stage.container().getBoundingClientRect()
    return { x: rect.x + box.left, y: rect.y + box.top, width: rect.width, height: rect.height }
  }
  const frames = { on: false, stamps: [] }
  const dice = { frame: [], faces: [], path: null, hooked: false }

  window.__oyun = {
    ready: () => findStage() !== null,
    items() {
      const stage = findStage()
      if (!stage) return []
      return stage.find('.game-item').map((node) => ({
        id: node.id(),
        // Düğüm merkezinden tutulur; durumla karşılaştırılabilsin diye sol üst köşe bildirilir.
        x: node.x() - node.offsetX() * node.scaleX(),
        y: node.y() - node.offsetY() * node.scaleY(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        dragging: node.isDragging(),
        listening: node.listening(),
        // Etiket ve gölge hariç yalnızca görselin kutusu.
        rect: toClient(stage, node.getClientRect({ skipShadow: true, skipStroke: true }))
      }))
    },
    labels() {
      const stage = findStage()
      if (!stage) return []
      return stage.find('Text').map((node) => ({ text: node.text(), rect: toClient(stage, node.getParent().getClientRect({ skipShadow: true })) }))
    },
    transformer() {
      const stage = findStage()
      const transformer = stage?.findOne('Transformer')
      if (!transformer) return null
      const ids = transformer.nodes().map((node) => node.id())
      const anchors = {}
      for (const name of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
        const anchor = transformer.findOne(`.${name}`)
        if (anchor) {
          const rect = toClient(stage, anchor.getClientRect())
          anchors[name] = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        }
      }
      return { shown: transformer.isVisible() && ids.length > 0, ids, anchors }
    },
    counts() {
      const stage = findStage()
      return {
        konva: stage ? stage.find(() => true).length : -1,
        canvases: document.querySelectorAll('canvas').length,
        dom: document.querySelectorAll('*').length
      }
    },
    strokes() {
      const stage = findStage()
      const layer = stage?.getLayers()[1]
      return layer ? layer.find('Line').filter((line) => (line.points() ?? []).length >= 4).length : -1
    },
    framesStart() {
      frames.on = true
      frames.stamps = []
      const tick = (now) => {
        if (!frames.on) return
        frames.stamps.push(now)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    framesStop() {
      frames.on = false
      const gaps = frames.stamps.slice(1).map((stamp, index) => stamp - frames.stamps[index])
      const sorted = [...gaps].sort((a, b) => a - b)
      const pick = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0)
      return { count: gaps.length, median: pick(0.5), p95: pick(0.95), max: sorted.at(-1) ?? 0 }
    },
    /**
     * Zar tuvaline yazılan rakamları ve boyanan yüzleri kare kare kaydeder: her `clearRect` yeni bir
     * karedir. Yüzler düz çizgilerle çizilen ve boyanan çokgenlerdir (gölge ve hale yay ile çizilir).
     */
    hookDice() {
      if (dice.hooked) return
      dice.hooked = true
      const proto = CanvasRenderingContext2D.prototype
      const { fillText, clearRect, beginPath, moveTo, lineTo, arc, fill } = proto
      const isDice = (ctx) => ctx.canvas instanceof HTMLCanvasElement && ctx.canvas.classList.contains('dice-canvas')
      proto.clearRect = function (...args) {
        if (isDice(this)) {
          dice.frame = []
          dice.faces = []
        }
        return clearRect.apply(this, args)
      }
      proto.beginPath = function (...args) {
        if (isDice(this)) dice.path = 0
        return beginPath.apply(this, args)
      }
      proto.moveTo = function (...args) {
        if (isDice(this) && dice.path !== null) dice.path += 1
        return moveTo.apply(this, args)
      }
      proto.lineTo = function (...args) {
        if (isDice(this) && dice.path !== null) dice.path += 1
        return lineTo.apply(this, args)
      }
      proto.arc = function (...args) {
        if (isDice(this)) dice.path = null
        return arc.apply(this, args)
      }
      proto.fill = function (...args) {
        if (isDice(this) && dice.path) dice.faces.push(dice.path)
        return fill.apply(this, args)
      }
      proto.fillText = function (text, ...rest) {
        if (isDice(this)) {
          const m = this.getTransform()
          dice.frame.push({ text: String(text), area: Math.abs(m.a * m.d - m.b * m.c), angle: (Math.atan2(m.b, m.a) * 180) / Math.PI, x: m.e, y: m.f })
        }
        return fillText.call(this, text, ...rest)
      }
    },
    /**
     * Son karede sonucun okunduğu rakam: izleyiciye en düz bakan (en büyük çizilen) rakam. d4'te sonuç
     * üstteki köşenin çevresindeki üç yüzde de yazar ve üçü aynı büyüklüktedir; aralarından dik duranı alınır.
     * `count`: o sayının son karede kaç kez yazıldığı; `labels`: karedeki bütün rakamların sayısı.
     */
    diceTop() {
      // Her rakam iki kez çizilir (önce gölgesi, sonra kendisi).
      const labels = dice.frame.filter((_, index) => index % 2 === 1)
      const largest = labels.reduce((max, entry) => Math.max(max, entry.area), 0)
      const top = labels
        .filter((entry) => entry.area > largest * 0.98)
        .reduce((best, entry) => (best === null || Math.abs(entry.angle) < Math.abs(best.angle) ? entry : best), null)
      const canvas = document.querySelector('.dice-canvas')
      const box = canvas?.getBoundingClientRect()
      return top && canvas && box
        ? {
            text: top.text,
            angle: top.angle,
            count: labels.filter((entry) => entry.text === top.text).length,
            labels: labels.length,
            x: box.left + (top.x / canvas.width) * box.width,
            y: box.top + (top.y / canvas.height) * box.height
          }
        : null
    },
    /** Son karede boyanan yüzlerin köşe sayıları (ör. duran d4'te [3, 3, 3], d10'da [4, 4, ...]). */
    diceFaces() {
      return [...dice.faces]
    },
    dice() {
      const overlay = document.querySelector('.dice-overlay')
      const result = document.querySelector('.dice-result')
      const rect = result?.getBoundingClientRect()
      return {
        overlay: overlay !== null,
        children: overlay ? overlay.childElementCount : -1,
        opacity: overlay ? overlay.style.opacity : null,
        canvas: document.querySelector('.dice-canvas') !== null,
        text: result ? result.textContent : null,
        className: result ? result.className : null,
        center: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
      }
    }
  }
}

// --- Uygulama ---

function roleOf(page) {
  try {
    return new URL(page.url()).searchParams.get('role')
  } catch {
    return null
  }
}

/**
 * Uygulamayı açar (yalnızca ana menü). `args`: Electron'a ek anahtarlar (ör. --force-device-scale-factor=1.5).
 * Kullanıcının gerçek kayıt klasörüne dokunulmasın diye her açılış yeni bir geçici klasör kullanır.
 */
/** `dataDir`: var olan bir kayıt klasörüyle açar (uygulamayı kapatıp yeniden açma denemeleri için). */
export async function open(label, { args = [], dataDir: existingDataDir = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), `dnd-oyun-${label}-`))
  const dataDir = existingDataDir ?? join(base, 'kayit')
  const sampleDir = join(base, 'ornek')
  mkdirSync(sampleDir, { recursive: true })
  const env = { ...process.env, DND_DATA_DIR: dataDir }
  // Başka bir Electron uygulamasının içinden çalıştırıldığında bu değişken Electron'u düz Node'a çevirir.
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [mainEntry, `--user-data-dir=${join(base, 'profil')}`, ...args], cwd: root, env })
  const child = app.process()

  const session = {
    app,
    pid: child.pid,
    exited: false,
    dataDir,
    sampleDir,
    problems: [],
    menu: null,
    game: null,
    control: null,
    gameWindow: null
  }
  child.once('exit', () => {
    session.exited = true
    sessions.delete(session)
  })
  sessions.add(session)

  const watch = (page) => {
    page.on('pageerror', (error) => session.problems.push(`${roleOf(page)} pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') session.problems.push(`${roleOf(page)} console.${message.type()}: ${message.text()}`)
    })
  }
  app.on('window', watch)

  const waitForRole = async (role) => {
    for (let i = 0; i < 150; i++) {
      const page = app.windows().find((candidate) => !candidate.isClosed() && roleOf(candidate) === role)
      if (page) {
        await page.waitForLoadState('domcontentloaded')
        await page.waitForFunction(() => typeof window.dnd === 'object' && window.dnd !== null, null, { timeout: 15000 })
        return page
      }
      await sleep(100)
    }
    throw new Error(`pencere açılmadı: ${role}`)
  }

  session.menu = await app.firstWindow()
  watch(session.menu)
  await session.menu.waitForFunction(() => typeof window.dnd === 'object' && window.dnd !== null, null, { timeout: 15000 })

  /** İşlemi (kontrol paneli açıksa oradan) gönderir; "başka pencereden gelen değişiklik" budur. */
  session.send = async (action, settleMs = 120) => {
    await (session.control ?? session.menu).evaluate((a) => window.dnd.dispatch(a), action)
    if (settleMs > 0) await sleep(settleMs)
  }
  session.state = () => (session.control ?? session.menu).evaluate(() => window.dnd.getState())
  session.scene = async () => {
    const state = await session.state()
    return state.app.scenes.find((scene) => scene.id === state.app.activeSceneId) ?? null
  }
  session.item = async (itemId, sceneId = null) => {
    const state = await session.state()
    const scene = state.app.scenes.find((entry) => entry.id === (sceneId ?? state.app.activeSceneId))
    if (!scene) return undefined
    return scene.background?.id === itemId ? scene.background : scene.items.find((item) => item.id === itemId)
  }
  session.importImage = async (kind, path) => {
    const result = await session.menu.evaluate(([k, p]) => window.dnd.library.importFiles(k, [p]), [kind, path])
    if (result.added.length !== 1) throw new Error(`içe aktarılamadı: ${path} ${JSON.stringify(result.skipped)}`)
    return result.added[0]
  }
  session.importPortrait = async (slot, path) => {
    const result = await session.menu.evaluate(([s, p]) => window.dnd.library.importPortraitFile(s, p), [slot, path])
    if (result.added.length !== 1) throw new Error(`portre eklenemedi: ${path}`)
    return result.added[0]
  }
  session.displays = () => session.menu.evaluate(() => window.dnd.app.getDisplays())

  /** Oyunu başlatır. `size`: pencereli kipte içerik boyutu (CSS pikseli). */
  session.start = async ({ fullscreen = false, displayId = null, size = [1280, 720] } = {}) => {
    await session.menu.evaluate((patch) => window.dnd.dispatch({ type: 'settings/update', patch }), { gameFullscreen: fullscreen, gameDisplayId: displayId })
    await session.menu.evaluate(() => window.dnd.game.start())
    session.game = await waitForRole('game')
    session.control = await waitForRole('control')
    session.gameWindow = await app.browserWindow(session.game)
    if (!fullscreen && size) await session.gameWindow.evaluate((win, [w, h]) => win.setContentSize(w, h), size)
    await session.game.locator('.konvajs-content canvas').first().waitFor({ timeout: 15000 })
    await session.game.evaluate(installProbe)
    await session.game.waitForFunction(() => window.__oyun.ready(), null, { timeout: 10000 })
    await sleep(fullscreen ? 900 : 400)
  }

  session.probe = (name, ...args) => session.game.evaluate(([n, a]) => window.__oyun[n](...a), [name, args])
  session.nodeOf = async (itemId) => (await session.probe('items')).find((node) => node.id === itemId) ?? null

  /** Sanal kutunun penceredeki yeri ve ölçeği. */
  session.frame = () =>
    session.game.evaluate(() => {
      const rect = document.querySelector('.game-frame').getBoundingClientRect()
      const canvas = document.querySelector('.konvajs-content canvas')
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        scale: rect.width / 1920,
        vw: window.innerWidth,
        vh: window.innerHeight,
        dpr: window.devicePixelRatio,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvases: document.querySelectorAll('.konvajs-content canvas').length
      }
    })
  /** Sanal koordinat → pencere (client) koordinatı. */
  session.toClient = async (X, Y) => {
    const frame = await session.frame()
    return [frame.left + (X * frame.width) / STAGE_W, frame.top + (Y * frame.height) / STAGE_H]
  }
  /** Pencere koordinatı → sanal koordinat. */
  session.toVirtual = async (x, y) => {
    const frame = await session.frame()
    return [((x - frame.left) * STAGE_W) / frame.width, ((y - frame.top) * STAGE_H) / frame.height]
  }
  session.moveTo = async (X, Y) => {
    const [x, y] = await session.toClient(X, Y)
    await session.game.mouse.move(x, y)
  }
  session.click = async (X, Y, options = {}) => {
    const [x, y] = await session.toClient(X, Y)
    await session.game.mouse.click(x, y, options)
    await sleep(150)
  }
  /** Sanal koordinatla sürükler. `hold`: tuş basılı kalır (bırakmak için `session.release()`). */
  session.drag = async (from, to, { steps = 12, hold = false, stepMs = 0 } = {}) => {
    const [x0, y0] = await session.toClient(from[0], from[1])
    const [x1, y1] = await session.toClient(to[0], to[1])
    await session.game.mouse.move(x0, y0)
    await session.game.mouse.down()
    for (let i = 1; i <= steps; i++) {
      await session.game.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)
      if (stepMs > 0) await sleep(stepMs)
    }
    if (!hold) await session.release()
  }
  session.release = async () => {
    await session.game.mouse.up()
    await sleep(300)
  }

  /**
   * Oyun penceresinin ekrandaki görüntüsünden bir bölge (pencere koordinatı, CSS pikseli) okur.
   * Dönen pikseller fizikseldir (BGRA); `at(x, y)` [r, g, b] verir.
   */
  session.capture = async (x, y, width, height) => {
    const shot = await session.gameWindow.evaluate(
      async (win, cssRect) => {
        // capturePage pencere (DIP) koordinatı ister; sayfa yakınlaştırılmışsa CSS pikseli ondan farklıdır.
        const zoom = win.webContents.getZoomFactor()
        const rect = { x: Math.round(cssRect.x * zoom), y: Math.round(cssRect.y * zoom), width: Math.ceil(cssRect.width * zoom), height: Math.ceil(cssRect.height * zoom) }
        const image = await win.webContents.capturePage(rect)
        const size = image.getSize()
        // Yüksek DPI'da görüntünün gerçek pikselleri istenir; genişlik tampon boyundan ve en-boy oranından bulunur.
        const bitmap = image.toBitmap({ scaleFactor: image.getScaleFactors().at(-1) ?? 1 })
        const width = Math.round(Math.sqrt((bitmap.length / 4) * (size.width / size.height)))
        return { width, height: Math.round(bitmap.length / 4 / width), data: bitmap.toString('base64') }
      },
      { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
    )
    const data = Buffer.from(shot.data, 'base64')
    const at = (px, py) => {
      const offset = (Math.round(py) * shot.width + Math.round(px)) * 4
      return [data[offset + 2], data[offset + 1], data[offset]]
    }
    return { width: shot.width, height: shot.height, at }
  }
  /** Sanal koordinattaki noktanın ekrandaki rengi [r, g, b]. */
  session.colorAt = async (X, Y) => {
    const [x, y] = await session.toClient(X, Y)
    const shot = await session.capture(x - 1, y - 1, 3, 3)
    return shot.at(Math.floor(shot.width / 2), Math.floor(shot.height / 2))
  }
  session.shot = async (name) => {
    mkdirSync(shotDir, { recursive: true })
    const path = join(shotDir, name)
    await session.game.screenshot({ path })
    return path
  }

  session.close = async () => {
    if (session.exited) return
    await Promise.race([app.close().catch(() => {}), sleep(5000)])
    await sleep(200)
    killTree(session)
    session.exited = true
    sessions.delete(session)
  }

  return session
}

/** Bir sahneyi görsellerle doldurmak için kısa yol: pencere ekler ve etkin yapar. */
export async function addScene(session, name, hotkey = null) {
  const sceneId = uuid()
  await session.send({ type: 'scene/add', sceneId, name }, 0)
  if (hotkey !== null) await session.send({ type: 'scene/update', sceneId, patch: { hotkey } }, 0)
  return sceneId
}

export async function addItem(session, sceneId, imageId, patch = null) {
  const itemId = uuid()
  await session.send({ type: 'stage/addItem', sceneId, fallbackSceneId: sceneId, itemId, imageId }, 0)
  if (patch) await session.send({ type: 'stage/updateItem', sceneId, itemId, patch }, 0)
  return itemId
}

export async function setBackground(session, sceneId, imageId) {
  const itemId = uuid()
  await session.send({ type: 'stage/setBackground', sceneId, fallbackSceneId: sceneId, itemId, imageId }, 0)
  return itemId
}

export const isRed = ([r, g, b]) => r > 200 && g < 90 && b < 90
export const show = (value) => JSON.stringify(value, (_, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v))
