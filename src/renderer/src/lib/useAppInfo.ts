import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'
import { reportError } from './reportError'

let cached: AppInfo | null = null
let pending: Promise<AppInfo | null> | null = null

function load(): Promise<AppInfo | null> {
  // Bilgi çalışma boyunca değişmez; bir kez sorulur, bütün bileşenler aynı yanıtı paylaşır.
  pending ??= window.dnd.app
    .getInfo()
    .then((info) => {
      cached = info
      return info
    })
    .catch((error: unknown) => {
      reportError('Uygulama bilgisi alınamadı', error)
      pending = null
      return null
    })
  return pending
}

/** Sürüm, klasör yolları ve "geçen sefer çöktü mü" bilgisi; yanıt gelene kadar `null`. */
export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(cached)

  useEffect(() => {
    if (cached !== null) return
    let alive = true
    void load().then((value) => {
      if (alive && value !== null) setInfo(value)
    })
    return () => {
      alive = false
    }
  }, [])

  return info
}
