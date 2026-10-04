// build/icon.svg dosyasından build/icon.ico üretir (16–256 piksel).
// Çalıştırma: node scripts/make-icon.mjs
// SVG gizli bir Electron penceresinde her boyut için ayrı çizilir; ICO kabı burada elle paketlenir.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const self = fileURLToPath(import.meta.url)
const root = join(dirname(self), '..')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

if (!process.versions.electron || process.env.ELECTRON_RUN_AS_NODE) {
  // Node ile çağrıldı: aynı dosyayı Electron'un içinde yeniden çalıştır.
  const { default: electronPath } = await import('electron')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(electronPath, [self], { stdio: 'inherit', env })
  process.exit(result.status ?? 1)
}

/** Sayfanın içinde çalışır: SVG'yi her boyutta tuvale çizer. */
async function renderInPage(svgText, sizes) {
  const images = []
  for (const size of sizes) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    if (size <= 32) {
      // Küçük boyutta ince çizgiler bulanır: iç ayrıntı kalkar, dış hat kalınlaşır ve zar büyür.
      doc.getElementById('ince')?.remove()
      const dice = doc.getElementById('zar')
      dice.setAttribute('stroke-width', size <= 16 ? '2' : '1.7')
      dice.setAttribute('transform', 'translate(128 128) scale(10.8) translate(-12 -12)')
    }
    const image = new Image()
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(doc))
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, size, size)
    images.push({
      size,
      png: canvas.toDataURL('image/png').split(',')[1],
      rgba: Array.from(context.getImageData(0, 0, size, size).data)
    })
  }
  return images
}

/** 32 bit BMP (DIB) simge girdisi: alttan üste BGRA satırlar, ardından 1 bitlik saydamlık maskesi. */
function dibEntry(size, rgba) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // renk + maske yüksekliği
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  const pixels = Buffer.alloc(size * size * 4)
  const maskStride = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskStride * size)
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4
      const to = (row * size + x) * 4
      pixels[to] = rgba[from + 2]
      pixels[to + 1] = rgba[from + 1]
      pixels[to + 2] = rgba[from]
      pixels[to + 3] = rgba[from + 3]
      if (rgba[from + 3] === 0) mask[row * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  header.writeUInt32LE(pixels.length + mask.length, 20)
  return Buffer.concat([header, pixels, mask])
}

function packIco(entries) {
  const head = Buffer.alloc(6 + entries.length * 16)
  head.writeUInt16LE(1, 2) // tür: simge
  head.writeUInt16LE(entries.length, 4)
  let offset = head.length
  entries.forEach(({ size, data }, i) => {
    const at = 6 + i * 16
    head[at] = size === 256 ? 0 : size
    head[at + 1] = size === 256 ? 0 : size
    head.writeUInt16LE(1, at + 4)
    head.writeUInt16LE(32, at + 6)
    head.writeUInt32LE(data.length, at + 8)
    head.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...entries.map((entry) => entry.data)])
}

const { app, BrowserWindow } = await import('electron')

// ESM giriş dosyasında en üstte whenReady() beklenmez: Electron "ready" için dosyanın bitmesini bekler.
async function main() {
  const win = new BrowserWindow({ show: false, width: 320, height: 320 })
  await win.loadURL('about:blank')
  const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')
  const images = await win.webContents.executeJavaScript(
    `(${renderInPage})(${JSON.stringify(svg)}, ${JSON.stringify(SIZES)})`
  )

  // Gözle kontrol için her boyutun PNG'si (repoya girmez).
  const previewDir = join(root, '.tmp', 'paket', 'ikon')
  mkdirSync(previewDir, { recursive: true })
  const entries = images.map(({ size, png, rgba }) => {
    const pngData = Buffer.from(png, 'base64')
    writeFileSync(join(previewDir, `icon-${size}.png`), pngData)
    // 256 piksel PNG olarak, küçükler BMP olarak saklanır (bütün araçların okuduğu alışılmış düzen).
    return { size, data: size === 256 ? pngData : dibEntry(size, rgba) }
  })
  const ico = packIco(entries)
  writeFileSync(join(root, 'build', 'icon.ico'), ico)
  console.log(`build/icon.ico yazıldı: ${SIZES.join(', ')} piksel, ${ico.length} bayt`)
  console.log(`önizleme: ${previewDir}`)
}

app.whenReady().then(main).then(
  () => app.exit(0),
  (error) => {
    console.error('Simge üretilemedi:', error)
    app.exit(1)
  }
)
