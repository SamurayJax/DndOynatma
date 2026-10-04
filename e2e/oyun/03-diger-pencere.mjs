// Oyun ekranı meşgulken kontrol panelinden gelen değişiklikler: seçili ya da sürüklenen görselin
// silinmesi / sırasının / etiketinin / yerinin değişmesi, sürüklerken pencere değişimi, oyuncu
// bilgilerinin değişmesi, portre sütununun belirip kaybolması (oyun alanı daralır / genişler).
// Çalıştırma: node e2e/oyun/03-diger-pencere.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addItem, addScene, check, COLUMN_W, info, near, open, run, setBackground, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

function logText(dataDir) {
  const dir = join(dataDir, 'log')
  if (!existsSync(dir)) return ''
  return readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8')).join('')
}
const countOf = (text, needle) => text.split(needle).length - 1

await run(async () => {
  const session = await open('diger-pencere')
  const paths = writeImages(session.sampleDir, ['arka', 'karakter', 'jeton', 'yesil', 'portre', 'portre2'])
  const place = await session.importImage('place', paths.arka)
  const enemy = await session.importImage('enemy', paths.karakter)
  const token = await session.importImage('item', paths.jeton)
  const green = await session.importImage('npc', paths.yesil)
  await session.importPortrait(0, paths.portre)
  await session.send({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } }, 0)
  await session.send({ type: 'player/update', slot: 1, patch: { name: 'Jasper', level: 3 } }, 0)

  const s1 = await addScene(session, 'Bir', 1)
  const s2 = await addScene(session, 'İki', 2)
  const bg = await setBackground(session, s1, place.id)
  const a = await addItem(session, s1, enemy.id, { x: 500, y: 200, width: 200, label: 'Kurt' })
  const b = await addItem(session, s1, green.id, { x: 900, y: 300, width: 200, label: 'Yeşil' })
  const c = await addItem(session, s1, token.id, { x: 1300, y: 300, width: 200 })
  const d = await addItem(session, s2, token.id, { x: 800, y: 400, width: 200 })
  await session.send({ type: 'scene/setActive', sceneId: s1 }, 0)

  await session.start({ size: [1280, 720] })
  const { game } = session
  await sleep(500)

  const centerOf = async (itemId) => {
    const item = await session.item(itemId, s1)
    return [item.x + item.width / 2, item.y + item.height / 2]
  }
  const order = async () => (await session.state()).app.scenes.find((scene) => scene.id === s1).items.map((item) => item.id)
  const selected = async () => {
    const transformer = await session.probe('transformer')
    return transformer?.shown ? transformer.ids[0] : null
  }
  /** Görselin ekrandaki sol üst köşesi, sanal koordinatla. */
  const screenPos = async (itemId) => {
    const node = await session.nodeOf(itemId)
    return node ? session.toVirtual(node.rect.x, node.rect.y) : null
  }
  const labelOf = async (text) => (await session.probe('labels')).find((entry) => entry.text === text) ?? null

  // --- Seçiliyken: etiket, sıra, silme ---
  {
    await session.click(...(await centerOf(a)))
    check('görsel seçildi', (await selected()) === a)
    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: a, patch: { label: 'Alfa Kurt' } }, 250)
    const label = await labelOf('Alfa Kurt')
    const node = await session.nodeOf(a)
    check('seçiliyken etiketi değişti: yeni etiket görselin altında, seçim duruyor', label !== null && (await selected()) === a && near(label.rect.x + label.rect.width / 2, node.rect.x + node.rect.width / 2, 2))

    await session.send({ type: 'stage/reorderItem', sceneId: s1, itemId: a, to: 'front' }, 250)
    check('seçiliyken sırası değişti: seçim aynı görselde', (await selected()) === a && (await order()).at(-1) === a)
    await game.keyboard.press('End')
    await sleep(250)
    check('sıra değiştikten sonra klavye seçili görsele etki ediyor (End)', (await order())[0] === a)

    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: a, patch: { x: 420, y: 260 } }, 250)
    const moved = await screenPos(a)
    const transformer = await session.probe('transformer')
    const nodeAfter = await session.nodeOf(a)
    check(
      'seçiliyken başka pencereden taşındı: görsel ve seçim çerçevesi yeni yerde',
      near(moved[0], 420, 1) && near(moved[1], 260, 1) && near(transformer.anchors['top-left'].x, nodeAfter.rect.x, 2) && near(transformer.anchors['top-left'].y, nodeAfter.rect.y, 2),
      show(moved)
    )

    const logBefore = logText(session.dataDir)
    await session.send({ type: 'stage/removeItem', sceneId: s1, itemId: a }, 300)
    check('seçiliyken silindi: görsel ve seçim çerçevesi kalktı', (await session.nodeOf(a)) === null && (await selected()) === null)
    await game.keyboard.press('Delete')
    await game.keyboard.press('Home')
    await sleep(250)
    const logAfter = logText(session.dataDir)
    check('silinen seçim için klavye işlem göndermiyor', (await order()).length === 2 && countOf(logAfter, 'DND-302') === countOf(logBefore, 'DND-302'), `öğe: ${(await order()).length}`)
  }

  // --- Sürüklenirken: etiket, sıra, yer ---
  {
    const start = await centerOf(b)
    const item = await session.item(b)
    await session.drag(start, [start[0] + 200, start[1] + 100], { hold: true })
    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: b, patch: { label: 'Sürüklenen' } }, 250)
    let pos = await screenPos(b)
    check('sürüklenirken etiketi değişti: görsel imlecin altında kaldı', near(pos[0], item.x + 200, 1.5) && near(pos[1], item.y + 100, 1.5) && (await session.nodeOf(b)).dragging, show(pos))
    {
      const label = await labelOf('Sürüklenen')
      const node = await session.nodeOf(b)
      check('sürüklenirken değişen etiket görselin altında (eski yerde değil)', label !== null && near(label.rect.x + label.rect.width / 2, node.rect.x + node.rect.width / 2, 2), label ? show([label.rect.x + label.rect.width / 2, node.rect.x + node.rect.width / 2]) : 'etiket yok')
    }

    await session.send({ type: 'stage/reorderItem', sceneId: s1, itemId: b, to: 'front' }, 250)
    await session.moveTo(start[0] + 260, start[1] + 140)
    pos = await screenPos(b)
    check('sürüklenirken sırası değişti: sürükleme sürüyor', near(pos[0], item.x + 260, 1.5) && near(pos[1], item.y + 140, 1.5) && (await session.nodeOf(b)).dragging, show(pos))

    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: b, patch: { x: 400, y: 700 } }, 250)
    await session.moveTo(start[0] + 300, start[1] + 160)
    pos = await screenPos(b)
    check('sürüklenirken başka pencereden taşındı: görsel yine imlecin altında', near(pos[0], item.x + 300, 1.5) && near(pos[1], item.y + 160, 1.5), show(pos))
    await session.release()
    const dropped = await session.item(b)
    check('bırakınca son söz sürükleyenin: durum bırakılan yer, etiket yeni', near(dropped.x, item.x + 300, 1.5) && near(dropped.y, item.y + 160, 1.5) && dropped.label === 'Sürüklenen' && (await order()).at(-1) === b, show([dropped.x, dropped.y]))
    await sleep(1700)
    pos = await screenPos(b)
    check('bıraktıktan sonra görsel yerinde duruyor (geri sıçrama yok)', near(pos[0], dropped.x, 1) && near(pos[1], dropped.y, 1), show(pos))
  }

  // --- Sürüklenirken silinme ---
  {
    const logBefore = logText(session.dataDir)
    const start = await centerOf(c)
    await session.drag(start, [start[0] + 60, start[1] + 60], { hold: true })
    await session.send({ type: 'stage/removeItem', sceneId: s1, itemId: c }, 300)
    check('sürüklenirken silindi: görsel kalktı', (await session.nodeOf(c)) === null && (await selected()) === null)
    await session.moveTo(start[0] + 120, start[1] + 90)
    await session.release()
    const logAfter = logText(session.dataDir)
    check('silinen görsel için bırakınca işlem gönderilmedi', countOf(logAfter, 'DND-302') === countOf(logBefore, 'DND-302') && (await order()).length === 1)
    // Sürükleme durumu takılı kalmamalı: sonraki sürükleme olağan çalışır.
    const from = await centerOf(b)
    const before = await session.item(b)
    await session.drag(from, [from[0] - 150, from[1] - 80])
    const after = await session.item(b)
    check('ardından başka görsel olağan sürükleniyor', near(after.x, before.x - 150, 1.5) && near(after.y, before.y - 80, 1.5), show([after.x - before.x, after.y - before.y]))
  }

  // --- Sürüklerken pencere değişimi ---
  {
    const before = await session.item(b)
    const from = await centerOf(b)
    await session.drag(from, [from[0] + 180, from[1] + 40], { hold: true })
    await session.send({ type: 'scene/setActive', sceneId: s2 }, 400)
    const nodes = await session.probe('items')
    check('sürüklerken pencere değişti: yeni pencerenin görseli çizildi', nodes.length === 1 && nodes[0].id === d, show(nodes.map((node) => node.id)))
    await session.moveTo(from[0] + 300, from[1] + 200)
    const other = await session.item(d, s2)
    check('yeni penceredeki görsel fareyle sürüklenmiyor (tuş hâlâ basılı)', near(other.x, 800, 0.01) && !(await session.nodeOf(d)).dragging)
    await session.release()
    await session.send({ type: 'scene/setActive', sceneId: s1 }, 400)
    const after = await session.item(b)
    const pos = await screenPos(b)
    const kept = near(after.x, before.x, 0.01) && near(after.y, before.y, 0.01)
    const carried = near(after.x, before.x + 180, 1.5) && near(after.y, before.y + 40, 1.5)
    info(`sürüklerken pencere değişince görsel: ${kept ? 'eski yerinde kaldı' : carried ? 'pencere değiştiği andaki yerine yazıldı' : `beklenmeyen yerde ${show([after.x, after.y])}`}`)
    check('pencere değişimiyle yarıda kalan sürükleme tutarlı bitti', (kept || carried) && near(pos[0], after.x, 1) && near(pos[1], after.y, 1))
    await session.moveTo(from[0], from[1] + 300)
    await sleep(150)
    check('geri dönünce görsel fareye yapışık değil', near((await screenPos(b))[0], after.x, 1) && !(await session.nodeOf(b)).dragging)
  }

  // --- Oyuncu bilgileri sütun görünürken değişiyor ---
  {
    const cards = () =>
      game.evaluate(() =>
        [...document.querySelectorAll('.game-card')].map((card) => ({
          down: card.classList.contains('is-down'),
          name: card.querySelector('.game-card__name').textContent,
          level: card.querySelector('.game-card__level').textContent,
          filled: card.querySelectorAll('.game-card__pip.is-filled').length,
          src: card.querySelector('.game-card__img')?.src ?? null,
          loaded: (card.querySelector('.game-card__img')?.naturalWidth ?? 0) > 0,
          initial: card.querySelector('.game-card__initial')?.textContent ?? null
        }))
      )
    const first = (await cards())[0]
    await session.send({ type: 'player/setHp', slot: 0, hp: 0 }, 0)
    await session.send({ type: 'player/update', slot: 0, patch: { name: 'Kenji Çelikkol', level: 99 } }, 0)
    await session.send({ type: 'player/adjustHp', slot: 1, delta: -4 }, 250)
    let now = await cards()
    check('can 0: kart soluk, kutucuk boş', now[0].down && now[0].filled === 0)
    check('isim ve seviye anında değişti', now[0].name === 'Kenji Çelikkol' && now[0].level === '99 LVL', show(now[0]))
    check('diğer oyuncunun canı değişti', now[1].filled === 6 && !now[1].down)
    await session.importPortrait(0, paths.portre2)
    await sleep(400)
    now = await cards()
    check('portre değişti ve yüklendi', now[0].src !== first.src && now[0].loaded, show([first.src, now[0].src]))
    await session.send({ type: 'player/update', slot: 0, patch: { portraitId: null } }, 250)
    now = await cards()
    check('portre kaldırılınca baş harf görünüyor', now[0].src === null && now[0].initial === 'K')
    await session.send({ type: 'player/setHp', slot: 0, hp: 10 }, 0)
  }

  // --- Portre sütunu kayboluyor / beliriyor ---
  {
    await session.send({ type: 'player/clear', slot: 0 }, 0)
    await session.send({ type: 'player/clear', slot: 1 }, 300)
    check('dolu kart kalmayınca sütun kalktı', (await game.locator('.game-portraits').count()) === 0)
    let background = await session.item(bg)
    check('alan genişleyince dokunulmamış arka plan bütün sahneyi doldurdu', near(background.x, 0, 0.01) && near(background.width, 1920, 0.01), show(background))
    const left = await session.colorAt(40, 540)
    check('eski sütunun yerinde arka plan görseli çizili', left[0] > 60 && left[0] > left[2], show(left))

    // Sütun yokken görsel sol kenara konur; ilk kart dolunca sütunun altında kalmamalı.
    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: b, patch: { x: 0, y: 400 } }, 250)
    check('sütun yokken görsel sol kenarda', near((await screenPos(b))[0], 0, 1))
    await session.send({ type: 'player/update', slot: 2, patch: { name: 'Mira' } }, 350)
    check('ilk kart dolunca sütun belirdi', (await game.locator('.game-portraits').count()) === 1)
    const item = await session.item(b)
    const pos = await screenPos(b)
    check('sütunun altında kalan görsel oyun alanının kenarına çekildi', near(item.x + item.width / 2, COLUMN_W, 0.01) && near(pos[0], item.x, 1), `merkez x=${(item.x + item.width / 2).toFixed(1)}, ekranda x=${pos[0].toFixed(1)}`)
    background = await session.item(bg)
    check('alan daralınca arka plan yeniden ortalandı', near(background.x, 150, 0.01) && near(background.width, 1920, 0.01), show(background))
    // Görünen yarısından tutulup taşınabiliyor.
    await session.drag([COLUMN_W + 50, item.y + 100], [COLUMN_W + 450, item.y + 100])
    const moved = await session.item(b)
    check('kenara çekilen görsel tutulup taşınabiliyor', near(moved.x, item.x + 400, 1.5), show([moved.x, moved.y]))

    // Sürüklerken sütun beliriyor.
    await session.send({ type: 'player/clear', slot: 2 }, 300)
    const from = await centerOf(b)
    await session.drag(from, [120, from[1]], { hold: true })
    check('sütun yokken sol kenara sürüklenebiliyor', near((await screenPos(b))[0] + moved.width / 2, 120, 1.5))
    await session.send({ type: 'player/update', slot: 0, patch: { name: 'Kenji' } }, 350)
    await session.moveTo(121, from[1] + 1)
    const during = await screenPos(b)
    check('sürüklerken sütun belirdi: görsel oyun alanının kenarında tutuldu', near(during[0] + moved.width / 2, COLUMN_W, 1.5), `merkez x=${(during[0] + moved.width / 2).toFixed(1)}`)
    await session.release()
    const dropped = await session.item(b)
    check('bırakınca durum da oyun alanının içinde', near(dropped.x + dropped.width / 2, COLUMN_W, 0.6), `merkez x=${(dropped.x + dropped.width / 2).toFixed(1)}`)
    await sleep(1700)
    check('sonradan yerinden oynamadı', near((await screenPos(b))[0], dropped.x, 1))
  }

  // --- Köşeden boyutlandırılırken: etiket değişimi ve silinme ---
  {
    await session.send({ type: 'scene/setActive', sceneId: s2 }, 400)
    await session.click(900, 500)
    const corner = (await session.probe('transformer')).anchors['bottom-right']
    check('ikinci penceredeki görsel seçildi', (await selected()) === d && corner !== undefined)
    await game.mouse.move(corner.x, corner.y)
    await game.mouse.down()
    for (let i = 1; i <= 6; i++) await game.mouse.move(corner.x + i * 10, corner.y + i * 10)
    await session.send({ type: 'stage/updateItem', sceneId: s2, itemId: d, patch: { label: 'Büyüyen' } }, 250)
    const label = await labelOf('Büyüyen')
    const node = await session.nodeOf(d)
    check(
      'boyutlanırken etiketi değişti: etiket büyüyen kutunun altında',
      label !== null && near(label.rect.x + label.rect.width / 2, node.rect.x + node.rect.width / 2, 2) && label.rect.y >= node.rect.y + node.rect.height,
      label ? show([label.rect, node.rect]) : 'etiket yok'
    )
    const logBefore = logText(session.dataDir)
    await session.send({ type: 'stage/removeItem', sceneId: s2, itemId: d }, 300)
    await game.mouse.move(corner.x + 90, corner.y + 90)
    await session.release()
    check('boyutlanırken silindi: görsel ve tutamaçlar kalktı, işlem gönderilmedi', (await session.probe('items')).length === 0 && (await selected()) === null && countOf(logText(session.dataDir), 'DND-302') === countOf(logBefore, 'DND-302'))
    await session.send({ type: 'scene/setActive', sceneId: s1 }, 300)
  }

  await session.shot('diger-pencere-son.png')
  check('sayfa hatası yok', session.problems.length === 0, session.problems.join(' | '))
  await session.close()
})
