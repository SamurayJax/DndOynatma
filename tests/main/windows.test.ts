import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { BrowserWindow, app } from 'electron'
import { Mock, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Action } from '@shared/actions'
import { IPC, Notice } from '@shared/ipc'
import { reduce } from '@shared/reducer'
import { FullState, createInitialState, createStoppedPlayback } from '@shared/types'
import { log } from '../../src/main/logger'
import { broadcast, report } from '../../src/main/notify'
import { Store } from '../../src/main/store'
import { WindowManager } from '../../src/main/windows'
import { makeTempDir, removeTempDir } from './helpers'

// Electron çalıştırılmadan pencere akışını sınamak için en küçük sahte: gerçek Electron'daki gibi
// close() pencereyi sonradan kapatır ve kapanmış pencerenin webContents'ine erişmek hata fırlatır.
vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')

  class FakeWebContents extends Emitter {
    destroyed = false
    url = ''
    sent: { channel: string; payload: unknown }[] = []
    setWindowOpenHandler = vi.fn()
    toggleDevTools = vi.fn()
    getURL(): string {
      return this.url
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    send(channel: string, payload: unknown): void {
      this.sent.push({ channel, payload })
    }
  }

  class FakeBrowserWindow extends Emitter {
    static all: FakeBrowserWindow[] = []
    /** Doluysa bundan sonra açılan pencerelerin yüklemesi bu hatayla reddedilir. */
    static loadFailure: Error | null = null
    static getAllWindows(): FakeBrowserWindow[] {
      return FakeBrowserWindow.all.filter((win) => !win.destroyed)
    }

    contents = new FakeWebContents()
    destroyed = false
    visible = false
    focused = false
    maximized = false
    fullscreen: boolean
    reload = vi.fn()

    constructor(public options: Record<string, unknown>) {
      super()
      this.fullscreen = options.fullscreen === true
      FakeBrowserWindow.all.push(this)
    }
    get webContents(): FakeWebContents {
      if (this.destroyed) throw new Error('Object has been destroyed')
      return this.contents
    }
    loadURL(url: string): Promise<void> {
      this.contents.url = url
      return Promise.resolve()
    }
    loadFile(file: string, options: { query: Record<string, string> }): Promise<void> {
      this.contents.url = `file:///${file.replace(/\\/g, '/')}?role=${options.query.role}`
      return FakeBrowserWindow.loadFailure ? Promise.reject(FakeBrowserWindow.loadFailure) : Promise.resolve()
    }
    show(): void {
      this.visible = true
    }
    hide(): void {
      this.visible = false
    }
    focus(): void {
      this.focused = true
    }
    moveTop(): void {}
    maximize(): void {
      this.maximized = true
    }
    restore(): void {}
    isVisible(): boolean {
      return this.visible
    }
    isMinimized(): boolean {
      return false
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    isFullScreen(): boolean {
      return this.fullscreen
    }
    setFullScreen(value: boolean): void {
      this.fullscreen = value
    }
    close(): void {
      this.emit('close', { preventDefault: () => {} })
      setTimeout(() => this.destroy(), 0)
    }
    destroy(): void {
      if (this.destroyed) return
      this.destroyed = true
      this.visible = false
      this.contents.destroyed = true
      this.emit('closed')
    }
  }

  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1400 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 2560, y: 0, width: 1920, height: 1080 }, workArea: { x: 2560, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 }
  ]

  return {
    BrowserWindow: FakeBrowserWindow,
    app: { isPackaged: false, quit: vi.fn() },
    screen: { getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0] }
  }
})

vi.mock('@shared/reducer', () => ({ reduce: vi.fn() }))

interface FakeContents extends EventEmitter {
  url: string
  sent: { channel: string; payload: unknown }[]
  setWindowOpenHandler: Mock
  toggleDevTools: Mock
}

interface FakeWindow extends EventEmitter {
  options: {
    title: string
    x?: number
    width: number
    height: number
    minWidth: number
    minHeight: number
    fullscreen?: boolean
    backgroundColor?: string
    show: boolean
    webPreferences: { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean; backgroundThrottling?: boolean }
  }
  contents: FakeContents
  destroyed: boolean
  visible: boolean
  focused: boolean
  maximized: boolean
  fullscreen: boolean
  reload: Mock
  close(): void
}

