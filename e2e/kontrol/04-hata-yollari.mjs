// Hata yolları ve "Tam ekran": zar ya da oyunu bitirme çağrısı reddedilince DM'in gördüğü; dosyası
// diskten silinmiş görselin kütüphanede, "Ekrandakiler"de ve arka plan seçicide görünüşü; "Tam ekran"
// düğmesinin oyun penceresini gerçekten değiştirmesi.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { check, getState, launch, readLog, run, seedFullSession, setContentSize, shot, sleep, startGame, stubTrash, waitFor, windowState } from './harness.mjs'

/** Ana süreçteki çağrı işleyicisini hata fırlatanla değiştirir; asıl işleyici geri konmak üzere saklanır. */
const breakHandler = (session, channel) =>
  session.app.evaluate(({ ipcMain }, name) => {
    globalThis.__savedHandlers ??= new Map()
    globalThis.__savedHandlers.set(name, ipcMain._invokeHandlers.get(name))
    ipcMain.removeHandler(name)
    ipcMain.handle(name, () => {
      throw new Error('deneme: çağrı reddedildi')
    })
  }, channel)

const restoreHandler = (session, channel) =>
  session.app.evaluate(({ ipcMain }, name) => {
    ipcMain.removeHandler(name)
    ipcMain._invokeHandlers.set(name, globalThis.__savedHandlers.get(name))
  }, channel)

const toasts = (page) =>
  page.locator('.ui-toast').evaluateAll((nodes) =>
    nodes.map((node) => ({
      error: node.classList.contains('ui-toast--error'),
      role: node.getAttribute('role'),
      message: node.querySelector('.ui-toast__message')?.textContent ?? '',
      code: node.querySelector('.ui-code')?.textContent ?? null
    }))
  )

const thumb = (locator) =>
  locator.evaluate((node) => {
    const box = node.matches('.ui-thumb') ? node : node.querySelector('.ui-thumb')
    return { broken: box.classList.contains('ui-thumb--broken'), hasImage: box.querySelector('img') !== null, icon: box.querySelector('svg') !== null, text: box.textContent }
  })

