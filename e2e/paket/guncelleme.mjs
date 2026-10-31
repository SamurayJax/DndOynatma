// Otomatik güncellemeyi paketlenmiş uygulamada, yerel bir sunucuyla dener: soru, "Şimdi değil", indirme,
// vazgeçme, bozuk dosya, sunucuya ulaşılamaması. Kurulum çalıştırılmaz (DND_UPDATE_NO_INSTALL); bilgisayara
// hiçbir şey kurulmaz. İndirme önbelleği de geçici klasöre yazılır (LOCALAPPDATA).
// Çalıştırma: npm run dist && node e2e/paket/guncelleme.mjs
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const releaseDir = join(root, 'release')
const appDir = join(releaseDir, 'win-unpacked')
const exePath = join(appDir, 'DndOynatma.exe')
const installerName = `DndOynatma-Kurulum-${pkg.version}.exe`
const installerPath = join(releaseDir, installerName)
const NEW_VERSION = '99.0.0'

const failed = []
function check(name, ok, detail = '') {
  if (!ok) failed.push(name)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function waitFor(read, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value || Date.now() > end) return value
    await sleep(100)
  }
}

const size = statSync(installerPath).size
const realSha = createHash('sha512').update(readFileSync(installerPath)).digest('base64')
const server = { sha: realSha, throttled: false, requests: [] }

