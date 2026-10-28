/**
 * Durumu değiştiren tüm işlemler. Arayüz `window.dnd.dispatch(action)` ile gönderir,
 * ana süreç `reduce` ile uygular, kaydeder ve yeni durumu bütün pencerelere yayar.
 *
 * Yeni kimlikler (id) işlemi gönderen tarafça üretilir; böylece `reduce` saf kalır.
 */
import { ErrorCode } from './errors'
import {
  Ability,
  AmbientSound,
  AppSettings,
  FullState,
  ID,
  LibraryImage,
  MusicTrack,
  PenWidth,
  PlayerEffect,
  PlayerProfile,
  RepeatMode,
  Skill,
  StageItem,
  Tool,
  VideoLoop
} from './types'

export type AppAction =
  // --- Oyuncular ---
  | { type: 'player/update'; slot: number; patch: Partial<Pick<PlayerProfile, 'name' | 'level' | 'note' | 'portraitId' | 'classId' | 'proficiency'>> }
  | { type: 'player/setAbility'; slot: number; ability: Ability; value: number }
  /** Geçici artı / eksi ekler. `rolls: null` kalıcıdır. */
  | { type: 'player/addEffect'; slot: number; effect: PlayerEffect }
  | { type: 'player/removeEffect'; slot: number; effectId: ID }
  /** Beceri atışından sonra ana süreç gönderir: sayılı etkiler bir azalır, sıfırlananlar düşer. */
  | { type: 'player/consumeEffects'; slot: number }
  | { type: 'player/setHp'; slot: number; hp: number }
  | { type: 'player/adjustHp'; slot: number; delta: number }
  /** Kartı boşaltır (isim, portre, not silinir; seviye 1, can dolu). */
  | { type: 'player/clear'; slot: number }
  // --- Kütüphane ---
  /** Yalnızca ana süreç gönderir (dosya kopyalandıktan sonra). */
  | { type: 'library/add'; images: LibraryImage[] }
  /** Görseli kütüphaneden, kullanıldığı pencerelerden ve portrelerden kaldırır. Dosyayı ana süreç siler. */
  | { type: 'library/remove'; imageId: ID }
  /** İtem <-> Takım Eşyası geçişi. */
  | { type: 'library/setKind'; imageId: ID; kind: 'item' | 'teamItem' }
  // --- Pencereler ---
  | { type: 'scene/add'; sceneId: ID; name: string }
  | { type: 'scene/update'; sceneId: ID; patch: { name?: string; hotkey?: number | null } }
  | { type: 'scene/remove'; sceneId: ID }
  | { type: 'scene/setActive'; sceneId: ID }
  /** Atama tuşuna basıldı; o tuşa bağlı pencere varsa etkin olur. */
  | { type: 'scene/activateHotkey'; hotkey: number }
  // --- Oyun alanı ---
  // sceneId verilmezse etkin pencere kullanılır. Hiç pencere yoksa `fallbackSceneId` ile
  // "Pencere 1" oluşturulur ve etkin yapılır.
  /** Arka planı koyar; oyun alanını oranı bozmadan dolduracak şekilde yerleştirir. */
  | { type: 'stage/setBackground'; sceneId?: ID; fallbackSceneId: ID; itemId: ID; imageId: ID }
  | { type: 'stage/clearBackground'; sceneId: ID }
  /** Görseli oyun alanının ortasına, oranını bozmadan koyar. */
  | { type: 'stage/addItem'; sceneId?: ID; fallbackSceneId: ID; itemId: ID; imageId: ID }
  /**
   * itemId arka planın kimliğiyse arka planı günceller. En-boy oranı her zaman görselinkine
   * çekilir; öğenin merkezi oyun alanının (portre sütununun sağı) içinde tutulur.
   */
  | { type: 'stage/updateItem'; sceneId: ID; itemId: ID; patch: Partial<Pick<StageItem, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'label'>> }
  | { type: 'stage/removeItem'; sceneId: ID; itemId: ID }
  | { type: 'stage/reorderItem'; sceneId: ID; itemId: ID; to: 'front' | 'back' | 'forward' | 'backward' }
  /** Arka plan dışındaki tüm görselleri kaldırır. */
  | { type: 'stage/clearItems'; sceneId: ID }
  // --- Sınıflar ve beceriler ---
  | { type: 'class/add'; classId: ID; name: string }
  | { type: 'class/update'; classId: ID; name: string }
  /** Sınıfı siler; o sınıftaki oyuncuların sınıfı boşalır. */
  | { type: 'class/remove'; classId: ID }
  | { type: 'class/move'; classId: ID; to: 'up' | 'down' }
  | { type: 'skill/add'; classId: ID; skill: Skill }
  | { type: 'skill/update'; classId: ID; skillId: ID; patch: Partial<Pick<Skill, 'name' | 'ability' | 'requirement'>> }
  | { type: 'skill/remove'; classId: ID; skillId: ID }
  | { type: 'skill/move'; classId: ID; skillId: ID; to: 'up' | 'down' }
  /** Pencerenin hareketli arka planı; null kaldırır. Konunca görsel arka plan kalkar. */
  | { type: 'scene/setVideo'; sceneId: ID; trackId: ID | null }
  // --- Müzik ---
  /** Yalnızca ana süreç gönderir (dosya kopyalandıktan sonra). Liste sonuna eklenir. */
  | { type: 'music/addTracks'; tracks: MusicTrack[] }
  /** Parçayı listeden, çalıyorsa çalmadan ve hareketli arka plan olduğu pencerelerden kaldırır. Dosyayı ana süreç siler. */
  | { type: 'music/removeTrack'; trackId: ID }
  | { type: 'music/renameTrack'; trackId: ID; name: string }
  | { type: 'music/moveTrack'; trackId: ID; to: 'up' | 'down' }
  /** Videolu parçanın döngü aralığı; null ise parça yalnızca ses olur ve arka plan olduğu pencerelerden kalkar. */
  | { type: 'music/setLoop'; trackId: ID; loop: VideoLoop | null }
  | { type: 'music/setVolume'; volume: number }
  | { type: 'music/setAmbientVolume'; volume: number }
  | { type: 'music/setRepeat'; repeat: RepeatMode }
  /** Yalnızca ana süreç gönderir (dosya kopyalandıktan sonra). */
  | { type: 'ambient/add'; ambient: AmbientSound }
  | { type: 'ambient/update'; ambientId: ID; patch: { name?: string; volume?: number } }
  /** Dosyayı ana süreç siler. */
  | { type: 'ambient/remove'; ambientId: ID }
  // --- Diğer ---
  | { type: 'note/setGeneral'; text: string }
  | { type: 'settings/update'; patch: Partial<AppSettings> }

