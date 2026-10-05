import { describe, expect, it } from 'vitest'
import { TEXT_LIMITS } from '@shared/reducer'
import { MAX_HP, MAX_LEVEL, MAX_PLAYERS } from '@shared/types'
import {
  CharacterCard,
  DecodeResult,
  MAX_CHARACTER_FILE_BYTES,
  decodeCharacterFile,
  encodeCharacterFile,
  isBlankCard
} from '../../src/main/characterFile'
import { MAX_IMAGE_BYTES } from '../../src/main/importer'
import { JFIF_SEGMENT, jpegBytes, jpegFrame, pngBytes, webpLossyBytes } from './helpers'

const MAGIC = 'DNDOYNATMA-KARAKTER\n'
const META = { appVersion: '0.9.3', exportedAt: '2026-10-05T18:30:00.000Z' }

function card(slot: number, patch: Partial<CharacterCard> = {}): CharacterCard {
  return { slot, name: `Kahraman ${slot + 1}`, level: 3, hp: 8, note: '', portrait: null, ...patch }
}

/** Dosyayı elle kurar: başlık istenen (bozuk) içerikle yazılabilir. */
function rawFile(header: unknown, ...blobs: Buffer[]): Buffer {
  const headerBytes = Buffer.from(typeof header === 'string' ? header : JSON.stringify(header), 'utf8')
  const length = Buffer.alloc(4)
  length.writeUInt32LE(headerBytes.length)
  return Buffer.concat([Buffer.from(MAGIC, 'latin1'), length, headerBytes, ...blobs])
}

function header(cards: unknown, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { format: 'dndoynatma-karakterler', version: 1, appVersion: '0.9.3', exportedAt: META.exportedAt, cards, ...patch }
}

const rawCard = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({ slot: 0, name: 'Kenji', level: 4, hp: 7, note: '', portrait: null, ...patch })

function expectBroken(result: DecodeResult, code: 'DND-112' | 'DND-113' = 'DND-112'): void {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.code).toBe(code)
}

function decoded(file: Buffer): Extract<DecodeResult, { ok: true }> {
  const result = decodeCharacterFile(file)
  if (!result.ok) throw new Error(`dosya çözülemedi: ${result.detail}`)
  return result
}

