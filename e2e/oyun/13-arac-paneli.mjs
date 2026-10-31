// Araç paneli (1.2.0): oyun ekranında sürüklenebilir panel, kalem renkleri, kalınlık, geri al, temizle;
// sürükleme ve sınırlar, dikey dizme, küçültme, T tuşu, kontrol paneliyle eşitlik, yeniden açılış.
// Çalıştırma: node e2e/oyun/13-arac-paneli.mjs
import { join } from 'node:path'
import { addItem, addScene, check, info, near, open, run, shotDir, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const COLORS = {
  kırmızı: ([r, g, b]) => r > 220 && g < 80 && b < 80,
  siyah: ([r, g, b]) => r < 40 && g < 40 && b < 40,
  beyaz: ([r, g, b]) => r > 235 && g > 235 && b > 235,
  mavi: ([r, g, b]) => b > 220 && r < 90 && g > 100 && g < 170,
  yeşil: ([r, g, b]) => g > 170 && r < 90 && b < 120,
  sarı: ([r, g, b]) => r > 230 && g > 180 && b < 70
}

await run(async () => {
  const session = await open('panel')
  const paths = writeImages(session.sampleDir, ['jeton'])
  const token = await session.importImage('npc', paths.jeton)
  const sceneId = await addScene(session, 'Panel', 1)
  await session.send({ type: 'scene/setActive', sceneId }, 0)
  const itemId = await addItem(session, sceneId, token.id, { x: 1500, y: 700, width: 200 })
  await session.start({ size: [1280, 720], toolbar: true })
  const { game, control } = session
  await sleep(400)

  const stateSession = async () => (await session.state()).session
  const layout = async () => (await session.state()).app.settings.toolbar
  const bar = game.getByRole('toolbar', { name: 'Araç paneli' })
  const button = (name) => bar.getByRole('button', { name, exact: true })
  const box = async () => bar.boundingBox()

  // --- Varsayılan ---
  check('panel oyun ekranında görünür', (await bar.count()) === 1)
  const first = await box()
  const frame = await session.frame()
  check('panel çerçevenin içinde, portre sütununun sağında', first.x > 200 && first.x + first.width <= frame.left + frame.width && first.y >= 0, show(first))
  const idle = await bar.evaluate((el) => Number(getComputedStyle(el).opacity))
  check('üstüne gelinmedikçe yarı saydam', idle < 0.8, String(idle))
  await session.shot('panel-yatay.png')

  // --- Araçlar ---
  await button('Kalem').click()
  check('Kalem düğmesi kaleme geçirir', (await stateSession()).tool === 'pen')
  await sleep(200)
  check('üstüne gelince net', (await bar.evaluate((el) => Number(getComputedStyle(el).opacity))) > 0.95)
  check('seçili araç işaretli', (await button('Kalem').getAttribute('aria-pressed')) === 'true' && (await button('Fare').getAttribute('aria-pressed')) === 'false')
  const panelState = await control.getByRole('button', { name: 'Kalem', exact: true }).getAttribute('aria-pressed')
  check('kontrol paneli de aynı aracı gösterir', panelState === 'true', String(panelState))
  await control.getByRole('button', { name: 'Silgi', exact: true }).click()
  await sleep(200)
  check('kontrol panelindeki seçim oyun ekranındaki panele yansır', (await button('Silgi').getAttribute('aria-pressed')) === 'true')

  // --- Altı renk ---
  let row = 260
  for (const [name, matches] of Object.entries(COLORS)) {
    await button(`Renk: ${name}`).click()
    const current = await stateSession()
    check(`${name}: renk seçmek kaleme geçirir`, current.tool === 'pen')
    await session.drag([500, row], [1100, row], { steps: 8 })
    await sleep(120)
    const color = await session.colorAt(800, row)
    check(`${name}: ekrandaki çizgi bu renkte`, matches(color), show(color))
    row += 60
  }
  await session.shot('panel-renkler.png')
  const strokesBefore = await session.probe('strokes')

  // --- Panele tıklamak çizmez ---
  const edge = await box()
  await game.mouse.click(edge.x + edge.width / 2, edge.y + edge.height / 2)
  await sleep(150)
  check('panelin üstüne tıklamak çizgi bırakmaz', (await session.probe('strokes')) === strokesBefore)

  // --- Kalınlık ---
  await button('Kalınlık: kalın').click()
  check('kalınlık düğmesi çalışır', (await stateSession()).penWidth === 'thick')
  await button('Kalınlık: orta').click()

  // --- Geri al ve temizle ---
  await button('Fare').click()
  const lines = await session.probe('strokes')
  await button('Son çizimi geri al').click()
  await sleep(200)
  check('geri al, fare seçiliyken de son çizgiyi kaldırır', (await session.probe('strokes')) < lines && !COLORS.sarı(await session.colorAt(800, row - 60)), `${lines} → ${await session.probe('strokes')}`)
  check('önceki çizgi duruyor', COLORS.yeşil(await session.colorAt(800, row - 120)))
  await button('Çizimi temizle').click()
  await sleep(200)
  check('temizle bütün çizimleri siler', (await session.probe('strokes')) === 0)

  // --- Panel açıkken görsel seçimi bozulmaz ---
  const item = await session.item(itemId)
  await session.click(item.x + item.width / 2, item.y + item.height / 2)
  const selected = (await session.probe('transformer')).ids
  await button('Kalınlık: ince').click()
  await sleep(120)
  check('panele tıklamak görsel seçimini kaldırmaz', show((await session.probe('transformer')).ids) === show(selected) && selected.length === 1, show(selected))
  await button('Kalınlık: orta').click()

  // --- Sürükleme ---
  const before = await box()
  const grip = bar.locator('.game-tb__grip')
  const gripBox = await grip.boundingBox()
  await game.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
  await game.mouse.down()
  await game.mouse.move(gripBox.x + 100, gripBox.y + 200, { steps: 6 })
  const during = await box()
  check('sürüklerken panel fareyi izler', near(during.y, before.y + 200 - gripBox.height / 2, 3), show(during))
  await game.mouse.up()
  await sleep(200)
  const moved = await box()
  const saved = await layout()
  check('bırakınca yeri kayda girer', near(moved.x, during.x, 2) && near(moved.y, during.y, 2) && near(saved.y * frame.height, moved.y - frame.top, 2), show({ moved, saved }))
  check('panel sürüklemek çizgi bırakmaz, görseli taşımaz', (await session.probe('strokes')) === 0 && near((await session.item(itemId)).x, item.x))

  // Sınır: pencerenin dışına çıkamaz.
  const gripNow = await grip.boundingBox()
  await game.mouse.move(gripNow.x + 5, gripNow.y + 5)
  await game.mouse.down()
  await game.mouse.move(frame.width + 500, frame.height + 500, { steps: 6 })
  await game.mouse.up()
  await sleep(200)
  const corner = await box()
  check('panel çerçevenin dışına taşmaz', near(corner.x + corner.width, frame.left + frame.width, 2) && near(corner.y + corner.height, frame.top + frame.height, 2), show(corner))

  // Pencere küçülünce de içeride kalır.
  await session.gameWindow.evaluate((win) => win.setContentSize(800, 450))
  await sleep(500)
  const small = await box()
  const smallFrame = await session.frame()
  check('pencere küçülünce panel içeride kalır', small.x + small.width <= smallFrame.left + smallFrame.width + 1 && small.y + small.height <= smallFrame.top + smallFrame.height + 1, show({ small, smallFrame }))
  await session.gameWindow.evaluate((win) => win.setContentSize(480, 270))
  await sleep(500)
  const narrow = await box()
  const narrowFrame = await session.frame()
  check('çok dar pencerede düğmeler alt satıra geçer, taşmaz', narrow.width <= narrowFrame.width + 1 && narrow.height > 50, show({ narrow, narrowFrame }))
  await session.gameWindow.evaluate((win) => win.setContentSize(1280, 720))
  await sleep(500)

  // --- Dikey dizme ---
  await button('Dikey diz').click()
  await sleep(250)
  const vertical = await box()
  check('dikey dizilince boyu eninden büyük olur', vertical.height > vertical.width * 3, show(vertical))
  check('dikey düzen kayda girer', (await layout()).vertical === true)
  await session.shot('panel-dikey.png')
  await button('Yatay diz').click()
  await sleep(200)

  // --- Küçültme ---
  await button('Paneli küçült').click()
  await sleep(200)
  const collapsed = await box()
  check('küçülünce yalnızca tutamaç ve açma düğmesi kalır', collapsed.width < 90 && (await bar.getByRole('button').count()) === 1, show(collapsed))
  await button('Paneli aç').click()
  await sleep(200)
  check('yeniden açılır', (await bar.getByRole('button').count()) > 10)

  // --- T tuşu ---
  const win = await session.app.browserWindow(game)
  await win.evaluate((w) => w.focus())
  await game.evaluate(() => document.activeElement?.blur?.())
  await game.keyboard.press('t')
  await sleep(200)
  check('T paneli gizler', (await bar.count()) === 0 && (await layout()).hidden === true)
  await game.keyboard.press('Control+t')
  await sleep(150)
  check('Ctrl+T etkisiz', (await bar.count()) === 0)
  await game.keyboard.press('t')
  await sleep(200)
  check('T paneli geri açar', (await bar.count()) === 1)

  const panelButton = control.getByRole('button', { name: 'Araç panelini oyun ekranında göster' })
  await panelButton.click()
  await sleep(200)
  check('kontrol panelindeki "Panel" düğmesi gizler', (await bar.count()) === 0)
  await panelButton.click()
  await sleep(200)
  check('kontrol panelindeki "Panel" düğmesi açar', (await bar.count()) === 1)

  // --- Kontrol panelinde renkler ---
  await control.getByRole('button', { name: 'Kalem rengi: mavi' }).click()
  await sleep(200)
  const blue = await stateSession()
  check('kontrol panelinden renk seçilir', blue.penColor === 'blue' && blue.tool === 'pen')
  check('oyun ekranındaki panelde de işaretlenir', (await button('Renk: mavi').getAttribute('aria-pressed')) === 'true')
  const toolTops = await control.evaluate(() => new Set([...document.querySelectorAll('.ctl-tool')].map((el) => Math.round(el.getBoundingClientRect().top))).size)
  check('kontrol panelinde araç düğmeleri tek satırda', toolTops === 1, String(toolTops))
  await control.screenshot({ path: join(shotDir, 'panel-kontrol.png') })

  const problems = session.problems.filter((text) => !text.includes('Autofill'))
  check('pencerelerde hata yok', problems.length === 0, show(problems.slice(0, 4)))

  // --- Yeniden açılış ---
  await game.mouse.move(10, 10)
  const finalLayout = await layout()
  const { dataDir } = session
  await session.close()
  const again = await open('panel-2', { dataDir })
  const reopened = (await again.state()).app.settings.toolbar
  check('panelin yeri kayıttan aynı açılır', show(reopened) === show(finalLayout), show(reopened))
  info('görüntüler: e2e/.cikti/oyun/panel-*.png')
})