const http = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://x').pathname.slice(1))
  server.requests.push(name)
  if (name === 'latest.yml') {
    response.setHeader('Content-Type', 'text/yaml')
    response.end(
      `version: ${NEW_VERSION}\nfiles:\n  - url: ${installerName}\n    sha512: ${server.sha}\n    size: ${size}\npath: ${installerName}\nsha512: ${server.sha}\nreleaseDate: '2026-10-31T00:00:00.000Z'\n`
    )
    return
  }
  if (name !== installerName) {
    response.statusCode = 404
    response.end()
    return
  }
  response.setHeader('Content-Length', size)
  response.setHeader('Content-Type', 'application/octet-stream')
  const stream = createReadStream(installerPath, { highWaterMark: 1024 * 1024 })
  if (!server.throttled) {
    stream.pipe(response)
    return
  }
  // Vazgeçme denensin diye yavaş gönderilir.
  stream.on('data', (chunk) => {
    stream.pause()
    response.write(chunk)
    setTimeout(() => stream.resume(), 150)
  })
  stream.on('end', () => response.end())
  response.on('close', () => stream.destroy())
})
await new Promise((done) => http.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${http.address().port}/`

const base = mkdtempSync(join(tmpdir(), 'dnd-guncelleme-'))

async function launch(label, feedUrl) {
  const env = {
    ...process.env,
    DND_DATA_DIR: join(base, label, 'kayit'),
    DND_UPDATE_URL: feedUrl,
    DND_UPDATE_NO_INSTALL: '1',
    LOCALAPPDATA: join(base, label, 'yerel')
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: exePath, args: [`--user-data-dir=${join(base, label, 'profil')}`], cwd: appDir, env })
  const menu = await app.firstWindow()
  await menu.getByRole('button', { name: 'Oyna' }).waitFor({ timeout: 20000 })
  const close = async () => {
    const child = app.process()
    await Promise.race([app.close().catch(() => {}), sleep(15000)])
    if (child.exitCode === null && child.signalCode === null) {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // Kendiliğinden kapanmış olabilir.
      }
    }
  }
  const status = () => menu.evaluate(() => window.dnd.update.getStatus())
  const logText = () => {
    const dir = join(env.DND_DATA_DIR, 'log')
    return readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8')).join('\n')
  }
  return { app, menu, close, status, logText, pendingDir: join(env.LOCALAPPDATA, 'dndoynatma-updater', 'pending') }
}

try {
  check('paket ve kurulum dosyası var', existsSync(exePath) && existsSync(installerPath), installerName)
  const updateYml = join(appDir, 'resources', 'app-update.yml')
  const yml = existsSync(updateYml) ? readFileSync(updateYml, 'utf8') : ''
  check('pakette GitHub ayarı var', yml.includes('provider: github') && yml.includes('owner: SamurayJax') && yml.includes('repo: DndOynatma'), yml.replaceAll('\n', ' '))
  const latest = join(releaseDir, 'latest.yml')
  const latestText = existsSync(latest) ? readFileSync(latest, 'utf8') : ''
  check('latest.yml bu sürümün dosyasını gösteriyor', latestText.includes(`version: ${pkg.version}`) && latestText.includes(installerName) && latestText.includes(realSha), latestText.split('\n')[0])

  // --- Soru ve "Şimdi değil" ---
  server.requests.length = 0
  let run = await launch('sor', url)
  await run.menu.getByRole('heading', { name: 'Yeni sürüm var' }).waitFor({ timeout: 20000 })
  const text = await run.menu.locator('dialog[open]').textContent()
  check('açılışta yeni sürüm sorulur, sürüm numaraları yazar', text.includes(NEW_VERSION) && text.includes(pkg.version), text)
  check('onaydan önce kurulum dosyası indirilmez', !server.requests.includes(installerName), server.requests.join(','))
  await run.menu.getByRole('button', { name: 'Şimdi değil' }).click()
  await sleep(500)
  check('"Şimdi değil": soru kapanır', (await run.menu.locator('dialog[open]').count()) === 0)
  check('"Şimdi değil": indirme başlamaz', !server.requests.includes(installerName))
  await run.close()

  // --- Vazgeçme ---
  server.throttled = true
  run = await launch('vazgec', url)
  await run.menu.getByRole('button', { name: 'Güncelle' }).click()
  await run.menu.getByRole('heading', { name: 'Güncelleme indiriliyor' }).waitFor({ timeout: 10000 })
  const moved = await waitFor(async () => {
    const current = await run.status()
    return current.phase === 'downloading' && current.percent >= 1 ? current : null
  })
  check('indirirken yüzde ilerler', Boolean(moved), JSON.stringify(moved))
  await run.menu.getByRole('button', { name: 'Vazgeç' }).click()
  await sleep(800)
  check('"Vazgeç": indirme durur, hata çıkmaz', (await run.status()).phase === 'idle' && (await run.menu.locator('dialog[open]').count()) === 0, JSON.stringify(await run.status()))
  check('"Vazgeç": kurulum başlamaz', !run.logText().includes('kurulum atlandı'))
  await run.close()
  server.throttled = false

  // --- Bozuk dosya ---
  server.sha = createHash('sha512').update('baska dosya').digest('base64')
  run = await launch('bozuk', url)
  await run.menu.getByRole('button', { name: 'Güncelle' }).click()
  await run.menu.getByRole('heading', { name: 'Güncelleme indirilemedi' }).waitFor({ timeout: 90000 })
  await sleep(500)
  check('dosya doğrulanamazsa kurulmaz, sorun gösterilir', !run.logText().includes('kurulum atlandı') && run.logText().includes('DND-602'))
  await run.menu.getByRole('button', { name: 'Kapat', exact: true }).last().click()
  await sleep(300)
  check('kapatınca menü çalışır', (await run.menu.locator('dialog[open]').count()) === 0)
  await run.close()
  server.sha = realSha

  // --- Başarılı indirme ---
  run = await launch('indir', url)
  await run.menu.getByRole('button', { name: 'Güncelle' }).click()
  const installing = await waitFor(async () => ((await run.status()).phase === 'installing' ? true : null), 90000)
  check('onaylanınca iner, doğrulanır, kuruluma geçer', Boolean(installing), JSON.stringify(await run.status()))
  check('"kuruluyor" yazısı görünür', (await run.menu.getByRole('heading', { name: 'Güncelleme kuruluyor' }).count()) === 1)
  await sleep(700)
  check('kurulum adımına gelindi', run.logText().includes('kurulum atlandı') && run.logText().includes(`Güncelleme onaylandı: ${NEW_VERSION}`))
  const pending = existsSync(run.pendingDir) ? readdirSync(run.pendingDir) : []
  const pendingFile = pending.find((name) => name.endsWith('.exe'))
  check('indirilen dosya kurulum dosyasıyla aynı', pendingFile !== undefined && createHash('sha512').update(readFileSync(join(run.pendingDir, pendingFile))).digest('base64') === realSha, pending.join(','))
  await run.close()

  // --- Sunucuya ulaşılamıyor ---
  await new Promise((done) => {
    http.close(done)
    http.closeAllConnections()
  })
  run = await launch('cevrimdisi', url)
  await sleep(4000)
  check('internet yokken soru çıkmaz, menü çalışır', (await run.menu.locator('dialog[open]').count()) === 0 && (await run.menu.getByRole('button', { name: 'Oyna' }).count()) === 1)
  check('internet yokken yalnızca loga yazılır', run.logText().includes('DND-601'))
  check('uygulama çökmedi', run.app.process().exitCode === null)
  await run.close()
} catch (error) {
  check('beklenmeyen hata', false, error?.stack ?? String(error))
} finally {
  http.close()
}

if (failed.length === 0) rmSync(base, { recursive: true, force: true })
else console.log(`      inceleme için bırakıldı: ${base}`)
console.log(failed.length === 0 ? '\nSONUÇ: PASS' : `\nSONUÇ: FAIL (${failed.length}): ${failed.join('; ')}`)
process.exit(failed.length === 0 ? 0 : 1)
