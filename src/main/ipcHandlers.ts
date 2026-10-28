/**
 * Arayüzden gelen bütün çağrılar (`src/shared/ipc.ts` içindeki `DndApi`'nin ana süreç tarafı).
 */
import { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, app, ipcMain, screen, shell } from 'electron'
import { ERROR_CODES, ErrorCode, LogLevel } from '@shared/errors'
import { AmbientImportResult, AppInfo, CharacterExportResult, CharacterImportPreview, CharacterImportResult, IPC, ImportResult, MusicImportResult, PlaybackStatus, StorageCheck, StorageResult, WindowRole } from '@shared/ipc'
import { CATEGORIES } from '@shared/layout'
import { CheckMode, LibraryCategory, MAX_PLAYERS, isAbility, isDiceSides } from '@shared/types'
import { CharacterDeps, applyCharacterImport, cancelCharacterImport, exportCharacters, pickCharacterImport } from './characters'
import { rollAbility, rollDice, rollSkill } from './dice'
import { describeDisplays } from './displays'
import { LibraryDeps, importFiles, importPortrait, importPortraitFile, importWithDialog } from './library'
import { log } from './logger'
import { MusicDeps, addAmbientFile, addAmbientWithDialog, importTracks, importTracksWithDialog } from './music'
import { deliverStartupNotices, notify, report } from './notify'
import { DataPaths } from './paths'
import { Store } from './store'
import { WindowManager } from './windows'

export interface IpcDeps {
  store: Store
  windows: WindowManager
  paths: DataPaths
  /** Ayarlardaki "Kayıt klasörünü değiştir". */
  storage: {
    pickParent: (parentWindow: BrowserWindow | null) => Promise<string | null>
    check: (parent: string) => StorageCheck
    move: (parent: unknown) => Promise<StorageResult>
  }
  getInfo: () => AppInfo
}

const LOG_LEVELS: readonly LogLevel[] = ['BILGI', 'UYARI', 'HATA']
const EMPTY_IMPORT: ImportResult = { added: [], skipped: [], canceled: false }
const EMPTY_MUSIC_IMPORT: MusicImportResult = { added: [], skipped: [], canceled: false }
const EMPTY_AMBIENT_IMPORT: AmbientImportResult = { ambient: null, skipped: [], canceled: false }

function isNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Oyun ekranından gelen durum; yalnızca beklenen alanlar kontrol paneline geçer. */
function parsePlaybackStatus(raw: unknown): PlaybackStatus | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { trackId, position, duration, playing } = raw as Record<string, unknown>
  if (!(trackId === null || typeof trackId === 'string') || !isNonNegative(position) || !isNonNegative(duration)) return null
  return { trackId, position, duration, playing: playing === true }
}

function isCheckMode(value: unknown): value is CheckMode {
  return value === 'normal' || value === 'advantage' || value === 'disadvantage'
}

function isLibraryCategory(value: unknown): value is LibraryCategory {
  return CATEGORIES.some((category) => category.id === value)
}

function openFolder(folder: string): void {
  shell
    .openPath(folder)
    .then((problem) => {
      if (problem) log.info(`Klasör açılamadı: ${folder} (${problem})`)
    })
    .catch((error: unknown) => log.info(`Klasör açılamadı: ${folder} (${String(error)})`))
}

