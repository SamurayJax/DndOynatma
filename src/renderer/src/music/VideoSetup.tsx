import { useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { activeScene } from '@shared/layout'
import { MIN_VIDEO_LOOP } from '@shared/reducer'
import type { MusicTrack, VideoLoop } from '@shared/types'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import { useVideoLoop } from '@renderer/game/SceneVideo'
import { Button, FilmIcon, MusicIcon, Modal, Toggle, WarningIcon, toast } from '@renderer/ui'

/** İlk açılışta önerilen döngü uzunluğu (saniye). */
const DEFAULT_LOOP_SECONDS = 8

/** "1:05.4" */
function formatPrecise(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = (safe - minutes * 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${rest}`
}

export interface VideoSetupProps {
  track: MusicTrack
  /** ask: yüklemeden sonra "nasıl kullanılsın?" sorusuyla başlar · loop: doğrudan aralık seçimine geçer. */
  start: 'ask' | 'loop'
  onClose: () => void
}

/**
 * MP4'ün nasıl kullanılacağı: yalnızca ses mi, yoksa ses + hareketli görüntü mü. Hareketli görüntüde
 * videonun GIF gibi dönecek bölümü (başlangıç-bitiş) seçilir; video kesilmez, oynatılırken o aralık
 * tekrarlanır.
 */
export function VideoSetup({ track, start, onClose }: VideoSetupProps): JSX.Element {
  const [step, setStep] = useState(start)

  if (step === 'ask') {
    return (
      <Modal open onClose={onClose} title="Bu MP4 nasıl kullanılsın?" size="md" footer={<Button onClick={onClose}>Sonra karar ver</Button>}>
        <p className="mus-choice__file" title={track.originalName}>
          <FilmIcon size={16} />
          {track.originalName}
        </p>
        <div className="mus-choice">
          <button type="button" className="mus-choice__option" data-autofocus="" onClick={onClose}>
            <MusicIcon size={28} strokeWidth={1.5} />
            <span className="mus-choice__title">Yalnızca ses</span>
            <span className="mus-choice__hint">Müzik listesinde çalar, görüntüsü kullanılmaz.</span>
          </button>
          <button type="button" className="mus-choice__option" onClick={() => setStep('loop')}>
            <FilmIcon size={28} strokeWidth={1.5} />
            <span className="mus-choice__title">Ses + hareketli görüntü</span>
            <span className="mus-choice__hint">
              Videonun seçtiğin bölümü GIF gibi sessiz döner ve ekrandaki pencerenin arka planı olur. Sesi yine listeden çalınır.
            </span>
          </button>
        </div>
      </Modal>
    )
  }
  return <LoopEditor track={track} onClose={onClose} />
}

function LoopEditor({ track, onClose }: { track: MusicTrack; onClose: () => void }): JSX.Element {
  const app = useApp()
  const scene = activeScene(app)
  // Kaydedince ekrandaki pencerenin arka planı olur; zaten başka bir pencerenin arka planıysa sorulmadan değişmez.
  const [useAsBackground, setUseAsBackground] = useState(scene !== undefined && scene.videoTrackId !== track.id)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [noVideo, setNoVideo] = useState(false)
  const [range, setRange] = useState<VideoLoop | null>(track.loop)
  const [previewing, setPreviewing] = useState(false)
  const src = window.dnd.soundUrl(track.fileName)

  const loop = range ?? { start: 0, end: DEFAULT_LOOP_SECONDS }
  const valid = duration !== null && loop.end - loop.start >= MIN_VIDEO_LOOP && loop.end <= duration + 0.05
  // Önizlemede yalnızca seçilen aralık döner; nesne kimliği sabit kalsın ki döngü her çizimde baştan kurulmasın.
  const previewLoop = useMemo(() => (previewing ? { start: loop.start, end: loop.end } : null), [previewing, loop.start, loop.end])
  useVideoLoop(videoRef, previewLoop, src)

  const onMetadata = (): void => {
    const video = videoRef.current
    if (video === null) return
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setNoVideo(true)
      return
    }
    const total = Number.isFinite(video.duration) ? video.duration : 0
    setDuration(total)
    setRange((current) => {
      if (current !== null && current.end <= total + 0.05) return current
      return { start: 0, end: Math.min(total, DEFAULT_LOOP_SECONDS) }
    })
  }

  const setEdge = (edge: 'start' | 'end', value: number): void => {
    if (duration === null) return
    const clamped = Math.min(duration, Math.max(0, value))
    setRange((current) => {
      const base = current ?? loop
      if (edge === 'start') return { start: Math.min(clamped, base.end - MIN_VIDEO_LOOP), end: base.end }
      return { start: base.start, end: Math.max(clamped, base.start + MIN_VIDEO_LOOP) }
    })
    if (videoRef.current !== null) videoRef.current.currentTime = Math.min(duration, Math.max(0, value))
  }

  const fromPlayhead = (edge: 'start' | 'end'): void => {
    const video = videoRef.current
    if (video !== null) setEdge(edge, video.currentTime)
  }

  const save = (): void => {
    if (!valid) return
    dispatch({ type: 'music/setLoop', trackId: track.id, loop: { start: loop.start, end: loop.end } })
    if (useAsBackground && scene !== undefined) {
      dispatch({ type: 'scene/setVideo', sceneId: scene.id, trackId: track.id })
      toast(`“${track.originalName}” artık “${scene.name}” penceresinin hareketli arka planı.`)
    } else {
      toast(`“${track.originalName}” hareketli arka plan olarak hazır. Müzik listesindeki “Arka plan yap” ile ekrandaki pencereye verilir.`)
    }
    onClose()
  }

  const turnOff = (): void => {
    dispatch({ type: 'music/setLoop', trackId: track.id, loop: null })
    onClose()
  }

  const footer = (
    <>
      {!noVideo && scene !== undefined && (
        <Toggle
          className="mus-loop__apply"
          checked={useAsBackground}
          onChange={setUseAsBackground}
          label={`Kaydedince “${scene.name}” penceresinin arka planı yap`}
        />
      )}
      {track.loop !== null && (
        <Button variant="danger" onClick={turnOff} title="Parça yalnızca ses olarak kalır; arka plan olduğu pencerelerden kalkar.">
          Görüntüyü kapat
        </Button>
      )}
      <Button onClick={onClose}>Vazgeç</Button>
      {!noVideo && (
        <Button variant="primary" disabled={!valid} onClick={save}>
          Kaydet
        </Button>
      )}
    </>
  )

  return (
    <Modal open onClose={onClose} title={`Hareketli görüntü — ${track.originalName}`} size="lg" footer={footer}>
      {noVideo ? (
        <div className="mus-loop__warning" role="alert">
          <WarningIcon size={22} />
          <p>
            Bu dosyada oynatılabilen bir görüntü yok (DND-506). Parça yalnızca ses olarak kullanılır.
          </p>
        </div>
      ) : (
        <div className="mus-loop">
          <video
            ref={videoRef}
            className="mus-loop__video"
            src={src}
            controls
            muted
            preload="metadata"
            onLoadedMetadata={onMetadata}
            onError={() => setNoVideo(true)}
          />
          <p className="mus-loop__hint">
            Videoyu oynatıp istediğin yerde durdur, sonra “Başlangıç buradan” ya da “Bitiş burası” de. Seçilen bölüm oyun
            ekranında sessiz ve sürekli döner.
          </p>
          <div className="mus-loop__edges">
            <LoopEdge
              label="Başlangıç"
              value={loop.start}
              max={duration ?? 0}
              disabled={duration === null}
              onChange={(value) => setEdge('start', value)}
              onPlayhead={() => fromPlayhead('start')}
              playheadLabel="Başlangıç buradan"
            />
            <LoopEdge
              label="Bitiş"
              value={loop.end}
              max={duration ?? 0}
              disabled={duration === null}
              onChange={(value) => setEdge('end', value)}
              onPlayhead={() => fromPlayhead('end')}
              playheadLabel="Bitiş burası"
            />
          </div>
          <div className="mus-loop__summary">
            <span>
              Döngü: <strong>{formatPrecise(loop.start)}</strong> – <strong>{formatPrecise(loop.end)}</strong> (
              {(loop.end - loop.start).toFixed(1)} sn)
            </span>
            <Button
              size="sm"
              active={previewing}
              disabled={duration === null}
              onClick={() => {
                const video = videoRef.current
                setPreviewing((on) => !on)
                if (video !== null && !previewing) {
                  video.currentTime = loop.start
                  void video.play().catch(() => undefined)
                }
              }}
            >
              {previewing ? 'Denemeyi durdur' : 'Aralığı dene'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

interface LoopEdgeProps {
  label: string
  value: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
  onPlayhead: () => void
  playheadLabel: string
}

function LoopEdge({ label, value, max, disabled, onChange, onPlayhead, playheadLabel }: LoopEdgeProps): JSX.Element {
  return (
    <div className="mus-loop__edge">
      <div className="mus-loop__edge-head">
        <span className="mus-loop__edge-label">{label}</span>
        <span className="mus-loop__edge-value">{formatPrecise(value)}</span>
      </div>
      <input
        type="range"
        className="mus-range"
        aria-label={label}
        min={0}
        max={max}
        step={0.1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <Button size="sm" disabled={disabled} onClick={onPlayhead}>
        {playheadLabel}
      </Button>
    </div>
  )
}
