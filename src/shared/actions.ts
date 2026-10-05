/**
 * Durumu değiştiren tüm işlemler. Arayüz `window.dnd.dispatch(action)` ile gönderir,
 * ana süreç `reduce` ile uygular, kaydeder ve yeni durumu bütün pencerelere yayar.
 *
 * Yeni kimlikler (id) işlemi gönderen tarafça üretilir; böylece `reduce` saf kalır.
 */
import { ErrorCode } from './errors'
import { AppSettings, FullState, ID, LibraryImage, PlayerProfile, StageItem, Tool } from './types'

export type AppAction =
  // --- Oyuncular ---
  | { type: 'player/update'; slot: number; patch: Partial<Pick<PlayerProfile, 'name' | 'level' | 'note' | 'portraitId'>> }
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
  // --- Diğer ---
  | { type: 'note/setGeneral'; text: string }
  | { type: 'settings/update'; patch: Partial<AppSettings> }

/** Kaydedilmeyen oturum durumu üzerindeki işlemler. */
export type SessionAction =
  /** Araç değişimi çizimlere dokunmaz; çizim dururken fareyle görsel taşınabilir. */
  | { type: 'session/setTool'; tool: Tool }
  /** O an açık olan pencerenin çizimlerini siler (drawingNonce artar). Çizimleri silen tek işlem budur. */
  | { type: 'session/clearDrawing' }

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