const Fake = BrowserWindow as unknown as { all: FakeWindow[]; loadFailure: Error | null }
const quit = app.quit as unknown as Mock
const reduceMock = vi.mocked(reduce)

function windowFor(role: 'menu' | 'game' | 'control'): FakeWindow {
  const matches = Fake.all.filter((win) => win.contents.url.endsWith(`?role=${role}`))
  if (matches.length === 0) throw new Error(`${role} penceresi açılmadı`)
  return matches[matches.length - 1]
}

function noticesSentTo(win: FakeWindow): Notice[] {
  return win.contents.sent.filter((entry) => entry.channel === IPC.notice).map((entry) => entry.payload as Notice)
}

let logDir: string
let store: Store
let manager: WindowManager
let clearDice: Mock<() => void>

/** Ana menüyü açar, oyunu başlatır ve üç pencereyi de "hazır" duruma getirir. */
function startPlaying(): { menu: FakeWindow; game: FakeWindow; control: FakeWindow } {
  manager.openMenu()
  const menu = windowFor('menu')
  menu.emit('ready-to-show')
  manager.startGame()
  const game = windowFor('game')
  const control = windowFor('control')
  game.emit('ready-to-show')
  control.emit('ready-to-show')
  return { menu, game, control }
}

beforeAll(() => {
  logDir = makeTempDir()
  log.init(logDir)
})

afterAll(() => {
  log.close()
  removeTempDir(logDir)
})

