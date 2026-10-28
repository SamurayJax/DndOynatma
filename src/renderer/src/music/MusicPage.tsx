import { useEffect, useRef, useState } from 'react'
import type { DragEvent, JSX } from 'react'
import type { AmbientImportResult, MusicImportResult } from '@shared/ipc'
import { activeScene } from '@shared/layout'
import { MAX_AMBIENTS, TEXT_LIMITS } from '@shared/reducer'
import type { AmbientSound, MusicTrack, RepeatMode } from '@shared/types'
import { dispatch, useApp, useSession } from '@renderer/lib/useAppState'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  ImageIcon,
  EmptyState,
  FilmIcon,
  IconButton,
  MusicIcon,
  Panel,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SkipBackIcon,
  SkipForwardIcon,
  StopIcon,
  TextInput,
  TrashIcon,
  UploadIcon,
  VolumeIcon,
  WavesIcon,
  cx
} from '@renderer/ui'
import { addAmbient, confirmRemoveAmbient, confirmRemoveTrack, droppedPaths, importTracks } from './musicActions'
import { formatDuration, usePlaybackStatus } from './usePlaybackStatus'
import { VideoSetup } from './VideoSetup'
import './music.css'

interface VideoSetupRequest {
  trackId: string
  start: 'ask' | 'loop'
}

/**
 * Kontrol panelinin "Müzik" sayfası: solda oynatıcı ve parça listesi, sağda ortam sesleri.
 * Ses oyun ekranında çalar; buradaki her düğme yalnızca çalma durumunu değiştirir.
 */
export function MusicPage(): JSX.Element {
  const { music } = useApp()
  // Yüklemeden sonra her MP4 için sırayla "nasıl kullanılsın?" sorulur.
  const [setupQueue, setSetupQueue] = useState<VideoSetupRequest[]>([])
  const setup = setupQueue[0]
  const setupTrack = setup === undefined ? undefined : music.tracks.find((track) => track.id === setup.trackId)

  useEffect(() => {
    // Sorulan parça bu arada silindiyse sıradakine geçilir.
    if (setup !== undefined && setupTrack === undefined) setSetupQueue((queue) => queue.slice(1))
  }, [setup, setupTrack])

  const afterImport = (added: MusicTrack[]): void => {
    const videos = added.filter((track) => track.hasVideo).map((track): VideoSetupRequest => ({ trackId: track.id, start: 'ask' }))
    if (videos.length > 0) setSetupQueue((queue) => [...queue, ...videos])
  }

  return (
    <div className="mus-page">
      <div className="mus-col mus-col--main">
        <PlayerPanel />
        <TrackList onImported={afterImport} onEditVideo={(track) => setSetupQueue((queue) => [...queue, { trackId: track.id, start: 'loop' }])} />
      </div>
      <div className="mus-col mus-col--side">
        <AmbientPanel />
      </div>
      {setup !== undefined && setupTrack !== undefined && (
        <VideoSetup key={`${setup.trackId}-${setup.start}`} track={setupTrack} start={setup.start} onClose={() => setSetupQueue((queue) => queue.slice(1))} />
      )}
    </div>
  )
}

// --- Oynatıcı ----------------------------------------------------------------

const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }
const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Tekrar kapalı: liste bitince müzik durur',
  all: 'Listeyi tekrarla: son parçadan sonra başa döner',
  one: 'Bu parçayı tekrarla'
}

