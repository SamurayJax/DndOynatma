import type { JSX } from 'react'
import { cx } from '@renderer/ui'

/** Pencerenin atama tuşu (1–9); atanmamışsa "—". */
export function HotkeyBadge({ hotkey }: { hotkey: number | null }): JSX.Element {
  return (
    <span className={cx('ctl-key', hotkey === null && 'ctl-key--none')} title={hotkey === null ? 'Tuş atanmamış' : `Atama tuşu: ${hotkey}`}>
      {hotkey ?? '—'}
    </span>
  )
}
