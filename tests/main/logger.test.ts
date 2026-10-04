import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Logger, formatLogLine, logFileName, pruneOldLogs } from '../../src/main/logger'
import { makeTempDir, removeTempDir } from './helpers'

let dir: string
let logger: Logger

beforeEach(() => {
  dir = makeTempDir()
  logger = new Logger()
})

afterEach(() => {
  logger.close()
  removeTempDir(dir)
})

function readLines(): string[] {
  return fs.readFileSync(logger.currentFile(), 'utf8').split('\n').filter((line) => line !== '')
}

describe('formatLogLine', () => {
  it('saat, seviye, kod ve iletiyi sabit biçimde yazar', () => {
    const date = new Date(2026, 9, 3, 9, 5, 7, 42)
    expect(formatLogLine(date, 'BILGI', null, 'Uygulama açıldı')).toBe('09:05:07.042 [BILGI] [-] Uygulama açıldı\n')
    expect(formatLogLine(date, 'HATA', 'DND-103', 'Kayıt yazılamadı')).toBe('09:05:07.042 [HATA] [DND-103] Kayıt yazılamadı\n')
  })

  it('çok satırlı iletinin devam satırlarını girintiler', () => {
    const line = formatLogLine(new Date(2026, 0, 1), 'HATA', 'DND-901', 'Error: x\r\n    at a\n    at b')
    expect(line).toBe('00:00:00.000 [HATA] [DND-901] Error: x\n        at a\n        at b\n')
  })
})

describe('Logger', () => {
  it('günün dosyasına satır ekler', () => {
    logger.init(path.join(dir, 'log'))
    logger.info('birinci')
    logger.info('ikinci')

    expect(path.basename(logger.currentFile())).toBe(logFileName(new Date()))
    expect(path.basename(logger.currentFile())).toMatch(/^dndoynatma-\d{4}-\d{2}-\d{2}\.log$/)
    const lines = readLines()
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \[BILGI\] \[-\] birinci$/)
    expect(lines[1]).toMatch(/ \[BILGI\] \[-\] ikinci$/)
  })

  it('kodlu satırda seviye ve başlık hata kodu tablosundan gelir', () => {
    logger.init(dir)
    logger.code('DND-101', 'kayit.json: yok')
    logger.code('DND-304')
    const lines = readLines()
    expect(lines[0]).toMatch(/ \[UYARI\] \[DND-101\] Kayıt dosyası okunamadı, yedekten açıldı — kayit\.json: yok$/)
    expect(lines[1]).toMatch(/ \[BILGI\] \[DND-304\] Oyun durumu uyuşmuyor$/)
  })

  it('hata satırına stack ekler', () => {
    logger.init(dir)
    logger.error('DND-901', new Error('patladı'), 'uncaughtException')
    const content = fs.readFileSync(logger.currentFile(), 'utf8')
    expect(content).toMatch(/\[HATA\] \[DND-901\] Beklenmeyen hata \(ana süreç\) — uncaughtException\n {4}Error: patladı\n {8}at /)
  })

  it('Error olmayan değerleri de yazar', () => {
    logger.init(dir)
    logger.error('DND-901', { neden: 'bilinmiyor' })
    logger.error('DND-901', 'düz metin')
    logger.error('DND-901', undefined)
    expect(readLines().length).toBeGreaterThanOrEqual(3)
  })

  it('var olan dosyanın sonuna ekler, üzerine yazmaz', () => {
    logger.init(dir)
    logger.info('önce')
    logger.close()
    const second = new Logger()
    second.init(dir)
    second.info('sonra')
    second.close()
    expect(readLines().map((line) => line.split('] ').pop())).toEqual(['önce', 'sonra'])
  })

  it('klasör açılamasa da hata fırlatmaz', () => {
    const blocker = path.join(dir, 'dosya')
    fs.writeFileSync(blocker, 'x')
    const original = { log: console.log, error: console.error }
    console.log = () => undefined
    console.error = () => undefined
    try {
      // Bir dosyanın altına klasör açılamaz.
      expect(() => logger.init(path.join(blocker, 'log'))).not.toThrow()
      expect(() => logger.info('yazılamaz')).not.toThrow()
      expect(() => logger.error('DND-901', new Error('x'))).not.toThrow()
      expect(logger.currentFile()).toBe('')
    } finally {
      console.log = original.log
      console.error = original.error
    }
  })

  it('başlatılmadan önce de hata fırlatmaz', () => {
    const original = console.log
    console.log = () => undefined
    try {
      expect(() => logger.info('erken')).not.toThrow()
    } finally {
      console.log = original
    }
  })
})

describe('pruneOldLogs', () => {
  it('30 günden eski log dosyalarını siler, diğerlerine dokunmaz', () => {
    const now = new Date(2026, 9, 3, 12, 0, 0)
    const names = [
      'dndoynatma-2026-10-03.log',
      'dndoynatma-2026-09-03.log',
      'dndoynatma-2026-09-02.log',
      'dndoynatma-2025-12-31.log',
      'dndoynatma-2020-01-01.log.eski',
      'baska-2020-01-01.log',
      'notlar.txt'
    ]
    for (const name of names) fs.writeFileSync(path.join(dir, name), 'x')

    const removed = pruneOldLogs(dir, now)

    expect(removed.sort()).toEqual(['dndoynatma-2025-12-31.log', 'dndoynatma-2026-09-02.log'])
    expect(fs.readdirSync(dir).sort()).toEqual([
      'baska-2020-01-01.log',
      'dndoynatma-2020-01-01.log.eski',
      'dndoynatma-2026-09-03.log',
      'dndoynatma-2026-10-03.log',
      'notlar.txt'
    ])
  })

  it('klasör yoksa sessizce boş döner', () => {
    expect(pruneOldLogs(path.join(dir, 'yok'))).toEqual([])
  })
})
