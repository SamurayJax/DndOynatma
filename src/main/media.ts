/**
 * `dnd-media://gorsel/<dosya>` protokolü: arayüz görselleri yalnızca `gorseller/` klasöründen okur.
 */
import { protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_SCHEME } from '@shared/ipc'
import { mediaFileNameFromUrl, mimeTypeFor } from './fileNames'
import { log } from './logger'

/** Uygulama hazır olmadan önce çağrılmalıdır. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      // corsEnabled: Konva görseli tuvale çizer; arayüz `crossOrigin` ile yüklerse tuval kirlenmez.
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

/** Uygulama hazır olduktan sonra çağrılır. */
export function handleMediaProtocol(imagesDir: string): void {
  // Aynı eksik dosya her çizimde yeniden istenir; log bir oturumda dosya başına bir kez yazılır.
  const reportedMissing = new Set<string>()

  protocol.handle(MEDIA_SCHEME, async (request) => {
    const fileName = mediaFileNameFromUrl(request.url)
    if (fileName === null) return new Response(null, { status: 400 })
    try {
      const data = await fs.promises.readFile(path.join(imagesDir, fileName))
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mimeTypeFor(fileName),
          'Content-Length': String(data.byteLength),
          // Dosya adları benzersizdir ve içerik hiç değişmez.
          'Cache-Control': 'max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (error) {
      if (!reportedMissing.has(fileName)) {
        reportedMissing.add(fileName)
        log.code('DND-203', `${fileName} (${(error as NodeJS.ErrnoException | null)?.code ?? 'okunamadı'})`)
      }
      return new Response(null, { status: 404 })
    }
  })
}
