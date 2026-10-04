// Testler için örnek görseller üretir (dış dosyaya ya da ağa ihtiyaç duymadan).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}

/**
 * Geçerli bir PNG üretir. `paint(x, y)` her piksel için [r, g, b, a] döndürür.
 * Varsayılan boyama: iki renk arasında çapraz geçiş ve ince bir çerçeve; görselin
 * bozulup bozulmadığı (oran) ekran görüntüsünde gözle anlaşılır.
 */
export function makePng(width, height, from = [200, 60, 60], to = [40, 40, 120], alpha = 255) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2
      const edge = x < 6 || y < 6 || x >= width - 6 || y >= height - 6
      const offset = y * stride + 1 + x * 4
      raw[offset] = edge ? 255 : Math.round(from[0] + (to[0] - from[0]) * t)
      raw[offset + 1] = edge ? 215 : Math.round(from[1] + (to[1] - from[1]) * t)
      raw[offset + 2] = edge ? 0 : Math.round(from[2] + (to[2] - from[2]) * t)
      raw[offset + 3] = alpha
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit derinliği
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Örnek görselleri `dir` altına yazar ve yollarını döndürür. */
export function writeSamples(dir) {
  mkdirSync(dir, { recursive: true })
  const samples = {
    portrait1: ['kenji.png', makePng(400, 400, [180, 120, 60], [60, 30, 20])],
    portrait2: ['jasper.png', makePng(360, 480, [60, 120, 180], [20, 30, 60])],
    place: ['kraliyet-ici.png', makePng(1600, 900, [90, 70, 40], [30, 20, 50])],
    scene: ['orman-yolu.png', makePng(1200, 1200, [30, 110, 50], [10, 40, 30])],
    enemy: ['kurt-adam.png', makePng(600, 900, [120, 120, 130], [40, 40, 50])],
    boss: ['ejderha.png', makePng(1000, 500, [170, 30, 30], [50, 10, 60])],
    npc: ['hanci.png', makePng(500, 700, [150, 110, 90], [70, 50, 40])],
    item: ['kilic.png', makePng(200, 600, [190, 190, 200], [90, 90, 110])]
  }
  const paths = {}
  for (const [key, [name, data]] of Object.entries(samples)) {
    paths[key] = join(dir, name)
    writeFileSync(paths[key], data)
  }
  return paths
}
