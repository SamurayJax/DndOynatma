// Zarlar (d20, d10, d6): duran zarda okunan rakam ve büyük sayı, ana süreçten gelen atışla aynı mı
// (her zar için 30+ atış); zarın biçimi; kontrol panelindeki üç düğme ve geçmişte zarın adı;
// animasyon bittikten sonra geride öğe kalıyor mu; art arda atış ve simge durumundaki pencere.
// Çalıştırma: node e2e/oyun/05-zar.mjs [zar başına atış sayısı]   (varsayılan 30, yaklaşık 6 dakika)
import { addScene, check, COLUMN_W, info, open, run, setBackground, show, sleep } from './harness.mjs'
import { writeImages } from './gorseller.mjs'

const ROLLS = Math.max(1, Number.parseInt(process.argv[2] ?? '30', 10) || 30)
/** Duran zarın rakamı en fazla bu kadar yatık olabilir (derece); throwPlan.ts'teki sınır 6. */
const MAX_TILT = 6.5
/** Geçmişte tutulan en çok atış (storage.ts). */
const HISTORY_CAP = 50
/** Kontrol panelindeki zar düğmesinin bekleme süresi (DicePanel.tsx) ve biraz pay. */
const COOLDOWN_MS = 1350

/** Zarlar ve duran zarın tuvaldeki biçimi: yüzlerin köşe sayısı, en az / en çok görünen yüz. */
const DICE = [
  { sides: 20, corners: 3, minFaces: 4, maxFaces: 10 },
  { sides: 10, corners: 4, minFaces: 2, maxFaces: 6 },
  // Tepeden bakınca duran küpün yalnızca üst yüzü görünür.
  { sides: 6, corners: 4, minFaces: 1, maxFaces: 1 }
]

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

  const roll = (sides) => control.evaluate((value) => window.dnd.dice.roll(value), sides)
  const waitResult = () => game.waitForFunction(() => window.__oyun.dice().text !== null, null, { timeout: 8000 })
  const waitShown = (value) => game.waitForFunction((text) => window.__oyun.dice().text === text, String(value), { timeout: 8000 })
  const waitGone = () => game.waitForFunction(() => window.__oyun.dice().children === 0, null, { timeout: 9000 })

  // --- Atışlar: ekrandaki sonuç = atış, her zar için ---
  let total = 0
  for (const die of DICE) {
    const name = `d${die.sides}`
    const seen = new Map()
    const wrong = []
    const tilted = []
    const outside = []
    const settleTimes = []
    const misshapen = []
    let toneErrors = 0
    for (let i = 0; i < ROLLS; i++) {
      const startedAt = Date.now()
      const thrown = await roll(die.sides)
      total += 1
      if (thrown?.sides !== die.sides || !Number.isInteger(thrown.value) || thrown.value < 1 || thrown.value > die.sides) {
        wrong.push(`geçersiz atış ${show(thrown)}`)
        continue
      }
      // Bir önceki atışın sonucu hâlâ ekranda olabilir; bu atışın sayısı görünene kadar beklenir.
      await waitShown(thrown.value)
      const settleMs = Date.now() - startedAt
      const dice = await session.probe('dice')
      const top = await session.probe('diceTop')
      const faces = await session.probe('diceFaces')
      seen.set(thrown.value, (seen.get(thrown.value) ?? 0) + 1)
      if (dice.text !== String(thrown.value) || top?.text !== String(thrown.value)) wrong.push(`atış ${thrown.value}: sayı ${dice.text}, üst yüz ${top?.text}`)
      if (!top || Math.abs(top.angle) > MAX_TILT) tilted.push(`${thrown.value}: ${top?.angle.toFixed(1)}°`)
      if (!top || top.x < areaLeft || dice.center.x < areaLeft || dice.center.y < frame.top || top.y > frame.top + frame.height) {
        // Pencere deneme sırasında elle taşınmış ya da boyutlandırılmışsa ölçüler tutmaz; o anki çerçeve de yazılır.
        const now = await session.frame()
        outside.push(`${thrown.value}: zar ${show([top?.x, top?.y])}, sayı ${show(dice.center)}, çerçeve ${show([now.top, now.height, now.vw, now.vh])} (başta ${show([frame.top, frame.height, frame.vw, frame.vh])})`)
      }
      settleTimes.push(settleMs)
      if (faces.length < die.minFaces || faces.length > die.maxFaces || faces.some((corners) => corners !== die.corners)) misshapen.push(`${thrown.value}: ${show(faces)}`)
      const crit = dice.className.includes('is-crit')
      const fumble = dice.className.includes('is-fumble')
      if (crit !== (die.sides === 20 && thrown.value === 20) || fumble !== (die.sides === 20 && thrown.value === 1)) toneErrors += 1
      // Çoğu atış, bir önceki sonuç gösterilirken yapılır (oturumda da böyle olur).
      if (i % 10 === 4) await sleep(600)
    }
    const values = [...seen.keys()].sort((x, y) => x - y)
    info(`${name}: ${ROLLS} atış, görülen değerler: ${values.join(' ')}`)
    check(`${name}: ${ROLLS} atışın hepsinde duran zarda okunan rakam ve büyük sayı atışla aynı`, wrong.length === 0, wrong.join(' | '))
    check(`${name}: değerler 1-${die.sides} arasında`, values.every((value) => value >= 1 && value <= die.sides), values.join(' '))
    check(`${name}: duran zarın rakamı dik (en fazla 6° yatık)`, tilted.length === 0, tilted.join(' | '))
    check(`${name}: zar ve sonuç oyun alanında (portre sütununun üstünde değil)`, outside.length === 0, outside.join(' | '))
    // Süre duvar saatiyle ölçülür; bilgisayar başka işle meşgulken tek tük atış gecikebilir. Kural onda
    // dokuzuna uygulanır, hiçbir atış da 5 saniyeyi geçemez: gerçek bir yavaşlama bütün atışları kaydırır.
    const sorted = [...settleTimes].sort((x, y) => x - y)
    const p90 = sorted[Math.ceil(sorted.length * 0.9) - 1] ?? Infinity
    const slowest = sorted.at(-1) ?? Infinity
    check(`${name}: zar 3,2 saniye içinde duruyor (atışların onda dokuzu; en yavaşı 5 saniyeyi geçmez)`, p90 <= 3200 && slowest <= 5000, `onda dokuzu ${p90} ms, en yavaş ${slowest} ms`)
    check(`${name}: zarın biçimi doğru (yüzler ${die.corners} köşeli, ${die.minFaces}-${die.maxFaces} yüz görünüyor)`, misshapen.length === 0, misshapen.slice(0, 4).join(' | '))
    check(`${name}: ${die.sides === 20 ? '20 ve 1 vurgusu yalnızca o değerlerde' : 'sonuç vurgusuz (vurgu yalnızca d20 içindir)'}`, toneErrors === 0, String(toneErrors))
    if (die.sides === 6 && ROLLS >= 30) check('d6: 1-6 hepsi geldi', values.join(' ') === '1 2 3 4 5 6', values.join(' '))
  }
  {
    const history = (await session.state()).session.diceHistory
    const expected = Math.min(HISTORY_CAP, total)
    check(`atış geçmişi ${expected} atış tutuyor`, history.length === expected, String(history.length))
    const last = DICE.at(-1).sides
    check('geçmişin başındaki atışlar son atılan zarın', history.slice(0, Math.min(ROLLS, expected)).every((entry) => entry.sides === last), show(history.slice(0, 3)))
  }

  // --- Animasyon bitince geride bir şey kalmıyor ---
  {
    await waitGone()
    const dice = await session.probe('dice')
    const counts = await session.probe('counts')
    check('kaybolduktan sonra zar katmanı boş (tuval ve sayı yok, saydamlık sıfırlandı)', dice.children === 0 && dice.canvas === false && dice.text === null && dice.opacity === '', show(dice))
    check('DOM öğe ve tuval sayısı atışlardan önceki gibi', counts.dom === baseline.dom && counts.canvases === baseline.canvases, `${show(baseline)} → ${show(counts)}`)
  }

  // --- Kontrol paneli: üç düğme, son atış ve geçmişte zarın adı ---
  {
    const layout = await control.evaluate(() => {
      const buttons = [...document.querySelectorAll('.ctl-dice__btn')]
      const top = document.querySelector('.ctl-dice__top').getBoundingClientRect()
      return {
        labels: buttons.map((button) => button.getAttribute('aria-label')),
        texts: buttons.map((button) => button.textContent.trim()),
        tops: new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))).size,
        clipped: buttons.filter((button) => {
          const label = button.querySelector('.ui-btn__label')
          return label.scrollWidth > label.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1
        }).length,
        rowHeight: Math.round(top.height)
      }
    })
    check('üç zar düğmesi var: d20, d10, d6', show(layout.labels) === show(['d20 at', 'd10 at', 'd6 at']) && show(layout.texts) === show(['d20', 'd10', 'd6']), show(layout))
    check('üç düğme tek satırda, yazıları kırpılmadan', layout.tops === 1 && layout.clipped === 0, show(layout))
    check('zar satırının yüksekliği eskisi gibi (64 piksel)', layout.rowHeight === 64, String(layout.rowHeight))

    for (const die of DICE.toReversed()) {
      await sleep(COOLDOWN_MS)
      const before = (await session.state()).session.diceHistory[0]?.id
      await control.getByRole('button', { name: `d${die.sides} at` }).click()
      await control.waitForFunction((id) => window.dnd.getState().then((state) => state.session.diceHistory[0]?.id !== id), before, { timeout: 4000 })
      const latest = (await session.state()).session.diceHistory[0]
      await control.waitForFunction((value) => document.querySelector('.ctl-dice__value')?.textContent === value, String(latest.value), { timeout: 4000 })
      const panel = await control.evaluate(() => ({
        caption: document.querySelector('.ctl-dice__caption').textContent,
        value: document.querySelector('.ctl-dice__value').textContent,
        tone: document.querySelector('.ctl-dice__value').className
      }))
      const toned = panel.tone.includes('is-crit') || panel.tone.includes('is-fumble')
      check(
        `"d${die.sides} at" düğmesi d${die.sides} atar; son atış zarın adını gösterir`,
        latest.sides === die.sides && panel.caption === `Son atış · d${die.sides}` && panel.value === String(latest.value),
        show({ latest, panel })
      )
      check(`d${die.sides}: son atışta vurgu yalnızca d20'nin 20 ve 1'inde`, toned === (latest.sides === 20 && (latest.value === 20 || latest.value === 1)), panel.tone)
      await waitShown(latest.value)
      const top = await session.probe('diceTop')
      check(`d${die.sides}: düğmeyle atılan zar oyun ekranında aynı sayıyla duruyor`, top?.text === String(latest.value), `${latest.value} / ${top?.text}`)
    }
    await waitGone()
  }

  // --- Art arda hızlı atış, her biri başka zarla ---
  {
    const first = await roll(20)
    await sleep(150)
    const second = await roll(10)
    await sleep(150)
    const third = await roll(6)
    await sleep(600)
    const during = await game.evaluate(() => ({ canvases: document.querySelectorAll('.dice-canvas').length, results: document.querySelectorAll('.dice-result').length }))
    check('üç hızlı atışta tek zar çiziliyor, erken sonuç yok', during.canvases === 1 && during.results === 0, show(during))
    await waitResult()
    const dice = await session.probe('dice')
    const top = await session.probe('diceTop')
    const faces = await session.probe('diceFaces')
    check('hızlı atışlardan sonuncusu gösteriliyor', dice.text === String(third.value) && top?.text === String(third.value), `atışlar ${first.value}, ${second.value}, ${third.value}; gösterilen ${dice.text}`)
    check('ekrandaki zar son atılan zar (küp)', faces.length === 1 && faces[0] === 4, show(faces))
    await waitGone()
    check('hızlı atışlardan sonra da geride bir şey kalmadı', (await session.probe('counts')).dom === baseline.dom)
  }

  // --- Pencere simge durumundayken atış (kare döngüsü durur, zamanlayıcılar bitirir) ---
  {
    await session.gameWindow.evaluate((win) => win.minimize())
    await sleep(400)
    await roll(10)
    await sleep(7500)
    const dice = await session.probe('dice')
    check('simge durumundaki pencerede atış kendiliğinden bitiyor', dice.children === 0 && dice.opacity === '', show(dice))
    await session.gameWindow.evaluate((win) => win.restore())
    await sleep(500)
    const thrown = await roll(10)
    await waitResult()
    check('pencere geri gelince atış olağan çalışıyor', (await session.probe('dice')).text === String(thrown.value))
  }

  // --- Tanınmayan zar ---
  {
    await waitGone()
    const before = (await session.state()).session.diceHistory.length
    const refused = await control.evaluate(() => Promise.all([window.dnd.dice.roll(4), window.dnd.dice.roll(3), window.dnd.dice.roll(), window.dnd.dice.roll('20')]))
    await sleep(400)
    const after = (await session.state()).session.diceHistory.length
    check('tanınmayan zar atılmaz, oyun ekranında bir şey belirmez', refused.every((result) => result === null) && after === before && (await session.probe('dice')).children === 0, show(refused))
  }

  check('sayfa hatası yok', session.problems.length === 0, session.problems.join(' | '))
  await session.close()
})
