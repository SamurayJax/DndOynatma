import { Mock, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Action, ReduceResult } from '@shared/actions'
import { ErrorCode } from '@shared/errors'
import { IPC } from '@shared/ipc'
import { reduce } from '@shared/reducer'
import { AppState, FullState, LibraryImage, createInitialSession } from '@shared/types'
import { log } from '../../src/main/logger'
import { Store } from '../../src/main/store'
import { makeTempDir, removeTempDir, sampleAppState } from './helpers'

// Store'un kendi davranışı sınanıyor; durum geçişleri (reducer) ayrı testlerde.
vi.mock('@shared/reducer', () => ({ reduce: vi.fn() }))
const reduceMock = vi.mocked(reduce)

let logDir: string

beforeAll(() => {
  logDir = makeTempDir()
  log.init(logDir)
})

afterAll(() => {
  log.close()
  removeTempDir(logDir)
})

interface Harness {
  store: Store
  initial: FullState
  writeSave: Mock<(app: AppState) => void>
  broadcast: Mock<(channel: string, payload: unknown) => void>
  report: Mock<(code: ErrorCode, detail?: string) => void>
  trashImage: Mock<(image: LibraryImage) => void>
  trashSound: Mock<(fileName: string) => void>
}

function createHarness(options: { saveEnabled?: boolean } = {}): Harness {
  const initial: FullState = { app: sampleAppState(), session: createInitialSession() }
  const writeSave = vi.fn<(app: AppState) => void>()
  const broadcast = vi.fn<(channel: string, payload: unknown) => void>()
  const report = vi.fn<(code: ErrorCode, detail?: string) => void>()
  const trashImage = vi.fn<(image: LibraryImage) => void>()
  const trashSound = vi.fn<(fileName: string) => void>()
  const store = new Store({
    initial,
    saveEnabled: options.saveEnabled ?? true,
    writeSave,
    broadcast,
    report,
    trashImage,
    trashSound,
    saveDelayMs: 300
  })
  return { store, initial, writeSave, broadcast, report, trashImage, trashSound }
}

/** reducer'ın bir sonraki çağrıda döndüreceği sonucu ayarlar. */
function nextResult(result: ReduceResult): void {
  reduceMock.mockReturnValueOnce(result)
}

const setHp: Action = { type: 'player/setHp', slot: 0, hp: 3 }