function PlayerPanel(): JSX.Element {
  const { music } = useApp()
  const { playback } = useSession()
  const status = usePlaybackStatus()
  const track = music.tracks.find((entry) => entry.id === playback.trackId)
  // Sürüklerken çubuk elin altında kalsın; bırakınca sarılır.
  const [dragging, setDragging] = useState<number | null>(null)

  const sameTrack = status.trackId === playback.trackId
  const duration = sameTrack ? status.duration : 0
  const position = dragging ?? (sameTrack ? status.position : 0)
  const hasTracks = music.tracks.length > 0

  const togglePlay = (): void => {
    if (track === undefined) {
      if (hasTracks) dispatch({ type: 'playback/play', trackId: music.tracks[0].id })
      return
    }
    dispatch({ type: playback.playing ? 'playback/pause' : 'playback/resume' })
  }

  const commitSeek = (): void => {
    if (dragging !== null) dispatch({ type: 'playback/seek', position: dragging })
    setDragging(null)
  }

  return (
    <Panel className="mus-player" title="Çalan">
      <div className="mus-player__now">
        <span className={cx('mus-player__disc', playback.playing && 'is-playing')} aria-hidden="true">
          <MusicIcon size={26} strokeWidth={1.5} />
        </span>
        <div className="mus-player__title-wrap">
          {track === undefined ? (
            <span className="mus-player__title is-empty">{hasTracks ? 'Parça seçilmedi' : 'Listede parça yok'}</span>
          ) : (
            <span className="mus-player__title" title={track.originalName}>
              {track.originalName}
            </span>
          )}
          <span className="mus-player__state">
            {track === undefined ? 'Oyun ekranında müzik çalmıyor' : playback.playing ? 'Oyun ekranında çalıyor' : 'Duraklatıldı'}
          </span>
        </div>
      </div>

      <div className="mus-player__progress">
        <span className="mus-player__time">{formatDuration(position)}</span>
        <input
          type="range"
          className="mus-range mus-range--progress"
          aria-label="Parçanın konumu"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.5}
          value={duration > 0 ? Math.min(position, duration) : 0}
          disabled={track === undefined || duration <= 0}
          onChange={(event) => setDragging(Number(event.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          onBlur={() => setDragging(null)}
        />
        <span className="mus-player__time">{formatDuration(duration)}</span>
      </div>

      <div className="mus-player__controls">
        <IconButton label="Önceki parça" icon={<SkipBackIcon size={22} />} size="lg" disabled={!hasTracks} onClick={() => dispatch({ type: 'playback/previous' })} />
        <Button
          variant="primary"
          size="lg"
          className="mus-player__play"
          icon={playback.playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
          disabled={!hasTracks}
          onClick={togglePlay}
        >
          {playback.playing ? 'Duraklat' : 'Çal'}
        </Button>
        <IconButton label="Sonraki parça" icon={<SkipForwardIcon size={22} />} size="lg" disabled={!hasTracks} onClick={() => dispatch({ type: 'playback/next' })} />
        <IconButton label="Durdur" icon={<StopIcon size={22} />} size="lg" disabled={track === undefined} onClick={() => dispatch({ type: 'playback/stop' })} />
        <IconButton
          label={REPEAT_LABEL[music.repeat]}
          icon={<RepeatIcon size={22} one={music.repeat === 'one'} />}
          size="lg"
          active={music.repeat !== 'off'}
          onClick={() => dispatch({ type: 'music/setRepeat', repeat: REPEAT_NEXT[music.repeat] })}
        />
        <VolumeSlider
          className="mus-player__volume"
          label="Müziğin sesi"
          value={music.musicVolume}
          onChange={(volume) => dispatch({ type: 'music/setVolume', volume })}
        />
      </div>
    </Panel>
  )
}

interface VolumeSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  className?: string
  compact?: boolean
}

/** Ses düzeyi: 0–100. Sürüklerken her adım gönderilir; kayıt ana süreçte zaten gecikmeli yazılır. */
function VolumeSlider({ label, value, onChange, className, compact = false }: VolumeSliderProps): JSX.Element {
  const percent = Math.round(value * 100)
  return (
    <label className={cx('mus-volume', compact && 'mus-volume--compact', className)} title={`${label}: %${percent}`}>
      <VolumeIcon size={compact ? 16 : 20} muted={percent === 0} />
      <input
        type="range"
        className="mus-range"
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <span className="mus-volume__value">{percent}</span>
    </label>
  )
}

// --- Parça listesi -----------------------------------------------------------

function useDropZone(onFiles: (paths: string[]) => void): { over: boolean; handlers: Record<string, (event: DragEvent<HTMLElement>) => void> } {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const hasFiles = (event: DragEvent<HTMLElement>): boolean => event.dataTransfer.types.includes('Files')
  return {
    over,
    handlers: {
      onDragEnter: (event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        depth.current += 1
        setOver(true)
      },
      onDragOver: (event) => {
        if (hasFiles(event)) event.preventDefault()
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      },
      onDrop: (event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        depth.current = 0
        setOver(false)
        const paths = droppedPaths(event.dataTransfer.files)
        if (paths.length > 0) onFiles(paths)
      }
    }
  }
}

interface TrackListProps {
  onImported: (added: MusicTrack[]) => void
  onEditVideo: (track: MusicTrack) => void
}

function TrackList({ onImported, onEditVideo }: TrackListProps): JSX.Element {
  const { music } = useApp()
  const { playback } = useSession()
  const [busy, setBusy] = useState(false)

  const run = (start: () => Promise<MusicImportResult>): void => {
    setBusy(true)
    void importTracks(start)
      .then(onImported)
      .finally(() => setBusy(false))
  }
  const drop = useDropZone((paths) => run(() => window.dnd.music.importFiles(paths)))

  return (
    <Panel
      className={cx('mus-tracks', drop.over && 'is-drop-target')}
      title={
        <>
          Parçalar<span className="ctl-count">{music.tracks.length}</span>
        </>
      }
      actions={
        <Button size="sm" variant="primary" icon={<UploadIcon size={16} />} disabled={busy} onClick={() => run(() => window.dnd.music.import())}>
          {busy ? 'Yükleniyor…' : 'Müzik yükle'}
        </Button>
      }
      flush
    >
      <div className="mus-tracks__body" {...drop.handlers}>
        {music.tracks.length === 0 ? (
          <EmptyState
            icon={<MusicIcon size={28} />}
            title="Henüz parça yok"
            hint="“Müzik yükle” ile ya da dosyaları buraya sürükleyerek ekle (MP3, OGG, WAV, M4A, MP4)."
          />
        ) : (
          <ol className="mus-tracks__list" aria-label="Parçalar">
            {music.tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                last={index === music.tracks.length - 1}
                current={track.id === playback.trackId}
                playing={track.id === playback.trackId && playback.playing}
                onEditVideo={onEditVideo}
              />
            ))}
          </ol>
        )}
        {drop.over && <div className="mus-tracks__drop">Bırak: parçalar listeye eklensin</div>}
      </div>
    </Panel>
  )
}

