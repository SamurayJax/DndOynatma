/**
 * Kayıt dosyaları: okuma, güvenli yazma, zar kaydı. Electron'a bağlı değildir;
 * yollar parametre olarak gelir, böylece geçici klasörlerde test edilebilir.
 */
import fs from 'node:fs'
import { AppState, DiceRoll, SCHEMA_VERSION, createInitialAppState } from '@shared/types'
import { normalizeAppState } from './normalize'

export const SAVE_DEBOUNCE_MS = 300
export const DICE_HISTORY_LIMIT = 50

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function parseJson(text: string): unknown {
  // Not Defteri gibi düzenleyiciler başa BOM ekleyebilir.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
}

// Windows'ta dosya başka bir süreçte açıkken (virüs tarayıcı, OneDrive, yedekleme) okuma ve
// üzerine taşıma EPERM / EBUSY / EACCES ile reddedilir; kilit çoğunlukla çok kısa sürer.
const LOCK_ERROR_CODES: readonly string[] = ['EPERM', 'EBUSY', 'EACCES']
/** Toplamı ana süreci en fazla çeyrek saniye kadar bekletir. */
export const LOCK_RETRY_DELAYS_MS: readonly number[] = [10, 20, 40, 80, 120]

function isLockError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' && LOCK_ERROR_CODES.includes(code)
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Kilit hatasında kısa aralıklarla yeniden dener; başka hatayı ya da son denemeyi olduğu gibi fırlatır. */
function withLockRetry<T>(operation: () => T): T {
  for (let attempt = 0; ; attempt++) {
    try {
      return operation()
    } catch (error) {
      if (attempt >= LOCK_RETRY_DELAYS_MS.length || !isLockError(error)) throw error
      sleepSync(LOCK_RETRY_DELAYS_MS[attempt])
    }
  }
}

// --- Kayıt okuma ---

export type LoadSource = 'main' | 'backup' | 'fresh' | 'reset'

export interface LoadResult {
  state: AppState
  /** main: kayit.json · backup: yedek · fresh: ilk açılış · reset: ikisi de okunamadı, boş başlandı */
  source: LoadSource
  code: 'DND-101' | 'DND-102' | 'DND-106' | null
  /** Log için ayrıntı. */
  detail: string
  /** true ise kayıt dosyasına hiçbir koşulda yazılmamalıdır. */
  saveDisabled: boolean
  /** `.bozuk-<zaman>` adıyla saklanan dosyaların yeni yolları. */
  quarantined: string[]
}

type ReadOutcome =
  | { kind: 'missing' }
  /** parsed: dosya okundu ama içeriği geçersiz (okuma hatası değil). */
  | { kind: 'broken'; reason: string; parsed: boolean }
  | { kind: 'newer'; schema: number; state: AppState }
  | { kind: 'ok'; state: AppState }

function readStateFile(file: string): ReadOutcome {
  let content: string
  try {
    content = withLockRetry(() => fs.readFileSync(file, 'utf8'))
  } catch (error) {
    if (isMissingFileError(error)) return { kind: 'missing' }
    return { kind: 'broken', reason: `okunamadı (${errorMessage(error)})`, parsed: false }
  }
  let raw: unknown
  try {
    raw = parseJson(content)
  } catch (error) {
    return { kind: 'broken', reason: `JSON çözülemedi (${errorMessage(error)})`, parsed: true }
  }
  const state = normalizeAppState(raw)
  if (!state) return { kind: 'broken', reason: 'içerik bir kayıt nesnesi değil', parsed: true }
  const schema = (raw as Record<string, unknown>).schema
  if (typeof schema === 'number' && schema > SCHEMA_VERSION) return { kind: 'newer', schema, state }
  return { kind: 'ok', state }
}

function timestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/** Bozuk dosyayı silmez; adına `.bozuk-<zaman>` ekler. Başarısız olursa null döner. */
function quarantine(file: string, now: Date): string | null {
  const base = `${file}.bozuk-${timestamp(now)}`
  try {
    let target = base
    for (let n = 2; fs.existsSync(target); n++) target = `${base}-${n}`
    fs.renameSync(file, target)
    return target
  } catch {
    return null
  }
}

function newerSchemaResult(fileLabel: string, outcome: { schema: number; state: AppState }): LoadResult {
  return {
    state: outcome.state,
    source: 'main',
    code: 'DND-106',
    detail: `${fileLabel} şema ${outcome.schema}, bu sürüm şema ${SCHEMA_VERSION}; kayıt yazma kapatıldı`,
    saveDisabled: true,
    quarantined: []
  }
}