beforeEach(() => {
  vi.useFakeTimers()
  reduceMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Store.dispatch', () => {
  it('biçimi bozuk işlemi reducer çağırmadan reddeder (DND-306)', () => {
    const { store, report, broadcast } = createHarness()
    for (const bad of [null, undefined, 'player/setHp', 42, [], {}, { type: 7 }]) {
      expect(store.dispatch(bad)).toBe(false)
    }
    expect(reduceMock).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledTimes(7)
    expect(report.mock.calls.every(([code]) => code === 'DND-306')).toBe(true)
    expect(broadcast).not.toHaveBeenCalled()
  })

  it("arayüzden gelen library/add'i reddeder, ana süreçten geleni kabul eder", () => {
    const { store, initial, report } = createHarness()
    const add: Action = { type: 'library/add', images: [] }

    expect(store.dispatch(add)).toBe(false)
    expect(reduceMock).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith('DND-306', expect.any(String))

    nextResult({ state: initial })
    store.dispatch(add, { trusted: true })
    expect(reduceMock).toHaveBeenCalledWith(initial, add)
  })

  it('kalıcı durum değişince yayar ve kısa süre sonra kaydeder', () => {
    const { store, initial, broadcast, writeSave } = createHarness()
    const next: FullState = { app: { ...initial.app, generalNote: 'yeni' }, session: initial.session }
    nextResult({ state: next })

    expect(store.dispatch(setHp)).toBe(true)
    expect(store.getState()).toBe(next)
    expect(broadcast).toHaveBeenCalledWith(IPC.state, next)
    expect(writeSave).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(writeSave).toHaveBeenCalledTimes(1)
    expect(writeSave).toHaveBeenCalledWith(next.app)
  })

  it('yalnızca oturum değişince yayar ama kaydetmez', () => {
    const { store, initial, broadcast, writeSave } = createHarness()
    const next: FullState = { app: initial.app, session: { ...initial.session, tool: 'pen-red' } }
    nextResult({ state: next })

    expect(store.dispatch({ type: 'session/setTool', tool: 'pen-red' })).toBe(true)
    expect(broadcast).toHaveBeenCalledWith(IPC.state, next)
    vi.advanceTimersByTime(5000)
    expect(writeSave).not.toHaveBeenCalled()
  })

  it('durum değişmediyse yaymaz ve kaydetmez', () => {
    const { store, initial, broadcast, writeSave } = createHarness()
    nextResult({ state: initial })

    expect(store.dispatch(setHp)).toBe(false)
    expect(broadcast).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(writeSave).not.toHaveBeenCalled()
  })

  it('reducer bir durum bildirirse koduyla raporlar', () => {
    const { store, initial, report } = createHarness()
    nextResult({ state: initial, issue: { code: 'DND-301', detail: 'pencere: silinmis' } })
    store.dispatch({ type: 'scene/setActive', sceneId: 'silinmis' })
    expect(report).toHaveBeenCalledWith('DND-301', 'pencere: silinmis')
  })

  it('tuş devrinde (DND-303) pencere adlarını loga geçirmez', () => {
    const { store, initial, report } = createHarness()
    const next: FullState = { app: { ...initial.app, generalNote: 'değişti' }, session: initial.session }
    nextResult({
      state: next,
      issue: { code: 'DND-303', detail: '1 tuşu "Gizli Mahzen" penceresinden alındı, "Boss Odası" penceresine verildi.' }
    })
    store.dispatch({ type: 'scene/update', sceneId: 's2', patch: { hotkey: 1 } })

    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('DND-303', 'scene/update pencere=s2 alanlar=hotkey tuş=1')
  })

  it('reducer hata fırlatırsa durum bozulmaz ve DND-306 raporlanır', () => {
    const { store, initial, report, broadcast } = createHarness()
    reduceMock.mockImplementationOnce(() => {
      throw new TypeError('patch tanımsız')
    })

    expect(store.dispatch({ type: 'player/update', slot: 0 })).toBe(false)
    expect(store.getState()).toBe(initial)
    expect(broadcast).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0]).toBe('DND-306')
    expect(report.mock.calls[0][1]).toContain('patch tanımsız')
  })

  it('kütüphaneden çıkan görsellerin dosyasını çöpe gönderir', () => {
    const { store, initial, trashImage } = createHarness()
    const [background, npc, portrait] = initial.app.library
    nextResult({ state: { app: { ...initial.app, library: [background] }, session: initial.session } })

    store.dispatch({ type: 'library/remove', imageId: npc.id })

    expect(trashImage.mock.calls.map(([image]) => image.id)).toEqual([npc.id, portrait.id])
  })

  it('bölmesi değişen görselin dosyasına dokunmaz', () => {
    const { store, initial, trashImage } = createHarness()
    const library = initial.app.library.map((image) => (image.kind === 'npc' ? { ...image, kind: 'enemy' as const } : image))
    nextResult({ state: { app: { ...initial.app, library }, session: initial.session } })

    store.dispatch({ type: 'note/setGeneral', text: 'x' })
    expect(trashImage).not.toHaveBeenCalled()
  })

  it('kayıt kapalıyken ne kaydeder ne dosya siler', () => {
    const { store, initial, writeSave, trashImage, broadcast } = createHarness({ saveEnabled: false })
    const next: FullState = { app: { ...initial.app, library: [] }, session: initial.session }
    nextResult({ state: next })

    store.dispatch({ type: 'library/remove', imageId: 'img-npc' })
    vi.advanceTimersByTime(5000)

    expect(broadcast).toHaveBeenCalledWith(IPC.state, next)
    expect(writeSave).not.toHaveBeenCalled()
    expect(trashImage).not.toHaveBeenCalled()
    expect(store.flushSave()).toBe(true)
    expect(writeSave).not.toHaveBeenCalled()
  })

  it('abonelere önceki ve yeni durumu verir', () => {
    const { store, initial } = createHarness()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const next: FullState = { app: { ...initial.app, generalNote: 'a' }, session: initial.session }
    nextResult({ state: next })
    store.dispatch(setHp)
    expect(listener).toHaveBeenCalledWith(initial, next)

    unsubscribe()
    nextResult({ state: { app: { ...next.app, generalNote: 'b' }, session: next.session } })
    store.dispatch(setHp)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('Store kayıt', () => {
  function changeNote(harness: Harness, text: string): void {
    const current = harness.store.getState()
    nextResult({ state: { app: { ...current.app, generalNote: text }, session: current.session } })
    harness.store.dispatch({ type: 'note/setGeneral', text })
  }

  it('flushSave bekleyen kaydı hemen yazar', () => {
    const harness = createHarness()
    changeNote(harness, 'son söz')

    expect(harness.store.flushSave()).toBe(true)
    expect(harness.writeSave).toHaveBeenCalledTimes(1)
    expect(harness.writeSave.mock.calls[0][0].generalNote).toBe('son söz')

    vi.advanceTimersByTime(5000)
    expect(harness.writeSave).toHaveBeenCalledTimes(1)
  })

  it('art arda değişikliklerde en son durumu bir kez yazar', () => {
    const harness = createHarness()
    changeNote(harness, 'a')
    vi.advanceTimersByTime(100)
    changeNote(harness, 'ab')
    vi.advanceTimersByTime(100)
    changeNote(harness, 'abc')
    vi.advanceTimersByTime(300)

    expect(harness.writeSave).toHaveBeenCalledTimes(1)
    expect(harness.writeSave.mock.calls[0][0].generalNote).toBe('abc')
  })

  it('yazma hatasını arıza başına bir kez bildirir, durumu bellekte tutar ve yeniden dener', () => {
    const harness = createHarness()
    harness.writeSave.mockImplementation(() => {
      throw new Error('disk dolu')
    })

    changeNote(harness, 'bir')
    vi.advanceTimersByTime(300)
    changeNote(harness, 'iki')
    vi.advanceTimersByTime(300)

    expect(harness.writeSave).toHaveBeenCalledTimes(2)
    expect(harness.report).toHaveBeenCalledTimes(1)
    expect(harness.report.mock.calls[0][0]).toBe('DND-103')
    expect(harness.store.getState().app.generalNote).toBe('iki')
    expect(harness.store.flushSave()).toBe(false)

    harness.writeSave.mockImplementation(() => undefined)
    expect(harness.store.flushSave()).toBe(true)
    expect(harness.writeSave.mock.lastCall?.[0].generalNote).toBe('iki')

    // Düzeldikten sonraki yeni arıza yeniden bildirilir.
    harness.writeSave.mockImplementation(() => {
      throw new Error('yine dolu')
    })
    changeNote(harness, 'üç')
    vi.advanceTimersByTime(300)
    expect(harness.report).toHaveBeenCalledTimes(2)
  })
})

describe('Store.updateSession', () => {
  it('oturum değişikliğini yayar ama kaydetmez', () => {
    const { store, initial, broadcast, writeSave } = createHarness()
    store.updateSession((session) => ({ ...session, phase: 'playing' }))

    expect(store.getState().session.phase).toBe('playing')
    expect(store.getState().app).toBe(initial.app)
    expect(broadcast).toHaveBeenCalledWith(IPC.state, store.getState())
    vi.advanceTimersByTime(5000)
    expect(writeSave).not.toHaveBeenCalled()
  })

  it('aynı nesne dönerse hiçbir şey yaymaz', () => {
    const { store, broadcast } = createHarness()
    store.updateSession((session) => session)
    expect(broadcast).not.toHaveBeenCalled()
  })
})
