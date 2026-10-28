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

/** Altı istatistik: Güç, Çeviklik, Dayanıklılık, Zeka, Bilgelik, Karizma. */
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]
export type AbilityScores = Record<Ability, number>

export const MIN_ABILITY = 1
export const MAX_ABILITY = 30
export const DEFAULT_ABILITY = 10

export function isAbility(value: unknown): value is Ability {
  return ABILITIES.some((ability) => ability === value)
}

/**
 * DM'in oyuncuya verdiği geçici artı / eksi ("İyi rol +2", "Kırık kol -2"). Oyuncunun her beceri
 * atışına eklenir.
 */
export interface PlayerEffect {
  id: ID
  label: string
  /** -20..20, 0 olamaz. */
  value: number
  /** Kalan atış sayısı; her beceri atışında bir azalır, 0 olunca düşer. null: kalıcı (DM kaldırana kadar). */
  rolls: number | null
}

export interface PlayerProfile {
  portraitId: ID | null
  name: string
  level: number
  /** 0..MAX_HP */
  hp: number
  /** Sadece kontrol panelinde görünen not. */
  note: string
  /** DM'in tanımladığı sınıflardan biri; yoksa null. */
  classId: ID | null
  abilities: AbilityScores
  /** Yeterlilik; null ise seviyeden hesaplanır (1-4 → 2 … 17+ → 6). Becerilerin gereksinimini düşürür. */
  proficiency: number | null
  effects: PlayerEffect[]
}

/** Bir beceri: adı, hangi istatistikle atıldığı ve başarmak için en az kaç gelmesi gerektiği. */
export interface Skill {
  id: ID
  name: string
  ability: Ability
  /** 1..MAX_REQUIREMENT */
  requirement: number
}

/** DM'in tanımladığı sınıf (Savaşçı, Büyücü…) ve becerileri. */
export interface CharacterClass {
  id: ID
  name: string
  skills: Skill[]
}

export type CheckMode = 'normal' | 'advantage' | 'disadvantage'

/** Beceri atışına eklenen tek bir artı / eksi (istatistik ya da geçici etki). */
export interface CheckModifier {
  label: string
  value: number
  kind: 'ability' | 'effect'
}

/** Beceri atışının hesabı; zar atışıyla birlikte saklanır ve oyun ekranında gösterilir. */
export interface SkillCheck {
  slot: number
  playerName: string
  skillName: string
  ability: Ability
  mode: CheckMode
  /** Atılan d20'ler (avantaj / dezavantajda iki). */
  dice: number[]
  /** `dice` içinde alınan zarın sırası. */
  keptIndex: number
  /** Sıfır olmayan artı / eksiler, eklenme sırasıyla. */
  modifiers: CheckModifier[]
  total: number
  /** Becerinin gereksinimi (yeterlilik düşülmeden). */
  baseRequirement: number
  proficiency: number
  /** Yeterlilik düşüldükten sonraki gereksinim (en az 1). */
  requirement: number
  success: boolean
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
  /**
   * Hareketli arka plan: döngü aralığı seçilmiş bir videolu parça. Varsa görsel arka planın yerine
   * oyun alanını kaplar; ikisi aynı anda olmaz.
   */
  videoTrackId: ID | null
  /** Dizinin sonu en üstte çizilir. */
  items: StageItem[]
}

/** Videonun GIF gibi sessiz döndürülen bölümü (saniye). */
export interface VideoLoop {
  start: number
  end: number
}

/** Müzik listesindeki bir parça. Dosyası kayıt klasöründeki `muzik/` altındadır. */
export interface MusicTrack {
  id: ID
  fileName: string
  /** Yüklenen dosyanın uzantısız adı; listede gösterilir. */
  originalName: string
  /** Dosyada görüntü de var (MP4). */
  hasVideo: boolean
  /** Hareketli arka plan olarak kullanılacak aralık; null ise parça yalnızca ses olarak kullanılır. */
  loop: VideoLoop | null
  /** ISO tarih. */
  addedAt: string
}

