// İstatistikle zar (0.9.9): kontrol panelinin Zar panelinde karakter ve istatistik seçilince zar düğmesi
// istatistiğin artısını ve oyuncunun geçici artı / eksilerini ekler; hedef ve yeterlilik yoktur.
// Avantaj / dezavantaj her zarla çalışır. Karakter seçilmezse zar eskisi gibi düz atılır.
// Çalıştırma: node e2e/oyun/10-istatistik-zari.mjs
import { check, info, open, run, show, sleep } from './harness.mjs'

async function waitFor(read, ok, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs
  let value = await read()
  while (!ok(value)) {
    if (Date.now() > until) return null
    await sleep(80)
    value = await read()
  }
  return value
}

const overlay = (session) =>
  session.game.evaluate(() => ({
    canvases: document.querySelectorAll('.dice-canvas').length,
    numbers: [...document.querySelectorAll('.dice-result')].map((badge) => Number(badge.textContent.trim())),
    applied: [...document.querySelectorAll('.dice-applied li')].map((item) => item.textContent.trim()),
    verdict: document.querySelector('.dice-verdict') !== null,
    header: document.querySelector('.dice-check')?.textContent?.trim() ?? null
  }))

await run(async () => {
  const session = await open('istatistik')
  const send = (action) => session.menu.evaluate((a) => window.dnd.dispatch(a), action)
  await send({ type: 'player/update', slot: 0, patch: { name: 'Aras', level: 9 } })
  await send({ type: 'player/setAbility', slot: 0, ability: 'str', value: 16 })
  await send({ type: 'player/addEffect', slot: 0, effect: { id: 'iyi', label: 'İyi rol', value: 2, rolls: 1 } })
  await send({ type: 'player/addEffect', slot: 0, effect: { id: 'kol', label: 'Kırık kol', value: -1, rolls: null } })
  await send({ type: 'player/update', slot: 1, patch: { name: 'Lira' } })
  await session.start()
  const { control } = session
  const latest = async () => (await session.state()).session.diceHistory[0]
  const rollWith = async (button) => {
    const before = (await latest())?.id
    await control.getByRole('button', { name: button }).click()
    return waitFor(latest, (entry) => entry !== undefined && entry.id !== before)
  }

  // --- Panel ---
  const panel = await control.evaluate(() => ({
    history: document.querySelector('.ctl-dice__history') !== null,
    selects: document.querySelectorAll('.ctl-dice__who select').length,
    abilityDisabled: document.querySelectorAll('.ctl-dice__who select')[1]?.disabled,
    modesDisabled: [...document.querySelectorAll('.ctl-dice__mode')].every((button) => button.disabled)
  }))
  check('zar panelinde geçmiş listesi yerine karakter ve istatistik seçimi var', !panel.history && panel.selects === 2, show(panel))
  check('karakter seçilmeden istatistik ve atış türü kapalı', panel.abilityDisabled && panel.modesDisabled, show(panel))
  const players = await control.getByRole('combobox', { name: 'Kimin için atılsın' }).locator('option').allTextContents()
  check('karakter listesinde dolu oyuncular var', show(players) === show(['Karakter yok (düz zar)', 'Aras', 'Lira']), show(players))

  // --- Düz zar ---
  const plain = await rollWith('d20 at')
  check('karakter seçilmeden zar düz atılır', plain !== null && plain.check === undefined, show(plain))
  await sleep(1300)

  // --- İstatistikle d20 ---
  await control.getByRole('combobox', { name: 'Kimin için atılsın' }).selectOption({ label: 'Aras' })
  const abilityLabels = await control.getByRole('combobox', { name: 'Hangi istatistikle' }).locator('option').allTextContents()
  check('istatistik listesinde artılar yazar', abilityLabels[0].includes('STR') && abilityLabels[0].includes('+3'), show(abilityLabels))
  await control.getByRole('combobox', { name: 'Hangi istatistikle' }).selectOption('str')
  const strRoll = await rollWith('d20 at')
  const strCheck = strRoll?.check
  check(
    'd20 + STR(+3) + İyi rol(+2) + Kırık kol(-1); hedef ve yeterlilik yok',
    strCheck?.kind === 'ability' && strCheck.total === strRoll.value + 4 && strCheck.requirement === null && strCheck.success === null && strCheck.proficiency === null,
    show(strCheck)
  )
  const effects = (await session.state()).app.players[0].effects.map((effect) => effect.label)
  check('1 atışlık etki düşer, kalıcı kalır', show(effects) === show(['Kırık kol']), show(effects))
  const shown = await control.locator('.ctl-dice__value').textContent()
  const captionText = await control.locator('.ctl-dice__caption').textContent()
  check('"Son atış" yalnızca zarı ve toplamı gösterir', shown === String(strCheck?.total) && captionText === 'Son atış · d20', `${captionText} ${shown}`)
  const finished = await waitFor(() => overlay(session), (state) => state.applied.length === 3, 9000)
  await sleep(500)
  const final = await overlay(session)
  check('oyun ekranında artı / eksiler eklenir, sayı toplama gider', finished !== null && final.numbers.at(-1) === strCheck?.total, show(final))
  check('hedef olmadığı için Başarılı / Başarısız yazmaz', final.verdict === false)
  check('alt yazıda oyuncu ve istatistik', final.header?.includes('Aras') && final.header?.includes('Güç'), `${final.header}`)
  await session.shot('istatistik-zari.png')
  await waitFor(() => overlay(session), (state) => state.canvases === 0, 14000)

  // --- d10, avantaj ---
  await control.getByRole('radio', { name: 'Avantaj', exact: true }).click()
  const d10 = await rollWith('d10 at')
  const d10Check = d10?.check
  check(
    'avantajlı d10: iki d10 atılır, büyüğü alınır',
    d10?.sides === 10 && d10Check?.dice.length === 2 && d10Check.dice.every((die) => die <= 10) && d10Check.dice[d10Check.keptIndex] === Math.max(...d10Check.dice),
    show(d10Check)
  )
  check('d10 + STR(+3) + Kırık kol(-1)', d10Check?.total === d10.value + 2, show(d10Check))
  const twoDice = await waitFor(() => overlay(session), (state) => state.canvases === 2 && state.numbers.length === 2, 8000)
  check('oyun ekranında iki d10 düşer', twoDice !== null, show(twoDice))
  const modeAfter = await control.getByRole('radio', { name: 'Normal', exact: true }).getAttribute('aria-checked')
  check("atıştan sonra atış türü Normal'e döner", modeAfter === 'true')
  await session.shot('istatistik-zari-d10.png')
  await waitFor(() => overlay(session), (state) => state.canvases === 0, 14000)

  // --- Karakter yok'a dönünce düz zar ---
  await control.getByRole('combobox', { name: 'Kimin için atılsın' }).selectOption({ label: 'Karakter yok (düz zar)' })
  const plainAgain = await rollWith('d6 at')
  check('"Karakter yok" seçilince yine düz zar', plainAgain?.check === undefined && plainAgain?.sides === 6, show(plainAgain))

  // --- Karakterler sekmesinde son atış ---
  await control.getByRole('tab', { name: 'Karakterler' }).click()
  const last = await control.locator('.chr-col[data-slot="0"] .chr-last').textContent()
  check('Karakterler sekmesinde son atış "Toplam" olarak görünür', last.includes('Güç') && last.includes('Toplam'), last)

  const problems = session.problems.filter((text) => !text.includes('Autofill'))
  check('pencerelerde hata yok', problems.length === 0, show(problems.slice(0, 4)))
  info('oyun ekranı görüntüleri: e2e/.cikti/oyun/istatistik-zari*.png')
})
