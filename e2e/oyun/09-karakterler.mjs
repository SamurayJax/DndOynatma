// Karakterler: kontrol panelinin "Karakterler" sekmesi (dört sütun, boş yuva boş kalır), beceri düğmesiyle atış,
// oyun ekranında artı / eksilerin uçup sayıya eklenmesi ve Başarılı / Başarısız, avantajda iki zar, süreli ve
// kalıcı etkiler, sınıfı ve istatistiği oyun sırasında değiştirme, zar geçmişi, kapatıp açınca etkilerin yerinde durması.
// Çalıştırma: node e2e/oyun/09-karakterler.mjs
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

/** Oyun ekranındaki beceri atışı gösterimi. */
const overlay = (session) =>
  session.game.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null
    return {
      canvases: document.querySelectorAll('.dice-canvas').length,
      badges: [...document.querySelectorAll('.dice-result')].map((badge) => ({
        number: Number(badge.textContent.trim()),
        dropped: badge.classList.contains('is-dropped')
      })),
      flying: text('.dice-fly'),
      applied: [...document.querySelectorAll('.dice-applied li')].map((item) => item.textContent.trim()),
      verdict: text('.dice-verdict__word'),
      need: text('.dice-verdict__need'),
      header: text('.dice-check')
    }
  })

await run(async () => {
  const session = await open('karakterler')
  const send = (action) => session.menu.evaluate((a) => window.dnd.dispatch(a), action)
  await send({ type: 'class/add', classId: 'sav', name: 'Savaşçı' })
  await send({ type: 'skill/add', classId: 'sav', skill: { id: 'ac', name: 'Ac', ability: 'str', requirement: 10 } })
  await send({ type: 'skill/add', classId: 'sav', skill: { id: 'imkansiz', name: 'İmkânsız', ability: 'cha', requirement: 40 } })
  await send({ type: 'class/add', classId: 'buy', name: 'Büyücü' })
  await send({ type: 'skill/add', classId: 'buy', skill: { id: 'ates', name: 'Ateş Topu', ability: 'int', requirement: 12 } })
  await send({ type: 'player/update', slot: 0, patch: { name: 'Aras', level: 5, classId: 'sav' } })
  await send({ type: 'player/setAbility', slot: 0, ability: 'str', value: 16 })
  await send({ type: 'player/update', slot: 1, patch: { name: 'Lira', classId: 'buy' } })
  // Üçüncü yuva boş kalır: dördüncü dolu, yeri kaymamalı.
  await send({ type: 'player/update', slot: 3, patch: { name: 'Doruk' } })
  await session.start()
  const { control } = session

  // --- Sekme ve düzen ---
  await control.getByRole('tab', { name: 'Karakterler' }).click()
  await sleep(300)
  const layout = await control.evaluate(() => {
    const columns = [...document.querySelectorAll('.chr-page > *')]
    return {
      count: columns.length,
      empty: columns.map((column) => column.classList.contains('chr-col--empty')),
      widths: columns.map((column) => Math.round(column.getBoundingClientRect().width)),
      lefts: columns.map((column) => Math.round(column.getBoundingClientRect().left))
    }
  })
  check('Karakterler sekmesi dört eşit sütun', layout.count === 4 && Math.max(...layout.widths) - Math.min(...layout.widths) <= 1, show(layout.widths))
  check('boş yuvanın yeri boş kalır, dördüncü oyuncu dördüncü sütunda', show(layout.empty) === show([false, false, true, false]) && layout.lefts[3] > layout.lefts[2], show(layout))
  const skills = await control.locator('.chr-col[data-slot="0"] .chr-skill').allTextContents()
  check('oyuncunun sınıfının becerileri düğme olur', skills.length === 2 && skills[0].includes('Ac'), show(skills))
  const acText = await control.locator('.chr-col[data-slot="0"] [data-skill="ac"]').textContent()
  // STR 16 → +3; 5. seviye → yeterlilik 3: en az 10 → 7.
  check('düğmede artı ve yeterlilikle düşen gereksinim yazar', acText.includes('STR +3') && acText.includes('10') && acText.includes('7'), acText)

  // --- Etki ekleme (arayüzden) ---
  const column = control.locator('.chr-col[data-slot="0"]')
  await column.getByRole('textbox', { name: 'Açıklama' }).fill('İyi rol')
  await column.getByRole('button', { name: '+2', exact: true }).click()
  await column.getByRole('button', { name: /^\+2 ver$/ }).click()
  await column.getByRole('textbox', { name: 'Açıklama' }).fill('Kırık kol')
  await column.getByRole('button', { name: '-1', exact: true }).click()
  await column.locator('.ui-toggle', { hasText: 'Kalıcı' }).click()
  await column.getByRole('button', { name: /^-1 ver$/ }).click()
  await sleep(200)
  let effects = (await session.state()).app.players[0].effects
  check(
    'artı / eksi açıklama, değer ve süreyle eklenir',
    effects.length === 2 && effects[0].label === 'İyi rol' && effects[0].value === 2 && effects[0].rolls === 1 && effects[1].value === -1 && effects[1].rolls === null,
    show(effects)
  )

  // --- Beceri atışı: oyun ekranında artı / eksiler uçar ---
  await column.locator('[data-skill="ac"]').click()
  const roll = await waitFor(
    async () => (await session.state()).session.diceHistory[0],
    (entry) => entry?.check !== undefined
  )
  const result = roll?.check
  check('beceri atışı yapılır ve geçmişe hesabıyla yazılır', result !== undefined && result.skillName === 'Ac' && result.requirement === 7, show(result))
  check('hesap: zar + STR(+3) + İyi rol(+2) + Kırık kol(-1)', result?.total === result?.dice[0] + 4 && result?.modifiers.length === 3, show(result?.modifiers))
  effects = (await session.state()).app.players[0].effects
  check('1 atışlık etki atıştan sonra düşer, kalıcı kalır', effects.length === 1 && effects[0].label === 'Kırık kol', show(effects))

  const flew = await waitFor(() => overlay(session), (state) => state.flying !== null, 6000)
  check('oyun ekranında artı / eksi uçar', flew !== null && /[+-]\d/.test(flew.flying), show(flew))
  const finished = await waitFor(() => overlay(session), (state) => state.verdict !== null, 9000)
  check(
    'sayı toplama gider ve sonuç yazılır',
    finished !== null && finished.badges.at(-1)?.number === result?.total && finished.verdict === (result?.success ? 'Başarılı' : 'Başarısız') && finished.need === `en az ${result?.requirement}`,
    show(finished)
  )
  check('eklenen artı / eksiler sayının yanında listelenir', finished?.applied.length === 3, show(finished?.applied))
  check('alt yazıda oyuncu ve beceri', finished?.header?.includes('Aras') && finished?.header?.includes('Ac'), `${finished?.header}`)
  await session.shot('karakter-beceri-atisi.png')

  const lastText = await column.locator('.chr-last').textContent()
  check('sütunda son atış ve sonucu görünür', lastText.includes('Ac') && lastText.includes(String(result?.total)) && lastText.includes(result?.success ? 'Başarılı' : 'Başarısız'), lastText)
  const cleared = await waitFor(() => overlay(session), (state) => state.badges.length === 0 && state.canvases === 0, 12000)
  check('gösterim bitince oyun ekranından kalkar', cleared !== null)

  // --- Avantaj: iki zar ---
  await column.getByRole('radio', { name: 'Avantaj', exact: true }).click()
  await column.locator('[data-skill="ac"]').click()
  const twoDice = await waitFor(() => overlay(session), (state) => state.badges.length === 2 && state.badges.some((badge) => badge.dropped), 8000)
  const advantage = (await session.state()).session.diceHistory[0].check
  check('avantajda iki zar düşer, alınmayan soluklaşır', twoDice !== null && twoDice.canvases === 2, show(twoDice))
  check('avantajda büyük zar alınır', advantage.mode === 'advantage' && advantage.dice[advantage.keptIndex] === Math.max(...advantage.dice), show(advantage))
  const modeAfter = await column.getByRole('radio', { name: 'Normal', exact: true }).getAttribute('aria-checked')
  check('atıştan sonra atış türü Normal\'e döner', modeAfter === 'true')
  await session.shot('karakter-avantaj.png')
  await waitFor(() => overlay(session), (state) => state.badges.length === 0, 14000)

  // --- Gereksinimi tutmayan beceri ---
  await column.locator('[data-skill="imkansiz"]').click()
  const failVerdict = await waitFor(() => overlay(session), (state) => state.verdict !== null, 9000)
  check('gereksinimi tutmayan atış "Başarısız" yazar', failVerdict?.verdict === 'Başarısız', show(failVerdict))

  // --- Oyun sırasında sınıf ve istatistik ---
  await control.locator('.chr-col[data-slot="3"] .chr-class select').selectOption('buy')
  await sleep(200)
  check('sütundan sınıf seçilir, becerileri gelir', (await control.locator('.chr-col[data-slot="3"] [data-skill="ates"]').count()) === 1)
  await control.locator('.chr-col[data-slot="3"] .chr-edit-toggle').click()
  await control.locator('.chr-col[data-slot="3"] .chr-edit').getByRole('button', { name: 'Artır', exact: true }).nth(3).click()
  await sleep(200)
  const intAfter = (await session.state()).app.players[3].abilities.int
  check('sütundan istatistik değiştirilir (INT 10 → 11)', intAfter === 11, `${intAfter}`)

  // --- Zar geçmişi ---
  await control.getByRole('tab', { name: 'Kontrol Paneli' }).click()
  const history = await control.locator('.ctl-dice__roll').first().textContent()
  check('kontrol panelindeki zar geçmişinde oyuncu ve beceri yazar', history.includes('Aras') && history.includes('İmkânsız'), history)

  // --- Etkiyi kaldırma ve kalıcılık ---
  await control.getByRole('tab', { name: 'Karakterler' }).click()
  await column.getByRole('textbox', { name: 'Açıklama' }).fill('Lanet')
  await column.getByRole('button', { name: '-2', exact: true }).click()
  await column.getByRole('button', { name: /^-2 ver$/ }).click()
  await column.getByRole('button', { name: '“Kırık kol” etkisini kaldır' }).click()
  await sleep(200)
  const remaining = (await session.state()).app.players[0].effects.map((effect) => effect.label)
  check('etki × ile kaldırılır', show(remaining) === show(['Lanet']), show(remaining))

  const problems = session.problems.filter((text) => !text.includes('Autofill'))
  check('pencerelerde hata yok', problems.length === 0, show(problems.slice(0, 4)))

  const dataDir = session.dataDir
  await session.close()
  const again = await open('karakterler-yeniden', { dataDir })
  const reopened = (await again.menu.evaluate(() => window.dnd.getState())).app
  check(
    'kapatıp açınca etkiler, sınıflar ve istatistikler yerinde',
    reopened.players[0].effects.length === 1 && reopened.players[3].classId === 'buy' && reopened.players[3].abilities.int === 11 && reopened.classes.length === 2,
    show(reopened.players[0].effects)
  )
  info('oyun ekranı görüntüleri: e2e/.cikti/oyun/karakter-*.png')
})
