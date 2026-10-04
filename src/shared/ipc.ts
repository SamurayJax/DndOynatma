/**
 * Pencereler ile ana süreç arasındaki arayüz. Preload bunu `window.dnd` olarak sunar.
 */
import { Action } from './actions'
import { ErrorCode, LogLevel } from './errors'
import { DiceRoll, FullState, LibraryCategory, LibraryImage } from './types'

/** menu: ana menü ve ayarlar · game: oyuncuların gördüğü oyun ekranı · control: DM'in kontrol paneli */
export type WindowRole = 'menu' | 'game' | 'control'

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

export interface AppInfo {
  version: string
  dataDir: string
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
