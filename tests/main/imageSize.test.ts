import { describe, expect, it } from 'vitest'
import { readImageSize } from '../../src/main/imageSize'
import {
  JFIF_SEGMENT,
  jpegBytes,
  jpegExif,
  jpegFrame,
  jpegSegment,
  pngBytes,
  webpExtendedBytes,
  webpLosslessBytes,
  webpLossyBytes
} from './helpers'

describe('readImageSize', () => {
  it('PNG boyutunu IHDR parçasından okur', () => {
    expect(readImageSize(pngBytes(2560, 1440))).toEqual({ width: 2560, height: 1440, type: 'png' })
  })

  it('IHDR ile başlamayan ya da kesik PNG için null döner', () => {
    const broken = pngBytes(100, 100)
    broken.write('IDAT', 12, 'latin1')
    expect(readImageSize(broken)).toBeNull()
    expect(readImageSize(pngBytes(100, 100).subarray(0, 20))).toBeNull()
  })

  it('JPEG boyutunu SOF0 başlığından okur', () => {
    const jpeg = jpegBytes(JFIF_SEGMENT, jpegFrame(0xc0, 1920, 1080))
    expect(readImageSize(jpeg)).toEqual({ width: 1920, height: 1080, type: 'jpeg' })
  })

  it('aşamalı JPEG (SOF2) boyutunu okur', () => {
    const jpeg = jpegBytes(JFIF_SEGMENT, jpegFrame(0xc2, 800, 1200))
    expect(readImageSize(jpeg)).toEqual({ width: 800, height: 1200, type: 'jpeg' })
  })

  it('DHT (C4) parçasını çerçeve başlığı sanmaz ve dolgu baytlarını atlar', () => {
    const huffman = jpegSegment(0xc4, Buffer.from([0x08, 0x03, 0xe7, 0x03, 0xe7, 0x03, 0x00, 0x00]))
    const padding = Buffer.from([0xff, 0xff])
    const jpeg = jpegBytes(JFIF_SEGMENT, huffman, padding, jpegFrame(0xc0, 640, 480))
    expect(readImageSize(jpeg)).toEqual({ width: 640, height: 480, type: 'jpeg' })
  })

  it('EXIF yönü 90° döndürüyorsa en ve boyu yer değiştirir', () => {
    for (const littleEndian of [true, false]) {
      const rotated = jpegBytes(jpegExif(6, littleEndian), jpegFrame(0xc0, 4000, 3000))
      expect(readImageSize(rotated)).toEqual({ width: 3000, height: 4000, type: 'jpeg' })
      const upright = jpegBytes(jpegExif(3, littleEndian), jpegFrame(0xc0, 4000, 3000))
      expect(readImageSize(upright)).toEqual({ width: 4000, height: 3000, type: 'jpeg' })
    }
  })

  it('çerçeve başlığı olmayan ya da kesik JPEG için null döner', () => {
    expect(readImageSize(jpegBytes(JFIF_SEGMENT))).toBeNull()
    const full = jpegBytes(JFIF_SEGMENT, jpegFrame(0xc0, 640, 480))
    expect(readImageSize(full.subarray(0, 2 + JFIF_SEGMENT.length + 6))).toBeNull()
    expect(readImageSize(Buffer.from([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]))).toBeNull()
  })

  it('kayıplı WebP (VP8) boyutunu okur', () => {
    expect(readImageSize(webpLossyBytes(1280, 720))).toEqual({ width: 1280, height: 720, type: 'webp' })
  })

  it('kayıpsız WebP (VP8L) boyutunu okur', () => {
    expect(readImageSize(webpLosslessBytes(1, 1))).toEqual({ width: 1, height: 1, type: 'webp' })
    expect(readImageSize(webpLosslessBytes(1920, 1080))).toEqual({ width: 1920, height: 1080, type: 'webp' })
    expect(readImageSize(webpLosslessBytes(16384, 16384))).toEqual({ width: 16384, height: 16384, type: 'webp' })
  })

  it('genişletilmiş WebP (VP8X) tuval boyutunu okur', () => {
    expect(readImageSize(webpExtendedBytes(3840, 2160))).toEqual({ width: 3840, height: 2160, type: 'webp' })
    expect(readImageSize(webpExtendedBytes(70000, 300))).toEqual({ width: 70000, height: 300, type: 'webp' })
  })

  it('bozuk WebP için null döner', () => {
    const wrongStartCode = webpLossyBytes(100, 100)
    wrongStartCode[23] = 0x00
    expect(readImageSize(wrongStartCode)).toBeNull()
    const wrongSignature = webpLosslessBytes(100, 100)
    wrongSignature[20] = 0x00
    expect(readImageSize(wrongSignature)).toBeNull()
    expect(readImageSize(webpExtendedBytes(100, 100).subarray(0, 26))).toBeNull()
    const unknownChunk = webpLossyBytes(100, 100)
    unknownChunk.write('ABCD', 12, 'latin1')
    expect(readImageSize(unknownChunk)).toBeNull()
  })

  it('tanınmayan ya da boş içerik için null döner', () => {
    expect(readImageSize(Buffer.alloc(0))).toBeNull()
    expect(readImageSize(Buffer.from('GIF89a' + '\0'.repeat(30), 'latin1'))).toBeNull()
    expect(readImageSize(Buffer.from('merhaba dünya, bu bir görsel değil', 'utf8'))).toBeNull()
  })

  it('sıfır boyutlu görseli geçersiz sayar', () => {
    expect(readImageSize(pngBytes(0, 100))).toBeNull()
    expect(readImageSize(jpegBytes(jpegFrame(0xc0, 100, 0)))).toBeNull()
  })
})
