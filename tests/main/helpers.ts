import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AppState, createInitialAppState } from '@shared/types'

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dndoynatma-test-'))
}

export function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/** Her alanı dolu, geçerli bir kayıt. */
export function sampleAppState(): AppState {
  const state = createInitialAppState()
  state.library = [
    { id: 'img-bg', kind: 'place', fileName: 'bg.png', originalName: 'Taht odası', width: 1920, height: 1080, addedAt: '2026-01-01T10:00:00.000Z' },
    { id: 'img-npc', kind: 'npc', fileName: 'npc.webp', originalName: 'Kral', width: 400, height: 600, addedAt: '2026-01-02T10:00:00.000Z' },
    { id: 'img-portrait', kind: 'portrait', fileName: 'portre.jpg', originalName: 'Savaşçı', width: 512, height: 512, addedAt: '2026-01-03T10:00:00.000Z' }
  ]
  state.players[0] = { portraitId: 'img-portrait', name: 'Şövalye', level: 5, hp: 7, note: 'iksiri var' }
  state.scenes = [
    {
      id: 'scene-1',
      name: 'Kraliyet İçi',
      hotkey: 1,
      background: { id: 'item-bg', imageId: 'img-bg', x: 300, y: 0, width: 1920, height: 1080, rotation: 0, label: '' },
      items: [{ id: 'item-1', imageId: 'img-npc', x: 800, y: 200, width: 200, height: 300, rotation: 0, label: '7 LVL' }]
    },
    { id: 'scene-2', name: 'Orman Yolu', hotkey: 2, background: null, items: [] }
  ]
  state.activeSceneId = 'scene-1'
  state.generalNote = 'Genel not'
  state.settings = { gameDisplayId: 2, controlDisplayId: null, gameFullscreen: false }
  return state
}

// --- Küçük, geçerli görsel başlıkları ---

export function pngBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.writeUInt32BE(13, 8)
  buffer.write('IHDR', 12, 'latin1')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  buffer[24] = 8
  buffer[25] = 6
  return buffer
}

export function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head[0] = 0xff
  head[1] = marker
  head.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([head, payload])
}

export function jpegFrame(marker: number, width: number, height: number): Buffer {
  const payload = Buffer.alloc(15)
  payload[0] = 8
  payload.writeUInt16BE(height, 1)
  payload.writeUInt16BE(width, 3)
  payload[5] = 3
  return jpegSegment(marker, payload)
}

export function jpegExif(orientation: number, littleEndian: boolean): Buffer {
  const tiff = Buffer.alloc(26)
  const u16 = (value: number, at: number): number => (littleEndian ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at))
  const u32 = (value: number, at: number): number => (littleEndian ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at))
  tiff.write(littleEndian ? 'II' : 'MM', 0, 'latin1')
  u16(42, 2)
  u32(8, 4)
  u16(1, 8)
  u16(0x0112, 10)
  u16(3, 12)
  u32(1, 14)
  u16(orientation, 18)
  return jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]))
}

export function jpegBytes(...segments: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments, Buffer.from([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])])
}

export const JFIF_SEGMENT = jpegSegment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]))

function riff(chunk: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(20)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(payload.length + 12, 4)
  head.write('WEBP', 8, 'latin1')
  head.write(chunk, 12, 'latin1')
  head.writeUInt32LE(payload.length, 16)
  return Buffer.concat([head, payload])
}

export function webpLossyBytes(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10)
  Buffer.from([0x10, 0x00, 0x00, 0x9d, 0x01, 0x2a]).copy(payload, 0)
  payload.writeUInt16LE(width, 6)
  payload.writeUInt16LE(height, 8)
  return riff('VP8 ', payload)
}

export function webpLosslessBytes(width: number, height: number): Buffer {
  const payload = Buffer.alloc(5)
  payload[0] = 0x2f
  payload.writeUInt32LE((((height - 1) << 14) | (width - 1)) >>> 0, 1)
  return riff('VP8L', payload)
}

export function webpExtendedBytes(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10)
  payload.writeUIntLE(width - 1, 4, 3)
  payload.writeUIntLE(height - 1, 7, 3)
  return riff('VP8X', payload)
}
