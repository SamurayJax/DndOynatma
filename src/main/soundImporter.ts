/**
 * Seçilen ses ve video dosyalarını denetleyip `muzik/` klasörüne kopyalar.
 * Electron'a bağlı değildir; listeye ekleme işini çağıran yapar.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ErrorCode } from '@shared/errors'
import { extensionOf, isSupportedSoundName, isVideoName } from './fileNames'

/** Uzun bir müzik videosu büyük olabilir; dosya belleğe okunmadan kopyalanır. */
export const MAX_SOUND_BYTES = 2 * 1024 * 1024 * 1024

export interface CopiedSound {
  fileName: string
  /** Uzantısız özgün ad. */
  originalName: string
  /** Uzantısı görüntü taşıyabilen bir dosya (MP4). */
  hasVideo: boolean
}

export interface SkippedSound {
  /** Dosyanın uzantılı adı (yol değil). */
  name: string
  code: ErrorCode
  detail: string
}

export interface SoundCopyOutcome {
  copied: CopiedSound[]
  skipped: SkippedSound[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function copySoundsIntoFolder(soundsDir: string, filePaths: readonly string[]): Promise<SoundCopyOutcome> {
  const outcome: SoundCopyOutcome = { copied: [], skipped: [] }
  for (const filePath of filePaths) {
    const name = path.basename(filePath)
    const skip = (code: ErrorCode, detail: string): void => {
      outcome.skipped.push({ name, code, detail })
    }

    if (!isSupportedSoundName(name)) {
      skip('DND-501', `uzantı: ${path.extname(name) || '(yok)'}`)
      continue
    }

    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) {
        skip('DND-502', 'dosya değil')
        continue
      }
      if (stat.size > MAX_SOUND_BYTES) {
        skip('DND-504', `${(stat.size / (1024 * 1024)).toFixed(0)} MB`)
        continue
      }
    } catch (error) {
      skip('DND-502', `okunamadı (${errorMessage(error)})`)
      continue
    }

    const fileName = `${randomUUID()}.${extensionOf(name)}`
    try {
      // COPYFILE_EXCL: aynı adda dosya varsa üzerine yazmaz.
      await fs.promises.copyFile(filePath, path.join(soundsDir, fileName), fs.constants.COPYFILE_EXCL)
    } catch (error) {
      discardCopiedSound(soundsDir, fileName)
      skip('DND-502', `kopyalanamadı (${errorMessage(error)})`)
      continue
    }
    outcome.copied.push({ fileName, originalName: path.basename(name, path.extname(name)), hasVideo: isVideoName(name) })
  }
  return outcome
}

/** Listeye eklenemeyen kopyayı geri alır. Dosyayı az önce biz oluşturduk; kullanıcı verisi değildir. */
export function discardCopiedSound(soundsDir: string, fileName: string): void {
  try {
    fs.unlinkSync(path.join(soundsDir, fileName))
  } catch {
    // Kalan dosya zararsızdır.
  }
}
