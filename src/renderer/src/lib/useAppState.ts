/**
 * Uygulama durumunun arayüzdeki tek kopyası. Durumun sahibi ana süreçtir; burada yalnızca
 * son yayınlanan hali tutulur. Değişiklik yapmak için `dispatch` kullanılır.
 */
import { useSyncExternalStore } from 'react'
import type { Action } from '@shared/actions'
import type { AppState, FullState, SessionState } from '@shared/types'
import { reportError } from './reportError'

let current: FullState | null = null
let started = false
const listeners = new Set<() => void>()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Yeni durumu eskisiyle karşılaştırır ve değişmeyen dalların eski nesnelerini korur.
 * Her yayın IPC'den yepyeni nesnelerle gelir; bu olmasa tek bir can değişikliği bütün
 * bileşenleri (kütüphanedeki yüzlerce küçük resim dahil) yeniden çizdirirdi.
 */
function shareStructure(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) return previous
  if (Array.isArray(previous) && Array.isArray(next)) {
    const before: readonly unknown[] = previous
    const after: readonly unknown[] = next
    let same = before.length === after.length
    const merged = after.map((item, index) => {
      const shared = index < before.length ? shareStructure(before[index], item) : item
      if (shared !== before[index]) same = false
      return shared
    })
    return same ? previous : merged
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    const keys = Object.keys(next)
    let same = Object.keys(previous).length === keys.length
    const merged: Record<string, unknown> = {}
    for (const key of keys) {
      const known = Object.hasOwn(previous, key)
      const shared = known ? shareStructure(previous[key], next[key]) : next[key]
      if (!known || shared !== previous[key]) same = false
      merged[key] = shared
    }
    return same ? previous : merged
  }
  return next
}

function publish(next: FullState): void {
  // Birleştirme yalnızca nesne kimliklerini korur; içerik `next` ile birebir aynıdır.
  const shared = current === null ? next : (shareStructure(current, next) as FullState)
  if (shared === current) return
  current = shared
  for (const listener of listeners) listener()
}

function ensureStarted(): void {
  if (started) return
  started = true
  // Önce abone olunur: ilk durum istenirken yapılan bir değişiklik kaçmasın.
  window.dnd.onState(publish)
  window.dnd
    .getState()
    .then((state) => {
      // Yanıt beklenirken yayın geldiyse o daha günceldir; eski yanıtla ezilmez.
      if (current === null) publish(state)
    })
    .catch((error: unknown) => reportError('Durum alınamadı', error))
}

function subscribe(listener: () => void): () => void {
  ensureStarted()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getFull(): FullState | null {
  return current
}

function getApp(): AppState | null {
  return current?.app ?? null
}

function getSession(): SessionState | null {
  return current?.session ?? null
}

/** Durumun tamamı; ana süreçten ilk yanıt gelene kadar `null`. Kök bileşenler bununla bekler. */
export function useFullState(): FullState | null {
  return useSyncExternalStore(subscribe, getFull)
}

/** Kalıcı durum. Yalnızca `app` değişince yeniden çizer. Durum yüklenmeden çağrılırsa hata fırlatır. */
export function useApp(): AppState {
  const app = useSyncExternalStore(subscribe, getApp)
  if (app === null) {
    throw new Error('useApp: durum henüz yüklenmedi. Kök bileşen useFullState() ile beklemeli.')
  }
  return app
}

/** Oturum durumu (araç, çizim sayacı, zar geçmişi). Durum yüklenmeden çağrılırsa hata fırlatır. */
export function useSession(): SessionState {
  const session = useSyncExternalStore(subscribe, getSession)
  if (session === null) {
    throw new Error('useSession: durum henüz yüklenmedi. Kök bileşen useFullState() ile beklemeli.')
  }
  return session
}

/** Olay işleyicilerinde anlık okuma için (yeniden çizime abone olmaz). */
export function getFullState(): FullState | null {
  return current
}

/** Durumu değiştirmenin tek yolu: işlemi ana sürece gönderir. */
export function dispatch(action: Action): void {
  window.dnd.dispatch(action)
}
