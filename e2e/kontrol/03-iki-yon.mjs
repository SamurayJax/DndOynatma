// İki yönlü tutarlılık: oyun ekranında fareyle taşınan, klavyeyle sıralanan ya da silinen görsel kontrol
// panelindeki "Ekrandakiler" listesine ve kütüphane rozetlerine yansır; oyun ekranında atama tuşuyla
// değişen pencere üst şeridi, pencere listesini ve rozetleri günceller; görsel oyun ekranında
// sürüklenirken kontrol panelinde yazılan etiket kaybolmaz.
import { check, getState, launch, run, seedFullSession, setContentSize, sleep, stagePoint, startGame, waitFor } from './harness.mjs'

/** Kontrol panelinin o an gösterdikleri. */
function readPanel() {
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null
  const all = (selector) => Array.from(document.querySelectorAll(selector))
  return {
    topScene: text('.ctl-topbar__scene-name'),
    topKey: text('.ctl-topbar .ctl-key'),
    activeScenes: all('.ctl-scene.is-active').map((button) => button.querySelector('.ctl-scene__name').textContent),
    target: text('.lib-target__name'),
    count: text('.ctl-count'),
    background: text('.ctl-stage__row--background .ctl-stage__name'),
    rows: all('.ctl-stage__row:not(.ctl-stage__row--background) .ctl-stage__name').map((name) => name.textContent),
    onStage: all('.lib-card.is-onstage .lib-card__name').map((name) => name.textContent).sort(),
    backgroundCards: all('.lib-card.is-background .lib-card__name').map((name) => name.textContent),
    focusedLabel: document.activeElement?.classList.contains('ctl-stage__label') ? document.activeElement.value : null
  }
}

