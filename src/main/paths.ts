import fs from 'node:fs'
import path from 'node:path'

export interface DataPaths {
  dataDir: string
  saveFile: string
  backupFile: string
  imagesDir: string
  /** Müzik, ortam sesleri ve hareketli arka plan videoları. */
  soundsDir: string
  diceFile: string
  logDir: string
  /** Uygulama açıkken duran işaret dosyası; açılışta varsa önceki oturum düzgün kapanmamıştır. */
  crashMarker: string
}

export function buildDataPaths(dataDir: string): DataPaths {
  return {
    dataDir,
    saveFile: path.join(dataDir, 'kayit.json'),
    backupFile: path.join(dataDir, 'kayit.yedek.json'),
    imagesDir: path.join(dataDir, 'gorseller'),
    soundsDir: path.join(dataDir, 'muzik'),
    diceFile: path.join(dataDir, 'zar.json'),
    logDir: path.join(dataDir, 'log'),
    crashMarker: path.join(dataDir, 'calisiyor.kilit')
  }
}

/** Klasörleri oluşturur ve yazılabildiğini doğrular. Başarısız olursa fırlatır (DND-104). */
export function ensureDataDirs(paths: DataPaths): void {
  for (const dir of [paths.dataDir, paths.imagesDir, paths.soundsDir, paths.logDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.accessSync(paths.dataDir, fs.constants.R_OK | fs.constants.W_OK)
}
