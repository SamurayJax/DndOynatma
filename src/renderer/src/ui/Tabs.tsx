import { useRef } from 'react'
import type { JSX, KeyboardEvent, ReactNode } from 'react'
import { cx } from './cx'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  /** Etiketin yanındaki küçük sayı (ör. bölmedeki görsel sayısı). Verilmezse gösterilmez. */
  badge?: number
  icon?: ReactNode
  disabled?: boolean
}

export interface TabsProps<T extends string = string> {
  tabs: readonly TabItem<T>[]
  /** Seçili sekmenin kimliği. */
  value: T
  onChange: (id: T) => void
  /** Sekme listesinin ekran okuyucu adı. */
  label?: string
  /** Varsayılan `md`. */
  size?: 'sm' | 'md'
  /** Verilirse her sekme düğmesinin id'si `${idBase}-${tab.id}` olur (içerik alanını `aria-labelledby` ile bağlamak için). */
  idBase?: string
  className?: string
}

/** Denetimli sekme şeridi. İçeriği çağıran taraf `value`'ya göre kendisi çizer. */
export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  label,
  size = 'md',
  idBase,
  className
}: TabsProps<T>): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const enabled = tabs.filter((tab) => !tab.disabled)
    if (enabled.length === 0) return
    const index = enabled.findIndex((tab) => tab.id === value)
    let target: TabItem<T> | undefined
    switch (event.key) {
      case 'ArrowRight':
        target = enabled[(index + 1) % enabled.length]
        break
      case 'ArrowLeft':
        target = enabled[(index - 1 + enabled.length) % enabled.length]
        break
      case 'Home':
        target = enabled[0]
        break
      case 'End':
        target = enabled[enabled.length - 1]
        break
      default:
        return
    }
    if (target === undefined) return
    event.preventDefault()
    onChange(target.id)
    const position = tabs.indexOf(target)
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[position]?.focus()
  }

  // Seçili sekme listede yoksa şerit klavyeyle erişilmez kalmasın diye ilk sekme odaklanabilir olur.
  const focusableId = tabs.some((tab) => tab.id === value) ? value : tabs.find((tab) => !tab.disabled)?.id

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cx('ui-tabs', size === 'sm' && 'ui-tabs--sm', className)}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={idBase === undefined ? undefined : `${idBase}-${tab.id}`}
            className="ui-tab"
            aria-selected={selected}
            // Klavyeyle şeride tek Tab ile girilir; sekmeler arasında ok tuşlarıyla gezilir.
            tabIndex={tab.id === focusableId ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon !== undefined && <span className="ui-tab__icon">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && <span className="ui-tab__badge">{tab.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
