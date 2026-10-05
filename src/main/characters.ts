/**
 * Oyuncu kartlarını dışa / içe aktarma: dosya pencereleri, portre dosyaları ve kartların değiştirilmesi.
 * Yalnızca dört kart taşınır (isim, seviye, can, not, portre); kütüphane, pencereler ve ayarlar taşınmaz.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, OpenDialogOptions, SaveDialogOptions, dialog } from 'electron'
import { CharacterExportResult, CharacterImportPreview, CharacterImportResult, IncomingCard } from '@shared/ipc'
import { findImage, isPlayerPristine } from '@shared/layout'
import { AppState, ID, LibraryImage, PlayerProfile } from '@shared/types'
import {
  CHARACTER_FILE_EXTENSION,
  CharacterCard,
  DecodeResult,
  DecodedCard,
  MAX_CHARACTER_FILE_BYTES,
  decodeCharacterFile,
  encodeCharacterFile,
  isBlankCard
} from './characterFile'
import { isSafeFileName } from './fileNames'
import { discardCopiedImage, writeLibraryImage } from './importer'
import { log } from './logger'
import { Store } from './store'

export interface CharacterDeps {
  store: Store
  imagesDir: string
  /** Dosyaya, hangi sürümle yazıldığı bilgisi olarak girer. */
  appVersion: () => string
}

const FILE_FILTERS = [{ name: 'DndOynatma karakter dosyası', extensions: [CHARACTER_FILE_EXTENSION] }]

const NOT_EXPORTED: CharacterExportResult = { ok: false, canceled: false, code: null, fileName: null, count: 0, missingPortraits: [] }
const NOT_READ: CharacterImportPreview = { ok: false, canceled: false, code: null, token: null, fileName: '', exportedAt: null, cards: [] }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Kartın portre dosyasını okur. Kartın portresi yoksa ya da dosyası okunamıyorsa null. */
async function readPortrait(app: AppState, imagesDir: string, player: PlayerProfile): Promise<{ image: LibraryImage; data: Buffer } | null> {
  const image = findImage(app, player.portraitId)
  if (!image || !isSafeFileName(image.fileName)) return null
  try {
    return { image, data: await fs.promises.readFile(path.join(imagesDir, image.fileName)) }
  } catch {
    return null
  }
}

// --- Dışa aktarma ---------------------------------------------------------

/** Boş olmayan kartları portre baytlarıyla toplar. Portre dosyası okunamayan kart portresiz alınır. */
export async function collectCards(app: AppState, imagesDir: string): Promise<{ cards: CharacterCard[]; missingPortraits: number[] }> {
  const cards: CharacterCard[] = []
  const missingPortraits: number[] = []
  for (const [slot, player] of app.players.entries()) {
    if (isPlayerPristine(player)) continue
    const portrait = await readPortrait(app, imagesDir, player)
    if (player.portraitId !== null && portrait === null) missingPortraits.push(slot)
    const card: CharacterCard = {
      slot,
      name: player.name,
      level: player.level,
      hp: player.hp,
      note: player.note,
      portrait: portrait ? { data: portrait.data, originalName: portrait.image.originalName } : null
    }
    // Tek içeriği okunamayan portre olan karttan geriye yazılacak bir şey kalmaz.
    if (!isBlankCard(card)) cards.push(card)
  }
  return { cards, missingPortraits }
}

function defaultFileName(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `DndOynatma-Karakterler-${date}.${CHARACTER_FILE_EXTENSION}`
}

/** Önce yan dosyaya yazar, sonra adını değiştirir: yarım kalan yazma var olan dosyayı bozmaz. */
async function writeWhole(target: string, data: Buffer): Promise<void> {
  const tempFile = `${target}.yaziliyor`
  try {
    await fs.promises.writeFile(tempFile, data)
    await fs.promises.rename(tempFile, target)
  } catch (error) {
    // Az önce bizim oluşturduğumuz yarım dosya; kullanıcı verisi değildir.
    await fs.promises.rm(tempFile, { force: true }).catch(() => undefined)
    throw error
  }
}

