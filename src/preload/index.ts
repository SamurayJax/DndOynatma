import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DndApi, IPC, MEDIA_HOST, MEDIA_SCHEME, Notice, WindowRole } from '@shared/ipc'
import { DiceRoll, FullState } from '@shared/types'

// Preload pencere bağlamında çalışır ama ana süreçle aynı tsconfig'i (DOM'suz) kullanır.
declare const location: { search: string }

function readRole(): WindowRole {
  const role = new URLSearchParams(location.search).get('role')
  return role === 'game' || role === 'control' ? role : 'menu'
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: DndApi = {
  role: readRole(),

  getState: () => ipcRenderer.invoke(IPC.getState),
  dispatch: (action) => ipcRenderer.send(IPC.dispatch, action),
  onState: (listener) => subscribe<FullState>(IPC.state, listener),
  onDiceRoll: (listener) => subscribe<DiceRoll>(IPC.diceRoll, listener),
  onNotice: (listener) => subscribe<Notice>(IPC.notice, listener),

  library: {
    import: (kind) => ipcRenderer.invoke(IPC.libraryImport, kind),
    importFiles: (kind, paths) => ipcRenderer.invoke(IPC.libraryImportFiles, kind, paths),
    importPortrait: (slot) => ipcRenderer.invoke(IPC.libraryImportPortrait, slot),
    importPortraitFile: (slot, path) => ipcRenderer.invoke(IPC.libraryImportPortraitFile, slot, path),
    pathForFile: (file) => webUtils.getPathForFile(file)
  },

  mediaUrl: (fileName) => `${MEDIA_SCHEME}://${MEDIA_HOST}/${encodeURIComponent(fileName)}`,

  game: {
    start: () => ipcRenderer.invoke(IPC.gameStart),
    end: () => ipcRenderer.invoke(IPC.gameEnd)
  },

  dice: {
    roll: () => ipcRenderer.invoke(IPC.diceRollRequest)
  },

  app: {
    quit: () => ipcRenderer.send(IPC.appQuit),
    openDataFolder: () => ipcRenderer.send(IPC.appOpenDataFolder),
    openLogFolder: () => ipcRenderer.send(IPC.appOpenLogFolder),
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
    getDisplays: () => ipcRenderer.invoke(IPC.appGetDisplays),
    toggleGameFullscreen: () => ipcRenderer.send(IPC.appToggleGameFullscreen)
  },

  log: (level, code, message) => ipcRenderer.send(IPC.log, level, code, message)
}

contextBridge.exposeInMainWorld('dnd', api)
