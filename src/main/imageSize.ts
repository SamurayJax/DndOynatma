/**
 * Görsel başlığından boyut okur. `nativeImage` WebP'yi güvenilir çözmediği için
 * boyutlar dosyanın ilk baytlarından elle çıkarılır.
 */

export type ImageType = 'png' | 'jpeg' | 'webp'

export interface ImageSize {
  width: number
  height: number
  type: ImageType
}

export function readImageSize(buffer: Buffer): ImageSize | null {
  try {
    if (isPng(buffer)) return readPng(buffer)
    if (isJpeg(buffer)) return readJpeg(buffer)
    if (isWebp(buffer)) return readWebp(buffer)
    return null
  } catch {
    // Kesik ya da bozuk başlıkta sınır dışı okuma olabilir; "okunamadı" sayılır.
    return null
  }
}

function sized(width: number, height: number, type: ImageType): ImageSize | null {
  return width > 0 && height > 0 ? { width, height, type } : null
}

// --- PNG ---

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)
}

function readPng(buffer: Buffer): ImageSize | null {
  if (buffer.length < 24 || buffer.toString('latin1', 12, 16) !== 'IHDR') return null
  return sized(buffer.readUInt32BE(16), buffer.readUInt32BE(20), 'png')
}

// --- JPEG ---

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8
}

/** SOF0..SOF15; DHT (C4), JPG (C8) ve DAC (CC) aynı aralıkta ama çerçeve başlığı değildir. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function readJpeg(buffer: Buffer): ImageSize | null {
  let offset = 2
  let orientation = 1
  while (offset + 2 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null
    const marker = buffer[offset + 1]
    if (marker === 0xff) {
      // Dolgu baytı: işaretçiden önce birden fazla FF olabilir.
      offset += 1
      continue
    }
    offset += 2
    // Uzunluk alanı olmayan işaretçiler.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    // Tarama verisi ya da dosya sonu: çerçeve başlığı bulunamadı.
    if (marker === 0xda || marker === 0xd9) return null
    if (offset + 2 > buffer.length) return null
    const length = buffer.readUInt16BE(offset)
    if (length < 2) return null
    if (isStartOfFrame(marker)) {
      if (offset + 7 > buffer.length) return null
      const height = buffer.readUInt16BE(offset + 3)
      const width = buffer.readUInt16BE(offset + 5)
      // Tarayıcı EXIF yönünü uygular; 5-8 arası yönlerde görsel 90° döndüğü için
      // ekranda görünen en ve boy yer değiştirir.
      return orientation >= 5 && orientation <= 8 ? sized(height, width, 'jpeg') : sized(width, height, 'jpeg')
    }
    if (marker === 0xe1) {
      orientation = readExifOrientation(buffer, offset + 2, Math.min(offset + length, buffer.length)) ?? orientation
    }
    offset += length
  }
  return null
}

function readExifOrientation(buffer: Buffer, start: number, end: number): number | null {
  if (end - start < 14 || buffer.toString('latin1', start, start + 6) !== 'Exif\0\0') return null
  const tiff = start + 6
  const byteOrder = buffer.toString('latin1', tiff, tiff + 2)
  if (byteOrder !== 'II' && byteOrder !== 'MM') return null
  const little = byteOrder === 'II'
  const u16 = (at: number): number => (little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at))
  const u32 = (at: number): number => (little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at))
  if (u16(tiff + 2) !== 42) return null
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return null
  const count = u16(ifd)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return null
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

// --- WebP ---

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 16 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  )
}

function readWebp(buffer: Buffer): ImageSize | null {
  const chunk = buffer.toString('latin1', 12, 16)
  if (chunk === 'VP8 ') {
    // Kayıplı: 3 baytlık çerçeve etiketi, 9D 01 2A başlangıç kodu, sonra 14'er bitlik en ve boy.
    if (buffer.length < 30) return null
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null
    return sized(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff, 'webp')
  }
  if (chunk === 'VP8L') {
    // Kayıpsız: 2F imza baytı, sonra 14 bit (en - 1) ve 14 bit (boy - 1).
    if (buffer.length < 25 || buffer[20] !== 0x2f) return null
    const bits = buffer.readUInt32LE(21)
    return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 'webp')
  }
  if (chunk === 'VP8X') {
    // Genişletilmiş: 24'er bitlik (tuval eni - 1) ve (tuval boyu - 1).
    if (buffer.length < 30) return null
    return sized(buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1, 'webp')
  }
  return null
}
