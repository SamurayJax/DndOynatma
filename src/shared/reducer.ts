/**
 * Durum geçişleri. Saf fonksiyon: aynı girdiye aynı çıktı, yan etki yok, rastgelelik yok.
 *
 * İşlemler arayüzden IPC ile gelir; TypeScript tipleri çalışma anında garanti değildir.
 * Bu yüzden her alan kullanılmadan önce denetlenir. Geçersiz ya da hedefi artık olmayan
 * işlem durumu değiştirmez ve bir `issue` ile döner. Bir şey değişmediyse gelen `state`
 * nesnesinin aynısı döner; çağıran taraf yayını ve kaydı buna göre atlar.
 */
import { Action, ReduceIssue, ReduceResult } from './actions'
import { consumeEffects } from './character'
import { ErrorCode } from './errors'
import { categoryInfo, containRect, coverRect, findImage, isPlayerPristine, playArea, Rect } from './layout'
import {
  AmbientSound,
  AppSettings,
  CharacterClass,
  isAbility,
  MAX_ABILITY,
  MIN_ABILITY,
  PlayerEffect,
  Skill,
  AppState,
  createEmptyPlayer,
  FullState,
  ID,
  ImageKind,
  LibraryImage,
  MusicLibrary,
  MusicTrack,
  Playback,
  RepeatMode,
  VideoLoop,
  MAX_HP,
  MAX_LEVEL,
  MAX_PLAYERS,
  MIN_ITEM_SIZE,
  MIN_LEVEL,
  PenWidth,
  PlayerProfile,
  SceneWindow,
  SessionState,
  StageItem,
  Tool
} from './types'

/** Metin alanlarının üst sınırları (karakter). */
export const TEXT_LIMITS = {
  playerName: 24,
  playerNote: 2000,
  sceneName: 40,
  itemLabel: 40,
  generalNote: 20000,
  trackName: 80,
  ambientName: 24,
  className: 30,
  skillName: 30,
  effectLabel: 40
} as const

export const MIN_HOTKEY = 1
export const MAX_HOTKEY = 9
/** Hareketli arka planın en kısa döngüsü (saniye); daha kısası titrer. */
export const MIN_VIDEO_LOOP = 0.5
export const MAX_AMBIENTS = 24
export const MAX_CLASSES = 30
export const MAX_SKILLS = 40
/** Bir oyuncudaki geçici artı / eksi sayısı. */
export const MAX_EFFECTS = 12
export const MAX_EFFECT_VALUE = 20
export const MAX_EFFECT_ROLLS = 99
export const MAX_REQUIREMENT = 40
export const DEFAULT_REQUIREMENT = 10
export const MAX_PROFICIENCY = 20

const TOOLS: readonly Tool[] = ['mouse', 'pen-red', 'pen-black', 'eraser']
const REPEAT_MODES: readonly RepeatMode[] = ['off', 'all', 'one']
const PEN_WIDTHS: readonly PenWidth[] = ['thin', 'medium', 'thick']
const REORDER_TARGETS = ['front', 'back', 'forward', 'backward'] as const
const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'rotation'] as const
const FALLBACK_SCENE_NAME = 'Pencere 1'
/** Boyut farkı bunun altındaysa kayan nokta gürültüsüdür; öğe değişmemiş sayılır. */
const SIZE_EPSILON = 1e-6

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>
type ItemPatch = Partial<Pick<StageItem, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'label'>>
interface Size {
  width: number
  height: number
}

export function reduce(state: FullState, action: Action): ReduceResult {
  if (!isObject(action)) return reject(state, 'DND-306', `İşlem bir nesne değil: ${show(action)}`)

  switch (action.type) {
    case 'player/update':
      return updatePlayer(state, action)
    case 'player/setHp':
      return changeHp(state, action.slot, action.hp, false)
    case 'player/adjustHp':
      return changeHp(state, action.slot, action.delta, true)
    case 'player/clear':
      return clearPlayer(state, action)
    case 'player/setAbility':
      return setAbility(state, action)
    case 'player/addEffect':
      return addEffect(state, action)
    case 'player/removeEffect':
      return removeEffect(state, action)
    case 'player/consumeEffects':
      return consumePlayerEffects(state, action)

    case 'class/add':
      return addClass(state, action)
    case 'class/update':
      return renameClass(state, action)
    case 'class/remove':
      return removeClass(state, action)
    case 'class/move':
      return moveClass(state, action)
    case 'skill/add':
      return addSkill(state, action)
    case 'skill/update':
      return updateSkill(state, action)
    case 'skill/remove':
      return removeSkill(state, action)
    case 'skill/move':
      return moveSkill(state, action)

    case 'library/add':
      return addImages(state, action)
    case 'library/remove':
      return removeImage(state, action)
    case 'library/setKind':
      return setImageKind(state, action)

    case 'scene/add':
      return addScene(state, action)
    case 'scene/update':
      return updateScene(state, action)
    case 'scene/remove':
      return removeScene(state, action)
    case 'scene/setActive':
      return setActiveScene(state, action)
    case 'scene/activateHotkey':
      return activateHotkey(state, action)

    case 'stage/setBackground':
    case 'stage/addItem':
      return placeImage(state, action)
    case 'stage/clearBackground':
      return clearBackground(state, action)
    case 'stage/updateItem':
      return updateItem(state, action)
    case 'stage/removeItem':
      return removeItem(state, action)
    case 'stage/reorderItem':
      return reorderItem(state, action)
    case 'stage/clearItems':
      return clearItems(state, action)

    case 'scene/setVideo':
      return setSceneVideo(state, action)

    case 'music/addTracks':
      return addTracks(state, action)
    case 'music/removeTrack':
      return removeTrack(state, action)
    case 'music/renameTrack':
      return renameTrack(state, action)
    case 'music/moveTrack':
      return moveTrack(state, action)
    case 'music/setLoop':
      return setTrackLoop(state, action)
    case 'music/setVolume':
      return setMusicLevel(state, 'musicVolume', action.volume)
    case 'music/setAmbientVolume':
      return setMusicLevel(state, 'ambientVolume', action.volume)
    case 'music/setRepeat':
      return setRepeat(state, action)
    case 'ambient/add':
      return addAmbient(state, action)
    case 'ambient/update':
      return updateAmbient(state, action)
    case 'ambient/remove':
      return removeAmbient(state, action)

    case 'playback/play':
      return playTrack(state, action)
    case 'playback/pause':
      return setPlaying(state, false)
    case 'playback/resume':
      return setPlaying(state, true)
    case 'playback/seek':
      return seek(state, action)
    case 'playback/next':
      return stepTrack(state, 1, false)
    case 'playback/previous':
      return stepTrack(state, -1, false)
    case 'playback/stop':
      return stopPlayback(state)
    case 'playback/ended':
      return trackEnded(state, action)
    case 'ambient/toggle':
      return toggleAmbient(state, action)
    case 'ambient/stopAll':
      return state.session.playback.ambientIds.length === 0
        ? { state }
        : { state: withPlayback(state, { ...state.session.playback, ambientIds: [] }) }

    case 'note/setGeneral':
      return setGeneralNote(state, action)
    case 'settings/update':
      return updateSettings(state, action)

    case 'session/setTool':
      return setTool(state, action)
    case 'session/setPenWidth':
      return setPenWidth(state, action)
    case 'session/clearDrawing':
      return { state: withSession(state, bumpNonce(state.session)) }

    default:
      return reject(state, 'DND-306', `Tanınmayan işlem türü: ${show((action as { type?: unknown }).type)}`)
  }
}

// --- Oyuncular ---------------------------------------------------------------

