// Kalem kalınlığı ve silgi: üç kalınlığın ekrandaki farkı, çizginin kendi kalınlığını koruması,
// silginin çizginin yalnızca değdiği kısmını silmesi ve alttaki görsele dokunmaması, geri alma,
// pencere değişiminde silinmiş halin korunması, kontrol panelindeki düğmeler ve imleç.
// Çalıştırma: node e2e/oyun/07-kalem.mjs
import { addItem, addScene, check, isRed, near, open, run, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const isGreen = ([r, g, b]) => g > 150 && r < 110 && b < 130

await run(async () => {
  const session = await open('kalem')
  const paths = writeImages(session.sampleDir, ['yesil'])
  const green = await session.importImage('npc', paths.yesil)

  const s1 = await addScene(session, 'Bir', 1)
  await addScene(session, 'İki', 2)
  // Çizimlerin altında duran, rengi belli büyük bir görsel: silgi ona dokunmamalı.
  const item = await addItem(session, s1, green.id, { x: 500, y: 150, width: 900 })
  await session.send({ type: 'scene/setActive', sceneId: s1 }, 0)

  await session.start({ size: [1280, 720] })
  const { game, control } = session
  await sleep(400)
  const frame = await session.frame()
  const scale = frame.scale

  const stateSession = async () => (await session.state()).session
  /** Sanal (X, Y) noktasından geçen dikey şeritte art arda gelen kırmızı piksel sayısı. */
  const redHeightAt = async (X, Y, reach = 30) => {
    const [x, y] = await session.toClient(X, Y)
    const shot = await session.capture(x - 1, y - reach, 3, reach * 2)
    let best = 0
    let run = 0
    for (let row = 0; row < shot.height; row++) {
      if (isRed(shot.at(1, row))) {
        run += 1
        best = Math.max(best, run)
      } else run = 0
    }
    // Ekran görüntüsü fiziksel pikseldir; CSS pikseline çevrilir.
    return best / (shot.height / (reach * 2))
  }

  // --- Kontrol paneli: silgi ve kalınlık düğmeleri ---
  {
    check('başlangıçta kalınlık orta', (await stateSession()).penWidth === 'medium')
    await control.getByRole('button', { name: 'Kalınlık: kalın' }).click()
    check('kalınlık düğmesi durumu değiştirir', (await stateSession()).penWidth === 'thick')
    check('seçili kalınlık işaretli', (await control.getByRole('button', { name: 'Kalınlık: kalın' }).getAttribute('aria-pressed')) === 'true')
    await control.getByRole('button', { name: 'Silgi' }).click()
    check('silgi düğmesi aracı silgi yapar', (await stateSession()).tool === 'eraser')
    await control.getByRole('button', { name: 'Kalem (kırmızı)' }).click()
    check('kalem düğmeleri tam adlarıyla bulunur', (await stateSession()).tool === 'pen-red')
    check('araç değişince kalınlık korunur', (await stateSession()).penWidth === 'thick')
    check('dört araç düğmesi tek satırda', await control.evaluate(() => new Set([...document.querySelectorAll('.ctl-tool')].map((el) => Math.round(el.getBoundingClientRect().top))).size === 1))
  }

  // --- Üç kalınlık ---
  const heights = {}
  {
    const rows = { thin: 250, medium: 330, thick: 410 }
    for (const [width, y] of Object.entries(rows)) {
      await session.send({ type: 'session/setPenWidth', width })
      await session.drag([600, y], [1300, y], { steps: 14 })
    }
    for (const [width, y] of Object.entries(rows)) heights[width] = await redHeightAt(950, y)
    check('ince < orta < kalın (ekranda)', heights.thin < heights.medium && heights.medium < heights.thick, show(heights))
    const expected = { thin: 3 * scale, medium: 6 * scale, thick: 12 * scale }
    check(
      'kalınlıklar beklenen ölçüde (3 / 6 / 12 sanal piksel)',
      near(heights.thin, expected.thin, 1.6) && near(heights.medium, expected.medium, 1.6) && near(heights.thick, expected.thick, 2),
      `${show(heights)} beklenen ${show(expected)}`
    )
    // Ayar değişince çizilmiş çizgiler kalınlığını korur.
    await session.send({ type: 'session/setPenWidth', width: 'thin' })
    await sleep(200)
    check('çizilmiş çizgi kendi kalınlığını korur', near(await redHeightAt(950, 410), heights.thick, 1))
    check('imleç kalemde artı', (await game.evaluate(() => document.querySelector('.konvajs-content').parentElement.style.cursor)) === 'crosshair')
  }

  // --- Silgi ---
  {
    await session.send({ type: 'session/setPenWidth', width: 'medium' })
    await session.send({ type: 'session/setTool', tool: 'eraser' })
    const cursor = await game.evaluate(() => document.querySelector('.konvajs-content').parentElement.style.cursor)
    check('imleç silgide çapı gösteren daire', cursor.startsWith('url(') && cursor.includes('crosshair'), cursor.slice(0, 40))

    const before = await session.probe('strokes')
    // Kalın çizgiyi (y=410) ortasından dikine sil.
    await session.drag([950, 370], [950, 450], { steps: 8 })
    check('silgi hareketi de bir iz olarak tutulur', (await session.probe('strokes')) === before + 1)
    check('silginin geçtiği yerde çizgi silindi', !isRed(await session.colorAt(950, 410)), show(await session.colorAt(950, 410)))
    check('silinen yerde alttaki görsel bozulmadan duruyor', isGreen(await session.colorAt(950, 410)), show(await session.colorAt(950, 410)))
    check('çizginin geri kalanı duruyor', isRed(await session.colorAt(800, 410)) && isRed(await session.colorAt(1100, 410)))
    // Orta ayarda silgi 24 sanal piksel geniştir: merkezden 8 uzakta silinmiş, 25 uzakta duruyor olmalı.
    check('silgi genişliği kalemin dört katı', !isRed(await session.colorAt(958, 410)) && isRed(await session.colorAt(975, 410)), show([await session.colorAt(958, 410), await session.colorAt(975, 410)]))
    // İnce çizgi bu pencere boyutunda bir-iki piksel kalır; tek noktanın rengi yerine çizginin varlığına bakılır.
    check('komşu çizgilere dokunulmadı', near(await redHeightAt(950, 330), heights.medium, 1) && near(await redHeightAt(950, 250), heights.thin, 1))

    const node = await session.nodeOf(item)
    const state = await session.item(item)
    check('silgi görseli taşımaz', near(node.x, state.x) && near(node.y, state.y) && near(state.x, 500) && near(state.y, 150))

    // Silgiden sonra çizilen çizgi silinen yerin üstünden geçer.
    await session.send({ type: 'session/setTool', tool: 'pen-red' })
    await session.drag([930, 500], [970, 500], { steps: 4 })
    await session.send({ type: 'session/setTool', tool: 'eraser' })
    check('silgi sonradan çizilen başka çizgiyi etkilemez', isRed(await session.colorAt(950, 500)))
  }

  // --- Geri alma ve pencere değişimi ---
  {
    await session.send({ type: 'scene/activateHotkey', hotkey: 2 })
    await sleep(300)
    check('başka pencerede çizim yok', (await session.probe('strokes')) === 0)
    await session.send({ type: 'scene/activateHotkey', hotkey: 1 })
    await sleep(300)
    check('pencereye dönünce silinmiş kısım silik kalır', !isRed(await session.colorAt(950, 410)) && isRed(await session.colorAt(800, 410)))

    // Ctrl+Z sırayla geri alır: önce son çizgi, sonra silgi izi.
    const win = await session.app.browserWindow(game)
    await win.evaluate((w) => w.focus())
    await game.keyboard.press('Control+z')
    await sleep(200)
    check('Ctrl+Z son çizgiyi geri alır', !isRed(await session.colorAt(950, 500)))
    await game.keyboard.press('Control+z')
    await sleep(200)
    check('Ctrl+Z silgiyi de geri alır: silinen kısım geri gelir', isRed(await session.colorAt(950, 410)))
  }

  // --- Fareye dönüş ve temizleme ---
  {
    await session.send({ type: 'session/setTool', tool: 'mouse' })
    await sleep(200)
    const cursor = await game.evaluate(() => document.querySelector('.konvajs-content').parentElement.style.cursor)
    check('fareye dönünce silgi imleci kalkar', !cursor.startsWith('url('), cursor)
    const before = await session.item(item)
    await session.drag([700, 600], [760, 640])
    const moved = await session.item(item)
    check('silgiden sonra fareyle görsel taşınabiliyor', near(moved.x, before.x + 60) && near(moved.y, before.y + 40), show([moved.x - before.x, moved.y - before.y]))
    await control.getByRole('button', { name: 'Çizimi temizle' }).click()
    await sleep(250)
    check('"Çizimi temizle" kalem ve silgi izlerinin hepsini siler', (await session.probe('strokes')) === 0 && !isRed(await session.colorAt(800, 330)))
  }

  await session.shot('07-kalem.png')
  check('sayfa hatası ya da uyarısı yok', session.problems.length === 0, show(session.problems.slice(0, 3)))
})
