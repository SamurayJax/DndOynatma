// Ana süreç denemelerinin ortak parçaları: uygulamayı geçici bir kayıt klasörüyle açar,
// PASS/FAIL satırlarını yazar ve geride çalışan süreç bırakmaz.
import { _electron as electron } from 'playwright-core'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// Ortak `out/` klasörüne dokunmamak için ayrı derleme kullanılır; başka derleme DND_E2E_MAIN ile verilir.
export const mainEntry = resolve(root, process.env.DND_E2E_MAIN ?? '.tmp/main-review/out/main/index.js')

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// --- Sonuçlar ---

const results = []
const sessions = new Set()

export function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
  return Boolean(ok)
}

export function info(text) {
  console.log(`BILGI ${text}`)
}

/** Betiğin sonunda çağrılır: açık kalan süreçleri kapatır, özeti yazar, çıkış kodunu ayarlar. */
export function finish() {
  for (const session of sessions) killTree(session)
  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${results.length - failed.length}/${results.length} denetim geçti`)
  for (const entry of failed) console.log(`  FAIL: ${entry.name}`)
  process.exitCode = failed.length === 0 && results.length > 0 ? 0 : 1
}

/** Beklenmeyen hata da FAIL sayılır ve süreçler yine kapatılır. */
export async function run(body) {
  if (!existsSync(mainEntry)) {
    console.log(`FAIL  derleme bulunamadı: ${mainEntry}`)
    console.log('      Önce: npx electron-vite build --outDir .tmp/main-review/out')
    process.exitCode = 1
    return
  }
  try {
    await body()
  } catch (error) {
    check('betik hatasız tamamlandı', false, error instanceof Error ? (error.stack ?? error.message) : String(error))
  } finally {
    finish()
  }
}

// --- Klasörler ---

/** Her deneme için yeni bir geçici klasör: kayıt, tarayıcı profili ve örnek dosyalar ayrı durur. */
export function makeWorkDir(label) {
  const base = mkdtempSync(join(tmpdir(), `dnd-main-${label}-`))
  const work = { base, dataDir: join(base, 'kayit'), profileDir: join(base, 'profil'), samplesDir: join(base, 'ornek') }
  mkdirSync(work.samplesDir, { recursive: true })
  return work
}

/**
 * Dosyayı başka bir süreçte açık tutar (virüs tarayıcı ya da OneDrive'ın yaptığı gibi).
 * share: 'Read' → üzerine taşınamaz ve yazılamaz ama okunur; 'None' → okunamaz da.
 * Kilit kurulunca çözülür; dönen `released` kilit kalkınca tamamlanır.
 */
export function lockFile(file, share, durationMs) {
  const script =
    `$f = [System.IO.File]::Open('${file.replaceAll("'", "''")}', 'Open', 'Read', '${share}'); ` +
    `Write-Output 'kilitli'; Start-Sleep -Milliseconds ${durationMs}; $f.Close()`
  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'] })
  const released = new Promise((done) => child.once('exit', done))
  return new Promise((ready, fail) => {
    child.stdout.once('data', () => ready({ released }))
    child.once('error', fail)
    child.once('exit', () => fail(new Error(`dosya kilitlenemedi: ${file}`)))
  })
}

// --- Uygulama ---

function roleOfUrl(url) {
  try {
    return new URL(url).searchParams.get('role')
  } catch {
    return null
  }
}

export function roleOf(page) {
  return roleOfUrl(page.url())
}

/**
 * Derlenmiş uygulamayı verilen kayıt klasörüyle açar. Kullanıcının gerçek kayıt klasörüne
 * dokunulmasın diye DND_DATA_DIR her zaman verilir.
 */
export async function launch(work) {
  const env = { ...process.env, DND_DATA_DIR: work.dataDir }
  // Başka bir Electron uygulamasının içinden çalıştırıldığında bu değişken Electron'u düz Node'a çevirir.
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [mainEntry, `--user-data-dir=${work.profileDir}`], cwd: root, env })
  const child = app.process()
  const session = {
    app,
    pid: child.pid,
    exited: false,
    exit: new Promise((done) => child.once('exit', (code, signal) => done({ code, signal }))),
    console: [],
    pageErrors: []
  }
  session.exit.then(() => {
    session.exited = true
    sessions.delete(session)
  })
  sessions.add(session)

  const attach = (page) => {
    page.on('console', (message) => session.console.push({ role: roleOf(page), type: message.type(), text: message.text() }))
    page.on('pageerror', (error) => session.pageErrors.push({ role: roleOf(page), text: error.message }))
  }
  app.on('window', attach)
  for (const page of app.windows()) attach(page)
  return session
}

