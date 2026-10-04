// Gerçeğe yakın görseller ve kalabalık sahne: 4000x3000 arka plan, 2000x3000 karakter, saydam PNG,
// çok geniş / çok uzun görsel; 36 görselli sahnede sürükleme akıcılığı ve pencere değiştirirken sızıntı.
// Çalıştırma: node e2e/oyun/02-gorseller.mjs [--tam-ekran]   (--tam-ekran: en büyük monitörde tam ekran)
import { addItem, addScene, check, COLUMN_W, info, near, open, run, setBackground, show, sleep, STAGE_H, STAGE_W } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const MIN_ITEM_SIZE = 40

/** Canlı nesne sayısı (çöp toplandıktan sonra): sızıntı varsa pencere değiştirdikçe büyür. */
async function liveCount(cdp, expression) {
  await cdp.send('HeapProfiler.collectGarbage')
  const proto = await cdp.send('Runtime.evaluate', { expression })
  const found = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId })
  const length = await cdp.send('Runtime.callFunctionOn', { objectId: found.objects.objectId, functionDeclaration: 'function () { return this.length }', returnByValue: true })
  await cdp.send('Runtime.releaseObject', { objectId: found.objects.objectId })
  return length.result.value
}

await run(async () => {
  const session = await open('gorseller')
  const paths = writeImages(session.sampleDir, ['buyukArka', 'buyukKarakter', 'saydam', 'genis', 'uzun', 'cokGenis', 'arka', 'karakter', 'jeton', 'yesil', 'portre2'])
  const started = Date.now()
  const big = await session.importImage('scene', paths.buyukArka)
  const hero = await session.importImage('boss', paths.buyukKarakter)
  info(`4000x3000 ve 2000x3000 görsellerin içe aktarımı ${Date.now() - started} ms`)
  const disc = await session.importImage('npc', paths.saydam)
  const wide = await session.importImage('item', paths.genis)
  const tall = await session.importImage('item', paths.uzun)
  const banner = await session.importImage('item', paths.cokGenis)
  const place = await session.importImage('place', paths.arka)
  const enemy = await session.importImage('enemy', paths.karakter)
  const token = await session.importImage('item', paths.jeton)
  const green = await session.importImage('npc', paths.yesil)
  await session.importPortrait(0, paths.portre2)
  await session.send({ type: 'player/update', slot: 0, patch: { name: 'Mira', level: 3 } }, 0)
  check('büyük görsellerin boyutu doğru okundu', big.width === 4000 && big.height === 3000 && hero.width === 2000 && hero.height === 3000)

  // --- Sahne 1: büyük ve tuhaf oranlı görseller ---
  const art = await addScene(session, 'Büyük görseller', 1)
  const bgId = await setBackground(session, art, big.id)
  const heroId = await addItem(session, art, hero.id, { x: 1300, y: 200, label: 'Ejderha' })
  const greenId = await addItem(session, art, green.id, { x: 500, y: 150, width: 300 })
  const discId = await addItem(session, art, disc.id, { x: 400, y: 100, width: 500, label: 'Saydam' })
  const wideId = await addItem(session, art, wide.id, { y: 900, label: 'Geniş' })
  const tallId = await addItem(session, art, tall.id, { x: 1000, label: 'Uzun' })
  const bannerId = await addItem(session, art, banner.id, { y: 40 })

  // --- Sahne 2 ve 3: 36'şar görsel ---
  const crowd = await addScene(session, 'Kalabalık', 2)
  const other = await addScene(session, 'Kalabalık 2', 3)
  await setBackground(session, crowd, place.id)
  await setBackground(session, other, big.id)
  const crowdIds = []
  const sources = [enemy, token, green, disc, hero, wide]
  for (let i = 0; i < 36; i++) {
    const position = { x: 330 + (i % 9) * 172, y: 30 + Math.floor(i / 9) * 255, width: 150, label: i % 3 === 0 ? `${i + 1}. görsel` : '' }
    crowdIds.push(await addItem(session, crowd, sources[i % sources.length].id, position))
    await addItem(session, other, sources[(i + 2) % sources.length].id, { ...position, x: position.x + 20 })
  }
  await session.send({ type: 'scene/setActive', sceneId: art }, 0)

  if (process.argv.includes('--tam-ekran')) {
    const largest = (await session.displays()).reduce((best, display) => (display.width > best.width ? display : best))
    info(`tam ekran: ${largest.label}`)
    await session.start({ fullscreen: true, displayId: largest.id })
  } else {
    await session.start({ size: [1600, 900] })
  }
  const { game } = session
  const area = { x: COLUMN_W, y: 0, width: STAGE_W - COLUMN_W, height: STAGE_H }

  // --- Büyük görseller ---
  {
    const background = await session.item(bgId)
    check(
      '4000x3000 arka plan oyun alanını oranı bozulmadan dolduruyor',
      near(background.width / background.height, 4 / 3, 0.0001) && background.x <= area.x && background.y <= 0 && background.x + background.width >= STAGE_W && background.y + background.height >= STAGE_H,
      show(background)
    )
    // Görseller çözülene kadar beklenir; süre bilgi olarak yazılır.
    const loadStart = Date.now()
    let drawn = false
    for (let i = 0; i < 60 && !drawn; i++) {
      const color = await session.colorAt(1400, 500)
      drawn = color[0] < 40 && color[2] < 60
      if (!drawn) await sleep(100)
    }
    check('2000x3000 karakter çizildi', drawn, `≈${Date.now() - loadStart} ms`)
    const corner = await session.colorAt(1900, 1060)
    check('arka plan sağ alt köşeye kadar çizili', corner[2] > corner[0], show(corner))

    const item = await session.item(heroId)
    check('2000x3000 karakter 2:3 oranında', near(item.height / item.width, 1.5, 0.0001), show(item))
    const before = await session.nodeOf(heroId)
    await session.probe('framesStart')
    const from = await session.toVirtual(before.rect.x + before.rect.width / 2, before.rect.y + before.rect.height / 2)
    await session.drag(from, [from[0] - 500, from[1] + 60], { steps: 60, stepMs: 12 })
    const stats = await session.probe('framesStop')
    const moved = await session.item(heroId)
    check('büyük karakter büyük arka plan üstünde sürükleniyor', near(moved.x, item.x - 500, 1.5) && near(moved.y, item.y + 60, 1.5), show([moved.x, moved.y]))
    check('büyük görsellerle sürükleme akıcı', stats.median < 25 && stats.p95 < 50, `kare aralığı ortanca ${stats.median.toFixed(1)} ms, %95 ${stats.p95.toFixed(1)} ms, en uzun ${stats.max.toFixed(1)} ms (${stats.count} kare)`)
  }

  // --- Saydam PNG ---
  {
    await session.click(1800, 60)
    const node = await session.nodeOf(discId)
    const [left, top] = await session.toVirtual(node.rect.x, node.rect.y)
    const size = (await session.item(discId)).width
    // Dairenin dışındaki saydam köşe: altındaki yeşil görsel görünür olmalı.
    const through = await session.colorAt(left + size * 0.5, top + size * 0.1)
    check('saydam bölgeden alttaki görsel görünüyor', through[1] > 150 && through[0] < 90, show(through))
    await session.click(left + size * 0.06, top + size * 0.06)
    let transformer = await session.probe('transformer')
    info(`saydam köşeye tıklayınca seçilen: ${transformer.ids[0] === discId ? 'saydam görselin kendisi (kutu esas alınıyor)' : (transformer.ids[0] ?? 'hiçbiri')}`)
    check('saydam köşeye tıklamak görseli kutusundan seçiyor (tutarlı davranış)', transformer.shown && transformer.ids[0] === discId)
    await session.click(left + size * 0.5, top + size * 0.5)
    transformer = await session.probe('transformer')
    check('saydam görsel dolu yerinden seçiliyor', transformer.shown && transformer.ids[0] === discId)
    const label = (await session.probe('labels')).find((entry) => entry.text === 'Saydam')
    check('saydam görselin etiketi kutunun altında ortalı', label !== undefined && near(label.rect.x + label.rect.width / 2, node.rect.x + node.rect.width / 2, 2) && label.rect.y > node.rect.y + node.rect.height)
    await game.keyboard.press('Escape')
  }

  // --- Çok geniş ve çok uzun görseller ---
  for (const [name, itemId, image] of [['çok geniş (3000x200)', wideId, wide], ['çok uzun (200x3000)', tallId, tall], ['şerit (4000x100)', bannerId, banner]]) {
    const item = await session.item(itemId)
    check(`${name}: oran korunmuş`, near(item.width / item.height, image.width / image.height, 0.001), `${item.width.toFixed(1)} x ${item.height.toFixed(1)}`)
    check(`${name}: kısa kenar tutulabilecek kadar büyük (>= ${MIN_ITEM_SIZE})`, Math.min(item.width, item.height) >= MIN_ITEM_SIZE - 0.001, `${Math.min(item.width, item.height).toFixed(1)}`)
    const node = await session.nodeOf(itemId)
    const center = await session.toVirtual(node.rect.x + node.rect.width / 2, node.rect.y + node.rect.height / 2)
    await session.drag(center, [center[0] + 40, center[1] - 30])
    const moved = await session.item(itemId)
    check(`${name}: ince kenarından tutulup taşınıyor`, near(moved.x, item.x + 40, 1.5) && near(moved.y, item.y - 30, 1.5), show([moved.x - item.x, moved.y - item.y]))
    // Köşeden küçültme: en küçük boyutta takılı kalmamalı, oran bozulmamalı.
    const transformer = await session.probe('transformer')
    const frame = await session.frame()
    // Sağ alt köşe pencerenin dışına taşmışsa (çok geniş görsel) sol üst köşeden büyütülür.
    const outside = transformer.anchors['bottom-right'].x > frame.left + frame.width - 4
    const anchor = transformer.anchors[outside ? 'top-left' : 'bottom-right']
    const live = await session.nodeOf(itemId)
    const k = live.rect.height / live.rect.width
    const pull = Math.min(60, live.rect.width * 0.3) * (outside ? -1 : 1)
    await game.mouse.move(anchor.x, anchor.y)
    await game.mouse.down()
    for (let i = 1; i <= 8; i++) await game.mouse.move(anchor.x + (pull * i) / 8, anchor.y + (pull * k * i) / 8)
    await session.release()
    const grown = await session.item(itemId)
    check(`${name}: köşeden büyütülüyor, oran aynı`, grown.width > moved.width + 5 && near(grown.width / grown.height, image.width / image.height, 0.001), `${moved.width.toFixed(1)} → ${grown.width.toFixed(1)}`)
    await game.keyboard.press('Escape')
  }
  {
    const labels = await session.probe('labels')
    const frame = await session.frame()
    const inside = labels.every((entry) => entry.rect.x >= frame.left + COLUMN_W * frame.scale - 0.5 && entry.rect.x + entry.rect.width <= frame.left + frame.width + 0.5 && entry.rect.y >= frame.top - 0.5 && entry.rect.y + entry.rect.height <= frame.top + frame.height + 0.5)
    check('etiketlerin hepsi oyun alanının içinde', labels.length === 4 && inside, show(labels.map((entry) => entry.text)))
  }
  await session.shot('gorseller-buyuk.png')

  // --- Kalabalık sahne: 36 görsel ---
  {
    await session.send({ type: 'scene/setActive', sceneId: crowd }, 1200)
    const nodes = await session.probe('items')
    check('36 görsel ve arka plan sahnede', nodes.length === 37, String(nodes.length))
    const targetId = crowdIds[13]
    const item = await session.item(targetId)
    const itemsBefore = (await session.scene()).items
    const node = await session.nodeOf(targetId)
    const from = await session.toVirtual(node.rect.x + node.rect.width / 2, node.rect.y + node.rect.height / 2)
    await session.probe('framesStart')
    await session.drag(from, [from[0] + 420, from[1] + 180], { steps: 80, stepMs: 12 })
    const stats = await session.probe('framesStop')
    const moved = await session.item(targetId)
    check('kalabalık sahnede sürüklenen görsel doğru yere gitti', near(moved.x, item.x + 420, 1.5) && near(moved.y, item.y + 180, 1.5))
    check('36 görselli sahnede sürükleme akıcı', stats.median < 25 && stats.p95 < 50, `kare aralığı ortanca ${stats.median.toFixed(1)} ms, %95 ${stats.p95.toFixed(1)} ms, en uzun ${stats.max.toFixed(1)} ms (${stats.count} kare)`)
    const itemsAfter = (await session.scene()).items
    const untouched = itemsBefore.filter((entry) => entry.id !== targetId).every((entry) => JSON.stringify(entry) === JSON.stringify(itemsAfter.find((other) => other.id === entry.id)))
    check('diğer 35 görsel yerinden oynamadı, sıra aynı', untouched && itemsAfter.map((entry) => entry.id).join() === itemsBefore.map((entry) => entry.id).join())
    await session.shot('gorseller-kalabalik.png')
    await game.keyboard.press('Escape')
  }

  // --- Pencereler arasında gidip gelme: düğüm / görsel sızıntısı ---
  {
    const cdp = await game.context().newCDPSession(game)
    const round = async (times) => {
      for (let i = 0; i < times; i++) {
        await session.send({ type: 'scene/setActive', sceneId: other }, 120)
        await session.send({ type: 'scene/setActive', sceneId: crowd }, 120)
      }
      await sleep(800)
    }
    await round(3)
    const baseCounts = await session.probe('counts')
    const baseImages = await liveCount(cdp, 'HTMLImageElement.prototype')
    const baseCanvases = await liveCount(cdp, 'HTMLCanvasElement.prototype')
    await round(20)
    const counts = await session.probe('counts')
    const images = await liveCount(cdp, 'HTMLImageElement.prototype')
    const canvases = await liveCount(cdp, 'HTMLCanvasElement.prototype')
    check('40 pencere değişiminden sonra Konva düğüm sayısı aynı', counts.konva === baseCounts.konva && counts.dom === baseCounts.dom, `${baseCounts.konva} → ${counts.konva} düğüm, DOM ${baseCounts.dom} → ${counts.dom}`)
    check('görsel nesneleri birikmiyor', images <= baseImages + 2, `canlı <img>: ${baseImages} → ${images}`)
    check('tuval nesneleri birikmiyor', canvases <= baseCanvases + 2, `canlı <canvas>: ${baseCanvases} → ${canvases}`)
    const node = await session.nodeOf(crowdIds[0])
    const color = await session.colorAt(...(await session.toVirtual(node.rect.x + node.rect.width / 2, node.rect.y + node.rect.height / 2)))
    check('gidip geldikten sonra görseller çizili', color[0] > 30 || color[1] > 30 || color[2] > 30, show(color))
    await cdp.detach()
  }

  check('sayfa hatası yok', session.problems.length === 0, session.problems.join(' | '))
  await session.close()
})
