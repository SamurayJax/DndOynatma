import type { ComponentProps, JSX, ReactNode } from 'react'
import type { ButtonSize, ButtonVariant } from './Button'
import { cx } from './cx'

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label' | 'title'> {
  /** Zorunlu: ekran okuyucu adı ve üzerine gelince çıkan ipucu. */
  label: string
  icon: ReactNode
  /** Varsayılan `ghost`. */
  variant?: ButtonVariant
  /** Varsayılan `md`. */
  size?: ButtonSize
  /** Seçili durum (ör. etkin araç). */
  active?: boolean
}

/** Yalnızca simgeden oluşan kare düğme. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  active,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type={type}
      aria-pressed={active}
      {...rest}
      aria-label={label}
      title={label}
      className={cx('ui-btn', 'ui-btn--icon', `ui-btn--${variant}`, `ui-btn--${size}`, active && 'is-active', className)}
    >
      <span className="ui-btn__icon">{icon}</span>
    </button>
  )
}