function updatePlayer(state: FullState, action: ActionOf<'player/update'>): ReduceResult {
  const current = playerAt(state.app, action.slot)
  if (!current) return invalidSlot(state, action.slot)
  const patch: unknown = action.patch
  if (!isRecord(patch)) return reject(state, 'DND-306', 'player/update: patch bir nesne değil.')

  // Alanlar birbirinden bağımsız; yanlış tipte gelen alan atlanır, diğerleri uygulanır.
  // İsim kırpılmaz (trim): yazarken sondaki boşluğun silinmesi imleci zıplatır.
  const { name, level, note, portraitId, classId, proficiency } = patch
  const next: PlayerProfile = {
    ...current,
    name: typeof name === 'string' ? truncate(name, TEXT_LIMITS.playerName) : current.name,
    level: isFiniteNumber(level) ? clamp(Math.round(level), MIN_LEVEL, MAX_LEVEL) : current.level,
    note: typeof note === 'string' ? truncate(note, TEXT_LIMITS.playerNote) : current.note,
    portraitId: isPortraitChoice(state.app, portraitId) ? portraitId : current.portraitId,
    classId: classId === null || (typeof classId === 'string' && classById(state.app, classId)) ? (classId as ID | null) : current.classId,
    proficiency:
      proficiency === null ? null : isFiniteNumber(proficiency) ? clamp(Math.round(proficiency), 0, MAX_PROFICIENCY) : current.proficiency
  }
  return shallowEqual(current, next) ? { state } : commitPlayer(state, action.slot, next)
}

function changeHp(state: FullState, slot: number, amount: unknown, relative: boolean): ReduceResult {
  const current = playerAt(state.app, slot)
  if (!current) return invalidSlot(state, slot)
  if (!isFiniteNumber(amount)) return reject(state, 'DND-306', `Can değeri sayı değil: ${show(amount)}`)

  const hp = clamp(Math.round(relative ? current.hp + amount : amount), 0, MAX_HP)
  return hp === current.hp ? { state } : commitPlayer(state, slot, { ...current, hp })
}

function clearPlayer(state: FullState, action: ActionOf<'player/clear'>): ReduceResult {
  const current = playerAt(state.app, action.slot)
  if (!current) return invalidSlot(state, action.slot)
  return isPlayerPristine(current) ? { state } : commitPlayer(state, action.slot, createEmptyPlayer())
}

function setAbility(state: FullState, action: ActionOf<'player/setAbility'>): ReduceResult {
  const current = playerAt(state.app, action.slot)
  if (!current) return invalidSlot(state, action.slot)
  const ability: unknown = action.ability
  if (!isAbility(ability)) return reject(state, 'DND-306', `player/setAbility: istatistik geçersiz: ${show(ability)}`)
  if (!isFiniteNumber(action.value)) return reject(state, 'DND-306', `player/setAbility: değer sayı değil: ${show(action.value)}`)
  const value = clamp(Math.round(action.value), MIN_ABILITY, MAX_ABILITY)
  if (current.abilities[ability] === value) return { state }
  return commitPlayer(state, action.slot, { ...current, abilities: { ...current.abilities, [ability]: value } })
}

function addEffect(state: FullState, action: ActionOf<'player/addEffect'>): ReduceResult {
  const current = playerAt(state.app, action.slot)
  if (!current) return invalidSlot(state, action.slot)
  const raw: unknown = action.effect
  if (!isRecord(raw) || !isId(raw.id) || !isFiniteNumber(raw.value)) return reject(state, 'DND-306', 'player/addEffect: etki eksik ya da hatalı alanlı.')
  if (current.effects.some((effect) => effect.id === raw.id)) return { state }
  if (current.effects.length >= MAX_EFFECTS) return reject(state, 'DND-306', `player/addEffect: bir oyuncuda en fazla ${MAX_EFFECTS} etki olabilir.`)
  const value = clamp(Math.round(raw.value), -MAX_EFFECT_VALUE, MAX_EFFECT_VALUE)
  if (value === 0) return reject(state, 'DND-306', 'player/addEffect: etkinin değeri 0 olamaz.')
  const rolls = raw.rolls === null ? null : isFiniteNumber(raw.rolls) ? clamp(Math.round(raw.rolls), 1, MAX_EFFECT_ROLLS) : 1
  const label = typeof raw.label === 'string' ? truncate(raw.label.trim(), TEXT_LIMITS.effectLabel).trimEnd() : ''
  const effect: PlayerEffect = { id: raw.id, label: label || (value > 0 ? 'Artı' : 'Eksi'), value, rolls }
  return commitPlayer(state, action.slot, { ...current, effects: [...current.effects, effect] })
}

function removeEffect(state: FullState, action: ActionOf<'player/removeEffect'>): ReduceResult {
  const current = playerAt(state.app, action.slot)
  if (!current) return invalidSlot(state, action.slot)
  const effects = current.effects.filter((effect) => effect.id !== action.effectId)
  if (effects.length === current.effects.length) return reject(state, 'DND-302', `Etki bulunamadı: ${show(action.effectId)}`)
  return commitPlayer(state, action.slot, { ...current, effects })
}

function consumePlayerEffects(state: FullState, action: ActionOf<'player/consumeEffects'>): ReduceResult {
  const current = playerAt(state.app, action.slot)
  if (!current) return invalidSlot(state, action.slot)
  const effects = consumeEffects(current)
  return effects === current.effects ? { state } : commitPlayer(state, action.slot, { ...current, effects })
}

function playerAt(app: AppState, slot: unknown): PlayerProfile | undefined {
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) return undefined
  return app.players[slot]
}

function invalidSlot(state: FullState, slot: unknown): ReduceResult {
  return reject(state, 'DND-307', `Oyuncu yuvası geçersiz: ${show(slot)}`)
}

function isPortraitChoice(app: AppState, value: unknown): value is ID | null {
  if (value === null) return true
  return typeof value === 'string' && findImage(app, value)?.kind === 'portrait'
}

/** Yuvaya yeni profili yazar; portre değiştiyse boşa çıkan eski görseli kütüphaneden düşer. */
function commitPlayer(state: FullState, slot: number, next: PlayerProfile): ReduceResult {
  const app = state.app
  const previous = app.players[slot]
  const players = app.players.map((player, index) => (index === slot ? next : player))
  const library =
    previous.portraitId === next.portraitId
      ? app.library
      : dropOrphanPortrait(app.library, players, previous.portraitId)
  return { state: withApp(state, refitScenes(app, { ...app, players, library })) }
}

/**
 * Portre görselleri kütüphane bölmelerinde görünmediği için kullanıcı onları elle silemez.
 * Hiçbir oyuncu kullanmıyorsa burada kütüphaneden çıkar; dosyayı ana süreç siler.
 */
function dropOrphanPortrait(library: LibraryImage[], players: PlayerProfile[], portraitId: ID | null): LibraryImage[] {
  if (portraitId === null) return library
  if (players.some((player) => player.portraitId === portraitId)) return library
  const isOrphan = (image: LibraryImage): boolean => image.id === portraitId && image.kind === 'portrait'
  return library.some(isOrphan) ? library.filter((image) => !isOrphan(image)) : library
}

// --- Kütüphane ---------------------------------------------------------------

function addImages(state: FullState, action: ActionOf<'library/add'>): ReduceResult {
  const images: unknown = action.images
  if (!Array.isArray(images)) return reject(state, 'DND-306', 'library/add: images bir dizi değil.')

  const knownIds = new Set(state.app.library.map((image) => image.id))
  const added: LibraryImage[] = []
  let invalidCount = 0
  for (const candidate of images) {
    if (!isLibraryImage(candidate)) {
      invalidCount += 1
    } else if (!knownIds.has(candidate.id)) {
      knownIds.add(candidate.id)
      added.push({ ...candidate })
    }
  }

  // Boyutsuz ya da türsüz bir kayıt sahne hesaplarını bozar (sıfıra bölme); hiç alınmaz.
  const issue: ReduceIssue | undefined =
    invalidCount > 0
      ? { code: 'DND-306', detail: `library/add: ${invalidCount} görsel kaydı eksik ya da hatalı alanlı, atlandı.` }
      : undefined
  if (added.length === 0) return result(state, issue)
  return result(withApp(state, { ...state.app, library: [...state.app.library, ...added] }), issue)
}

