// Görsel esnetme (1.2.0): kenar tutamaçları yalnızca o yönde esnetir, köşeler o anki oranı korur;
// "Oranı düzelt" kendi oranına döndürür; kartta yazılar basılmaz.
// Çalıştırma: node e2e/oyun/12-esnetme.mjs
import { join } from 'node:path'
import { addItem, addScene, check, info, near, open, run, setBackground, shotDir, show, sleep, uuid } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const ratioOf = (box) => box.width / box.height

await run(async () => {
  const session = await open('esnetme')
  const paths = writeImages(session.sampleDir, ['karakter', 'arka'])
  const figure = await session.importImage('enemy', paths.karakter)
  const backdrop = await session.importImage('place', paths.arka)
  const natural = figure.width / figure.height
  const sceneId = await addScene(session, 'Esnet')
  await session.send({ type: 'scene/setActive', sceneId })
  await session.start()
  const { control, game } = session
  const itemId = await addItem(session, sceneId, figure.id, { x: 700, y: 200, width: 400 })
  await sleep(200)

  const select = async (id) => {
    const box = await session.item(id)
    await session.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  /** Tutamacı sanal koordinatta verilen kadar sürükler. */
  const dragAnchor = async (name, dx, dy) => {
    const anchors = (await session.probe('transformer')).anchors
    const anchor = anchors[name]
    const [X, Y] = await session.toVirtual(anchor.x, anchor.y)
    await session.drag([X, Y], [X + dx, Y + dy])
  }

  // --- Kenarlar yalnızca o yönde ---
  await select(itemId)
  const start = await session.item(itemId)
  const anchorCount = Object.keys((await session.probe('transformer')).anchors).length
  check('seçim çerçevesinde sekiz tutamaç var', anchorCount === 8, String(anchorCount))
  check('kendi oranındayken "Oranı düzelt" görünmez', (await control.getByRole('button', { name: 'Oranı düzelt' }).count()) === 0)

  await dragAnchor('middle-right', 200, 0)
  const wider = await session.item(itemId)
  check('sağ kenar yalnızca genişliği değiştirir, sol kenar yerinde', near(wider.width, start.width + 200, 4) && near(wider.height, start.height, 1) && near(wider.x, start.x, 3) && near(wider.y, start.y, 1), show(wider))
  const widerNode = await session.nodeOf(itemId)
  const fit = await session.frame()
  check('görsel de kutuyla birlikte esner', near(widerNode.rect.width / fit.scale, wider.width, 3) && near(widerNode.rect.height / fit.scale, wider.height, 3), show(widerNode.rect))
  check('esneyince "Oranı düzelt" görünür', (await control.getByRole('button', { name: 'Oranı düzelt' }).count()) === 1)

  await dragAnchor('bottom-center', 0, 120)
  const taller = await session.item(itemId)
  check('alt kenar yalnızca yüksekliği değiştirir', near(taller.height, wider.height + 120, 4) && near(taller.width, wider.width, 1), show(taller))

  // --- Köşe o anki oranı korur ---
  const stretched = ratioOf(taller)
  await dragAnchor('bottom-right', -80, -80 / stretched)
  const corner = await session.item(itemId)
  check('köşe o anki (esnemiş) oranı korur, kendi oranına sıçramaz', corner.width < taller.width && near(ratioOf(corner), stretched, 0.02), `${ratioOf(corner).toFixed(3)} / ${stretched.toFixed(3)}`)

  // --- Üste ve sola ---
  await dragAnchor('middle-left', -60, 0)
  const left = await session.item(itemId)
  check('sol kenar sola doğru esnetir, sağ kenar yerinde', near(left.x + left.width, corner.x + corner.width, 4) && near(left.width, corner.width + 60, 4), show(left))

  // --- Döndürülmüş görsel ---
  await session.send({ type: 'stage/updateItem', sceneId, itemId, patch: { rotation: 90 } })
  await sleep(200)
  const rotatedBefore = await session.item(itemId)
  await dragAnchor('middle-right', 0, 80)
  const rotated = await session.item(itemId)
  check('döndürülmüş görselde kenar kendi ekseninde esnetir', near(rotated.width, rotatedBefore.width + 80, 6) && near(rotated.height, rotatedBefore.height, 2) && rotated.rotation === 90, show(rotated))
  await session.send({ type: 'stage/updateItem', sceneId, itemId, patch: { rotation: 0 } })

  // --- Oranı düzelt ---
  await session.shot('esnetme-esnemis.png')
  const before = await session.item(itemId)
  await control.getByRole('button', { name: 'Oranı düzelt' }).click()
  await sleep(250)
  const fixed = await session.item(itemId)
  check('"Oranı düzelt" kendi oranına döndürür', near(ratioOf(fixed), natural, 0.01), `${ratioOf(fixed).toFixed(3)} / ${natural.toFixed(3)}`)
  check('merkez yerinde, kapladığı alan yakın', near(fixed.x + fixed.width / 2, before.x + before.width / 2, 2) && near(fixed.y + fixed.height / 2, before.y + before.height / 2, 2) && near(fixed.width * fixed.height, before.width * before.height, before.width * before.height * 0.01), show(fixed))
  check('düzelince düğme kalkar', (await control.getByRole('button', { name: 'Oranı düzelt' }).count()) === 0)

  // --- En küçük boyut ---
  await select(itemId)
  await dragAnchor('middle-right', -fixed.width - 300, 0)
  const thin = await session.item(itemId)
  check('kenarla en fazla alt sınıra kadar daralır', thin.width >= 40 && thin.width < 60 && near(thin.height, fixed.height, 1), show(thin))
  await session.send({ type: 'stage/removeItem', sceneId, itemId })

  // --- Arka plan ---
  const backgroundId = await setBackground(session, sceneId, backdrop.id)
  await session.send({ type: 'stage/updateItem', sceneId, itemId: backgroundId, patch: { width: 900, height: 900 } })
  await sleep(200)
  check('arka plan da esner ve düğmesi çıkar', (await control.getByRole('button', { name: 'Oranı düzelt' }).count()) === 1)
  await control.getByRole('button', { name: 'Oranı düzelt' }).click()
  await sleep(250)
  const cover = (await session.scene()).background
  check('arka plan düzelince oyun alanını kaplar', near(ratioOf(cover), backdrop.width / backdrop.height, 0.01) && cover.width >= 1919 && cover.height >= 1079, show(cover))
  await session.send({ type: 'stage/clearBackground', sceneId })

  // --- Kart ---
  const cardId = uuid()
  await session.send({ type: 'stage/addItem', sceneId, fallbackSceneId: sceneId, itemId: cardId, imageId: figure.id, asCard: true })
  await session.send({ type: 'stage/updateCard', sceneId, itemId: cardId, patch: { name: 'Geniş Goblin', level: 7, maxHp: 60 } })
  await session.send({ type: 'stage/updateItem', sceneId, itemId: cardId, patch: { x: 500, y: 150, width: 300 } })
  await select(cardId)
  const scales = () =>
    game.evaluate(() => {
      const container = document.querySelector('.konvajs-content').parentElement
      const key = Object.keys(container).find((name) => name.startsWith('__reactFiber$'))
      let stage = null
      for (let fiber = container[key]; fiber && !stage; fiber = fiber.return) {
        let hook = fiber.memoizedState
        for (let i = 0; hook && typeof hook === 'object' && i < 40; i++, hook = hook.next) {
          const current = hook.memoizedState?.current
          if (current && typeof current.getLayers === 'function') stage = current
        }
      }
      const text = stage.find('Text').find((node) => node.text() === 'Geniş Goblin')
      const scale = text.getAbsoluteScale()
      return { x: scale.x, y: scale.y, width: text.width() }
    })
  const beforeCard = await session.item(cardId)
  await dragAnchor('middle-right', 500, 0)
  const wideCard = await session.item(cardId)
  check('kart yatay esner', near(wideCard.width, beforeCard.width + 500, 6) && near(wideCard.height, beforeCard.height, 1), show(wideCard))
  const wideScale = await scales()
  check('geniş kartta yazı yatay basılmaz (x ve y ölçeği aynı)', near(wideScale.x, wideScale.y, 0.001), show(wideScale))
  const wideNode = await session.nodeOf(cardId)
  const cardFit = await session.frame()
  check('süsler ve çizim kartın kutusunda', near(wideNode.rect.width / cardFit.scale, wideCard.width, 3) && near(wideNode.rect.height / cardFit.scale, wideCard.height, 3), show(wideNode.rect))
  await session.shot('esnetme-kart-genis.png')

  // Boss: süsler ve taç esnemiş kartta da kutunun içinde.
  const bossImage = await session.importImage('boss', paths.karakter)
  const bossId = uuid()
  await session.send({ type: 'stage/addItem', sceneId, fallbackSceneId: sceneId, itemId: bossId, imageId: bossImage.id, asCard: true })
  await session.send({ type: 'stage/updateCard', sceneId, itemId: bossId, patch: { name: 'Uzun Boss', frame: 'frost', maxHp: 500 } })
  await session.send({ type: 'stage/updateItem', sceneId, itemId: bossId, patch: { x: 1400, y: 20, width: 280, height: 900 } })
  await sleep(200)
  const bossNode = await session.nodeOf(bossId)
  check('dikey esnemiş boss kartı kutusunda kalır', near(bossNode.rect.width / cardFit.scale, 280, 3) && near(bossNode.rect.height / cardFit.scale, 900, 3), show(bossNode.rect))
  await session.shot('esnetme-kartlar.png')
  await control.screenshot({ path: join(shotDir, 'esnetme-panel.png') })

  const row = control.locator('.ctl-stage__row').filter({ hasText: 'Geniş Goblin' })
  await row.getByRole('button', { name: 'Oranı düzelt' }).click()
  await sleep(250)
  const fixedCard = await session.item(cardId)
  check('kartta "Oranı düzelt" kart oranına döndürür', near(ratioOf(fixedCard), 300 / 420, 0.01), show(fixedCard))

  const problems = session.problems.filter((text) => !text.includes('Autofill'))
  check('pencerelerde hata yok', problems.length === 0, show(problems.slice(0, 4)))

  // --- Yeniden açılış ---
  await session.send({ type: 'stage/updateItem', sceneId, itemId: cardId, patch: { width: 500, height: 300 } })
  const saved = await session.item(cardId)
  const { dataDir } = session
  await session.close()
  const again = await open('esnetme-2', { dataDir })
  const reopened = (await again.state()).app.scenes[0].items.find((item) => item.id === cardId)
  check('esnemiş boyut kayıttan aynı açılır', reopened.width === saved.width && reopened.height === saved.height, show(reopened))
  info('oyun ekranı görüntüleri: e2e/.cikti/oyun/esnetme-*.png')
})
