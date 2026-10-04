// Gerçeğe yakın deneme görselleri üretir (büyük, saydam, çok geniş, çok uzun). Ağ ya da dış dosya gerekmez.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i++) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
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

/** RGBA PNG. `paintRow(row, y)`: `row` (genişlik * 4 bayt) o satırın pikselleriyle doldurulur. */
export function png(width, height, paintRow) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) paintRow(raw.subarray(y * stride + 1, (y + 1) * stride), y)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    // Büyük görsellerde hız için düşük sıkıştırma.
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function put(row, x, r, g, b, a = 255) {
  const offset = x * 4
  row[offset] = r
  row[offset + 1] = g
  row[offset + 2] = b
  row[offset + 3] = a
}

/** Çapraz renk geçişi; `grid` verilirse o aralıkla ince çizgiler (ölçek ve bozulma gözle görülsün). */
export function gradient(width, height, from, to, grid = 0) {
  return png(width, height, (row, y) => {
    for (let x = 0; x < width; x++) {
      const line = grid > 0 && (x % grid < 3 || y % grid < 3)
      const t = (x / width + y / height) / 2
      if (line) put(row, x, 255, 215, 0)
      else put(row, x, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t)
    }
  })
}

/** Sol yarısı koyu, sağ yarısı açık: ortadaki keskin kenar ekranda kaç piksele yayılıyor diye ölçülür. */
export function splitImage(width, height) {
  return png(width, height, (row) => {
    for (let x = 0; x < width; x++) {
      if (x < width / 2) put(row, x, 16, 16, 24)
      else put(row, x, 240, 240, 232)
    }
  })
}

/** Saydam zemin üstünde ortada dolu bir daire: köşeler tamamen saydamdır. */
export function discImage(size, color = [40, 170, 90]) {
  const radius = size * 0.3
  return png(size, size, (row, y) => {
    for (let x = 0; x < size; x++) {
      const inside = Math.hypot(x - size / 2, y - size / 2) <= radius
      put(row, x, color[0], color[1], color[2], inside ? 255 : 0)
    }
  })
}

/** Düz renkli kare (çok sayıda görsel denemesi için küçük ve hızlı). */
export function flat(width, height, color) {
  return png(width, height, (row) => {
    for (let x = 0; x < width; x++) put(row, x, color[0], color[1], color[2])
  })
}

/** Görselleri `dir` altına yazar; yalnızca istenen adlar üretilir (büyük görseller birkaç saniye sürer). */
export function writeImages(dir, names) {
  const makers = {
    // 4000x3000 arka plan (fotoğraf makinesi / yapay zekâ çıktısı boyutu).
    buyukArka: () => gradient(4000, 3000, [70, 110, 60], [20, 40, 70], 250),
    // 2000x3000 karakter; ortasında keskin kenar var.
    buyukKarakter: () => splitImage(2000, 3000),
    arka: () => gradient(1920, 1080, [90, 70, 40], [30, 20, 50], 120),
    karakter: () => gradient(600, 900, [120, 120, 130], [40, 40, 50]),
    saydam: () => discImage(1000),
    genis: () => gradient(3000, 200, [170, 30, 30], [50, 10, 60], 100),
    uzun: () => gradient(200, 3000, [30, 60, 170], [10, 50, 60], 100),
    cokGenis: () => gradient(4000, 100, [170, 120, 30], [60, 50, 10]),
    portre: () => splitImage(800, 800),
    portre2: () => gradient(360, 480, [60, 120, 180], [20, 30, 60]),
    jeton: () => flat(300, 300, [200, 200, 210]),
    yesil: () => flat(400, 400, [30, 200, 60])
  }
  const paths = {}
  for (const name of names) {
    paths[name] = join(dir, `${name}.png`)
    writeFileSync(paths[name], makers[name]())
  }
  return paths
}
