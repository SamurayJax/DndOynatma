/**
 * Karakter dosyası (`.dndkarakter`): oyuncu kartlarının bilgileri ve portre görselleri tek dosyada.
 * Electron'a bağlı değildir; yalnızca baytları kurar ve çözer.
 *
 * Biçim: imza satırı · başlığın bayt uzunluğu (4 bayt, küçük uçlu) · başlık (UTF-8 JSON) ·
 * portrelerin baytları, başlıktaki kart sırasıyla art arda.
 * Portreler base64 yerine ham bayt olarak durur: dosya şişmez, okurken dev bir metin çözülmez.
 */
import { TEXT_LIMITS } from '@shared/reducer'
import { MAX_HP, MAX_LEVEL, MAX_PLAYERS, MIN_LEVEL } from '@shared/types'
import { ImageSize, readImageSize } from './imageSize'
import { MAX_IMAGE_BYTES } from './importer'

export const CHARACTER_FILE_EXTENSION = 'dndkarakter'

const MAGIC = Buffer.from('DNDOYNATMA-KARAKTER\n', 'latin1')
const FORMAT_NAME = 'dndoynatma-karakterler'
const FORMAT_VERSION = 1
const LENGTH_BYTES = 4
const MAX_HEADER_BYTES = 256 * 1024
const MAX_ORIGINAL_NAME = 200

/** Bundan büyük dosya karakter dosyası olamaz; okunmadan reddedilir. */
export const MAX_CHARACTER_FILE_BYTES = MAGIC.length + LENGTH_BYTES + MAX_HEADER_BYTES + MAX_PLAYERS * MAX_IMAGE_BYTES

export interface CharacterPortrait {
  data: Buffer
  /** Portrenin yüklendiği dosyanın adı (uzantısız); yalnızca gösterim içindir. */
  originalName: string
}

export interface CharacterCard {
  /** 0..3 */
  slot: number
  name: string
  level: number
  hp: number
  note: string
  portrait: CharacterPortrait | null
}

/** Dosyadan okunan kart: portrenin türü ve boyutu baytlarından çıkarılmıştır. */
export interface DecodedCard extends CharacterCard {
  portrait: (CharacterPortrait & { size: ImageSize }) | null
}

export type DecodeResult =
  | { ok: true; exportedAt: string | null; cards: DecodedCard[] }
  | { ok: false; code: 'DND-112' | 'DND-113'; detail: string }

interface HeaderCard {
  slot: number
  name: string
  level: number
  hp: number
  note: string
  portrait: { bytes: number; originalName: string } | null
}

interface Header {
  format: typeof FORMAT_NAME
  version: number
  appVersion: string
  exportedAt: string
  cards: HeaderCard[]
}

/** Kartta taşınacak hiçbir şey yoksa true. Böyle bir kart ne yazılır ne de içe alınır. */
export function isBlankCard(card: CharacterCard): boolean {
  return card.portrait === null && card.name === '' && card.note === '' && card.level === MIN_LEVEL && card.hp === MAX_HP
}

export function encodeCharacterFile(cards: readonly CharacterCard[], meta: { appVersion: string; exportedAt: string }): Buffer {
  const header: Header = {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    appVersion: meta.appVersion,
    exportedAt: meta.exportedAt,
    cards: cards.map((card) => ({
      slot: card.slot,
      name: card.name,
      level: card.level,
      hp: card.hp,
      note: card.note,
      portrait: card.portrait ? { bytes: card.portrait.data.length, originalName: card.portrait.originalName } : null
    }))
  }
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  const length = Buffer.alloc(LENGTH_BYTES)
  length.writeUInt32LE(headerBytes.length)
  const portraits = cards.flatMap((card) => (card.portrait ? [card.portrait.data] : []))
  return Buffer.concat([MAGIC, length, headerBytes, ...portraits])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, Math.round(value)))
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  // İki birimlik bir karakter (emoji) ortadan bölünmesin.
  const lastUnit = text.charCodeAt(max - 1)
  return text.slice(0, lastUnit >= 0xd800 && lastUnit <= 0xdbff ? max - 1 : max)
}

