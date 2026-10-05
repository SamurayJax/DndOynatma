/**
 * Pencereler ile ana süreç arasındaki arayüz. Preload bunu `window.dnd` olarak sunar.
 */
import { Action } from './actions'
import { ErrorCode, LogLevel } from './errors'
import { DiceRoll, FullState, LibraryCategory, LibraryImage } from './types'

/**
 * menu: ana menü ve ayarlar · game: oyuncuların gördüğü oyun ekranı · control: DM'in kontrol paneli ·
 * setup: kayıt klasörünün sorulduğu açılış penceresi (kayıt henüz yüklenmemiştir)
 */
export type WindowRole = 'menu' | 'game' | 'control' | 'setup'

export const IPC = {
  getState: 'dnd:getState',
  dispatch: 'dnd:dispatch',
  state: 'dnd:state',
  diceRoll: 'dnd:diceRoll',
  notice: 'dnd:notice',
  libraryImport: 'dnd:library:import',
  libraryImportFiles: 'dnd:library:importFiles',
  libraryImportPortrait: 'dnd:library:importPortrait',
  libraryImportPortraitFile: 'dnd:library:importPortraitFile',
  gameStart: 'dnd:game:start',
  gameEnd: 'dnd:game:end',
  diceRollRequest: 'dnd:dice:roll',
  appQuit: 'dnd:app:quit',
  appOpenDataFolder: 'dnd:app:openDataFolder',
  appOpenLogFolder: 'dnd:app:openLogFolder',
  appGetInfo: 'dnd:app:getInfo',
  appGetDisplays: 'dnd:app:getDisplays',
  appToggleGameFullscreen: 'dnd:app:toggleGameFullscreen',
  storageGetSetup: 'dnd:storage:getSetup',
  storagePickParent: 'dnd:storage:pickParent',
  storageCheck: 'dnd:storage:check',
  storageConfirmSetup: 'dnd:storage:confirmSetup',
  storageRetry: 'dnd:storage:retry',
  storageMove: 'dnd:storage:move',
  log: 'dnd:log'
} as const

/** Görsellerin arayüze sunulduğu özel protokol: `dnd-media://gorsel/<fileName>` */
export const MEDIA_SCHEME = 'dnd-media'
export const MEDIA_HOST = 'gorsel'

/** Ekranda kısa süre gösterilen bildirim. Kodlu olanlar loga da yazılmıştır. */
export interface Notice {
  id: string
  level: LogLevel
  code: ErrorCode | null
  message: string
}

export interface ImportResult {
  added: LibraryImage[]
  /** Atlanan dosyalar ve nedenleri. */
  skipped: { name: string; code: ErrorCode }[]
  /** Kullanıcı dosya seçme penceresini iptal etti. */
  canceled: boolean
}

/** Kayıt klasörü sorulurken açılış penceresine verilen bilgi. */
export interface SetupInfo {
  /** first-run: klasör hiç seçilmemiş · missing: seçilmiş klasör yerinde yok */
  reason: 'first-run' | 'missing'
  /** Uygulamanın seçilen yerin içine açacağı klasörün adı. */
  folderName: string
  /** Önerilen üst klasör (eşitlenmeyen bir yer). */
  suggestedParent: string
  /** `missing` durumunda bulunamayan klasör. */
  missingDir: string | null
  /** Eski sürümlerin kayıt klasöründe (Belgeler\DndOynatma) veri varsa. */
  legacy: { dir: string; images: number } | null
}

/** Bir üst klasör seçildiğinde kaydın oraya nasıl yerleşeceği. */
export interface StorageCheck {
  parent: string
  /** Kaydın yazılacağı klasör. */
  target: string
  /** Klasör bulut eşitlemeli bir yerdeyse hizmetin adı (OneDrive, Dropbox…). */
  cloud: string | null
  writable: boolean
  /** Hedefte zaten bir DndOynatma kaydı var; taşıma yapılmaz, o kayıt kullanılır. */
  hasSave: boolean
  /** Hedef şu an kullanılan kayıt klasörünün kendisi. */
  sameAsCurrent: boolean
}

