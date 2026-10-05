// Kullanıcının gerçek kurulumu: her monitörde tam ekran (ölçek >= 1) ve Windows ölçeği %100 dışındayken
// (devicePixelRatio 1,5) netlik ile fare hassasiyeti. Sürükleme, köşeden boyutlandırma ve kalem imlecin
// tam altına düşmeli; tuvaller ekranın gerçek pikseliyle çizilmeli.
// Çalıştırma: node e2e/oyun/01-ekran.mjs   (tam ekran adımları ekranı birkaç saniyeliğine kaplar)
import { addItem, addScene, check, info, isRed, near, open, run, setBackground, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

/** Yatay şeritte koyu ile açık arasındaki geçişin kaç fiziksel piksele yayıldığı. */
function edgeWidth(shot) {
  const y = Math.floor(shot.height / 2)
  let soft = 0
  for (let x = 0; x < shot.width; x++) {
    const [r] = shot.at(x, y)
    if (r > 70 && r < 180) soft += 1
  }
  return soft
}

async function prepare(session) {
  const paths = writeImages(session.sampleDir, ['buyukArka', 'buyukKarakter', 'portre'])
  const place = await session.importImage('place', paths.buyukArka)
  const npc = await session.importImage('npc', paths.buyukKarakter)
  await session.importPortrait(0, paths.portre)
  await session.send({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } }, 0)
  await session.send({ type: 'player/update', slot: 1, patch: { name: 'Şövalye Gülnihal Öztürk', level: 12 } }, 0)
  const sceneId = await addScene(session, 'Deneme', 1)
  await setBackground(session, sceneId, place.id)
  const itemId = await addItem(session, sceneId, npc.id, { label: '7 LVL' })
  return { sceneId, itemId }
}

