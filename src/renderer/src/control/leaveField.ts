import type { KeyboardEvent } from 'react'

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * Yazı alanından klavyeyle çıkış. Odak yazı alanındayken 1–9 atama tuşları çalışmaz; alandan
 * çıkmanın tek yolu fare olursa, etiketi ya da notu yazıp hemen bir tuşa basan DM pencere değiştirmek
 * yerine alana rakam yazar.
 */
export function blurOnEscape(event: KeyboardEvent<Field>): void {
  if (event.key === 'Escape') event.currentTarget.blur()
}

/** Tek satırlık alanlar için: Enter de "tamam" demektir. */
export function blurOnEnterOrEscape(event: KeyboardEvent<Field>): void {
  if (event.key === 'Escape' || (event.key === 'Enter' && !event.nativeEvent.isComposing)) event.currentTarget.blur()
}
