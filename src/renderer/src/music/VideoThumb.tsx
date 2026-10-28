import type { JSX } from 'react'
import type { MusicTrack } from '@shared/types'
import { FilmIcon, cx } from '@renderer/ui'
import './music.css'

export interface VideoThumbProps {
  track: MusicTrack
  className?: string
}

/** Hareketli arka planın küçük resmi: döngünün ilk karesi ve köşede film simgesi. Oynatılmaz. */
export function VideoThumb({ track, className }: VideoThumbProps): JSX.Element {
  const start = track.loop?.start ?? 0
  return (
    <span className={cx('mus-thumb', className)}>
      <video
        className="mus-thumb__video"
        // `#t=` ile tarayıcı ilk kareyi döngünün başından alır; dosyanın tamamı yüklenmez.
        src={`${window.dnd.soundUrl(track.fileName)}#t=${start}`}
        muted
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className="mus-thumb__badge" aria-hidden="true">
        <FilmIcon size={14} />
      </span>
    </span>
  )
}
