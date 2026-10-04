import { useEffect, useRef, useState } from 'react'

/** Gönderilen değerin ana süreçten dönmesi için tanınan süre. */
const RELEASE_DELAY_MS = 300

export interface DraftControls {
  /** Girişte gösterilecek metin. */
  shown: string
  handleFocus: () => void
  handleChange: (next: string) => void
  handleBlur: () => void
  /** Kullanıcı bir şey yazdıysa `onCommit`'i çağırır (Enter için). */
  commit: () => void
}

/**
 * Yazı girişleri için yerel taslak.
 *
 * Durum ana süreçte yaşadığı için her tuş vuruşu gidip gelir (dispatch → yayın). Giriş doğrudan
 * `value`'ya bağlansaydı bu gecikmede eski metne dönüp imleci sona atardı. Bu yüzden kullanıcı
 * yazarken kendi yazdığı gösterilir; odak çıkınca yeniden dışarıdan gelen değere dönülür.
 */
export function useDraft(
  value: string,
  onChange: ((value: string) => void) | undefined,
  onCommit: ((value: string) => void) | undefined
): DraftControls {
  const [draft, setDraft] = useState<string | null>(null)
  const focused = useRef(false)
  const edited = useRef(false)
  const text = useRef(value)
  const releaseTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    // Odak dışındayken dışarıdan gelen değer her zaman kazanır.
    if (!focused.current) setDraft(null)
  }, [value])

  useEffect(() => () => window.clearTimeout(releaseTimer.current), [])

  const commit = (): void => {
    if (!edited.current) return
    edited.current = false
    onCommit?.(text.current)
  }

  return {
    shown: draft ?? value,
    handleFocus: () => {
      focused.current = true
      window.clearTimeout(releaseTimer.current)
    },
    handleChange: (next) => {
      edited.current = true
      text.current = next
      setDraft(next)
      onChange?.(next)
    },
    handleBlur: () => {
      focused.current = false
      commit()
      // Taslak hemen bırakılsaydı, gönderilen değer dönene kadar eski metin bir an görünürdü.
      // Değer değişince yukarıdaki etki bırakır; işlem reddedilirse bu zamanlayıcı bırakır.
      window.clearTimeout(releaseTimer.current)
      releaseTimer.current = window.setTimeout(() => setDraft(null), RELEASE_DELAY_MS)
    },
    commit
  }
}
