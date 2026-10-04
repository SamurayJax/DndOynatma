// Uç durumlar: bomboş bir oturum (oyuncu, pencere, görsel yok) ve sınırları zorlayan içerik (en uzun
// adlar, 12 pencere, 2000 karakterlik not, can 0, seviye 99). İkisinde de yerleşim bozulmamalı.
import { check, getState, importImages, launch, probeLayout, run, setContentSize, shot, sleep, startGame, waitFor } from './harness.mjs'

const SIZES = [[1920, 1001], [1366, 728], [1100, 700], [672, 1001], [420, 650]]

/** Verilen boyutlarda (dar pencerede her sekmede) yerleşim sorunlarını toplar. */
async function layoutProblems(session, control, label) {
  const problems = []
  for (const [width, height] of SIZES) {
    const size = await setContentSize(session, 'control', width, height)
    if (size.width !== width) continue
    const tabs = width < 1100 ? ['Oyuncular', 'Kütüphane', 'Araçlar'] : [null]
    for (const tab of tabs) {
      if (tab !== null) await control.getByRole('tab', { name: tab, exact: true }).click()
      await sleep(250)
      const layout = await control.evaluate(probeLayout)
      const where = `${width}×${height}${tab === null ? '' : ` ${tab}`}`
      if (layout.pageOverflowX > 0 || layout.pageOverflowY > 0) problems.push(`${where}: sayfa taşıyor (${layout.pageOverflowX}, ${layout.pageOverflowY})`)
      if (layout.columnOverlap) problems.push(`${where}: sütunlar üst üste`)
      problems.push(...layout.problems.map((problem) => `${where}: ${problem}`))
    }
    if (width === 1920) await shot(control, `uc-${label}`)
  }
  return problems
}

await run(async () => {
  const session = await launch('uc')
  const { control } = await startGame(session)
  await setContentSize(session, 'control', 1920, 1001)
  const app = async () => (await getState(control)).app

  // --- Bomboş oturum ---
  const empty = await control.evaluate(() => ({
    players: document.querySelector('.ctl-col--players').textContent,
    library: document.querySelector('.lib-empty')?.textContent ?? '',
    scenes: document.querySelector('.ctl-col--side').textContent,
    top: document.querySelector('.ctl-topbar__scene').textContent,
    clearDisabled: Array.from(document.querySelectorAll('.ctl-stage button')).find((button) => button.textContent.trim() === 'Tümünü kaldır')?.disabled
  }))
  check('oyuncu yokken sütun ne yapılacağını söyler', empty.players.includes('Oyuncu profili yok') && empty.players.includes('Ayarlar'))
  check('kütüphane boşken yükleme yolu gösterilir', empty.library.includes('Bu bölmede görsel yok') && empty.library.includes('Görsel yükle'))
  check('pencere ve görsel yokken paneller boş durumlarını gösterir', empty.scenes.includes('Henüz pencere yok') && empty.scenes.includes('Ekranda görsel yok') && empty.top.includes('Pencere yok') && empty.clearDisabled === true)
  let problems = await layoutProblems(session, control, 'bos')
  check('boş oturumda yerleşim bozulmuyor (1920, 1366, 1100, 672, 420)', problems.length === 0, problems.slice(0, 6).join(' | '))

  await setContentSize(session, 'control', 1920, 1001)
  await control.getByRole('button', { name: 'd20 at' }).click()
  check('oyuncu ve pencere yokken de zar atılır', (await waitFor(async () => (await getState(control)).session.diceHistory.length, (count) => count === 1)) === 1)
  await control.getByRole('button', { name: 'Pencere ekle' }).click()
  const first = await waitFor(app, (current) => current.scenes.length === 1)
  await sleep(150)
  check('"+" ilk pencereyi "Pencere 1" adıyla ekler ve etkin yapar', first.scenes[0].name === 'Pencere 1' && first.activeSceneId === first.scenes[0].id && (await control.locator('.ctl-topbar__scene-name').textContent()) === 'Pencere 1')

  // --- Sınırları zorlayan içerik ---
  const wide = (length) => 'W'.repeat(length)
  const images = await importImages(session, 'npc', [`çok-uzun-adlı-görsel-${wide(90)}`, 'kısa'])
  await control.evaluate(
    ([names, note, sceneName, imageIds, label]) => {
      const d = window.dnd
      names.forEach((name, slot) => d.dispatch({ type: 'player/update', slot, patch: { name, level: 99, note } }))
      d.dispatch({ type: 'player/setHp', slot: 1, hp: 0 })
      for (let index = 0; index < 11; index++) {
        const sceneId = crypto.randomUUID()
        d.dispatch({ type: 'scene/add', sceneId, name: `${index} ${sceneName}` })
        if (index < 8) d.dispatch({ type: 'scene/update', sceneId, patch: { hotkey: index + 2 } })
      }
      imageIds.forEach((imageId) => {
        const itemId = crypto.randomUUID()
        d.dispatch({ type: 'stage/addItem', fallbackSceneId: crypto.randomUUID(), itemId, imageId })
      })
    },
    [[wide(24), 'İİİİİİİİİİİİİİİİİİİİİİİİ', wide(24), 'Şahin Çağrı Öztürkoğlu'], `${wide(60)} `.repeat(32), wide(38), [images[0].id, images[0].id, images[1].id], wide(40)]
  )
  const state = await waitFor(app, (current) => current.scenes.length === 12 && current.scenes[0].items.length === 3)
  for (const item of state.scenes[0].items) {
    await control.evaluate(([sceneId, itemId, label]) => window.dnd.dispatch({ type: 'stage/updateItem', sceneId, itemId, patch: { label } }), [state.scenes[0].id, item.id, wide(40)])
  }
  await sleep(400)

  const extreme = await control.evaluate(() => {
    const list = document.querySelector('.ctl-scenes')
    const side = document.querySelector('.ctl-col--side')
    const truncated = Array.from(document.querySelectorAll('.ctl-player__name, .ctl-scene__name, .ctl-stage__name, .lib-card__name, .ctl-topbar__scene-name'))
    return {
      cards: document.querySelectorAll('.ctl-player').length,
      down: document.querySelectorAll('.ctl-player.is-down').length,
      sceneButtons: list.querySelectorAll('.ctl-scene').length,
      listScrolls: list.scrollHeight > list.clientHeight,
      sideOverflow: side.scrollHeight - side.clientHeight,
      // Kısaltılan adın tamamı ipucunda (title) okunabilmeli.
      untitled: truncated.filter((el) => el.scrollWidth > el.clientWidth && !(el.title || el.closest('[title]')?.title)).map((el) => el.className)
    }
  })
  check('12 pencere: liste kendi içinde kayar, sağ sütunu taşırmaz', extreme.sceneButtons === 12 && extreme.listScrolls && extreme.sideOverflow <= 0, JSON.stringify(extreme))
  check('4 oyuncu kartı çizilir; canı 0 olan işaretlidir', extreme.cards === 4 && extreme.down === 1)
  check('kısaltılan her adın tamamı ipucunda okunur', extreme.untitled.length === 0, extreme.untitled.join(' | '))
  problems = await layoutProblems(session, control, 'dolu')
  check('en uzun içerikte yerleşim bozulmuyor (1920, 1366, 1100, 672, 420)', problems.length === 0, problems.slice(0, 8).join(' | '))

  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