await run(async () => {
  const session = await launch('iki-yon')
  const { sceneIds, library } = await seedFullSession(session)
  const { game, control } = await startGame(session)
  await setContentSize(session, 'control', 1600, 900)
  const panel = () => control.evaluate(readPanel)
  const scene = async (index = 0) => (await getState(control)).app.scenes[index]
  const nameOf = (imageId) => Object.values(library).flat().find((image) => image.id === imageId).originalName
  const expectedRows = (items) => items.map((item) => nameOf(item.imageId)).reverse()
  const center = (item) => stagePoint(game, item.x + item.width / 2, item.y + item.height / 2)

  let state = await scene()
  let shown = await panel()
  check('başlangıç: liste durumla aynı sırada (en üstteki başta)', JSON.stringify(shown.rows) === JSON.stringify(expectedRows(state.items)) && shown.count === '10', `${shown.rows.length} satır`)
  check('başlangıç: NPC bölmesinde ekrandaki 4 görsel rozetli', shown.onStage.length === 4, shown.onStage.join(', '))

  // --- Oyun ekranında Delete ---
  const victim = state.items[state.items.length - 1]
  let point = await center(victim)
  await game.mouse.click(point.x, point.y)
  await game.keyboard.press('Delete')
  state = await waitFor(scene, (current) => current.items.length === 9)
  await sleep(150)
  shown = await panel()
  check('oyun ekranında Delete: görsel durumdan kalkar', state.items.length === 9 && !state.items.some((item) => item.id === victim.id))
  check('oyun ekranında Delete: "Ekrandakiler" satırı ve sayacı güncellenir', shown.count === '9' && JSON.stringify(shown.rows) === JSON.stringify(expectedRows(state.items)), `sayaç ${shown.count}, ${shown.rows.length} satır`)
  check('oyun ekranında Delete: kütüphane rozeti kalkar', shown.onStage.length === 3 && !shown.onStage.includes(nameOf(victim.imageId)), shown.onStage.join(', '))

  // --- Sürüklerken etiket yazma ---
  const moved = state.items[state.items.length - 1]
  const label = control.locator('.ctl-stage__row:not(.ctl-stage__row--background) .ctl-stage__label').first()
  await label.click()
  await control.keyboard.press('Control+A')
  point = await center(moved)
  await game.mouse.move(point.x, point.y)
  await game.mouse.down()
  for (let step = 1; step <= 8; step++) await game.mouse.move(point.x - step * 20, point.y - step * 12)
  await control.keyboard.type('Sürüklenirken 7 LVL', { delay: 0 })
  let item = await waitFor(async () => (await scene()).items.find((entry) => entry.id === moved.id), (entry) => entry.label === 'Sürüklenirken 7 LVL')
  check('sürükleme sürerken yazılan etiket duruma ulaşır', item.label === 'Sürüklenirken 7 LVL' && item.x === moved.x && item.y === moved.y, `"${item.label}"`)
  await game.mouse.up()
  item = await waitFor(async () => (await scene()).items.find((entry) => entry.id === moved.id), (entry) => entry.x !== moved.x)
  await sleep(450)
  shown = await panel()
  check('bırakınca yeni yer kaydedilir, etiket kaybolmaz', item.x < moved.x && item.y < moved.y && item.label === 'Sürüklenirken 7 LVL', `x ${Math.round(moved.x)}→${Math.round(item.x)}, etiket "${item.label}"`)
  check('etiket alanı odakta kalır ve yazılanı gösterir', shown.focusedLabel === 'Sürüklenirken 7 LVL', String(shown.focusedLabel))
  await control.keyboard.type(' +1')
  item = await waitFor(async () => (await scene()).items.find((entry) => entry.id === moved.id), (entry) => entry.label.endsWith('+1'))
  check('taşımadan sonra yazmaya devam edilebilir, yer bozulmaz', item.label === 'Sürüklenirken 7 LVL +1' && item.x < moved.x, `"${item.label}"`)

  // --- Oyun ekranında klavyeyle sıralama ---
  await game.keyboard.press('End')
  state = await waitFor(scene, (current) => current.items[0].id === moved.id)
  await sleep(150)
  shown = await panel()
  check('oyun ekranında End (en arkaya): liste sırası güncellenir', state.items[0].id === moved.id && JSON.stringify(shown.rows) === JSON.stringify(expectedRows(state.items)), shown.rows.slice(-2).join(', '))
  check('sıralama değişse de odaktaki etiket alanı aynı görselde kalır', (await panel()).focusedLabel === 'Sürüklenirken 7 LVL +1')

  // --- Oyun ekranında atama tuşu ---
  await game.keyboard.press('Escape')
  await game.keyboard.press('2')
  await waitFor(async () => (await getState(control)).app.activeSceneId, (id) => id === sceneIds[1])
  await sleep(200)
  shown = await panel()
  state = await scene(1)
  check('oyun ekranında 2 tuşu: üst şerit yeni pencereyi gösterir', shown.topScene === 'Orman Yolu' && shown.topKey === '2', `${shown.topKey} ${shown.topScene}`)
  check('pencere listesinde yalnızca yeni pencere etkin', shown.activeScenes.length === 1 && shown.activeScenes[0] === 'Orman Yolu', shown.activeScenes.join(', '))
  check('kütüphanenin hedef penceresi güncellenir', shown.target === 'Orman Yolu', String(shown.target))
  check('"Ekrandakiler" yeni pencerenin görsellerini gösterir', shown.count === '2' && JSON.stringify(shown.rows) === JSON.stringify(expectedRows(state.items)) && shown.background === nameOf(state.background.imageId), `${shown.rows.join(', ')} · arka plan ${shown.background}`)
  check('NPC bölmesinde rozet yalnızca yeni pencerede duran görselde', JSON.stringify(shown.onStage) === JSON.stringify([library.npc[0].originalName]), shown.onStage.join(', '))
  await control.getByRole('tab', { name: /Sahneler/ }).click()
  await sleep(200)
  shown = await panel()
  check('Sahneler bölmesinde "arka plan" rozeti yeni pencerenin arka planında', JSON.stringify(shown.backgroundCards) === JSON.stringify([library.scene[0].originalName]), shown.backgroundCards.join(', '))

  // Atanmamış tuş hiçbir şeyi değiştirmez, uyarı da üretmez.
  await game.keyboard.press('9')
  await sleep(200)
  check('atanmamış tuş (9) pencereyi değiştirmez', (await getState(control)).app.activeSceneId === sceneIds[1])

  const notices = await control.locator('.ui-toast').count()
  check('işlemler sırasında bildirim çıkmadı', notices === 0)
  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
