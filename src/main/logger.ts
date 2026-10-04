/**
 * Günlük log dosyası. Satırlar eşzamanlı yazılır; böylece çökmeden hemen önceki
 * satır da diskte olur. Log yazmak hiçbir koşulda hata fırlatmaz.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ERROR_CODES, ErrorCode, LogLevel } from '@shared/errors'

export const LOG_RETENTION_DAYS = 30

const LOG_FILE_PATTERN = /^dndoynatma-(\d{4})-(\d{2})-(\d{2})\.log$/
const MAX_MESSAGE_LENGTH = 8000

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function dayStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function logFileName(date: Date): string {
  return `dndoynatma-${dayStamp(date)}.log`
}

export function formatLogLine(date: Date, level: LogLevel, code: string | null, message: string): string {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  // Çok satırlı iletiler (stack) girintilenir; her kayıt saatle başlayan tek satırdan tanınır.
  const body = message.slice(0, MAX_MESSAGE_LENGTH).replace(/\r?\n/g, '\n    ')
  return `${time} [${level}] [${code ?? '-'}] ${body}\n`
}

/** Saklama süresini aşan log dosyalarını siler. Yalnızca kendi ad kalıbına uyanlara dokunur. */
export function pruneOldLogs(logDir: string, now: Date = new Date(), retentionDays = LOG_RETENTION_DAYS): string[] {
  const removed: string[] = []
  let names: string[]
  try {
    names = fs.readdirSync(logDir)
  } catch {
    return removed
  }
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - retentionDays).getTime()
  for (const name of names) {
    const match = LOG_FILE_PATTERN.exec(name)
    if (!match) continue
    const fileDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
    if (!(fileDay < cutoff)) continue
    try {
      fs.unlinkSync(path.join(logDir, name))
      removed.push(name)
    } catch {
      // Silinemeyen eski log önemli değil; bir sonraki açılışta yeniden denenir.
    }
  }
  return removed
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

export class Logger {
  private dir: string | null = null
  private fd: number | null = null
  private fdDay = ''
  private echo = false

  /** echo: satırları konsola da yazar (geliştirme için). */
  init(logDir: string, options: { echo?: boolean } = {}): void {
    this.close()
    this.echo = options.echo ?? false
    try {
      fs.mkdirSync(logDir, { recursive: true })
      this.dir = logDir
    } catch {
      this.dir = null
    }
  }

  info(message: string): void {
    this.write('BILGI', null, message)
  }

  /** Kodlu olay. Seviye ve başlık hata kodu tablosundan gelir. */
  code(code: ErrorCode, detail?: string): void {
    const info = ERROR_CODES[code]
    this.write(info.level, code, detail ? `${info.title} — ${detail}` : info.title)
  }

  /** Kodlu olay + hatanın ayrıntısı (stack dahil). */
  error(code: ErrorCode, error: unknown, detail?: string): void {
    const info = ERROR_CODES[code]
    const head = detail ? `${info.title} — ${detail}` : info.title
    this.write(info.level, code, `${head}\n${describeError(error)}`)
  }

  write(level: LogLevel, code: ErrorCode | null, message: string): void {
    try {
      const now = new Date()
      const line = formatLogLine(now, level, code, message)
      if (this.echo || this.dir === null) {
        const sink = level === 'HATA' ? console.error : console.log
        sink(line.trimEnd())
      }
      const fd = this.descriptorFor(now)
      if (fd !== null) fs.writeSync(fd, line)
    } catch {
      // Log yazılamıyorsa yapılacak bir şey yok; uygulama çalışmaya devam etmeli.
    }
  }

  /** Bugünün log dosyası. Klasör açılamadıysa boş metin. */
  currentFile(): string {
    return this.dir === null ? '' : path.join(this.dir, logFileName(new Date()))
  }

  close(): void {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd)
      } catch {
        // Kapanamayan tanıtıcı süreçle birlikte kapanır.
      }
    }
    this.fd = null
    this.fdDay = ''
  }

  /** Gece yarısı geçilince yeni günün dosyasına geçer. */
  private descriptorFor(now: Date): number | null {
    if (this.dir === null) return null
    const day = dayStamp(now)
    if (this.fd === null || this.fdDay !== day) {
      this.close()
      this.fd = fs.openSync(path.join(this.dir, logFileName(now)), 'a')
      this.fdDay = day
    }
    return this.fd
  }
}

export const log = new Logger()
