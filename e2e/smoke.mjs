// Derlenmiş uygulamayı (out/) geçici bir kayıt klasörüyle açar, temel akışı dener ve
// ekran görüntülerini e2e/.cikti/ altına yazar. Çalıştırma: npx electron-vite build && node e2e/smoke.mjs
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const outDir = join(root, 'e2e', '.cikti')
mkdirSync(outDir, { recursive: true })
const dataDir = mkdtempSync(join(tmpdir(), 'dnd-smoke-'))

const env = { ...process.env, DND_DATA_DIR: dataDir }
// Başka bir Electron uygulamasının içinden çalıştırıldığında bu değişken Electron'u düz Node'a çevirir.
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: ['.'], cwd: root, env })
const roleOf = (page) => new URL(page.url()).searchParams.get('role') ?? 'menu'
const waitForRole = async (role) => {
  for (let i = 0; i < 100; i++) {
    const page = app.windows().find((w) => roleOf(w) === role)
    if (page) return page
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`pencere açılmadı: ${role}`)
}

const errors = []
app.on('window', (page) => page.on('pageerror', (e) => errors.push(`${roleOf(page)}: ${e.message}`)))

try {
  const menu = await app.firstWindow()
  menu.on('pageerror', (e) => errors.push(`menu: ${e.message}`))
  await menu.getByRole('button', { name: 'Oyna' }).waitFor({ timeout: 15000 })
  await menu.screenshot({ path: join(outDir, '01-menu.png') })

  await menu.getByRole('button', { name: 'Ayarlar' }).click()
  await menu.waitForTimeout(300)
  await menu.screenshot({ path: join(outDir, '02-ayarlar.png') })

  // Deneme sırasında kullanıcının ekranını tam ekranla kapatmamak için.
  await menu.evaluate(() => window.dnd.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } }))
  await menu.evaluate(() => window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } }))
  await menu.evaluate(() => window.dnd.game.start())

  const game = await waitForRole('game')
  const control = await waitForRole('control')
  await game.waitForLoadState('domcontentloaded')
  await control.waitForLoadState('domcontentloaded')
  await control.waitForTimeout(800)
  await game.screenshot({ path: join(outDir, '03-oyun.png') })
  await control.screenshot({ path: join(outDir, '04-kontrol.png') })

  const roll = await control.evaluate(() => window.dnd.dice.roll(20))
  const state = await control.evaluate(() => window.dnd.getState())
  console.log('zar:', roll?.value, '| phase:', state.session.phase, '| oyuncu 0:', state.app.players[0].name)

  // Kontrol paneli oyun bitince kapanır; çağrıyı açık kalan menü penceresinden yapıyoruz.
  await menu.evaluate(() => window.dnd.game.end())
  await menu.waitForTimeout(800)
  const after = await menu.evaluate(() => window.dnd.getState())
  console.log('oyun bitti → phase:', after.session.phase, '| zar geçmişi:', after.session.diceHistory.length)
} finally {
  await app.close()
}

console.log('kayıt klasörü:', readdirSync(dataDir).join(', '))
const logDir = join(dataDir, 'log')
const logFile = readdirSync(logDir)[0]
const lines = readFileSync(join(logDir, logFile), 'utf8').trim().split('\n')
console.log(`log (${lines.length} satır), son 12:`)
console.log(lines.slice(-12).join('\n'))
console.log('sayfa hataları:', errors.length ? errors : 'yok')
