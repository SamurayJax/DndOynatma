/**
 * Seçilen görsel dosyalarını denetleyip `gorseller/` klasörüne kopyalar.
 * Electron'a bağlı değildir; kütüphaneye ekleme işini çağıran yapar.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ErrorCode } from '@shared/errors'
import { ImageKind, LibraryImage } from '@shared/types'
import { isSupportedImageName } from './fileNames'
import { ImageType, readImageSize } from './imageSize'

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024

const EXTENSION_BY_TYPE: Record<ImageType, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' }

export interface SkippedFile {
  /** Dosyanın uzantılı adı (yol değil). */
  name: string
  code: ErrorCode
  detail: string
}

export interface CopyOutcome {
  added: LibraryImage[]
  skipped: SkippedFile[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function copyImagesIntoLibrary(
  imagesDir: string,
  kind: ImageKind,
  filePaths: readonly string[]
): Promise<CopyOutcome> {
  const outcome: CopyOutcome = { added: [], skipped: [] }
  for (const filePath of filePaths) {
    const name = path.basename(filePath)
    const skip = (code: ErrorCode, detail: string): void => {
      outcome.skipped.push({ name, code, detail })
    }

    if (!isSupportedImageName(name)) {
      skip('DND-201', `uzantı: ${path.extname(name) || '(yok)'}`)
      continue
    }

    let data: Buffer
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) {
        skip('DND-202', 'dosya değil')
        continue
      }
      if (stat.size > MAX_IMAGE_BYTES) {
        skip('DND-206', `${(stat.size / (1024 * 1024)).toFixed(1)} MB`)
        continue
      }
      data = await fs.promises.readFile(filePath)
    } catch (error) {
      skip('DND-202', `okunamadı (${errorMessage(error)})`)
      continue
    }

    const size = readImageSize(data)
    if (!size) {
      skip('DND-204', 'başlık okunamadı')
      continue
    }

    // Uzantı dosyanın gerçek türünden gelir; adı .png olup içi JPEG olan dosya doğru türle sunulur.
    const fileName = `${randomUUID()}.${EXTENSION_BY_TYPE[size.type]}`
    try {
      // 'wx': aynı adda dosya varsa üzerine yazmaz.
      await fs.promises.writeFile(path.join(imagesDir, fileName), data, { flag: 'wx' })
    } catch (error) {
      skip('DND-202', `kopyalanamadı (${errorMessage(error)})`)
      continue
    }

    outcome.added.push({
      id: randomUUID(),
      kind,
      fileName,
      originalName: path.basename(name, path.extname(name)),
      width: size.width,
      height: size.height,
      addedAt: new Date().toISOString()
    })
  }
  return outcome
}

/** Kütüphaneye eklenemeyen kopyayı geri alır. Dosyayı az önce biz oluşturduk; kullanıcı verisi değildir. */
export function discardCopiedImage(imagesDir: string, fileName: string): void {
  try {
    fs.unlinkSync(path.join(imagesDir, fileName))
  } catch {
    // Kalan dosya zararsızdır.
  }
}
