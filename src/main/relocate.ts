/**
 * Kayıt klasörünü seçme ve taşıma: hem açılıştaki klasör sorusu hem de ayarlardaki
 * "Kayıt klasörünü değiştir" bu parçaları kullanır.
 */
import { BrowserWindow, OpenDialogOptions, dialog, shell } from 'electron'
import path from 'node:path'
import { ERROR_CODES, ErrorCode } from '@shared/errors'
import { StorageCheck, StorageResult } from '@shared/ipc'
import { canCreateIn, copyDataDir, detectCloud, hasSaveData, isInside, samePath, targetFor } from './location'
import { describeError, log } from './logger'

export function isUsablePath(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && path.isAbsolute(value)
}

/** Seçilen üst klasöre göre kaydın nereye, nasıl yerleşeceği. `currentDir`: şu an kullanılan klasör (varsa). */
export function checkParent(parent: string, currentDir: string | null): StorageCheck {
  const target = targetFor(parent)
  return {
    parent: path.resolve(parent),
    target,
    cloud: detectCloud(target),
    writable: canCreateIn(target),
    hasSave: hasSaveData(target),
    sameAsCurrent: currentDir !== null && samePath(target, currentDir)
  }
}

export async function pickParent(parentWindow: BrowserWindow | null, defaultPath: string): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Kayıt klasörünün açılacağı yeri seç',
    buttonLabel: 'Bu klasörü seç',
    defaultPath,
    properties: ['openDirectory', 'createDirectory']
  }
  const result = parentWindow ? await dialog.showOpenDialog(parentWindow, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

export function failure(code: ErrorCode, detail: string, target: string | null = null): StorageResult {
  log.code(code, detail)
  return { ok: false, code, message: ERROR_CODES[code].title, target }
}

export function success(target: string, message = ''): StorageResult {
  return { ok: true, code: null, message, target }
}

/**
 * `from` içindeki kaydı `to` klasörüne kopyalar ve doğrular. Kaynağa dokunmaz.
 * İç içe klasörler arasında taşıma yapılmaz (kopya kendi içine yazılırdı).
 */
export function copySave(from: string, to: string): { ok: true; files: number } | { ok: false; detail: string } {
  if (isInside(to, from) || isInside(from, to)) return { ok: false, detail: 'eski ve yeni klasör iç içe' }
  try {
    const report = copyDataDir(from, to)
    log.info(`Kayıt kopyalandı: ${report.files} dosya, ${report.bytes} bayt`)
    return { ok: true, files: report.files }
  } catch (error) {
    return { ok: false, detail: describeError(error) }
  }
}

/** Taşınan kaydın eski klasörünü Geri Dönüşüm Kutusu'na gönderir. Başarısızlık taşımayı geri almaz. */
export async function trashOldFolder(dir: string): Promise<boolean> {
  try {
    await shell.trashItem(dir)
    log.info('Eski kayıt klasörü Geri Dönüşüm Kutusu\'na taşındı')
    return true
  } catch (error) {
    log.code('DND-110', describeError(error))
    return false
  }
}
