import fs from 'node:fs'
import path from 'node:path'
import * as electron from 'electron'
import { Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Action } from '@shared/actions'
import { AppInfo, IPC, ImportResult } from '@shared/ipc'
import { reduce } from '@shared/reducer'
import { DiceRoll, FullState, createInitialState } from '@shared/types'
import { registerIpc } from '../../src/main/ipcHandlers'
import { log } from '../../src/main/logger'
import { broadcast, report } from '../../src/main/notify'
import { DataPaths, buildDataPaths, ensureDataDirs } from '../../src/main/paths'
import { loadDiceHistory } from '../../src/main/storage'
import { Store } from '../../src/main/store'
import { WindowManager } from '../../src/main/windows'
import { makeTempDir, pngBytes, removeTempDir, webpLossyBytes } from './helpers'

// Arayüz çağrılarını Electron olmadan uçtan uca sınamak için: kayıtlı işleyiciler toplanır,
// tek bir sahte pencere yayınları biriktirir.
vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const sent: { channel: string; payload: unknown }[] = []
  const contents = {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    }
  }
  const win = { isDestroyed: () => false, webContents: contents }
  const displays = [
    { id: 11, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1400 }, scaleFactor: 1 },
    { id: 22, bounds: { x: 2560, y: 0, width: 1920, height: 1080 }, workArea: { x: 2560, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 }
  ]
  return {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
      on: (channel: string, listener: (...args: unknown[]) => void) => listeners.set(channel, listener)
    },
    BrowserWindow: { getAllWindows: () => [win], fromWebContents: () => win },
    dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
    shell: { openPath: vi.fn(() => Promise.resolve('')) },
    screen: { getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0] },
    app: { quit: vi.fn(), isPackaged: false },
    testing: { handlers, listeners, sent, contents, win }
  }
})

vi.mock('@shared/reducer', () => ({ reduce: vi.fn() }))

const fake = electron as unknown as {
  testing: {
    handlers: Map<string, (...args: unknown[]) => unknown>
    listeners: Map<string, (...args: unknown[]) => void>
    sent: { channel: string; payload: unknown }[]
    contents: object
    win: object
  }
  dialog: { showOpenDialog: Mock; showSaveDialog: Mock }
  shell: { openPath: Mock }
  app: { quit: Mock }
}
const reduceMock = vi.mocked(reduce)

let dir: string
let paths: DataPaths
let store: Store
let windows: { roleOf: Mock; startGame: Mock; endGame: Mock; toggleGameFullscreen: Mock }
let update: { getStatus: Mock; accept: Mock; decline: Mock }
let libraryAddAccepted: boolean
const info: AppInfo = {
  version: '0.1.0',
  dataDir: 'veri',
  dataDirCloud: null,
  dataDirFixed: false,
  logDir: 'log',
  logFile: 'bugun.log',
  crashedLastTime: true
}
const storage = {
  pickParent: vi.fn(async () => 'C:\\secilen'),
  check: vi.fn((parent: string) => ({ parent, target: `${parent}\\DndOynatma-Kayit`, cloud: null, writable: true, hasSave: false, sameAsCurrent: false })),
  move: vi.fn(async () => ({ ok: true, code: null, message: '', target: 'yeni' }))
}

/** Arayüzdeki `ipcRenderer.invoke` karşılığı. */
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = fake.testing.handlers.get(channel)
  if (!handler) throw new Error(`işleyici yok: ${channel}`)
  return handler({ sender: fake.testing.contents }, ...args) as Promise<T>
}

/** Arayüzdeki `ipcRenderer.send` karşılığı. */
function send(channel: string, ...args: unknown[]): void {
  const listener = fake.testing.listeners.get(channel)
  if (!listener) throw new Error(`dinleyici yok: ${channel}`)
  listener({ sender: fake.testing.contents }, ...args)
}

function sourceFile(name: string, content: Buffer | string): string {
  const file = path.join(dir, name)
  fs.writeFileSync(file, content)
  return file
}

function logLines(): string[] {
  return fs.readFileSync(log.currentFile(), 'utf8').split('\n').filter((line) => line !== '')
}

function startPlaying(): void {
  store.updateSession((session) => ({ ...session, phase: 'playing' }))
}

