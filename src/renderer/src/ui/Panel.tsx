import type { JSX, ReactNode } from 'react'
import { cx } from './cx'

export interface PanelProps {
  /** Verilirse başlık şeridi çizilir. */
  title?: ReactNode
  /** Başlık şeridinin sağındaki düğmeler. */
  actions?: ReactNode
  children: ReactNode
  /** Gövdenin iç boşluğunu kaldırır (liste ya da ızgara kenara yaslanacaksa). */
  flush?: boolean
  /** Gövde taşarsa kendi içinde kayar; panelin yüksekliği dışarıdan sınırlanmış olmalıdır. */
  scroll?: boolean
  className?: string
}

/** Başlıklı kart. */
export function Panel({ title, actions, children, flush = false, scroll = false, className }: PanelProps): JSX.Element {
  const hasHeader = title !== undefined || actions !== undefined
  return (
    <section className={cx('ui-panel', flush && 'ui-panel--flush', scroll && 'ui-panel--scroll', className)}>
      {hasHeader && (
        <header className="ui-panel__header">
          {title !== undefined && <h2 className="ui-panel__title">{title}</h2>}
          {actions !== undefined && <div className="ui-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="ui-panel__body">{children}</div>
    </section>
  )
}
