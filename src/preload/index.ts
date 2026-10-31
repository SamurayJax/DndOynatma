import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DndApi, IPC, MEDIA_HOST, MEDIA_SCHEME, Notice, PlaybackStatus, SOUND_HOST, UpdateStatus, WindowRole } from '@shared/ipc'
import { DiceRoll, FullState } from '@shared/types'

// Preload pencere bağlamında çalışır ama ana süreçle aynı tsconfig'i (DOM'suz) kullanır.
declare const location: { search: string }

function readRole(): WindowRole {
  const role = new URLSearchParams(location.search).get('role')
  return role === 'game' || role === 'control' || role === 'setup' ? role : 'menu'
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
  soundUrl: (fileName) => `${MEDIA_SCHEME}://${SOUND_HOST}/${encodeURIComponent(fileName)}`,

  music: {
    import: () => ipcRenderer.invoke(IPC.musicImport),
    importFiles: (paths) => ipcRenderer.invoke(IPC.musicImportFiles, paths),
    addAmbient: () => ipcRenderer.invoke(IPC.ambientAdd),
    addAmbientFile: (path) => ipcRenderer.invoke(IPC.ambientAddFile, path),
    sendStatus: (status) => ipcRenderer.send(IPC.playbackStatus, status),
    onStatus: (listener) => subscribe<PlaybackStatus>(IPC.playbackStatus, listener),
    reportUnplayable: (kind, id, detail) => ipcRenderer.send(IPC.playbackUnplayable, kind, id, detail)
  },

  game: {
    start: () => ipcRenderer.invoke(IPC.gameStart),
    end: () => ipcRenderer.invoke(IPC.gameEnd)
  },

  storage: {
    getSetup: () => ipcRenderer.invoke(IPC.storageGetSetup),
    pickParent: () => ipcRenderer.invoke(IPC.storagePickParent),
    check: (parent) => ipcRenderer.invoke(IPC.storageCheck, parent),
    confirmSetup: (parent, migrateLegacy) => ipcRenderer.invoke(IPC.storageConfirmSetup, parent, migrateLegacy),
    retry: () => ipcRenderer.invoke(IPC.storageRetry),
    move: (parent) => ipcRenderer.invoke(IPC.storageMove, parent)
  },

  dice: {
    roll: (sides) => ipcRenderer.invoke(IPC.diceRollRequest, sides),
    rollSkill: (slot, skillId, mode) => ipcRenderer.invoke(IPC.diceRollSkill, slot, skillId, mode),
    rollAbility: (slot, ability, sides, mode) => ipcRenderer.invoke(IPC.diceRollAbility, slot, ability, sides, mode)
  },

  characters: {
    export: () => ipcRenderer.invoke(IPC.charactersExport),
    pickImport: () => ipcRenderer.invoke(IPC.charactersPickImport),
    applyImport: (token) => ipcRenderer.invoke(IPC.charactersApplyImport, token),
    cancelImport: (token) => ipcRenderer.send(IPC.charactersCancelImport, token)
  },

  app: {
    quit: () => ipcRenderer.send(IPC.appQuit),
    openDataFolder: () => ipcRenderer.send(IPC.appOpenDataFolder),
    openLogFolder: () => ipcRenderer.send(IPC.appOpenLogFolder),
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
    getDisplays: () => ipcRenderer.invoke(IPC.appGetDisplays),
    toggleGameFullscreen: () => ipcRenderer.send(IPC.appToggleGameFullscreen)
  },

  update: {
    getStatus: () => ipcRenderer.invoke(IPC.updateGetStatus),
    onStatus: (listener) => subscribe<UpdateStatus>(IPC.updateStatus, listener),
    accept: () => ipcRenderer.send(IPC.updateAccept),
    decline: () => ipcRenderer.send(IPC.updateDecline)
  },

  log: (level, code, message) => ipcRenderer.send(IPC.log, level, code, message)
}

contextBridge.exposeInMainWorld('dnd', api)
