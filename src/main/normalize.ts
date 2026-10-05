/**
 * Diskten okunan kaydı doğrular ve onarır. Elle düzenlenmiş ya da yarım kalmış bir
 * kayıt uygulamayı çökertmesin diye her alan tek tek denetlenir.
 */
import {
  AppSettings,
  AppState,
  ID,
  ImageKind,
  LibraryImage,
  MAX_HP,
  MAX_LEVEL,
  MAX_PLAYERS,
  MIN_LEVEL,
  PlayerProfile,
  SCHEMA_VERSION,
  SceneWindow,
  StageItem,
  createEmptyPlayer,
  createInitialAppState
} from '@shared/types'
import { isSafeFileName } from './fileNames'

const IMAGE_KINDS: readonly ImageKind[] = [
  'npc',
  'merchant',
  'place',
  'scene',
  'enemy',
  'boss',
  'teamItem',
  'item',
  'portrait'
]

const UNKNOWN_DATE = new Date(0).toISOString()

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is ID {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Girdi bir nesne değilse null döner; aksi halde her zaman geçerli bir kayıt üretir. */
export function normalizeAppState(raw: unknown): AppState | null {
  if (!isRecord(raw)) return null

  const library = normalizeLibrary(raw.library)
  const imageIds = new Set(library.map((image) => image.id))
  const scenes = normalizeScenes(raw.scenes, imageIds)
  const activeSceneId = scenes.some((scene) => scene.id === raw.activeSceneId) ? (raw.activeSceneId as ID) : null

  return {
    schema: SCHEMA_VERSION,
    players: normalizePlayers(raw.players, imageIds),
    library,
    scenes,
    activeSceneId,
    generalNote: text(raw.generalNote),
    settings: normalizeSettings(raw.settings)
  }
}

function normalizePlayers(raw: unknown, imageIds: ReadonlySet<ID>): PlayerProfile[] {
  const list = Array.isArray(raw) ? raw : []
  return Array.from({ length: MAX_PLAYERS }, (_, slot) => normalizePlayer(list[slot], imageIds))
}

function normalizePlayer(raw: unknown, imageIds: ReadonlySet<ID>): PlayerProfile {
  if (!isRecord(raw)) return createEmptyPlayer()
  return {
    portraitId: isId(raw.portraitId) && imageIds.has(raw.portraitId) ? raw.portraitId : null,
    name: text(raw.name),
    level: clampInt(raw.level, MIN_LEVEL, MAX_LEVEL, MIN_LEVEL),
    hp: clampInt(raw.hp, 0, MAX_HP, MAX_HP),
    note: text(raw.note)
  }
}

function normalizeLibrary(raw: unknown): LibraryImage[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<ID>()
  const result: LibraryImage[] = []
  for (const entry of raw) {
    const image = normalizeImage(entry)
    if (!image || seen.has(image.id)) continue
    seen.add(image.id)
    result.push(image)
  }
  return result
}

function normalizeImage(raw: unknown): LibraryImage | null {
  if (!isRecord(raw)) return null
  if (!isId(raw.id) || !isSafeFileName(raw.fileName)) return null
  if (!IMAGE_KINDS.includes(raw.kind as ImageKind)) return null
  if (!isPositive(raw.width) || !isPositive(raw.height)) return null
  return {
    id: raw.id,
    kind: raw.kind as ImageKind,
    fileName: raw.fileName,
    originalName: text(raw.originalName),
    width: raw.width,
    height: raw.height,
    addedAt: text(raw.addedAt, UNKNOWN_DATE)
  }
}

function normalizeScenes(raw: unknown, imageIds: ReadonlySet<ID>): SceneWindow[] {
  if (!Array.isArray(raw)) return []
  const seenIds = new Set<ID>()
  const usedHotkeys = new Set<number>()
  const result: SceneWindow[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || !isId(entry.id) || seenIds.has(entry.id)) continue
    seenIds.add(entry.id)

    // Aynı tuş iki pencerede olamaz; ilk pencere tuşu korur.
    let hotkey: number | null = null
    if (Number.isInteger(entry.hotkey) && (entry.hotkey as number) >= 1 && (entry.hotkey as number) <= 9) {
      if (!usedHotkeys.has(entry.hotkey as number)) {
        hotkey = entry.hotkey as number
        usedHotkeys.add(hotkey)
      }
    }

    const itemIds = new Set<ID>()
    const background = normalizeStageItem(entry.background, imageIds, itemIds)
    const items: StageItem[] = []
    for (const rawItem of Array.isArray(entry.items) ? entry.items : []) {
      const item = normalizeStageItem(rawItem, imageIds, itemIds)
      if (item) items.push(item)
    }

    result.push({ id: entry.id, name: text(entry.name), hotkey, background, items })
  }
  return result
}

function normalizeStageItem(raw: unknown, imageIds: ReadonlySet<ID>, usedIds: Set<ID>): StageItem | null {
  if (!isRecord(raw)) return null
  if (!isId(raw.id) || usedIds.has(raw.id)) return null
  if (!isId(raw.imageId) || !imageIds.has(raw.imageId)) return null
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null
  if (!isPositive(raw.width) || !isPositive(raw.height)) return null
  usedIds.add(raw.id)
  return {
    id: raw.id,
    imageId: raw.imageId,
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
    // Döndürme sonradan eklendi; eski kayıtlarda bu alan yoktur.
    rotation: isFiniteNumber(raw.rotation) ? (Math.round((((raw.rotation % 360) + 360) % 360) * 100) / 100) % 360 : 0,
    label: text(raw.label)
  }
}

function normalizeSettings(raw: unknown): AppSettings {
  const defaults = createInitialAppState().settings
  if (!isRecord(raw)) return defaults
  return {
    gameDisplayId: isFiniteNumber(raw.gameDisplayId) ? raw.gameDisplayId : null,
    controlDisplayId: isFiniteNumber(raw.controlDisplayId) ? raw.controlDisplayId : null,
    gameFullscreen: typeof raw.gameFullscreen === 'boolean' ? raw.gameFullscreen : defaults.gameFullscreen
  }
}