function removeImage(state: FullState, action: ActionOf<'library/remove'>): ReduceResult {
  const app = state.app
  const image = imageById(app, action.imageId)
  if (!image) return imageNotFound(state, action.imageId)

  const imageId = image.id
  const library = app.library.filter((entry) => entry.id !== imageId)
  const scenes = mapChanged(app.scenes, (scene) => stripImage(scene, imageId))
  const players = mapChanged(app.players, (player) =>
    player.portraitId === imageId ? { ...player, portraitId: null } : player
  )
  // Portresi silinen isimsiz kart boşalır; son dolu kartsa portre sütunu kalkar ve oyun alanı genişler.
  return { state: withApp(state, refitScenes(app, { ...app, library, scenes, players })) }
}

function stripImage(scene: SceneWindow, imageId: ID): SceneWindow {
  const usedByBackground = scene.background !== null && scene.background.imageId === imageId
  const usedByItems = scene.items.some((item) => item.imageId === imageId)
  if (!usedByBackground && !usedByItems) return scene
  return {
    ...scene,
    background: usedByBackground ? null : scene.background,
    items: usedByItems ? scene.items.filter((item) => item.imageId !== imageId) : scene.items
  }
}

function setImageKind(state: FullState, action: ActionOf<'library/setKind'>): ReduceResult {
  const app = state.app
  const image = imageById(app, action.imageId)
  if (!image) return imageNotFound(state, action.imageId)

  const kind: unknown = action.kind
  if (!isSwappableKind(image.kind) || !isSwappableKind(kind) || kind === image.kind) {
    return reject(
      state,
      'DND-306',
      `Bölme değişimi yalnızca İtemler ile Takım Eşyaları arasında yapılır: ${show(image.kind)} -> ${show(kind)}`
    )
  }
  const library = app.library.map((entry) => (entry === image ? { ...image, kind } : entry))
  return { state: withApp(state, { ...app, library }) }
}

function isSwappableKind(kind: unknown): kind is 'item' | 'teamItem' {
  return kind === 'item' || kind === 'teamItem'
}

function isImageKind(value: unknown): value is ImageKind {
  return typeof value === 'string' && (value === 'portrait' || categoryInfo(value as ImageKind) !== undefined)
}

function isLibraryImage(value: unknown): value is LibraryImage {
  if (!isRecord(value)) return false
  return (
    isId(value.id) &&
    isImageKind(value.kind) &&
    isId(value.fileName) &&
    typeof value.originalName === 'string' &&
    typeof value.addedAt === 'string' &&
    isPositiveNumber(value.width) &&
    isPositiveNumber(value.height)
  )
}

// --- Pencereler --------------------------------------------------------------

function addScene(state: FullState, action: ActionOf<'scene/add'>): ReduceResult {
  const app = state.app
  const sceneId: unknown = action.sceneId
  if (!isId(sceneId)) return reject(state, 'DND-306', `scene/add: pencere kimliği geçersiz: ${show(sceneId)}`)
  if (app.scenes.some((scene) => scene.id === sceneId)) {
    return reject(state, 'DND-306', `scene/add: bu kimlikle bir pencere zaten var: ${show(sceneId)}`)
  }

  const name = cleanSceneName(action.name) || `Pencere ${app.scenes.length + 1}`
  const hasActive = sceneById(app, app.activeSceneId) !== undefined
  return {
    state: withApp(state, {
      ...app,
      scenes: [...app.scenes, createScene(sceneId, name)],
      activeSceneId: hasActive ? app.activeSceneId : sceneId
    })
  }
}

