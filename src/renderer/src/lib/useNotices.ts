/**
 * Ekranda gösterilen bildirimlerin deposu: ana süreçten gelenler (`window.dnd.onNotice`)
 * ve arayüzün kendi kısa mesajları (`toast`). Görüntüleyen bileşen `ToastHost`.
 */
import { useSyncExternalStore } from 'react'
import type { ErrorCode, LogLevel } from '@shared/errors'
import { newId } from '@shared/id'
import type { Notice } from '@shared/ipc'

const MAX_NOTICES = 5

let notices: readonly Notice[] = []
let started = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function push(notice: Notice): void {
  if (notices.some((item) => item.id === notice.id)) return
  const next = [...notices, notice]
  if (next.length > MAX_NOTICES) {
    // Yer açarken önce kendiliğinden kapanacak olanlar gider; hatalar en son atılır.
    const victim = next.findIndex((item) => item.level !== 'HATA')
    next.splice(victim === -1 ? 0 : victim, 1)
  }
  notices = next
  emit()
}

function subscribe(listener: () => void): () => void {
  if (!started) {
    started = true
    window.dnd.onNotice(push)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getNotices(): readonly Notice[] {
  return notices
}

/** Görünen bildirimler, en eskisi başta. İlk kullanımda ana sürecin bildirimlerine abone olur. */
export function useNotices(): readonly Notice[] {
  return useSyncExternalStore(subscribe, getNotices)
}

export function dismissNotice(id: string): void {
  const next = notices.filter((item) => item.id !== id)
  if (next.length === notices.length) return
  notices = next
  emit()
}

/**
 * Yalnızca bu pencerede görünen kısa mesaj. Loga yazmaz; loga da yazılması gerekiyorsa
 * ayrıca `window.dnd.log` çağrılır.
 */
export function toast(message: string, level: LogLevel = 'BILGI', code: ErrorCode | null = null): void {
  push({ id: newId(), level, code, message })
}