function broken(detail: string): DecodeResult {
  return { ok: false, code: 'DND-112', detail }
}

/**
 * Dosyanın baytlarını çözer. Dosya dışarıdan gelir; her alan denetlenir ve kartlar uygulamanın
 * sınırlarına çekilir. Herhangi bir tutarsızlıkta dosyanın tamamı reddedilir.
 */
export function decodeCharacterFile(file: Buffer): DecodeResult {
  const headerStart = MAGIC.length + LENGTH_BYTES
  if (file.length < headerStart || !file.subarray(0, MAGIC.length).equals(MAGIC)) return broken('imza yok')

  const headerLength = file.readUInt32LE(MAGIC.length)
  const headerEnd = headerStart + headerLength
  if (headerLength > MAX_HEADER_BYTES || headerEnd > file.length) return broken('başlık uzunluğu geçersiz')

  let header: unknown
  try {
    header = JSON.parse(file.toString('utf8', headerStart, headerEnd))
  } catch {
    return broken('başlık çözülemedi')
  }
  if (!isRecord(header) || header.format !== FORMAT_NAME) return broken('başlık tanınmadı')
  if (typeof header.version !== 'number' || !Number.isInteger(header.version) || header.version < 1) return broken('sürüm geçersiz')
  if (header.version > FORMAT_VERSION) return { ok: false, code: 'DND-113', detail: `biçim sürümü ${header.version}` }
  if (!Array.isArray(header.cards) || header.cards.length > MAX_PLAYERS) return broken('kart listesi geçersiz')

  const cards: DecodedCard[] = []
  const seenSlots = new Set<number>()
  let offset = headerEnd
  for (const raw of header.cards as unknown[]) {
    if (!isRecord(raw)) return broken('kart bir nesne değil')
    const { slot, name, note, portrait } = raw
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) return broken('kart yuvası geçersiz')
    if (seenSlots.has(slot)) return broken('aynı yuva iki kez geçiyor')
    seenSlots.add(slot)

    const level = clampInt(raw.level, MIN_LEVEL, MAX_LEVEL)
    const hp = clampInt(raw.hp, 0, MAX_HP)
    if (typeof name !== 'string' || typeof note !== 'string' || level === null || hp === null) return broken('kart alanları eksik')

    const card: DecodedCard = {
      slot,
      name: truncate(name, TEXT_LIMITS.playerName),
      level,
      hp,
      note: truncate(note, TEXT_LIMITS.playerNote),
      portrait: null
    }
    if (portrait !== null) {
      if (!isRecord(portrait)) return broken('portre kaydı geçersiz')
      const { bytes, originalName } = portrait
      if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_IMAGE_BYTES) return broken('portre boyutu geçersiz')
      if (offset + bytes > file.length) return broken('dosya kesik')
      // Kopya: dosyanın tamamı bellekte tutulmasın, portreler birbirinden bağımsız yaşasın.
      const data = Buffer.from(file.subarray(offset, offset + bytes))
      offset += bytes
      // Türe ve boyuta başlıktaki bilgiyle değil, görselin kendi baytlarıyla karar verilir.
      const size = readImageSize(data)
      if (!size) return broken('portre görseli okunamadı')
      card.portrait = { data, originalName: typeof originalName === 'string' ? truncate(originalName, MAX_ORIGINAL_NAME) : '', size }
    }
    // Boş kart, içe aktarılınca aynı numaralı kartı silerdi; dosyada olmayan karta dokunulmaz.
    if (!isBlankCard(card)) cards.push(card)
  }
  if (offset !== file.length) return broken('dosyanın sonunda fazladan veri var')

  const exportedAt = typeof header.exportedAt === 'string' && !Number.isNaN(Date.parse(header.exportedAt)) ? header.exportedAt : null
  return { ok: true, exportedAt, cards: cards.sort((a, b) => a.slot - b.slot) }
}
