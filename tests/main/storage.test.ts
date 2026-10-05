import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiceRoll, SCHEMA_VERSION, createInitialAppState } from '@shared/types'
import {
  DICE_HISTORY_LIMIT,
  LOCK_RETRY_DELAYS_MS,
  clearDiceHistory,
  createDebouncedSaver,
  loadAppState,
  loadDiceHistory,
  saveAppState,
  writeDiceHistory
} from '../../src/main/storage'
import { makeTempDir, removeTempDir, sampleAppState } from './helpers'

let dir: string
let saveFile: string
let backupFile: string
let diceFile: string

beforeEach(() => {
  dir = makeTempDir()
  saveFile = path.join(dir, 'kayit.json')
  backupFile = path.join(dir, 'kayit.yedek.json')
  diceFile = path.join(dir, 'zar.json')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  removeTempDir(dir)
})

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value), 'utf8')
}

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: deneme`), { code })
}

/**
 * Windows'ta başka bir sürecin açık tuttuğu dosyayı taklit eder: `target` üzerindeki işlem
 * ilk `times` çağrıda `code` ile reddedilir, sonrakiler gerçek dosya sistemine gider.
 */
function lockFile(method: 'readFileSync' | 'renameSync' | 'copyFileSync', target: string, code: string, times = Infinity) {
  const real = fs[method].bind(fs) as (...args: unknown[]) => unknown
  // readFileSync(dosya), renameSync(kaynak, hedef), copyFileSync(kaynak, hedef): kilitli olan hedeftir.
  const targetIndex = method === 'readFileSync' ? 0 : 1
  let failures = 0
  return vi.spyOn(fs, method).mockImplementation(((...args: unknown[]) => {
    if (args[targetIndex] === target && failures < times) {
      failures += 1
      throw fsError(code)
    }
    return real(...args)
  }) as never)
}

function quarantinedFiles(): string[] {
  return fs.readdirSync(dir).filter((name) => name.includes('.bozuk-')).sort()
}

describe('loadAppState', () => {
  it('hiç dosya yoksa kodsuz, boş kayıtla başlar', () => {
    const result = loadAppState(saveFile, backupFile)
    expect(result).toEqual({
      state: createInitialAppState(),
      source: 'fresh',
      code: null,
      detail: '',
      saveDisabled: false,
      quarantined: []
    })
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('sağlam kayit.json dosyasını yükler', () => {
    writeJson(saveFile, sampleAppState())
    const result = loadAppState(saveFile, backupFile)
    expect(result.source).toBe('main')
    expect(result.code).toBeNull()
    expect(result.saveDisabled).toBe(false)
    expect(result.state).toEqual(sampleAppState())
  })

  it('başında BOM olan kaydı da okur', () => {
    fs.writeFileSync(saveFile, '﻿' + JSON.stringify(sampleAppState()), 'utf8')
    expect(loadAppState(saveFile, backupFile).code).toBeNull()
  })

  it('okurken kaydı onarır', () => {
    writeJson(saveFile, { ...sampleAppState(), activeSceneId: 'silinmis', players: [] })
    const result = loadAppState(saveFile, backupFile)
    expect(result.code).toBeNull()
    expect(result.state.activeSceneId).toBeNull()
    expect(result.state.players).toHaveLength(4)
  })

  it('kayit.json bozuksa yedekten açar (DND-101) ve bozuk dosyayı saklar', () => {
    fs.writeFileSync(saveFile, '{"schema": 1, "players": [', 'utf8')
    writeJson(backupFile, sampleAppState())
    const result = loadAppState(saveFile, backupFile, new Date(2026, 9, 3, 14, 5, 9))

    expect(result.code).toBe('DND-101')
    expect(result.source).toBe('backup')
    expect(result.saveDisabled).toBe(false)
    expect(result.state).toEqual(sampleAppState())
    expect(quarantinedFiles()).toEqual(['kayit.json.bozuk-20261003-140509'])
    expect(result.quarantined).toEqual([path.join(dir, 'kayit.json.bozuk-20261003-140509')])
    expect(fs.readFileSync(result.quarantined[0], 'utf8')).toBe('{"schema": 1, "players": [')
    expect(fs.existsSync(saveFile)).toBe(false)
    expect(fs.existsSync(backupFile)).toBe(true)
  })

  it('kayit.json yoksa ama yedek varsa yedekten açar (DND-101)', () => {
    writeJson(backupFile, sampleAppState())
    const result = loadAppState(saveFile, backupFile)
    expect(result.code).toBe('DND-101')
    expect(result.state).toEqual(sampleAppState())
    expect(result.quarantined).toEqual([])
  })

  it('içeriği nesne olmayan kaydı bozuk sayar', () => {
    writeJson(saveFile, [1, 2, 3])
    writeJson(backupFile, sampleAppState())
    expect(loadAppState(saveFile, backupFile).code).toBe('DND-101')
  })

  it('boş (0 bayt) kaydı bozuk sayar', () => {
    fs.writeFileSync(saveFile, '')
    writeJson(backupFile, sampleAppState())
    expect(loadAppState(saveFile, backupFile).code).toBe('DND-101')
  })

  it('ikisi de bozuksa dosyaları silmeden yeniden adlandırır ve boş başlar (DND-102)', () => {
    fs.writeFileSync(saveFile, 'bozuk kayıt', 'utf8')
    fs.writeFileSync(backupFile, 'bozuk yedek', 'utf8')
    const result = loadAppState(saveFile, backupFile, new Date(2026, 0, 2, 3, 4, 5))

    expect(result.code).toBe('DND-102')
    expect(result.source).toBe('reset')
    expect(result.saveDisabled).toBe(false)
    expect(result.state).toEqual(createInitialAppState())
    expect(fs.readdirSync(dir).sort()).toEqual([
      'kayit.json.bozuk-20260102-030405',
      'kayit.yedek.json.bozuk-20260102-030405'
    ])
    expect(fs.readFileSync(path.join(dir, 'kayit.json.bozuk-20260102-030405'), 'utf8')).toBe('bozuk kayıt')
    expect(fs.readFileSync(path.join(dir, 'kayit.yedek.json.bozuk-20260102-030405'), 'utf8')).toBe('bozuk yedek')
    expect(result.quarantined).toHaveLength(2)
  })

  it('yalnızca bozuk bir yedek varsa onu saklar ve boş başlar (DND-102)', () => {
    fs.writeFileSync(backupFile, '???', 'utf8')
    const result = loadAppState(saveFile, backupFile, new Date(2026, 0, 2, 3, 4, 5))
    expect(result.code).toBe('DND-102')
    expect(fs.readdirSync(dir)).toEqual(['kayit.yedek.json.bozuk-20260102-030405'])
  })

  it('aynı saniyede ikinci kez saklanan dosyanın adı çakışmaz', () => {
    const now = new Date(2026, 0, 2, 3, 4, 5)
    fs.writeFileSync(saveFile, 'bir', 'utf8')
    loadAppState(saveFile, backupFile, now)
    fs.writeFileSync(saveFile, 'iki', 'utf8')
    loadAppState(saveFile, backupFile, now)
    expect(quarantinedFiles()).toEqual(['kayit.json.bozuk-20260102-030405', 'kayit.json.bozuk-20260102-030405-2'])
    expect(fs.readFileSync(path.join(dir, 'kayit.json.bozuk-20260102-030405'), 'utf8')).toBe('bir')
    expect(fs.readFileSync(path.join(dir, 'kayit.json.bozuk-20260102-030405-2'), 'utf8')).toBe('iki')
  })

  it('daha yeni şemalı kayıtta yazmayı kapatır ve dosyaya dokunmaz (DND-106)', () => {
    const newer = JSON.stringify({ ...sampleAppState(), schema: SCHEMA_VERSION + 1, yeniAlan: { a: 1 } })
    fs.writeFileSync(saveFile, newer, 'utf8')
    writeJson(backupFile, sampleAppState())
    const result = loadAppState(saveFile, backupFile)

    expect(result.code).toBe('DND-106')
    expect(result.saveDisabled).toBe(true)
    expect(result.quarantined).toEqual([])
    expect(fs.readFileSync(saveFile, 'utf8')).toBe(newer)
    expect(fs.readdirSync(dir).sort()).toEqual(['kayit.json', 'kayit.yedek.json'])
    // Kullanıcı verisini görebilsin diye okunabilen kısım yine de yüklenir.
    expect(result.state.scenes.map((scene) => scene.name)).toEqual(['Kraliyet İçi', 'Orman Yolu'])
  })

  it('kayıt bozuk, yedek daha yeni şemalıysa yine yazmayı kapatır (DND-106)', () => {
    fs.writeFileSync(saveFile, 'bozuk', 'utf8')
    writeJson(backupFile, { ...sampleAppState(), schema: SCHEMA_VERSION + 5 })
    const result = loadAppState(saveFile, backupFile)
    expect(result.code).toBe('DND-106')
    expect(result.saveDisabled).toBe(true)
    expect(fs.readdirSync(dir).sort()).toEqual(['kayit.json', 'kayit.yedek.json'])
  })

  it('kayit.json kısa süre kilitliyse yeniden okur; yedeğe düşmez', () => {
    writeJson(saveFile, { ...sampleAppState(), generalNote: 'asıl kayıt' })
    writeJson(backupFile, sampleAppState())
    const read = lockFile('readFileSync', saveFile, 'EBUSY', 2)
    const result = loadAppState(saveFile, backupFile)

    expect(result.source).toBe('main')
    expect(result.code).toBeNull()
    expect(result.state.generalNote).toBe('asıl kayıt')
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('kayit.json okunamıyorsa yedekten açar ve okunamayan dosyayı yerinde bırakır (DND-101)', () => {
    const main = JSON.stringify({ ...sampleAppState(), generalNote: 'asıl kayıt' })
    fs.writeFileSync(saveFile, main, 'utf8')
    writeJson(backupFile, sampleAppState())
    lockFile('readFileSync', saveFile, 'EBUSY')
    const result = loadAppState(saveFile, backupFile)
    vi.restoreAllMocks()

    expect(result.code).toBe('DND-101')
    expect(result.source).toBe('backup')
    expect(result.detail).toContain('okunamadı')
    expect(result.quarantined).toEqual([])
    // Kilitli dosya sağlam olabilir; bozuk diye kenara alınmaz.
    expect(fs.readFileSync(saveFile, 'utf8')).toBe(main)
  })

  it('okunamayan kayit.json kenara da alınamıyorsa üzerine yazmamak için kaydı kapatır (DND-102)', () => {
    const main = JSON.stringify(sampleAppState())
    fs.writeFileSync(saveFile, main, 'utf8')
    lockFile('readFileSync', saveFile, 'EBUSY')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw fsError('EPERM')
    })
    const result = loadAppState(saveFile, backupFile)
    vi.restoreAllMocks()

    expect(result.code).toBe('DND-102')
    expect(result.source).toBe('reset')
    expect(result.state).toEqual(createInitialAppState())
    expect(result.saveDisabled).toBe(true)
    expect(result.detail).toContain('kayıt yazma kapatıldı')
    expect(result.quarantined).toEqual([])
    expect(fs.readdirSync(dir)).toEqual(['kayit.json'])
    expect(fs.readFileSync(saveFile, 'utf8')).toBe(main)
  })

  it('okunamayan kayit.json kenara alınabiliyorsa saklanır ve kayıt açık kalır (DND-102)', () => {
    fs.writeFileSync(saveFile, JSON.stringify(sampleAppState()), 'utf8')
    lockFile('readFileSync', saveFile, 'EACCES')
    const result = loadAppState(saveFile, backupFile, new Date(2026, 0, 2, 3, 4, 5))

    expect(result.code).toBe('DND-102')
    expect(result.saveDisabled).toBe(false)
    expect(fs.readdirSync(dir)).toEqual(['kayit.json.bozuk-20260102-030405'])
  })
})

describe('saveAppState', () => {
  it('ilk kayıtta yalnızca kayit.json oluşur, geçici dosya kalmaz', () => {
    saveAppState(saveFile, backupFile, sampleAppState())
    expect(fs.readdirSync(dir)).toEqual(['kayit.json'])
    expect(JSON.parse(fs.readFileSync(saveFile, 'utf8'))).toEqual(sampleAppState())
  })

  it('ikinci kayıtta bir önceki sağlam kayıt yedeğe geçer', () => {
    const first = sampleAppState()
    const second = { ...sampleAppState(), generalNote: 'ikinci' }
    saveAppState(saveFile, backupFile, first)
    saveAppState(saveFile, backupFile, second)

    expect(fs.readdirSync(dir).sort()).toEqual(['kayit.json', 'kayit.yedek.json'])
    expect(JSON.parse(fs.readFileSync(saveFile, 'utf8'))).toEqual(second)
    expect(JSON.parse(fs.readFileSync(backupFile, 'utf8'))).toEqual(first)
  })

  it('yazdığı kayıt yeniden yüklenince aynı durumu verir', () => {
    saveAppState(saveFile, backupFile, sampleAppState())
    const result = loadAppState(saveFile, backupFile)
    expect(result.code).toBeNull()
    expect(result.state).toEqual(sampleAppState())
  })

  it('bozuk kayit.json sağlam yedeğin üzerine yazılmaz', () => {
    const good = sampleAppState()
    writeJson(backupFile, good)
    fs.writeFileSync(saveFile, 'yarım kalmış {', 'utf8')
    const next = { ...sampleAppState(), generalNote: 'yeni' }
    saveAppState(saveFile, backupFile, next)

    expect(JSON.parse(fs.readFileSync(backupFile, 'utf8'))).toEqual(good)
    expect(JSON.parse(fs.readFileSync(saveFile, 'utf8'))).toEqual(next)
  })

  it('yarıda kalmış eski geçici dosyanın üzerine yazar', () => {
    fs.writeFileSync(`${saveFile}.tmp`, 'önceki çökmeden kalan', 'utf8')
    saveAppState(saveFile, backupFile, sampleAppState())
    expect(fs.readdirSync(dir)).toEqual(['kayit.json'])
  })

  it('klasör yoksa hata fırlatır ve var olan dosyalara dokunmaz', () => {
    const missing = path.join(dir, 'yok', 'kayit.json')
    expect(() => saveAppState(missing, path.join(dir, 'yok', 'kayit.yedek.json'), sampleAppState())).toThrow()
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('kayit.json kısa süre kilitliyse yeniden dener ve yazar', () => {
    saveAppState(saveFile, backupFile, sampleAppState())
    const rename = lockFile('renameSync', saveFile, 'EPERM', 2)
    const next = { ...sampleAppState(), generalNote: 'kilit kalktı' }

    expect(saveAppState(saveFile, backupFile, next)).toEqual({ backupError: null })
    expect(rename).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fs.readFileSync(saveFile, 'utf8'))).toEqual(next)
    expect(fs.readdirSync(dir).sort()).toEqual(['kayit.json', 'kayit.yedek.json'])
  })

  it('kilit kalkmazsa hata fırlatır; eski kayıt olduğu gibi durur', () => {
    const first = sampleAppState()
    saveAppState(saveFile, backupFile, first)
    const rename = lockFile('renameSync', saveFile, 'EPERM')

    expect(() => saveAppState(saveFile, backupFile, { ...first, generalNote: 'yazılamadı' })).toThrow(/EPERM/)
    expect(rename).toHaveBeenCalledTimes(LOCK_RETRY_DELAYS_MS.length + 1)
    expect(JSON.parse(fs.readFileSync(saveFile, 'utf8'))).toEqual(first)
  })

  it('kilit dışındaki hatada yeniden denemez', () => {
    saveAppState(saveFile, backupFile, sampleAppState())
    const rename = lockFile('renameSync', saveFile, 'ENOSPC')

    expect(() => saveAppState(saveFile, backupFile, sampleAppState())).toThrow(/ENOSPC/)
    expect(rename).toHaveBeenCalledTimes(1)
  })

  it('yedek güncellenemese de kayit.json yazılır; yedek eski haliyle kalır', () => {
    const first = sampleAppState()
    const second = { ...first, generalNote: 'ikinci' }
    const third = { ...first, generalNote: 'üçüncü' }
    saveAppState(saveFile, backupFile, first)
    saveAppState(saveFile, backupFile, second)
    lockFile('copyFileSync', backupFile, 'EBUSY')

    const outcome = saveAppState(saveFile, backupFile, third)
    expect((outcome.backupError as NodeJS.ErrnoException).code).toBe('EBUSY')
    expect(JSON.parse(fs.readFileSync(saveFile, 'utf8'))).toEqual(third)
    expect(JSON.parse(fs.readFileSync(backupFile, 'utf8'))).toEqual(first)
  })
})

describe('createDebouncedSaver', () => {
  it('art arda değişiklikleri tek yazmada toplar', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const saver = createDebouncedSaver({ write, onError: vi.fn(), delayMs: 300 })

    saver.schedule()
    vi.advanceTimersByTime(200)
    saver.schedule()
    vi.advanceTimersByTime(299)
    expect(write).not.toHaveBeenCalled()
    expect(saver.dirty).toBe(true)

    vi.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(saver.dirty).toBe(false)

    vi.advanceTimersByTime(5000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('kesintisiz değişiklik akışında en geç maxWaitMs sonra yazar', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const saver = createDebouncedSaver({ write, onError: vi.fn(), delayMs: 300, maxWaitMs: 1000 })

    for (let elapsed = 0; elapsed < 900; elapsed += 100) {
      saver.schedule()
      vi.advanceTimersByTime(100)
    }
    expect(write).not.toHaveBeenCalled()
    saver.schedule()
    vi.advanceTimersByTime(100)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('flush bekleyen kaydı hemen yazar ve zamanlayıcıyı iptal eder', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const saver = createDebouncedSaver({ write, onError: vi.fn(), delayMs: 300 })

    expect(saver.flush()).toBe(true)
    expect(write).not.toHaveBeenCalled()

    saver.schedule()
    expect(saver.flush()).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('yazma başarısız olursa hatayı bildirir ve bir sonraki değişiklikte yeniden dener', () => {
    vi.useFakeTimers()
    const failure = new Error('disk dolu')
    const write = vi.fn<() => void>().mockImplementationOnce(() => {
      throw failure
    })
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const saver = createDebouncedSaver({ write, onError, onSuccess, delayMs: 300 })

    saver.schedule()
    vi.advanceTimersByTime(300)
    expect(onError).toHaveBeenCalledWith(failure)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(saver.dirty).toBe(true)

    // Yeniden deneme zamanlayıcısını beklemeden: yeni değişiklik her zamanki gecikmeyle yazılır.
    saver.schedule()
    vi.advanceTimersByTime(299)
    expect(write).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(saver.dirty).toBe(false)

    vi.advanceTimersByTime(120_000)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('başarısız yazmayı yeni değişiklik beklemeden, uzayan aralıklarla yeniden dener', () => {
    vi.useFakeTimers()
    let failing = true
    const write = vi.fn<() => void>().mockImplementation(() => {
      if (failing) throw new Error('kilitli')
    })
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const saver = createDebouncedSaver({ write, onError, onSuccess, delayMs: 300, retryStartMs: 1000, retryMaxMs: 3000 })

    saver.schedule()
    vi.advanceTimersByTime(300)
    expect(write).toHaveBeenCalledTimes(1)

    // 1 sn, 2 sn, sonra üst sınır olan 3 sn arayla.
    vi.advanceTimersByTime(999)
    expect(write).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2000)
    expect(write).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(2999)
    expect(write).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledTimes(4)
    expect(onError).toHaveBeenCalledTimes(4)
    expect(saver.dirty).toBe(true)

    failing = false
    vi.advanceTimersByTime(3000)
    expect(write).toHaveBeenCalledTimes(5)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(saver.dirty).toBe(false)

    // Başarıdan sonra zamanlayıcı kalmaz; bir sonraki arıza yine kısa aralıkla başlar.
    vi.advanceTimersByTime(120_000)
    expect(write).toHaveBeenCalledTimes(5)
    failing = true
    saver.schedule()
    vi.advanceTimersByTime(300)
    vi.advanceTimersByTime(1000)
    expect(write).toHaveBeenCalledTimes(7)
  })

  it('cancel bekleyen yeniden denemeyi de durdurur', () => {
    vi.useFakeTimers()
    const write = vi.fn<() => void>().mockImplementation(() => {
      throw new Error('kilitli')
    })
    const saver = createDebouncedSaver({ write, onError: vi.fn(), delayMs: 300 })

    saver.schedule()
    vi.advanceTimersByTime(300)
    saver.cancel()
    vi.advanceTimersByTime(120_000)
    expect(write).toHaveBeenCalledTimes(1)
    expect(saver.dirty).toBe(true)
  })

  it('başarısız kayıttan sonra flush yeniden dener', () => {
    vi.useFakeTimers()
    const write = vi.fn<() => void>().mockImplementationOnce(() => {
      throw new Error('kilitli')
    })
    const saver = createDebouncedSaver({ write, onError: vi.fn(), delayMs: 300 })

    saver.schedule()
    expect(saver.flush()).toBe(false)
    expect(saver.flush()).toBe(true)
    expect(write).toHaveBeenCalledTimes(2)
    // Başarılı flush, başarısız denemenin kurduğu yeniden deneme zamanlayıcısını da kaldırır.
    vi.advanceTimersByTime(120_000)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('gerçek dosyaya yazıp yedek üretir', () => {
    vi.useFakeTimers()
    let state = sampleAppState()
    const onError = vi.fn()
    const saver = createDebouncedSaver({ write: () => saveAppState(saveFile, backupFile, state), onError, delayMs: 300 })

    saver.schedule()
    vi.advanceTimersByTime(300)
    state = { ...state, generalNote: 'değişti' }
    saver.schedule()
    saver.flush()

    expect(onError).not.toHaveBeenCalled()
    expect(JSON.parse(fs.readFileSync(saveFile, 'utf8')).generalNote).toBe('değişti')
    expect(JSON.parse(fs.readFileSync(backupFile, 'utf8')).generalNote).toBe('Genel not')
  })
})

describe('zar kaydı', () => {
  const rolls: DiceRoll[] = [
    { id: 'r3', sides: 20, value: 20, at: '2026-10-03T19:02:00.000Z' },
    { id: 'r2', sides: 20, value: 1, at: '2026-10-03T19:01:00.000Z' },
    { id: 'r1', sides: 20, value: 13, at: '2026-10-03T19:00:00.000Z' }
  ]
  const mixedDice: DiceRoll[] = [
    { id: 'm3', sides: 4, value: 4, at: '2026-10-05T19:02:00.000Z' },
    { id: 'm2', sides: 10, value: 10, at: '2026-10-05T19:01:00.000Z' },
    { id: 'm1', sides: 20, value: 7, at: '2026-10-05T19:00:00.000Z' }
  ]

  it('dosya yoksa boş geçmiş döner, hata yok', () => {
    expect(loadDiceHistory(diceFile)).toEqual({ rolls: [], error: null })
  })

  it('yazılan geçmiş aynı sırayla geri okunur', () => {
    writeDiceHistory(diceFile, rolls)
    expect(loadDiceHistory(diceFile)).toEqual({ rolls, error: null })
  })

  it('d4 ve d10 atışları zar türüyle birlikte geri okunur', () => {
    writeDiceHistory(diceFile, mixedDice)
    expect(loadDiceHistory(diceFile)).toEqual({ rolls: mixedDice, error: null })
  })

  it('temizlenince geçmiş boşalır ama dosya silinmez', () => {
    writeDiceHistory(diceFile, rolls)
    clearDiceHistory(diceFile)
    expect(fs.readFileSync(diceFile, 'utf8')).toBe('[]')
    expect(loadDiceHistory(diceFile)).toEqual({ rolls: [], error: null })
  })

  it('hiç oluşmamış dosyayı temizlemek dosya oluşturmaz', () => {
    clearDiceHistory(diceFile)
    expect(fs.existsSync(diceFile)).toBe(false)
  })

  it('boş dosyayı hata saymaz', () => {
    fs.writeFileSync(diceFile, '  \n', 'utf8')
    expect(loadDiceHistory(diceFile)).toEqual({ rolls: [], error: null })
  })

  it('bozuk dosyada hata nedeni döner', () => {
    fs.writeFileSync(diceFile, '[{"id": "r1", ', 'utf8')
    const broken = loadDiceHistory(diceFile)
    expect(broken.rolls).toEqual([])
    expect(broken.error).toContain('JSON')

    fs.writeFileSync(diceFile, '{"rolls": []}', 'utf8')
    expect(loadDiceHistory(diceFile).error).not.toBeNull()
  })

  it('geçersiz atışları atar', () => {
    const mixed = [
      rolls[0],
      { id: 'x', sides: 6, value: 3, at: 'a' },
      { id: 'x4', sides: 4, value: 5, at: 'a' },
      // Eski sürümün d3 atışı: o zar artık yok.
      { id: 'x3', sides: 3, value: 2, at: 'a' },
      { id: 'x10', sides: 10, value: 11, at: 'a' },
      { id: 'x0', sides: 10, value: 0, at: 'a' },
      { id: 'xs', sides: '20', value: 5, at: 'a' },
      { id: 'y', sides: 20, value: 21, at: 'a' },
      { id: 'z', sides: 20, value: 0, at: 'a' },
      { id: '', sides: 20, value: 5, at: 'a' },
      { id: 'w', sides: 20, value: 5.5, at: 'a' },
      { id: 'v', sides: 20, value: 5 },
      null,
      rolls[1]
    ]
    fs.writeFileSync(diceFile, JSON.stringify(mixed), 'utf8')
    expect(loadDiceHistory(diceFile)).toEqual({ rolls: [rolls[0], rolls[1]], error: null })
  })

  it('geçmişi en yeni 50 atışla sınırlar', () => {
    const many: DiceRoll[] = Array.from({ length: 70 }, (_, index) => ({
      id: `r${index}`,
      sides: 20,
      value: (index % 20) + 1,
      at: '2026-10-03T19:00:00.000Z'
    }))
    writeDiceHistory(diceFile, many)
    const loaded = loadDiceHistory(diceFile).rolls
    expect(loaded).toHaveLength(DICE_HISTORY_LIMIT)
    expect(loaded[0].id).toBe('r0')
    expect(loaded[49].id).toBe('r49')
  })

  it('klasör yoksa yazma hata fırlatır', () => {
    expect(() => writeDiceHistory(path.join(dir, 'yok', 'zar.json'), rolls)).toThrow()
  })
})