/** Kartları verilen dosyaya yazar. Pencere açmaz. */
export async function exportCharactersTo(deps: CharacterDeps, target: string): Promise<CharacterExportResult> {
  const { cards, missingPortraits } = await collectCards(deps.store.getState().app, deps.imagesDir)
  if (cards.length === 0) return NOT_EXPORTED
  for (const slot of missingPortraits) log.code('DND-203', `dışa aktarma: Oyuncu ${slot + 1} portresinin dosyası okunamadı`)

  try {
    const file = encodeCharacterFile(cards, { appVersion: deps.appVersion(), exportedAt: new Date().toISOString() })
    await writeWhole(target, file)
    log.info(`Karakterler dışa aktarıldı: ${cards.length} kart, ${file.length} bayt`)
  } catch (error) {
    log.code('DND-111', errorMessage(error))
    return { ...NOT_EXPORTED, code: 'DND-111' }
  }
  return { ok: true, canceled: false, code: null, fileName: path.basename(target), count: cards.length, missingPortraits }
}

export async function exportCharacters(deps: CharacterDeps, parent: BrowserWindow | null): Promise<CharacterExportResult> {
  if (deps.store.getState().app.players.every(isPlayerPristine)) return NOT_EXPORTED

  const options: SaveDialogOptions = {
    title: 'Karakterleri dışa aktar',
    buttonLabel: 'Dışa aktar',
    defaultPath: defaultFileName(new Date()),
    filters: FILE_FILTERS
  }
  const picked = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (picked.canceled || !picked.filePath) return { ...NOT_EXPORTED, canceled: true }

  const target = path.extname(picked.filePath) === '' ? `${picked.filePath}.${CHARACTER_FILE_EXTENSION}` : picked.filePath
  return exportCharactersTo(deps, target)
}

// --- İçe aktarma ----------------------------------------------------------

/** Okunmuş, onay bekleyen dosya. Aynı anda yalnızca bir tane tutulur. */
let pending: { token: string; cards: DecodedCard[] } | null = null

async function readCharacterFile(filePath: string): Promise<DecodeResult> {
  try {
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) return { ok: false, code: 'DND-112', detail: 'dosya değil' }
    if (stat.size > MAX_CHARACTER_FILE_BYTES) return { ok: false, code: 'DND-112', detail: `dosya çok büyük (${stat.size} bayt)` }
    return decodeCharacterFile(await fs.promises.readFile(filePath))
  } catch (error) {
    return { ok: false, code: 'DND-112', detail: `okunamadı (${errorMessage(error)})` }
  }
}

/** Kart şu an dosyadakiyle aynı mı (portrenin baytları dahil). */
async function isUnchanged(app: AppState, imagesDir: string, card: DecodedCard): Promise<boolean> {
  const player = app.players[card.slot]
  if (player.name !== card.name || player.level !== card.level || player.hp !== card.hp || player.note !== card.note) return false
  if (card.portrait === null) return player.portraitId === null
  const current = await readPortrait(app, imagesDir, player)
  return current !== null && current.data.equals(card.portrait.data)
}

/** Dosyayı okur ve denetler; kartlara dokunmaz. Dosya sağlamsa onay bekleyen dosya olarak tutulur. */
export async function previewCharacterFile(deps: CharacterDeps, filePath: string): Promise<CharacterImportPreview> {
  pending = null
  const fileName = path.basename(filePath)
  const decoded = await readCharacterFile(filePath)
  if (!decoded.ok) {
    log.code(decoded.code, decoded.detail)
    return { ...NOT_READ, code: decoded.code, fileName }
  }

  const app = deps.store.getState().app
  const cards: IncomingCard[] = []
  for (const card of decoded.cards) {
    cards.push({
      slot: card.slot,
      name: card.name,
      level: card.level,
      hp: card.hp,
      hasNote: card.note !== '',
      hasPortrait: card.portrait !== null,
      unchanged: await isUnchanged(app, deps.imagesDir, card)
    })
  }
  pending = { token: randomUUID(), cards: decoded.cards }
  log.info(`Karakter dosyası okundu: ${cards.length} kart`)
  return { ok: true, canceled: false, code: null, token: pending.token, fileName, exportedAt: decoded.exportedAt, cards }
}