beforeEach(() => {
  vi.useFakeTimers()
  Fake.all.length = 0
  Fake.loadFailure = null
  quit.mockReset()
  vi.stubEnv('ELECTRON_RENDERER_URL', undefined)

  // Bu testlerde yalnızca ayar değişikliği gerekir; diğer işlemler durumu değiştirmez.
  reduceMock.mockReset()
  reduceMock.mockImplementation((state: FullState, action: Action) =>
    action.type === 'settings/update'
      ? { state: { ...state, app: { ...state.app, settings: { ...state.app.settings, ...action.patch } } } }
      : { state }
  )

  clearDice = vi.fn<() => void>()
  store = new Store({
    initial: createInitialState(),
    saveEnabled: true,
    writeSave: vi.fn(),
    broadcast,
    report,
    trashImage: vi.fn(),
    trashSound: vi.fn()
  })
  manager = new WindowManager({ store, clearDice })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('ana menü', () => {
  it('güvenli ayarlarla açılır ve hazır olunca görünür', () => {
    manager.openMenu()
    const menu = windowFor('menu')

    expect(menu.options).toMatchObject({ title: 'DndOynatma', width: 1100, height: 720, minWidth: 900, minHeight: 600, show: false })
    expect(menu.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })
    expect(menu.options.webPreferences.preload.replace(/\\/g, '/')).toMatch(/\/preload\/index\.js$/)
    expect(menu.contents.url).toMatch(/\/renderer\/index\.html\?role=menu$/)
    expect(menu.visible).toBe(false)

    menu.emit('ready-to-show')
    expect(menu.visible).toBe(true)
  })

  it('geliştirme sunucusu varsa oradan yükler', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    manager.openMenu()
    expect(windowFor('menu').contents.url).toBe('http://localhost:5173?role=menu')
  })

  it('arayüz hiç hazır olmasa da bir süre sonra görünür', () => {
    manager.openMenu()
    const menu = windowFor('menu')
    vi.advanceTimersByTime(4999)
    expect(menu.visible).toBe(false)
    vi.advanceTimersByTime(1)
    expect(menu.visible).toBe(true)
  })

  it('ikinci kez açılmak istenirse yeni pencere açmaz, var olanı öne getirir', () => {
    manager.openMenu()
    manager.openMenu()
    expect(Fake.all).toHaveLength(1)
    expect(windowFor('menu').visible).toBe(true)
  })

  it('kapatılınca uygulamadan çıkar', () => {
    manager.openMenu()
    windowFor('menu').close()
    vi.runAllTimers()
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('başka adrese gezinmeyi ve yeni pencere açmayı engeller', () => {
    manager.openMenu()
    const menu = windowFor('menu')

    const away = { url: 'https://example.com/', preventDefault: vi.fn() }
    menu.contents.emit('will-navigate', away)
    expect(away.preventDefault).toHaveBeenCalled()

    const dropped = { url: 'file:///C:/Users/dm/Desktop/harita.png', preventDefault: vi.fn() }
    menu.contents.emit('will-navigate', dropped)
    expect(dropped.preventDefault).toHaveBeenCalled()

    const reload = { url: menu.contents.url, preventDefault: vi.fn() }
    menu.contents.emit('will-navigate', reload)
    expect(reload.preventDefault).not.toHaveBeenCalled()

    const handler = menu.contents.setWindowOpenHandler.mock.calls[0][0] as () => { action: string }
    expect(handler()).toEqual({ action: 'deny' })
  })

  it('sayfa başlığının pencere başlığını değiştirmesine izin vermez', () => {
    manager.openMenu()
    const event = { preventDefault: vi.fn() }
    windowFor('menu').emit('page-title-updated', event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('geliştirmede F12 geliştirici araçlarını açar', () => {
    manager.openMenu()
    const menu = windowFor('menu')
    const event = { preventDefault: vi.fn() }
    menu.contents.emit('before-input-event', event, { type: 'keyDown', key: 'F12', isAutoRepeat: false })
    expect(menu.contents.toggleDevTools).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('çökerse sınırlı sayıda yeniden yükler', () => {
    manager.openMenu()
    const menu = windowFor('menu')
    for (let i = 0; i < 5; i++) menu.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
    expect(menu.reload).toHaveBeenCalledTimes(3)
  })
})

describe('oyunu başlatma', () => {
  it('oyun ekranını büyük monitörde, kontrol panelini diğer monitörde açar', () => {
    const { menu, game, control } = startPlaying()

    expect(game.options.title).toBe('DndOynatma — Oyun Ekranı')
    expect(game.options.backgroundColor).toBe('#000000')
    expect(game.options.fullscreen).toBe(true)
    expect(game.options.x).toBeLessThan(2560)
    expect(game.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })

    expect(control.options.title).toBe('DndOynatma — Kontrol Paneli')
    expect(control.options.x).toBeGreaterThanOrEqual(2560)
    expect(control.maximized).toBe(true)

    expect(game.visible).toBe(true)
    expect(control.visible).toBe(true)
    expect(control.focused).toBe(true)
    expect(menu.visible).toBe(false)
    expect(menu.destroyed).toBe(false)

    expect(store.getState().session).toMatchObject({ phase: 'playing', tool: 'mouse' })
  })

  it('yalnızca oyun ekranı arka planda da tam hızda çizer (ekran paylaşımı donmasın)', () => {
    const { menu, game, control } = startPlaying()
    expect(game.options.webPreferences.backgroundThrottling).toBe(false)
    expect(control.options.webPreferences.backgroundThrottling).toBeUndefined()
    expect(menu.options.webPreferences.backgroundThrottling).toBeUndefined()
    expect(game.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })
  })

  it('tam ekran ayarı kapalıysa oyun ekranını pencere olarak açar', () => {
    store.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } })
    const { game } = startPlaying()
    expect(game.options.fullscreen).toBeUndefined()
    expect(game.fullscreen).toBe(false)
  })

  it('seçilen monitörü kullanır', () => {
    store.dispatch({ type: 'settings/update', patch: { gameDisplayId: 1 } })
    const { game, control } = startPlaying()
    expect(game.options.x).toBeLessThan(2560)
    expect(control.options.x).toBeGreaterThanOrEqual(2560)
  })

  it('yeni durumu açık pencerelere yayar', () => {
    manager.openMenu()
    const menu = windowFor('menu')
    manager.startGame()
    const states = menu.contents.sent.filter((entry) => entry.channel === IPC.state)
    expect((states[states.length - 1].payload as FullState).session.phase).toBe('playing')
  })

  it('oyun zaten açıkken yeniden başlatmaz (DND-304)', () => {
    startPlaying()
    manager.startGame()
    expect(Fake.all).toHaveLength(3)
    expect(store.getState().session.phase).toBe('playing')
  })

  it('araç fareye döner', () => {
    manager.openMenu()
    store.updateSession((session) => ({ ...session, tool: 'pen-red' }))
    manager.startGame()
    expect(store.getState().session.tool).toBe('mouse')
  })
})

describe('yarım kalan yükleme', () => {
  const loadError = new Error("ERR_FAILED (-2) loading 'file:///renderer/index.html'")

  function logLength(): number {
    return fs.existsSync(log.currentFile()) ? fs.readFileSync(log.currentFile(), 'utf8').length : 0
  }

  /** Bu noktadan sonra loga yazılanlar. */
  function logSince(offset: number): string {
    return fs.readFileSync(log.currentFile(), 'utf8').slice(offset)
  }

  it('açık duran pencere yüklenemezse DND-902 ile loga yazılır', async () => {
    const before = logLength()
    Fake.loadFailure = loadError
    manager.openMenu()
    await Promise.resolve()

    expect(logSince(before)).toContain('[DND-902] Beklenmeyen hata (arayüz) — menu penceresi yüklenemedi')
  })

  it('oyun, pencereler yüklenmeden bitirilirse yarım kalan yükleme hata sayılmaz', async () => {
    manager.openMenu()
    const before = logLength()
    Fake.loadFailure = loadError
    manager.startGame()
    const game = windowFor('game')
    // Gerçek Electron'da olduğu gibi: yükleme, pencere daha yok edilmeden reddedilir.
    manager.endGame('oyunu bitir')
    await Promise.resolve()

    expect(game.destroyed).toBe(false)
    expect(logSince(before)).not.toContain('DND-902')
    vi.runAllTimers()
  })

  it('kullanıcı yüklenmekte olan pencereyi kapatırsa da hata sayılmaz', async () => {
    manager.openMenu()
    const before = logLength()
    Fake.loadFailure = loadError
    manager.startGame()
    windowFor('control').close()
    await Promise.resolve()

    // Sahte pencerede iki yükleme de reddedilir; kapatılmayan oyun ekranınınki gerçek bir hatadır.
    const written = logSince(before)
    expect(written).not.toContain('control penceresi yüklenemedi')
    expect(written).toContain('game penceresi yüklenemedi')
    vi.runAllTimers()
  })
})

describe('oyunu bitirme', () => {
  it('iki pencereyi kapatır, menüyü gösterir ve oturumu sıfırlar', () => {
    const { menu, game, control } = startPlaying()
    store.updateSession((session) => ({
      ...session,
      tool: 'pen-black',
      diceHistory: [{ id: 'r1', sides: 20, value: 17, at: '2026-10-03T19:00:00.000Z' }]
    }))
    const nonceBefore = store.getState().session.drawingNonce

    manager.endGame('oyunu bitir')
    vi.runAllTimers()

    expect(game.destroyed).toBe(true)
    expect(control.destroyed).toBe(true)
    expect(menu.visible).toBe(true)
    expect(menu.focused).toBe(true)
    expect(store.getState().session).toEqual({ phase: 'menu', tool: 'mouse', penWidth: 'medium', drawingNonce: nonceBefore + 1, diceHistory: [], playback: createStoppedPlayback() })
    expect(clearDice).toHaveBeenCalledTimes(1)
    expect(quit).not.toHaveBeenCalled()
  })

  it('oyun açık değilken hiçbir şey yapmaz (DND-304)', () => {
    manager.openMenu()
    const before = store.getState()
    manager.endGame('oyunu bitir')
    expect(store.getState()).toBe(before)
    expect(clearDice).not.toHaveBeenCalled()
  })

  it.each(['game', 'control'] as const)('kullanıcı %s penceresini kapatınca oyun biter', (role) => {
    const windows = startPlaying()
    const nonceBefore = store.getState().session.drawingNonce

    windows[role].close()
    vi.runAllTimers()

    expect(windows.game.destroyed).toBe(true)
    expect(windows.control.destroyed).toBe(true)
    expect(windows.menu.visible).toBe(true)
    expect(store.getState().session.phase).toBe('menu')
    // Diğer pencerenin kapanması oyunu ikinci kez bitirmemeli.
    expect(store.getState().session.drawingNonce).toBe(nonceBefore + 1)
    expect(clearDice).toHaveBeenCalledTimes(1)
  })

  it('bittikten sonra yeniden başlatılabilir', () => {
    startPlaying()
    manager.endGame('oyunu bitir')
    vi.runAllTimers()

    manager.startGame()
    expect(Fake.all.filter((win) => !win.destroyed)).toHaveLength(3)
    expect(store.getState().session.phase).toBe('playing')
  })

  it('kapanmakta olan eski pencere hazır olunca menüyü gizlemez', () => {
    manager.openMenu()
    const menu = windowFor('menu')
    menu.emit('ready-to-show')
    manager.startGame()
    const control = windowFor('control')

    manager.endGame('oyunu bitir')
    control.emit('ready-to-show')

    expect(menu.visible).toBe(true)
    expect(control.visible).toBe(false)
  })

  it('pencere çökünce oyunu bitirir ve bildirir (DND-305)', () => {
    const { menu, game, control } = startPlaying()

    game.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -1073741819 })
    vi.runAllTimers()

    expect(control.destroyed).toBe(true)
    expect(store.getState().session.phase).toBe('menu')
    expect(menu.visible).toBe(true)
    expect(clearDice).toHaveBeenCalledTimes(1)
    expect(noticesSentTo(menu)).toEqual([
      { id: expect.any(String), level: 'HATA', code: 'DND-305', message: 'Pencere beklenmedik şekilde kapandı' }
    ])
  })

  it('düzgün kapanan arayüz sürecini çökme saymaz', () => {
    const { menu, control } = startPlaying()
    control.contents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 })
    expect(store.getState().session.phase).toBe('playing')
    expect(noticesSentTo(menu)).toEqual([])
  })

  it('uygulama kapanırken pencerelerin kapanması oyunu bitirmez', () => {
    const { menu, game, control } = startPlaying()
    manager.setQuitting()

    game.close()
    control.close()
    menu.close()
    vi.runAllTimers()

    // Zar kaydını ve çökme işaretini kapanış temizler; burada ikinci kez çıkış istenmez.
    expect(clearDice).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })
})

