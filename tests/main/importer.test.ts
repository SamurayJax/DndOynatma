import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isSafeFileName, mediaFileNameFromUrl, mimeTypeFor } from '../../src/main/fileNames'
import { MAX_IMAGE_BYTES, copyImagesIntoLibrary, discardCopiedImage } from '../../src/main/importer'
import { readImageSize } from '../../src/main/imageSize'
import { JFIF_SEGMENT, jpegBytes, jpegFrame, makeTempDir, pngBytes, removeTempDir, webpLossyBytes } from './helpers'

let dir: string
let sourceDir: string
let imagesDir: string

beforeEach(() => {
  dir = makeTempDir()
  sourceDir = path.join(dir, 'kaynak')
  imagesDir = path.join(dir, 'gorseller')
  fs.mkdirSync(sourceDir)
  fs.mkdirSync(imagesDir)
})

afterEach(() => removeTempDir(dir))

function source(name: string, content: Buffer | string): string {
  const file = path.join(sourceDir, name)
  fs.writeFileSync(file, content)
  return file
}

describe('copyImagesIntoLibrary', () => {
  it('geçerli görselleri benzersiz adla kopyalar', async () => {
    const png = source('Ejderha Mağarası.PNG', pngBytes(1920, 1080))
    const webp = source('kral.webp', webpLossyBytes(400, 600))

    const { added, skipped } = await copyImagesIntoLibrary(imagesDir, 'scene', [png, webp])

    expect(skipped).toEqual([])
    expect(added).toHaveLength(2)
    expect(added[0]).toMatchObject({ kind: 'scene', originalName: 'Ejderha Mağarası', width: 1920, height: 1080 })
    expect(added[1]).toMatchObject({ kind: 'scene', originalName: 'kral', width: 400, height: 600 })
    expect(added[0].fileName).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(added[1].fileName).toMatch(/^[0-9a-f-]{36}\.webp$/)
    expect(added[0].id).not.toBe(added[1].id)
    expect(Number.isNaN(Date.parse(added[0].addedAt))).toBe(false)

    expect(fs.readdirSync(imagesDir).sort()).toEqual(added.map((image) => image.fileName).sort())
    expect(fs.readFileSync(path.join(imagesDir, added[0].fileName)).equals(pngBytes(1920, 1080))).toBe(true)
    // Kaynak dosya yerinde kalır.
    expect(fs.existsSync(png)).toBe(true)
  })

  it('aynı dosya iki kez yüklenirse iki ayrı kopya oluşur', async () => {
    const png = source('a.png', pngBytes(10, 10))
    const { added } = await copyImagesIntoLibrary(imagesDir, 'item', [png, png])
    expect(added).toHaveLength(2)
    expect(new Set(added.map((image) => image.fileName)).size).toBe(2)
  })

  it('uzantıyı dosyanın gerçek türünden alır', async () => {
    const mislabeled = source('aslinda-jpeg.png', jpegBytes(JFIF_SEGMENT, jpegFrame(0xc0, 640, 480)))
    const { added } = await copyImagesIntoLibrary(imagesDir, 'npc', [mislabeled])
    expect(added[0].fileName).toMatch(/\.jpg$/)
    expect(added[0]).toMatchObject({ width: 640, height: 480 })
  })

  it('sorunlu dosyaları kodlarıyla atlar, sağlamları yine ekler', async () => {
    const files = [
      source('belge.pdf', 'pdf'),
      source('uzantisiz', pngBytes(10, 10)),
      source('bozuk.jpg', 'bu bir görsel değil'),
      path.join(sourceDir, 'tasinmis.png'),
      sourceDir + path.sep + 'klasor.png',
      source('iyi.jpeg', jpegBytes(jpegFrame(0xc0, 100, 50)))
    ]
    fs.mkdirSync(path.join(sourceDir, 'klasor.png'))

    const { added, skipped } = await copyImagesIntoLibrary(imagesDir, 'enemy', files)

    expect(skipped.map(({ name, code }) => ({ name, code }))).toEqual([
      { name: 'belge.pdf', code: 'DND-201' },
      { name: 'uzantisiz', code: 'DND-201' },
      { name: 'bozuk.jpg', code: 'DND-204' },
      { name: 'tasinmis.png', code: 'DND-202' },
      { name: 'klasor.png', code: 'DND-202' }
    ])
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ originalName: 'iyi', width: 100, height: 50 })
    expect(fs.readdirSync(imagesDir)).toEqual([added[0].fileName])
  })

  it('50 MB sınırını aşan dosyayı atlar (DND-206)', async () => {
    const big = source('dev.png', pngBytes(10, 10))
    fs.truncateSync(big, MAX_IMAGE_BYTES + 1)
    const atLimit = source('sinirda.png', pngBytes(10, 10))
    fs.truncateSync(atLimit, MAX_IMAGE_BYTES)

    const { added, skipped } = await copyImagesIntoLibrary(imagesDir, 'boss', [big, atLimit])

    expect(skipped.map(({ name, code }) => ({ name, code }))).toEqual([{ name: 'dev.png', code: 'DND-206' }])
    expect(added.map((image) => image.originalName)).toEqual(['sinirda'])
  })

  it('hedef klasör yoksa DND-202 ile atlar', async () => {
    const png = source('a.png', pngBytes(10, 10))
    const { added, skipped } = await copyImagesIntoLibrary(path.join(dir, 'yok'), 'npc', [png])
    expect(added).toEqual([])
    expect(skipped.map((entry) => entry.code)).toEqual(['DND-202'])
  })

  it('discardCopiedImage kopyayı siler, dosya yoksa hata fırlatmaz', async () => {
    const png = source('a.png', pngBytes(10, 10))
    const { added } = await copyImagesIntoLibrary(imagesDir, 'npc', [png])
    discardCopiedImage(imagesDir, added[0].fileName)
    expect(fs.readdirSync(imagesDir)).toEqual([])
    expect(() => discardCopiedImage(imagesDir, added[0].fileName)).not.toThrow()
  })

  it('kopyalanan dosyanın başlığı yeniden okunabilir', async () => {
    const { added } = await copyImagesIntoLibrary(imagesDir, 'place', [source('a.webp', webpLossyBytes(300, 200))])
    expect(readImageSize(fs.readFileSync(path.join(imagesDir, added[0].fileName)))).toEqual({ width: 300, height: 200, type: 'webp' })
  })
})

