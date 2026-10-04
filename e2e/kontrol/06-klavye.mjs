// Yalnızca klavyeyle en sık yapılan işler (can değiştirme, zar atma, pencere geçişi, görsel koyma),
// Tab durak sayısı ve odak halkasının görünürlüğü.
import { check, getState, info, launch, run, seedFullSession, setContentSize, sleep, startGame, waitFor } from './harness.mjs'

/** Sayfada çalışır: Tab ile ulaşılan öğeler ve odak halkası kırpılanlar. */
function probeTabStops() {
  const shown = (el) => el.getClientRects().length > 0
  const stops = Array.from(document.querySelectorAll('.ctl-root :is(button, input, textarea, select, [tabindex])')).filter(
    (el) => shown(el) && !el.disabled && el.tabIndex >= 0
  )
  const within = (selector) => stops.filter((el) => el.closest(selector) !== null).length
  const nameOf = (el) => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24) || String(el.className)

  // Halka öğenin dışına taşar (kalınlık + boşluk); taşanı kesen bir kap halkayı görünmez yapar.
  const clipped = []
  for (const el of stops) {
    // Halka yalnızca odaktayken çizilir; ölçü için öğe geçici olarak odaklanır.
    el.focus({ preventScroll: true })
    const focused = getComputedStyle(el)
    // Yazı alanlarında halka çerçeve + 2 piksellik gölgedir.
    const reach = focused.outlineStyle === 'none' ? 2 : Math.max(0, Number.parseFloat(focused.outlineOffset) + Number.parseFloat(focused.outlineWidth))
    const box = el.getBoundingClientRect()
    for (let parent = el.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent)
      const clipsX = parentStyle.overflowX !== 'visible'
      const clipsY = parentStyle.overflowY !== 'visible'
      if (!clipsX && !clipsY) continue
      const margin = parentStyle.overflowX === 'clip' ? Number.parseFloat(parentStyle.overflowClipMargin) || 0 : 0
      const area = parent.getBoundingClientRect()
      const lostX = clipsX ? Math.max(area.left - margin - (box.left - reach), box.right + reach - (area.right + margin)) : 0
      // Dikeyde kayan kapta kenardaki öğe kaydırılınca görünür; yalnızca kaymayan kap sayılır.
      const scrollsY = parent.scrollHeight > parent.clientHeight
      const lostY = clipsY && !scrollsY ? Math.max(area.top - margin - (box.top - reach), box.bottom + reach - (area.bottom + margin)) : 0
      if (lostX > 1.5 || lostY > 1.5) clipped.push(`${nameOf(el)} (${String(parent.className).split(' ')[0]}, ${Math.round(Math.max(lostX, lostY))}px)`)
      break
    }
  }
  document.activeElement?.blur()
  return { total: stops.length, players: within('.ctl-col--players'), library: within('.ctl-col--library'), side: within('.ctl-col--side'), stage: within('.ctl-stage'), clipped: Array.from(new Set(clipped)) }
}

function focusInfo() {
  const el = document.activeElement
  if (el === null || el === document.body) return { none: true }
  const style = getComputedStyle(el)
  const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2
  return {
    name: el.getAttribute('aria-label') || (el.querySelector('.lib-card__name') ?? el).textContent.trim().slice(0, 30),
    className: String(el.className),
    value: 'value' in el ? el.value : null,
    invalid: el.getAttribute('aria-invalid') === 'true',
    // Düğmelerde çizgi (outline), yazı alanlarında vurgulu çerçeve + gölge.
    ring: el.matches(':focus-visible') && (outline || style.boxShadow !== 'none')
  }
}

