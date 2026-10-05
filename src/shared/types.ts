/**
 * Uygulamanın ortak veri tipleri. Ana süreç, preload ve arayüz aynı tipleri kullanır.
 * Bu dosya sözleşmedir: alan eklemek serbest, var olanı değiştirmek tüm tarafları etkiler.
 */

export type ID = string

export const SCHEMA_VERSION = 1
export const MAX_PLAYERS = 4
export const MAX_HP = 10
export const MIN_LEVEL = 1
export const MAX_LEVEL = 99

/** Sanal oyun ekranı. Tüm sahne koordinatları bu 16:9 uzaydadır; pencere buna göre ölçeklenir. */
export const STAGE_WIDTH = 1920
export const STAGE_HEIGHT = 1080
/** En az bir dolu profil varken soldaki portre sütununun genişliği (sanal piksel). */
export const PORTRAIT_COLUMN_WIDTH = 300
/** Sahnedeki bir görselin kısa kenarı bundan küçük olamaz. */
export const MIN_ITEM_SIZE = 40

/** Kütüphanenin 8 bölmesi. */
export type LibraryCategory =
  | 'npc'
  | 'merchant'
  | 'place'
  | 'scene'
  | 'enemy'
  | 'boss'
  | 'teamItem'
  | 'item'

/** Portreler de aynı görsel deposunda durur ama kütüphane bölmelerinde görünmez. */
export type ImageKind = LibraryCategory | 'portrait'

export interface LibraryImage {
  id: ID
  kind: ImageKind
  /** Kayıt klasöründeki `gorseller/` altındaki dosya adı. */
  fileName: string
  /** Kullanıcının yüklediği dosyanın özgün adı (uzantısız gösterim için). */
  originalName: string
  width: number
  height: number
  /** ISO tarih. */
  addedAt: string
}

export interface PlayerProfile {
  portraitId: ID | null
  name: string
  level: number
  /** 0..MAX_HP */
  hp: number
  /** Sadece kontrol panelinde görünen not. */
  note: string
}

/**
 * Oyun alanına konmuş bir görsel. x,y döndürülmemiş kutunun sol üst köşesidir; en-boy oranı
 * her zaman görselinkiyle aynıdır. Döndürme kutunun merkezi etrafında yapılır.
 */
export interface StageItem {
  id: ID
  imageId: ID
  x: number
  y: number
  width: number
  height: number
  /** Saat yönünde derece, 0 <= rotation < 360. */
  rotation: number
  /** Görselin altında gösterilen kısa etiket ("7 LVL" gibi). Boş olabilir. */
  label: string
}

/** Kullanıcının "pencere" dediği hazır düzen: arka plan + üstündeki görseller. */
export interface SceneWindow {
  id: ID
  name: string
  /** 1..9 ya da atanmamış. Aynı tuş yalnızca bir pencerede olabilir. */
  hotkey: number | null
  background: StageItem | null
  /** Dizinin sonu en üstte çizilir. */
  items: StageItem[]
}

export interface AppSettings {
  /** Oyun ekranının açılacağı monitör; null ise en büyük monitör seçilir. */
  gameDisplayId: number | null
  /** Kontrol panelinin açılacağı monitör; null ise oyun ekranının olmadığı monitör seçilir. */
  controlDisplayId: number | null
  gameFullscreen: boolean
}

/** Diske kaydedilen kalıcı durum (`kayit.json`). */
export interface AppState {
  schema: typeof SCHEMA_VERSION
  /** Her zaman MAX_PLAYERS uzunluğunda. */
  players: PlayerProfile[]
  library: LibraryImage[]
  scenes: SceneWindow[]
  activeSceneId: ID | null
  generalNote: string
  settings: AppSettings
}

export type Tool = 'mouse' | 'pen-red' | 'pen-black' | 'eraser'

export type PenWidth = 'thin' | 'medium' | 'thick'

/** Kalem kalınlıkları (sanal piksel). Silgi aynı ayarda kalemden geniştir. */
export const PEN_WIDTH_PX: Record<PenWidth, number> = { thin: 3, medium: 6, thick: 12 }
export const ERASER_WIDTH_FACTOR = 4

export interface DiceRoll {
  id: ID
  sides: 20
  value: number
  /** ISO tarih. */
  at: string
}

/** Kaydedilmeyen, yalnızca uygulama açıkken yaşayan durum. Zar geçmişi ayrıca `zar.json`'a yazılır. */
export interface SessionState {
  phase: 'menu' | 'playing'
  tool: Tool
  /** Kalemin ve silginin kalınlığı; araç değişse de korunur. */
  penWidth: PenWidth
  /** Her artışında oyun ekranı, o an açık olan pencerenin çizimlerini siler ("Çizimi temizle"). */
  drawingNonce: number
  /** En yeni atış başta. */
  diceHistory: DiceRoll[]
}

export interface FullState {
  app: AppState
  session: SessionState
}

export function createEmptyPlayer(): PlayerProfile {
  return { portraitId: null, name: '', level: 1, hp: MAX_HP, note: '' }
}

export function createInitialAppState(): AppState {
  return {
    schema: SCHEMA_VERSION,
    players: Array.from({ length: MAX_PLAYERS }, createEmptyPlayer),
    library: [],
    scenes: [],
    activeSceneId: null,
    generalNote: '',
    settings: { gameDisplayId: null, controlDisplayId: null, gameFullscreen: true }
  }
}

export function createInitialSession(): SessionState {
  return { phase: 'menu', tool: 'mouse', penWidth: 'medium', drawingNonce: 0, diceHistory: [] }
}

export function createInitialState(): FullState {
  return { app: createInitialAppState(), session: createInitialSession() }
}
