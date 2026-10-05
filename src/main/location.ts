/**
 * Kayıt klasörünün yeri: kullanıcının seçtiği klasör küçük bir ayar dosyasında tutulur.
 * Saf Node; Electron'a bağlı değildir (klasör yolları parametreyle gelir).
 */
import fs from 'node:fs'
import path from 'node:path'

/** Uygulamanın, kullanıcının seçtiği yerin içine açtığı klasör. */
export const DATA_FOLDER_NAME = 'DndOynatma-Kayit'
export const CONFIG_FILE_NAME = 'ayar.json'

const SAVE_FILE = 'kayit.json'
const BACKUP_FILE = 'kayit.yedek.json'
const IMAGES_DIR = 'gorseller'
/** Taşınmayan dosyalar: çalışma işareti ve yarım kalmış yazmalar. */
const SKIPPED_ON_COPY = new Set(['calisiyor.kilit'])

export interface LocationConfig {
  dataDir: string
}

export function readConfig(configFile: string): LocationConfig | null {
  let text: string
  try {
    text = fs.readFileSync(configFile, 'utf8')
  } catch {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(text.replace(/^﻿/, ''))
    if (typeof parsed !== 'object' || parsed === null) return null
    const dataDir = (parsed as Record<string, unknown>)['dataDir']
    return typeof dataDir === 'string' && dataDir.trim() !== '' && path.isAbsolute(dataDir) ? { dataDir } : null
  } catch {
    return null
  }
}

/** Ayar dosyası yarım yazılmasın diye önce geçici dosyaya yazılır. */
export function writeConfig(configFile: string, config: LocationConfig): void {
  fs.mkdirSync(path.dirname(configFile), { recursive: true })
  const temp = `${configFile}.tmp`
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), 'utf8')
  fs.renameSync(temp, configFile)
}

function normalized(target: string): string {
  return path.resolve(target).replace(/[\\/]+$/, '').toLowerCase()
}

export function samePath(a: string, b: string): boolean {
  return normalized(a) === normalized(b)
}

/** `inner`, `outer` klasörünün içinde mi (kendisi dahil). */
export function isInside(inner: string, outer: string): boolean {
  const a = normalized(inner)
  const b = normalized(outer)
  return a === b || a.startsWith(b + path.sep)
}

/**
 * Seçilen üst klasöre göre kaydın yazılacağı klasör. Kullanıcı doğrudan kayıt klasörünün kendisini
 * seçtiyse (adı aynı ya da içinde kayıt var) iç içe ikinci bir klasör açılmaz.
 */
export function targetFor(parent: string): string {
  const resolved = path.resolve(parent)
  if (path.basename(resolved).toLowerCase() === DATA_FOLDER_NAME.toLowerCase() || hasSaveData(resolved)) return resolved
  return path.join(resolved, DATA_FOLDER_NAME)
}

/** Klasörde bir DndOynatma kaydı var mı. */
export function hasSaveData(dir: string): boolean {
  for (const name of [SAVE_FILE, BACKUP_FILE]) {
    try {
      if (fs.statSync(path.join(dir, name)).isFile()) return true
    } catch {
      // Dosya yok.
    }
  }
  return countImages(dir) > 0
}

export function countImages(dir: string): number {
  try {
    return fs.readdirSync(path.join(dir, IMAGES_DIR), { withFileTypes: true }).filter((entry) => entry.isFile()).length
  } catch {
    return 0
  }
}

/**
 * Klasör bulut eşitlemeli bir yerdeyse hizmetin adını verir. OneDrive kendi kökünü ortam
 * değişkenlerinde bildirir; diğerleri klasör adından tanınır.
 */