await run(async () => {
  const session = await launch('hata')
  const { library } = await seedFullSession(session)
  await stubTrash(session)

  // Dosyalar oyun başlamadan, uygulamanın haberi olmadan silinir: ekranda duran bir düşman, etkin
  // pencerenin arka planı ve hiçbir yerde kullanılmayan bir düşman.
  const missing = { onStage: library.enemy[0], background: library.place[0], unused: library.enemy[20] }
  for (const image of Object.values(missing)) rmSync(join(session.dataDir, 'gorseller', image.fileName))

  const { control } = await startGame(session)
  await setContentSize(session, 'control', 1600, 900)

  // --- Dosyası olmayan görsel ---
  await control.getByRole('tab', { name: /Düşmanlar/ }).click()
  const card = (image) => control.locator('.lib-card', { hasText: image.originalName })
  await card(missing.unused).scrollIntoViewIfNeeded()
  let state = await waitFor(() => thumb(card(missing.unused)), (value) => value.broken)
  check('kütüphane: dosyası olmayan görsel yer tutucuyla ve DND-203 ile görünür', state.broken && !state.hasImage && state.icon && state.text.includes('DND-203'), JSON.stringify(state))
  const healthy = await thumb(card(library.enemy[21]))
  check('kütüphane: komşu görseller etkilenmez', !healthy.broken && healthy.hasImage)
  await shot(control, 'hata-kutuphane')

  const rows = control.locator('.ctl-stage__row')
  state = await waitFor(() => thumb(rows.filter({ hasText: missing.onStage.originalName })), (value) => value.broken)
  check('"Ekrandakiler": dosyası olmayan görselin satırı adıyla durur, küçük resmi yer tutucudur', state.broken && state.icon, JSON.stringify(state))
  state = await thumb(control.locator('.ctl-stage__row--background'))
  check('"Ekrandakiler": dosyası olmayan arka plan yer tutucuyla görünür', state.broken && state.icon, JSON.stringify(state))
  const removable = await rows.filter({ hasText: missing.onStage.originalName }).getByRole('button', { name: /görselini kaldır/ }).isEnabled()
  check('"Ekrandakiler": bozuk görsel yine kaldırılabilir', removable)

  await control.getByRole('button', { name: 'Düzenle', exact: true }).click()
  await control.getByRole('button', { name: 'Arka plan seç', exact: true }).first().click()
  const pickerItem = control.locator('.set-picker__item', { hasText: missing.background.originalName })
  state = await waitFor(() => thumb(pickerItem), (value) => value.broken)
  check('arka plan seçici: dosyası olmayan görsel yer tutucuyla ve DND-203 ile görünür', state.broken && state.text.includes('DND-203'), JSON.stringify(state))
  await shot(control, 'hata-secici')
  await control.keyboard.press('Escape')
  await control.keyboard.press('Escape')
  await sleep(300)

  let shown = await toasts(control)
  check('eksik dosyalar bildirim yağmuruna yol açmaz', shown.length <= 1, shown.map((toast) => `${toast.code}: ${toast.message}`).join(' | '))
  for (const close of await control.getByRole('button', { name: 'Bildirimi kapat' }).all()) await close.click()

  // Bozuk görsel kütüphaneden silinebilir; dosya zaten olmadığı için çöpe taşıma denenmez.
  await card(missing.unused).getByRole('button', { name: 'Sil' }).click()
  await control.locator('dialog[open]').getByRole('button', { name: 'Sil', exact: true }).click()
  const removed = await waitFor(async () => (await getState(control)).app.library.some((image) => image.id === missing.unused.id), (present) => !present)
  await sleep(300)
  shown = await toasts(control)
  check('dosyası olmayan görsel kütüphaneden hatasız silinir', removed === false && shown.every((toast) => !toast.error), shown.map((toast) => toast.message).join(' | '))

  // --- Zar çağrısı reddedilir ---
  await breakHandler(session, 'dnd:dice:roll')
  await control.getByRole('button', { name: 'd20 at' }).click()
  shown = await waitFor(() => toasts(control), (list) => list.some((toast) => toast.error))
  let toast = shown.find((entry) => entry.error)
  check('zar reddedilince kalıcı hata bildirimi çıkar (kod ve açıklama)', toast !== undefined && toast.role === 'alert' && toast.code === 'DND-902' && toast.message.includes('Zar atılamadı'), JSON.stringify(toast))
  check('zar reddedilince geçmiş değişmez', (await getState(control)).session.diceHistory.length === 0)
  check('zar hatası loga yazılır', readLog(session).includes('Zar atılamadı'))
  await shot(control, 'hata-zar')
  await restoreHandler(session, 'dnd:dice:roll')
  await sleep(1300)
  await control.getByRole('button', { name: 'd20 at' }).click()
  const rolls = await waitFor(async () => (await getState(control)).session.diceHistory.length, (count) => count === 1)
  check('hatadan sonra zar düğmesi yeniden çalışır', rolls === 1 && (await control.locator('.ctl-dice__roll').count()) === 1)
  await control.getByRole('button', { name: 'Bildirimi kapat' }).first().click()

  // --- Oyunu bitirme çağrısı reddedilir ---
  await breakHandler(session, 'dnd:game:end')
  await control.getByRole('button', { name: 'Oyunu bitir' }).click()
  await control.locator('dialog[open]').getByRole('button', { name: 'Oyunu bitir' }).click()
  shown = await waitFor(() => toasts(control), (list) => list.some((entry) => entry.error))
  toast = shown.find((entry) => entry.error)
  check('oyun bitirilemeyince kalıcı hata bildirimi çıkar', toast !== undefined && toast.code === 'DND-902' && toast.message.includes('Oyun bitirilemedi'), JSON.stringify(toast))
  check('oyun bitirilemeyince panel açık ve kullanılabilir kalır', (await getState(control)).session.phase === 'playing' && (await control.locator('dialog[open]').count()) === 0)
  await control.getByRole('button', { name: 'Canı 1 azalt' }).first().click()
  check('hatadan sonra can düğmesi çalışır', (await waitFor(async () => (await getState(control)).app.players[0].hp, (hp) => hp === 9)) === 9)
  await restoreHandler(session, 'dnd:game:end')

  // --- Tam ekran düğmesi (kısa süre) ---
  const button = control.getByRole('button', { name: 'Tam ekran' })
  check('başlangıçta tam ekran kapalı ve düğme basılı değil', (await button.getAttribute('aria-pressed')) === 'false' && (await windowState(session, 'game')).fullscreen === false)
  await button.click()
  let game = await waitFor(() => windowState(session, 'game'), (value) => value.fullscreen, 5000)
  let pressed = await waitFor(() => button.getAttribute('aria-pressed'), (value) => value === 'true')
  check('"Tam ekran": oyun penceresi tam ekrana geçer, ayar ve düğme bunu gösterir', game.fullscreen && pressed === 'true' && (await getState(control)).app.settings.gameFullscreen === true)
  await button.click()
  game = await waitFor(() => windowState(session, 'game'), (value) => !value.fullscreen, 5000)
  pressed = await waitFor(() => button.getAttribute('aria-pressed'), (value) => value === 'false')
  check('"Tam ekran" ikinci kez: tam ekrandan çıkılır, ayar ve düğme bunu gösterir', !game.fullscreen && pressed === 'false' && (await getState(control)).app.settings.gameFullscreen === false)

  check('sahte çöp dışında dosya silinmedi', !existsSync(join(session.dataDir, 'gorseller', missing.unused.fileName)))
  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