describe('karakter dosyası: yazıp geri okuma', () => {
  it('kartları ve portreleri bayt bayt aynı geri verir', () => {
    const png = pngBytes(400, 600)
    const webp = webpLossyBytes(512, 512)
    const cards = [
      card(0, { name: 'Şövalye Çağrı', level: 12, hp: 0, note: 'İksiri var.\nİkinci satır 🐉', portrait: { data: png, originalName: 'şövalye' } }),
      card(2, { name: '', note: 'adı yok ama notu var' }),
      card(3, { portrait: { data: webp, originalName: 'büyücü' } })
    ]
    const result = decoded(encodeCharacterFile(cards, META))

    expect(result.exportedAt).toBe(META.exportedAt)
    expect(result.cards.map((entry) => entry.slot)).toEqual([0, 2, 3])
    expect(result.cards[0]).toMatchObject({ name: 'Şövalye Çağrı', level: 12, hp: 0, note: 'İksiri var.\nİkinci satır 🐉' })
    expect(result.cards[0].portrait?.data.equals(png)).toBe(true)
    expect(result.cards[0].portrait).toMatchObject({ originalName: 'şövalye', size: { width: 400, height: 600, type: 'png' } })
    expect(result.cards[1]).toMatchObject({ name: '', note: 'adı yok ama notu var', portrait: null })
    expect(result.cards[2].portrait?.data.equals(webp)).toBe(true)
    expect(result.cards[2].portrait?.size).toEqual({ width: 512, height: 512, type: 'webp' })
  })

  it('portreler ham bayt olarak durur: dosya, başlık ve portrelerin toplamı kadardır', () => {
    const png = pngBytes(10, 10)
    const without = encodeCharacterFile([card(0)], META)
    const withPortrait = encodeCharacterFile([card(0, { portrait: { data: png, originalName: '' } })], META)
    const headerGrowth = '{"bytes":33,"originalName":""}'.length - 'null'.length
    expect(withPortrait.length).toBe(without.length + headerGrowth + png.length)
  })

  it('kartsız dosya geçerlidir', () => {
    expect(decoded(encodeCharacterFile([], META)).cards).toEqual([])
  })

  it('kartları yuva sırasına dizer; portreler doğru kartta kalır', () => {
    const first = pngBytes(11, 11)
    const second = pngBytes(22, 22)
    const file = encodeCharacterFile(
      [card(3, { portrait: { data: first, originalName: 'üç' } }), card(1, { portrait: { data: second, originalName: 'bir' } })],
      META
    )
    const result = decoded(file)
    expect(result.cards.map((entry) => [entry.slot, entry.portrait?.size.width])).toEqual([
      [1, 22],
      [3, 11]
    ])
  })

  it('portrenin türünü başlıktan değil baytlarından çıkarır', () => {
    const jpeg = jpegBytes(JFIF_SEGMENT, jpegFrame(0xc0, 640, 480))
    const result = decoded(encodeCharacterFile([card(0, { portrait: { data: jpeg, originalName: 'aslinda.png' } })], META))
    expect(result.cards[0].portrait?.size).toMatchObject({ type: 'jpeg', width: 640, height: 480 })
  })

  it('boş kartı tanır', () => {
    expect(isBlankCard(card(0, { name: '', level: 1, hp: MAX_HP }))).toBe(true)
    expect(isBlankCard(card(0, { name: '', level: 1, hp: MAX_HP - 1 }))).toBe(false)
    expect(isBlankCard(card(0, { name: '', level: 2, hp: MAX_HP }))).toBe(false)
    expect(isBlankCard(card(0, { name: '', level: 1, hp: MAX_HP, note: 'x' }))).toBe(false)
    expect(isBlankCard(card(0, { name: '', level: 1, hp: MAX_HP, portrait: { data: pngBytes(1, 1), originalName: '' } }))).toBe(false)
  })

  it('dosyadaki boş kartı almaz (içe aktarılınca karşısındaki kartı silmesin)', () => {
    const file = rawFile(header([rawCard({ slot: 0 }), rawCard({ slot: 1, name: '', level: 1, hp: MAX_HP })]))
    expect(decoded(file).cards.map((entry) => entry.slot)).toEqual([0])
  })
})

describe('karakter dosyası: sınırlara çekme', () => {
  it('uzun isim ve notu kırpar, seviye ve canı aralığa çeker', () => {
    const file = rawFile(
      header([
        rawCard({ slot: 0, name: 'a'.repeat(100), level: 500, hp: 99, note: 'n'.repeat(5000) }),
        rawCard({ slot: 1, level: -3, hp: -1 }),
        rawCard({ slot: 2, level: 4.6, hp: 6.4 })
      ])
    )
    const [long, low, fraction] = decoded(file).cards
    expect(long.name).toHaveLength(TEXT_LIMITS.playerName)
    expect(long.note).toHaveLength(TEXT_LIMITS.playerNote)
    expect(long).toMatchObject({ level: MAX_LEVEL, hp: MAX_HP })
    expect(low).toMatchObject({ level: 1, hp: 0 })
    expect(fraction).toMatchObject({ level: 5, hp: 6 })
  })

  it('kırparken iki birimlik karakteri ortadan bölmez', () => {
    const name = 'a'.repeat(TEXT_LIMITS.playerName - 1) + '🐉'
    const [entry] = decoded(rawFile(header([rawCard({ name })]))).cards
    expect(entry.name).toBe('a'.repeat(TEXT_LIMITS.playerName - 1))
  })

  it('tarih okunamıyorsa yok sayar, portre adı metin değilse boş bırakır', () => {
    const png = pngBytes(5, 5)
    const file = rawFile(header([rawCard({ portrait: { bytes: png.length, originalName: 42 } })], { exportedAt: 'dün' }), png)
    const result = decoded(file)
    expect(result.exportedAt).toBeNull()
    expect(result.cards[0].portrait?.originalName).toBe('')
  })
})

