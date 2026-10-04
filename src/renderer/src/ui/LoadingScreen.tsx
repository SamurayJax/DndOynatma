import type { JSX } from 'react'
import { DiceIcon } from './icons'

/** Durum ana süreçten gelene kadar kök bileşenlerin gösterdiği ekran. */
export function LoadingScreen(): JSX.Element {
  return (
    <div className="ui-screen ui-loading" role="status">
      <span className="ui-loading__icon">
        <DiceIcon size={40} strokeWidth={1.2} />
      </span>
      <span>Yükleniyor…</span>
    </div>
  )
}
