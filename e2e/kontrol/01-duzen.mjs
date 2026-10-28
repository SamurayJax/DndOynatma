// Yerleşim: 1920×1080'de dolu bir oturum (4 oyuncu, 6 pencere, 10 görsel, 150 kütüphane görseli),
// "Pencereleri düzenle" kutusu (iç kaydırma, iç içe Escape, kırılma noktası), dar pencere (tek monitör)
// ve kalem renklerinin oyun ekranında çizilenle aynı olması.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, getState, info, launch, probeLayout, root, run, seedFullSession, setContentSize, shot, sleep, startGame, waitFor } from './harness.mjs'

function probeDialogs() {
  return Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => {
    const box = dialog.getBoundingClientRect()
    const body = dialog.querySelector('.ui-modal__body')
    const list = dialog.querySelector('.set-scenes__list')
    const add = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Yeni pencere')
    const addBox = add?.getBoundingClientRect()
    return {
      title: dialog.querySelector('.ui-modal__title')?.textContent ?? '',
      width: box.width,
      height: box.height,
      visible: dialog.checkVisibility() && box.width > 0 && box.height > 0,
      bodyScroll: body.scrollHeight - body.clientHeight,
      listScroll: list ? list.scrollHeight - list.clientHeight : null,
      addInView: addBox ? addBox.top >= box.top && addBox.bottom <= box.bottom : null,
      viewport: window.innerHeight
    }
  })
}

const rgb = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}