describe('karakter dosyası: bozuk ve yabancı dosyalar', () => {
  const good = encodeCharacterFile([card(0, { portrait: { data: pngBytes(8, 8), originalName: 'p' } })], META)

  it('imzası olmayan dosyayı reddeder', () => {
    expectBroken(decodeCharacterFile(Buffer.alloc(0)))
    expectBroken(decodeCharacterFile(Buffer.from('merhaba')))
    expectBroken(decodeCharacterFile(pngBytes(100, 100)))
    expectBroken(decodeCharacterFile(Buffer.from(JSON.stringify(header([rawCard()])))))
    expectBroken(decodeCharacterFile(Buffer.from(MAGIC, 'latin1')))
  })

  it('kesik dosyayı her uzunlukta reddeder', () => {
    for (let length = 0; length < good.length; length++) {
      expectBroken(decodeCharacterFile(good.subarray(0, length)))
    }
  })

  it('sonunda fazladan veri olan dosyayı reddeder', () => {
    expectBroken(decodeCharacterFile(Buffer.concat([good, Buffer.from([0])])))
  })

  it('başlık uzunluğu dosyadan ya da sınırdan büyükse reddeder', () => {
    const lying = Buffer.from(good)
    lying.writeUInt32LE(0xffffffff, MAGIC.length)
    expectBroken(decodeCharacterFile(lying))

    const huge = rawFile(header([rawCard({ note: 'x'.repeat(300 * 1024) })]))
    expectBroken(decodeCharacterFile(huge))
  })

  it('başlığı JSON olmayan ya da tanınmayan dosyayı reddeder', () => {
    expectBroken(decodeCharacterFile(rawFile('{bozuk')))
    expectBroken(decodeCharacterFile(rawFile('null')))
    expectBroken(decodeCharacterFile(rawFile('[]')))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard()], { format: 'baska-uygulama' }))))
  })

  it('daha yeni biçimi ayrı kodla bildirir (DND-113)', () => {
    expectBroken(decodeCharacterFile(rawFile(header([rawCard()], { version: 2 }))), 'DND-113')
    expectBroken(decodeCharacterFile(rawFile(header([rawCard()], { version: 0 }))))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard()], { version: '1' }))))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard()], { version: 1.5 }))))
  })

  it('kart listesi hatalıysa reddeder', () => {
    expectBroken(decodeCharacterFile(rawFile(header('kart'))))
    expectBroken(decodeCharacterFile(rawFile(header(null))))
    expectBroken(decodeCharacterFile(rawFile(header(Array.from({ length: MAX_PLAYERS + 1 }, (_, slot) => rawCard({ slot }))))))
    expectBroken(decodeCharacterFile(rawFile(header(['kart']))))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ slot: 1 }), rawCard({ slot: 1 })]))))
  })

  it('yuvası ya da alanları hatalı kartı reddeder', () => {
    for (const slot of [-1, MAX_PLAYERS, 1.5, '0', null]) {
      expectBroken(decodeCharacterFile(rawFile(header([rawCard({ slot })]))))
    }
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ name: 5 })]))))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ note: null })]))))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ level: '4' })]))))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ hp: null })]))))
    const { portrait: _portrait, ...withoutPortrait } = rawCard()
    expectBroken(decodeCharacterFile(rawFile(header([withoutPortrait]))))
  })

  it('portre kaydı hatalıysa reddeder', () => {
    const png = pngBytes(8, 8)
    for (const bytes of [0, -5, 1.5, '33', MAX_IMAGE_BYTES + 1]) {
      expectBroken(decodeCharacterFile(rawFile(header([rawCard({ portrait: { bytes, originalName: 'p' } })]), png)))
    }
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ portrait: 'var' })]), png)))
    // Başlık portreyi olduğundan uzun ya da kısa gösteriyor.
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ portrait: { bytes: png.length + 1, originalName: 'p' } })]), png)))
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ portrait: { bytes: png.length - 1, originalName: 'p' } })]), png)))
  })

  it('görsel olmayan portreyi reddeder', () => {
    const fake = Buffer.from('bu bir görsel değil, çalıştırılabilir bir şey olabilir')
    expectBroken(decodeCharacterFile(rawFile(header([rawCard({ portrait: { bytes: fake.length, originalName: 'p' } })]), fake)))
  })

  it('en büyük dosya sınırı dört tam boy portreyi kapsar', () => {
    expect(MAX_CHARACTER_FILE_BYTES).toBeGreaterThan(MAX_PLAYERS * MAX_IMAGE_BYTES)
    expect(MAX_CHARACTER_FILE_BYTES).toBeLessThan(MAX_PLAYERS * MAX_IMAGE_BYTES + 1024 * 1024)
  })
})