/** Ana menü penceresi; arayüz `window.dnd`'yi görene kadar bekler. */
export async function menuPage(session) {
  const page = await session.app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => typeof window.dnd === 'object' && window.dnd !== null, null, { timeout: 15000 })
  return page
}

export async function waitForRole(session, role, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = session.app.windows().find((candidate) => !candidate.isClosed() && roleOf(candidate) === role)
    if (page) {
      await page.waitForLoadState('domcontentloaded')
      await page.waitForFunction(() => typeof window.dnd === 'object' && window.dnd !== null, null, { timeout: 15000 })
      return page
    }
    await sleep(100)
  }
  throw new Error(`pencere açılmadı: ${role}`)
}

/** Koşul sağlanana kadar bekler; süre dolarsa son değeri döner. */
export async function waitFor(read, accept, timeoutMs = 8000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (!accept(value) && Date.now() < deadline) {
    await sleep(stepMs)
    value = await read()
  }
  return value
}

export function waitExit(session, timeoutMs = 15000) {
  return Promise.race([session.exit, sleep(timeoutMs).then(() => null)])
}

/** Kullanıcının "Çıkış" düğmesiyle aynı yol. Süreç kendiliğinden kapanmazsa null döner. */
export async function quitFromUi(session, page) {
  // Çağrı sürerken pencere kapanır; bu yüzden yanıt beklenmez.
  page.evaluate(() => window.dnd.app.quit()).catch(() => {})
  const exit = await waitExit(session)
  if (exit === null) killTree(session)
  return exit
}

/** Çökme denemesi ve temizlik için: süreci ve alt süreçlerini zorla kapatır. */
export function killTree(session) {
  if (session.exited) return
  try {
    execFileSync('taskkill', ['/PID', String(session.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    // Süreç zaten kapanmış olabilir.
  }
}

export async function killAndWait(session) {
  killTree(session)
  await waitExit(session, 10000)
}

/** Pencerelerin ana süreçteki hali: başlık, rol, konum, hangi monitörde olduğu. */
export function windowsInfo(session) {
  return session.app.evaluate(({ BrowserWindow, screen }) => {
    const list = []
    for (const win of BrowserWindow.getAllWindows()) {
      // Kapanmakta olan pencerenin içeriği yok edilmiş olabilir; o pencere artık sayılmaz.
      try {
        const bounds = win.getBounds()
        list.push({
          role: new URL(win.webContents.getURL()).searchParams.get('role'),
          title: win.getTitle(),
          bounds,
          displayId: screen.getDisplayMatching(bounds).id,
          visible: win.isVisible(),
          fullscreen: win.isFullScreen(),
          maximized: win.isMaximized(),
          backgroundThrottling: win.webContents.getBackgroundThrottling(),
          prefs: win.webContents.getLastWebPreferences()
        })
      } catch {
        continue
      }
    }
    return list
  })
}

export async function windowInfo(session, role) {
  return (await windowsInfo(session)).find((entry) => entry.role === role) ?? null
}

// --- Log ---

const ENTRY_START = /^\d{2}:\d{2}:\d{2}\.\d{3} \[(BILGI|UYARI|HATA)\] \[(DND-\d{3}|-)\] /

export function readLogText(dataDir) {
  const dir = join(dataDir, 'log')
  if (!existsSync(dir)) return ''
  return readdirSync(dir)
    .filter((name) => name.endsWith('.log'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('')
}

/** Log metnini kayıtlara böler; girintili devam satırları (stack) kaydın parçasıdır. */
export function logEntries(text) {
  const entries = []
  const stray = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    if (ENTRY_START.test(line)) entries.push(line)
    else if (line.startsWith('    ') && entries.length > 0) entries[entries.length - 1] += `\n${line}`
    else stray.push(line)
  }
  return { entries, stray }
}

/** Son açılıştan bu yana yazılan kayıtlar. */
export function lastRunEntries(dataDir) {
  const { entries } = logEntries(readLogText(dataDir))
  const start = entries.findLastIndex((entry) => entry.includes('Uygulama açıldı'))
  return start === -1 ? entries : entries.slice(start)
}

export function hasCode(entries, code) {
  return entries.some((entry) => entry.includes(`[${code}]`))
}