await run(async () => {
  const session = await launch('duzen')
  await seedFullSession(session)

  // --- Ayarlar'daki arka plan seçici (iç içe olmayan hali) ---
  const { menu } = session
  await menu.getByRole('button', { name: 'Ayarlar' }).click()
  await menu.getByRole('tab', { name: /Pencereler/ }).click()
  await menu.getByRole('button', { name: 'Arka plan seç', exact: true }).first().click()
  const pickerOpen = await menu.locator('dialog[open]').count()
  await menu.keyboard.press('Escape')
  await sleep(250)
  check('Ayarlar: arka plan seçici açılır, Escape ile kapanır, sekme yerinde kalır', pickerOpen === 1 && (await menu.locator('dialog[open]').count()) === 0 && (await menu.locator('.set-scenes__list').isVisible()))

  const { control } = await startGame(session)
  const openEditor = () => control.getByRole('button', { name: 'Düzenle', exact: true }).click()
  const dialogs = () => control.evaluate(probeDialogs)

  // --- 1920×1080 ve 1080p monitörde büyütülmüş pencere (görev çubuğu + başlık düşülmüş) ---
  for (const [width, height] of [[1920, 1080], [1920, 1001]]) {
    const size = await setContentSize(session, 'control', width, height)
    if (size.width !== width || size.height !== height) {
      info(`${width}×${height} bu ekrana sığmıyor (gelen ${size.width}×${size.height}); bu boyut atlandı`)
      continue
    }
    await sleep(400)
    const layout = await control.evaluate(probeLayout)
    const tag = `${width}×${height}`
    check(`${tag}: üç sütun yan yana, sekme şeridi gizli`, layout.visibleColumns === 3 && !layout.tabsShown && !layout.columnOverlap)
    check(`${tag}: sayfa taşmıyor`, layout.pageOverflowX <= 0 && layout.pageOverflowY <= 0, `x ${layout.pageOverflowX}, y ${layout.pageOverflowY}`)
    check(`${tag}: 4 oyuncu kartı kaydırmadan sığıyor`, layout.cards === 4 && layout.playersScroll <= 0, `kaydırma ${layout.playersScroll}px`)
    check(`${tag}: sağ sütunun beş paneli kaydırmadan sığıyor`, layout.sideScroll <= 0, `kaydırma ${layout.sideScroll}px`)
    check(`${tag}: ekrandakiler listesinde arka plan + 10 görsel`, layout.stageRows === 11, `${layout.stageRows} satır`)
    check(`${tag}: üst üste binen, taşan ya da kırpılan kontrol yok`, layout.problems.length === 0, layout.problems.slice(0, 6).join(' | '))
    if (height === 1080) await shot(control, 'duzen-1920')
  }

  // --- "Pencereleri düzenle": belirli yükseklik, liste kendi içinde kayar ---
  await openEditor()
  await sleep(300)
  let [editor] = await dialogs()
  check('düzenle kutusunun yüksekliği belirli (min(760, pencere − 48))', Math.abs(editor.height - Math.min(760, editor.viewport - 48)) <= 1, `${editor.height}px`)
  check('kutunun gövdesi kaymıyor, liste kendi içinde kayıyor', editor.bodyScroll <= 0 && editor.listScroll > 0, `gövde ${editor.bodyScroll}px, liste ${editor.listScroll}px`)
  await control.evaluate(() => document.querySelector('dialog[open] .set-scenes__list').scrollTo(0, 99999))
  ;[editor] = await dialogs()
  check('liste sona kaydırılınca "Yeni pencere" başlığı yerinde', editor.addInView === true)
  await shot(control, 'duzen-kutu')

  const before = (await getState(control)).app.scenes.length
  await control.evaluate(() => document.querySelector('dialog[open] .set-scenes__list').scrollTo(0, 0))
  await control.getByRole('button', { name: 'Yeni pencere', exact: true }).click()
  const added = await waitFor(async () => (await getState(control)).app.scenes, (scenes) => scenes.length === before + 1)
  await sleep(250)
  const focus = await control.evaluate(() => {
    const active = document.activeElement
    const list = document.querySelector('dialog[open] .set-scenes__list').getBoundingClientRect()
    const box = active.getBoundingClientRect()
    return { isInput: active instanceof HTMLInputElement, value: active.value, inView: box.top >= list.top && box.bottom <= list.bottom }
  })
  check('"Yeni pencere": satır eklenir, ad alanı odakta ve görünür', added.length === before + 1 && focus.isInput && focus.inView && focus.value === added[added.length - 1].name, JSON.stringify(focus))

  // --- İç içe kutuda Escape yalnızca içtekini kapatır ---
  await control.getByRole('button', { name: 'Arka plan seç', exact: true }).first().click()
  await sleep(300)
  let open = await dialogs()
  check('arka plan seçici düzenle kutusunun üstünde açılır', open.length === 2 && open.every((dialog) => dialog.visible), open.map((dialog) => dialog.title).join(' | '))
  await control.keyboard.press('Escape')
  await sleep(300)
  open = await dialogs()
  check('Escape yalnızca seçiciyi kapatır', open.length === 1 && open[0].title === 'Pencereleri düzenle', open.map((dialog) => dialog.title).join(' | '))

  // Seçiciden görsel seçmek de yalnızca seçiciyi kapatır.
  await control.getByRole('button', { name: 'Arka plan seç', exact: true }).last().click()
  await control.locator('.set-picker__item').first().click()
  const picked = await waitFor(async () => (await getState(control)).app.scenes.at(-1).background, (background) => background !== null)
  await sleep(250)
  open = await dialogs()
  check('seçiciden görsel seçilince arka plan konur, düzenle kutusu açık kalır', picked !== null && open.length === 1 && open[0].title === 'Pencereleri düzenle')

  // Silme onayı düzenle kutusunun üstünde açılır; vazgeçmek de onaylamak da düzenle kutusunu kapatmaz.
  const removeLast = () => control.locator('dialog[open] .set-scene').last().getByRole('button', { name: 'Pencereyi sil' }).click()
  await removeLast()
  await sleep(250)
  open = await dialogs()
  const confirmOnTop = open.length === 2 && open.some((dialog) => dialog.title.includes('silinsin mi'))
  await control.keyboard.press('Escape')
  await sleep(250)
  open = await dialogs()
  check('silme onayında Escape yalnızca onayı kapatır, pencere silinmez', confirmOnTop && open.length === 1 && (await getState(control)).app.scenes.length === before + 1, open.map((dialog) => dialog.title).join(' | '))
  await removeLast()
  await control.locator('dialog[open]').last().getByRole('button', { name: 'Sil', exact: true }).click()
  const remaining = await waitFor(async () => (await getState(control)).app.scenes.length, (count) => count === before)
  await sleep(250)
  open = await dialogs()
  check('silme onaylanınca pencere silinir, düzenle kutusu açık kalır', remaining === before && open.length === 1 && open[0].title === 'Pencereleri düzenle')
  await control.keyboard.press('Escape')
  await sleep(300)
  check('ikinci Escape düzenle kutusunu kapatır', (await dialogs()).length === 0)

  // --- Kutu açıkken pencere kırılma noktasının altına iner ---
  await openEditor()
  await sleep(200)
  await setContentSize(session, 'control', 700, 900)
  await sleep(300)
  ;[editor] = await dialogs()
  check('pencere daralınca (sütun gizlenir) açık kutu görünür kalır', editor !== undefined && editor.visible, JSON.stringify(editor))
  check('dar pencerede kutu pencereye sığar', editor !== undefined && editor.width <= 700 - 32 + 1 && editor.height <= 900 - 48 + 1)
  await control.keyboard.press('Escape')
  await sleep(300)
  await control.getByRole('tab', { name: 'Kütüphane', exact: true }).click()
  check('kutu kapanınca sayfa yeniden kullanılabilir', (await control.locator('.ctl-control').getAttribute('data-view')) === 'library' && (await dialogs()).length === 0)

  // --- Dar pencere: tek monitörde %35 genişlik ve en küçük genişlik ---
  for (const [width, height] of [[672, 1001], [420, 650]]) {
    await setContentSize(session, 'control', width, height)
    const tag = `${width}×${height}`
    const problems = []
    let overflow = 0
    for (const tab of ['Oyuncular', 'Kütüphane', 'Araçlar']) {
      await control.getByRole('tab', { name: tab, exact: true }).click()
      await sleep(250)
      const layout = await control.evaluate(probeLayout)
      if (layout.visibleColumns !== 1 || !layout.tabsShown) problems.push(`${tab}: ${layout.visibleColumns} sütun görünüyor`)
      overflow = Math.max(overflow, layout.pageOverflowX, layout.pageOverflowY)
      problems.push(...layout.problems.map((problem) => `${tab}: ${problem}`))
      if (width === 420) await shot(control, `duzen-420-${tab}`)
    }
    check(`${tag}: sekmeli düzen, her sekmede tek sütun, sayfa taşmıyor`, overflow <= 0 && !problems.some((problem) => problem.includes('sütun')), `taşma ${overflow}px`)
    check(`${tag}: üst üste binen, taşan ya da kırpılan kontrol yok`, problems.length === 0, problems.slice(0, 6).join(' | '))

    // Sık yapılan işler dar düzende de tek tıkla yapılabiliyor.
    const start = await getState(control)
    await control.getByRole('tab', { name: 'Oyuncular', exact: true }).click()
    await control.getByRole('button', { name: 'Canı 1 azalt' }).first().click()
    await control.getByRole('tab', { name: 'Kütüphane', exact: true }).click()
    await control.locator('.lib-card__main').first().click()
    await control.getByRole('tab', { name: 'Araçlar', exact: true }).click()
    await control.getByRole('button', { name: 'd20 at' }).click()
    await control.locator('.ctl-scene').nth(1).click()
    const end = await waitFor(() => getState(control), (state) => state.session.diceHistory.length > start.session.diceHistory.length && state.app.activeSceneId !== start.app.activeSceneId)
    const startItems = start.app.scenes.find((scene) => scene.id === start.app.activeSceneId).items.length
    const endItems = end.app.scenes.find((scene) => scene.id === start.app.activeSceneId).items.length
    check(
      `${tag}: can, görsel koyma, zar ve pencere geçişi çalışıyor`,
      end.app.players[0].hp === start.app.players[0].hp - 1 && endItems === startItems + 1 && end.session.diceHistory.length === start.session.diceHistory.length + 1 && end.app.activeSceneId !== start.app.activeSceneId,
      `can ${start.app.players[0].hp}→${end.app.players[0].hp}, görsel ${startItems}→${endItems}, zar ${end.session.diceHistory.length}`
    )
    await control.locator('.ctl-scene').first().click()
    // Zar düğmesinin bekleme süresi bir sonraki turdan önce bitsin.
    await sleep(1300)
  }

  // --- Kalem renkleri oyun ekranında çizilenle aynı ---
  const drawing = readFileSync(join(root, 'src/renderer/src/game/DrawingLayer.tsx'), 'utf8')
  const drawn = { red: /'pen-red':\s*\{\s*color:\s*'(#[0-9a-f]{6})'/i.exec(drawing)?.[1], black: /'pen-black':\s*\{\s*color:\s*'(#[0-9a-f]{6})'/i.exec(drawing)?.[1] }
  const swatches = await control.evaluate(() => {
    const color = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor
    return { red: color('.ctl-tool--pen-red .ctl-tool__swatch'), black: color('.ctl-tool--pen-black .ctl-tool__swatch') }
  })
  check('DrawingLayer.tsx içinde iki kalem rengi bulundu', Boolean(drawn.red && drawn.black), JSON.stringify(drawn))
  check('kırmızı kalem örneği çizilen renkle aynı', drawn.red !== undefined && swatches.red === rgb(drawn.red), `${swatches.red} / ${drawn.red}`)
  check('siyah kalem örneği çizilen renkle aynı', drawn.black !== undefined && swatches.black === rgb(drawn.black), `${swatches.black} / ${drawn.black}`)

  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
