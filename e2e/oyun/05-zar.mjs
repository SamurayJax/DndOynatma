// d20: duran zarın üstündeki yüz ve büyük sayı, ana süreçten gelen atışla aynı mı (30+ atış);
// animasyon bittikten sonra geride öğe kalıyor mu; art arda atış ve simge durumundaki pencere.
// Çalıştırma: node e2e/oyun/05-zar.mjs [atış sayısı]   (varsayılan 30, yaklaşık 2 dakika)
import { addScene, check, COLUMN_W, info, open, run, setBackground, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const ROLLS = Math.max(1, Number.parseInt(process.argv[2] ?? '30', 10) || 30)
/** Duran zarın rakamı en fazla bu kadar yatık olabilir (derece); throwPlan.ts'teki sınır 6. */
const MAX_TILT = 6.5

await run(async () => {
  const session = await open('zar')
  const paths = writeImages(session.sampleDir, ['arka', 'portre2'])
  const place = await session.importImage('place', paths.arka)
  await session.importPortrait(0, paths.portre2)
  await session.send({ type: 'player/update', slot: 0, patch: { name: 'Kenji', level: 4 } }, 0)
  const sceneId = await addScene(session, 'Zar', 1)
  await setBackground(session, sceneId, place.id)

  await session.start({ size: [1280, 720] })
  const { game, control } = session
  await session.probe('hookDice')
  const frame = await session.frame()
  const areaLeft = frame.left + COLUMN_W * frame.scale
  const baseline = await session.probe('counts')

  const roll = () => control.evaluate(() => window.dnd.dice.roll())
  const waitResult = () => game.waitForFunction(() => window.__oyun.dice().text !== null, null, { timeout: 8000 })
  const waitGone = () => game.waitForFunction(() => window.__oyun.dice().children === 0, null, { timeout: 9000 })

  // --- Atışlar: ekrandaki sonuç = atış ---
  const seen = new Map()
  const wrong = []
  const tilted = []
  const outside = []
  const slow = []
  let toneErrors = 0
  for (let i = 0; i < ROLLS; i++) {
    const startedAt = Date.now()
    const thrown = await roll()
    await waitResult()
    const settleMs = Date.now() - startedAt
    const dice = await session.probe('dice')
    const top = await session.probe('diceTop')
    seen.set(thrown.value, (seen.get(thrown.value) ?? 0) + 1)
    if (dice.text !== String(thrown.value) || top?.text !== String(thrown.value)) wrong.push(`atış ${thrown.value}: sayı ${dice.text}, üst yüz ${top?.text}`)
    if (!top || Math.abs(top.angle) > MAX_TILT) tilted.push(`${thrown.value}: ${top?.angle.toFixed(1)}°`)
    if (!top || top.x < areaLeft || dice.center.x < areaLeft || dice.center.y < frame.top || top.y > frame.top + frame.height) outside.push(`${thrown.value}: zar ${show([top?.x, top?.y])}, sayı ${show(dice.center)}`)
    if (settleMs > 3200) slow.push(`${thrown.value}: ${settleMs} ms`)
    const crit = dice.className.includes('is-crit')
    const fumble = dice.className.includes('is-fumble')
    if (crit !== (thrown.value === 20) || fumble !== (thrown.value === 1)) toneErrors += 1
    // Son atış dışında sonuç gösterilirken yeni atış yapılır (oturumda da böyle olur).
    if (i % 10 === 4) await sleep(600)
  }
  info(`${ROLLS} atış, görülen değerler: ${[...seen.keys()].sort((x, y) => x - y).join(' ')}`)
  check(`${ROLLS} atışın hepsinde duran zarın üst yüzü ve büyük sayı atışla aynı`, wrong.length === 0, wrong.join(' | '))
  check('duran zarın rakamı dik (en fazla 6° yatık)', tilted.length === 0, tilted.join(' | '))
  check('zar ve sonuç oyun alanında (portre sütununun üstünde değil)', outside.length === 0, outside.join(' | '))
  check('zar 3,2 saniye içinde duruyor', slow.length === 0, slow.join(' | '))
  check('20 ve 1 vurgusu yalnızca o değerlerde', toneErrors === 0)
  {
    const history = (await session.state()).session.diceHistory
    check('atış geçmişi atış sayısı kadar', history.length === ROLLS, String(history.length))
  }

  // --- Animasyon bitince geride bir şey kalmıyor ---
  {
    await waitGone()
    const dice = await session.probe('dice')
    const counts = await session.probe('counts')
    check('kaybolduktan sonra zar katmanı boş (tuval ve sayı yok, saydamlık sıfırlandı)', dice.children === 0 && dice.canvas === false && dice.text === null && dice.opacity === '', show(dice))
    check('DOM öğe ve tuval sayısı atışlardan önceki gibi', counts.dom === baseline.dom && counts.canvases === baseline.canvases, `${show(baseline)} → ${show(counts)}`)
  }

  // --- Art arda hızlı atış ---
  {
    const first = await roll()
    await sleep(150)
    const second = await roll()
    await sleep(150)
    const third = await roll()
    await sleep(600)
    const during = await game.evaluate(() => ({ canvases: document.querySelectorAll('.dice-canvas').length, results: document.querySelectorAll('.dice-result').length }))
    check('üç hızlı atışta tek zar çiziliyor, erken sonuç yok', during.canvases === 1 && during.results === 0, show(during))
    await waitResult()
    const dice = await session.probe('dice')
    const top = await session.probe('diceTop')
    check('hızlı atışlardan sonuncusu gösteriliyor', dice.text === String(third.value) && top?.text === String(third.value), `atışlar ${first.value}, ${second.value}, ${third.value}; gösterilen ${dice.text}`)
    await waitGone()
    check('hızlı atışlardan sonra da geride bir şey kalmadı', (await session.probe('counts')).dom === baseline.dom)
  }

  // --- Pencere simge durumundayken atış (kare döngüsü durur, zamanlayıcılar bitirir) ---
  {
    await session.gameWindow.evaluate((win) => win.minimize())
    await sleep(400)
    await roll()
    await sleep(7500)
    const dice = await session.probe('dice')
    check('simge durumundaki pencerede atış kendiliğinden bitiyor', dice.children === 0 && dice.opacity === '', show(dice))
    await session.gameWindow.evaluate((win) => win.restore())
    await sleep(500)
    const thrown = await roll()
    await waitResult()
    check('pencere geri gelince atış olağan çalışıyor', (await session.probe('dice')).text === String(thrown.value))
  }

  check('sayfa hatası yok', session.problems.length === 0, session.problems.join(' | '))
  await session.close()
})
