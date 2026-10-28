/**
 * `dnd-media://` protokolü: arayüz görselleri yalnızca `gorseller/`, sesleri yalnızca `muzik/`
 * klasöründen okur. Sesler ve videolar parça parça (Range) gönderilir: ileri-geri sarma bununla
 * çalışır ve büyük bir MP4 belleğe bütün olarak okunmaz.
 */
import { protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { MEDIA_HOST, MEDIA_SCHEME } from '@shared/ipc'
import { mediaTargetFromUrl, mimeTypeFor, parseRange } from './fileNames'
import { log } from './logger'

/** Uygulama hazır olmadan önce çağrılmalıdır. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      // corsEnabled: Konva görseli tuvale çizer; arayüz `crossOrigin` ile yüklerse tuval kirlenmez.
      // stream: <audio> ve <video> yanıtı baştan sona beklemeden çalmaya başlar.
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

/** Uygulama hazır olduktan sonra çağrılır. */
export function handleMediaProtocol(imagesDir: string, soundsDir: string): void {
  // Aynı eksik dosya her çizimde yeniden istenir; log bir oturumda dosya başına bir kez yazılır.
  const reportedMissing = new Set<string>()
  const reportMissing = (code: 'DND-203' | 'DND-503', fileName: string, error: unknown): void => {
    if (reportedMissing.has(fileName)) return
    reportedMissing.add(fileName)
    log.code(code, `${fileName} (${(error as NodeJS.ErrnoException | null)?.code ?? 'okunamadı'})`)
  }

  protocol.handle(MEDIA_SCHEME, async (request) => {
    const target = mediaTargetFromUrl(request.url)
    if (target === null) return new Response(null, { status: 400 })
    const { fileName } = target

    if (target.host === MEDIA_HOST) {
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
        reportMissing('DND-203', fileName, error)
        return new Response(null, { status: 404 })
      }
    }

    const file = path.join(soundsDir, fileName)
    let size: number
    try {
      size = (await fs.promises.stat(file)).size
    } catch (error) {
      // Kullanıcıya bildirimi oyun ekranı verir (çalınamayan parça); burada yalnızca log.
      reportMissing('DND-503', fileName, error)
      return new Response(null, { status: 404 })
    }

    const headers: Record<string, string> = {
      'Content-Type': mimeTypeFor(fileName),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    }
    const range = parseRange(request.headers.get('Range'), size)
    if (range === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    }
    const start = range?.start ?? 0
    const end = range?.end ?? size - 1
    const length = size === 0 ? 0 : end - start + 1
    const body = length === 0 ? null : (Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream<Uint8Array>)
    return new Response(body, {
      status: range === null ? 200 : 206,
      headers: {
        ...headers,
        'Content-Length': String(length),
        ...(range === null ? {} : { 'Content-Range': `bytes ${start}-${end}/${size}` })
      }
    })
  })
}