/** DM'in kendi eklediği ortam sesi düğmesi (kuş sesi, yağmur…). Döngüde çalar. */
export interface AmbientSound {
  id: ID
  name: string
  fileName: string
  /** 0..1 */
  volume: number
  addedAt: string
}

export type RepeatMode = 'off' | 'all' | 'one'

/** Kayda giren müzik bilgileri: listeler ve ses düzeyleri. Çalma durumu oturumdadır. */
export interface MusicLibrary {
  tracks: MusicTrack[]
  ambients: AmbientSound[]
  /** 0..1 */
  musicVolume: number
  /** Bütün ortam seslerinin genel düzeyi, 0..1. */
  ambientVolume: number
  repeat: RepeatMode
}

/** O an çalan müzik. Ses oyun ekranında çalar; kontrol paneli yalnızca bunu değiştirir. */
export interface Playback {
  trackId: ID | null
  playing: boolean
  /** Her "baştan başlat" ya da sarma isteğinde artar; oyun ekranı bu değişince `seekTo`'ya gider. */
  seekNonce: number
  /** Saniye. */
  seekTo: number
  /** Çalan ortam sesleri. */
  ambientIds: ID[]
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
  music: MusicLibrary
  classes: CharacterClass[]
}

export type Tool = 'mouse' | 'pen-red' | 'pen-black' | 'eraser'

export type PenWidth = 'thin' | 'medium' | 'thick'

/** Kalem kalınlıkları (sanal piksel). Silgi aynı ayarda kalemden geniştir. */
export const PEN_WIDTH_PX: Record<PenWidth, number> = { thin: 3, medium: 6, thick: 12 }
export const ERASER_WIDTH_FACTOR = 4

/** Atılabilen zarlar. */
export const DICE_SIDES = [4, 10, 20] as const
export type DiceSides = (typeof DICE_SIDES)[number]

export function isDiceSides(value: unknown): value is DiceSides {
  return DICE_SIDES.some((sides) => sides === value)
}

export interface DiceRoll {
  id: ID
  sides: DiceSides
  /** 1..sides; beceri atışında alınan zar. */
  value: number
  /** ISO tarih. */
  at: string
  /** Beceri atışıysa hesabı; düz zar atışında yoktur. */
  check?: SkillCheck
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
  playback: Playback
}

export interface FullState {
  app: AppState
  session: SessionState
}

export function createDefaultAbilities(): AbilityScores {
  return { str: DEFAULT_ABILITY, dex: DEFAULT_ABILITY, con: DEFAULT_ABILITY, int: DEFAULT_ABILITY, wis: DEFAULT_ABILITY, cha: DEFAULT_ABILITY }
}

export function createEmptyPlayer(): PlayerProfile {
  return {
    portraitId: null,
    name: '',
    level: 1,
    hp: MAX_HP,
    note: '',
    classId: null,
    abilities: createDefaultAbilities(),
    proficiency: null,
    effects: []
  }
}

export function createInitialAppState(): AppState {
  return {
    schema: SCHEMA_VERSION,
    players: Array.from({ length: MAX_PLAYERS }, createEmptyPlayer),
    library: [],
    scenes: [],
    activeSceneId: null,
    generalNote: '',
    settings: { gameDisplayId: null, controlDisplayId: null, gameFullscreen: true },
    music: createEmptyMusic(),
    classes: []
  }
}

export const DEFAULT_MUSIC_VOLUME = 0.6
export const DEFAULT_AMBIENT_VOLUME = 0.8

export function createEmptyMusic(): MusicLibrary {
  return { tracks: [], ambients: [], musicVolume: DEFAULT_MUSIC_VOLUME, ambientVolume: DEFAULT_AMBIENT_VOLUME, repeat: 'all' }
}

export function createStoppedPlayback(): Playback {
  return { trackId: null, playing: false, seekNonce: 0, seekTo: 0, ambientIds: [] }
}

export function createInitialSession(): SessionState {
  return { phase: 'menu', tool: 'mouse', penWidth: 'medium', drawingNonce: 0, diceHistory: [], playback: createStoppedPlayback() }
}

export function createInitialState(): FullState {
  return { app: createInitialAppState(), session: createInitialSession() }
}
