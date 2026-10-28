/**
 * Diskten okunan kaydı doğrular ve onarır. Elle düzenlenmiş ya da yarım kalmış bir
 * kayıt uygulamayı çökertmesin diye her alan tek tek denetlenir.
 */
import { MAX_AMBIENTS, MIN_VIDEO_LOOP } from '@shared/reducer'
import {
  AmbientSound,
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
  DEFAULT_AMBIENT_VOLUME,
  MusicLibrary,
  MusicTrack,
  VideoLoop,
  createEmptyMusic,
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
  const music = normalizeMusic(raw.music)
  const videoIds = new Set(music.tracks.filter((track) => track.loop !== null).map((track) => track.id))
  const scenes = normalizeScenes(raw.scenes, imageIds, videoIds)
  const activeSceneId = scenes.some((scene) => scene.id === raw.activeSceneId) ? (raw.activeSceneId as ID) : null

  return {
    schema: SCHEMA_VERSION,
    players: normalizePlayers(raw.players, imageIds),
    library,
    scenes,
    activeSceneId,
    generalNote: text(raw.generalNote),
    settings: normalizeSettings(raw.settings),
    music
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

function normalizeScenes(raw: unknown, imageIds: ReadonlySet<ID>, videoIds: ReadonlySet<ID>): SceneWindow[] {
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

    // Hareketli arka plan sonradan eklendi; eski kayıtlarda bu alan yoktur. Görsel arka planla birlikte olamaz.
    const videoTrackId = background === null && isId(entry.videoTrackId) && videoIds.has(entry.videoTrackId) ? entry.videoTrackId : null

    result.push({ id: entry.id, name: text(entry.name), hotkey, background, videoTrackId, items })
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

/** Müzik sonradan eklendi; eski kayıtlarda bu alan yoktur. */
function normalizeMusic(raw: unknown): MusicLibrary {
  const defaults = createEmptyMusic()
  if (!isRecord(raw)) return defaults

  const usedIds = new Set<ID>()
  const tracks: MusicTrack[] = []
  for (const entry of Array.isArray(raw.tracks) ? raw.tracks : []) {
    if (!isRecord(entry) || !isId(entry.id) || usedIds.has(entry.id) || !isSafeFileName(entry.fileName)) continue
    usedIds.add(entry.id)
    const hasVideo = entry.hasVideo === true
    tracks.push({
      id: entry.id,
      fileName: entry.fileName,
      originalName: text(entry.originalName),
      hasVideo,
      loop: hasVideo ? normalizeLoop(entry.loop) : null,
      addedAt: text(entry.addedAt, UNKNOWN_DATE)
    })
  }

  const ambients: AmbientSound[] = []
  for (const entry of Array.isArray(raw.ambients) ? raw.ambients : []) {
    if (!isRecord(entry) || !isId(entry.id) || usedIds.has(entry.id) || !isSafeFileName(entry.fileName)) continue
    if (ambients.length >= MAX_AMBIENTS) break
    usedIds.add(entry.id)
    ambients.push({
      id: entry.id,
      name: text(entry.name).trim() || 'Ortam sesi',
      fileName: entry.fileName,
      volume: volume(entry.volume, DEFAULT_AMBIENT_VOLUME),
      addedAt: text(entry.addedAt, UNKNOWN_DATE)
    })
  }

  return {
    tracks,
    ambients,
    musicVolume: volume(raw.musicVolume, defaults.musicVolume),
    ambientVolume: volume(raw.ambientVolume, defaults.ambientVolume),
    repeat: raw.repeat === 'off' || raw.repeat === 'all' || raw.repeat === 'one' ? raw.repeat : defaults.repeat
  }
}

function normalizeLoop(raw: unknown): VideoLoop | null {
  if (!isRecord(raw) || !isFiniteNumber(raw.start) || !isFiniteNumber(raw.end)) return null
  const start = Math.max(0, raw.start)
  return raw.end - start >= MIN_VIDEO_LOOP ? { start, end: raw.end } : null
}

function volume(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? Math.min(1, Math.max(0, value)) : fallback
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