export function loadAppState(saveFile: string, backupFile: string, now: Date = new Date()): LoadResult {
  const main = readStateFile(saveFile)
  if (main.kind === 'ok') {
    return { state: main.state, source: 'main', code: null, detail: '', saveDisabled: false, quarantined: [] }
  }
  if (main.kind === 'newer') return newerSchemaResult('kayit.json', main)

  const backup = readStateFile(backupFile)
  if (main.kind === 'missing' && backup.kind === 'missing') {
    return {
      state: createInitialAppState(),
      source: 'fresh',
      code: null,
      detail: '',
      saveDisabled: false,
      quarantined: []
    }
  }
  // Yedek daha yeni bir sürümdense üzerine yazılmaması için o da korunur.
  if (backup.kind === 'newer') return { ...newerSchemaResult('kayit.yedek.json', backup), source: 'backup' }

  const mainReason = main.kind === 'missing' ? 'yok' : main.reason
  const quarantined: string[] = []

  if (backup.kind === 'ok') {
    // Bir sonraki kayıt bozuk dosyanın üzerine yazacağı için önce kenara alınır. Yalnızca
    // içeriği bozuksa: okuma hatası geçici olabilir (dosya kilitli), sağlam dosya taşınmasın.
    if (main.kind === 'broken' && main.parsed) {
      const moved = quarantine(saveFile, now)
      if (moved) quarantined.push(moved)
    }
    return {
      state: backup.state,
      source: 'backup',
      code: 'DND-101',
      detail: `kayit.json: ${mainReason}`,
      saveDisabled: false,
      quarantined
    }
  }

  const backupReason = backup.kind === 'missing' ? 'yok' : backup.reason
  // Okunamayan ama kenara da alınamayan dosya (kilitli, izin yok) sağlam olabilir. Boş kayıt
  // onun üzerine yazılırsa kullanıcının bütün kaydı gider; bu oturumda kayıt yazılmaz.
  let stuck = false
  for (const [file, outcome] of [
    [saveFile, main],
    [backupFile, backup]
  ] as const) {
    if (outcome.kind !== 'broken') continue
    const moved = quarantine(file, now)
    if (moved) quarantined.push(moved)
    else if (fs.existsSync(file)) stuck = true
  }
  return {
    state: createInitialAppState(),
    source: 'reset',
    code: 'DND-102',
    detail:
      `kayit.json: ${mainReason}; kayit.yedek.json: ${backupReason}` +
      (stuck ? '; okunamayan dosya kenara alınamadı, üzerine yazmamak için kayıt yazma kapatıldı' : ''),
    saveDisabled: stuck,
    quarantined
  }
}

// --- Kayıt yazma ---

function isParseableStateFile(file: string): boolean {
  try {
    const raw = parseJson(fs.readFileSync(file, 'utf8'))
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
  } catch {
    return false
  }
}

export interface SaveOutcome {
  /** Yedek güncellenemediyse nedeni; kayit.json yine de yazılmıştır. Sorun yoksa null. */
  backupError: unknown
}

/**
 * Güvenli yazma: önce geçici dosyaya yazılıp diske indirilir, sonra asıl dosyanın yerine
 * konur. Yazma sırasında elektrik kesilse bile kayit.json ya eski ya yeni haliyle tamdır.
 * Hata olursa fırlatır; çağıran DND-103 olarak işler.
 */
