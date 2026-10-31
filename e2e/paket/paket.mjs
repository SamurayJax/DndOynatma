// Paketlenmiş uygulamayı (release/win-unpacked) geçici bir kayıt klasörüyle açar ve temel akışı doğrular.
// Kurulum dosyası çalıştırılmaz; bilgisayara hiçbir şey kurulmaz. Kullanıcının Belgeler\DndOynatma klasörüne dokunulmaz.
// Çalıştırma: npm run pack && node e2e/paket/paket.mjs   (başka klasör için: DND_PAKET_DIR=<klasör>)
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePng } from '../fixtures.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const releaseDir = join(root, 'release')
const appDir = resolve(process.env.DND_PAKET_DIR ?? join(releaseDir, 'win-unpacked'))
const exePath = join(appDir, 'DndOynatma.exe')
const asarPath = join(appDir, 'resources', 'app.asar')

const failed = []
function check(name, ok, detail = '') {
  if (!ok) failed.push(name)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
}
const info = (text) => console.log(`      ${text}`)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

async function waitFor(read, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value || Date.now() > end) return value
    await sleep(100)
  }
}

function powershell(command) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' }).trim()
}

function dirSize(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size
  }
  return total
}

/** ICO dosyasındaki görsellerin ham verisi; exe'ye kaynak olarak aynen gömülür. */
function icoImages(file) {
  const data = readFileSync(file)
  return Array.from({ length: data.readUInt16LE(4) }, (_, i) => {
    const at = 6 + i * 16
    const length = data.readUInt32LE(at + 8)
    const offset = data.readUInt32LE(at + 12)
    return { size: data[at] || 256, bytes: data.subarray(offset, offset + length) }
  })
}

/** Çalıştırmadan yapılan denetimler: dosyalar, exe'nin sürüm bilgisi ve simgesi. */
function checkFiles() {
  check('paket klasörü var', existsSync(exePath) && existsSync(asarPath), appDir)
  if (!existsSync(exePath)) return false

  const resources = readdirSync(join(appDir, 'resources'))
  check('kaynaklar yalnızca app.asar ve güncelleme ayarı', resources.length === 2 && resources.includes('app.asar') && resources.includes('app-update.yml'), resources.join(', '))

  const version = JSON.parse(
    powershell(`(Get-Item -LiteralPath '${exePath}').VersionInfo | Select-Object ProductName, ProductVersion, FileVersion, FileDescription, CompanyName | ConvertTo-Json`)
  )
  check(
    'exe sürüm bilgisi',
    version.ProductName === 'DndOynatma' && String(version.ProductVersion).startsWith(pkg.version) && String(version.FileVersion).startsWith(pkg.version),
    `${version.ProductName} ${version.ProductVersion} (dosya ${version.FileVersion}, ${version.CompanyName})`
  )

  const exe = readFileSync(exePath)
  const images = icoImages(join(root, 'build', 'icon.ico'))
  const missing = images.filter((image) => !exe.includes(image.bytes)).map((image) => image.size)
  check(
    'exe uygulama simgesini taşıyor',
    images.length > 0 && missing.length === 0,
    missing.length ? `eksik boyutlar: ${missing.join(', ')}` : `build/icon.ico içindeki ${images.length} görsel exe'de: ${images.map((i) => i.size).join(', ')}`
  )
  return true
}

function runningCopies() {
  const count = powershell(
    `@(Get-CimInstance Win32_Process -Filter "Name='DndOynatma.exe'" | Where-Object { $_.ExecutablePath -eq '${exePath}' }).Count`
  )
  return Number(count)
}

