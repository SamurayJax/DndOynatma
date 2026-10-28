/**
 * Pencereler ile ana süreç arasındaki arayüz. Preload bunu `window.dnd` olarak sunar.
 */
import { Action } from './actions'
import { ErrorCode, LogLevel } from './errors'
import { AmbientSound, DiceRoll, DiceSides, FullState, ID, LibraryCategory, LibraryImage, MusicTrack } from './types'

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
  musicImport: 'dnd:music:import',
  musicImportFiles: 'dnd:music:importFiles',
  ambientAdd: 'dnd:ambient:add',
  ambientAddFile: 'dnd:ambient:addFile',
  playbackStatus: 'dnd:playback:status',
  playbackUnplayable: 'dnd:playback:unplayable',
  charactersExport: 'dnd:characters:export',
  charactersPickImport: 'dnd:characters:pickImport',
  charactersApplyImport: 'dnd:characters:applyImport',
  charactersCancelImport: 'dnd:characters:cancelImport',
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

/**
 * Görsellerin ve seslerin arayüze sunulduğu özel protokol:
 * `dnd-media://gorsel/<fileName>` (gorseller/) · `dnd-media://ses/<fileName>` (muzik/)
 */
export const MEDIA_SCHEME = 'dnd-media'
export const MEDIA_HOST = 'gorsel'
export const SOUND_HOST = 'ses'

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

export interface MusicImportResult {
  added: MusicTrack[]
  skipped: { name: string; code: ErrorCode }[]
  canceled: boolean
}

export interface AmbientImportResult {
  /** Eklenen ortam sesi; eklenemediyse null. */
  ambient: AmbientSound | null
  skipped: { name: string; code: ErrorCode }[]
  canceled: boolean
}

/** Oyun ekranındaki müziğin anlık durumu; kontrol panelinin ilerleme çubuğu bununla çizilir. */
export interface PlaybackStatus {
  trackId: ID | null
  /** Saniye. */
  position: number
  /** Saniye; bilinmiyorsa 0. */
  duration: number
  /** Ses gerçekten akıyor (yükleniyor ya da duraklatılmışsa false). */
  playing: boolean
}

export interface CharacterExportResult {
  ok: boolean
  /** Kaydetme penceresi iptal edildi. */
  canceled: boolean
  code: ErrorCode | null
  /** Yazılan dosyanın adı (yol değil). */
  fileName: string | null
  /** Dosyaya yazılan kart sayısı. */
  count: number
  /** Portre dosyası bulunamadığı için portresiz yazılan kartların yuvaları. */
  missingPortraits: number[]
}

/** Karakter dosyasındaki bir kartın, onay kutusunda gösterilecek kadar özeti. */
export interface IncomingCard {
  /** 0..3 */
  slot: number
  name: string
  level: number
  hp: number
  hasNote: boolean
  hasPortrait: boolean
  /** Kart şu an zaten aynı (portresi dahil); içe aktarma bu karta dokunmaz. */
  unchanged: boolean
}

/** Seçilen karakter dosyasının içeriği. Kayda henüz dokunulmamıştır. */
export interface CharacterImportPreview {
  ok: boolean
  /** Dosya seçme penceresi iptal edildi. */
  canceled: boolean
  code: ErrorCode | null
  /** `applyImport`'a verilecek anahtar; dosya okunamadıysa null. */
  token: string | null
  fileName: string
  /** Dosyanın yazıldığı an (ISO); bilinmiyorsa null. */
  exportedAt: string | null
  /** Dosyadaki kartlar. Dosyada olmayan yuvalara dokunulmaz. */
  cards: IncomingCard[]
}

export interface CharacterImportResult {
  ok: boolean
  code: ErrorCode | null
  /** Değişen kartların yuvaları. */
  slots: number[]
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
  /** `muzik/` altındaki dosyanın <audio> ve <video> adresi. */
  soundUrl(fileName: string): string

  /** Müzik listesi ve ortam sesleri. Çalma işlemleri `dispatch` ile yapılır (playback/…). */
  music: {
    /** Dosya seçme penceresi açar (çoklu seçim), dosyaları kopyalar ve listenin sonuna ekler. */
    import(): Promise<MusicImportResult>
    /** Sürükle-bırak için: verilen yollardaki dosyaları ekler. */
    importFiles(paths: string[]): Promise<MusicImportResult>
    /** Tek dosya seçtirir ve dosyanın adıyla bir ortam sesi düğmesi ekler. */
    addAmbient(): Promise<AmbientImportResult>
    addAmbientFile(path: string): Promise<AmbientImportResult>
    /** Oyun ekranı gönderir; kontrol paneline iletilir. */
    sendStatus(status: PlaybackStatus): void
    /** Kontrol paneli dinler. Dönen fonksiyon aboneliği kaldırır. */
    onStatus(listener: (status: PlaybackStatus) => void): () => void
    /** Oyun ekranı gönderir: parça ya da ortam sesi çalınamadı (DND-503). Çalma durdurulur. */
    reportUnplayable(kind: 'track' | 'ambient', id: ID, detail: string): void
  }

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
    /** Seçilen zarı atar. Sonuç ana süreçte üretilir, kaydedilir ve onDiceRoll ile yayılır. */
    roll(sides: DiceSides): Promise<DiceRoll | null>
  }

  /** Oyuncu kartlarını (bilgiler + portreler) tek dosyaya aktarma. Yalnızca ana menüden çalışır. */
  characters: {
    /** Kaydetme penceresi açar ve dolu kartları seçilen dosyaya yazar. */
    export(): Promise<CharacterExportResult>
    /** Dosya seçtirir, okur ve denetler. Kartlara dokunmaz; onay için özet döndürür. */
    pickImport(): Promise<CharacterImportPreview>
    /** `pickImport`'un okuduğu dosyadaki kartları, aynı numaralı kartların yerine koyar. */
    applyImport(token: string): Promise<CharacterImportResult>
    /** Onay kutusunda vazgeçildi; okunan dosya bellekten atılır. */
    cancelImport(token: string): void
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
