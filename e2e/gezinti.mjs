// Uygulamayı örnek verilerle doldurup her ekranın görüntüsünü alır (e2e/.cikti/gezinti-*.png).
// Çalıştırma: npx electron-vite build && node e2e/gezinti.mjs
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSamples } from './fixtures.mjs'

const root = process.cwd()
const outDir = join(root, 'e2e', '.cikti')
mkdirSync(outDir, { recursive: true })
const dataDir = mkdtempSync(join(tmpdir(), 'dnd-gezinti-'))
const samples = writeSamples(join(dataDir, '..', `dnd-gezinti-ornek-${Date.now()}`))

const env = { ...process.env, DND_DATA_DIR: dataDir }
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ args: [process.argv[2] ?? '.'], cwd: root, env })
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
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(`${roleOf(page)}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${roleOf(page)} konsol: ${m.text()}`))
}
app.on('window', watch)
const shot = (page, name) => page.screenshot({ path: join(outDir, `gezinti-${name}.png`) })
const id = () => crypto.randomUUID()

try {
  const menu = await app.firstWindow()
  watch(menu)
  await menu.getByRole('button', { name: 'Oyna' }).waitFor({ timeout: 15000 })

  // --- Örnek veriler ---
  await menu.evaluate(async (s) => {
    const d = window.dnd
    d.dispatch({ type: 'settings/update', patch: { gameFullscreen: false } })
    await d.library.importPortraitFile(0, s.portrait1)
    await d.library.importPortraitFile(1, s.portrait2)
    d.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } })
    d.dispatch({ type: 'player/update', slot: 1, patch: { name: 'Jasper', level: 4, note: 'Gümüş kılıç onda' } })
    d.dispatch({ type: 'player/update', slot: 2, patch: { name: 'Mira', level: 3 } })
    d.dispatch({ type: 'player/setHp', slot: 1, hp: 6 })
    d.dispatch({ type: 'player/setHp', slot: 2, hp: 0 })
    await d.library.importFiles('place', [s.place])
    await d.library.importFiles('scene', [s.scene])
    await d.library.importFiles('enemy', [s.enemy])
    await d.library.importFiles('boss', [s.boss])
    await d.library.importFiles('npc', [s.npc])
    await d.library.importFiles('item', [s.item])
  }, samples)

  const ids = { s1: id(), s2: id(), bg1: id(), bg2: id(), enemy: id(), npc: id() }
  await menu.evaluate(async (k) => {
    const d = window.dnd
    const lib = (await d.getState()).app.library
    const img = (kind) => lib.find((i) => i.kind === kind).id
    d.dispatch({ type: 'scene/add', sceneId: k.s1, name: 'Kraliyet İçi' })
    d.dispatch({ type: 'scene/add', sceneId: k.s2, name: 'Orman Yolu' })
    d.dispatch({ type: 'scene/update', sceneId: k.s1, patch: { hotkey: 1 } })
    d.dispatch({ type: 'scene/update', sceneId: k.s2, patch: { hotkey: 2 } })
    d.dispatch({ type: 'stage/setBackground', sceneId: k.s1, fallbackSceneId: k.s1, itemId: k.bg1, imageId: img('place') })
    d.dispatch({ type: 'stage/setBackground', sceneId: k.s2, fallbackSceneId: k.s2, itemId: k.bg2, imageId: img('scene') })
    d.dispatch({ type: 'stage/addItem', sceneId: k.s2, fallbackSceneId: k.s2, itemId: k.enemy, imageId: img('enemy') })
    d.dispatch({ type: 'stage/updateItem', sceneId: k.s2, itemId: k.enemy, patch: { label: '7 LVL', x: 1050, y: 180 } })
    d.dispatch({ type: 'stage/addItem', sceneId: k.s1, fallbackSceneId: k.s1, itemId: k.npc, imageId: img('npc') })
    d.dispatch({ type: 'stage/updateItem', sceneId: k.s1, itemId: k.npc, patch: { label: 'Hancı' } })
    d.dispatch({ type: 'scene/setActive', sceneId: k.s2 })
  }, ids)

  // --- Ayarlar sekmeleri ---
  await menu.getByRole('button', { name: 'Ayarlar' }).click()
  await menu.waitForTimeout(500)
  await shot(menu, '01-ayarlar-oyuncular')
  for (const [tab, name] of [['Kütüphane', '02-ayarlar-kutuphane'], ['Pencereler', '03-ayarlar-pencereler'], ['Genel', '04-ayarlar-genel']]) {
    await menu.getByRole('tab', { name: new RegExp(tab) }).click()
    await menu.waitForTimeout(400)
    await shot(menu, name)
  }

  // --- Oyun ---
  await menu.evaluate(() => window.dnd.game.start())
  const game = await waitForRole('game')
  const control = await waitForRole('control')
  await game.waitForLoadState('domcontentloaded')
  await control.waitForLoadState('domcontentloaded')
  await control.waitForTimeout(1500)
  await shot(game, '05-oyun-orman')
  await shot(control, '06-kontrol')

  await control.evaluate(() => window.dnd.dispatch({ type: 'scene/activateHotkey', hotkey: 1 }))
  await game.waitForTimeout(700)
  await shot(game, '07-oyun-kraliyet')

  // Kalem: oyun alanında kırmızı bir çizgi.
  await control.evaluate(() => window.dnd.dispatch({ type: 'session/setTool', tool: 'pen-red' }))
  await game.waitForTimeout(300)
  const box = await game.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  await game.mouse.move(box.w * 0.45, box.h * 0.35)
  await game.mouse.down()
  for (let i = 1; i <= 12; i++) await game.mouse.move(box.w * (0.45 + i * 0.025), box.h * (0.35 + Math.sin(i / 2) * 0.08))
  await game.mouse.up()
  await game.waitForTimeout(200)
  await shot(game, '08-oyun-kalem')
  await control.evaluate(() => window.dnd.dispatch({ type: 'session/setTool', tool: 'mouse' }))

  // Zar: animasyonun ortası ve sonucu.
  const roll = await control.evaluate(() => window.dnd.dice.roll())
  await game.waitForTimeout(900)
  await shot(game, '09-zar-ucus')
  await game.waitForTimeout(2600)
  await shot(game, '10-zar-sonuc')
  await shot(control, '11-kontrol-zar')
  console.log('zar:', roll?.value)

  const state = await control.evaluate(() => window.dnd.getState())
  console.log('pencereler:', state.app.scenes.map((s) => `${s.name}[${s.hotkey}] ${s.items.length} görsel`).join(' | '))
  await menu.evaluate(() => window.dnd.game.end())
  await menu.waitForTimeout(600)
} finally {
  await app.close()
}
console.log('hatalar:', errors.length ? errors : 'yok')