describe('tam ekran', () => {
  it('oyun ekranında F11 tam ekranı değiştirir ve ayarı kalıcı yapar', () => {
    const { game } = startPlaying()
    expect(game.fullscreen).toBe(true)

    const event = { preventDefault: vi.fn() }
    game.contents.emit('before-input-event', event, { type: 'keyDown', key: 'F11', isAutoRepeat: false })

    expect(game.fullscreen).toBe(false)
    expect(store.getState().app.settings.gameFullscreen).toBe(false)
    expect(event.preventDefault).toHaveBeenCalled()

    manager.toggleGameFullscreen()
    expect(game.fullscreen).toBe(true)
    expect(store.getState().app.settings.gameFullscreen).toBe(true)
  })

  it('kontrol panelinde F11 bir şey yapmaz', () => {
    const { game, control } = startPlaying()
    control.contents.emit('before-input-event', { preventDefault: vi.fn() }, { type: 'keyDown', key: 'F11', isAutoRepeat: false })
    expect(game.fullscreen).toBe(true)
  })

  it('oyun açık değilken yalnızca ayarı değiştirir', () => {
    manager.openMenu()
    manager.toggleGameFullscreen()
    expect(store.getState().app.settings.gameFullscreen).toBe(false)
  })

  it('ayar arayüzden değişirse açık oyun ekranına uygulanır', () => {
    const { game } = startPlaying()
    store.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } })
    expect(game.fullscreen).toBe(false)
  })
})

describe('pencere rolleri', () => {
  it('iletiyi gönderen pencerenin rolünü tanır', () => {
    const { menu, game, control } = startPlaying()
    const roleOf = (contents: FakeContents) => manager.roleOf(contents as never)
    expect(roleOf(menu.contents)).toBe('menu')
    expect(roleOf(game.contents)).toBe('game')
    expect(roleOf(control.contents)).toBe('control')
    expect(roleOf(new EventEmitter() as FakeContents)).toBeNull()
  })

  it('kapanmış pencereden gelen son iletinin rolünü de tanır', () => {
    const { control } = startPlaying()
    manager.endGame('oyunu bitir')
    vi.runAllTimers()
    expect(manager.roleOf(control.contents as never)).toBe('control')
  })

  it('ikinci kopya çalıştırılınca oyun sırasında kontrol paneli, değilse ana menü öne gelir', () => {
    manager.openMenu()
    const menu = windowFor('menu')
    menu.focused = false
    manager.focusMain()
    expect(menu.focused).toBe(true)

    manager.startGame()
    const control = windowFor('control')
    manager.focusMain()
    expect(control.focused).toBe(true)
    expect(control.visible).toBe(true)
  })
})