export function registerIpc(deps: IpcDeps): void {
  const { store, windows, paths } = deps
  const library: LibraryDeps = { store, imagesDir: paths.imagesDir }
  const music: MusicDeps = { store, soundsDir: paths.soundsDir }
  const characters: CharacterDeps = { store, imagesDir: paths.imagesDir, appVersion: () => deps.getInfo().version }

  /** Tek yönlü ileti. Uygulamanın açmadığı içerikten gelen iletiler yok sayılır; hata ana süreci düşürmez. */
  const on = (channel: string, listener: (role: WindowRole, event: IpcMainEvent, ...args: unknown[]) => void): void => {
    ipcMain.on(channel, (event, ...args: unknown[]) => {
      const role = windows.roleOf(event.sender)
      if (role === null) return
      try {
        listener(role, event, ...args)
      } catch (error) {
        log.error('DND-901', error, `ileti işlenemedi: ${channel}`)
      }
    })
  }

  /** Yanıt beklenen çağrı. Hata loga yazılır ve arayüze reddedilmiş söz olarak döner. */
  const handle = (
    channel: string,
    handler: (role: WindowRole, event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  ): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const role = windows.roleOf(event.sender)
      if (role === null) throw new Error('Tanınmayan pencere')
      try {
        return await handler(role, event, ...args)
      } catch (error) {
        log.error('DND-901', error, `çağrı işlenemedi: ${channel}`)
        throw error
      }
    })
  }

  handle(IPC.getState, (role, event) => {
    if (role === 'menu') deliverStartupNotices(event.sender)
    return store.getState()
  })

  on(IPC.dispatch, (_role, _event, action) => {
    store.dispatch(action)
  })

  handle(IPC.libraryImport, (_role, event, kind) => {
    if (!isLibraryCategory(kind)) {
      report('DND-306', 'görsel yükleme: geçersiz bölme')
      return EMPTY_IMPORT
    }
    return importWithDialog(library, BrowserWindow.fromWebContents(event.sender), kind)
  })

  handle(IPC.libraryImportFiles, (_role, _event, kind, filePaths) => {
    if (!isLibraryCategory(kind) || !Array.isArray(filePaths)) {
      report('DND-306', 'görsel yükleme: geçersiz bölme ya da dosya listesi')
      return EMPTY_IMPORT
    }
    const files = filePaths.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    return importFiles(library, kind, files)
  })

  handle(IPC.libraryImportPortrait, (_role, event, slot) => {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) {
      report('DND-307', `portre yükleme: yuva ${String(slot)}`)
      return EMPTY_IMPORT
    }
    return importPortrait(library, BrowserWindow.fromWebContents(event.sender), slot)
  })

  handle(IPC.libraryImportPortraitFile, (_role, _event, slot, filePath) => {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) {
      report('DND-307', `portre yükleme: yuva ${String(slot)}`)
      return EMPTY_IMPORT
    }
    if (typeof filePath !== 'string' || filePath.length === 0) {
      report('DND-306', 'portre yükleme: geçersiz dosya yolu')
      return EMPTY_IMPORT
    }
    return importPortraitFile(library, slot, filePath)
  })

  handle(IPC.musicImport, (_role, event) => importTracksWithDialog(music, BrowserWindow.fromWebContents(event.sender)))

  handle(IPC.musicImportFiles, (_role, _event, filePaths) => {
    if (!Array.isArray(filePaths)) {
      report('DND-306', 'müzik yükleme: geçersiz dosya listesi')
      return EMPTY_MUSIC_IMPORT
    }
    const files = filePaths.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    return importTracks(music, files)
  })

  handle(IPC.ambientAdd, (_role, event) => addAmbientWithDialog(music, BrowserWindow.fromWebContents(event.sender)))

  handle(IPC.ambientAddFile, (_role, _event, filePath) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      report('DND-306', 'ortam sesi ekleme: geçersiz dosya yolu')
      return EMPTY_AMBIENT_IMPORT
    }
    return addAmbientFile(music, filePath)
  })

  // Müzik oyun ekranında çalar; ilerleme çubuğu için durumu yalnızca kontrol paneli dinler.
  on(IPC.playbackStatus, (role, _event, raw) => {
    if (role !== 'game') return
    const status = parsePlaybackStatus(raw)
    if (status !== null) windows.sendToControl(IPC.playbackStatus, status)
  })

  on(IPC.playbackUnplayable, (role, _event, kind, id, detail) => {
    if (role !== 'game' || typeof id !== 'string') return
    const { app: appState, session } = store.getState()
    const text = typeof detail === 'string' ? detail.slice(0, 200) : ''
    if (kind === 'track') {
      const track = appState.music.tracks.find((entry) => entry.id === id)
      if (!track || session.playback.trackId !== id) return
      log.code('DND-503', `${track.fileName}: ${text}`)
      notify('DND-503', track.originalName)
      store.dispatch({ type: 'playback/stop' }, { trusted: true })
    } else if (kind === 'ambient') {
      const ambient = appState.music.ambients.find((entry) => entry.id === id)
      if (!ambient || !session.playback.ambientIds.includes(id)) return
      log.code('DND-503', `${ambient.fileName}: ${text}`)
      notify('DND-503', ambient.name)
      store.dispatch({ type: 'ambient/toggle', ambientId: id }, { trusted: true })
    }
  })

  handle(IPC.gameStart, () => {
    windows.startGame()
  })

  handle(IPC.gameEnd, () => {
    windows.endGame('oyunu bitir')
  })

  handle(IPC.diceRollRequest, (_role, _event, sides) => {
    if (!isDiceSides(sides)) {
      report('DND-306', `zar: tanınmayan zar (${String(sides)})`)
      return null
    }
    return rollDice(store, paths.diceFile, sides)
  })

  handle(IPC.diceRollSkill, (_role, _event, slot, skillId, mode) => {
    if (typeof slot !== 'number' || typeof skillId !== 'string' || (mode !== 'normal' && mode !== 'advantage' && mode !== 'disadvantage')) {
      report('DND-306', 'beceri atışı: geçersiz yuva, beceri ya da kip')
      return 'invalid'
    }
    return rollSkill(store, paths.diceFile, slot, skillId, mode)
  })

  handle(IPC.diceRollAbility, (_role, _event, slot, ability, sides, mode) => {
    if (typeof slot !== 'number' || !isAbility(ability) || !isDiceSides(sides) || !isCheckMode(mode)) {
      report('DND-306', 'istatistik atışı: geçersiz yuva, istatistik, zar ya da kip')
      return 'invalid'
    }
    return rollAbility(store, paths.diceFile, slot, ability, sides, mode)
  })

  // Karakter aktarma yalnızca ayarlardan (ana menü) yapılır; oyun sırasında kartlar topluca değişmez.
  const fromMenu = (role: WindowRole, what: string): boolean => {
    if (role !== 'menu') report('DND-306', `${what}: yalnızca ana menüden yapılır`)
    return role === 'menu'
  }

  handle(IPC.charactersExport, (role, event): Promise<CharacterExportResult> | CharacterExportResult => {
    if (!fromMenu(role, 'karakter dışa aktarma')) return { ok: false, canceled: false, code: 'DND-306', fileName: null, count: 0, missingPortraits: [] }
    return exportCharacters(characters, BrowserWindow.fromWebContents(event.sender))
  })

  handle(IPC.charactersPickImport, (role, event): Promise<CharacterImportPreview> | CharacterImportPreview => {
    if (!fromMenu(role, 'karakter içe aktarma')) return { ok: false, canceled: false, code: 'DND-306', token: null, fileName: '', exportedAt: null, cards: [] }
    return pickCharacterImport(characters, BrowserWindow.fromWebContents(event.sender))
  })

  handle(IPC.charactersApplyImport, (role, _event, token): Promise<CharacterImportResult> | CharacterImportResult => {
    if (!fromMenu(role, 'karakter içe aktarma')) return { ok: false, code: 'DND-306', slots: [] }
    return applyCharacterImport(characters, token)
  })

  on(IPC.charactersCancelImport, (_role, _event, token) => {
    cancelCharacterImport(token)
  })

  on(IPC.appQuit, () => {
    app.quit()
  })

  on(IPC.appOpenDataFolder, () => openFolder(paths.dataDir))
  on(IPC.appOpenLogFolder, () => openFolder(paths.logDir))

  handle(IPC.appGetInfo, () => deps.getInfo())

  // Kayıt klasörü: açılıştaki soru bitmiştir; buradakiler ayarlardaki değiştirme içindir.
  handle(IPC.storageGetSetup, () => null)
  handle(IPC.storageRetry, () => false)
  handle(IPC.storageConfirmSetup, (): StorageResult => ({ ok: false, code: null, message: 'Kayıt klasörü zaten belirlenmiş.', target: null }))
  handle(IPC.storagePickParent, (_role, event) => deps.storage.pickParent(BrowserWindow.fromWebContents(event.sender)))
  handle(IPC.storageCheck, (_role, _event, parent) => {
    if (typeof parent !== 'string' || parent.trim() === '') throw new Error('Geçersiz klasör yolu')
    return deps.storage.check(parent)
  })
  handle(IPC.storageMove, (role, _event, parent): Promise<StorageResult> | StorageResult => {
    // Yalnızca ana menüden (ayarlar) değiştirilir.
    if (role !== 'menu') return { ok: false, code: null, message: 'Kayıt klasörü yalnızca ayarlardan değiştirilir.', target: null }
    return deps.storage.move(parent)
  })

  handle(IPC.appGetDisplays, () => describeDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id))

  on(IPC.appToggleGameFullscreen, () => {
    windows.toggleGameFullscreen()
  })

  on(IPC.log, (role, _event, level, code, message) => {
    const safeLevel = LOG_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : 'BILGI'
    const safeCode = typeof code === 'string' && Object.hasOwn(ERROR_CODES, code) ? (code as ErrorCode) : null
    log.write(safeLevel, safeCode, `(${role}) ${typeof message === 'string' ? message : String(message)}`)
  })
}
