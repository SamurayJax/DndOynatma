import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateStatus } from '@shared/ipc'
import { log } from '../../src/main/logger'
import { UpdateEngine, Updater } from '../../src/main/updater'
import { makeTempDir, removeTempDir } from './helpers'

interface Fake {
  engine: UpdateEngine
  finish: () => void
  fail: (error: Error) => void
  progress: (percent: number) => void
}

function fakeEngine(version: string | null | Error = '2.0.0'): Fake {
  let finish = (): void => {}
  let fail = (_error: Error): void => {}
  let progress = (_percent: number): void => {}
  const engine: UpdateEngine = {
    check: vi.fn(async () => {
      if (version instanceof Error) throw version
      return version
    }),
    download: vi.fn(
      (onProgress) =>
        new Promise<void>((resolve, reject) => {
          finish = resolve
          fail = reject
          progress = onProgress
        })
    ),
    cancelDownload: vi.fn(() => fail(new Error('cancelled'))),
    install: vi.fn()
  }
  return { engine, finish: () => finish(), fail: (error) => fail(error), progress: (percent) => progress(percent) }
}

function setup(fake: Fake, playing = false): { updater: Updater; published: UpdateStatus[] } {
  const published: UpdateStatus[] = []
  const updater = new Updater({ loadEngine: async () => fake.engine, publish: (_channel, status) => published.push(status), isPlaying: () => playing })
  return { updater, published }
}

let dir: string

beforeEach(() => {
  dir = makeTempDir()
  log.init(dir, { echo: false })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  log.close()
  removeTempDir(dir)
})

describe('denetim', () => {
  it('yeni sürüm varsa sorar, onaysız indirmez', async () => {
    const fake = fakeEngine()
    const { updater } = setup(fake)
    await updater.check()
    expect(updater.getStatus()).toEqual({ phase: 'available', version: '2.0.0' })
    expect(fake.engine.download).not.toHaveBeenCalled()
  })

  it('güncelse soru çıkmaz', async () => {
    const { updater, published } = setup(fakeEngine(null))
    await updater.check()
    expect(updater.getStatus()).toEqual({ phase: 'idle' })
    expect(published).toEqual([])
  })

  it('internet yoksa reddedilmez, kullanıcıya bir şey gösterilmez', async () => {
    const { updater, published } = setup(fakeEngine(new Error('net::ERR_INTERNET_DISCONNECTED')))
    await expect(updater.check()).resolves.toBeUndefined()
    expect(updater.getStatus()).toEqual({ phase: 'idle' })
    expect(published).toEqual([])
  })

  it('kütüphane yüklenemezse de açılış etkilenmez', async () => {
    const updater = new Updater({
      loadEngine: () => Promise.reject(new Error('yüklenemedi')),
      publish: () => {},
      isPlaying: () => false
    })
    await expect(updater.check()).resolves.toBeUndefined()
    expect(updater.getStatus()).toEqual({ phase: 'idle' })
  })
})

describe('onay', () => {
  it('"Şimdi değil": indirilmez, kurulmaz', async () => {
    const fake = fakeEngine()
    const { updater } = setup(fake)
    await updater.check()
    updater.decline()
    expect(updater.getStatus()).toEqual({ phase: 'idle' })
    expect(fake.engine.download).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.engine.install).not.toHaveBeenCalled()
  })

  it('onaylanınca iner, yüzde yayınlanır, doğrulanınca kurulur', async () => {
    const fake = fakeEngine()
    const { updater, published } = setup(fake)
    await updater.check()
    updater.accept()
    fake.progress(12.4)
    fake.progress(12.9)
    fake.progress(80)
    expect(updater.getStatus()).toEqual({ phase: 'downloading', version: '2.0.0', percent: 80 })
    expect(published.filter((status) => status.phase === 'downloading').map((status) => (status.phase === 'downloading' ? status.percent : -1))).toEqual([0, 12, 80])
    expect(fake.engine.install).not.toHaveBeenCalled()
    fake.finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(updater.getStatus()).toEqual({ phase: 'installing', version: '2.0.0' })
    expect(fake.engine.install).toHaveBeenCalledTimes(1)
  })

  it('yeni sürüm yokken onay bir şey yapmaz; çift tıklama iki kez indirmez', async () => {
    const fake = fakeEngine()
    const { updater } = setup(fake)
    updater.accept()
    expect(fake.engine.download).not.toHaveBeenCalled()
    await updater.check()
    updater.accept()
    updater.accept()
    expect(fake.engine.download).toHaveBeenCalledTimes(1)
  })

  it('oyun sürerken indirme ve kurulum başlamaz', async () => {
    const fake = fakeEngine()
    const { updater } = setup(fake, true)
    await updater.check()
    updater.accept()
    expect(fake.engine.download).not.toHaveBeenCalled()
    expect(updater.getStatus().phase).toBe('available')
  })
})

describe('sorunlar', () => {
  it('indirme ya da doğrulama başarısızsa kurulmaz, yeniden denenebilir', async () => {
    const fake = fakeEngine()
    const { updater } = setup(fake)
    await updater.check()
    updater.accept()
    fake.fail(new Error('sha512 checksum mismatch'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(updater.getStatus()).toEqual({ phase: 'failed', version: '2.0.0' })
    expect(fake.engine.install).not.toHaveBeenCalled()

    updater.accept()
    fake.finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fake.engine.install).toHaveBeenCalledTimes(1)
  })

  it('"Vazgeç": indirme iptal olur, hata sayılmaz, kurulmaz', async () => {
    const fake = fakeEngine()
    const { updater } = setup(fake)
    await updater.check()
    updater.accept()
    updater.decline()
    expect(fake.engine.cancelDownload).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(updater.getStatus()).toEqual({ phase: 'idle' })
    expect(fake.engine.install).not.toHaveBeenCalled()
  })

  it('kurulum başlatılamazsa sorun gösterilir', async () => {
    const fake = fakeEngine()
    vi.mocked(fake.engine.install).mockImplementation(() => {
      throw new Error('spawn hatası')
    })
    const { updater } = setup(fake)
    await updater.check()
    updater.accept()
    fake.finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(updater.getStatus()).toEqual({ phase: 'failed', version: '2.0.0' })
  })
})
