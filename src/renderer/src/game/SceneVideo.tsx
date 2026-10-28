import { memo, useEffect, useRef } from 'react'
import type { JSX, RefObject } from 'react'
import type { Rect } from '@shared/layout'
import { STAGE_HEIGHT, STAGE_WIDTH } from '@shared/types'
import type { MusicTrack, VideoLoop } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/**
 * Videoyu seçilen aralıkta döndürür. Kare geri çağrısı (requestVideoFrameCallback) her karede
 * bakar: `timeupdate` saniyede 4 kez geldiği için aralığın sonunu çeyrek saniyeye kadar aşardı.
 */
export function useVideoLoop(videoRef: RefObject<HTMLVideoElement | null>, loop: VideoLoop | null, src: string | null): void {
  useEffect(() => {
    const video = videoRef.current as FrameVideo | null
    if (video === null || loop === null || src === null) return
    let handle: number | null = null
    let timer: number | null = null

    const check = (): void => {
      if (video.currentTime >= loop.end || video.currentTime < loop.start - 0.25) video.currentTime = loop.start
    }
    const onFrame = (): void => {
      check()
      handle = video.requestVideoFrameCallback?.(onFrame) ?? null
    }
    const start = (): void => {
      if (video.currentTime < loop.start || video.currentTime >= loop.end) video.currentTime = loop.start
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) start()
    video.addEventListener('loadedmetadata', start)
    if (typeof video.requestVideoFrameCallback === 'function') handle = video.requestVideoFrameCallback(onFrame)
    else timer = window.setInterval(check, 50)

    return () => {
      video.removeEventListener('loadedmetadata', start)
      if (handle !== null) video.cancelVideoFrameCallback?.(handle)
      if (timer !== null) window.clearInterval(timer)
    }
  }, [videoRef, loop, src])
}

export interface SceneVideoProps {
  track: MusicTrack | undefined
  /** Oyun alanı (sanal koordinat). */
  area: Rect
}

/**
 * Pencerenin hareketli arka planı: oyun alanını oranını bozmadan kaplayan, sessiz dönen video.
 * Görsellerin ve çizimin altında, düz zeminin üstünde durur. Sesi müzik listesinden ayrıca çalınır.
 */
export const SceneVideo = memo(function SceneVideo({ track, area }: SceneVideoProps): JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement>(null)
  const loop = track?.loop ?? null
  const src = track && loop !== null ? window.dnd.soundUrl(track.fileName) : null
  useVideoLoop(videoRef, loop, src)

  useEffect(() => {
    const video = videoRef.current
    if (video === null || src === null) return
    video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      reportError('Hareketli arka plan başlatılamadı', error)
    })
  }, [src])

  if (src === null) return null
  return (
    <video
      ref={videoRef}
      className="game-video"
      src={src}
      muted
      // Aralığın sonu videonun sonuysa kare geri çağrısı yetişmeden durabilir; başa dönünce aralığa çekilir.
      loop
      playsInline
      preload="auto"
      style={{
        left: `${(area.x / STAGE_WIDTH) * 100}%`,
        top: `${(area.y / STAGE_HEIGHT) * 100}%`,
        width: `${(area.width / STAGE_WIDTH) * 100}%`,
        height: `${(area.height / STAGE_HEIGHT) * 100}%`
      }}
      onError={(event) => reportError('Hareketli arka plan oynatılamadı', event.currentTarget.error?.message ?? 'bilinmeyen hata')}
    />
  )
})
