import { useSyncExternalStore } from 'react'
import type { PlaybackStatus } from '@shared/ipc'

const STOPPED: PlaybackStatus = { trackId: null, position: 0, duration: 0, playing: false }

let status: PlaybackStatus = STOPPED
let started = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  if (!started) {
    started = true
    window.dnd.music.onStatus((next) => {
      status = next
      for (const notify of listeners) notify()
    })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getStatus(): PlaybackStatus {
  return status
}

/**
 * Oyun ekranında çalan müziğin anlık konumu ve süresi (kontrol paneli için). Durumda tutulmaz:
 * saniyede birkaç kez değişir ve yalnızca ilerleme çubuğunu ilgilendirir.
 */
export function usePlaybackStatus(): PlaybackStatus {
  return useSyncExternalStore(subscribe, getStatus)
}

/** "1:05" ya da "1:02:05". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}
