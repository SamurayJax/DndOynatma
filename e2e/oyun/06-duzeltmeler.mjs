// Faz 1 düzeltmeleri: görsel döndürme (R tuşu, kontrol paneli düğmesi, döndürme tutamacı, arka plan),
// kalem çizimlerinin fareye ve başka pencereye geçince silinmemesi (yalnızca "Çizimi temizle" siler),
// oyun ekranı ve kontrol paneli için monitör seçimi.
// Çalıştırma: node e2e/oyun/06-duzeltmeler.mjs
import { addItem, addScene, check, info, near, open, run, setBackground, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const isDark = ([r, g, b]) => r < 70 && g < 70 && b < 80
const isLight = ([r, g, b]) => r > 200 && g > 200 && b > 190

await run(async () => {
  const session = await open('duzeltmeler')
  // `portre`: sol yarısı koyu, sağ yarısı açık kare; hangi yöne döndüğü pikselden okunur.
  const paths = writeImages(session.sampleDir, ['arka', 'portre', 'karakter'])
  const place = await session.importImage('place', paths.arka)
  const split = await session.importImage('enemy', paths.portre)
  const tall = await session.importImage('npc', paths.karakter)

  const s1 = await addScene(session, 'Bir', 1)
  const s2 = await addScene(session, 'İki', 2)
  const bg = await setBackground(session, s1, place.id)
  const a = await addItem(session, s1, split.id, { x: 700, y: 300, width: 400, label: 'Kurt' })
  const b = await addItem(session, s1, tall.id, { x: 1400, y: 200, width: 200 })
  await session.send({ type: 'scene/setActive', sceneId: s1 }, 0)

  // --- Monitörler (oyun başlamadan, otomatik ayarla) ---
  const displays = await session.displays()
  /** Pencerenin hangi monitörde durduğu. */
  const windowDisplay = async (page) => {
    const win = await session.app.browserWindow(page)
    const bounds = await win.evaluate((w) => w.getBounds())
    return session.app.evaluate(({ screen }, b) => screen.getDisplayMatching(b).id, bounds)
  }

  await session.start({ size: [1280, 720] })
  const { game, control } = session
  await sleep(400)

  if (displays.length >= 2) {
    const largest = [...displays].sort((x, y) => y.width * y.height - x.width * x.height)[0]
    const gameDisplay = await windowDisplay(game)
    const controlDisplay = await windowDisplay(control)
    check('otomatik: oyun ekranı en büyük monitörde açıldı', gameDisplay === largest.id, `${largest.label}`)
    check('otomatik: kontrol paneli diğer monitörde açıldı', controlDisplay !== gameDisplay)
  } else {
    info('tek monitör var; monitör seçimi denetimleri atlandı')
  }

  const selected = async () => {
    const transformer = await session.probe('transformer')
    return transformer?.shown ? transformer.ids[0] : null
  }
  const centerOf = async (itemId) => {
    const item = await session.item(itemId, s1)
    return [item.x + item.width / 2, item.y + item.height / 2]
  }

  // --- Döndürme: R tuşu ---
  {
    const before = await session.item(a)
    const [cx, cy] = await centerOf(a)
    check('başlangıçta sol yarı koyu, sağ yarı açık', isDark(await session.colorAt(cx - 100, cy)) && isLight(await session.colorAt(cx + 100, cy)))

    await session.click(cx, cy)
    check('görsel seçildi', (await selected()) === a)
    await game.keyboard.press('r')
    await sleep(350)
    const turned = await session.item(a)
    check('R: açı 90 oldu', turned.rotation === 90, show(turned.rotation))
    check(
      'R: yer ve boyut değişmedi',
      near(turned.x, before.x, 0.01) && near(turned.y, before.y, 0.01) && near(turned.width, before.width, 0.01) && near(turned.height, before.height, 0.01)
    )
    // Saat yönünde çeyrek tur: sol yarı (koyu) üste gelir.
    check('R: görsel ekranda saat yönünde döndü (üst koyu, alt açık)', isDark(await session.colorAt(cx, cy - 100)) && isLight(await session.colorAt(cx, cy + 100)))
    check('R: seçim döndürülen görselde kaldı', (await selected()) === a)

    await game.keyboard.press('r')
    await sleep(300)
    check('R ikinci kez: 180 (görsel ters)', (await session.item(a)).rotation === 180 && isLight(await session.colorAt(cx - 100, cy)) && isDark(await session.colorAt(cx + 100, cy)))

    await game.keyboard.press('Shift+R')
    await sleep(300)
    check('Shift+R: ters yönde çeyrek tur (90)', (await session.item(a)).rotation === 90)
    await game.keyboard.press('Shift+R')
    await sleep(300)
    check('Shift+R: 0, görsel ilk haline döndü', (await session.item(a)).rotation === 0 && isDark(await session.colorAt(cx - 100, cy)))
  }

  // --- Döndürme: kontrol panelindeki düğme ---
  {
    await control.getByRole('button', { name: /portre görselini 90° döndür/ }).click()
    await sleep(350)
    const [cx, cy] = await centerOf(a)
    check('kontrol paneli düğmesi: 90', (await session.item(a)).rotation === 90 && isDark(await session.colorAt(cx, cy - 100)))

    await control.getByRole('button', { name: 'Arka planı 90° döndür' }).click()
    await sleep(350)
    const scene = await session.scene()
    check('arka plan da döndürülebiliyor', scene.background.rotation === 90)
    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: bg, patch: { rotation: 0 } })
  }

  // --- Döndürülmüş görseli taşıma ve boyutlandırma ---
  {
    const before = await session.item(a)
    const from = await centerOf(a)
    await session.drag(from, [from[0] + 150, from[1] - 80])
    const moved = await session.item(a)
    check('döndürülmüş görsel imlecin bıraktığı yere taşındı', near(moved.x, before.x + 150) && near(moved.y, before.y - 80), show([moved.x - before.x, moved.y - before.y]))
    check('taşıma açıyı değiştirmedi', moved.rotation === 90)

    const node = await session.nodeOf(a)
    check('tuvaldeki düğüm durumla aynı yerde ve açıda', near(node.x, moved.x) && near(node.y, moved.y) && near(node.rotation, 90, 0.01), show(node))

    const transformer = await session.probe('transformer')
    const anchor = transformer.anchors['bottom-right']
    const [ax, ay] = await session.toVirtual(anchor.x, anchor.y)
    const [mx, my] = await centerOf(a)
    // Köşeyi merkezden uzağa çek: görsel büyür.
    await session.drag([ax, ay], [ax + (ax - mx) * 0.4, ay + (ay - my) * 0.4])
    const resized = await session.item(a)
    check('döndürülmüş görsel köşeden büyüdü', resized.width > moved.width + 20, show([moved.width, resized.width]))
    check('boyutlandırma oranı korudu (kare görsel kare kaldı)', near(resized.width, resized.height, 0.01))
    check('boyutlandırma açıyı değiştirmedi', resized.rotation === 90)
  }

  // --- Döndürme tutamacı ---
  {
    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: a, patch: { rotation: 0, x: 700, y: 300, width: 400 } })
    const [cx, cy] = await centerOf(a)
    await session.click(cx, cy)
    const handle = await game.evaluate(() => {
      const container = document.querySelector('.konvajs-content').parentElement
      const key = Object.keys(container).find((name) => name.startsWith('__reactFiber$'))
      let stage = null
      for (let fiber = container[key]; fiber && !stage; fiber = fiber.return) {
        let hook = fiber.memoizedState
        for (let i = 0; hook && typeof hook === 'object' && i < 40; i++, hook = hook.next) {
          const current = hook.memoizedState && typeof hook.memoizedState === 'object' && 'current' in hook.memoizedState ? hook.memoizedState.current : null
          if (current && typeof current.getLayers === 'function') stage = current
        }
      }
      const rotater = stage?.findOne('Transformer')?.findOne('.rotater')
      if (!rotater) return null
      const rect = rotater.getClientRect()
      const box = stage.container().getBoundingClientRect()
      return { x: rect.x + rect.width / 2 + box.left, y: rect.y + rect.height / 2 + box.top }
    })
    check('seçili görselde döndürme tutamacı var', handle !== null)
    if (handle !== null) {
      const [hx, hy] = await session.toVirtual(handle.x, handle.y)
      const radius = Math.hypot(hx - cx, hy - cy)
      // Tutamaç görselin üstündedir; merkez etrafında çeyrek tur çevirip sağa getir (yaklaşık 84°: 90'a yapışmalı).
      const path = []
      for (let step = 1; step <= 14; step++) {
        const angle = (-90 + step * 6) * (Math.PI / 180)
        path.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius])
      }
      const [startX, startY] = await session.toClient(hx, hy)
      await game.mouse.move(startX, startY)
      await game.mouse.down()
      for (const [px, py] of path) {
        const [x, y] = await session.toClient(px, py)
        await game.mouse.move(x, y)
      }
      await session.release()
      const rotated = await session.item(a)
      check('tutamaçla döndürme: 84° civarı bırakılınca 90°ye yapıştı', rotated.rotation === 90, show(rotated.rotation))
      check('tutamaçla döndürme merkezin yerini değiştirmedi', near(rotated.x + rotated.width / 2, cx, 1) && near(rotated.y + rotated.height / 2, cy, 1))
    }
  }

  // --- Etiket döndürülmüş görselin altında ---
  {
    // Dikine duran görsel 90° dönünce yatık durur; etiket ekranda kapladığı alanın altına inmeli.
    await session.send({ type: 'stage/updateItem', sceneId: s1, itemId: b, patch: { rotation: 90, label: 'Yatık' } })
    await sleep(300)
    const node = await session.nodeOf(b)
    const label = (await session.probe('labels')).find((entry) => entry.text === 'Yatık')
    check('etiket döndürülmüş görselin altında', label !== undefined && label.rect.y >= node.rect.y + node.rect.height - 1, show({ node: node.rect, label: label?.rect }))
  }

  // --- Kalem: fareye geçince silinmez ---
  const draw = async (from, to) => session.drag(from, to, { steps: 10 })
  {
    await session.send({ type: 'session/setPenColor', color: 'red' })
    await draw([500, 900], [900, 950])
    await draw([520, 980], [880, 1000])
    const drawn = await session.probe('strokes')
    check('kırmızı kalemle iki çizgi çizildi', drawn === 2, show(drawn))

    await session.send({ type: 'session/setTool', tool: 'mouse' })
    await sleep(250)
    check('fareye geçince çizimler SİLİNMEDİ', (await session.probe('strokes')) === 2)

    // Çizim dururken görsel taşınabilmeli.
    const before = await session.item(a)
    const from = await centerOf(a)
    await session.drag(from, [from[0] - 100, from[1] + 40])
    const moved = await session.item(a)
    check('çizim dururken görsel fareyle taşınabiliyor', near(moved.x, before.x - 100) && near(moved.y, before.y + 40), show([moved.x - before.x, moved.y - before.y]))
    check('görsel taşındıktan sonra çizimler yerinde', (await session.probe('strokes')) === 2)

    await session.send({ type: 'session/setPenColor', color: 'black' })
    await draw([1000, 900], [1300, 960])
    check('kaleme dönünce eski çizimlerin üstüne eklenir', (await session.probe('strokes')) >= 3)
  }

  // --- Kalem: çizimler pencereye ait ---
  {
    const first = await session.probe('strokes')
    await session.send({ type: 'scene/activateHotkey', hotkey: 2 })
    await sleep(300)
    check('başka pencereye geçince o pencerenin çizimleri görünür (boş)', (await session.probe('strokes')) === 0)
    await session.send({ type: 'session/setPenColor', color: 'red' })
    await draw([600, 300], [900, 500])
    const second = await session.probe('strokes')
    check('ikinci pencereye de çizilebiliyor', second === 1)

    await session.send({ type: 'scene/activateHotkey', hotkey: 1 })
    await sleep(300)
    check('ilk pencereye dönünce çizimleri geri geldi', (await session.probe('strokes')) === first, show([first, await session.probe('strokes')]))

    // "Çizimi temizle" yalnızca açık pencereyi temizler.
    await session.send({ type: 'session/setTool', tool: 'mouse' })
    const clear = control.getByRole('button', { name: 'Çizimi temizle' })
    check('"Çizimi temizle" fare seçiliyken de kullanılabilir', await clear.isEnabled())
    await clear.click()
    await sleep(300)
    check('"Çizimi temizle" açık pencerenin çizimlerini sildi', (await session.probe('strokes')) === 0)
    await session.send({ type: 'scene/activateHotkey', hotkey: 2 })
    await sleep(300)
    check('diğer pencerenin çizimleri duruyor', (await session.probe('strokes')) === second)
    check('"Çizimi temizle" ipucu kuralı anlatıyor', ((await clear.getAttribute('title')) ?? '').includes('fareye geçince çizim kalır'))
    await session.send({ type: 'scene/activateHotkey', hotkey: 1 })
  }

  check('sayfa hatası ya da uyarısı yok', session.problems.length === 0, show(session.problems.slice(0, 3)))
  await session.shot('06-duzeltmeler.png')

  /** Oyunu bitirir; kapanan pencerelere artık işlem gönderilmesin diye başvuruları da bırakır. */
  const endGame = async () => {
    await session.menu.evaluate(() => window.dnd.game.end())
    session.game = null
    session.control = null
    await sleep(900)
  }

  // --- Monitörler: elle seçim ---
  if (displays.length >= 2) {
    await endGame()
    const [first, second] = displays
    await session.menu.evaluate((patch) => window.dnd.dispatch({ type: 'settings/update', patch }), { controlDisplayId: first.id })
    await session.start({ displayId: second.id, size: [1280, 720] })
    check('elle seçim: oyun ekranı seçilen monitörde', (await windowDisplay(session.game)) === second.id, second.label)
    check('elle seçim: kontrol paneli seçilen monitörde', (await windowDisplay(session.control)) === first.id, first.label)

    await endGame()
    await session.menu.evaluate((patch) => window.dnd.dispatch({ type: 'settings/update', patch }), { controlDisplayId: second.id })
    await session.start({ displayId: first.id, size: [1280, 720] })
    check('seçim ters çevrilince pencereler yer değiştirdi', (await windowDisplay(session.game)) === first.id && (await windowDisplay(session.control)) === second.id)
  }
  await endGame()

  // --- Ayarlar › Genel: iki monitör seçimi ---
  {
    const { menu } = session
    await menu.evaluate((patch) => window.dnd.dispatch({ type: 'settings/update', patch }), { gameDisplayId: null, controlDisplayId: null })
    const win = await session.app.browserWindow(menu)
    await win.evaluate((w) => w.show())
    await menu.getByRole('button', { name: 'Ayarlar' }).click()
    await menu.getByRole('tab', { name: /Genel/ }).click()
    await sleep(300)
    const gameSelect = menu.getByLabel('Oyun ekranının açılacağı monitör')
    const controlSelect = menu.getByLabel('Kontrol panelinin açılacağı monitör')
    check('Ayarlar › Genel: iki monitör seçimi de var', (await gameSelect.count()) === 1 && (await controlSelect.count()) === 1)
    check('otomatik seçenekleri açıklıyor', (await gameSelect.locator('option').first().textContent()).includes('en büyük monitör'))
    await controlSelect.selectOption(String(displays[0].id))
    await sleep(250)
    check('kontrol paneli monitörü arayüzden seçilebiliyor', (await session.state()).app.settings.controlDisplayId === displays[0].id)
    await menu.screenshot({ path: `${session.sampleDir}/../genel.png` }).catch(() => {})
  }
})
