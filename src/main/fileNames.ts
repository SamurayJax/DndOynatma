import path from 'node:path'
import { MEDIA_HOST, MEDIA_SCHEME, SOUND_HOST } from '@shared/ipc'

/** Yüklenebilen uzantılar (noktasız, küçük harf). */
export const IMAGE_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp']
/** Müzik ve ortam sesi olarak yüklenebilen uzantılar. */
export const SOUND_EXTENSIONS: readonly string[] = ['mp3', 'ogg', 'wav', 'm4a', 'mp4']
/** Görüntüsü de olabilen uzantılar; yüklerken "yalnızca ses mi, hareketli görüntü de mi" sorulur. */
export const VIDEO_EXTENSIONS: readonly string[] = ['mp4']

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4'
}

export function extensionOf(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase()
}

export function isSupportedImageName(fileName: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(fileName))
}

export function isSupportedSoundName(fileName: string): boolean {
  return SOUND_EXTENSIONS.includes(extensionOf(fileName))
}

export function isVideoName(fileName: string): boolean {
  return VIDEO_EXTENSIONS.includes(extensionOf(fileName))
}

export function mimeTypeFor(fileName: string): string {
  return MIME_BY_EXTENSION[extensionOf(fileName)] ?? 'application/octet-stream'
}

// Windows'ta dosya adında geçemeyen karakterler ve denetim karakterleri.
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/

/**
 * Ad yalnızca `gorseller/` içindeki bir dosyayı gösterebiliyorsa true.
 * Kayıt dosyası elle değiştirilmiş olsa bile klasörün dışına çıkılmasını engeller.
 */
export function isSafeFileName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  if (name.length === 0 || name.length > 200) return false
  if (name.includes('..') || name === '.') return false
  return !FORBIDDEN_NAME_CHARS.test(name)
}

export interface MediaTarget {
  /** gorsel: `gorseller/` · ses: `muzik/` */
  host: typeof MEDIA_HOST | typeof SOUND_HOST
  fileName: string
}

/** `dnd-media://gorsel/<ad>` ya da `dnd-media://ses/<ad>` adresini çözer. Adres geçersiz ya da ad güvensizse null. */
export function mediaTargetFromUrl(url: string): MediaTarget | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${MEDIA_SCHEME}:`) return null
    const host = parsed.hostname
    if (host !== MEDIA_HOST && host !== SOUND_HOST) return null
    const name = decodeURIComponent(parsed.pathname.slice(1))
    return isSafeFileName(name) ? { host, fileName: name } : null
  } catch {
    return null
  }
}

/** `dnd-media://gorsel/<ad>` adresinden dosya adını çıkarır. Adres geçersiz ya da ad güvensizse null. */
export function mediaFileNameFromUrl(url: string): string | null {
  const target = mediaTargetFromUrl(url)
  return target?.host === MEDIA_HOST ? target.fileName : null
}

export interface ByteRange {
  start: number
  /** Dahil. */
  end: number
}

/**
 * `Range: bytes=...` başlığını çözer (ses ve videoda ileri-geri sarma bununla yapılır). Yalnızca tek
 * aralık desteklenir. Başlık yoksa ya da anlaşılmıyorsa null (dosyanın tamamı gönderilir); aralık
 * dosyanın dışındaysa 'unsatisfiable'.
 */
export function parseRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (header === null) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return null
  if (match[1] === '') {
    // Son N bayt.
    const suffix = Number(match[2])
    if (suffix === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start >= size || end < start) return 'unsatisfiable'
  return { start, end }
}
