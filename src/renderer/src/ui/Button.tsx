import type { ComponentProps, JSX, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ComponentProps<'button'> {
  /** Varsayılan `secondary`. */
  variant?: ButtonVariant
  /** Varsayılan `md`. */
  size?: ButtonSize
  /** Yazının solunda gösterilen simge. */
  icon?: ReactNode
  /** Bulunduğu kabın tüm genişliğini kaplar. */
  block?: boolean
  /** Aç/kapa düğmesi olarak kullanılırken seçili durumu (ör. etkin araç). `aria-pressed` olarak da bildirilir. */
  active?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block = false,
  active,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      aria-pressed={active}
      {...rest}
      className={cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, block && 'ui-btn--block', active && 'is-active', className)}
    >
      {icon !== undefined && <span className="ui-btn__icon">{icon}</span>}
      {children !== undefined && <span className="ui-btn__label">{children}</span>}
    </button>
  )
}
