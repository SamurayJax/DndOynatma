/**
 * Pencereler: ana menü, oyun ekranı ve kontrol paneli. Oyunu başlatıp bitirmek de buradadır,
 * çünkü oyunun açık olması iki pencerenin açık olması demektir.
 */
import { BrowserWindow, BrowserWindowConstructorOptions, RenderProcessGoneDetails, WebContents, app, screen } from 'electron'
import path from 'node:path'
import { WindowRole } from '@shared/ipc'
import { createStoppedPlayback } from '@shared/types'
import { planGameWindows } from './displays'
import { log } from './logger'
import { report } from './notify'
import { Store } from './store'

const TITLES: Record<WindowRole, string> = {
  menu: 'DndOynatma',
  game: 'DndOynatma — Oyun Ekranı',
  control: 'DndOynatma — Kontrol Paneli',
  // Bu pencereyi `setup.ts` açar; burada yalnızca rol listesi eksiksiz olsun diye durur.
  setup: 'DndOynatma — Kayıt Klasörü'
}

/** Arayüz hiç çizilemese bile pencere bu süre sonunda gösterilir; aksi halde uygulama görünmez kalır. */
const SHOW_FALLBACK_MS = 5000
/** Sayfa kapanmayı engellerse pencere bu süre sonunda zorla kapatılır. */
const CLOSE_FALLBACK_MS = 1500
const MAX_MENU_RELOADS = 3

export interface WindowManagerDeps {
  store: Store
  /** Oyun normal bittiğinde zar kaydını temizler. */
  clearDice: () => void
}

function isSameDocument(target: string, current: string): boolean {
  try {
    const a = new URL(target)
    const b = new URL(current)
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname
  } catch {
    return false
  }
}

function showWhenReady(win: BrowserWindow, show: () => void): void {
  let done = false
  const run = (): void => {
    if (done || win.isDestroyed()) return
    done = true
    show()
  }
  win.once('ready-to-show', run)
  const timer = setTimeout(run, SHOW_FALLBACK_MS)
  win.once('closed', () => clearTimeout(timer))
}

// Kapanmakta olan pencereler. Yükleme bitmeden kapatılan pencerenin yarım kalan yüklemesi
// hata olarak loga düşmesin diye tutulur; pencere bu sırada henüz "destroyed" değildir.
const closingWindows = new WeakSet<BrowserWindow>()

function closeWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  closingWindows.add(win)
  // close(): arayüz son değişikliklerini gönderebilsin diye; destroy() bunu atlar.
  const timer = setTimeout(() => {
    if (!win.isDestroyed()) win.destroy()
  }, CLOSE_FALLBACK_MS)
  win.once('closed', () => clearTimeout(timer))
  win.close()
}

