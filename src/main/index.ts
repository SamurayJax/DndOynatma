/**
 * Ana süreç girişi: açılış sırası, kapanış ve beklenmeyen hatalar.
 */
import { Menu, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { AppInfo } from '@shared/ipc'
import { AppState, FullState, LibraryImage, createInitialAppState, createInitialSession } from '@shared/types'
import { checkAndCreateCrashMarker, removeCrashMarker } from './crashMarker'
import { clearDiceFile } from './dice'
import { isSafeFileName } from './fileNames'
import { registerIpc } from './ipcHandlers'
import { log, pruneOldLogs } from './logger'
import { handleMediaProtocol, registerMediaScheme } from './media'
import { broadcast, queueStartupNotice, report } from './notify'
import { DataPaths, buildDataPaths, ensureDataDirs, resolveDataDir } from './paths'
import { LoadResult, loadAppState, loadDiceHistory, saveAppState } from './storage'
import { Store } from './store'
import { WindowManager } from './windows'

let paths: DataPaths | null = null
let store: Store | null = null
let windows: WindowManager | null = null
let crashedLastTime = false
let exiting = false

/** Açılışta kayıt klasörünü belirler. Belgeler klasörü bulunamazsa uygulamanın kendi klasörüne düşer. */
function prepareDataPaths(): { paths: DataPaths; error: unknown } {
  let documentsDir: string
  let error: unknown = null
  try {
    documentsDir = app.getPath('documents')
  } catch (cause) {
    error = cause
    documentsDir = app.getPath('userData')
  }
  const dataPaths = buildDataPaths(resolveDataDir(documentsDir))
  try {
    ensureDataDirs(dataPaths)
  } catch (cause) {
    error ??= cause
  }
  return { paths: dataPaths, error }
}

function loadSavedState(dataPaths: DataPaths, storageUsable: boolean): LoadResult {
  if (!storageUsable) {
    // Klasör yoksa okunacak bir şey de yok; yazmaya çalışmak her değişiklikte hata üretir.
    return { state: createInitialAppState(), source: 'fresh', code: null, detail: '', saveDisabled: true, quarantined: [] }
  }
  const loaded = loadAppState(dataPaths.saveFile, dataPaths.backupFile)
  if (loaded.code) {
    log.code(loaded.code, loaded.detail)
    queueStartupNotice(loaded.code)
  }
  for (const file of loaded.quarantined) log.info(`Bozuk dosya saklandı: ${path.basename(file)}`)
  const { state } = loaded
  log.info(
    `Kayıt yüklendi (${loaded.source}): ${state.library.length} görsel, ${state.scenes.length} pencere` +
      (loaded.saveDisabled ? ' — kayıt yazma kapalı' : '')
  )
  return loaded
}

/** Kütüphaneden çıkan görselin dosyasını geri dönüşüm kutusuna taşır (geri alınabilir). */
function trashImageFile(imagesDir: string, image: LibraryImage): void {
  // Kayıt dosyası elle değiştirilmiş olabilir; klasör dışını gösteren ada dokunulmaz.
  if (!isSafeFileName(image.fileName)) {
    report('DND-205', `${image.id}: geçersiz dosya adı`)
    return
  }
  const file = path.join(imagesDir, image.fileName)
  if (!fs.existsSync(file)) {
    log.info(`Görsel silindi: ${image.fileName} (dosyası zaten yoktu)`)
    return
  }
  shell
    .trashItem(file)
    .then(() => log.info(`Görsel silindi: ${image.fileName} (geri dönüşüm kutusuna taşındı)`))
    .catch((error: unknown) => report('DND-205', `${image.fileName}: ${error instanceof Error ? error.message : String(error)}`))
}

function start(): void {
  const prepared = prepareDataPaths()
  const dataPaths = prepared.paths
  paths = dataPaths

  log.init(dataPaths.logDir, { echo: !app.isPackaged })
  const prunedLogs = pruneOldLogs(dataPaths.logDir)
  log.info(`Uygulama açıldı: sürüm ${app.getVersion()}, kayıt klasörü ${dataPaths.dataDir}`)
  if (prunedLogs.length > 0) log.info(`${prunedLogs.length} eski log dosyası silindi`)

  const storageUsable = prepared.error === null
  if (!storageUsable) {
    log.error('DND-104', prepared.error, dataPaths.dataDir)
    queueStartupNotice('DND-104')
  }

  if (storageUsable) {
    crashedLastTime = checkAndCreateCrashMarker(dataPaths.crashMarker)
    // Uyarı arayüzde AppInfo.crashedLastTime üzerinden gösterilir; burada yalnızca loga yazılır.
    if (crashedLastTime) log.code('DND-903')
  }

  const loaded = loadSavedState(dataPaths, storageUsable)

  // zar.json yalnızca önceki oturum oyunu normal bitirmediyse doludur.
  const session = createInitialSession()
  const dice = loadDiceHistory(dataPaths.diceFile)
  if (dice.error) {
    log.code('DND-105', dice.error)
    queueStartupNotice('DND-105')
  } else if (dice.rolls.length > 0) {
    session.diceHistory = dice.rolls
    log.info(`Önceki oturumdan ${dice.rolls.length} zar atışı geri yüklendi`)
  }

  // Yedek her kayıtta yenilenir; yazılamadığı sürece her seferinde loga yazmak dosyayı doldurur.
  let backupFailing = false
  const writeSave = (appState: AppState): void => {
    const { backupError } = saveAppState(dataPaths.saveFile, dataPaths.backupFile, appState)
    if (backupError !== null && !backupFailing) {
      const reason = backupError instanceof Error ? backupError.message : String(backupError)
      log.write('UYARI', null, `Yedek güncellenemedi (kayit.json yazıldı, kayit.yedek.json eski haliyle duruyor): ${reason}`)
    }
    backupFailing = backupError !== null
  }

  const initial: FullState = { app: loaded.state, session }
  const activeStore = new Store({
    initial,
    saveEnabled: !loaded.saveDisabled,
    writeSave,
    broadcast,
    report,
    trashImage: (image) => trashImageFile(dataPaths.imagesDir, image)
  })
  store = activeStore

  const activeWindows = new WindowManager({ store: activeStore, clearDice: () => clearDiceFile(dataPaths.diceFile) })
  windows = activeWindows

  handleMediaProtocol(dataPaths.imagesDir)
  registerIpc({
    store: activeStore,
    windows: activeWindows,
    paths: dataPaths,
    getInfo: (): AppInfo => ({
      version: app.getVersion(),
      dataDir: dataPaths.dataDir,
      logDir: dataPaths.logDir,
      logFile: log.currentFile(),
      crashedLastTime
    })
  })

  Menu.setApplicationMenu(null)
  activeWindows.openMenu()
}

/** Düzgün kapanış. Çökme işareti yalnızca burada silinir. */
function cleanExit(): void {
  if (exiting || !paths || !store) return
  exiting = true
  const saved = store.flushSave()
  // Normal çıkış oyunun bitmesi sayılır; zar kaydı yalnızca çökmede kalır.
  clearDiceFile(paths.diceFile)
  removeCrashMarker(paths.crashMarker)
  log.info(saved ? 'Uygulama kapandı' : 'Uygulama kapandı (son değişiklikler yazılamadı)')
  log.close()
}

/** Yakalanmamış hata: loga yaz, kaydı kurtarmayı dene, çökme işaretini bırakıp çık. */
function fatal(error: unknown, origin: string): void {
  if (exiting) return
  exiting = true
  log.error('DND-901', error, origin)
  try {
    store?.flushSave()
  } catch {
    // Kayıt da yazılamıyorsa yapılacak bir şey kalmadı.
  }
  log.close()
  app.exit(1)
}

registerMediaScheme()

// Windows görev çubuğunda pencerelerin kurulu uygulamanın kısayoluyla aynı grupta toplanması için.
app.setAppUserModelId('com.samurayjax.dndoynatma')

// Testler aynı anda birkaç kopya çalıştırır; her biri kendi DND_DATA_DIR klasörünü kullanır.
const isolatedRun = Boolean(process.env['DND_DATA_DIR']?.trim())

if (!isolatedRun && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  process.on('uncaughtException', (error) => fatal(error, 'uncaughtException'))
  process.on('unhandledRejection', (reason) => fatal(reason, 'unhandledRejection'))

  app.on('second-instance', () => windows?.focusMain())
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => windows?.setQuitting())
  app.on('will-quit', cleanExit)

  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => fatal(error, 'açılış'))
}