export async function pickCharacterImport(deps: CharacterDeps, parent: BrowserWindow | null): Promise<CharacterImportPreview> {
  const options: OpenDialogOptions = {
    title: 'Karakterleri içe aktar',
    buttonLabel: 'Aç',
    properties: ['openFile'],
    filters: FILE_FILTERS
  }
  const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (picked.canceled || picked.filePaths.length === 0) return { ...NOT_READ, canceled: true }
  return previewCharacterFile(deps, picked.filePaths[0])
}

/**
 * Onay bekleyen dosyadaki kartları aynı numaralı kartların yerine koyar. Dosyada olmayan
 * kartlara dokunulmaz. Yerine geçilen kartın eski portresi Geri Dönüşüm Kutusu'na gider.
 */
export async function applyCharacterImport(deps: CharacterDeps, token: unknown): Promise<CharacterImportResult> {
  if (pending === null || pending.token !== token) {
    log.code('DND-306', 'karakter içe aktarma: onay bekleyen dosya yok')
    return { ok: false, code: 'DND-306', slots: [] }
  }
  const { cards } = pending
  pending = null
  const { store, imagesDir } = deps

  const before = store.getState().app
  const changing: DecodedCard[] = []
  for (const card of cards) {
    if (!(await isUnchanged(before, imagesDir, card))) changing.push(card)
  }

  // Önce bütün portreler yazılır; biri yazılamazsa kartlara hiç dokunulmaz.
  const portraitIds = new Map<number, ID | null>()
  const written: LibraryImage[] = []
  const failure = (detail: string): CharacterImportResult => {
    for (const image of written) discardCopiedImage(imagesDir, image.fileName)
    log.code('DND-202', `karakter içe aktarma: ${detail}`)
    return { ok: false, code: 'DND-202', slots: [] }
  }
  try {
    for (const card of changing) {
      if (card.portrait === null) {
        portraitIds.set(card.slot, null)
        continue
      }
      const { data, size, originalName } = card.portrait
      // Yalnızca isim ya da can değiştiyse aynı portre yeniden yazılmaz, eskisi de çöpe gitmez.
      const current = await readPortrait(before, imagesDir, before.players[card.slot])
      if (current !== null && current.data.equals(data)) {
        portraitIds.set(card.slot, current.image.id)
        continue
      }
      const image = await writeLibraryImage(imagesDir, 'portrait', data, size, originalName)
      written.push(image)
      portraitIds.set(card.slot, image.id)
    }
  } catch (error) {
    return failure(`portre yazılamadı (${errorMessage(error)})`)
  }

  if (written.length > 0 && !store.dispatch({ type: 'library/add', images: written }, { trusted: true })) {
    return failure('portreler kütüphaneye eklenemedi')
  }

  for (const card of changing) {
    const portraitId = portraitIds.get(card.slot) ?? null
    store.dispatch({ type: 'player/update', slot: card.slot, patch: { name: card.name, level: card.level, note: card.note, portraitId } })
    store.dispatch({ type: 'player/setHp', slot: card.slot, hp: card.hp })
  }

  const after = store.getState().app
  const slots = changing.map((card) => card.slot).filter((slot) => after.players[slot] !== before.players[slot])
  log.info(`Karakterler içe aktarıldı: ${slots.length} kart`)
  return { ok: true, code: null, slots }
}

export function cancelCharacterImport(token: unknown): void {
  if (pending !== null && pending.token === token) pending = null
}
