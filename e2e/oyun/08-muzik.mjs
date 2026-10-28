// Müzik: kontrol panelinin üst sekmeleri, parça yükleme ve çalma (oyun ekranında), ileri-geri sarma,
// tekrar, ses düzeyi, ortam sesleri, çalınamayan dosya, MP4'ün hareketli arka plan olması ve döngüsü,
// uygulama kapatılıp açılınca listenin yerinde durması.
// Çalıştırma: node e2e/oyun/08-muzik.mjs
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addScene, check, info, open, run, show, sleep } from './harness.mjs'
import { SEGMENT_COLORS, SEGMENT_SECONDS, writeMp4, writeWav } from './sesler.mjs'

/** Oyun ekranındaki müzik çalarının (ortam sesleri hariç) durumu. */
const trackAudio = (session) =>
  session.game.evaluate(() => {
    const audio = document.querySelector('audio:not([data-ambient])')
    if (!audio) return null
    return {
      src: audio.getAttribute('src'),
      paused: audio.paused,
      ended: audio.ended,
      currentTime: audio.currentTime,
      duration: audio.duration,
      volume: audio.volume,
      error: audio.error?.code ?? null
    }
  })

const ambientAudios = (session) =>
  session.game.evaluate(() =>
    [...document.querySelectorAll('audio[data-ambient]')].map((audio) => ({
      id: audio.dataset.ambient,
      paused: audio.paused,
      loop: audio.loop,
      volume: audio.volume,
      currentTime: audio.currentTime
    }))
  )

/** Koşul sağlanana kadar bekler; sağlanırsa son değeri, sağlanmazsa null döner. */
async function waitFor(read, ok, timeoutMs = 6000) {
  const until = Date.now() + timeoutMs
  let value = await read()
  while (!ok(value)) {
    if (Date.now() > until) return null
    await sleep(100)
    value = await read()
  }
  return value
}

const isColor = ([r, g, b], [er, eg, eb], tolerance = 70) => Math.abs(r - er) < tolerance && Math.abs(g - eg) < tolerance && Math.abs(b - eb) < tolerance

