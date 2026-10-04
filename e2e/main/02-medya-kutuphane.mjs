// Görsel protokolü (dnd-media), yükleme uç durumları, portre ve kütüphaneden silme.
// Çalıştırma: node e2e/main/02-medya-kutuphane.mjs [--gercek-cop]
//
// Silinen görsel normalde geri dönüşüm kutusuna gider. Kullanıcının kutusu her denemede
// dolmasın diye varsayılan çalıştırmada shell.trashItem sahtesiyle değiştirilir (dosyayı
// geçici bir klasöre taşır). `--gercek-cop` ile gerçek kutu kullanılır: iki küçük PNG gider.
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makePng } from '../fixtures.mjs'
import { check, hasCode, info, lastRunEntries, launch, makeWorkDir, menuPage, quitFromUi, run, sleep, waitFor } from './harness.mjs'

const realTrash = process.argv.includes('--gercek-cop')

const imagesIn = (work) => readdirSync(join(work.dataDir, 'gorseller')).sort()
const stateOf = (page) => page.evaluate(() => window.dnd.getState())
const codeCount = (work, code) => lastRunEntries(work.dataDir).filter((entry) => entry.includes(`[${code}]`)).length

await run(async () => {
  const work = makeWorkDir('medya')
  const sample = (name, data) => {
    const file = join(work.samplesDir, name)
    writeFileSync(file, data)
    return file
  }
  const png = sample('ornek.png', makePng(64, 48))
  const session = await launch(work)
  const menu = await menuPage(session)

  // ---------- görsel protokolü ----------
  const imported = await menu.evaluate((file) => window.dnd.library.importFiles('npc', [file]), png)
  const image = imported.added[0]
  check('importFiles PNG ekler', imported.added.length === 1 && imported.skipped.length === 0 && imported.canceled === false, JSON.stringify(imported.skipped))
  check('dosya gorseller/ altına kopyalanır', image !== undefined && existsSync(join(work.dataDir, 'gorseller', image.fileName)), image?.fileName)
  check('boyut başlıktan okunur', image?.width === 64 && image?.height === 48, `${image?.width}x${image?.height}`)

  const loaded = await menu.evaluate(
    (fileName) =>
      new Promise((done) => {
        const img = new Image()
        img.onload = () => done({ ok: true, width: img.naturalWidth, height: img.naturalHeight, src: img.src })
        img.onerror = () => done({ ok: false, src: img.src })
        img.src = window.dnd.mediaUrl(fileName)
      }),
    image.fileName
  )
  check('<img> dnd-media adresinden yüklenir', loaded.ok && loaded.width === 64 && loaded.height === 48, JSON.stringify(loaded))

  const fetched = await menu.evaluate(async (fileName) => {
    try {
      const response = await fetch(window.dnd.mediaUrl(fileName))
      const body = await response.arrayBuffer()
      return { status: response.status, type: response.headers.get('content-type'), bytes: body.byteLength }
    } catch (error) {
      return { error: String(error) }
    }
  }, image.fileName)
  const sourceBytes = readFileSync(png).byteLength
  check('fetch ile okunur (200, image/png, tam boy)', fetched.status === 200 && fetched.type === 'image/png' && fetched.bytes === sourceBytes, JSON.stringify(fetched))

  const canvas = await menu.evaluate(
    (fileName) =>
      new Promise((done) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const surface = document.createElement('canvas')
            surface.width = img.naturalWidth
            surface.height = img.naturalHeight
            const context = surface.getContext('2d')
            context.drawImage(img, 0, 0)
            const pixel = context.getImageData(10, 10, 1, 1).data
            done({ ok: true, dataUrl: surface.toDataURL('image/png').length, alpha: pixel[3] })
          } catch (error) {
            done({ ok: false, error: String(error) })
          }
        }
        img.onerror = () => done({ ok: false, error: 'yüklenemedi' })
        // Önbellekteki CORS'suz yanıt kullanılmasın diye ayrı adres.
        img.src = `${window.dnd.mediaUrl(fileName)}?tuval=1`
      }),
    image.fileName
  )
  check("crossOrigin='anonymous' ile çizilen tuval kirlenmez (toDataURL çalışır)", canvas.ok && canvas.dataUrl > 100 && canvas.alpha === 255, JSON.stringify(canvas))

  // Arayüzden okunabilen her yanıt durum koduyla, okunamayan (reddedilen) ise 'hata' ile döner.
  const probe = (url) =>
    menu.evaluate(async (target) => {
      try {
        const response = await fetch(target)
        const body = await response.text()
        return { status: response.status, length: body.length, leaked: body.includes('"schema"') }
      } catch (error) {
        return { status: 'hata', length: 0, leaked: false, error: String(error) }
      }
    }, url)

  // kayit.json'un diskte olduğundan emin ol: kaçış denemeleri gerçek bir hedefe yönelsin.
  await waitFor(() => existsSync(join(work.dataDir, 'kayit.json')), (exists) => exists, 3000)
  check('hazırlık: kayit.json diskte', existsSync(join(work.dataDir, 'kayit.json')))

  const missing = await probe('dnd-media://gorsel/olmayan-dosya.png')
  check('olmayan dosya 404 döner', missing.status === 404, JSON.stringify(missing))
  await probe('dnd-media://gorsel/olmayan-dosya.png?yeniden=1')
  await sleep(200)
  check('eksik dosya loga bir kez yazılır (DND-203)', codeCount(work, 'DND-203') === 1, `${codeCount(work, 'DND-203')} satır`)

  const attacks = [
    ['..%2F ile üst klasör', 'dnd-media://gorsel/..%2Fkayit.json'],
    ['..%5C ile üst klasör', 'dnd-media://gorsel/..%5Ckayit.json'],
    ['%2e%2e%2f ile üst klasör', 'dnd-media://gorsel/%2e%2e%2fkayit.json'],
    ['düz ../ ile üst klasör', 'dnd-media://gorsel/../kayit.json'],
    ['alt klasör + kodlanmış ayırıcı', `dnd-media://gorsel/x%2F..%2F..%2Fkayit.json`],
    ['çift kodlanmış ayırıcı', 'dnd-media://gorsel/..%252Fkayit.json'],
    ['kodlanmış ayırıcıyla klasör içi yol', `dnd-media://gorsel/.%2F${image.fileName}`],
    ['mutlak yol', 'dnd-media://gorsel/C:%5CWindows%5Cwin.ini'],
    ['başka sunucu adı', `dnd-media://baska/${image.fileName}`],
    ['sunucu adı olarak üst klasör', 'dnd-media://../kayit.json'],
    ['boş ad', 'dnd-media://gorsel/']
  ]
  for (const [label, url] of attacks) {
    const result = await probe(url)
    const rejected = result.status !== 200 && result.leaked === false
    check(`reddedilir: ${label}`, rejected, `durum=${result.status}`)
  }
  check('reddedilen isteklerden sonra uygulama ayakta', (await stateOf(menu)).app.library.length === 1)
  const afterAttacks = await menu.evaluate((fileName) => fetch(window.dnd.mediaUrl(fileName)).then((r) => r.status), image.fileName)
  check('geçerli görsel hâlâ okunur', afterAttacks === 200)

  // ---------- yükleme uç durumları ----------
  // Gerçek JPEG ve WEBP'yi Chromium üretir; böylece başlık okuyucu gerçek dosyalarla sınanır.
  const encoded = await menu.evaluate(async () => {
    const surface = document.createElement('canvas')
    surface.width = 40
    surface.height = 30
    const context = surface.getContext('2d')
    context.fillStyle = '#a03020'
    context.fillRect(0, 0, 40, 30)
    const bytes = async (type) => {
      const blob = await new Promise((done) => surface.toBlob(done, type, 0.8))
      return { type: blob.type, data: Array.from(new Uint8Array(await blob.arrayBuffer())) }
    }
    return { jpeg: await bytes('image/jpeg'), webp: await bytes('image/webp') }
  })
  check('hazırlık: tarayıcı JPEG ve WEBP üretti', encoded.jpeg.type === 'image/jpeg' && encoded.webp.type === 'image/webp')

  const jpegAsPng = sample('aslinda-jpeg.png', Buffer.from(encoded.jpeg.data))
  const webp = sample('gercek.webp', Buffer.from(encoded.webp.data))
  const text = sample('notlar.txt', 'bu bir görsel değil')
  const fakePng = sample('sahte.png', 'bu da görsel değil, yalnızca adı png')
  const emptyPng = sample('bos.png', Buffer.alloc(0))
  const missingPath = join(work.samplesDir, 'yok.png')

  const beforeEdge = imagesIn(work).length
  const edge = await menu.evaluate((paths) => window.dnd.library.importFiles('item', paths), [text, fakePng, emptyPng, missingPath, work.samplesDir, jpegAsPng, webp])
  const skippedCode = (name) => edge.skipped.find((entry) => entry.name === name)?.code ?? null
  check('desteklenmeyen uzantı atlanır (DND-201)', skippedCode('notlar.txt') === 'DND-201', String(skippedCode('notlar.txt')))
  check('adı .png olan metin dosyası atlanır (DND-204)', skippedCode('sahte.png') === 'DND-204', String(skippedCode('sahte.png')))
  check('boş .png atlanır (DND-204)', skippedCode('bos.png') === 'DND-204', String(skippedCode('bos.png')))
  check('olmayan yol atlanır (DND-202)', skippedCode('yok.png') === 'DND-202', String(skippedCode('yok.png')))
  check('klasör yolu atlanır', edge.skipped.length === 5 && edge.added.length === 2, `atlanan=${edge.skipped.length}, eklenen=${edge.added.length}`)
  const jpegImage = edge.added.find((entry) => entry.originalName === 'aslinda-jpeg')
  const webpImage = edge.added.find((entry) => entry.originalName === 'gercek')
  check('adı .png olan JPEG .jpg uzantısıyla saklanır', jpegImage?.fileName.endsWith('.jpg') === true, jpegImage?.fileName)
  check('JPEG boyutu doğru okunur', jpegImage?.width === 40 && jpegImage?.height === 30, `${jpegImage?.width}x${jpegImage?.height}`)
  check('WEBP boyutu doğru okunur', webpImage?.fileName.endsWith('.webp') === true && webpImage?.width === 40 && webpImage?.height === 30, `${webpImage?.fileName} ${webpImage?.width}x${webpImage?.height}`)
  check('atlanan dosyalar klasöre kopyalanmaz', imagesIn(work).length === beforeEdge + 2)
  const served = await menu.evaluate(async (names) => {
    const read = async (fileName) => {
      const response = await fetch(window.dnd.mediaUrl(fileName))
      const bitmap = await createImageBitmap(await response.blob())
      return { type: response.headers.get('content-type'), width: bitmap.width }
    }
    return { jpeg: await read(names.jpeg), webp: await read(names.webp) }
  }, { jpeg: jpegImage.fileName, webp: webpImage.fileName })
  check('JPEG image/jpeg olarak sunulur ve çözülür', served.jpeg.type === 'image/jpeg' && served.jpeg.width === 40, JSON.stringify(served.jpeg))
  check('WEBP image/webp olarak sunulur ve çözülür', served.webp.type === 'image/webp' && served.webp.width === 40, JSON.stringify(served.webp))
  const edgeLog = lastRunEntries(work.dataDir)
  check('atlananlar loga kodlarıyla yazılır', hasCode(edgeLog, 'DND-201') && hasCode(edgeLog, 'DND-204') && hasCode(edgeLog, 'DND-202'))

  const invalid = await menu.evaluate(async (file) => ({
    kind: await window.dnd.library.importFiles('portrait', [file]),
    list: await window.dnd.library.importFiles('npc', 'liste-degil'),
    slot: await window.dnd.library.importPortraitFile(7, file),
    path: await window.dnd.library.importPortraitFile(0, 42)
  }), png)
  check(
    'geçersiz bölme / liste / yuva / yol hiçbir şey eklemez',
    Object.values(invalid).every((result) => result.added.length === 0 && result.canceled === false),
    JSON.stringify(invalid)
  )
  check('geçersiz yuva DND-307 ile loga yazılır', hasCode(lastRunEntries(work.dataDir), 'DND-307'))
  check('arayüzden library/add kabul edilmez (DND-306)', await menu.evaluate(async () => {
    const before = (await window.dnd.getState()).app.library.length
    window.dnd.dispatch({ type: 'library/add', images: [{ id: 'x', kind: 'npc', fileName: '..\\..\\kayit.json', originalName: 'x', width: 1, height: 1, addedAt: '' }] })
    return (await window.dnd.getState()).app.library.length === before
  }))

  // ---------- portre ve silme ----------
  if (realTrash) {
    info('gerçek geri dönüşüm kutusu kullanılıyor: iki küçük PNG gidecek')
  } else {
    await session.app.evaluate(({ shell }, trashDir) => {
      const fs = process.getBuiltinModule('node:fs')
      const path = process.getBuiltinModule('node:path')
      fs.mkdirSync(trashDir, { recursive: true })
      globalThis.__trashCalls = []
      globalThis.__realTrashItem = shell.trashItem
      shell.trashItem = async (file) => {
        globalThis.__trashCalls.push(file)
        fs.renameSync(file, path.join(trashDir, path.basename(file)))
      }
    }, join(work.base, 'cop'))
  }

  const portraitA = sample('portre-a.png', makePng(48, 48, [60, 120, 180], [20, 30, 60]))
  const portraitB = sample('portre-b.png', makePng(48, 64, [180, 120, 60], [60, 30, 20]))
  const first = await menu.evaluate((file) => window.dnd.library.importPortraitFile(1, file), portraitA)
  let state = await stateOf(menu)
  const firstPortrait = first.added[0]
  check('importPortraitFile portreyi yuvaya bağlar', firstPortrait?.kind === 'portrait' && state.app.players[1].portraitId === firstPortrait.id)
  check('portre dosyası klasörde', existsSync(join(work.dataDir, 'gorseller', firstPortrait.fileName)))

  const second = await menu.evaluate((file) => window.dnd.library.importPortraitFile(1, file), portraitB)
  state = await stateOf(menu)
  const secondPortrait = second.added[0]
  check('yeni portre yuvaya bağlanır', state.app.players[1].portraitId === secondPortrait?.id)
  check('eski portre kütüphaneden çıkar', !state.app.library.some((entry) => entry.id === firstPortrait.id))
  const oldGone = await waitFor(() => !existsSync(join(work.dataDir, 'gorseller', firstPortrait.fileName)), (gone) => gone, 8000)
  check('eski portrenin dosyası gorseller/ klasöründen kalkar', oldGone)
  check('yeni portrenin dosyası yerinde', existsSync(join(work.dataDir, 'gorseller', secondPortrait.fileName)))

  const bad = await menu.evaluate((file) => window.dnd.library.importPortraitFile(1, file), fakePng)
  state = await stateOf(menu)
  check('okunamayan portre yuvaya dokunmaz', bad.added.length === 0 && bad.skipped[0]?.code === 'DND-204' && state.app.players[1].portraitId === secondPortrait.id)

  // library/remove: görsel sahnede kullanılıyorken silinir.
  await menu.evaluate((imageId) => {
    window.dnd.dispatch({ type: 'stage/addItem', fallbackSceneId: 'sahne-1', itemId: 'oge-1', imageId })
    window.dnd.dispatch({ type: 'library/remove', imageId })
  }, image.id)
  state = await stateOf(menu)
  check('library/remove görseli kütüphaneden ve sahneden kaldırır', !state.app.library.some((entry) => entry.id === image.id) && state.app.scenes[0].items.length === 0)
  const removed = await waitFor(() => !existsSync(join(work.dataDir, 'gorseller', image.fileName)), (gone) => gone, 8000)
  check('silinen görselin dosyası gorseller/ klasöründen kalkar', removed)
  await sleep(300)
  check('silme loga yazılır', lastRunEntries(work.dataDir).filter((entry) => entry.includes('Görsel silindi:')).length === 2)
  if (!realTrash) {
    const calls = await session.app.evaluate(() => globalThis.__trashCalls)
    check('trashItem yalnızca gorseller/ içindeki iki dosya için çağrılır', calls.length === 2 && calls.every((file) => file.startsWith(join(work.dataDir, 'gorseller'))), calls.join(' | '))
  }

  // Dosyası elle silinmiş görsel: çöpe taşınacak bir şey yok, hata da yok.
  unlinkSync(join(work.dataDir, 'gorseller', jpegImage.fileName))
  await menu.evaluate((imageId) => window.dnd.dispatch({ type: 'library/remove', imageId }), jpegImage.id)
  await sleep(300)
  check('dosyası zaten olmayan görsel sorunsuz silinir', lastRunEntries(work.dataDir).some((entry) => entry.includes('dosyası zaten yoktu')) && codeCount(work, 'DND-205') === 0)

  // Çöpe taşıma başarısız olursa: uygulama ayakta, DND-205 bildirilir, dosya yerinde kalır.
  await session.app.evaluate(({ shell }) => {
    shell.trashItem = () => Promise.reject(new Error('deneme: geri dönüşüm kutusu kullanılamıyor'))
  })
  await menu.evaluate(() => {
    window.__notices = []
    window.dnd.onNotice((notice) => window.__notices.push(notice))
  })
  await menu.evaluate((imageId) => window.dnd.dispatch({ type: 'library/remove', imageId }), webpImage.id)
  const notices = await waitFor(() => menu.evaluate(() => window.__notices), (list) => list.length > 0, 5000)
  state = await stateOf(menu)
  check('çöpe taşınamayan görsel yine kütüphaneden çıkar', !state.app.library.some((entry) => entry.id === webpImage.id))
  check('çöpe taşıma hatası DND-205 olarak bildirilir', notices.some((notice) => notice.code === 'DND-205') && codeCount(work, 'DND-205') === 1)
  check('çöpe taşınamayan dosya klasörde kalır', existsSync(join(work.dataDir, 'gorseller', webpImage.fileName)))
  check('çöp hatasından sonra uygulama ayakta', (await menu.evaluate(() => window.dnd.app.getInfo())).dataDir.toLowerCase() === work.dataDir.toLowerCase())

  const entries = lastRunEntries(work.dataDir)
  check('akış boyunca DND-901/902 yok', !hasCode(entries, 'DND-901') && !hasCode(entries, 'DND-902'))
  const cspConsole = session.console.filter((message) => /Content Security Policy/i.test(message.text))
  check('konsolda CSP iletisi yok', cspConsole.length === 0, cspConsole.map((m) => m.text).join(' | '))

  const exit = await quitFromUi(session, menu)
  check('uygulama 0 koduyla kapanır', exit?.code === 0, JSON.stringify(exit))
  const saved = JSON.parse(readFileSync(join(work.dataDir, 'kayit.json'), 'utf8'))
  const files = imagesIn(work)
  const referenced = saved.library.map((entry) => entry.fileName).sort()
  check(
    'kayıttaki her görselin dosyası var; fazladan yalnızca çöpe taşınamayan dosya kalır',
    referenced.every((name) => files.includes(name)) && files.filter((name) => !referenced.includes(name)).join() === webpImage.fileName,
    `kayıt=${referenced.length}, klasör=${files.length}`
  )
})
