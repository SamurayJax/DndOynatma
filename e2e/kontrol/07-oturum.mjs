// Dolu bir oturumda (1920×1080, 4 oyuncu, 6 pencere, 10 görsel, 150 kütüphane görseli) panelin akıcılığı:
// can kutucuklarına art arda tıklarken, zar geçmişi sınırına kadar büyürken ve pencere değiştirirken
// kare süreleri ile "tıklama → ekranda görünme" gecikmesi ölçülür.
import { check, getState, info, launch, measureFrames, run, seedFullSession, setContentSize, sleep, startGame, waitFor } from './harness.mjs'

// Eşikler 60 Hz'e göre cömerttir: amaç takılmayı yakalamak, makineler arası farkı değil.
const FRAME_P95_MS = 40
const FRAME_MAX_MS = 150
const LATENCY_MEDIAN_MS = 60
const LATENCY_MAX_MS = 200
const DICE_CAP = 50

/** Tıklamadan, verilen kabın içindeki ilk DOM değişikliğine kadar geçen süreleri toplar. */
const watchLatency = (page, selector) =>
  page.evaluate((target) => {
    const samples = []
    let clickedAt = null
    const onClick = () => (clickedAt = performance.now())
    document.addEventListener('pointerdown', onClick, true)
    const observer = new MutationObserver(() => {
      if (clickedAt === null) return
      samples.push(performance.now() - clickedAt)
      clickedAt = null
    })
    observer.observe(document.querySelector(target), { subtree: true, childList: true, characterData: true, attributes: true })
    window.__latency = {
      samples,
      stop: () => {
        observer.disconnect()
        document.removeEventListener('pointerdown', onClick, true)
      }
    }
  }, selector)

const readLatency = (page) =>
  page.evaluate(() => {
    window.__latency.stop()
    const sorted = window.__latency.samples.slice().sort((a, b) => a - b)
    return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)] ?? 0, max: sorted[sorted.length - 1] ?? 0 }
  })

const ms = (value) => `${value.toFixed(1)} ms`
const frameText = (frames) => `${frames.count} kare, ortanca ${ms(frames.median)}, p95 ${ms(frames.p95)}, en uzun ${ms(frames.max)}`
const smooth = (frames) => frames.count >= 20 && frames.p95 <= FRAME_P95_MS && frames.max <= FRAME_MAX_MS

