import path from 'node:path'
import { MEDIA_HOST, MEDIA_SCHEME } from '@shared/ipc'

/** Yüklenebilen uzantılar (noktasız, küçük harf). */
export const IMAGE_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp']

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}

export function extensionOf(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase()
}

export function isSupportedImageName(fileName: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(fileName))
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

/** `dnd-media://gorsel/<ad>` adresinden dosya adını çıkarır. Adres geçersiz ya da ad güvensizse null. */
export function mediaFileNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== MEDIA_HOST) return null
    const name = decodeURIComponent(parsed.pathname.slice(1))
    return isSafeFileName(name) ? name : null
  } catch {
    return null
  }
}