function bringToFront(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export class WindowManager {
  private menu: BrowserWindow | null = null
  private game: BrowserWindow | null = null
  private control: BrowserWindow | null = null
  private quitting = false
  private menuReloads = 0
  // Kapanmakta olan pencereden gelen son iletiler de tanınabilsin diye roller ayrı tutulur.
  private readonly roles = new WeakMap<WebContents, WindowRole>()

  constructor(private readonly deps: WindowManagerDeps) {
    // Ayar arayüzden değişirse (ör. kontrol panelindeki düğme) açık oyun ekranına uygulanır.
    deps.store.subscribe((previous, next) => {
      const wanted = next.app.settings.gameFullscreen
      if (previous.app.settings.gameFullscreen === wanted) return
      const game = this.game
      if (game && !game.isDestroyed() && game.isFullScreen() !== wanted) this.applyGameFullscreen(game, wanted)
    })
  }

  /** İletiyi gönderen pencerenin rolü; uygulamanın açmadığı bir içerikse null. */
  roleOf(contents: WebContents): WindowRole | null {
    return this.roles.get(contents) ?? null
  }

  /** Yalnızca kontrol paneline gönderir (müziğin ilerlemesi gibi sık gelen, durumda tutulmayan bilgiler). */
  sendToControl(channel: string, payload: unknown): void {
    const control = this.control
    if (!control || control.isDestroyed() || control.webContents.isDestroyed()) return
    try {
      control.webContents.send(channel, payload)
    } catch {
      // Pencere tam bu sırada kapanmış olabilir.
    }
  }

  /** Uygulama kapanırken pencerelerin kapanması "oyunu bitir" sayılmasın. */
  setQuitting(): void {
    this.quitting = true
  }

  openMenu(): void {
    if (this.menu && !this.menu.isDestroyed()) {
      bringToFront(this.menu)
      return
    }
    const win = this.create('menu', { width: 1100, height: 720, minWidth: 900, minHeight: 600 })
    this.menu = win
    showWhenReady(win, () => win.show())
    win.on('closed', () => {
      if (this.menu === win) this.menu = null
      if (!this.quitting) app.quit()
    })
    // Windows oturumu kapanırken (bilgisayarı kapatma) will-quit gelmeyebilir.
    win.on('session-end', () => this.deps.store.flushSave())
  }

  /** İkinci kez çalıştırıldığında var olan pencere öne gelir. */
  focusMain(): void {
    const target = [this.control, this.menu].find((win) => win && !win.isDestroyed())
    if (target) bringToFront(target)
  }

  startGame(): void {
    const { store } = this.deps
    if (store.getState().session.phase === 'playing' || this.game || this.control) {
      report('DND-304', 'oyun zaten açık')
      return
    }

    const settings = store.getState().app.settings
    const plan = planGameWindows(screen.getAllDisplays(), screen.getPrimaryDisplay().id, settings)

    const game = this.create('game', {
      ...plan.game.bounds,
      minWidth: 480,
      minHeight: 270,
      // Yalnızca istenince verilir: açıkça false verilen pencere bazı platformlarda tam ekrana alınamaz.
      ...(plan.game.fullscreen ? { fullscreen: true } : {}),
      backgroundColor: '#000000'
    })
    let control: BrowserWindow
    try {
      control = this.create('control', { ...plan.control.bounds, minWidth: 420, minHeight: 480 })
    } catch (error) {
      game.destroy()
      throw error
    }
    this.game = game
    this.control = control

    // Pencereler ilk durumu ancak bu fonksiyon bittikten sonra isteyebilir; oyunu açık görürler.
    store.updateSession((session) => ({ ...session, phase: 'playing', tool: 'mouse' }))

    // Tek monitörde tam ekran oyun penceresi kontrol panelini örtmesin.
    const raiseControl = (): void => {
      if (this.control !== control || control.isDestroyed() || !control.isVisible()) return
      control.moveTop()
      control.focus()
    }
    showWhenReady(game, () => {
      if (this.game !== game) return
      game.show()
      if (plan.game.fullscreen && !game.isFullScreen()) game.setFullScreen(true)
      raiseControl()
    })
    showWhenReady(control, () => {
      if (this.control !== control) return
      if (plan.control.maximize) control.maximize()
      control.show()
      raiseControl()
      if (this.menu && !this.menu.isDestroyed()) this.menu.hide()
    })

    game.on('closed', () => this.onGameWindowClosed(game, 'game'))
    control.on('closed', () => this.onGameWindowClosed(control, 'control'))

    log.info(
      `Oyun başladı: oyun ekranı monitör ${plan.game.display.id}${plan.game.fullscreen ? ' (tam ekran)' : ''}, ` +
        `kontrol paneli monitör ${plan.control.display.id}`
    )
  }

  endGame(reason: string): void {
    const { store } = this.deps
    if (store.getState().session.phase !== 'playing') {
      report('DND-304', 'oyun açık değil')
      return
    }
    // Önce bağlar koparılır; böylece aşağıdaki kapanışlar "kullanıcı kapattı" sayılmaz.
    const windows = [this.game, this.control]
    this.game = null
    this.control = null
    for (const win of windows) closeWindow(win)

    // Müzik oyun ekranıyla birlikte susar; yeni oyun sessiz başlar.
    store.updateSession((session) => ({
      ...session,
      phase: 'menu',
      tool: 'mouse',
      drawingNonce: session.drawingNonce + 1,
      diceHistory: [],
      playback: { ...createStoppedPlayback(), seekNonce: session.playback.seekNonce }
    }))
    this.deps.clearDice()
    log.info(`Oyun bitti (${reason})`)

    if (!this.quitting) this.openMenu()
  }

  /** Oyun ekranı açıksa tam ekranı değiştirir; her durumda ayarı kalıcı yapar. */
  toggleGameFullscreen(): void {
    const { store } = this.deps
    const game = this.game && !this.game.isDestroyed() ? this.game : null
    const next = game ? !game.isFullScreen() : !store.getState().app.settings.gameFullscreen
    if (game) this.applyGameFullscreen(game, next)
    store.dispatch({ type: 'settings/update', patch: { gameFullscreen: next } }, { trusted: true })
  }

  private applyGameFullscreen(game: BrowserWindow, fullscreen: boolean): void {
    game.setFullScreen(fullscreen)
    const control = this.control
    if (fullscreen && control && !control.isDestroyed() && control.isVisible()) control.moveTop()
  }

  private onGameWindowClosed(win: BrowserWindow, role: WindowRole): void {
    const wasCurrent = this.game === win || this.control === win
    if (this.game === win) this.game = null
    if (this.control === win) this.control = null
    // Güncel değilse endGame kapatmıştır; uygulama kapanıyorsa temizliği kapanış yapar.
    if (!wasCurrent || this.quitting) return
    this.endGame(`${role} penceresi kapatıldı`)
  }

  private onRenderProcessGone(role: WindowRole, win: BrowserWindow, details: RenderProcessGoneDetails): void {
    if (details.reason === 'clean-exit') return
    const detail = `${role} penceresi, neden: ${details.reason}, çıkış kodu: ${details.exitCode}`
    if (role === 'menu') {
      log.code('DND-902', detail)
      // Ana menü çökerse uygulama görünmez kalmasın; sonsuz döngüye girmemek için sınırlı sayıda denenir.
      this.menuReloads += 1
      if (this.menuReloads <= MAX_MENU_RELOADS && !win.isDestroyed()) win.reload()
      return
    }
    if (this.game !== win && this.control !== win) {
      log.code('DND-305', `${detail} (oyun zaten bitmişti)`)
      return
    }
    // Önce oyun bitirilir ki bildirim görünür durumdaki ana menüye ulaşsın.
    this.endGame(`${role} penceresi çöktü`)
    report('DND-305', detail)
  }

  private create(role: WindowRole, options: BrowserWindowConstructorOptions): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      title: TITLES[role],
      autoHideMenuBar: true,
      ...options,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Oyun ekranı Discord/Teams'te paylaşılır; başka bir pencerenin altında kalınca Chromium
        // çizimi yavaşlatırsa zar animasyonu ve kalem izleyicide donar. Müzik de bu pencerede çalar;
        // DM kontrol panelinden başlattığı için oyun ekranında tıklama beklenmeden çalabilmeli.
        ...(role === 'game' ? { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' as const } : {})
      }
    })
    const contents = win.webContents
    this.roles.set(contents, role)

    // Sayfanın <title> etiketi pencere başlığını değiştirmesin.
    win.on('page-title-updated', (event) => event.preventDefault())
    // Kullanıcının X ile ya da uygulamadan çıkarken kapattığı pencere de buraya düşer.
    win.on('close', () => closingWindows.add(win))

    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => {
      // Aynı belgenin yeniden yüklenmesi (geliştirmede otomatik yenileme) serbest; başka her adres engellenir.
      if (isSameDocument(event.url, contents.getURL())) return
      event.preventDefault()
      log.info(`Gezinme engellendi (${role} penceresi)`)
    })

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return
      if (input.key === 'F12' && !app.isPackaged) {
        contents.toggleDevTools()
        event.preventDefault()
      } else if (input.key === 'F11' && role === 'game') {
        this.toggleGameFullscreen()
        event.preventDefault()
      }
    })

    contents.on('render-process-gone', (_event, details) => this.onRenderProcessGone(role, win, details))

    this.load(win, role)
    return win
  }

  private load(win: BrowserWindow, role: WindowRole): void {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const loading =
      !app.isPackaged && devUrl
        ? win.loadURL(`${devUrl}?role=${role}`)
        : win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { role } })
    loading.catch((error: unknown) => {
      // Yükleme sürerken pencere kapatılırsa da buraya düşer; o durumda hata değildir.
      if (win.isDestroyed() || closingWindows.has(win)) return
      log.error('DND-902', error, `${role} penceresi yüklenemedi`)
    })
  }
}