beforeEach(() => {
  dir = makeTempDir()
  paths = buildDataPaths(path.join(dir, 'veri'))
  ensureDataDirs(paths)
  log.init(paths.logDir)

  fake.testing.handlers.clear()
  fake.testing.listeners.clear()
  fake.testing.sent.length = 0
  fake.dialog.showOpenDialog.mockReset()
  fake.dialog.showSaveDialog.mockReset()
  fake.shell.openPath.mockClear()
  fake.app.quit.mockReset()

  // Gerçek reducer'ın bu testlerde gereken en küçük karşılığı.
  libraryAddAccepted = true
  reduceMock.mockReset()
  reduceMock.mockImplementation((state: FullState, action: Action) => {
    switch (action.type) {
      case 'library/add':
        if (!libraryAddAccepted) return { state }
        return { state: { ...state, app: { ...state.app, library: [...state.app.library, ...action.images] } } }
      case 'player/update': {
        const players = state.app.players.map((player, slot) => (slot === action.slot ? { ...player, ...action.patch } : player))
        return { state: { ...state, app: { ...state.app, players } } }
      }
      case 'note/setGeneral':
        return { state: { ...state, app: { ...state.app, generalNote: action.text } } }
      default:
        return { state }
    }
  })

  store = new Store({
    initial: createInitialState(),
    saveEnabled: true,
    writeSave: vi.fn(),
    broadcast,
    report,
    trashImage: vi.fn(),
    trashSound: vi.fn()
  })
  windows = { roleOf: vi.fn(() => 'control'), startGame: vi.fn(), endGame: vi.fn(), toggleGameFullscreen: vi.fn() }
  update = { getStatus: vi.fn(() => ({ phase: 'idle' as const })), accept: vi.fn(), decline: vi.fn() }
  registerIpc({ store, windows: windows as unknown as WindowManager, paths, storage, getInfo: () => info, update })
})

afterEach(() => {
  log.close()
  removeTempDir(dir)
})

describe('durum ve işlemler', () => {
  it('getState güncel durumu döner', async () => {
    expect(await invoke<FullState>(IPC.getState)).toBe(store.getState())
  })

  it('dispatch işlemi uygular ve yeni durumu yayar', () => {
    send(IPC.dispatch, { type: 'note/setGeneral', text: 'merhaba' })
    expect(store.getState().app.generalNote).toBe('merhaba')
    expect(fake.testing.sent).toEqual([{ channel: IPC.state, payload: store.getState() }])
  })

  it('not içeriğini loga yazmaz', () => {
    send(IPC.dispatch, { type: 'note/setGeneral', text: 'çok gizli plan' })
    const lines = logLines()
    expect(lines.some((line) => line.includes('note/setGeneral uzunluk=14'))).toBe(true)
    expect(lines.some((line) => line.includes('gizli'))).toBe(false)
  })

  it('biçimi bozuk işlemi yok sayar ve bildirir (DND-306)', () => {
    send(IPC.dispatch, 'işlem değil')
    expect(reduceMock).not.toHaveBeenCalled()
    expect(fake.testing.sent).toEqual([
      { channel: IPC.notice, payload: { id: expect.any(String), level: 'UYARI', code: 'DND-306', message: 'Geçersiz işlem' } }
    ])
  })

  it("arayüzden gelen library/add'i kabul etmez", () => {
    send(IPC.dispatch, { type: 'library/add', images: [{ id: 'x', kind: 'npc', fileName: '..\\..\\gizli.png' }] })
    expect(store.getState().app.library).toEqual([])
  })

  it('uygulamanın açmadığı içerikten gelen çağrıları reddeder', async () => {
    windows.roleOf.mockReturnValue(null)
    send(IPC.dispatch, { type: 'note/setGeneral', text: 'x' })
    expect(store.getState().app.generalNote).toBe('')
    await expect(invoke(IPC.getState)).rejects.toThrow()
  })

  it('işleyicideki hata ana süreci düşürmez', () => {
    windows.toggleGameFullscreen.mockImplementation(() => {
      throw new Error('beklenmeyen')
    })
    expect(() => send(IPC.appToggleGameFullscreen)).not.toThrow()
    expect(logLines().some((line) => line.includes('[DND-901]'))).toBe(true)
  })
})