/** Kaydedilmeyen oturum durumu üzerindeki işlemler. */
export type SessionAction =
  /** Araç değişimi çizimlere dokunmaz; çizim dururken fareyle görsel taşınabilir. */
  | { type: 'session/setTool'; tool: Tool }
  /** Kalemin ve silginin kalınlığı. Çizilmiş çizgileri etkilemez. */
  | { type: 'session/setPenWidth'; width: PenWidth }
  /** O an açık olan pencerenin çizimlerini siler (drawingNonce artar). Çizimleri silen tek işlem budur. */
  | { type: 'session/clearDrawing' }
  // --- Çalma (oyun ekranı çalar, kontrol paneli yönetir) ---
  /** Parçayı baştan çalar. */
  | { type: 'playback/play'; trackId: ID }
  | { type: 'playback/pause' }
  | { type: 'playback/resume' }
  /** Saniye. */
  | { type: 'playback/seek'; position: number }
  | { type: 'playback/next' }
  | { type: 'playback/previous' }
  | { type: 'playback/stop' }
  /** Oyun ekranı gönderir: parça bitti. Tekrar ayarına göre sonraki parçaya geçer ya da durur. */
  | { type: 'playback/ended'; trackId: ID }
  | { type: 'ambient/toggle'; ambientId: ID }
  | { type: 'ambient/stopAll' }

export type Action = AppAction | SessionAction

/** Hata olmayan ama kayda geçmesi gereken durum (ör. silinmiş öğe üzerinde işlem). */
export interface ReduceIssue {
  code: ErrorCode
  detail: string
}

export interface ReduceResult {
  /** İşlem bir şey değiştirmediyse gelen nesnenin aynısı döner (referans eşitliği). */
  state: FullState
  /**
   * Değişmiş bir durumla birlikte de gelebilir (ör. DND-303: tuş başka pencereden alındı).
   * Yayın ve kayıt kararı `issue`'ya değil, `state`'in değişip değişmediğine göre verilir.
   */
  issue?: ReduceIssue
}
