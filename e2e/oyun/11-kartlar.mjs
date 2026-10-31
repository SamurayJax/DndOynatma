// Kartlar (1.1.0): NPC, tüccar, düşman ve boss görselleri düz ya da kart olarak konur; ad, seviye ve can
// kontrol panelinden yönetilir, boss'un beş çerçevesi vardır. Düz görsel eskisi gibi çalışır.
// Çalıştırma: node e2e/oyun/11-kartlar.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addScene, check, info, near, open, run, shotDir, show, sleep, uuid } from './harness.mjs'
import { discImage, gradient } from './gorseller.mjs'

const CARD_RATIO = 300 / 420

await run(async () => {
  const session = await open('kartlar')
  writeFileSync(join(session.sampleDir, 'Goblin.png'), gradient(640, 320, [40, 120, 60], [160, 200, 90], 40))
  writeFileSync(join(session.sampleDir, 'Ejderha.png'), discImage(512, [190, 60, 40]))
  writeFileSync(join(session.sampleDir, 'Kilic.png'), discImage(256, [120, 120, 180]))
  const goblin = await session.importImage('enemy', join(session.sampleDir, 'Goblin.png'))
  const dragon = await session.importImage('boss', join(session.sampleDir, 'Ejderha.png'))
  await session.importImage('item', join(session.sampleDir, 'Kilic.png'))
  await session.menu.evaluate(() => window.dnd.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Patron', level: 30 } }))
  const sceneId = await addScene(session, 'Orman')
  await session.send({ type: 'scene/setActive', sceneId })
  await session.start()
  const { control } = session

  // --- Kütüphaneden koyma ---
  await control.getByRole('tab', { name: /Düşmanlar/ }).click()
  await control.locator(`[data-image-id="${goblin.id}"] .lib-card__main`).click()
  await control.locator(`[data-image-id="${goblin.id}"]`).getByRole('button', { name: 'Kart olarak koy' }).click()
  await control.locator(`[data-image-id="${goblin.id}"]`).getByRole('button', { name: 'Kart olarak koy' }).click()
  await sleep(300)
  let scene = await session.scene()
  const [plain, cardA, cardB] = scene.items
  check('karta tıklamak eskisi gibi düz görsel koyar', plain.card === undefined && near(plain.width / plain.height, 2, 0.01), show(plain))
  check('"Kart olarak koy" kart oranında kart koyar', cardA.card?.hp === 10 && near(cardA.width / cardA.height, CARD_RATIO, 0.01), show(cardA))
  check('ikinci kopya numaralanır', cardA.card?.name === 'Goblin' && cardB.card?.name === 'Goblin 2', `${cardA.card?.name} ${cardB.card?.name}`)

  await control.getByRole('tab', { name: /İtemler/ }).click()
  check('eşyalarda kart düğmesi yok', (await control.getByRole('button', { name: 'Kart olarak koy' }).count()) === 0)

  // --- Seçim çerçevesi süslerle bozulmaz ---
  await session.send({ type: 'stage/removeItem', sceneId, itemId: plain.id })
  await session.send({ type: 'stage/updateItem', sceneId, itemId: cardB.id, patch: { x: 1300, y: 100 } })
  const moved = await session.item(cardA.id)
  await session.click(moved.x + moved.width / 2, moved.y + moved.height / 2)
  const node = await session.nodeOf(cardA.id)
  const frame = await session.frame()
  check('kartın kutusu durumdaki kutuyla aynı', near(node.rect.width / frame.scale, moved.width, 2) && near(node.rect.height / frame.scale, moved.height, 2), show(node.rect))

  // --- Sürükleme ve boyutlandırma ---
  const center = [moved.x + moved.width / 2, moved.y + moved.height / 2]
  await session.drag(center, [center[0] - 200, center[1] + 40])
  const dragged = await session.item(cardA.id)
  check('kart fareyle taşınır', near(dragged.x, moved.x - 200, 3) && near(dragged.y, moved.y + 40, 3), show(dragged))
  await session.drag([dragged.x + dragged.width, dragged.y + dragged.height], [dragged.x + dragged.width - 60, dragged.y + dragged.height - 84])
  const resized = await session.item(cardA.id)
  check('kart köşeden küçülür, oranı kartınkidir', resized.width < dragged.width && near(resized.width / resized.height, CARD_RATIO, 0.01), show(resized))
  await session.drag([resized.x + resized.width, resized.y + resized.height], [resized.x + resized.width + 200, resized.y + resized.height + 280])
  const grown = await session.item(cardA.id)
  check('kart köşeden büyür, oranı kartınkidir', grown.width > resized.width + 150 && near(grown.width / grown.height, CARD_RATIO, 0.01), show(grown))
  const grownNode = await session.nodeOf(cardA.id)
  const grownFit = await session.frame()
  check('büyüyünce çizim kutuyla birlikte büyür', near(grownNode.rect.width / grownFit.scale, grown.width, 3) && near(grownNode.rect.height / grownFit.scale, grown.height, 3), show(grownNode.rect))
  await session.shot('kartlar-buyuk.png')
  await session.drag([grown.x + grown.width, grown.y + grown.height], [grown.x + 10, grown.y + 10])
  const smallest = await session.item(cardA.id)
  check('en küçük boyutta durur, kaybolmaz', smallest.width >= 40 && near(smallest.width / smallest.height, CARD_RATIO, 0.01), show(smallest))
  await session.send({ type: 'stage/updateItem', sceneId, itemId: cardA.id, patch: { width: moved.width } })

  // --- Can ---
  // Liste en üstteki öğeyle başlar; ilk konan kart sondadır.
  const first = control.locator('.ctl-stage__row').filter({ has: control.locator('.ctl-stage-card') }).last()
  check('can hep görünür, ad ve çerçeve "Düzenle"nin arkasındadır', (await first.getByLabel('Kartın adı').count()) === 0)
  await first.getByRole('button', { name: 'Kartın canını 1 azalt' }).click()
  await first.getByLabel('Can hızlı giriş').fill('-3')
  await first.getByLabel('Can hızlı giriş').press('Enter')
  await sleep(200)
  check('−1 ve "-3" canı düşürür', (await session.item(cardA.id)).card.hp === 6, show((await session.item(cardA.id)).card))
  check('öbür kopyanın canı değişmez', (await session.item(cardB.id)).card.hp === 10)
  const shownTexts = (await session.probe('labels')).map((entry) => entry.text)
  check('oyun ekranında can sayıyla ve "CAN" yazısıyla görünür', shownTexts.includes('6 / 10') && shownTexts.includes('CAN'), show(shownTexts))
  check('kartta etiket yerine ad ve seviye var', shownTexts.includes('Goblin') && shownTexts.includes('1 LVL'), show(shownTexts))

  await first.getByRole('button', { name: 'Düzenle' }).click()
  await first.getByLabel('Kartın adı').fill('Goblin Şefi')
  await first.getByLabel('Kartın adı').press('Enter')
  await sleep(200)
  check('ad panelden değişir', (await session.item(cardA.id)).card.name === 'Goblin Şefi', show((await session.item(cardA.id)).card))
  await first.getByLabel('En yüksek can').fill('60')
  await first.getByLabel('En yüksek can').press('Enter')
  await sleep(200)
  check('en yüksek can yazılır, yaralı kartın canı değişmez', (await session.item(cardA.id)).card.maxHp === 60 && (await session.item(cardA.id)).card.hp === 6)

  // --- Düz görsele çevirme ve geri ---
  await first.getByRole('button', { name: 'Düz görsel yap' }).click()
  await sleep(200)
  const flat = await session.item(cardA.id)
  check('kart düz görsele döner', flat.card === undefined && near(flat.width / flat.height, 2, 0.01), show(flat))
  const flatRow = control.locator('.ctl-stage__row').filter({ has: control.getByRole('button', { name: 'Karta çevir' }) })
  await flatRow.getByRole('button', { name: 'Karta çevir' }).click()
  await sleep(200)
  check('düz görsel karta döner, bilgileri görselden gelir', (await session.item(cardA.id)).card?.maxHp === 60, show((await session.item(cardA.id)).card))

  // --- Can 0 ---
  await session.send({ type: 'stage/adjustCardHp', sceneId, itemId: cardB.id, delta: -99 })
  check('can 0 olur', (await session.item(cardB.id)).card.hp === 0)
  await session.shot('kartlar-dusman.png')

  // --- Beş boss çerçevesi ---
  await session.send({ type: 'stage/clearItems', sceneId })
  const frames = ['shadow', 'radiant', 'blood', 'frost', 'venom']
  for (const [index, name] of frames.entries()) {
    const itemId = uuid()
    await session.send({ type: 'stage/addItem', sceneId, fallbackSceneId: sceneId, itemId, imageId: dragon.id, asCard: true })
    await session.send({ type: 'stage/updateCard', sceneId, itemId, patch: { name: `Ejderha ${name}`, level: 20 + index, maxHp: 240, frame: name } })
    await session.send({ type: 'stage/adjustCardHp', sceneId, itemId, delta: -45 })
    const placed = await session.item(itemId)
    await session.send({ type: 'stage/updateItem', sceneId, itemId, patch: { x: 310 + index * 320, y: 280, width: 310 } })
    const bossNode = await session.nodeOf(itemId)
    const fit = await session.frame()
    check(`${name}: süsler kartın kutusunu aşmaz`, near(bossNode.rect.width / fit.scale, 310, 3) && near(bossNode.rect.height / fit.scale, 434, 3), show(bossNode.rect))
    check(`${name}: çerçeve kaydedildi`, (await session.item(itemId)).card.frame === name && placed.card.hp === 195)
  }
  await session.shot('kartlar-boss.png')
  await sleep(100)
  const bossRow = control.locator('.ctl-stage__row').filter({ has: control.locator('.ctl-stage-card') }).first()
  await bossRow.getByRole('button', { name: 'Düzenle' }).click()
  const options = await bossRow.getByLabel('Boss çerçevesi').locator('option').allTextContents()
  check('panelde beş boss çerçevesi seçilir', show(options) === show(['Gölge', 'Işık', 'Kan', 'Buz', 'Zehir']), show(options))
  await control.screenshot({ path: join(shotDir, 'kartlar-panel.png') })

  const problems = session.problems.filter((text) => !text.includes('Autofill'))
  check('pencerelerde hata yok', problems.length === 0, show(problems.slice(0, 4)))

  // --- Yeniden açılış ---
  const before = (await session.scene()).items.map((item) => item.card)
  const { dataDir } = session
  await session.close()
  const again = await open('kartlar-2', { dataDir })
  const state = await again.state()
  const after = state.app.scenes[0].items.map((item) => item.card)
  check('kartlar kayıttan aynı açılır', show(before) === show(after), show(after[0]))
  info('oyun ekranı görüntüleri: e2e/.cikti/oyun/kartlar-*.png')
})