describe('dosya adları', () => {
  it('yalnızca klasör içinde kalan adları güvenli sayar', () => {
    expect(isSafeFileName('3f2b6c1e-0000-4000-8000-000000000000.png')).toBe(true)
    expect(isSafeFileName('görsel adı.webp')).toBe(true)
    for (const name of ['', '.', '..', '../a.png', '..\\a.png', 'a/b.png', 'a\\b.png', 'C:a.png', 'a..b.png', 'a\0.png', null, 5, undefined]) {
      expect(isSafeFileName(name)).toBe(false)
    }
  })

  it('görsel adresinden dosya adını çıkarır', () => {
    expect(mediaFileNameFromUrl('dnd-media://gorsel/abc.png')).toBe('abc.png')
    expect(mediaFileNameFromUrl(`dnd-media://gorsel/${encodeURIComponent('görsel adı.webp')}`)).toBe('görsel adı.webp')
    expect(mediaFileNameFromUrl('dnd-media://gorsel/abc.png?v=2')).toBe('abc.png')
  })

  it('klasör dışına çıkmaya çalışan ya da yabancı adresleri reddeder', () => {
    for (const url of [
      'dnd-media://gorsel/..%2F..%2Fkayit.json',
      'dnd-media://gorsel/..%5C..%5Ckayit.json',
      'dnd-media://gorsel/alt/abc.png',
      'dnd-media://gorsel/',
      'dnd-media://baska/abc.png',
      'file:///C:/Windows/win.ini',
      'https://gorsel/abc.png',
      'dnd-media://gorsel/%E0%A4%A',
      'adres değil'
    ]) {
      expect(mediaFileNameFromUrl(url)).toBeNull()
    }
  })

  it('uzantıya göre içerik türü verir', () => {
    expect(mimeTypeFor('a.png')).toBe('image/png')
    expect(mimeTypeFor('a.JPG')).toBe('image/jpeg')
    expect(mimeTypeFor('a.jpeg')).toBe('image/jpeg')
    expect(mimeTypeFor('a.webp')).toBe('image/webp')
    expect(mimeTypeFor('a.exe')).toBe('application/octet-stream')
  })
})