describe('görsel yükleme', () => {
  it('importFiles dosyaları kopyalar ve kütüphaneye ekler', async () => {
    const files = [sourceFile('Ejderha.png', pngBytes(800, 600)), sourceFile('not.txt', 'metin'), sourceFile('Kral.webp', webpLossyBytes(400, 600))]

    const result = await invoke<ImportResult>(IPC.libraryImportFiles, 'boss', files)

    expect(result.canceled).toBe(false)
    expect(result.skipped).toEqual([{ name: 'not.txt', code: 'DND-201' }])
    expect(result.added.map((image) => [image.kind, image.originalName, image.width, image.height])).toEqual([
      ['boss', 'Ejderha', 800, 600],
      ['boss', 'Kral', 400, 600]
    ])
    expect(store.getState().app.library).toEqual(result.added)
    expect(fs.readdirSync(paths.imagesDir).sort()).toEqual(result.added.map((image) => image.fileName).sort())
    // Tek bir library/add gönderilir.
    expect(reduceMock.mock.calls.filter(([, action]) => action.type === 'library/add')).toHaveLength(1)
  })

  it('geçersiz bölme ya da dosya listesiyle hiçbir şey yapmaz', async () => {
    const file = sourceFile('a.png', pngBytes(10, 10))
    const empty = { added: [], skipped: [], canceled: false }
    expect(await invoke(IPC.libraryImportFiles, 'portrait', [file])).toEqual(empty)
    expect(await invoke(IPC.libraryImportFiles, 'ejderha', [file])).toEqual(empty)
    expect(await invoke(IPC.libraryImportFiles, 'npc', file)).toEqual(empty)
    expect(fs.readdirSync(paths.imagesDir)).toEqual([])
  })

  it('kütüphane görseli kabul etmezse kopyayı geri alır', async () => {
    libraryAddAccepted = false
    const result = await invoke<ImportResult>(IPC.libraryImportFiles, 'npc', [sourceFile('a.png', pngBytes(10, 10))])
    expect(result.added).toEqual([])
    expect(result.skipped).toEqual([{ name: 'a', code: 'DND-202' }])
    expect(fs.readdirSync(paths.imagesDir)).toEqual([])
  })

  it('import çoklu seçimli dosya penceresi açar', async () => {
    const file = sourceFile('orman.png', pngBytes(1920, 1080))
    fake.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })

    const result = await invoke<ImportResult>(IPC.libraryImport, 'scene')

    expect(result.added).toHaveLength(1)
    expect(result.added[0].kind).toBe('scene')
    const [parent, options] = fake.dialog.showOpenDialog.mock.calls[0]
    expect(parent).toBe(fake.testing.win)
    expect(options.title).toBe('Görsel yükle — Sahneler')
    expect(options.properties).toEqual(['openFile', 'multiSelections'])
    expect(options.filters[0].extensions).toEqual(['png', 'jpg', 'jpeg', 'webp'])
  })

  it('dosya penceresi iptal edilirse canceled döner', async () => {
    fake.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await invoke(IPC.libraryImport, 'npc')).toEqual({ added: [], skipped: [], canceled: true })
    expect(store.getState().app.library).toEqual([])
  })

  it('importPortrait tek dosya seçtirir ve portreyi oyuncuya bağlar', async () => {
    const file = sourceFile('savasci.png', pngBytes(512, 512))
    fake.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })

    const result = await invoke<ImportResult>(IPC.libraryImportPortrait, 2)

    expect(result.added).toHaveLength(1)
    expect(result.added[0].kind).toBe('portrait')
    expect(store.getState().app.players[2].portraitId).toBe(result.added[0].id)
    expect(fake.dialog.showOpenDialog.mock.calls[0][1].properties).toEqual(['openFile'])
    expect(fake.dialog.showOpenDialog.mock.calls[0][1].title).toBe('Portre seç — Oyuncu 3')
  })

  it('geçersiz yuvada dosya penceresi açmaz (DND-307)', async () => {
    for (const slot of [-1, 4, 1.5, '1', null]) {
      expect(await invoke(IPC.libraryImportPortrait, slot)).toEqual({ added: [], skipped: [], canceled: false })
    }
    expect(fake.dialog.showOpenDialog).not.toHaveBeenCalled()
  })

  it('okunamayan portrede oyuncuya dokunmaz', async () => {
    fake.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceFile('bozuk.png', 'görsel değil')] })
    const result = await invoke<ImportResult>(IPC.libraryImportPortrait, 0)
    expect(result.skipped).toEqual([{ name: 'bozuk.png', code: 'DND-204' }])
    expect(store.getState().app.players[0].portraitId).toBeNull()
  })
})

