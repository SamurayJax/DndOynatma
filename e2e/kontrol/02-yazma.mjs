// Yazı güvenliği: giriş alanlarına yazılan rakamlar pencere değiştirmez; hızlı yazılan metin IPC gidiş
// dönüşünde kaybolmaz ya da sırası bozulmaz; `maxLength` değerleri TEXT_LIMITS ile aynıdır ve sınırdan
// uzun yapıştırma sınırda kesilir.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, dispatch, getState, importImages, launch, root, run, seedPlayers, seedScenes, setContentSize, sleep, startGame, waitFor } from './harness.mjs'

/** TEXT_LIMITS kaynağından okunur; sayılar buraya elle yazılsaydı sözleşme değişince denetim eskirdi. */
function readLimits() {
  const source = readFileSync(join(root, 'src/shared/reducer.ts'), 'utf8')
  const block = /TEXT_LIMITS = \{([^}]+)\}/.exec(source)?.[1] ?? ''
  return Object.fromEntries(Array.from(block.matchAll(/(\w+):\s*(\d+)/g), (match) => [match[1], Number(match[2])]))
}

/** Odaktaki alana yapıştırma gibi tek seferde metin ekler (kullanıcının panosuna dokunmadan). */
const paste = (page, text) => page.evaluate((value) => document.execCommand('insertText', false, value), text)
const activeValue = (page) => page.evaluate(() => document.activeElement.value)
const hasLoneSurrogate = (text) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)

