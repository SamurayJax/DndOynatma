import type { JSX, ReactNode } from 'react'
import { cx } from './cx'
import { useFieldControl } from './fieldContext'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Anahtarın yanındaki yazı. Verilmezse `aria-label` ya da çevreleyen `Field` adlandırır. */
  label?: ReactNode
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string
}

/** Aç/kapa anahtarı. */
export function Toggle({ checked, onChange, label, disabled = false, id, className, 'aria-label': ariaLabel }: ToggleProps): JSX.Element {
  const field = useFieldControl(id)

  return (
    <label className={cx('ui-toggle', disabled && 'is-disabled', className)}>
      <input
        {...field}
        type="checkbox"
        role="switch"
        className="ui-toggle__input"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ui-toggle__track" aria-hidden="true">
        <span className="ui-toggle__thumb" />
      </span>
      {label !== undefined && <span className="ui-toggle__label">{label}</span>}
    </label>
  )
}
