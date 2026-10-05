/**
 * Açılışta kayıt klasörünün sorulduğu pencere. Kayıt henüz yüklenmediği için olağan pencere
 * yöneticisinden ve durumdan bağımsız çalışır; klasör belli olunca kapanır.
 */
import { BrowserWindow, IpcMainInvokeEvent, app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC, SetupInfo } from '@shared/ipc'
import { DATA_FOLDER_NAME, countImages, ensureWritable, hasSaveData, samePath, targetFor, writeConfig } from './location'
import { log } from './logger'
import { checkParent, copySave, failure, isUsablePath, pickParent, success, trashOldFolder } from './relocate'

export interface SetupOptions {
  reason: 'first-run' | 'missing'
  missingDir: string | null
  configFile: string
  /** Eski sürümlerin kayıt klasörü (Belgeler\DndOynatma). */
  legacyDir: string
  /** Önerilen üst klasör. */
  suggestedParent: string
}

const CHANNELS = [
  IPC.storageGetSetup,
  IPC.storagePickParent,
  IPC.storageCheck,
  IPC.storageConfirmSetup,
  IPC.storageRetry,
  IPC.storageMove,
  IPC.appQuit,
  IPC.log
] as const

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * Pencereyi açar ve kullanıcı bir klasör belirleyene kadar bekler. Kullanıcı pencereyi kapatırsa
 * null döner (uygulama kapanır).
 */
export function runSetup(options: SetupOptions): Promise<string | null> {
  const { reason, missingDir, configFile, legacyDir, suggestedParent } = options
  log.info(`Kayıt klasörü soruluyor (${reason === 'first-run' ? 'ilk açılış' : 'klasör bulunamadı'})`)

  return new Promise((resolve) => {
    let settled = false
    const win = new BrowserWindow({
      show: false,
      width: 820,
      height: 720,
      minWidth: 640,
      minHeight: 560,
      title: 'DndOynatma — Kayıt Klasörü',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    const contents = win.webContents
    win.on('page-title-updated', (event) => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event) => event.preventDefault())
    contents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) {
        contents.toggleDevTools()
        event.preventDefault()
      }
    })
    win.once('ready-to-show', () => win.show())

    const finish = (dataDir: string | null): void => {
      if (settled) return
      settled = true
      for (const channel of CHANNELS) {
        ipcMain.removeHandler(channel)
        ipcMain.removeAllListeners(channel)
      }
      resolve(dataDir)
      // Yanıt arayüze ulaşsın diye pencere biraz sonra kapatılır; o sırada ana menü açılmış olur.
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      }, 200)
    }
    win.on('closed', () => finish(null))

    /** Yalnızca bu pencereden gelen çağrılar yanıtlanır. */
    const handle = (channel: string, handler: (...args: unknown[]) => unknown): void => {
      ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (event.sender !== contents) throw new Error('Tanınmayan pencere')
        return handler(...args)
      })
    }

    const legacy = (): SetupInfo['legacy'] => (hasSaveData(legacyDir) ? { dir: legacyDir, images: countImages(legacyDir) } : null)

    handle(IPC.storageGetSetup, (): SetupInfo => ({ reason, folderName: DATA_FOLDER_NAME, suggestedParent, missingDir, legacy: legacy() }))

    handle(IPC.storagePickParent, () => pickParent(win, suggestedParent))

    handle(IPC.storageCheck, (parent) => {
      if (!isUsablePath(parent)) throw new Error('Geçersiz klasör yolu')
      return checkParent(parent, null)
    })

    handle(IPC.storageRetry, () => {
      if (missingDir === null || !isDirectory(missingDir)) return false
      log.info('Kayıt klasörü yeniden bulundu')
      finish(missingDir)
      return true
    })

    handle(IPC.storageConfirmSetup, async (parent, migrateLegacy) => {
      if (!isUsablePath(parent)) return failure('DND-108', 'geçersiz klasör yolu')
      const target = targetFor(parent)
      // Hedefte kayıt varsa o kullanılır; üstüne eski kayıt kopyalanmaz.
      const adopting = hasSaveData(target)
      if (!ensureWritable(target)) return failure('DND-108', 'klasör oluşturulamadı ya da yazılamıyor', target)

      let moved = false
      if (migrateLegacy === true && !adopting && hasSaveData(legacyDir) && !samePath(legacyDir, target)) {
        const copied = copySave(legacyDir, target)
        if (!copied.ok) return failure('DND-109', copied.detail, target)
        moved = true
      }

      try {
        writeConfig(configFile, { dataDir: target })
      } catch (error) {
        return failure('DND-108', `ayar dosyası yazılamadı: ${error instanceof Error ? error.message : String(error)}`, target)
      }
      log.info(`Kayıt klasörü belirlendi${adopting ? ' (var olan kayıt kullanılacak)' : moved ? ' (eski kayıt taşındı)' : ''}`)

      // Eski klasör ancak yeni yer ayara yazıldıktan sonra kaldırılır; öncesinde bir hata eski kaydı korur.
      const trashed = moved ? await trashOldFolder(legacyDir) : true
      finish(target)
      return success(target, trashed ? '' : 'Eski kayıt klasörü kaldırılamadı; yerinde duruyor.')
    })

    handle(IPC.storageMove, () => failure('DND-304', 'kayıt klasörü henüz belirlenmedi'))

    ipcMain.on(IPC.appQuit, (event) => {
      if (event.sender === contents) finish(null)
    })
    ipcMain.on(IPC.log, (event, level, _code, message) => {
      if (event.sender === contents) log.write(level === 'HATA' ? 'HATA' : level === 'UYARI' ? 'UYARI' : 'BILGI', null, `(setup) ${String(message)}`)
    })

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const loading =
      !app.isPackaged && devUrl
        ? win.loadURL(`${devUrl}?role=setup`)
        : win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { role: 'setup' } })
    loading.catch((error: unknown) => {
      if (!settled) log.error('DND-902', error, 'kayıt klasörü penceresi yüklenemedi')
    })
  })
}
