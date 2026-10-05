/**
 * Ana süreç girişi: açılış sırası, kapanış ve beklenmeyen hatalar.
 */
import { Menu, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { AppInfo, StorageResult } from '@shared/ipc'
import { AppState, FullState, LibraryImage, createInitialAppState, createInitialSession } from '@shared/types'
import { checkAndCreateCrashMarker, removeCrashMarker } from './crashMarker'
import { clearDiceFile } from './dice'
import { isSafeFileName } from './fileNames'
import { registerIpc } from './ipcHandlers'
import { CONFIG_FILE_NAME, detectCloud, ensureWritable, hasSaveData, resolveStartLocation, samePath, targetFor, writeConfig } from './location'
import { log, pruneOldLogs } from './logger'
import { handleMediaProtocol, registerMediaScheme } from './media'
import { broadcast, queueStartupNotice, report } from './notify'
import { DataPaths, buildDataPaths, ensureDataDirs } from './paths'
import { checkParent, copySave, failure, isUsablePath, pickParent, success, trashOldFolder } from './relocate'
import { runSetup } from './setup'
import { LoadResult, loadAppState, loadDiceHistory, saveAppState } from './storage'
import { Store } from './store'
import { WindowManager } from './windows'

let paths: DataPaths | null = null
let store: Store | null = null
let windows: WindowManager | null = null
let crashedLastTime = false
let exiting = false

/** Seçilen kayıt klasörünün yolunu tutan küçük ayar dosyası; uygulamanın kendi ayar klasöründedir. */
function configFilePath(): string {
  const dir = process.env['DND_CONFIG_DIR']?.trim() || app.getPath('userData')
  return path.join(dir, CONFIG_FILE_NAME)
}

/** 0.8 sürümlerinin kayıt klasörü: Belgeler\DndOynatma. Varsa ilk açılışta taşınması önerilir. */
function legacyDataDir(): string {
  const override = process.env['DND_LEGACY_DIR']?.trim()
  if (override) return path.resolve(override)
  try {
    return path.join(app.getPath('documents'), 'DndOynatma')
  } catch {
    return path.join(app.getPath('userData'), 'DndOynatma')
  }
}

/** Kayıt klasörü için önerilen üst klasör: kullanıcı klasörünün kökü (bulut eşitlemesi dışında). */
function suggestedParentDir(): string {
  return process.env['DND_HOME_DIR']?.trim() || app.getPath('home')
}

function prepareDataPaths(dataDir: string): { paths: DataPaths; error: unknown } {
  const dataPaths = buildDataPaths(dataDir)
  let error: unknown = null
  try {
    ensureDataDirs(dataPaths)
  } catch (cause) {
    error = cause
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

/** Açılış: kayıt klasörü belli değilse önce kullanıcıya sorulur, sonra uygulama o klasörle başlar. */
async function start(): Promise<void> {
  Menu.setApplicationMenu(null)
  const configFile = configFilePath()
  const location = resolveStartLocation(configFile)

  if (location.kind === 'ready') {
    startWithDataDir(location.dataDir, location.fixed, configFile)
    return
  }

  // Kayıt klasörü belli olana kadar log uygulamanın ayar klasörüne yazılır.
  log.init(path.join(path.dirname(configFile), 'log'), { echo: !app.isPackaged })
  log.info(`Uygulama açıldı: sürüm ${app.getVersion()}, kayıt klasörü henüz belli değil`)
  if (location.reason === 'missing') log.code('DND-107', location.missingDir ?? '')

  const chosen = await runSetup({
    reason: location.reason,
    missingDir: location.missingDir,
    configFile,
    legacyDir: legacyDataDir(),
    suggestedParent: suggestedParentDir()
  })
  if (chosen === null) {
    log.info('Kayıt klasörü seçilmeden çıkıldı')
    log.close()
    app.quit()
    return
  }
  startWithDataDir(chosen, false, configFile)
}

/**
 * Ayarlardan kayıt klasörünü değiştirme: kayıt yeni yere kopyalanır, doğrulanır, yeni yer ayara
 * yazılır, eski klasör Geri Dönüşüm Kutusu'na gönderilir ve uygulama yeni klasörle yeniden başlar.
 * Herhangi bir adım başarısız olursa eski kayıt yerinde ve kullanımda kalır.
 */
async function moveDataDir(parent: unknown, dataPaths: DataPaths, activeStore: Store, configFile: string, fixed: boolean): Promise<StorageResult> {
  if (fixed) return failure('DND-108', 'kayıt klasörü ortam değişkeniyle sabitlenmiş')
  if (!isUsablePath(parent)) return failure('DND-108', 'geçersiz klasör yolu')
  if (activeStore.getState().session.phase === 'playing') return failure('DND-304', 'oyun açıkken kayıt klasörü değiştirilemez')

  const target = targetFor(parent)
  if (samePath(target, dataPaths.dataDir)) return success(target, 'Kayıt zaten bu klasörde.')
  // Hedefte kayıt varsa o kullanılır; şu anki kayıt yerinde bırakılır.
  const adopting = hasSaveData(target)
  if (!ensureWritable(target)) return failure('DND-108', 'klasör oluşturulamadı ya da yazılamıyor', target)

  activeStore.flushSave()
  if (!adopting) {
    const copied = copySave(dataPaths.dataDir, target)
    if (!copied.ok) return failure('DND-109', copied.detail, target)
  }
  try {
    writeConfig(configFile, { dataDir: target })
  } catch (error) {
    return failure('DND-108', `ayar dosyası yazılamadı: ${error instanceof Error ? error.message : String(error)}`, target)
  }

  // Buradan sonra uygulama eski klasöre bir şey yazmamalı: olağan kapanış adımları atlanır.
  exiting = true
  removeCrashMarker(dataPaths.crashMarker)
  log.info(`Kayıt klasörü değişti${adopting ? ' (var olan kayıt kullanılacak)' : ''}; uygulama yeniden başlatılıyor`)
  // Açık log dosyası eski klasörün kaldırılmasını engeller; log yeni klasöre geçer.
  log.init(path.join(target, 'log'), { echo: !app.isPackaged })
  const trashed = adopting ? true : await trashOldFolder(dataPaths.dataDir)

  // Yanıt arayüze ulaşsın diye kısa bir süre beklenir.
  setTimeout(() => {
    log.close()
    if (!process.env['DND_NO_RELAUNCH']) app.relaunch()
    app.exit(0)
  }, 300)
  return success(target, trashed ? '' : 'Eski kayıt klasörü kaldırılamadı; yerinde duruyor.')
}

function startWithDataDir(dataDir: string, fixed: boolean, configFile: string): void {
  const prepared = prepareDataPaths(dataDir)
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
    storage: {
      pickParent: (parentWindow) => pickParent(parentWindow, path.dirname(dataPaths.dataDir)),
      check: (parent) => checkParent(parent, dataPaths.dataDir),
      move: (parent) => moveDataDir(parent, dataPaths, activeStore, configFile, fixed)
    },
    getInfo: (): AppInfo => ({
      version: app.getVersion(),
      dataDir: dataPaths.dataDir,
      dataDirCloud: detectCloud(dataPaths.dataDir),
      dataDirFixed: fixed,
      logDir: dataPaths.logDir,
      logFile: log.currentFile(),
      crashedLastTime
    })
  })

  activeWindows.openMenu()
}

/** Düzgün kapanış. Çökme işareti yalnızca burada silinir. */
function cleanExit(): void {
  if (exiting) return
  if (!paths || !store) {
    // Kayıt klasörü sorulurken çıkıldı: kapatılacak tek şey log dosyası.
    log.close()
    return
  }
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

// Testler aynı anda birkaç kopya çalıştırır; her biri kendi kayıt ya da ayar klasörünü kullanır.
const isolatedRun = Boolean(process.env['DND_DATA_DIR']?.trim() || process.env['DND_CONFIG_DIR']?.trim())

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