describe('zar', () => {
  it('oyun açık değilken atmaz (DND-401)', async () => {
    expect(await invoke(IPC.diceRollRequest, 20)).toBeNull()
    expect(store.getState().session.diceHistory).toEqual([])
    expect(fs.existsSync(paths.diceFile)).toBe(false)
  })

  it('atışı geçmişin başına koyar, dosyaya yazar ve pencerelere duyurur', async () => {
    startPlaying()
    fake.testing.sent.length = 0

    const first = await invoke<DiceRoll>(IPC.diceRollRequest, 20)
    const second = await invoke<DiceRoll>(IPC.diceRollRequest, 20)

    for (const roll of [first, second]) {
      expect(roll.sides).toBe(20)
      expect(Number.isInteger(roll.value)).toBe(true)
      expect(roll.value).toBeGreaterThanOrEqual(1)
      expect(roll.value).toBeLessThanOrEqual(20)
      expect(Number.isNaN(Date.parse(roll.at))).toBe(false)
    }
    expect(first.id).not.toBe(second.id)
    expect(store.getState().session.diceHistory).toEqual([second, first])
    expect(loadDiceHistory(paths.diceFile)).toEqual({ rolls: [second, first], error: null })

    expect(fake.testing.sent.map((entry) => entry.channel)).toEqual([IPC.state, IPC.diceRoll, IPC.state, IPC.diceRoll])
    expect(fake.testing.sent[1].payload).toEqual(first)
    expect(logLines().some((line) => line.endsWith(`Zar atıldı: d20 = ${first.value}`))).toBe(true)
  })

  it('geçmişi 50 atışla sınırlar ve 1-20 dışına çıkmaz', async () => {
    startPlaying()
    const values = new Set<number>()
    for (let i = 0; i < 120; i++) values.add((await invoke<DiceRoll>(IPC.diceRollRequest, 20)).value)

    expect(store.getState().session.diceHistory).toHaveLength(50)
    expect(loadDiceHistory(paths.diceFile).rolls).toHaveLength(50)
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...values)).toBeLessThanOrEqual(20)
  })

  it.each([
    [6, [1, 2, 3, 4, 5, 6]],
    [10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
  ])('d%i yalnızca kendi değerlerini verir ve hepsi gelir', async (sides, expected) => {
    startPlaying()
    const values = new Set<number>()
    for (let i = 0; i < 400; i++) {
      const roll = await invoke<DiceRoll>(IPC.diceRollRequest, sides)
      expect(roll.sides).toBe(sides)
      values.add(roll.value)
    }
    expect([...values].sort((a, b) => a - b)).toEqual(expected)
    expect(logLines().some((line) => line.includes(`Zar atıldı: d${sides} = `))).toBe(true)
  })

  it('farklı zarlar aynı geçmişte, atılış sırasıyla durur ve dosyadan geri okunur', async () => {
    startPlaying()
    const rolled: DiceRoll[] = []
    for (const sides of [20, 6, 10]) rolled.unshift(await invoke<DiceRoll>(IPC.diceRollRequest, sides))

    expect(rolled.map((roll) => roll.sides)).toEqual([10, 6, 20])
    expect(store.getState().session.diceHistory).toEqual(rolled)
    expect(loadDiceHistory(paths.diceFile)).toEqual({ rolls: rolled, error: null })
  })

  it('tanınmayan zarı atmaz (DND-306)', async () => {
    startPlaying()
    fake.testing.sent.length = 0
    // 3 ve 4: eski sürümlerde vardı, kaldırıldı.
    for (const sides of [undefined, 4, 3, 0, -20, 20.5, '20', null, { sides: 20 }]) {
      expect(await invoke(IPC.diceRollRequest, sides)).toBeNull()
    }
    expect(store.getState().session.diceHistory).toEqual([])
    expect(fake.testing.sent.some((entry) => entry.channel === IPC.diceRoll)).toBe(false)
    expect(logLines().filter((line) => line.includes('DND-306')).length).toBe(9)
  })

  it('zar kaydı yazılamasa da atış yapılır; bildirim bir kez gösterilir (DND-105)', async () => {
    startPlaying()
    // Dosyanın yerinde klasör varsa yazma başarısız olur.
    fs.mkdirSync(paths.diceFile)
    fake.testing.sent.length = 0

    expect(await invoke<DiceRoll>(IPC.diceRollRequest, 20)).not.toBeNull()
    expect(await invoke<DiceRoll>(IPC.diceRollRequest, 10)).not.toBeNull()

    expect(store.getState().session.diceHistory).toHaveLength(2)
    const notices = fake.testing.sent.filter((entry) => entry.channel === IPC.notice)
    expect(notices).toHaveLength(1)
    expect(notices[0].payload).toMatchObject({ code: 'DND-105', level: 'UYARI' })
  })
})