export function detectCloud(target: string, env: NodeJS.ProcessEnv = process.env): string | null {
  for (const name of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    const root = env[name]?.trim()
    if (root && isInside(target, root)) return 'OneDrive'
  }
  const parts = path
    .resolve(target)
    .split(/[\\/]+/)
    .map((part) => part.toLowerCase())
  if (parts.some((part) => part === 'onedrive' || part.startsWith('onedrive - '))) return 'OneDrive'
  if (parts.includes('dropbox')) return 'Dropbox'
  if (parts.some((part) => part === 'google drive' || part === 'googledrive' || part === 'my drive')) return 'Google Drive'
  if (parts.some((part) => part === 'iclouddrive' || part === 'icloud drive')) return 'iCloud'
  return null
}

/** Klasörü (yoksa) oluşturur ve yazılabildiğini küçük bir deneme dosyasıyla doğrular. */
export function ensureWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.yazma-denemesi-${process.pid}`)
    fs.writeFileSync(probe, '')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/** Var olan en yakın üst klasöre yazılabiliyor mu (hedef henüz oluşturulmadan sorulur). */
export function canCreateIn(target: string): boolean {
  let current = path.resolve(target)
  for (let depth = 0; depth < 64; depth++) {
    try {
      if (fs.statSync(current).isDirectory()) {
        fs.accessSync(current, fs.constants.W_OK)
        return true
      }
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
      const parent = path.dirname(current)
      if (parent === current) return false
      current = parent
    }
  }
  return false
}

export interface FileEntry {
  /** Köke göre yol, `/` ayraçlı. */
  relative: string
  size: number
}

/** Klasördeki dosyalar (alt klasörler dahil), taşınmayanlar hariç. */
export function listFiles(root: string): FileEntry[] {
  const result: FileEntry[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, relative)
      else if (entry.isFile() && !SKIPPED_ON_COPY.has(entry.name) && !entry.name.endsWith('.tmp')) {
        result.push({ relative, size: fs.statSync(full).size })
      }
    }
  }
  walk(root, '')
  return result.sort((a, b) => a.relative.localeCompare(b.relative))
}

export interface CopyReport {
  files: number
  bytes: number
}

/**
 * Kaydı yeni klasöre kopyalar ve doğrular: kaynaktaki her dosya hedefte aynı boyutta olmalı.
 * Kaynak hiçbir şekilde değiştirilmez; eskisini kaldırmak çağıranın işidir. Doğrulama tutmazsa fırlatır.
 */
export function copyDataDir(from: string, to: string): CopyReport {
  const files = listFiles(from)
  fs.mkdirSync(to, { recursive: true })
  for (const file of files) {
    const destination = path.join(to, file.relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(from, file.relative), destination)
  }
  let bytes = 0
  for (const file of files) {
    let size = -1
    try {
      size = fs.statSync(path.join(to, file.relative)).size
    } catch {
      // Aşağıda hata olarak bildirilir.
    }
    if (size !== file.size) throw new Error(`Kopya doğrulanamadı: ${file.relative} (${size} / ${file.size} bayt)`)
    bytes += file.size
  }
  return { files: files.length, bytes }
}

export type StartLocation =
  /** Klasör ortam değişkeniyle verildi (test / deneme) ya da ayarda kayıtlı ve yerinde. */
  | { kind: 'ready'; dataDir: string; fixed: boolean }
  /** Kullanıcıya sorulmalı. */
  | { kind: 'setup'; reason: 'first-run' | 'missing'; missingDir: string | null }

/** Açılışta kayıt klasörünün nereden geleceğine karar verir. */
export function resolveStartLocation(configFile: string, env: NodeJS.ProcessEnv = process.env): StartLocation {
  const override = env['DND_DATA_DIR']?.trim()
  if (override) return { kind: 'ready', dataDir: path.resolve(override), fixed: true }

  const config = readConfig(configFile)
  if (config === null) return { kind: 'setup', reason: 'first-run', missingDir: null }

  try {
    if (fs.statSync(config.dataDir).isDirectory()) return { kind: 'ready', dataDir: config.dataDir, fixed: false }
  } catch {
    // Klasör yok ya da erişilemiyor.
  }
  // Seçilmiş klasör yokken sessizce yenisini açmak, kullanıcıya kaydının silindiğini düşündürür.
  return { kind: 'setup', reason: 'missing', missingDir: config.dataDir }
}