await run(async () => {
  const limits = readLimits()
  check('TEXT_LIMITS okundu', ['playerName', 'playerNote', 'sceneName', 'itemLabel', 'generalNote'].every((key) => limits[key] > 0), JSON.stringify(limits))

  const session = await launch('yazma')
  const { menu } = session
  await seedPlayers(session, 2)
  const sceneIds = await seedScenes(session, [1, 2, 3, 4, 5].map((hotkey) => ({ name: `Pencere ${hotkey}`, hotkey })))
  const [image] = await importImages(session, 'enemy', ['kurt-adam'])
  const itemId = 'yazma-ogesi'
  await dispatch(menu, { type: 'stage/addItem', sceneId: sceneIds[0], fallbackSceneId: sceneIds[0], itemId, imageId: image.id })
  await dispatch(menu, { type: 'scene/setActive', sceneId: sceneIds[0] })

  // --- Ayarlar'daki alanlar ---
  await menu.getByRole('button', { name: 'Ayarlar' }).click()
  await menu.getByRole('tab', { name: /Oyuncular/ }).click()
  const nameLimits = await menu.locator('.set-player__name input').evaluateAll((inputs) => inputs.map((input) => input.maxLength))
  check('Ayarlar: oyuncu adı alanlarının sınırı TEXT_LIMITS.playerName', nameLimits.length === 4 && nameLimits.every((value) => value === limits.playerName), nameLimits.join(','))
  await menu.getByRole('tab', { name: /Pencereler/ }).click()
  const sceneLimits = await menu.locator('.set-scene__name input').evaluateAll((inputs) => inputs.map((input) => input.maxLength))
  check('Ayarlar: pencere adı alanlarının sınırı TEXT_LIMITS.sceneName', sceneLimits.length === 5 && sceneLimits.every((value) => value === limits.sceneName), sceneLimits.join(','))

  const { control } = await startGame(session)
  await setContentSize(session, 'control', 1600, 900)
  const activeScene = async () => (await getState(control)).app.activeSceneId
  const item = async () => (await getState(control)).app.scenes[0].items.find((entry) => entry.id === itemId)

  // --- Kontrol panelindeki alanların sınırları ---
  const controlLimits = await control.evaluate(() => {
    const max = (selector) => document.querySelector(selector)?.maxLength ?? null
    const unlimited = Array.from(document.querySelectorAll('.ctl-root input, .ctl-root textarea'))
      // Kaydırıcılar (ses düzeyi, ilerleme) yazı alanı değildir.
      .filter((field) => field.maxLength < 0 && field.type !== 'search' && field.type !== 'range')
      .map((field) => field.getAttribute('aria-label') ?? field.className)
    return { playerNote: max('.ctl-player__note'), generalNote: max('.ctl-note__input'), itemLabel: max('.ctl-stage__label'), unlimited }
  })
  check('oyuncu notu sınırı TEXT_LIMITS.playerNote', controlLimits.playerNote === limits.playerNote, String(controlLimits.playerNote))
  check('genel not sınırı TEXT_LIMITS.generalNote', controlLimits.generalNote === limits.generalNote, String(controlLimits.generalNote))
  check('etiket sınırı TEXT_LIMITS.itemLabel', controlLimits.itemLabel === limits.itemLabel, String(controlLimits.itemLabel))
  check('arama dışında sınırsız yazı alanı yok', controlLimits.unlimited.length === 0, controlLimits.unlimited.join(' | '))

  // --- Rakamlar pencere değiştirmez ---
  // Sızıntı olsaydı "12345" yazmak etkin pencereyi 5. pencereye götürürdü.
  const fields = [
    ['can hızlı girişi', control.locator('.ctl-hp__entry').first()],
    ['oyuncu notu', control.locator('.ctl-player__note').first()],
    ['genel not', control.locator('.ctl-note__input')],
    ['etiket', control.locator('.ctl-stage__label').first()],
    ['kütüphane araması', control.locator('.lib-search')]
  ]
  for (const [name, field] of fields) {
    await field.click()
    await control.keyboard.type('12345')
    await sleep(150)
    const value = await activeValue(control)
    check(`${name}: yazılan rakamlar alanda kalır, pencere değişmez`, value === '12345' && (await activeScene()) === sceneIds[0], `alan "${value}"`)
    await control.keyboard.press('Control+A')
    await control.keyboard.press('Delete')
  }
  await control.keyboard.press('Escape')

  await control.getByRole('button', { name: 'Düzenle', exact: true }).click()
  const sceneName = control.locator('dialog[open] .set-scene__name input').nth(1)
  await sceneName.click()
  await control.keyboard.press('Control+A')
  await control.keyboard.type('Kat 12345')
  check('pencere adı alanı: rakamlar pencere değiştirmez', (await activeScene()) === sceneIds[0] && (await activeValue(control)) === 'Kat 12345')
  check('düzenle kutusunda pencere adı sınırı TEXT_LIMITS.sceneName', (await sceneName.evaluate((input) => input.maxLength)) === limits.sceneName)
  await control.keyboard.press('Enter')
  const renamed = await waitFor(async () => (await getState(control)).app.scenes[1].name, (name) => name === 'Kat 12345')
  check('Enter pencere adını kaydeder', renamed === 'Kat 12345', renamed)
  // Odak bir düğmedeyken de kutu açık olduğu için rakam arkadaki pencereyi değiştirmemeli.
  await control.locator('dialog[open] .ui-modal__footer button').focus()
  await control.keyboard.type('345')
  await sleep(150)
  check('kutu açıkken (odak düğmede) rakamlar pencere değiştirmez', (await activeScene()) === sceneIds[0])
  await control.keyboard.press('Escape')
  await sleep(250)

  await control.getByRole('button', { name: 'Canı 1 artır' }).first().focus()
  await control.keyboard.press('3')
  const switched = await waitFor(activeScene, (id) => id === sceneIds[2], 2000)
  check('karşı denetim: odak yazı alanında değilken 3 tuşu 3. pencereye geçer', switched === sceneIds[2])
  await dispatch(control, { type: 'scene/setActive', sceneId: sceneIds[0] })
  await waitFor(activeScene, (id) => id === sceneIds[0])

  // --- Hızlı yazı ---
  const phrase = 'Şövalye 3 iksir içti, 2 gümüş ödedi; ğüşiöç ĞÜŞİÖÇ ıI. '
  const long = phrase.repeat(4).slice(0, 200)

  const note = control.locator('.ctl-player__note').first()
  await note.click()
  await control.keyboard.type(long, { delay: 0 })
  let saved = await waitFor(async () => (await getState(control)).app.players[0].note, (text) => text === long, 3000)
  check('oyuncu notu: 200 karakter hızlı yazıldı, durumla birebir aynı', saved === long && (await note.inputValue()) === long, `durum ${saved.length} karakter`)
  // İmleç başa alınıp yazılınca metin başa eklenmeli; gidiş dönüş imleci sona atarsa sona eklenirdi.
  await control.keyboard.press('Control+Home')
  await control.keyboard.type('BAŞA: ', { delay: 0 })
  saved = await waitFor(async () => (await getState(control)).app.players[0].note, (text) => text === `BAŞA: ${long}`, 3000)
  check('oyuncu notu: imleç başta iken yazılan metin başa eklenir', saved === `BAŞA: ${long}`, saved.slice(0, 24))
  await control.locator('.ctl-topbar__title').click()
  await sleep(500)
  check('oyuncu notu: odak çıkınca metin değişmez', (await note.inputValue()) === `BAŞA: ${long}`)

  const general = control.locator('.ctl-note__input')
  await general.click()
  await control.keyboard.type(long, { delay: 0 })
  saved = await waitFor(async () => (await getState(control)).app.generalNote, (text) => text === long, 3000)
  check('genel not: 200 karakter hızlı yazıldı, durumla birebir aynı', saved === long && (await general.inputValue()) === long, `durum ${saved.length} karakter`)

  const label = control.locator('.ctl-stage__label').first()
  await label.click()
  await control.keyboard.type(long, { delay: 0 })
  const expected = long.slice(0, limits.itemLabel)
  saved = await waitFor(async () => (await item()).label, (text) => text === expected, 3000)
  check('etiket: hızlı yazılan metin sınırda kesilir, durumla birebir aynı', saved === expected && (await label.inputValue()) === expected, `"${saved}"`)

  // --- Sınırdan uzun yapıştırma ---
  await control.keyboard.press('Control+A')
  await paste(control, 'E'.repeat(limits.itemLabel * 3))
  saved = await waitFor(async () => (await item()).label, (text) => text.length === limits.itemLabel && text.startsWith('E'), 3000)
  check('etiket: uzun yapıştırma sınırda kesilir', saved === 'E'.repeat(limits.itemLabel) && (await label.inputValue()) === saved, `${saved.length} karakter`)

  // Sınır, iki birimlik bir karakterin (emoji) ortasına denk gelirse kayıtta yarım karakter kalmamalı.
  await control.keyboard.press('Control+A')
  await paste(control, `${'a'.repeat(limits.itemLabel - 1)}🐉🐉`)
  await sleep(400)
  saved = (await item()).label
  const shownLabel = await label.inputValue()
  check('etiket: sınırdaki emoji yarım kalmaz', !hasLoneSurrogate(saved) && !hasLoneSurrogate(shownLabel) && saved === shownLabel, `durum ${saved.length} birim, alan ${shownLabel.length} birim`)

  await note.click()
  await control.keyboard.press('Control+A')
  await paste(control, 'n'.repeat(limits.playerNote + 500))
  saved = await waitFor(async () => (await getState(control)).app.players[0].note, (text) => text.length === limits.playerNote && text.startsWith('n'), 3000)
  check('oyuncu notu: uzun yapıştırma sınırda kesilir', saved.length === limits.playerNote && (await note.inputValue()) === saved, `${saved.length} karakter`)

  await general.click()
  await control.keyboard.press('Control+A')
  const started = Date.now()
  await paste(control, 'g'.repeat(limits.generalNote + 5000))
  saved = await waitFor(async () => (await getState(control)).app.generalNote, (text) => text.length === limits.generalNote && text.startsWith('g'), 5000)
  check('genel not: uzun yapıştırma sınırda kesilir', saved.length === limits.generalNote && (await general.inputValue()) === saved, `${saved.length} karakter, ${Date.now() - started} ms`)
  // Dolu notta yazmaya devam etmek paneli kilitlememeli: her tuş 20 000 karakterlik metni gönderir.
  await control.keyboard.press('Control+A')
  await paste(control, 'g'.repeat(limits.generalNote - 60))
  const typingStarted = Date.now()
  await control.keyboard.type('son satır: 0123456789 '.repeat(2), { delay: 0 })
  const tail = 'son satır: 0123456789 '.repeat(2)
  saved = await waitFor(async () => (await getState(control)).app.generalNote, (text) => text.endsWith(tail), 5000)
  check('genel not: dolmak üzereyken yazı kaybolmaz', saved.endsWith(tail) && saved.length === limits.generalNote - 60 + tail.length, `${Date.now() - typingStarted} ms`)

  // --- Alandan klavyeyle çıkış ---
  // Etiketi ya da notu yazıp hemen atama tuşuna basan DM pencere değiştirebilmeli; rakam alana yazılmamalı.
  const labelBefore = (await item()).label
  await label.click()
  await control.keyboard.press('Enter')
  await control.keyboard.press('2')
  let reached = await waitFor(activeScene, (id) => id === sceneIds[1], 2000)
  check('etiket: Enter alandan çıkar; ardından 2 tuşu pencere değiştirir, etikete yazılmaz', reached === sceneIds[1] && (await getState(control)).app.scenes[0].items[0].label === labelBefore)
  const noteBefore = (await getState(control)).app.players[0].note
  await note.click()
  await control.keyboard.press('Escape')
  await control.keyboard.press('3')
  reached = await waitFor(activeScene, (id) => id === sceneIds[2], 2000)
  check('oyuncu notu: Escape alandan çıkar; ardından 3 tuşu pencere değiştirir, nota yazılmaz', reached === sceneIds[2] && (await getState(control)).app.players[0].note === noteBefore)
  await general.click()
  await control.keyboard.press('Escape')
  await control.keyboard.press('4')
  reached = await waitFor(activeScene, (id) => id === sceneIds[3], 2000)
  check('genel not: Escape alandan çıkar; ardından 4 tuşu pencere değiştirir', reached === sceneIds[3])
  await control.locator('.ctl-hp__entry').first().click()
  await control.keyboard.press('Escape')
  await control.keyboard.press('5')
  reached = await waitFor(activeScene, (id) => id === sceneIds[4], 2000)
  check('can hızlı girişi: boşken Escape alandan çıkar; ardından 5 tuşu pencere değiştirir', reached === sceneIds[4])

  const errors = await control.locator('.ui-toast--error, .ui-toast--warning').count()
  check('yazı sırasında uyarı ya da hata bildirimi çıkmadı', errors === 0)
  check('sayfa hatası yok', session.pageErrors.length === 0, session.pageErrors.join(' | '))
})
