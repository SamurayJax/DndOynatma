import { useEffect } from 'react'
import { dispatch } from './useAppState'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

function hotkeyFromEvent(event: KeyboardEvent): number | null {
  // Üst sıra ve (NumLock açıkken) sayısal tuş takımı `key` olarak rakam verir.
  if (/^[1-9]$/.test(event.key)) return Number(event.key)
  // Üst sıranın rakamı Shift'siz vermediği klavye düzenlerinde tuşun yerine bakılır.
  const match = /^Digit([1-9])$/.exec(event.code)
  return match ? Number(match[1]) : null
}

/**
 * 1–9 tuşlarıyla pencere (sahne) değiştirir. Yazı yazılırken, değiştirici tuş basılıyken
 * ve bir iletişim kutusu açıkken çalışmaz.
 */
export function useSceneHotkeys(enabled = true): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      if (isTypingTarget(event.target)) return
      // Onay kutusu açıkken basılan rakam arkadaki pencereyi değiştirmesin.
      if (document.querySelector('dialog[open]') !== null) return
      const hotkey = hotkeyFromEvent(event)
      if (hotkey === null) return
      event.preventDefault()
      dispatch({ type: 'scene/activateHotkey', hotkey })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