export function saveAppState(saveFile: string, backupFile: string, state: AppState): SaveOutcome {
  const tempFile = `${saveFile}.tmp`
  const fd = withLockRetry(() => fs.openSync(tempFile, 'w'))
  try {
    fs.writeFileSync(fd, JSON.stringify(state, null, 2), 'utf8')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  // Yedek yalnızca sağlam kayıttan alınır; bozuk bir dosya iyi yedeğin üzerine yazılmaz.
  let backupError: unknown = null
  if (isParseableStateFile(saveFile)) {
    try {
      withLockRetry(() => fs.copyFileSync(saveFile, backupFile))
    } catch (error) {
      // Yedek kilitliyse eski (yine sağlam) haliyle kalır; yeni kaydın yazılmasını engellemez.
      backupError = error
    }
  }
  withLockRetry(() => fs.renameSync(tempFile, saveFile))
  return { backupError }
}

export const SAVE_RETRY_START_MS = 1000
export const SAVE_RETRY_MAX_MS = 60_000

export interface DebouncedSaverOptions {
  /** Kaydı yazar; başarısız olursa fırlatır. */
  write: () => void
  onError: (error: unknown) => void
  onSuccess?: () => void
  delayMs?: number
  /** Kesintisiz değişiklik akışında (sürükleme gibi) bile en geç bu kadar sonra yazılır. */
  maxWaitMs?: number
  /** Başarısız yazmadan sonraki ilk yeniden denemeye kadar geçen süre; her başarısızlıkta iki katına çıkar. */
  retryStartMs?: number
  retryMaxMs?: number
}

export interface DebouncedSaver {
  /** Bir değişiklik oldu; kısa süre sonra yaz. */
  schedule(): void
  /** Bekleyen değişiklik varsa hemen, eşzamanlı yazar. Yazılacak bir şey kalmadıysa true döner. */
  flush(): boolean
  /** Bekleyen zamanlayıcıyı (yeniden deneme dahil) iptal eder; yazılmamış değişiklik işareti kalır. */
  cancel(): void
  readonly dirty: boolean
}

export function createDebouncedSaver(options: DebouncedSaverOptions): DebouncedSaver {
  const delayMs = options.delayMs ?? SAVE_DEBOUNCE_MS
  const maxWaitMs = options.maxWaitMs ?? delayMs * 6
  const retryStartMs = options.retryStartMs ?? SAVE_RETRY_START_MS
  const retryMaxMs = options.retryMaxMs ?? SAVE_RETRY_MAX_MS
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstScheduledAt = 0
  let dirty = false
  let retryMs = 0

  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const flush = (): boolean => {
    cancel()
    if (!dirty) return true
    try {
      options.write()
    } catch (error) {
      options.onError(error)
      // dirty kalır. Yeni bir değişiklik beklenmez: son değişiklik yazılamadıysa ve arkasından
      // başka değişiklik gelmezse kayıt kapanışa kadar yalnızca bellekte kalırdı. Aralık giderek uzar.
      retryMs = retryMs === 0 ? retryStartMs : Math.min(retryMs * 2, retryMaxMs)
      firstScheduledAt = Date.now()
      timer = setTimeout(flush, retryMs)
      return false
    }
    dirty = false
    retryMs = 0
    options.onSuccess?.()
    return true
  }

  const schedule = (): void => {
    const now = Date.now()
    if (timer === null) firstScheduledAt = now
    else clearTimeout(timer)
    dirty = true
    const wait = Math.max(0, Math.min(delayMs, firstScheduledAt + maxWaitMs - now))
    timer = setTimeout(flush, wait)
  }

  return {
    schedule,
    flush,
    cancel,
    get dirty() {
      return dirty
    }
  }
}

// --- Zar kaydı ---

function isDiceRoll(value: unknown): value is DiceRoll {
  if (typeof value !== 'object' || value === null) return false
  const roll = value as Record<string, unknown>
  return (
    typeof roll.id === 'string' &&
    roll.id.length > 0 &&
    roll.sides === 20 &&
    Number.isInteger(roll.value) &&
    (roll.value as number) >= 1 &&
    (roll.value as number) <= 20 &&
    typeof roll.at === 'string'
  )
}

export interface DiceLoadResult {
  rolls: DiceRoll[]
  /** Dosya vardı ama okunamadıysa neden (DND-105). */
  error: string | null
}

export function loadDiceHistory(diceFile: string): DiceLoadResult {
  let content: string
  try {
    content = fs.readFileSync(diceFile, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return { rolls: [], error: null }
    return { rolls: [], error: `okunamadı (${errorMessage(error)})` }
  }
  if (content.trim() === '') return { rolls: [], error: null }
  let raw: unknown
  try {
    raw = parseJson(content)
  } catch (error) {
    return { rolls: [], error: `JSON çözülemedi (${errorMessage(error)})` }
  }
  if (!Array.isArray(raw)) return { rolls: [], error: 'içerik bir liste değil' }
  return {
    rolls: raw.filter(isDiceRoll).slice(0, DICE_HISTORY_LIMIT).map(({ id, value, at }) => ({ id, sides: 20, value, at })),
    error: null
  }
}

/** Hata olursa fırlatır; çağıran DND-105 olarak işler. */
export function writeDiceHistory(diceFile: string, rolls: readonly DiceRoll[]): void {
  fs.writeFileSync(diceFile, JSON.stringify(rolls.slice(0, DICE_HISTORY_LIMIT)), 'utf8')
}

/** Oyun normal bittiğinde çağrılır. Dosya hiç oluşmadıysa oluşturmaz. Hata olursa fırlatır. */
export function clearDiceHistory(diceFile: string): void {
  if (!fs.existsSync(diceFile)) return
  fs.writeFileSync(diceFile, '[]', 'utf8')
}