await run(async () => {
  const session = await open('muzik')
  const { menu, sampleDir } = session

  const longWav = writeWav(join(sampleDir, 'Uzun Taverna.wav'), 60, 440)
  const shortWav = writeWav(join(sampleDir, 'kisa.wav'), 2.5, 660)
  const birdWav = writeWav(join(sampleDir, 'Kuş sesi.wav'), 3, 880)
  const broken = join(sampleDir, 'bozuk.mp3')
  writeFileSync(broken, 'bu bir ses dosyası değil')
  const notSound = join(sampleDir, 'not.txt')
  writeFileSync(notSound, 'yazı')
  const mp4 = await writeMp4(menu, join(sampleDir, 'Şömine.mp4'))

  // --- Yükleme (ana menüden de yapılabilir; ayarlar ve oyun aynı listeyi kullanır) ---
  const imported = await menu.evaluate((paths) => window.dnd.music.importFiles(paths), [longWav, shortWav, notSound])
  check('desteklenen dosyalar eklenir, desteklenmeyen DND-501 ile atlanır', imported.added.length === 2 && imported.skipped.length === 1 && imported.skipped[0].code === 'DND-501', show(imported.skipped))
  const [longTrack, shortTrack] = imported.added
  const soundsDir = join(session.dataDir, 'muzik')
  check('dosyalar kayıt klasöründeki muzik/ altına kopyalanır', readdirSync(soundsDir).length === 2)

  const sceneOne = await addScene(session, 'Bir', 1)
  const sceneTwo = await addScene(session, 'İki', 2)
  await session.send({ type: 'scene/setActive', sceneId: sceneOne })
  await session.start()
  const { control } = session

  // --- Üst sekmeler ---
  const tabs = await control.getByRole('tab').allTextContents()
  check('kontrol panelinde üst sekmeler var: Kontrol Paneli ve Müzik', tabs.includes('Kontrol Paneli') && tabs.includes('Müzik'), show(tabs))
  await control.getByRole('tab', { name: 'Müzik' }).click()
  await sleep(200)
  const pageState = await control.evaluate(() => ({
    musicVisible: document.querySelector('.mus-page')?.getClientRects().length > 0,
    controlHidden: document.querySelector('.ctl-control')?.getClientRects().length === 0,
    // Kontrol paneli gizlenir ama kapanmaz: kütüphane gibi parçalar yerinde kalır.
    controlMounted: document.querySelector('.ctl-col--library') !== null
  }))
  check('Müzik sekmesi açılır; kontrol paneli gizlenir ama kapanmaz', pageState.musicVisible && pageState.controlHidden && pageState.controlMounted, show(pageState))
  const rows = await control.locator('.mus-track').count()
  check('parça listesi iki parçayı gösterir', rows === 2, `${rows}`)

  // --- Çalma ---
  await control.locator(`.mus-track[data-track="${longTrack.id}"] .mus-track__main`).click()
  const started = await waitFor(() => trackAudio(session), (audio) => audio !== null && !audio.paused && audio.currentTime > 0.5)
  check('parçaya tıklayınca oyun ekranında çalar', started !== null, show(await trackAudio(session)))
  check('kaynak dnd-media://ses/ adresidir', started?.src?.startsWith('dnd-media://ses/'), started?.src)

  const shownTime = await waitFor(
    () => control.locator('.mus-player__time').first().textContent(),
    (text) => text !== null && text !== '0:00',
    4000
  )
  check('kontrol panelindeki süre ilerler (oyun ekranından gelen durum)', shownTime !== null, `${shownTime}`)
  const title = await control.locator('.mus-player__title').textContent()
  check('çalan parçanın adı görünür', title === 'Uzun Taverna', `${title}`)

  // --- İleri / geri sarma (Range isteği olmadan çalışmaz) ---
  await session.send({ type: 'playback/seek', position: 40 }, 0)
  const seeked = await waitFor(() => trackAudio(session), (audio) => audio !== null && audio.currentTime >= 39.5 && audio.currentTime < 45)
  check('40. saniyeye sarılır ve oradan çalmaya devam eder', seeked !== null && !seeked.paused, show(await trackAudio(session)))
  const range = await session.game.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=100-199' } })
    return { status: response.status, length: (await response.arrayBuffer()).byteLength, header: response.headers.get('Content-Range') }
  }, started?.src ?? '')
  check('ses dosyası parça parça (206) gönderilir', range.status === 206 && range.length === 100, show(range))

  // İlerleme çubuğu kontrol panelinden de sarar.
  await control.locator('.mus-range--progress').evaluate((input) => {
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '10')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
  })
  const barSeek = await waitFor(() => trackAudio(session), (audio) => audio !== null && audio.currentTime >= 9.5 && audio.currentTime < 14)
  check('ilerleme çubuğu sürüklenince oyun ekranı oraya sarar', barSeek !== null, show(await trackAudio(session)))

  // --- Duraklat / devam ---
  await control.locator('.mus-player__play').click()
  const paused = await waitFor(() => trackAudio(session), (audio) => audio?.paused === true)
  const pausedAt = paused?.currentTime ?? -1
  await sleep(600)
  const stillPaused = await trackAudio(session)
  check('Duraklat oyun ekranındaki sesi durdurur ve konum korunur', paused !== null && stillPaused.paused && Math.abs(stillPaused.currentTime - pausedAt) < 0.05)
  await control.locator('.mus-player__play').click()
  const resumed = await waitFor(() => trackAudio(session), (audio) => audio !== null && !audio.paused && audio.currentTime > pausedAt + 0.2)
  check('Çal kaldığı yerden devam eder', resumed !== null && resumed.currentTime < pausedAt + 3, show(resumed))

  // --- Ses düzeyi ---
  await session.send({ type: 'music/setVolume', volume: 0.25 }, 300)
  check('ses düzeyi oyun ekranına uygulanır', Math.abs((await trackAudio(session)).volume - 0.25) < 0.001)

  // --- Sekme değişse de müzik sürer, 1–9 her sekmede çalışır ---
  await control.getByRole('tab', { name: 'Kontrol Paneli' }).click()
  await control.getByRole('tab', { name: 'Müzik' }).click()
  await control.locator('.mus-page').click({ position: { x: 5, y: 5 } })
  await control.keyboard.press('2')
  await sleep(300)
  const afterKey = await session.state()
  const stillPlaying = await trackAudio(session)
  check('Müzik sekmesindeyken 2 tuşu pencere değiştirir', afterKey.app.activeSceneId === sceneTwo)
  check('pencere ve sekme değişince müzik kesilmez', !stillPlaying.paused && stillPlaying.src === started?.src)

  // --- Sonraki parça, bitiş ve tekrar ---
  await session.send({ type: 'music/setRepeat', repeat: 'off' }, 0)
  await control.getByRole('button', { name: 'Sonraki parça' }).click()
  const second = await waitFor(() => trackAudio(session), (audio) => audio !== null && !audio.paused && audio.currentTime > 0.2 && audio.duration < 5)
  check('Sonraki parça ikinci parçayı baştan çalar', second !== null, show(await trackAudio(session)))
  const endedOff = await waitFor(async () => (await session.state()).session.playback, (playback) => playback.playing === false, 6000)
  check('tekrar kapalıyken son parça bitince müzik durur', endedOff !== null && endedOff.trackId === shortTrack.id, show(endedOff))

  await session.send({ type: 'music/setRepeat', repeat: 'one' }, 0)
  await session.send({ type: 'playback/play', trackId: shortTrack.id }, 0)
  await sleep(3500)
  const repeatOne = await trackAudio(session)
  const playbackOne = (await session.state()).session.playback
  check('"bu parçayı tekrarla" biten parçayı yeniden başlatır', playbackOne.playing && playbackOne.trackId === shortTrack.id && !repeatOne.paused && repeatOne.currentTime < 2.5, show(repeatOne))

  await session.send({ type: 'music/setRepeat', repeat: 'all' }, 0)
  await sleep(3200)
  const wrapped = (await session.state()).session.playback
  check('"listeyi tekrarla"da son parçadan sonra ilk parçaya geçilir', wrapped.playing && wrapped.trackId === longTrack.id, show(wrapped))

  // --- Ortam sesleri ---
  const added = await control.evaluate((path) => window.dnd.music.addAmbientFile(path), birdWav)
  check('ortam sesi dosyanın adıyla eklenir', added.ambient?.name === 'Kuş sesi', show(added))
  const ambientId = added.ambient?.id
  await control.locator(`.mus-ambient[data-ambient="${ambientId}"] .mus-ambient__toggle`).click()
  const ambientOn = await waitFor(() => ambientAudios(session), (list) => list.length === 1 && !list[0].paused && list[0].currentTime > 0.2)
  check('ortam sesi düğmesi oyun ekranında döngüde çalar', ambientOn !== null && ambientOn[0].loop, show(await ambientAudios(session)))
  const musicWithAmbient = await trackAudio(session)
  check('ortam sesi çalarken müzik de sürer (iki katman)', !musicWithAmbient.paused)

  await session.send({ type: 'ambient/update', ambientId, patch: { volume: 0.5 } }, 0)
  await session.send({ type: 'music/setAmbientVolume', volume: 0.5 }, 300)
  const [ambientVolume] = await ambientAudios(session)
  check('ortam sesinin düzeyi = kendi düzeyi x genel düzey', Math.abs(ambientVolume.volume - 0.25) < 0.001, `${ambientVolume.volume}`)

  await sleep(3200)
  const looped = await ambientAudios(session)
  check('3 saniyelik ortam sesi bitince susmaz (döngü)', looped.length === 1 && !looped[0].paused, show(looped))
  await control.locator(`.mus-ambient[data-ambient="${ambientId}"] .mus-ambient__toggle`).click()
  check('düğmeye yeniden basınca ortam sesi kapanır', (await waitFor(() => ambientAudios(session), (list) => list.length === 0)) !== null)

  // --- Çalınamayan dosya ---
  const brokenResult = await control.evaluate((path) => window.dnd.music.importFiles([path]), broken)
  const brokenTrack = brokenResult.added[0]
  await session.send({ type: 'playback/play', trackId: brokenTrack.id }, 0)
  const stoppedBroken = await waitFor(async () => (await session.state()).session.playback, (playback) => playback.trackId === null, 6000)
  const toast = await waitFor(() => control.locator('.ui-toast__message').allTextContents(), (texts) => texts.some((text) => text.includes('Ses dosyası çalınamadı')), 3000)
  check('bozuk dosya DND-503 bildirimiyle durur, uygulama çalışmaya devam eder', stoppedBroken !== null && toast !== null, show(toast))

  // --- MP4: kullanım sorusu, döngü seçimi ve hareketli arka plan ---
  // "Müzik yükle"nin açtığı dosya seçme penceresi, MP4'ü seçmiş gibi yanıt verir.
  await session.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, mp4)
  await control.getByRole('button', { name: 'Müzik yükle' }).click()
  const asked = await waitFor(() => control.locator('.mus-choice').count(), (count) => count === 1, 5000)
  check('MP4 yükleyince "nasıl kullanılsın?" diye sorulur', asked !== null)
  const videoTrack = (await session.state()).app.music.tracks.at(-1)
  check('MP4 videolu parça olarak eklenir', videoTrack?.hasVideo === true && videoTrack.loop === null && videoTrack.originalName === 'Şömine', show(videoTrack))
  await control.getByRole('button', { name: /Ses \+ hareketli görüntü/ }).click()
  await control.locator('.mus-loop__video').waitFor({ timeout: 5000 })
  const editorReady = await waitFor(
    () => control.locator('.mus-loop__edge-value').allTextContents(),
    (values) => values.length === 2 && values[1] !== '0:00.0',
    6000
  )
  check('döngü seçicisi videonun süresini okur', editorReady !== null, show(editorReady))
  // Yeşil bölümü seç: başlangıç 2,3 sn, bitiş 3,7 sn.
  const setRange = (label, value) =>
    control.getByRole('slider', { name: label, exact: true }).evaluate((input, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, String(v))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  await setRange('Bitiş', SEGMENT_SECONDS * 2 - 0.3)
  await setRange('Başlangıç', SEGMENT_SECONDS + 0.3)
  await control.getByRole('button', { name: 'Kaydet' }).click()
  await sleep(300)
  const savedLoop = (await session.state()).app.music.tracks.find((track) => track.id === videoTrack.id)?.loop
  check('seçilen aralık kaydedilir', savedLoop?.start === 2.3 && savedLoop?.end === 3.7, show(savedLoop))
  const badge = await control.locator(`.mus-track[data-track="${videoTrack.id}"] .mus-track__badge`).textContent()
  check('listede parçanın "Arka plan" olduğu görünür', badge?.includes('Arka plan'), `${badge}`)
  // "Hareketli görüntü ayarla" kaydedilen aralıkla açılır.
  await control.locator(`.mus-track[data-track="${videoTrack.id}"]`).getByRole('button', { name: 'Hareketli görüntü ayarla' }).click()
  const reopenedEdges = await waitFor(() => control.locator('.mus-loop__edge-value').allTextContents(), (values) => values[0] === '0:02.3', 5000)
  check('aralık yeniden açılınca kaydedilen değerlerle gelir', reopenedEdges !== null && reopenedEdges[1] === '0:03.7', show(reopenedEdges))
  await control.getByRole('button', { name: 'Vazgeç' }).click()

  await session.send({ type: 'scene/setVideo', sceneId: sceneTwo, trackId: videoTrack.id }, 0)
  const videoState = await waitFor(
    () =>
      session.game.evaluate(() => {
        const video = document.querySelector('video.game-video')
        return video ? { paused: video.paused, muted: video.muted, time: video.currentTime, ready: video.readyState } : null
      }),
    (video) => video !== null && !video.paused && video.ready >= 2,
    6000
  )
  check('pencereye verilen hareketli arka plan oyun ekranında sessiz oynar', videoState !== null && videoState.muted, show(videoState))
  const colors = []
  const times = []
  for (let i = 0; i < 12; i++) {
    colors.push(await session.colorAt(960, 540))
    times.push(await session.game.evaluate(() => document.querySelector('video.game-video')?.currentTime ?? -1))
    await sleep(350)
  }
  const green = SEGMENT_COLORS[1]
  check(
    'video yalnızca seçilen aralıkta döner (4 sn boyunca hep yeşil bölüm)',
    colors.every((color) => isColor(color, green)),
    show(colors.filter((color) => !isColor(color, green)).slice(0, 3))
  )
  check('videonun konumu hep aralığın içinde', times.every((time) => time >= 2.2 && time <= 3.85), show(times))
  check('aralık başa döner (aynı yerde takılı kalmaz)', Math.max(...times) - Math.min(...times) > 0.6, show(times))
  await session.shot('muzik-hareketli-arka-plan.png')

  await session.send({ type: 'scene/setActive', sceneId: sceneOne }, 400)
  check('hareketli arka planı olmayan pencereye geçince video kalkar', (await session.game.locator('video.game-video').count()) === 0)
  await session.send({ type: 'scene/setActive', sceneId: sceneTwo }, 400)

  // Videonun sesi listeden ayrıca çalınabilir; görüntü bundan etkilenmez.
  await session.send({ type: 'playback/play', trackId: videoTrack.id }, 0)
  const videoAudio = await waitFor(() => trackAudio(session), (audio) => audio !== null && !audio.paused && audio.currentTime > 0.3)
  check('MP4\'ün sesi müzik listesinden çalar', videoAudio !== null, show(await trackAudio(session)))
  await session.send({ type: 'playback/stop' }, 300)

  // --- Silme ---
  const fileOfShort = shortTrack.fileName
  await control.locator(`.mus-track[data-track="${shortTrack.id}"]`).getByRole('button', { name: 'Sil' }).click()
  await control.locator('dialog[open]').getByRole('button', { name: 'Sil' }).click()
  await sleep(800)
  check('silinen parçanın dosyası muzik klasöründen kalkar', !existsSync(join(soundsDir, fileOfShort)))

  const problems = session.problems.filter((text) => !text.includes('Autofill'))
  check('pencerelerde hata yok', problems.length === 0 || problems.every((text) => text.includes('DND-503') || text.includes('Müzik başlatılamadı')), show(problems.slice(0, 4)))

  // --- Oyunu bitir: müzik susar; yeniden açılınca liste yerinde ---
  await session.send({ type: 'music/setVolume', volume: 0.4 }, 0)
  await session.send({ type: 'playback/play', trackId: longTrack.id }, 300)
  await menu.evaluate(() => window.dnd.game.end())
  await sleep(800)
  const afterEnd = (await menu.evaluate(() => window.dnd.getState())).session.playback
  check('oyun bitince çalma durumu sıfırlanır', afterEnd.trackId === null && !afterEnd.playing && afterEnd.ambientIds.length === 0, show(afterEnd))

  const dataDir = session.dataDir
  await session.close()
  const again = await open('muzik-yeniden', { dataDir })
  const reopened = (await again.menu.evaluate(() => window.dnd.getState())).app
  check(
    'uygulama kapatılıp açılınca parçalar, ortam sesi, ses düzeyi ve döngü yerinde',
    reopened.music.tracks.length === 3 &&
      reopened.music.ambients.length === 1 &&
      reopened.music.musicVolume === 0.4 &&
      reopened.music.tracks.some((track) => track.loop?.start === 2.3) &&
      reopened.scenes.find((scene) => scene.id === sceneTwo)?.videoTrackId === videoTrack.id,
    show({ tracks: reopened.music.tracks.length, ambients: reopened.music.ambients.length, volume: reopened.music.musicVolume })
  )
  await again.start()
  await sleep(500)
  const silentStart = await trackAudio(again)
  check('yeni oyun sessiz başlar', silentStart === null || silentStart.src === null || silentStart.paused)
  info(`oyun ekranı görüntüsü: e2e/.cikti/oyun/muzik-hareketli-arka-plan.png`)
})
