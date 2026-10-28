import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { AmbientSound, MusicTrack } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { dispatch, useApp, useSession } from '@renderer/lib/useAppState'

/** İlerleme çubuğu için en sık gönderim aralığı (ms); `timeupdate` saniyede 4 kez gelir. */
const STATUS_INTERVAL_MS = 240

function describeMediaError(media: HTMLMediaElement): string {
  const error = media.error
  if (error === null) return 'bilinmeyen hata'
  const kinds: Record<number, string> = { 1: 'iptal edildi', 2: 'ağ/dosya okunamadı', 3: 'çözülemedi', 4: 'desteklenmeyen biçim' }
  return `${kinds[error.code] ?? `kod ${error.code}`}${error.message ? ` (${error.message})` : ''}`
}

/**
 * Oyun ekranında görünmeyen ses çalar: müzik listesinden seçilen parça ve açık ortam sesleri.
 * Ses Discord'da paylaşılan bu pencereden çıkar; denetimler kontrol panelindedir. Çalma durumu
 * (hangi parça, çalıyor mu, nereye sarıldı) oturumdan okunur; anlık konum kontrol paneline gönderilir.
 */
export function MusicPlayer(): JSX.Element {
  const { music } = useApp()
  const { playback } = useSession()
  const track = playback.trackId === null ? undefined : music.tracks.find((entry) => entry.id === playback.trackId)
  const activeAmbients = playback.ambientIds
    .map((id) => music.ambients.find((ambient) => ambient.id === id))
    .filter((ambient): ambient is AmbientSound => ambient !== undefined)

  return (
    <div hidden>
      <TrackAudio
        track={track}
        playing={playback.playing}
        seekNonce={playback.seekNonce}
        seekTo={playback.seekTo}
        volume={music.musicVolume}
      />
      {activeAmbients.map((ambient) => (
        <AmbientAudio key={ambient.id} ambient={ambient} volume={ambient.volume * music.ambientVolume} />
      ))}
    </div>
  )
}

interface TrackAudioProps {
  track: MusicTrack | undefined
  playing: boolean
  seekNonce: number
  seekTo: number
  volume: number
}

function TrackAudio({ track, playing, seekNonce, seekTo, volume }: TrackAudioProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackId = track?.id ?? null
  const src = track ? window.dnd.soundUrl(track.fileName) : null
  const lastStatus = useRef(0)
  // Olay işleyicileri her çizimde yeniden bağlanmasın diye güncel değerler buradan okunur.
  const current = useRef({ trackId, playing })
  current.current = { trackId, playing }

  const sendStatus = (force: boolean): void => {
    const audio = audioRef.current
    if (audio === null) return
    const now = performance.now()
    if (!force && now - lastStatus.current < STATUS_INTERVAL_MS) return
    lastStatus.current = now
    window.dnd.music.sendStatus({
      trackId: current.current.trackId,
      position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: !audio.paused && !audio.ended
    })
  }

  const play = (audio: HTMLAudioElement): void => {
    audio.play().catch((error: unknown) => {
      // Kaynak değişince yarım kalan play() "AbortError" ile düşer; olağandır.
      if (error instanceof DOMException && error.name === 'AbortError') return
      reportError('Müzik başlatılamadı', error)
    })
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null) return
    if (src === null) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    } else if (audio.getAttribute('src') !== src) {
      audio.src = src
    }
    sendStatus(true)
  }, [src])

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null || src === null) return
    // seekNonce her "baştan başlat" ve sarmada artar; aynı konuma ikinci kez sarmak da çalışsın diye.
    if (Number.isFinite(seekTo)) audio.currentTime = seekTo
    sendStatus(true)
  }, [seekNonce, src])

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null || src === null) return
    if (playing) play(audio)
    else audio.pause()
  }, [playing, src, seekNonce])

  useEffect(() => {
    if (audioRef.current !== null) audioRef.current.volume = Math.min(1, Math.max(0, volume))
  }, [volume])

  return (
    <audio
      ref={audioRef}
      preload="auto"
      onTimeUpdate={() => sendStatus(false)}
      onLoadedMetadata={() => sendStatus(true)}
      onPlay={() => sendStatus(true)}
      onPause={() => sendStatus(true)}
      onEnded={() => {
        sendStatus(true)
        const id = current.current.trackId
        if (id !== null) dispatch({ type: 'playback/ended', trackId: id })
      }}
      onError={(event) => {
        const id = current.current.trackId
        // Kaynak bilerek kaldırıldığında da "error" gelebilir.
        if (id === null || !event.currentTarget.getAttribute('src')) return
        window.dnd.music.reportUnplayable('track', id, describeMediaError(event.currentTarget))
      }}
    />
  )
}

function AmbientAudio({ ambient, volume }: { ambient: AmbientSound; volume: number }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null) return
    audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      reportError('Ortam sesi başlatılamadı', error)
    })
    return () => audio.pause()
  }, [ambient.fileName])

  useEffect(() => {
    if (audioRef.current !== null) audioRef.current.volume = Math.min(1, Math.max(0, volume))
  }, [volume])

  return (
    <audio
      ref={audioRef}
      src={window.dnd.soundUrl(ambient.fileName)}
      loop
      preload="auto"
      data-ambient={ambient.id}
      onError={(event) => window.dnd.music.reportUnplayable('ambient', ambient.id, describeMediaError(event.currentTarget))}
    />
  )
}