interface TrackRowProps {
  track: MusicTrack
  index: number
  last: boolean
  current: boolean
  playing: boolean
  onEditVideo: (track: MusicTrack) => void
}

function TrackRow({ track, index, last, current, playing, onEditVideo }: TrackRowProps): JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const scene = activeScene(useApp())
  const isBackground = scene !== undefined && scene.videoTrackId === track.id

  const toggleBackground = (): void => {
    if (scene === undefined) return
    dispatch({ type: 'scene/setVideo', sceneId: scene.id, trackId: isBackground ? null : track.id })
  }

  return (
    <li className={cx('mus-track', current && 'is-current', playing && 'is-playing')} data-track={track.id}>
      <button
        type="button"
        className="mus-track__main"
        title={playing ? 'Duraklat' : current ? 'Devam et' : 'Baştan çal'}
        onClick={() =>
          dispatch(
            playing ? { type: 'playback/pause' } : current ? { type: 'playback/resume' } : { type: 'playback/play', trackId: track.id }
          )
        }
        onDoubleClick={() => dispatch({ type: 'playback/play', trackId: track.id })}
      >
        <span className="mus-track__index">{playing ? <PauseIcon size={16} /> : current ? <PlayIcon size={16} /> : index + 1}</span>
        {!renaming && (
          <span className="mus-track__name" title={track.originalName}>
            {track.originalName}
          </span>
        )}
      </button>
      {renaming && (
        <TextInput
          className="mus-track__rename"
          aria-label="Parçanın adı"
          value={track.originalName}
          maxLength={TEXT_LIMITS.trackName}
          autoFocus
          onCommit={(name) => dispatch({ type: 'music/renameTrack', trackId: track.id, name })}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
          }}
        />
      )}
      {track.hasVideo && (
        <span className={cx('mus-track__badge', track.loop !== null && 'is-on')} title={track.loop !== null ? 'Hareketli arka plan olarak kullanılabilir' : 'Videonun yalnızca sesi kullanılıyor'}>
          <FilmIcon size={14} />
          {track.loop !== null ? 'Arka plan' : 'Video'}
        </span>
      )}
      <div className="mus-track__actions">
        {track.loop !== null && (
          <Button
            size="sm"
            className="mus-track__background"
            icon={<ImageIcon size={16} />}
            active={isBackground}
            disabled={scene === undefined}
            title={
              scene === undefined
                ? 'Önce bir pencere oluştur (Kontrol Paneli › Pencereler).'
                : isBackground
                  ? `“${scene.name}” penceresinin arka planı; tıklayınca kaldırılır.`
                  : `“${scene.name}” penceresinin arka planı yap.`
            }
            onClick={toggleBackground}
          >
            {isBackground ? 'Ekranda' : 'Arka plan yap'}
          </Button>
        )}
        {track.hasVideo && <IconButton label="Hareketli görüntü ayarla" icon={<FilmIcon size={16} />} size="sm" onClick={() => onEditVideo(track)} />}
        <IconButton label="Adını değiştir" icon={<PencilIcon size={16} />} size="sm" onClick={() => setRenaming(true)} />
        <IconButton label="Yukarı taşı" icon={<ArrowUpIcon size={16} />} size="sm" disabled={index === 0} onClick={() => dispatch({ type: 'music/moveTrack', trackId: track.id, to: 'up' })} />
        <IconButton label="Aşağı taşı" icon={<ArrowDownIcon size={16} />} size="sm" disabled={last} onClick={() => dispatch({ type: 'music/moveTrack', trackId: track.id, to: 'down' })} />
        <IconButton label="Sil" icon={<TrashIcon size={16} />} size="sm" className="mus-danger" onClick={() => void confirmRemoveTrack(track)} />
      </div>
    </li>
  )
}