await run(async () => {
  const session = await launch('klavye')
  const { sceneIds } = await seedFullSession(session)
  const { control } = await startGame(session)
  await setContentSize(session, 'control', 1920, 1001)
  const focus = () => control.evaluate(focusInfo)
  const app = async () => (await getState(control)).app
  const hp = async () => (await app()).players[0].hp
  const rolls = async () => (await getState(control)).session.diceHistory.length
  const rings = []

  /** Odak verilen öğeye gelene kadar Tab'a basar; kaç basış sürdüğünü döndürür. */
  const tabTo = async (selector, key = 'Tab', limit = 250) => {
    for (let presses = 1; presses <= limit; presses++) {
      await control.keyboard.press(key)
      if (await control.evaluate((target) => document.activeElement?.matches(target) ?? false, selector)) {
        const state = await focus()
        rings.push([selector, state.ring])
        return presses
      }
    }
    return -1
  }

  // --- Durak sayısı ve halka kırpılması ---
  const stops = await control.evaluate(probeTabStops)
  info(`Tab durakları: toplam ${stops.total} (oyuncular ${stops.players}, kütüphane ${stops.library}, sağ sütun ${stops.side}; "Ekrandakiler" ${stops.stage})`)
  check('kütüphane, görsel sayısından bağımsız olarak az sayıda Tab durağı ekler', stops.library <= 10, `${stops.library} durak (30 görsel açık)`)
  check('hiçbir kontrolün odak halkası kırpılmıyor', stops.clipped.length === 0, stops.clipped.slice(0, 8).join(' | '))

  // --- Can ---
  await control.locator('.ctl-topbar__title').click()
  let presses = await tabTo('[data-slot="0"] [aria-label="Canı 1 azalt"]')
  check('can düğmesine Tab ile ulaşılır', presses > 0 && presses <= 6, `${presses} basış`)
  await control.keyboard.press('Enter')
  await control.keyboard.press('Space')
  check('−1: Enter ve Boşluk canı azaltır', (await waitFor(hp, (value) => value === 8)) === 8)
  await control.keyboard.press('Tab')
  await control.keyboard.press('Enter')
  check('+1: Enter canı artırır', (await waitFor(hp, (value) => value === 9)) === 9 && (await focus()).name === 'Canı 1 artır')
  await tabTo('[data-slot="0"] .ctl-hp__entry')
  await control.keyboard.type('-4')
  await control.keyboard.press('Enter')
  let state = await focus()
  check('hızlı giriş "-4": can 4 azalır, alan boşalır ve odakta kalır', (await waitFor(hp, (value) => value === 5)) === 5 && state.className.includes('ctl-hp__entry') && state.value === '', JSON.stringify(state))
  await control.keyboard.type('+2')
  await control.keyboard.press('Enter')
  check('hızlı giriş art arda: "+2" canı 7 yapar', (await waitFor(hp, (value) => value === 7)) === 7)
  await control.keyboard.type('10')
  await control.keyboard.press('Enter')
  check('hızlı giriş işaretsiz "10": canı 10 yapar', (await waitFor(hp, (value) => value === 10)) === 10)
  await control.keyboard.type('x')
  await control.keyboard.press('Enter')
  state = await focus()
  check('hızlı giriş geçersiz metin: alan hatalı işaretlenir, can değişmez', state.invalid && state.value === 'x' && (await hp()) === 10, JSON.stringify(state))
  await control.keyboard.press('Escape')
  state = await focus()
  check('Escape hızlı girişi temizler, odak alanda kalır', state.value === '' && !state.invalid && state.className.includes('ctl-hp__entry'), JSON.stringify(state))
  await control.keyboard.press('Escape')
  check('boş hızlı girişte Escape odaktan çıkar', (await focus()).none === true)
  await control.locator('.ctl-topbar__title').click()

  // --- Görsel koyma ---
  presses = await tabTo('.lib-tabs [role="tab"]')
  check('kütüphane sekmelerine Tab ile ulaşılır', presses > 0, `${presses} basış`)
  for (let i = 0; i < 4; i++) await control.keyboard.press('ArrowRight')
  state = await focus()
  check('ok tuşları bölme değiştirir (Düşmanlar)', state.name.startsWith('Düşmanlar') || state.className.includes('ui-tab'), state.name)
  presses = await tabTo('.lib-card__main')
  check('sekmelerden ilk karta birkaç Tab ile geçilir', presses > 0 && presses <= 4, `${presses} basış`)
  const before = (await app()).scenes[0].items.length
  const firstCard = (await focus()).name
  await control.keyboard.press('Enter')
  let items = await waitFor(async () => (await app()).scenes[0].items.length, (count) => count === before + 1)
  await sleep(200)
  state = await focus()
  check('Enter görseli oyun ekranına koyar; odak kartta kalır', items === before + 1 && state.className.includes('lib-card__main') && state.name === firstCard, state.name)
  await control.keyboard.press('ArrowRight')
  await control.keyboard.press('ArrowDown')
  const moved = await focus()
  await control.keyboard.press('Enter')
  items = await waitFor(async () => (await app()).scenes[0].items.length, (count) => count === before + 2)
  rings.push(['ok tuşuyla gelinen kart', moved.ring])
  check('ok tuşlarıyla başka karta geçilir ve Enter onu da koyar', items === before + 2 && moved.className.includes('lib-card__main') && moved.name !== firstCard, moved.name)
  presses = await tabTo(':not(.ctl-col--library *)')
  check('ızgaradan birkaç Tab ile çıkılır (bütün kartları dolaşmadan)', presses > 0 && presses <= 4, `${presses} basış`)

  // --- Zar ---
  presses = await tabTo('.ctl-dice__btn')
  check('zar düğmesine Tab ile ulaşılır', presses > 0, `${presses} basış`)
  await control.keyboard.press('Enter')
  check('Enter zar atar', (await waitFor(rolls, (count) => count === 1)) === 1)
  await control.keyboard.press('Enter')
  await sleep(200)
  state = await focus()
  check('bekleme süresinde ikinci Enter yeni atış yapmaz; odak düğmede kalır', (await rolls()) === 1 && state.className.includes('ctl-dice__btn'))
  await sleep(1300)
  await control.keyboard.press('Space')
  check('bekleme bitince Boşluk yeniden atar', (await waitFor(rolls, (count) => count === 2)) === 2)

  // --- Pencere geçişi ---
  await control.keyboard.press('2')
  check('odak düğmedeyken 2 tuşu 2. pencereye geçer', (await waitFor(async () => (await app()).activeSceneId, (id) => id === sceneIds[1])) === sceneIds[1])
  presses = await tabTo('.ctl-scene')
  await control.keyboard.press('Enter')
  check('pencere düğmesine Tab ile gelinir; Enter o pencereye geçer', presses > 0 && (await waitFor(async () => (await app()).activeSceneId, (id) => id === sceneIds[0])) === sceneIds[0], `${presses} basış`)

  // --- Onay kutusu klavyeyle ---
  await tabTo('.ctl-stage .ui-panel__header button')
  await control.keyboard.press('Enter')
  await sleep(250)
  state = await focus()
  check('"Tümünü kaldır" onayında ilk odak "Vazgeç"te', state.name === 'Vazgeç', state.name)
  await control.keyboard.press('Escape')
  await sleep(250)
  state = await focus()
  check('Escape onayı kapatır, odak düğmeye döner, görseller durur', state.name === 'Tümünü kaldır' && (await app()).scenes[0].items.length === before + 2, state.name)

  const missing = rings.filter(([, ring]) => !ring).map(([name]) => name)
  check('klavyeyle gelinen her öğede odak halkası çiziliyor', missing.length === 0, missing.join(' | '))
  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
