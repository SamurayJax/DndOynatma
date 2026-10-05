// Araçların birbirine etkisi ve uzun içerik: zar atılırken seçim ve kalem, görsellerin üstüne çizim,
// kalemde seçim tutamaçlarının gizlenmesi, seçim varken 1–9 ile pencere değiştirme; 24 karakterlik
// isimler, 99. seviye, kenara yakın 40 karakterlik etiket.
// Çalıştırma: node e2e/oyun/04-etkilesim.mjs
import { addItem, addScene, check, COLUMN_W, info, isRed, near, open, run, setBackground, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

// İkincisi gerçekçi en kötü durum: tamamı büyük harf, 24 karakter.
const LONG_NAMES = ['İlkbahar Rüzgârı Güneşli', 'MAXİMUS WOLFGANG DRAGMOR', 'Kızılsakal Thorgrim Demi', 'Şövalye Gülnihal Öztürk2']
const LONG_LABEL = 'Kadim Ejderha Lordu Vaelthryx — 17 LVL!!'

await run(async () => {
  const session = await open('etkilesim')
  const paths = writeImages(session.sampleDir, ['arka', 'karakter', 'yesil', 'portre2'])
  const place = await session.importImage('place', paths.arka)
  const enemy = await session.importImage('enemy', paths.karakter)
  const green = await session.importImage('npc', paths.yesil)
  await session.importPortrait(0, paths.portre2)
  await session.send({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } }, 0)

  const s1 = await addScene(session, 'Bir', 1)
  const s2 = await addScene(session, 'İki', 2)
  await setBackground(session, s1, place.id)
  const a = await addItem(session, s1, enemy.id, { x: 1500, y: 120, width: 240, label: 'Kurt' })
  const b = await addItem(session, s1, green.id, { x: 420, y: 700, width: 200 })
  await addItem(session, s2, green.id, { x: 900, y: 300, width: 300 })
  await session.send({ type: 'scene/setActive', sceneId: s1 }, 0)

  await session.start({ size: [1280, 720] })
  const { game, control } = session
  await sleep(500)

  const selected = async () => {
    const transformer = await session.probe('transformer')
    return transformer?.shown ? transformer.ids[0] : null
  }
  const centerOf = async (itemId) => {
    const item = await session.item(itemId, s1)
    return [item.x + item.width / 2, item.y + item.height / 2]
  }
  const activeId = async () => (await session.state()).app.activeSceneId
  const roll = () => control.evaluate(() => window.dnd.dice.roll(20))
  const waitResult = () => game.waitForFunction(() => window.__oyun.dice().text !== null, null, { timeout: 8000 })
  const waitGone = () => game.waitForFunction(() => window.__oyun.dice().children === 0, null, { timeout: 9000 })

  // --- Seçim varken zar ---
  {
    await session.click(...(await centerOf(a)))
    check('görsel seçildi', (await selected()) === a)
    const thrown = await roll()
    await sleep(700)
    check('zar uçarken seçim çerçevesi duruyor', (await selected()) === a && (await session.probe('dice')).canvas)
    // Zar katmanı fareyi yutmamalı: animasyon sürerken görsel taşınabilir.
    const before = await session.item(a)
    const from = await centerOf(a)
    await session.drag(from, [from[0] - 120, from[1] + 60])
    const moved = await session.item(a)
    check('zar animasyonu sürerken görsel sürüklenebiliyor', near(moved.x, before.x - 120, 1.5) && near(moved.y, before.y + 60, 1.5), show([moved.x - before.x, moved.y - before.y]))
    await waitResult()
    check('sonuç gösterildi, seçim hâlâ aynı görselde', (await session.probe('dice')).text === String(thrown.value) && (await selected()) === a)
    await waitGone()
    const dice = await session.probe('dice')
    check('zar kaybolunca geride öğe kalmadı, seçim duruyor', dice.children === 0 && dice.opacity === '' && (await selected()) === a, show(dice))
    await game.keyboard.press('Escape')
  }

  // --- Kalem etkinken zar; görsellerin üstüne çizim; tutamaçlar ---
  {
    await session.click(...(await centerOf(b)))
    check('ikinci görsel seçildi', (await selected()) === b)
    await session.send({ type: 'session/setTool', tool: 'pen-red' }, 250)
    const nodes = await session.probe('items')
    check('kalem seçilince seçim tutamaçları gizlendi, görseller tutulamıyor', (await selected()) === null && nodes.every((node) => !node.listening))

    const thrown = await roll()
    await sleep(500)
    // Zar uçarken çizim: görselin üstünden geçen bir çizgi (zarın duracağı orta bölgeden uzakta).
    const item = await session.item(a)
    const through = [item.x + item.width / 2, item.y + item.height / 2]
    await session.drag([through[0] - 200, through[1] - 90], [through[0] + 100, through[1] + 45], { steps: 14 })
    check('zar uçarken kalem çiziyor', (await session.probe('strokes')) === 1 && (await session.probe('dice')).canvas)
    // Uçan zar ya da gölgesi tam o anda bu noktanın üstünden geçiyor olabilir; öyleyse zar durunca yeniden bakılır.
    let lineColor = await session.colorAt(through[0] - 50, through[1] - 22.5)
    if (!isRed(lineColor)) {
      await waitResult()
      lineColor = await session.colorAt(through[0] - 50, through[1] - 22.5)
    }
    check('çizgi görselin üstünde görünüyor', isRed(lineColor), show(lineColor))
    const still = await session.item(a)
    check('kalemle üstünden geçilen görsel taşınmadı', near(still.x, item.x, 0.001) && near(still.y, item.y, 0.001))
    await waitResult()
    check('kalem etkinken zar sonucu gösterildi', (await session.probe('dice')).text === String(thrown.value))
    await waitGone()
    check('zar kaybolduktan sonra çizgi duruyor', (await session.probe('strokes')) === 1 && isRed(await session.colorAt(through[0] - 50, through[1] - 22.5)))

    await session.send({ type: 'session/setTool', tool: 'mouse' }, 300)
    const back = await selected()
    info(`fareye dönünce eski seçim: ${back === null ? 'geri gelmedi (seçim bilerek unutuluyor)' : 'geri geldi'}`)
    check('fareye dönünce çizimler silinmedi, ortada sahipsiz tutamaç yok', (await session.probe('strokes')) === 1 && (back === null || back === b))
    await session.send({ type: 'session/clearDrawing' }, 250)
    check('"Çizimi temizle" çizimleri sildi', (await session.probe('strokes')) === 0)
    await session.click(...(await centerOf(b)))
    const transformer = await session.probe('transformer')
    const node = await session.nodeOf(b)
    check(
      'fareye dönünce tutamaçlar doğru görselde ve doğru yerde çıkıyor',
      transformer.shown && transformer.ids[0] === b && near(transformer.anchors['top-left'].x, node.rect.x, 2) && near(transformer.anchors['bottom-right'].y, node.rect.y + node.rect.height, 2),
      show(transformer.anchors)
    )
  }

  // --- Seçim varken pencere boyutu değişiyor (tam ekrana geçiş gibi) ---
  {
    const aligned = async () => {
      const transformer = await session.probe('transformer')
      const node = await session.nodeOf(b)
      return transformer.shown && near(transformer.anchors['top-left'].x, node.rect.x, 2) && near(transformer.anchors['bottom-right'].x, node.rect.x + node.rect.width, 2) && near(transformer.anchors['bottom-right'].y, node.rect.y + node.rect.height, 2)
    }
    await session.gameWindow.evaluate((win) => win.setContentSize(1500, 760))
    await sleep(500)
    check('pencere büyüyünce tutamaçlar görselin köşelerinde kaldı', await aligned())
    await session.gameWindow.evaluate((win) => win.setContentSize(1280, 720))
    await sleep(500)
    check('pencere eski boyutuna dönünce de öyle', await aligned())
  }

  // --- Seçim varken 1–9 ile pencere değiştirme ---
  {
    check('görsel seçili', (await selected()) === b)
    await game.keyboard.press('2')
    await sleep(300)
    check('seçim varken 2 tuşu pencereyi değiştirdi, tutamaçlar kalktı', (await activeId()) === s2 && (await selected()) === null)
    await game.keyboard.press('Delete')
    await game.keyboard.press('1')
    await sleep(300)
    const scene = await session.scene()
    check('1 ile geri dönüldü: seçim geri gelmedi, hiçbir görsel silinmedi', (await activeId()) === s1 && (await selected()) === null && scene.items.length === 2)
    await game.keyboard.press('Delete')
    await sleep(200)
    check('seçim yokken Delete etkisiz', (await session.scene()).items.length === 2)

    await session.send({ type: 'session/setTool', tool: 'pen-black' }, 250)
    await session.drag([700, 300], [1000, 500])
    // Siyah çizgi iki Konva çizgisidir (hale + mürekkep).
    check('siyah kalemle çizildi', (await session.probe('strokes')) === 2)
    await game.keyboard.press('2')
    await sleep(300)
    check('kalem etkinken 2 tuşu pencereyi değiştirdi; çizim eski pencerede kaldı', (await activeId()) === s2 && (await session.probe('strokes')) === 0)
    await game.keyboard.press('1')
    await sleep(300)
    check('ilk pencereye dönünce çizimi geri geldi', (await session.probe('strokes')) === 2)
    await session.send({ type: 'session/clearDrawing' }, 200)
    await session.send({ type: 'session/setTool', tool: 'mouse' }, 250)
  }

  // --- Uzun içerik: isimler, seviye ---
  const nameReport = () =>
    game.evaluate(() =>
      [...document.querySelectorAll('.game-card')].map((card) => {
        const name = card.querySelector('.game-card__name')
        const level = card.querySelector('.game-card__level').getBoundingClientRect()
        const frame = card.querySelector('.game-card__frame').getBoundingClientRect()
        const column = document.querySelector('.game-portraits').getBoundingClientRect()
        return {
          text: name.textContent,
          fits: name.scrollWidth <= name.clientWidth,
          font: Number.parseFloat(getComputedStyle(name).fontSize),
          levelInside: level.left >= frame.left && level.right <= frame.right,
          cardInside: card.getBoundingClientRect().bottom <= column.bottom + 0.5
        }
      })
    )
  for (const count of [4, 2, 1]) {
    for (let slot = 0; slot < 4; slot++) {
      if (slot < count) await session.send({ type: 'player/update', slot, patch: { name: LONG_NAMES[slot], level: 99 } }, 0)
      else await session.send({ type: 'player/clear', slot }, 0)
    }
    await sleep(350)
    const cards = await nameReport()
    check(
      `${count} kart: 24 karakterlik isimler kesilmeden sığıyor`,
      cards.length === count && cards.every((card, index) => card.text === LONG_NAMES[index] && card.fits),
      cards.map((card) => `${card.fits ? 'sığdı' : 'KESİLDİ'} ${card.font.toFixed(1)}px`).join(', ')
    )
    check(`${count} kart: "99 LVL" plakası çerçevenin içinde, kartlar sütuna sığıyor`, cards.every((card) => card.levelInside && card.cardInside))
    if (count === 4) await session.shot('etkilesim-uzun-isimler.png')
  }
  {
    // Kısa isim küçültülmüş boyutta kalmamalı.
    await session.send({ type: 'player/update', slot: 0, patch: { name: 'Mira' } }, 300)
    const [card] = await nameReport()
    check('uzun isimden kısa isme dönünce yazı yeniden büyüyor', card.fits && card.font >= 30, `${card.font}px`)
    // Olabilecek en geniş isim: sığmazsa taşmak yerine üç noktayla kesilir (bilgi amaçlı).
    await session.send({ type: 'player/update', slot: 0, patch: { name: 'W'.repeat(24) } }, 300)
    const [widest] = await nameReport()
    info(`24 tane "W": ${widest.fits ? 'sığdı' : 'üç noktayla kesildi'} (${widest.font.toFixed(1)}px)`)
    check('en geniş isim kartın dışına taşmıyor', await game.evaluate(() => getComputedStyle(document.querySelector('.game-card__name')).overflow === 'hidden'))
    await session.send({ type: 'player/update', slot: 0, patch: { name: 'Mira' } }, 200)
  }

  // --- Uzun etiket kenarlarda ---
  {
    const frame = await session.frame()
    const areaLeft = frame.left + COLUMN_W * frame.scale
    const insideArea = (rect) => rect.x >= areaLeft - 0.5 && rect.x + rect.width <= frame.left + frame.width + 0.5 && rect.y >= frame.top - 0.5 && rect.y + rect.height <= frame.top + frame.height + 0.5
    for (const [where, patch] of [
      ['sağ alt köşe', { x: 1760, y: 900 }],
      ['alt kenar', { x: 900, y: 1000 }],
      ['sol kenar (sütunun yanı)', { x: 180, y: 300 }],
      ['sağ üst köşe', { x: 1800, y: -100 }]
    ]) {
      await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: a, patch: { ...patch, label: LONG_LABEL } }, 300)
      const label = (await session.probe('labels')).find((entry) => entry.text === LONG_LABEL)
      check(`40 karakterlik etiket, ${where}: tamamı oyun alanının içinde`, label !== undefined && insideArea(label.rect), label ? show(label.rect) : 'etiket yok')
    }
    check('etiket 40 karakter', LONG_LABEL.length === 40 && LONG_NAMES.every((name) => Array.from(name).length === 24))
    await session.shot('etkilesim-uzun-etiket.png')
  }

  check('sayfa hatası yok', session.problems.length === 0, session.problems.join(' | '))
  await session.close()
})