describe('karakter aktarma', () => {
  it('ana menü dışındaki pencereden çalışmaz (DND-306)', async () => {
    store.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Kenji' } })

    expect(await invoke(IPC.charactersExport)).toMatchObject({ ok: false, canceled: false, code: 'DND-306', count: 0 })
    expect(await invoke(IPC.charactersPickImport)).toMatchObject({ ok: false, canceled: false, code: 'DND-306', token: null })
    expect(await invoke(IPC.charactersApplyImport, 'anahtar')).toEqual({ ok: false, code: 'DND-306', slots: [] })

    expect(fake.dialog.showSaveDialog).not.toHaveBeenCalled()
    expect(fake.dialog.showOpenDialog).not.toHaveBeenCalled()
    expect(logLines().filter((line) => line.includes('[DND-306]'))).toHaveLength(3)
  })

  it('ana menüden dosya pencerelerini o pencereye bağlı açar', async () => {
    windows.roleOf.mockReturnValue('menu')
    store.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Kenji' } })
    fake.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })
    fake.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    expect(await invoke(IPC.charactersExport)).toMatchObject({ ok: false, canceled: true, code: null })
    expect(await invoke(IPC.charactersPickImport)).toMatchObject({ ok: false, canceled: true, code: null })

    expect(fake.dialog.showSaveDialog).toHaveBeenCalledWith(fake.testing.win, expect.objectContaining({ title: 'Karakterleri dışa aktar' }))
    expect(fake.dialog.showOpenDialog).toHaveBeenCalledWith(fake.testing.win, expect.objectContaining({ title: 'Karakterleri içe aktar' }))
  })

  it('okunmuş dosya yokken uygulama ve vazgeçme isteği sorun çıkarmaz', async () => {
    windows.roleOf.mockReturnValue('menu')
    send(IPC.charactersCancelImport, 'anahtar')
    send(IPC.charactersCancelImport, undefined)
    expect(await invoke(IPC.charactersApplyImport, 'anahtar')).toEqual({ ok: false, code: 'DND-306', slots: [] })
    expect(store.getState().app.players.every((player) => player.name === '')).toBe(true)
  })
})

describe('oyun ve uygulama', () => {
  it('oyun başlat/bitir çağrılarını pencere yöneticisine iletir', async () => {
    await invoke(IPC.gameStart)
    await invoke(IPC.gameEnd)
    send(IPC.appToggleGameFullscreen)
    expect(windows.startGame).toHaveBeenCalledTimes(1)
    expect(windows.endGame).toHaveBeenCalledTimes(1)
    expect(windows.toggleGameFullscreen).toHaveBeenCalledTimes(1)
  })

  it('uygulama bilgisini ve monitör listesini döner', async () => {
    expect(await invoke(IPC.appGetInfo)).toEqual(info)
    expect(await invoke(IPC.appGetDisplays)).toEqual([
      { id: 11, label: '1: 2560x1440 (ana)', width: 2560, height: 1440, primary: true },
      { id: 22, label: '2: 1920x1080', width: 1920, height: 1080, primary: false }
    ])
  })

  it('klasör açma ve çıkış isteklerini yerine getirir', () => {
    send(IPC.appOpenDataFolder)
    send(IPC.appOpenLogFolder)
    send(IPC.appQuit)
    expect(fake.shell.openPath.mock.calls).toEqual([[paths.dataDir], [paths.logDir]])
    expect(fake.app.quit).toHaveBeenCalledTimes(1)
  })

  it('arayüzden gelen log satırını pencere rolüyle yazar', () => {
    send(IPC.log, 'HATA', 'DND-902', 'bileşen çöktü')
    send(IPC.log, 'ÇOK KÖTÜ', 'toString', 42)
    const lines = logLines()
    expect(lines[lines.length - 2]).toMatch(/ \[HATA\] \[DND-902\] \(control\) bileşen çöktü$/)
    expect(lines[lines.length - 1]).toMatch(/ \[BILGI\] \[-\] \(control\) 42$/)
  })
})