async function precision(session, tag, { sceneId, itemId }) {
  const frame = await session.frame()
  info(`${tag}: pencere ${frame.vw}x${frame.vh}, çerçeve ${frame.width}x${frame.height}, ölçek ${frame.scale.toFixed(3)}, dpr ${frame.dpr}`)

  // --- Netlik: tuval ekranın gerçek pikseliyle açılmış mı ---
  check(
    `${tag}: Konva tuvali gerçek çözünürlükte`,
    near(frame.canvasWidth, frame.width * frame.dpr, 1) && near(frame.canvasHeight, frame.height * frame.dpr, 1),
    `tuval ${frame.canvasWidth}x${frame.canvasHeight}, beklenen ${frame.width * frame.dpr}x${frame.height * frame.dpr}`
  )
  await sleep(600)
  const node = await session.nodeOf(itemId)
  const strip = await session.capture(node.rect.x + node.rect.width / 2 - 20, node.rect.y + node.rect.height / 2, 40, 4)
  check(`${tag}: büyük görselin keskin kenarı ekranda keskin`, edgeWidth(strip) <= 2, `geçiş ${edgeWidth(strip)} piksel (şerit ${strip.width}px)`)

  const portrait = await session.game.evaluate(() => {
    const rect = document.querySelector('.game-card__img').getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  })
  const face = await session.capture(portrait.x + portrait.width / 2 - 20, portrait.y + portrait.height / 2, 40, 4)
  check(`${tag}: portre ekranda keskin`, edgeWidth(face) <= 2, `geçiş ${edgeWidth(face)} piksel, portre ${Math.round(portrait.width)}px`)

  // --- Sürükleme: tutulan nokta imlecin altında kalıyor mu ---
  {
    const before = await session.nodeOf(itemId)
    const grab = [before.rect.x + before.rect.width * 0.3, before.rect.y + before.rect.height * 0.4]
    const target = [grab[0] + 233, grab[1] - 87]
    await session.game.mouse.move(grab[0], grab[1])
    await session.game.mouse.down()
    for (let i = 1; i <= 10; i++) await session.game.mouse.move(grab[0] + (233 * i) / 10, grab[1] - (87 * i) / 10)
    const during = await session.nodeOf(itemId)
    check(
      `${tag}: sürüklerken tutulan nokta imlecin altında`,
      near(during.rect.x + during.rect.width * 0.3, target[0], 1) && near(during.rect.y + during.rect.height * 0.4, target[1], 1),
      `fark ${(during.rect.x + during.rect.width * 0.3 - target[0]).toFixed(2)}, ${(during.rect.y + during.rect.height * 0.4 - target[1]).toFixed(2)} px`
    )
    await session.release()
    const item = await session.item(itemId)
    const [vx, vy] = await session.toVirtual(during.rect.x, during.rect.y)
    check(`${tag}: bırakılan yer duruma aynen yazıldı`, near(item.x, vx, 0.6) && near(item.y, vy, 0.6), `durum ${show([item.x, item.y])}, ekran ${show([vx, vy])}`)
    const after = await session.nodeOf(itemId)
    check(`${tag}: bıraktıktan sonra görsel yerinden oynamadı`, near(after.rect.x, during.rect.x, 0.6) && near(after.rect.y, during.rect.y, 0.6))
  }

  // --- Köşeden boyutlandırma: köşe imleci izliyor mu, oran korunuyor mu ---
  {
    const transformer = await session.probe('transformer')
    const corner = transformer?.anchors['bottom-right']
    check(`${tag}: sürüklenen görsel seçili, köşe tutamaçları var`, transformer?.shown === true && transformer.ids[0] === itemId && corner !== undefined)
    if (corner) {
      const before = await session.nodeOf(itemId)
      const ratio = before.rect.height / before.rect.width
      const grow = 120
      const target = [corner.x + grow, corner.y + grow * ratio]
      await session.game.mouse.move(corner.x, corner.y)
      await session.game.mouse.down()
      for (let i = 1; i <= 10; i++) await session.game.mouse.move(corner.x + (grow * i) / 10, corner.y + (grow * ratio * i) / 10)
      const during = await session.nodeOf(itemId)
      check(
        `${tag}: boyutlanırken sağ alt köşe imlecin altında`,
        near(during.rect.x + during.rect.width, before.rect.x + before.rect.width + grow, 2) &&
          near(during.rect.y + during.rect.height, before.rect.y + before.rect.height + grow * ratio, 2),
        `köşe ${show([during.rect.x + during.rect.width, during.rect.y + during.rect.height])}, imleç ${show(target)}`
      )
      check(`${tag}: boyutlanırken sol üst köşe sabit`, near(during.rect.x, before.rect.x, 1) && near(during.rect.y, before.rect.y, 1))
      await session.release()
      const item = await session.item(itemId)
      check(`${tag}: boyutlandırma sonrası oran görselinki (2:3)`, near(item.height / item.width, 1.5, 0.0001), `${item.width.toFixed(2)} x ${item.height.toFixed(2)}`)
      const after = await session.nodeOf(itemId)
      check(
        `${tag}: bırakınca boyut ve yer aynı kaldı`,
        near(after.rect.width, during.rect.width, 1.5) && near(after.rect.x, during.rect.x, 1) && near(after.scaleX, 1, 0.0001),
        `genişlik ${after.rect.width.toFixed(1)} / ${during.rect.width.toFixed(1)}`
      )
    }
  }

  // --- Kalem: çizgi imlecin geçtiği yerde mi ---
  {
    await session.send({ type: 'session/setTool', tool: 'pen-red' }, 250)
    const [x0, y0] = await session.toClient(700, 200)
    const [x1, y1] = await session.toClient(1500, 900)
    await session.game.mouse.move(x0, y0)
    await session.game.mouse.down()
    const points = []
    for (let i = 1; i <= 16; i++) {
      const point = [x0 + ((x1 - x0) * i) / 16, y0 + ((y1 - y0) * i) / 16]
      points.push(point)
      await session.game.mouse.move(point[0], point[1])
    }
    await session.release()
    let hits = 0
    const misses = []
    for (const [index, [x, y]] of points.entries()) {
      const dot = await session.capture(x - 1, y - 1, 3, 3)
      const color = dot.at(Math.floor(dot.width / 2), Math.floor(dot.height / 2))
      // Çizginin ucunda yuvarlak başlığın kenarı yarı saydamdır; koyu kırmızı da boya sayılır.
      if (isRed(color) || (color[0] > 120 && color[1] < 80 && color[2] < 80)) hits += 1
      else misses.push(`${index + 1}. nokta ${show(color)}`)
    }
    check(`${tag}: kalem çizgisi imlecin geçtiği noktalarda`, hits === points.length, `${hits}/${points.length} nokta kırmızı ${misses.join(', ')}`)
    // Çizginin 14 sanal piksel yanında boya olmamalı (çizgi 6 sanal piksel kalın).
    const [sx, sy] = [points[8][0] + 14 * frame.scale, points[8][1] - 14 * frame.scale]
    const side = await session.capture(sx - 1, sy - 1, 3, 3)
    check(`${tag}: çizgi kaymamış (yanı boş)`, !isRed(side.at(1, 1)), show(side.at(1, 1)))
    await session.send({ type: 'session/setTool', tool: 'mouse' }, 200)
  }

  // --- Zar: tuval çözünürlüğü ve sonuç ---
  {
    await session.probe('hookDice')
    const roll = await session.control.evaluate(() => window.dnd.dice.roll(20))
    await session.game.waitForFunction(() => window.__oyun.dice().text !== null, null, { timeout: 8000 })
    const dice = await session.probe('dice')
    const canvas = await session.game.evaluate(() => {
      const element = document.querySelector('.dice-canvas')
      return { width: element.width, onScreen: element.getBoundingClientRect().width }
    })
    const wanted = Math.min(2560, Math.round(canvas.onScreen * frame.dpr))
    check(`${tag}: zar tuvali gerçek çözünürlükte`, near(canvas.width, wanted, 2), `tuval ${canvas.width}, ekranda ${Math.round(canvas.onScreen * frame.dpr)} fiziksel piksel`)
    const top = await session.probe('diceTop')
    check(`${tag}: duran zarın üst yüzü ve büyük sayı atışla aynı`, dice.text === String(roll.value) && top?.text === String(roll.value), `atış ${roll.value}, sayı ${dice.text}, üst yüz ${top?.text}`)
    await session.shot(`ekran-${tag}.png`)
  }
  void sceneId
}