async function checkApp() {
  const dataDir = mkdtempSync(join(tmpdir(), 'dnd-paket-'))
  const sampleDir = mkdtempSync(join(tmpdir(), 'dnd-paket-ornek-'))
  const samplePath = join(sampleDir, 'orman-yolu.png')
  writeFileSync(samplePath, makePng(640, 360, [30, 110, 50], [10, 40, 30]))

  const env = { ...process.env, DND_DATA_DIR: dataDir }
  // Başka bir Electron uygulamasının içinden çalıştırıldığında bu değişken Electron'u düz Node'a çevirir.
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({ executablePath: exePath, args: [], cwd: appDir, env })
  const child = app.process()
  const roleOf = (page) => new URL(page.url()).searchParams.get('role') ?? 'menu'
  const pageFor = (role) => waitFor(() => app.windows().find((page) => !page.isClosed() && roleOf(page) === role))
  const pageErrors = []
  app.on('window', (page) => page.on('pageerror', (error) => pageErrors.push(`${roleOf(page)}: ${error.message}`)))

  try {
    const menu = await app.firstWindow()
    menu.on('pageerror', (error) => pageErrors.push(`menu: ${error.message}`))
    const rendered = await menu
      .getByRole('button', { name: 'Oyna' })
      .waitFor({ timeout: 20000 })
      .then(() => true, () => false)
    check('ana menü çizildi', rendered)
    check('arayüz asar içinden file:// ile yüklendi', menu.url().startsWith('file://') && menu.url().includes('app.asar'), menu.url())

    const main = await app.evaluate(({ app: electronApp }) => ({
      packaged: electronApp.isPackaged,
      name: electronApp.getName(),
      appPath: electronApp.getAppPath()
    }))
    check('uygulama paketli çalışıyor', main.packaged && samePath(main.appPath, asarPath), `${main.name}, ${main.appPath}`)

    const appInfo = await menu.evaluate(() => window.dnd.app.getInfo())
    check('sürüm doğru', appInfo.version === pkg.version, `getInfo: ${appInfo.version}, package.json: ${pkg.version}`)
    check('kayıt klasörü geçici klasör', samePath(appInfo.dataDir, dataDir), appInfo.dataDir)

    const imported = await menu.evaluate((file) => window.dnd.library.importFiles('scene', [file]), samplePath)
    const image = imported.added[0]
    check('görsel içe aktarıldı', imported.added.length === 1 && imported.skipped.length === 0, image?.fileName ?? JSON.stringify(imported.skipped))
    if (image) {
      check('görsel kayıt klasörüne kopyalandı', existsSync(join(dataDir, 'gorseller', image.fileName)))
      const loaded = await menu.evaluate(
        (fileName) =>
          new Promise((done) => {
            const img = document.createElement('img')
            img.onload = () => done({ url: img.src, width: img.naturalWidth, height: img.naturalHeight })
            img.onerror = () => done({ url: img.src, width: 0, height: 0 })
            img.src = window.dnd.mediaUrl(fileName)
          }),
        image.fileName
      )
      check('görsel özel protokolden yüklendi', loaded.width === 640 && loaded.height === 360, `${loaded.url} → ${loaded.width}x${loaded.height}`)
    }

    // Deneme sırasında ekran tam ekranla kapatılmaz.
    await menu.evaluate(() => window.dnd.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } }))
    await menu.evaluate(() => window.dnd.game.start())
    const game = await pageFor('game')
    const control = await pageFor('control')
    check('oyun ekranı açıldı', Boolean(game))
    check('kontrol paneli açıldı', Boolean(control))

    if (control) {
      await control.waitForLoadState('domcontentloaded')
      const roll = await control.evaluate(() => window.dnd.dice.roll(20))
      check('zar atıldı', Number.isInteger(roll?.value) && roll.value >= 1, `değer: ${roll?.value}`)
    }

    await menu.evaluate(() => window.dnd.game.end())
    const closed = await waitFor(() => app.windows().every((page) => page.isClosed() || roleOf(page) === 'menu'))
    const state = await menu.evaluate(() => window.dnd.getState())
    check('oyun bitti, pencereler kapandı', Boolean(closed), `phase: ${state.session.phase}`)
  } finally {
    await Promise.race([app.close(), sleep(15000)])
    if (child.exitCode === null && child.signalCode === null) {
      // Düzgün kapanmadıysa geride süreç bırakılmaz.
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // Süreç bu arada kendiliğinden kapanmış olabilir.
      }
    }
  }

  check('uygulama düzgün kapandı', child.exitCode === 0, `çıkış kodu: ${child.exitCode}`)
  const leftover = await waitFor(() => (runningCopies() === 0 ? 'yok' : null), 5000)
  check('geride süreç kalmadı', leftover === 'yok')

  check('kayit.json yazıldı', existsSync(join(dataDir, 'kayit.json')))
  const logDir = join(dataDir, 'log')
  const logFiles = existsSync(logDir) ? readdirSync(logDir).filter((name) => name.endsWith('.log')) : []
  check('log dosyası yazıldı', logFiles.length > 0, logFiles.join(', '))
  const logText = logFiles.map((name) => readFileSync(join(logDir, name), 'utf8')).join('\n')
  check('log: açılış ve kapanış satırları', logText.includes(`sürüm ${pkg.version}`) && logText.includes('Uygulama kapandı'))
  check('çökme işareti kalmadı', !existsSync(join(dataDir, 'calisiyor.kilit')))
  check('sayfa hatası yok', pageErrors.length === 0, pageErrors.join(' | '))
  info(`kayıt klasörü içeriği: ${readdirSync(dataDir).join(', ')}`)

  rmSync(sampleDir, { recursive: true, force: true })
  if (failed.length === 0) rmSync(dataDir, { recursive: true, force: true })
  else info(`inceleme için bırakıldı: ${dataDir}`)
}

try {
  if (checkFiles()) await checkApp()
} catch (error) {
  check('beklenmeyen hata', false, error?.stack ?? String(error))
}

if (existsSync(appDir)) info(`açılmış paket: ${megabytes(dirSize(appDir))} (${appDir})`)
const installers = existsSync(releaseDir) ? readdirSync(releaseDir).filter((name) => /^DndOynatma-Kurulum-.*\.exe$/.test(name)) : []
for (const name of installers) info(`kurulum dosyası: ${name}, ${megabytes(statSync(join(releaseDir, name)).size)}`)
if (installers.length === 0) info('kurulum dosyası yok (npm run dist ile üretilir)')

console.log(failed.length === 0 ? '\nSONUÇ: PASS' : `\nSONUÇ: FAIL (${failed.length}): ${failed.join('; ')}`)
process.exit(failed.length === 0 ? 0 : 1)