function updateScene(state: FullState, action: ActionOf<'scene/update'>): ReduceResult {
  const app = state.app
  const scene = sceneById(app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  const patch: unknown = action.patch
  if (!isRecord(patch)) return reject(state, 'DND-306', 'scene/update: patch bir nesne değil.')

  // Boş isim yok sayılır: pencere listesinde adsız satır kalmasın.
  const name = cleanSceneName(patch.name) || scene.name
  let hotkey = scene.hotkey
  if (patch.hotkey !== undefined) {
    if (patch.hotkey !== null && !isHotkey(patch.hotkey)) {
      return reject(state, 'DND-306', `Atama tuşu ${MIN_HOTKEY}-${MAX_HOTKEY} arası olmalı: ${show(patch.hotkey)}`)
    }
    hotkey = patch.hotkey
  }
  if (name === scene.name && hotkey === scene.hotkey) return { state }

  // Aynı tuş yalnızca bir pencerede olabilir; yeni atama eskisini boşaltır.
  const holdsSameHotkey = (other: SceneWindow): boolean => other !== scene && hotkey !== null && other.hotkey === hotkey
  const previousOwner = app.scenes.find(holdsSameHotkey)
  const scenes = app.scenes.map((other) => {
    if (other === scene) return { ...scene, name, hotkey }
    return holdsSameHotkey(other) ? { ...other, hotkey: null } : other
  })
  // Ayrıntı loga yazılır; loga kullanıcı metni (pencere adı) girmez, yalnızca kimlik ve tuş.
  const issue: ReduceIssue | undefined = previousOwner
    ? { code: 'DND-303', detail: `${hotkey} tuşu ${show(previousOwner.id)} penceresinden alındı, ${show(scene.id)} penceresine verildi.` }
    : undefined
  return result(withApp(state, { ...app, scenes }), issue)
}

function removeScene(state: FullState, action: ActionOf<'scene/remove'>): ReduceResult {
  const app = state.app
  const scene = sceneById(app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)

  const scenes = app.scenes.filter((other) => other !== scene)
  if (app.activeSceneId !== scene.id) return { state: withApp(state, { ...app, scenes }) }

  const activeSceneId = scenes.length > 0 ? scenes[0].id : null
  return { state: withApp(state, { ...app, scenes, activeSceneId }) }
}

function setActiveScene(state: FullState, action: ActionOf<'scene/setActive'>): ReduceResult {
  const scene = sceneById(state.app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  return activateScene(state, scene)
}

function activateHotkey(state: FullState, action: ActionOf<'scene/activateHotkey'>): ReduceResult {
  const hotkey: unknown = action.hotkey
  // Tip denetimi şart: null gelirse tuşu atanmamış ilk pencereyle eşleşirdi.
  if (typeof hotkey !== 'number') return reject(state, 'DND-306', `Atama tuşu geçersiz: ${show(hotkey)}`)
  const scene = state.app.scenes.find((other) => other.hotkey === hotkey)
  // Kimseye atanmamış tuşa (0 dahil) basmak olağan bir durum; kayda geçecek bir şey yok.
  return scene ? activateScene(state, scene) : { state }
}

/** Çizimler pencereye aittir ve oyun ekranında tutulur; pencere değişimi onları silmez. */
function activateScene(state: FullState, scene: SceneWindow): ReduceResult {
  if (state.app.activeSceneId === scene.id) return { state }
  return { state: withApp(state, { ...state.app, activeSceneId: scene.id }) }
}

function createScene(id: ID, name: string): SceneWindow {
  return { id, name, hotkey: null, background: null, videoTrackId: null, items: [] }
}

function cleanSceneName(name: unknown): string {
  if (typeof name !== 'string') return ''
  // Kesme sonrası sonda boşluk kalabilir.
  return truncate(name.trim(), TEXT_LIMITS.sceneName).trimEnd()
}

function isHotkey(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_HOTKEY && value <= MAX_HOTKEY
}

// --- Oyun alanı --------------------------------------------------------------

interface TargetScene {
  scene: SceneWindow
  /** true ise pencere bu işlemle oluşturuluyor; henüz `app.scenes` içinde değil. */
  isNew: boolean
  activeSceneId: ID | null
}

/** `stage/setBackground` ve `stage/addItem` için hedef pencere: verilen, yoksa etkin, o da yoksa yeni. */
function resolveTargetScene(app: AppState, sceneId: unknown, fallbackSceneId: unknown): TargetScene | ReduceIssue {
  if (sceneId !== undefined && sceneId !== null) {
    const scene = sceneById(app, sceneId)
    if (!scene) return { code: 'DND-301', detail: `Pencere bulunamadı: ${show(sceneId)}` }
    return { scene, isNew: false, activeSceneId: app.activeSceneId }
  }

  const active = sceneById(app, app.activeSceneId)
  if (active) return { scene: active, isNew: false, activeSceneId: app.activeSceneId }

  // Pencere var ama etkin olan yok (elle düzenlenmiş kayıt gibi): ilki etkin sayılır.
  if (app.scenes.length > 0) return { scene: app.scenes[0], isNew: false, activeSceneId: app.scenes[0].id }

  if (!isId(fallbackSceneId)) {
    return { code: 'DND-306', detail: `Yeni pencere için kimlik geçersiz: ${show(fallbackSceneId)}` }
  }
  return { scene: createScene(fallbackSceneId, FALLBACK_SCENE_NAME), isNew: true, activeSceneId: fallbackSceneId }
}

function placeImage(state: FullState, action: ActionOf<'stage/setBackground' | 'stage/addItem'>): ReduceResult {
  const app = state.app
  const asBackground = action.type === 'stage/setBackground'
  const itemId: unknown = action.itemId
  if (!isId(itemId)) return reject(state, 'DND-306', `${action.type}: öğe kimliği geçersiz: ${show(itemId)}`)

  const target = resolveTargetScene(app, action.sceneId, action.fallbackSceneId)
  if ('code' in target) return { state, issue: target }

  // Görsel denetimi pencere oluşturmadan önce: geçersiz görsel yüzünden boş pencere açılmasın.
  const image = imageById(app, action.imageId)
  if (!image || image.kind === 'portrait' || !hasValidSize(image)) return imageNotFound(state, action.imageId)

  const { scene } = target
  const replacesBackground = asBackground && scene.background !== null && scene.background.id === itemId
  if (findStageItem(scene, itemId) && !replacesBackground) {
    return reject(state, 'DND-306', `${action.type}: bu kimlikle bir öğe zaten var: ${show(itemId)}`)
  }

  const area = playArea(app)
  // Görsel arka plan konunca hareketli arka plan kalkar; ikisi aynı anda olmaz.
  const nextScene: SceneWindow = asBackground
    ? {
        ...scene,
        background: { id: itemId, imageId: image.id, ...coverRect(image.width, image.height, area), rotation: 0, label: '' },
        videoTrackId: null
      }
    : {
        ...scene,
        items: [...scene.items, { id: itemId, imageId: image.id, ...initialItemRect(image, area), rotation: 0, label: '' }]
      }
  const scenes = target.isNew ? [...app.scenes, nextScene] : app.scenes.map((other) => (other === scene ? nextScene : other))
  return { state: withApp(state, { ...app, scenes, activeSceneId: target.activeSceneId }) }
}

/**
 * Yeni konan görsel alanın ortasına oranıyla sığdırılır. Şerit gibi aşırı ince görselde kısa kenar
 * alt sınırın altına düşerdi (tutması zor, köşeden boyutlandırınca birden sıçrıyor); alt sınıra çekilir.
 */
function initialItemRect(image: Size, area: Rect): Rect {
  const rect = containRect(image.width, image.height, area)
  if (Math.min(rect.width, rect.height) >= MIN_ITEM_SIZE) return rect
  const size = fitSize({ width: rect.width }, image)
  return { x: area.x + (area.width - size.width) / 2, y: area.y + (area.height - size.height) / 2, ...size }
}

function clearBackground(state: FullState, action: ActionOf<'stage/clearBackground'>): ReduceResult {
  const scene = sceneById(state.app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  // Görsel ya da hareketli, hangisi varsa kalkar.
  if (scene.background === null && scene.videoTrackId === null) return { state }
  return { state: withScene(state, scene, { ...scene, background: null, videoTrackId: null }) }
}

function setSceneVideo(state: FullState, action: ActionOf<'scene/setVideo'>): ReduceResult {
  const scene = sceneById(state.app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  const trackId: unknown = action.trackId
  if (trackId === null) {
    return scene.videoTrackId === null ? { state } : { state: withScene(state, scene, { ...scene, videoTrackId: null }) }
  }
  const track = trackById(state.app, trackId)
  if (!track) return trackNotFound(state, trackId)
  if (!track.hasVideo || track.loop === null) {
    return reject(state, 'DND-306', `scene/setVideo: parçanın hareketli görüntüsü yok: ${show(trackId)}`)
  }
  if (scene.videoTrackId === track.id && scene.background === null) return { state }
  return { state: withScene(state, scene, { ...scene, videoTrackId: track.id, background: null }) }
}

function clearItems(state: FullState, action: ActionOf<'stage/clearItems'>): ReduceResult {
  const scene = sceneById(state.app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  if (scene.items.length === 0) return { state }
  return { state: withScene(state, scene, { ...scene, items: [] }) }
}

function updateItem(state: FullState, action: ActionOf<'stage/updateItem'>): ReduceResult {
  const scene = sceneById(state.app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  const item = findStageItem(scene, action.itemId)
  if (!item) return itemNotFound(state, action.itemId)

  // Konum ve boyut birbirine bağlı; yarısını uygulamak öğeyi yanlış yere koyar. Biri bozuksa hepsi reddedilir.
  const patch = parseItemPatch(action.patch)
  if (!patch) {
    return reject(state, 'DND-306', 'stage/updateItem: patch geçersiz (sayı olmayan konum/boyut ya da metin olmayan etiket).')
  }

  const next = applyItemPatch(item, patch, referenceSize(state.app, item), playArea(state.app))
  return next === item ? { state } : { state: withScene(state, scene, replaceStageItem(scene, item, next)) }
}

function removeItem(state: FullState, action: ActionOf<'stage/removeItem'>): ReduceResult {
  const scene = sceneById(state.app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  const item = findStageItem(scene, action.itemId)
  if (!item) return itemNotFound(state, action.itemId)

  const nextScene: SceneWindow =
    scene.background === item
      ? { ...scene, background: null }
      : { ...scene, items: scene.items.filter((other) => other !== item) }
  return { state: withScene(state, scene, nextScene) }
}

function reorderItem(state: FullState, action: ActionOf<'stage/reorderItem'>): ReduceResult {
  const scene = sceneById(state.app, action.sceneId)
  if (!scene) return sceneNotFound(state, action.sceneId)
  const to = action.to
  if (!REORDER_TARGETS.includes(to)) return reject(state, 'DND-306', `stage/reorderItem: yön geçersiz: ${show(to)}`)

  const index = scene.items.findIndex((item) => item.id === action.itemId)
  if (index === -1) {
    // Arka plan her zaman en alttadır; sırası değişmez ama var olan bir öğedir.
    return findStageItem(scene, action.itemId) ? { state } : itemNotFound(state, action.itemId)
  }

  const last = scene.items.length - 1
  const targetIndex =
    to === 'front' ? last : to === 'back' ? 0 : to === 'forward' ? Math.min(index + 1, last) : Math.max(index - 1, 0)
  if (targetIndex === index) return { state }

  const items = scene.items.slice()
  const [moved] = items.splice(index, 1)
  items.splice(targetIndex, 0, moved)
  return { state: withScene(state, scene, { ...scene, items }) }
}

/** Öğe önce üstteki görsellerde, sonra arka planda aranır. */
function findStageItem(scene: SceneWindow, itemId: unknown): StageItem | undefined {
  if (typeof itemId !== 'string') return undefined
  const item = scene.items.find((other) => other.id === itemId)
  if (item) return item
  return scene.background !== null && scene.background.id === itemId ? scene.background : undefined
}

function replaceStageItem(scene: SceneWindow, item: StageItem, next: StageItem): SceneWindow {
  return scene.background === item
    ? { ...scene, background: next }
    : { ...scene, items: scene.items.map((other) => (other === item ? next : other)) }
}

function parseItemPatch(raw: unknown): ItemPatch | null {
  if (!isRecord(raw)) return null
  const patch: ItemPatch = {}
  for (const key of GEOMETRY_KEYS) {
    const value = raw[key]
    if (value === undefined) continue
    if (!isFiniteNumber(value)) return null
    patch[key] = value
  }
  if (raw.label !== undefined) {
    if (typeof raw.label !== 'string') return null
    patch.label = raw.label
  }
  return patch
}

/** Oranın kaynağı kütüphanedeki görseldir; görsel bulunamazsa öğenin o anki oranı korunur. */
function referenceSize(app: AppState, item: StageItem): Size {
  const image = findImage(app, item.imageId)
  if (image && hasValidSize(image)) return image
  return hasValidSize(item) ? item : { width: 1, height: 1 }
}

/** Değişiklik yoksa aynı nesneyi döndürür. */
function applyItemPatch(item: StageItem, patch: ItemPatch, reference: Size, area: Rect): StageItem {
  let width = item.width
  let height = item.height
  if (patch.width !== undefined || patch.height !== undefined) {
    const size = fitSize(patch, reference)
    // Aynı boyut yeniden hesaplanınca son basamaklar oynayabilir; bu bir değişiklik değildir.
    if (Math.abs(size.width - width) > SIZE_EPSILON || Math.abs(size.height - height) > SIZE_EPSILON) {
      width = size.width
      height = size.height
    }
  }

  // Merkez oyun alanının içinde kalır; görsel dışarı sürüklenip ya da portre sütununun altına girip kaybolmaz.
  const { x, y } = clampCenter(patch.x ?? item.x, patch.y ?? item.y, width, height, area)
  const label = patch.label === undefined ? item.label : truncate(patch.label, TEXT_LIMITS.itemLabel)
  const rotation = patch.rotation === undefined ? item.rotation : normalizeRotation(patch.rotation)

  const next: StageItem = { ...item, x, y, width, height, rotation, label }
  return shallowEqual(item, next) ? item : next
}

/** Oran her zaman görselinkidir: genişlik verildiyse yükseklik, verilmediyse yükseklikten genişlik türetilir. */
function fitSize(patch: ItemPatch, reference: Size): Size {
  let width: number
  let height: number
  if (patch.width !== undefined) {
    width = patch.width
    height = (width * reference.height) / reference.width
  } else {
    height = patch.height ?? 0
    width = (height * reference.width) / reference.height
  }

  // Kısa kenar alt sınıra çekilir, uzun kenar orandan gelir. Sıfır ve eksi değerler de buraya düşer.
  if (Math.min(width, height) < MIN_ITEM_SIZE) {
    if (reference.width >= reference.height) {
      height = MIN_ITEM_SIZE
      width = (MIN_ITEM_SIZE * reference.width) / reference.height
    } else {
      width = MIN_ITEM_SIZE
      height = (MIN_ITEM_SIZE * reference.height) / reference.width
    }
  }
  return { width, height }
}

/**
 * Açıyı 0 <= açı < 360 aralığına çeker ve yüzde bir dereceye yuvarlar: tutamaçla döndürmede
 * 90 yerine 90.00000000000001 gibi değerler gelebiliyor, kayıtta ve karşılaştırmada temiz açı durmalı.
 */
function normalizeRotation(degrees: number): number {
  const turned = Math.round((((degrees % 360) + 360) % 360) * 100) / 100
  return turned >= 360 ? 0 : turned
}

function clampCenter(x: number, y: number, width: number, height: number, area: Rect): { x: number; y: number } {
  return {
    x: clamp(x, area.x - width / 2, area.x + area.width - width / 2),
    y: clamp(y, area.y - height / 2, area.y + area.height - height / 2)
  }
}

/**
 * İlk oyuncu kartı dolunca portre sütunu belirir ve oyun alanı daralır; son kart boşalınca genişler.
 * Merkezi yeni alanın dışında kalan öğe sütunun altında tutulamaz hale gelirdi; bütün pencerelerde
 * içeri çekilir. Yerine hiç dokunulmamış arka plan yeni alanı yeniden doldurur (boşluk kalmasın).
 */
function refitScenes(previous: AppState, next: AppState): AppState {
  const before = playArea(previous)
  const after = playArea(next)
  if (before.x === after.x && before.width === after.width) return next
  const scenes = mapChanged(next.scenes, (scene) => refitScene(next, scene, before, after))
  return scenes === next.scenes ? next : { ...next, scenes }
}

function refitScene(app: AppState, scene: SceneWindow, before: Rect, after: Rect): SceneWindow {
  const background = scene.background === null ? null : refitBackground(app, scene.background, before, after)
  const items = mapChanged(scene.items, (item) => moveIntoArea(item, after))
  return background === scene.background && items === scene.items ? scene : { ...scene, background, items }
}

function refitBackground(app: AppState, background: StageItem, before: Rect, after: Rect): StageItem {
  const image = findImage(app, background.imageId)
  if (image && hasValidSize(image) && sameRect(background, coverRect(image.width, image.height, before))) {
    return { ...background, ...coverRect(image.width, image.height, after) }
  }
  return moveIntoArea(background, after)
}

function moveIntoArea(item: StageItem, area: Rect): StageItem {
  const { x, y } = clampCenter(item.x, item.y, item.width, item.height, area)
  return x === item.x && y === item.y ? item : { ...item, x, y }
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= SIZE_EPSILON &&
    Math.abs(a.y - b.y) <= SIZE_EPSILON &&
    Math.abs(a.width - b.width) <= SIZE_EPSILON &&
    Math.abs(a.height - b.height) <= SIZE_EPSILON
  )
}

// --- Sınıflar ve beceriler -------------------------------------------------

function addClass(state: FullState, action: ActionOf<'class/add'>): ReduceResult {
  const classId: unknown = action.classId
  if (!isId(classId)) return reject(state, 'DND-306', `class/add: sınıf kimliği geçersiz: ${show(classId)}`)
  const classes = state.app.classes
  if (classes.some((entry) => entry.id === classId)) return reject(state, 'DND-306', `class/add: bu kimlikle bir sınıf zaten var: ${show(classId)}`)
  if (classes.length >= MAX_CLASSES) return reject(state, 'DND-306', `class/add: en fazla ${MAX_CLASSES} sınıf olabilir.`)
  const name = cleanName(action.name, TEXT_LIMITS.className) || `Sınıf ${classes.length + 1}`
  return { state: withClasses(state, [...classes, { id: classId, name, skills: [] }]) }
}

function renameClass(state: FullState, action: ActionOf<'class/update'>): ReduceResult {
  const entry = classById(state.app, action.classId)
  if (!entry) return classNotFound(state, action.classId)
  // Boş ad yok sayılır: listede adsız sınıf kalmasın.
  const name = cleanName(action.name, TEXT_LIMITS.className)
  if (name === '' || name === entry.name) return { state }
  return { state: withClass(state, entry, { ...entry, name }) }
}

function removeClass(state: FullState, action: ActionOf<'class/remove'>): ReduceResult {
  const entry = classById(state.app, action.classId)
  if (!entry) return classNotFound(state, action.classId)
  const app = state.app
  const players = mapChanged(app.players, (player) => (player.classId === entry.id ? { ...player, classId: null } : player))
  return { state: withApp(state, { ...app, classes: app.classes.filter((other) => other !== entry), players }) }
}

function moveClass(state: FullState, action: ActionOf<'class/move'>): ReduceResult {
  const classes = moveInList(state.app.classes, action.classId, action.to)
  if (classes === null) return reject(state, 'DND-306', `class/move: sınıf ya da yön geçersiz: ${show(action.classId)} ${show(action.to)}`)
  return classes === state.app.classes ? { state } : { state: withClasses(state, classes) }
}

function addSkill(state: FullState, action: ActionOf<'skill/add'>): ReduceResult {
  const entry = classById(state.app, action.classId)
  if (!entry) return classNotFound(state, action.classId)
  const raw: unknown = action.skill
  if (!isRecord(raw) || !isId(raw.id) || !isAbility(raw.ability)) return reject(state, 'DND-306', 'skill/add: beceri eksik ya da hatalı alanlı.')
  if (entry.skills.some((skill) => skill.id === raw.id)) return reject(state, 'DND-306', `skill/add: bu kimlikle bir beceri zaten var: ${show(raw.id)}`)
  if (entry.skills.length >= MAX_SKILLS) return reject(state, 'DND-306', `skill/add: bir sınıfta en fazla ${MAX_SKILLS} beceri olabilir.`)
  const skill: Skill = {
    id: raw.id,
    name: cleanName(raw.name, TEXT_LIMITS.skillName) || `Beceri ${entry.skills.length + 1}`,
    ability: raw.ability,
    requirement: isFiniteNumber(raw.requirement) ? clamp(Math.round(raw.requirement), 1, MAX_REQUIREMENT) : DEFAULT_REQUIREMENT
  }
  return { state: withClass(state, entry, { ...entry, skills: [...entry.skills, skill] }) }
}

function updateSkill(state: FullState, action: ActionOf<'skill/update'>): ReduceResult {
  const entry = classById(state.app, action.classId)
  if (!entry) return classNotFound(state, action.classId)
  const skill = entry.skills.find((other) => other.id === action.skillId)
  if (!skill) return reject(state, 'DND-302', `Beceri bulunamadı: ${show(action.skillId)}`)
  const patch: unknown = action.patch
  if (!isRecord(patch)) return reject(state, 'DND-306', 'skill/update: patch bir nesne değil.')
  const next: Skill = {
    ...skill,
    name: cleanName(patch.name, TEXT_LIMITS.skillName) || skill.name,
    ability: isAbility(patch.ability) ? patch.ability : skill.ability,
    requirement: isFiniteNumber(patch.requirement) ? clamp(Math.round(patch.requirement), 1, MAX_REQUIREMENT) : skill.requirement
  }
  if (shallowEqual(skill, next)) return { state }
  return { state: withClass(state, entry, { ...entry, skills: entry.skills.map((other) => (other === skill ? next : other)) }) }
}

function removeSkill(state: FullState, action: ActionOf<'skill/remove'>): ReduceResult {
  const entry = classById(state.app, action.classId)
  if (!entry) return classNotFound(state, action.classId)
  const skills = entry.skills.filter((skill) => skill.id !== action.skillId)
  if (skills.length === entry.skills.length) return reject(state, 'DND-302', `Beceri bulunamadı: ${show(action.skillId)}`)
  return { state: withClass(state, entry, { ...entry, skills }) }
}

function moveSkill(state: FullState, action: ActionOf<'skill/move'>): ReduceResult {
  const entry = classById(state.app, action.classId)
  if (!entry) return classNotFound(state, action.classId)
  const skills = moveInList(entry.skills, action.skillId, action.to)
  if (skills === null) return reject(state, 'DND-306', `skill/move: beceri ya da yön geçersiz: ${show(action.skillId)} ${show(action.to)}`)
  return skills === entry.skills ? { state } : { state: withClass(state, entry, { ...entry, skills }) }
}

/** Listede bir yukarı / aşağı. Uçtaysa aynı dizi; kimlik ya da yön geçersizse null. */
function moveInList<T extends { id: ID }>(list: T[], id: unknown, to: unknown): T[] | null {
  if (to !== 'up' && to !== 'down') return null
  const index = list.findIndex((entry) => entry.id === id)
  if (index === -1) return null
  const target = to === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return list
  const next = list.slice()
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}

function cleanName(name: unknown, max: number): string {
  if (typeof name !== 'string') return ''
  return truncate(name.trim(), max).trimEnd()
}

function classById(app: AppState, classId: unknown): CharacterClass | undefined {
  return typeof classId === 'string' ? app.classes.find((entry) => entry.id === classId) : undefined
}

function classNotFound(state: FullState, classId: unknown): ReduceResult {
  return reject(state, 'DND-302', `Sınıf bulunamadı: ${show(classId)}`)
}

function withClasses(state: FullState, classes: CharacterClass[]): FullState {
  return withApp(state, { ...state.app, classes })
}

function withClass(state: FullState, entry: CharacterClass, next: CharacterClass): FullState {
  return withClasses(state, state.app.classes.map((other) => (other === entry ? next : other)))
}

// --- Müzik -------------------------------------------------------------------

function addTracks(state: FullState, action: ActionOf<'music/addTracks'>): ReduceResult {
  const tracks: unknown = action.tracks
  if (!Array.isArray(tracks)) return reject(state, 'DND-306', 'music/addTracks: tracks bir dizi değil.')

  const music = state.app.music
  const knownIds = new Set(music.tracks.map((track) => track.id))
  const added: MusicTrack[] = []
  let invalidCount = 0
  for (const candidate of tracks) {
    const track = parseTrack(candidate)
    if (!track) {
      invalidCount += 1
    } else if (!knownIds.has(track.id)) {
      knownIds.add(track.id)
      added.push(track)
    }
  }

  const issue: ReduceIssue | undefined =
    invalidCount > 0 ? { code: 'DND-306', detail: `music/addTracks: ${invalidCount} parça kaydı hatalı alanlı, atlandı.` } : undefined
  if (added.length === 0) return result(state, issue)
  return result(withMusic(state, { ...music, tracks: [...music.tracks, ...added] }), issue)
}

function parseTrack(value: unknown): MusicTrack | null {
  if (!isRecord(value)) return null
  if (!isId(value.id) || !isId(value.fileName) || typeof value.originalName !== 'string' || typeof value.addedAt !== 'string') return null
  if (typeof value.hasVideo !== 'boolean') return null
  const loop = value.loop === null || value.loop === undefined ? null : parseLoop(value.loop)
  if (value.loop !== null && value.loop !== undefined && loop === null) return null
  return {
    id: value.id,
    fileName: value.fileName,
    originalName: truncate(value.originalName, TEXT_LIMITS.trackName),
    hasVideo: value.hasVideo,
    loop: value.hasVideo ? loop : null,
    addedAt: value.addedAt
  }
}

/** Döngü aralığı: 0 <= başlangıç < bitiş, en az MIN_VIDEO_LOOP saniye. Yüzde bir saniyeye yuvarlanır. */
function parseLoop(value: unknown): VideoLoop | null {
  if (!isRecord(value) || !isFiniteNumber(value.start) || !isFiniteNumber(value.end)) return null
  const start = Math.round(Math.max(0, value.start) * 100) / 100
  const end = Math.round(value.end * 100) / 100
  return end - start >= MIN_VIDEO_LOOP ? { start, end } : null
}

function removeTrack(state: FullState, action: ActionOf<'music/removeTrack'>): ReduceResult {
  const track = trackById(state.app, action.trackId)
  if (!track) return trackNotFound(state, action.trackId)

  const music = state.app.music
  const app: AppState = {
    ...state.app,
    music: { ...music, tracks: music.tracks.filter((other) => other !== track) },
    scenes: mapChanged(state.app.scenes, (scene) => (scene.videoTrackId === track.id ? { ...scene, videoTrackId: null } : scene))
  }
  const playback = state.session.playback
  // Çalan parça silinirse müzik durur; sıradakine geçmek DM'e sormadan başka bir şarkı başlatırdı.
  const session = playback.trackId === track.id ? { ...state.session, playback: { ...playback, trackId: null, playing: false, seekTo: 0 } } : state.session
  return { state: { app, session } }
}

function renameTrack(state: FullState, action: ActionOf<'music/renameTrack'>): ReduceResult {
  const track = trackById(state.app, action.trackId)
  if (!track) return trackNotFound(state, action.trackId)
  const name: unknown = action.name
  if (typeof name !== 'string') return reject(state, 'DND-306', `music/renameTrack: ad geçersiz: ${show(name)}`)
  // Boş ad yok sayılır: listede adsız satır kalmasın.
  const cleaned = truncate(name.trim(), TEXT_LIMITS.trackName).trimEnd()
  if (cleaned === '' || cleaned === track.originalName) return { state }
  return { state: withTrack(state, track, { ...track, originalName: cleaned }) }
}

function moveTrack(state: FullState, action: ActionOf<'music/moveTrack'>): ReduceResult {
  const to: unknown = action.to
  if (to !== 'up' && to !== 'down') return reject(state, 'DND-306', `music/moveTrack: yön geçersiz: ${show(to)}`)
  const music = state.app.music
  const index = music.tracks.findIndex((track) => track.id === action.trackId)
  if (index === -1) return trackNotFound(state, action.trackId)
  const target = to === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= music.tracks.length) return { state }
  const tracks = music.tracks.slice()
  const [moved] = tracks.splice(index, 1)
  tracks.splice(target, 0, moved)
  return { state: withMusic(state, { ...music, tracks }) }
}

function setTrackLoop(state: FullState, action: ActionOf<'music/setLoop'>): ReduceResult {
  const track = trackById(state.app, action.trackId)
  if (!track) return trackNotFound(state, action.trackId)
  if (!track.hasVideo) return reject(state, 'DND-306', `music/setLoop: parçada görüntü yok: ${show(track.id)}`)

  const raw: unknown = action.loop
  const loop = raw === null ? null : parseLoop(raw)
  if (raw !== null && loop === null) {
    return reject(state, 'DND-306', `music/setLoop: aralık geçersiz (en az ${MIN_VIDEO_LOOP} saniye olmalı).`)
  }
  if (loop?.start === track.loop?.start && loop?.end === track.loop?.end) return { state }

  const next = withTrack(state, track, { ...track, loop })
  if (loop !== null) return { state: next }
  // Görüntüsü kapatılan parça arka plan olarak kalamaz.
  const scenes = mapChanged(next.app.scenes, (scene) => (scene.videoTrackId === track.id ? { ...scene, videoTrackId: null } : scene))
  return { state: scenes === next.app.scenes ? next : withApp(next, { ...next.app, scenes }) }
}

function setMusicLevel(state: FullState, key: 'musicVolume' | 'ambientVolume', value: unknown): ReduceResult {
  if (!isFiniteNumber(value)) return reject(state, 'DND-306', `Ses düzeyi sayı değil: ${show(value)}`)
  const volume = roundVolume(value)
  const music = state.app.music
  return volume === music[key] ? { state } : { state: withMusic(state, { ...music, [key]: volume }) }
}

function setRepeat(state: FullState, action: ActionOf<'music/setRepeat'>): ReduceResult {
  const repeat = action.repeat
  if (!REPEAT_MODES.includes(repeat)) return reject(state, 'DND-306', `music/setRepeat: tekrar geçersiz: ${show(repeat)}`)
  const music = state.app.music
  return repeat === music.repeat ? { state } : { state: withMusic(state, { ...music, repeat }) }
}

function addAmbient(state: FullState, action: ActionOf<'ambient/add'>): ReduceResult {
  const raw: unknown = action.ambient
  const music = state.app.music
  if (
    !isRecord(raw) ||
    !isId(raw.id) ||
    !isId(raw.fileName) ||
    typeof raw.name !== 'string' ||
    typeof raw.addedAt !== 'string' ||
    !isFiniteNumber(raw.volume)
  ) {
    return reject(state, 'DND-306', 'ambient/add: ortam sesi kaydı eksik ya da hatalı alanlı.')
  }
  if (music.ambients.some((ambient) => ambient.id === raw.id)) return { state }
  if (music.ambients.length >= MAX_AMBIENTS) return reject(state, 'DND-306', `ambient/add: en fazla ${MAX_AMBIENTS} ortam sesi olabilir.`)

  const ambient: AmbientSound = {
    id: raw.id,
    name: cleanAmbientName(raw.name) || 'Ortam sesi',
    fileName: raw.fileName,
    volume: roundVolume(raw.volume),
    addedAt: raw.addedAt
  }
  return { state: withMusic(state, { ...music, ambients: [...music.ambients, ambient] }) }
}

function updateAmbient(state: FullState, action: ActionOf<'ambient/update'>): ReduceResult {
  const music = state.app.music
  const ambient = ambientById(state.app, action.ambientId)
  if (!ambient) return ambientNotFound(state, action.ambientId)
  const patch: unknown = action.patch
  if (!isRecord(patch)) return reject(state, 'DND-306', 'ambient/update: patch bir nesne değil.')

  const next: AmbientSound = {
    ...ambient,
    // Boş ad yok sayılır: adsız düğme kalmasın.
    name: (typeof patch.name === 'string' && cleanAmbientName(patch.name)) || ambient.name,
    volume: isFiniteNumber(patch.volume) ? roundVolume(patch.volume) : ambient.volume
  }
  if (shallowEqual(ambient, next)) return { state }
  return { state: withMusic(state, { ...music, ambients: music.ambients.map((other) => (other === ambient ? next : other)) }) }
}

function removeAmbient(state: FullState, action: ActionOf<'ambient/remove'>): ReduceResult {
  const music = state.app.music
  const ambient = ambientById(state.app, action.ambientId)
  if (!ambient) return ambientNotFound(state, action.ambientId)
  const app = { ...state.app, music: { ...music, ambients: music.ambients.filter((other) => other !== ambient) } }
  const playback = state.session.playback
  const session = playback.ambientIds.includes(ambient.id)
    ? { ...state.session, playback: { ...playback, ambientIds: playback.ambientIds.filter((id) => id !== ambient.id) } }
    : state.session
  return { state: { app, session } }
}

function playTrack(state: FullState, action: ActionOf<'playback/play'>): ReduceResult {
  const track = trackById(state.app, action.trackId)
  if (!track) return trackNotFound(state, action.trackId)
  return { state: startTrack(state, track.id) }
}

/** Parçayı baştan başlatır; aynı parça çalıyor olsa da seekNonce artar ki oyun ekranı başa sarsın. */
function startTrack(state: FullState, trackId: ID): FullState {
  const playback = state.session.playback
  return withPlayback(state, { ...playback, trackId, playing: true, seekTo: 0, seekNonce: playback.seekNonce + 1 })
}

function setPlaying(state: FullState, playing: boolean): ReduceResult {
  const playback = state.session.playback
  if (playback.trackId === null || playback.playing === playing) return { state }
  return { state: withPlayback(state, { ...playback, playing }) }
}

function seek(state: FullState, action: ActionOf<'playback/seek'>): ReduceResult {
  const position: unknown = action.position
  if (!isFiniteNumber(position)) return reject(state, 'DND-306', `playback/seek: konum sayı değil: ${show(position)}`)
  const playback = state.session.playback
  if (playback.trackId === null) return { state }
  return { state: withPlayback(state, { ...playback, seekTo: Math.max(0, position), seekNonce: playback.seekNonce + 1 }) }
}

/**
 * Listede bir ileri ya da geri. Başta / sonda: "tümünü tekrarla" açıksa öbür uca döner; değilse
 * geri düğmesi ilk parçayı baştan başlatır, ileri düğmesi bir şey yapmaz, biten son parça başa
 * sarılıp duraklar.
 */
function stepTrack(state: FullState, direction: 1 | -1, fromEnded: boolean): ReduceResult {
  const { tracks, repeat } = state.app.music
  const playback = state.session.playback
  if (tracks.length === 0) return playback.trackId === null ? { state } : stopPlayback(state)

  const index = tracks.findIndex((track) => track.id === playback.trackId)
  if (index === -1) return { state: startTrack(state, tracks[direction === 1 ? 0 : tracks.length - 1].id) }

  let target = index + direction
  if (target < 0 || target >= tracks.length) {
    if (repeat === 'all') target = (target + tracks.length) % tracks.length
    else if (direction === -1) target = 0
    else if (!fromEnded) return { state }
    else return { state: withPlayback(state, { ...playback, playing: false, seekTo: 0, seekNonce: playback.seekNonce + 1 }) }
  }
  return { state: startTrack(state, tracks[target].id) }
}

function stopPlayback(state: FullState): ReduceResult {
  const playback = state.session.playback
  if (playback.trackId === null && !playback.playing) return { state }
  return { state: withPlayback(state, { ...playback, trackId: null, playing: false, seekTo: 0 }) }
}

function trackEnded(state: FullState, action: ActionOf<'playback/ended'>): ReduceResult {
  const playback = state.session.playback
  // Geç gelen bildirim: bu arada başka bir parçaya geçilmiş ya da durdurulmuştur.
  if (playback.trackId === null || playback.trackId !== action.trackId || !playback.playing) return { state }
  if (state.app.music.repeat === 'one') return { state: startTrack(state, playback.trackId) }
  return stepTrack(state, 1, true)
}

function toggleAmbient(state: FullState, action: ActionOf<'ambient/toggle'>): ReduceResult {
  const ambient = ambientById(state.app, action.ambientId)
  if (!ambient) return ambientNotFound(state, action.ambientId)
  const playback = state.session.playback
  const ambientIds = playback.ambientIds.includes(ambient.id)
    ? playback.ambientIds.filter((id) => id !== ambient.id)
    : [...playback.ambientIds, ambient.id]
  return { state: withPlayback(state, { ...playback, ambientIds }) }
}

function cleanAmbientName(name: string): string {
  return truncate(name.trim(), TEXT_LIMITS.ambientName).trimEnd()
}

function roundVolume(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100) / 100
}

function trackById(app: AppState, trackId: unknown): MusicTrack | undefined {
  return typeof trackId === 'string' ? app.music.tracks.find((track) => track.id === trackId) : undefined
}

function ambientById(app: AppState, ambientId: unknown): AmbientSound | undefined {
  return typeof ambientId === 'string' ? app.music.ambients.find((ambient) => ambient.id === ambientId) : undefined
}

function trackNotFound(state: FullState, trackId: unknown): ReduceResult {
  return reject(state, 'DND-302', `Parça bulunamadı: ${show(trackId)}`)
}

function ambientNotFound(state: FullState, ambientId: unknown): ReduceResult {
  return reject(state, 'DND-302', `Ortam sesi bulunamadı: ${show(ambientId)}`)
}

function withMusic(state: FullState, music: MusicLibrary): FullState {
  return withApp(state, { ...state.app, music })
}

function withTrack(state: FullState, track: MusicTrack, next: MusicTrack): FullState {
  const music = state.app.music
  return withMusic(state, { ...music, tracks: music.tracks.map((other) => (other === track ? next : other)) })
}

function withPlayback(state: FullState, playback: Playback): FullState {
  return withSession(state, { ...state.session, playback })
}

// --- Diğer -------------------------------------------------------------------

function setGeneralNote(state: FullState, action: ActionOf<'note/setGeneral'>): ReduceResult {
  const text: unknown = action.text
  if (typeof text !== 'string') return reject(state, 'DND-306', `note/setGeneral: metin geçersiz: ${show(text)}`)
  const generalNote = truncate(text, TEXT_LIMITS.generalNote)
  return generalNote === state.app.generalNote ? { state } : { state: withApp(state, { ...state.app, generalNote }) }
}

function updateSettings(state: FullState, action: ActionOf<'settings/update'>): ReduceResult {
  const patch: unknown = action.patch
  if (!isRecord(patch)) return reject(state, 'DND-306', 'settings/update: patch bir nesne değil.')

  const current = state.app.settings
  const fullscreen = patch.gameFullscreen
  const displayChoice = (value: unknown, previous: number | null): number | null =>
    value === null || isFiniteNumber(value) ? value : previous
  const next: AppSettings = {
    gameDisplayId: displayChoice(patch.gameDisplayId, current.gameDisplayId),
    controlDisplayId: displayChoice(patch.controlDisplayId, current.controlDisplayId),
    gameFullscreen: typeof fullscreen === 'boolean' ? fullscreen : current.gameFullscreen
  }
  return shallowEqual(current, next) ? { state } : { state: withApp(state, { ...state.app, settings: next }) }
}

function setTool(state: FullState, action: ActionOf<'session/setTool'>): ReduceResult {
  const tool = action.tool
  if (!TOOLS.includes(tool)) return reject(state, 'DND-306', `session/setTool: araç geçersiz: ${show(tool)}`)
  const session = state.session
  if (tool === session.tool) return { state }
  // Araç değişimi çizimlere dokunmaz: çizdikten sonra fareye geçip görsel taşımak gerekebilir.
  return { state: withSession(state, { ...session, tool }) }
}

function setPenWidth(state: FullState, action: ActionOf<'session/setPenWidth'>): ReduceResult {
  const width = action.width
  if (!PEN_WIDTHS.includes(width)) return reject(state, 'DND-306', `session/setPenWidth: kalınlık geçersiz: ${show(width)}`)
  if (width === state.session.penWidth) return { state }
  return { state: withSession(state, { ...state.session, penWidth: width }) }
}

// --- Ortak yardımcılar -------------------------------------------------------

function result(state: FullState, issue?: ReduceIssue): ReduceResult {
  return issue ? { state, issue } : { state }
}

function reject(state: FullState, code: ErrorCode, detail: string): ReduceResult {
  return { state, issue: { code, detail } }
}

function sceneNotFound(state: FullState, sceneId: unknown): ReduceResult {
  return reject(state, 'DND-301', `Pencere bulunamadı: ${show(sceneId)}`)
}

function imageNotFound(state: FullState, imageId: unknown): ReduceResult {
  return reject(state, 'DND-302', `Görsel bulunamadı ya da oyun alanına konamaz: ${show(imageId)}`)
}

function itemNotFound(state: FullState, itemId: unknown): ReduceResult {
  return reject(state, 'DND-302', `Öğe pencerede bulunamadı: ${show(itemId)}`)
}

function withApp(state: FullState, app: AppState): FullState {
  return { ...state, app }
}

function withSession(state: FullState, session: SessionState): FullState {
  return { ...state, session }
}

function withScene(state: FullState, scene: SceneWindow, next: SceneWindow): FullState {
  const app = state.app
  return withApp(state, { ...app, scenes: app.scenes.map((other) => (other === scene ? next : other)) })
}

function bumpNonce(session: SessionState): SessionState {
  return { ...session, drawingNonce: session.drawingNonce + 1 }
}

function sceneById(app: AppState, sceneId: unknown): SceneWindow | undefined {
  return typeof sceneId === 'string' ? app.scenes.find((scene) => scene.id === sceneId) : undefined
}

function imageById(app: AppState, imageId: unknown): LibraryImage | undefined {
  return typeof imageId === 'string' ? findImage(app, imageId) : undefined
}

/** Hiçbir eleman değişmediyse aynı diziyi döndürür (yapısal paylaşım). */
function mapChanged<T>(list: T[], transform: (entry: T) => T): T[] {
  let changed = false
  const next = list.map((entry) => {
    const mapped = transform(entry)
    if (mapped !== entry) changed = true
    return mapped
  })
  return changed ? next : list
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[]
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

function hasValidSize(size: Size): boolean {
  return isPositiveNumber(size.width) && isPositiveNumber(size.height)
}

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value)
}

function isId(value: unknown): value is ID {
  return typeof value === 'string' && value !== ''
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  // Emoji gibi iki birimlik bir karakter ortadan bölünürse kayıtta bozuk karakter kalır.
  const lastUnit = text.charCodeAt(max - 1)
  const splitsPair = lastUnit >= 0xd800 && lastUnit <= 0xdbff
  return text.slice(0, splitsPair ? max - 1 : max)
}

/** Log satırına güvenle yazılabilecek kısa gösterim. */
function show(value: unknown): string {
  if (typeof value === 'string') return `"${truncate(value, 60)}"`
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return String(value)
  }
  return Array.isArray(value) ? 'dizi' : typeof value
}