await run(async () => {
  // --- 1) Her monitörde tam ekran ---
  const probe = await open('ekran-liste')
  const displays = await probe.displays()
  await probe.close()
  info(`monitörler: ${displays.map((display) => display.label).join(' | ')}`)

  for (const display of displays) {
    const tag = `tam ekran ${display.width}x${display.height}`
    const session = await open('tam-ekran')
    try {
      const ids = await prepare(session)
      await session.start({ fullscreen: true, displayId: display.id })
      const bounds = await session.gameWindow.evaluate((win) => ({ ...win.getBounds(), fullscreen: win.isFullScreen() }))
      const frame = await session.frame()
      check(`${tag}: pencere tam ekran ve seçilen monitörde`, bounds.fullscreen && bounds.width === display.width && bounds.height === display.height, show(bounds))
      check(`${tag}: sanal sahne ekranı tam dolduruyor, ölçek >= 1`, frame.width === frame.vw && frame.height === frame.vh && frame.scale >= 1, `ölçek ${frame.scale.toFixed(3)}`)
      await precision(session, tag, ids)
      check(`${tag}: sayfa hatası yok`, session.problems.length === 0, session.problems.join(' | '))
    } finally {
      await session.close()
    }
  }

  // --- 2) Windows ölçeği %150 (devicePixelRatio 1,5), pencereli ---
  {
    const tag = 'dpr 1.5'
    const session = await open('dpr', { args: ['--force-device-scale-factor=1.5'] })
    try {
      const ids = await prepare(session)
      await session.start({ size: [1120, 630] })
      const frame = await session.frame()
      check(`${tag}: devicePixelRatio 1,5`, near(frame.dpr, 1.5, 0.001), String(frame.dpr))
      await precision(session, tag, ids)
      check(`${tag}: sayfa hatası yok`, session.problems.length === 0, session.problems.join(' | '))
    } finally {
      await session.close()
    }
  }

  // --- 3) Piksel oranı pencere açıkken değişiyor (farklı ölçekli monitöre taşıma; yakınlaştırmayla taklit edilir) ---
  {
    const tag = 'dpr 1 → 1.5'
    const session = await open('dpr-degisim')
    try {
      const ids = await prepare(session)
      await session.start({ size: [1280, 720] })
      const before = await session.frame()
      await session.gameWindow.evaluate((win) => win.webContents.setZoomFactor(1.5))
      await sleep(900)
      const after = await session.frame()
      check(`${tag}: piksel oranı değişti`, near(before.dpr, 1, 0.001) && near(after.dpr, 1.5, 0.001), `${before.dpr} → ${after.dpr}`)
      check(`${tag}: iki katman da yeni oranda`, after.canvases === 2 && (await session.game.evaluate(() => [...document.querySelectorAll('.konvajs-content canvas')].every((canvas) => Math.abs(canvas.width - canvas.getBoundingClientRect().width * window.devicePixelRatio) <= 1))))
      await precision(session, tag, ids)
      check(`${tag}: sayfa hatası yok`, session.problems.length === 0, session.problems.join(' | '))
    } finally {
      await session.close()
    }
  }
})