await run(async () => {
  const session = await launch('oturum')
  const { sceneIds } = await seedFullSession(session)
  const { control } = await startGame(session)
  const size = await setContentSize(session, 'control', 1920, 1080)
  info(`kontrol paneli ${size.width}×${size.height}`)
  await sleep(800)

  // --- Can kutucukları ---
  await watchLatency(control, '.ctl-col--players')
  const segments = []
  for (let round = 0; round < 12; round++) for (let slot = 0; slot < 4; slot++) segments.push([slot, 1 + ((round * 3 + slot) % 10)])
  let frames = await measureFrames(control, async () => {
    for (const [slot, segment] of segments) {
      await control.locator(`[data-slot="${slot}"] .ctl-hp__seg`).nth(segment - 1).click()
      await sleep(25)
    }
  })
  let latency = await readLatency(control)
  let state = await getState(control)
  // Son turda her oyuncunun tıklanan kutucuğu: can o değerde olmalı (dolu son kutucuğa tıklamak bir azaltır).
  check('48 kutucuk tıklaması: hiçbiri kaybolmadı', latency.count >= 44 && state.app.players.every((player) => player.hp >= 0 && player.hp <= 10), `${latency.count} güncelleme`)
  check('can tıklamalarında kareler akıcı', smooth(frames), frameText(frames))
  check('can tıklaması ekranda hemen görünür', latency.median <= LATENCY_MEDIAN_MS && latency.max <= LATENCY_MAX_MS, `ortanca ${ms(latency.median)}, en uzun ${ms(latency.max)}`)

  // Tek oyuncuda −1'e hızla 12 kez basmak: her tıklama sayılmalı (10 → 0, fazlası 0'da kalır).
  await control.evaluate(() => window.dnd.dispatch({ type: 'player/setHp', slot: 0, hp: 10 }))
  const minus = control.locator('[data-slot="0"]').getByRole('button', { name: 'Canı 1 azalt' })
  for (let i = 0; i < 12; i++) await minus.click({ delay: 0 })
  const hp = await waitFor(async () => (await getState(control)).app.players[0].hp, (value) => value === 0, 2000)
  check('−1 düğmesine hızlı 12 tıklama: can 0 olur, kart "canı 0" durumuna geçer', hp === 0 && (await control.locator('[data-slot="0"].is-down').count()) === 1, `can ${hp}`)

  // --- Zar geçmişi sınırına kadar ---
  const sideBefore = await control.evaluate(() => document.querySelector('.ctl-col--side').scrollHeight)
  frames = await measureFrames(control, async () => {
    for (let i = 0; i < DICE_CAP + 5; i++) {
      await control.evaluate(() => window.dnd.dice.roll())
      await sleep(30)
    }
  })
  await sleep(300)
  const dice = await control.evaluate(() => ({
    rows: document.querySelectorAll('.ctl-dice__roll').length,
    latest: document.querySelector('.ctl-dice__value').textContent,
    first: document.querySelector('.ctl-dice__roll-value').textContent,
    sideHeight: document.querySelector('.ctl-col--side').scrollHeight
  }))
  state = await getState(control)
  check(`zar geçmişi ${DICE_CAP} atışta sınırlanır; liste de aynı sayıda satır gösterir`, state.session.diceHistory.length === DICE_CAP && dice.rows === DICE_CAP, `durum ${state.session.diceHistory.length}, satır ${dice.rows}`)
  check('"Son atış" ve listenin başı en yeni atışı gösterir', dice.latest === String(state.session.diceHistory[0].value) && dice.first === dice.latest, `${dice.latest} / ${state.session.diceHistory[0].value}`)
  check('geçmiş büyürken alttaki paneller yer değiştirmez', dice.sideHeight === sideBefore, `${sideBefore}px → ${dice.sideHeight}px`)
  check('geçmiş büyürken kareler akıcı', smooth(frames), frameText(frames))

  await sleep(1300)
  await watchLatency(control, '.ctl-dice__result')
  frames = await measureFrames(control, async () => {
    await control.getByRole('button', { name: 'd20 at' }).click()
    await sleep(600)
  })
  latency = await readLatency(control)
  check('geçmiş doluyken zar düğmesi: sonuç hemen görünür, kareler akıcı', latency.count === 1 && latency.max <= LATENCY_MAX_MS && smooth(frames), `gecikme ${ms(latency.max)}; ${frameText(frames)}`)

  // --- Pencere geçişi (150 kartın rozetleri yeniden hesaplanır) ---
  await watchLatency(control, '.ctl-topbar__scene')
  frames = await measureFrames(control, async () => {
    for (let round = 0; round < 10; round++) {
      await control.locator('.ctl-scene').nth(round % 2 === 0 ? 1 : 0).click()
      await sleep(60)
    }
  })
  latency = await readLatency(control)
  check('pencere geçişi ekranda hemen görünür, kareler akıcı', latency.count === 10 && latency.median <= LATENCY_MEDIAN_MS && latency.max <= LATENCY_MAX_MS && smooth(frames), `ortanca ${ms(latency.median)}, en uzun ${ms(latency.max)}; ${frameText(frames)}`)
  check('geçişlerin sonunda etkin pencere doğru', (await getState(control)).app.activeSceneId === sceneIds[0])

  // --- Kütüphaneden art arda görsel koyma ---
  await watchLatency(control, '.ctl-stage')
  const before = (await getState(control)).app.scenes[0].items.length
  frames = await measureFrames(control, async () => {
    for (let i = 0; i < 10; i++) {
      await control.locator('.lib-card__main').nth(i).click()
      await sleep(40)
    }
  })
  latency = await readLatency(control)
  const after = (await getState(control)).app.scenes[0].items.length
  check('10 görsel art arda konur: hepsi eklenir, liste hemen güncellenir', after === before + 10 && latency.median <= LATENCY_MEDIAN_MS && smooth(frames), `${before}→${after}; ortanca ${ms(latency.median)}; ${frameText(frames)}`)

  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