// --- Ortam sesleri -----------------------------------------------------------

function AmbientPanel(): JSX.Element {
  const { music } = useApp()
  const { playback } = useSession()
  const [busy, setBusy] = useState(false)
  const full = music.ambients.length >= MAX_AMBIENTS

  const run = (start: () => Promise<AmbientImportResult>): void => {
    setBusy(true)
    void addAmbient(start).finally(() => setBusy(false))
  }
  const drop = useDropZone((paths) => {
    if (!full) run(() => window.dnd.music.addAmbientFile(paths[0]))
  })

  return (
    <Panel
      className={cx('mus-ambients', drop.over && 'is-drop-target')}
      title={
        <>
          Ortam sesleri<span className="ctl-count">{music.ambients.length}</span>
        </>
      }
      actions={
        <Button
          size="sm"
          variant="primary"
          icon={<PlusIcon size={16} />}
          disabled={busy || full}
          title={full ? `En fazla ${MAX_AMBIENTS} ortam sesi eklenebilir.` : 'Bir ses dosyası seç; düğmesi dosyanın adıyla eklenir.'}
          onClick={() => run(() => window.dnd.music.addAmbient())}
        >
          {busy ? 'Ekleniyor…' : 'Ses ekle'}
        </Button>
      }
    >
      <div className="mus-ambients__body" {...drop.handlers}>
        <div className="mus-ambients__master">
          <span className="mus-ambients__master-label" aria-hidden="true">
            Genel
          </span>
          <VolumeSlider label="Ortam seslerinin genel sesi" value={music.ambientVolume} onChange={(volume) => dispatch({ type: 'music/setAmbientVolume', volume })} />
          <Button size="sm" icon={<StopIcon size={16} />} disabled={playback.ambientIds.length === 0} onClick={() => dispatch({ type: 'ambient/stopAll' })}>
            Hepsini durdur
          </Button>
        </div>
        {music.ambients.length === 0 ? (
          <EmptyState
            icon={<WavesIcon size={28} />}
            title="Ortam sesi yok"
            hint="Kuş sesi, yağmur, taverna uğultusu gibi döngüde çalacak sesleri “Ses ekle” ile ekle. Her biri bir düğme olur."
          />
        ) : (
          <div className="mus-ambients__grid">
            {music.ambients.map((ambient) => (
              <AmbientCard key={ambient.id} ambient={ambient} active={playback.ambientIds.includes(ambient.id)} />
            ))}
          </div>
        )}
        {drop.over && <div className="mus-tracks__drop">Bırak: ortam sesi olarak eklensin</div>}
      </div>
    </Panel>
  )
}

function AmbientCard({ ambient, active }: { ambient: AmbientSound; active: boolean }): JSX.Element {
  const [renaming, setRenaming] = useState(false)

  return (
    <div className={cx('mus-ambient', active && 'is-active')} data-ambient={ambient.id}>
      {renaming ? (
        <TextInput
          className="mus-ambient__rename"
          aria-label="Ortam sesinin adı"
          value={ambient.name}
          maxLength={TEXT_LIMITS.ambientName}
          autoFocus
          onCommit={(name) => dispatch({ type: 'ambient/update', ambientId: ambient.id, patch: { name } })}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
          }}
        />
      ) : (
        <button
          type="button"
          className="mus-ambient__toggle"
          aria-pressed={active}
          title={active ? 'Durdur' : 'Döngüde çal'}
          onClick={() => dispatch({ type: 'ambient/toggle', ambientId: ambient.id })}
        >
          <WavesIcon size={22} />
          <span className="mus-ambient__name">{ambient.name}</span>
          <span className="mus-ambient__state">{active ? 'Çalıyor' : 'Kapalı'}</span>
        </button>
      )}
      <div className="mus-ambient__footer">
        <VolumeSlider
          compact
          label={`${ambient.name} sesi`}
          value={ambient.volume}
          onChange={(volume) => dispatch({ type: 'ambient/update', ambientId: ambient.id, patch: { volume } })}
        />
        <IconButton label="Adını değiştir" icon={<PencilIcon size={14} />} size="sm" onClick={() => setRenaming(true)} />
        <IconButton label="Sil" icon={<TrashIcon size={14} />} size="sm" className="mus-danger" onClick={() => void confirmRemoveAmbient(ambient)} />
      </div>
    </div>
  )
}
