/**
 * Durum geçişleri. Saf fonksiyon: aynı girdiye aynı çıktı, yan etki yok, rastgelelik yok.
 *
 * İşlemler arayüzden IPC ile gelir; TypeScript tipleri çalışma anında garanti değildir.
 * Bu yüzden her alan kullanılmadan önce denetlenir. Geçersiz ya da hedefi artık olmayan
 * işlem durumu değiştirmez ve bir `issue` ile döner. Bir şey değişmediyse gelen `state`
 * nesnesinin aynısı döner; çağıran taraf yayını ve kaydı buna göre atlar.
 */
import { Action, ReduceIssue, ReduceResult } from './actions'
import { ErrorCode } from './errors'
import { categoryInfo, containRect, coverRect, findImage, playArea, Rect } from './layout'
import {
  AppSettings,
  AppState,
  createEmptyPlayer,
  FullState,
  ID,
  ImageKind,
  LibraryImage,
  MAX_HP,
  MAX_LEVEL,
  MAX_PLAYERS,
  MIN_ITEM_SIZE,
  MIN_LEVEL,
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
  generalNote: 20000
} as const

export const MIN_HOTKEY = 1
export const MAX_HOTKEY = 9

const TOOLS: readonly Tool[] = ['mouse', 'pen-red', 'pen-black']
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

    case 'note/setGeneral':
      return setGeneralNote(state, action)
    case 'settings/update':
      return updateSettings(state, action)

    case 'session/setTool':
      return setTool(state, action)
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
  const { name, level, note, portraitId } = patch
  const next: PlayerProfile = {
    ...current,
    name: typeof name === 'string' ? truncate(name, TEXT_LIMITS.playerName) : current.name,
    level: isFiniteNumber(level) ? clamp(Math.round(level), MIN_LEVEL, MAX_LEVEL) : current.level,
    note: typeof note === 'string' ? truncate(note, TEXT_LIMITS.playerNote) : current.note,
    portraitId: isPortraitChoice(state.app, portraitId) ? portraitId : current.portraitId
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
  const empty = createEmptyPlayer()
  return shallowEqual(current, empty) ? { state } : commitPlayer(state, action.slot, empty)
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
  return { id, name, hotkey: null, background: null, items: [] }
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
  const nextScene: SceneWindow = asBackground
    ? { ...scene, background: { id: itemId, imageId: image.id, ...coverRect(image.width, image.height, area), rotation: 0, label: '' } }
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
  if (scene.background === null) return { state }
  return { state: withScene(state, scene, { ...scene, background: null }) }
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
