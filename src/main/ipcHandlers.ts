/**
 * Arayüzden gelen bütün çağrılar (`src/shared/ipc.ts` içindeki `DndApi`'nin ana süreç tarafı).
 */
import { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, app, ipcMain, screen, shell } from 'electron'
import { ERROR_CODES, ErrorCode, LogLevel } from '@shared/errors'
import { AppInfo, IPC, ImportResult, StorageCheck, StorageResult, WindowRole } from '@shared/ipc'
import { CATEGORIES } from '@shared/layout'
import { LibraryCategory, MAX_PLAYERS } from '@shared/types'
import { rollDice } from './dice'
import { describeDisplays } from './displays'
import { LibraryDeps, importFiles, importPortrait, importPortraitFile, importWithDialog } from './library'
import { log } from './logger'
import { deliverStartupNotices, report } from './notify'
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

  handle(IPC.gameStart, () => {
    windows.startGame()
  })

  handle(IPC.gameEnd, () => {
    windows.endGame('oyunu bitir')
  })

  handle(IPC.diceRollRequest, () => rollDice(store, paths.diceFile))

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
