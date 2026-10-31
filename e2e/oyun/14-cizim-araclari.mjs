// Çizim araçları (1.2.0): düz çizgi, ok, dikdörtgen, daire ve metin; Shift ile yapışma, renk ve kalınlık,
// silgi ve geri alma, metin kutusunun tuşları, pencereye ait olması, görsellerin etkilenmemesi.
// Çalıştırma: node e2e/oyun/14-cizim-araclari.mjs
import { addItem, addScene, check, info, isRed, near, open, run, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const isBlue = ([r, g, b]) => b > 220 && r < 90 && g > 100 && g < 170

await run(async () => {
  const session = await open('cizim')
  const paths = writeImages(session.sampleDir, ['jeton'])
  const token = await session.importImage('npc', paths.jeton)
  const s1 = await addScene(session, 'Bir', 1)
  const s2 = await addScene(session, 'İki', 2)
  await session.send({ type: 'scene/setActive', sceneId: s1 }, 0)
  const itemId = await addItem(session, s1, token.id, { x: 1500, y: 800, width: 200 })
  await session.start({ size: [1280, 720], toolbar: true })
  const { game, control } = session
  await sleep(400)

  const bar = game.getByRole('toolbar', { name: 'Araç paneli' })
  const button = (name) => bar.getByRole('button', { name, exact: true })
  const stateSession = async () => (await session.state()).session
  const strokes = () => session.probe('strokes')
  const texts = async () => (await session.probe('labels')).map((entry) => entry.text)

  // --- Düğmeler ---
  for (const [name, tool] of [['Düz çizgi', 'line'], ['Ok', 'arrow'], ['Dikdörtgen', 'rect'], ['Daire', 'ellipse'], ['Metin', 'text']]) {
    await button(name).click()
    check(`"${name}" aracı seçer`, (await stateSession()).tool === tool)
  }

  // --- Renk araçta kalır ---
  await button('Dikdörtgen').click()
  await button('Renk: mavi').click()
  const afterColor = await stateSession()
  check('şekil seçiliyken renk seçmek aracı değiştirmez', afterColor.tool === 'rect' && afterColor.penColor === 'blue')
  check('seçili renk şekil aracında da işaretli', (await button('Renk: mavi').getAttribute('aria-pressed')) === 'true')
  await button('Silgi').click()
  await button('Renk: kırmızı').click()
  check('silgideyken renk seçmek kaleme geçirir', (await stateSession()).tool === 'pen')

  // --- Dikdörtgen ---
  await button('Dikdörtgen').click()
  const cursor = await game.evaluate(() => document.querySelector('.konvajs-content').parentElement.style.cursor)
  check('şekil araçlarında imleç artı', cursor === 'crosshair', cursor)
  await session.drag([500, 200], [800, 400], { steps: 6, hold: true })
  check('sürüklerken önizleme görünür', isRed(await session.colorAt(650, 200)))
  await session.release()
  check('dikdörtgenin dört kenarı çizildi', isRed(await session.colorAt(650, 200)) && isRed(await session.colorAt(650, 400)) && isRed(await session.colorAt(500, 300)) && isRed(await session.colorAt(800, 300)))
  check('köşeler keskin (yuvarlatılmış eğri değil)', isRed(await session.colorAt(503, 200)) && isRed(await session.colorAt(500, 203)))
  check('dikdörtgenin içi boş', !isRed(await session.colorAt(650, 300)))
  const one = await strokes()
  check('şekil tek çizim sayılır', one === 1, String(one))

  // --- Küçük sürükleme iz bırakmaz ---
  await session.click(900, 500)
  check('tıklamak şekil bırakmaz', (await strokes()) === one)

  // --- Daire ---
  await button('Daire').click()
  await session.drag([900, 150], [1200, 450], { steps: 6 })
  check('daire çizildi, en uç noktalarından geçer', isRed(await session.colorAt(1050, 150)) && isRed(await session.colorAt(1050, 450)) && isRed(await session.colorAt(900, 300)) && isRed(await session.colorAt(1200, 300)))
  check('dairenin ortası ve kutu köşesi boş', !isRed(await session.colorAt(1050, 300)) && !isRed(await session.colorAt(905, 155)))

  // --- Düz çizgi ve Shift ---
  await button('Düz çizgi').click()
  await session.drag([500, 500], [800, 620], { steps: 6 })
  check('düz çizgi iki uç arasından geçer', isRed(await session.colorAt(650, 560)))
  await game.keyboard.down('Shift')
  await session.drag([500, 700], [800, 715], { steps: 6 })
  await game.keyboard.up('Shift')
  check('Shift ile çizgi yataya yapışır', isRed(await session.colorAt(790, 700)) && !isRed(await session.colorAt(790, 715)))

  // --- Ok ---
  await button('Ok').click()
  await button('Renk: mavi').click()
  await session.drag([900, 600], [1200, 600], { steps: 6 })
  check('ok çizildi, seçilen renkte', isBlue(await session.colorAt(1050, 600)))
  check('ok başı ucun gerisinde iki yana açılır', isBlue(await session.colorAt(1185, 606)) && isBlue(await session.colorAt(1185, 594)))
  check('ok başı yalnızca uçta', !isBlue(await session.colorAt(915, 606)))

  // --- Kalınlık ---
  await button('Kalınlık: kalın').click()
  await button('Dikdörtgen').click()
  await session.drag([1300, 150], [1500, 350], { steps: 6 })
  check('kalınlık şekillere uygulanır', isBlue(await session.colorAt(1400, 155)) && isBlue(await session.colorAt(1400, 145)))
  await button('Kalınlık: orta').click()
  await session.shot('cizim-sekiller.png')

  // --- Silgi şekli de siler, geri al ---
  await button('Silgi').click()
  await session.drag([620, 170], [620, 230], { steps: 4 })
  check('silgi şeklin değdiği kısmını siler', !isRed(await session.colorAt(620, 200)) && isRed(await session.colorAt(700, 200)))
  await button('Son çizimi geri al').click()
  await sleep(200)
  check('geri al silgiyi geri alır', isRed(await session.colorAt(620, 200)))
  await button('Son çizimi geri al').click()
  await sleep(200)
  check('geri al son şekli kaldırır', !isBlue(await session.colorAt(1400, 150)))

  // --- Metin ---
  await button('Metin').click()
  const textCursor = await game.evaluate(() => document.querySelector('.konvajs-content').parentElement.style.cursor)
  check('metin aracında imleç yazı imleci', textCursor === 'text', textCursor)
  await button('Renk: kırmızı').click()
  await sleep(150)
  await session.click(500, 800)
  const input = game.getByRole('textbox', { name: 'Çizim metni' })
  check('tıklayınca yazı alanı açılır, odak onda', (await input.count()) === 1 && (await input.evaluate((el) => document.activeElement === el)))
  await input.pressSequentially('Tuzak 2 t')
  await sleep(150)
  check('yazarken rakam pencere değiştirmez', (await session.scene()).id === s1)
  check('yazarken T paneli gizlemez', (await bar.count()) === 1)
  await input.press('Enter')
  await sleep(200)
  check('Enter metni oyun alanına yazar', (await texts()).includes('Tuzak 2 t') && (await input.count()) === 0, show(await texts()))
  await session.shot('cizim-metin.png')

  await session.click(900, 800)
  await input.pressSequentially('vazgeç')
  await input.press('Escape')
  await sleep(150)
  check('Escape vazgeçer', !(await texts()).includes('vazgeç') && (await input.count()) === 0)

  await session.click(900, 800)
  await input.press('Enter')
  await sleep(150)
  check('boş metin iz bırakmaz', (await input.count()) === 0)

  await session.click(900, 800)
  await input.pressSequentially('İkinci')
  await session.click(1200, 900)
  await sleep(200)
  check('başka yere tıklamak yazılanı bırakır, yeni alan açar', (await texts()).includes('İkinci') && (await input.count()) === 1)
  await input.press('Escape')

  await session.click(600, 900)
  await input.pressSequentially('Geri al beni')
  await input.press('Control+z')
  await sleep(150)
  check('yazarken Ctrl+Z çizimi geri almaz', (await texts()).includes('İkinci'))
  // Ctrl+Z kutudaki yazıyı geri almış olabilir (tarayıcının kendi işi); metin yeniden girilir.
  await input.fill('Geri al beni')
  await input.press('Enter')
  await sleep(150)
  await button('Son çizimi geri al').click()
  await sleep(200)
  check('metin de geri alınır', !(await texts()).includes('Geri al beni') && (await texts()).includes('İkinci'))

  // --- Pencereye ait ---
  await session.send({ type: 'scene/setActive', sceneId: s2 }, 300)
  check('başka pencerede çizim ve metin yok', (await strokes()) === 0 && !(await texts()).includes('İkinci'))
  await session.send({ type: 'scene/setActive', sceneId: s1 }, 300)
  check('pencereye dönünce şekiller ve metin yerinde', (await strokes()) >= 4 && (await texts()).includes('İkinci'))

  // --- Görseller etkilenmez, fareye dönüş ---
  const before = await session.item(itemId)
  await button('Dikdörtgen').click()
  await session.drag([1550, 850], [1650, 950], { steps: 4 })
  const untouched = await session.item(itemId)
  check('şekil aracı görseli taşımaz', near(untouched.x, before.x) && near(untouched.y, before.y))
  await button('Fare').click()
  await sleep(200)
  await session.drag([1520, 820], [1420, 820], { steps: 6 })
  check('fareye dönünce görsel taşınır, şekiller kalır', near((await session.item(itemId)).x, before.x - 100, 2) && (await strokes()) >= 5)

  // --- Kontrol panelindeki temizle hepsini siler ---
  await control.getByRole('button', { name: 'Çizimi temizle' }).click()
  await sleep(250)
  check('"Çizimi temizle" şekilleri ve metni siler', (await strokes()) === 0 && !(await texts()).includes('İkinci'))

  // --- Araç değişince açık metin bırakılır ---
  await button('Metin').click()
  // Araç oyun ekranına durum yayınıyla gelir; beklenmeden tıklanırsa eski araçla işlenir.
  await sleep(150)
  await session.click(700, 500)
  await input.pressSequentially('Yarım')
  await button('Fare').click()
  await sleep(250)
  check('araç değişince yazılan metin bırakılır', (await input.count()) === 0 && (await texts()).includes('Yarım'), show(await texts()))

  const problems = session.problems.filter((text) => !text.includes('Autofill'))
  check('pencerelerde hata yok', problems.length === 0, show(problems.slice(0, 4)))
  info('görüntüler: e2e/.cikti/oyun/cizim-*.png')
})
