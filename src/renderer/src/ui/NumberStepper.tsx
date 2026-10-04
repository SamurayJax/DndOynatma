import type { JSX, KeyboardEvent } from 'react'
import { cx } from './cx'
import { useFieldControl, useFieldLabelId } from './fieldContext'
import { MinusIcon, PlusIcon } from './icons'

export interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Varsayılan 1. */
  step?: number
  /** Ekran okuyucu adı. `Field` içinde kullanılıyorsa gerekmez. */
  label?: string
  /** Varsayılan `md`. */
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** Değerin gösterim biçimi (ör. `(v) => v + ' LVL'`). */
  format?: (value: number) => string
  id?: string
  className?: string
}

const ICON_SIZE = { sm: 14, md: 16, lg: 20 } as const

/** − değer + biçiminde sayı ayarı. Ortadaki değer odaklanınca ok tuşlarıyla da değişir. */
export function NumberStepper({
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  label,
  size = 'md',
  disabled = false,
  format,
  id,
  className
}: NumberStepperProps): JSX.Element {
  const field = useFieldControl(id)
  const labelId = useFieldLabelId()
  const accessibleName = label === undefined && labelId !== undefined ? { 'aria-labelledby': labelId } : { 'aria-label': label }

  const set = (next: number): void => {
    const clamped = Math.min(max, Math.max(min, next))
    if (clamped !== value) onChange(clamped)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (disabled) return
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        set(value + step)
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        set(value - step)
        break
      case 'Home':
        if (!Number.isFinite(min)) return
        set(min)
        break
      case 'End':
        if (!Number.isFinite(max)) return
        set(max)
        break
      default:
        return
    }
    event.preventDefault()
  }

  const text = format ? format(value) : String(value)

  return (
    <span className={cx('ui-stepper', `ui-stepper--${size}`, disabled && 'is-disabled', className)}>
      {/* Klavyede tek durak ortadaki değerdir; düğmeler fare içindir. */}
      <button
        type="button"
        className="ui-stepper__btn"
        aria-label="Azalt"
        title="Azalt"
        tabIndex={-1}
        disabled={disabled || value <= min}
        onClick={() => set(value - step)}
      >
        <MinusIcon size={ICON_SIZE[size]} />
      </button>
      <span
        {...field}
        {...accessibleName}
        className="ui-stepper__value"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={text}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
      >
        {text}
      </span>
      <button
        type="button"
        className="ui-stepper__btn"
        aria-label="Artır"
        title="Artır"
        tabIndex={-1}
        disabled={disabled || value >= max}
        onClick={() => set(value + step)}
      >
        <PlusIcon size={ICON_SIZE[size]} />
      </button>
    </span>
  )
}