export interface StorageResult {
  ok: boolean
  code: ErrorCode | null
  /** Kullanıcıya gösterilecek kısa açıklama. */
  message: string
  target: string | null
}

export interface AppInfo {
  version: string
  dataDir: string
  /** Kayıt klasörü bulut eşitlemeli bir yerdeyse hizmetin adı. */
  dataDirCloud: string | null
  /** Klasör ortam değişkeniyle sabitlenmiş (test / deneme); arayüzden değiştirilemez. */
  dataDirFixed: boolean
  logDir: string
  /** Bu çalıştırmanın log dosyası. */
  logFile: string
  /** Uygulama geçen sefer düzgün kapatılmadıysa true (DND-903). */
  crashedLastTime: boolean
}

export interface DisplayInfo {
  id: number
  /** "1: 2560x1440 (ana)" gibi gösterim metni. */
  label: string
  width: number
  height: number
  primary: boolean
}

export interface DndApi {
  /** Bu pencerenin rolü. */
  role: WindowRole

  getState(): Promise<FullState>
  dispatch(action: Action): void
  /** Durum her değiştiğinde çağrılır. Dönen fonksiyon aboneliği kaldırır. */
  onState(listener: (state: FullState) => void): () => void
  /** Her zar atışında bütün pencerelerde çağrılır (animasyon için). */
  onDiceRoll(listener: (roll: DiceRoll) => void): () => void
  onNotice(listener: (notice: Notice) => void): () => void

  library: {
    /** Dosya seçme penceresi açar (çoklu seçim), dosyaları kopyalar ve kütüphaneye ekler. */
    import(kind: LibraryCategory): Promise<ImportResult>
    /** Sürükle-bırak için: verilen yollardaki dosyaları ekler. */
    importFiles(kind: LibraryCategory, paths: string[]): Promise<ImportResult>
    /** Tek dosya seçtirir, portre olarak ekler ve oyuncu yuvasına bağlar. Eski portre kaldırılır. */
    importPortrait(slot: number): Promise<ImportResult>
    /** Sürükle-bırak için: verilen yoldaki dosyayı portre olarak ekler ve yuvaya bağlar. */
    importPortraitFile(slot: number, path: string): Promise<ImportResult>
    /** Sürüklenen bir File nesnesinin diskteki yolu. */
    pathForFile(file: File): string
  }

  /** Görsel dosya adından <img> ve Konva'da kullanılabilecek adres üretir. */
  mediaUrl(fileName: string): string

  game: {
    /** Oyun ekranını ve kontrol panelini açar, ana menüyü gizler. */
    start(): Promise<void>
    /** İki pencereyi kapatır, zar kaydını temizler, ana menüyü gösterir. */
    end(): Promise<void>
  }

  storage: {
    /** Açılış penceresi için: kayıt klasörü neden soruluyor. Olağan pencerelerde null. */
    getSetup(): Promise<SetupInfo | null>
    /** Klasör seçme penceresi açar; seçilen üst klasörü döndürür (iptalde null). */
    pickParent(): Promise<string | null>
    check(parent: string): Promise<StorageCheck>
    /** Açılışta: klasörü oluşturur, istenirse eski kaydı taşır ve uygulamayı o klasörle başlatır. */
    confirmSetup(parent: string, migrateLegacy: boolean): Promise<StorageResult>
    /** Açılışta "bulunamadı" durumunda: eski klasör geri geldiyse uygulamayı onunla başlatır. */
    retry(): Promise<boolean>
    /** Ayarlardan: kaydı yeni klasöre taşır ve uygulamayı yeniden başlatır. */
    move(parent: string): Promise<StorageResult>
  }

  dice: {
    /** d20 atar. Sonuç ana süreçte üretilir, kaydedilir ve onDiceRoll ile yayılır. */
    roll(): Promise<DiceRoll | null>
  }

  app: {
    quit(): void
    openDataFolder(): void
    openLogFolder(): void
    getInfo(): Promise<AppInfo>
    getDisplays(): Promise<DisplayInfo[]>
    toggleGameFullscreen(): void
  }

  /** Arayüzden log dosyasına satır yazar. */
  log(level: LogLevel, code: ErrorCode | null, message: string): void
}
