import type { JSX, ReactNode } from 'react'
import { cx } from './cx'

export interface EmptyStateProps {
  title: string
  icon?: ReactNode
  /** Ne yapılabileceğini anlatan kısa açıklama. */
  hint?: ReactNode
  /** Genellikle tek bir düğme ("Görsel yükle" gibi). */
  action?: ReactNode
  /** Dar alanlar (kontrol paneli listeleri) için daha az boşluk. */
  compact?: boolean
  className?: string
}

/** Boş listelerin yerine gösterilir. */
export function EmptyState({ title, icon, hint, action, compact = false, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cx('ui-empty', compact && 'ui-empty--compact', className)}>
      {icon !== undefined && <span className="ui-empty__icon">{icon}</span>}
      <p className="ui-empty__title">{title}</p>
      {hint !== undefined && <p className="ui-empty__hint">{hint}</p>}
      {action !== undefined && <div className="ui-empty__action">{action}</div>}
    </div>
  )
}
