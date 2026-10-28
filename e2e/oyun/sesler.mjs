// Müzik denemeleri için ses ve video dosyaları üretir; ağdan ya da diskten hazır dosya gerekmez.
import { writeFileSync } from 'node:fs'

/** Tek kanallı 16 bit PCM WAV: `seconds` saniyelik `frequency` Hz sinüs. */
export function wavBytes(seconds, frequency = 440, sampleRate = 8000) {
  const samples = Math.round(seconds * sampleRate)
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.3 * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

export function writeWav(path, seconds, frequency) {
  writeFileSync(path, wavBytes(seconds, frequency))
  return path
}

/** Videonun bölümleri: her biri `SEGMENT_SECONDS` saniye, tek renk. Döngü denetimi rengi okur. */
export const SEGMENT_SECONDS = 2
export const SEGMENT_COLORS = [
  [220, 30, 30],
  [30, 200, 60],
  [40, 70, 230]
]

/**
 * Sesli MP4 (H.264 + AAC) üretir: tuvale sırayla kırmızı, yeşil, mavi boyanır, arkada sinüs çalar.
 * Kayıt uygulamanın kendi Chromium'unda (MediaRecorder) yapılır; makinede ffmpeg gerekmez.
 * `page`: uygulamanın herhangi bir penceresi.
 */
export async function writeMp4(page, path) {
  const base64 = await page.evaluate(
    async ([segmentSeconds, colors]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 180
      const context = canvas.getContext('2d')
      const audio = new AudioContext()
      const oscillator = audio.createOscillator()
      oscillator.frequency.value = 330
      const gain = audio.createGain()
      gain.gain.value = 0.2
      const destination = audio.createMediaStreamDestination()
      oscillator.connect(gain).connect(destination)
      oscillator.start()
      const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...destination.stream.getAudioTracks()])
      const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2' })
      const chunks = []
      recorder.ondataavailable = (event) => chunks.push(event.data)
      const stopped = new Promise((done) => (recorder.onstop = done))
      const total = segmentSeconds * colors.length * 1000
      const startedAt = performance.now()
      recorder.start(250)
      await new Promise((done) => {
        const draw = () => {
          const elapsed = performance.now() - startedAt
          const [r, g, b] = colors[Math.min(colors.length - 1, Math.floor(elapsed / (segmentSeconds * 1000)))]
          context.fillStyle = `rgb(${r}, ${g}, ${b})`
          context.fillRect(0, 0, canvas.width, canvas.height)
          if (elapsed >= total) done()
          else requestAnimationFrame(draw)
        }
        draw()
      })
      recorder.stop()
      await stopped
      oscillator.stop()
      await audio.close()
      const buffer = await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(binary)
    },
    [SEGMENT_SECONDS, SEGMENT_COLORS]
  )
  writeFileSync(path, Buffer.from(base64, 'base64'))
  return path
}
