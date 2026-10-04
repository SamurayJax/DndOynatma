import { memo, useState } from 'react'
import type { FocusEvent, JSX, KeyboardEvent } from 'react'
import type { ID, LibraryImage } from '@shared/types'
import { cx } from '@renderer/ui'
import { LibraryCard } from './LibraryCard'
import type { CardClick, SwapKind } from './LibraryCard'
import type { StageUsage } from './libraryModel'

export interface LibraryGridProps {
  images: readonly LibraryImage[]
  click: CardClick
  /** Arka plan bölmeleri: görseller yataydır, kartlar da ona göre biçimlenir. */
  landscape: boolean
  stage: StageUsage
  onActivate: (imageId: ID) => void
  onDelete: (imageId: ID) => void
  onSetKind: (imageId: ID, kind: SwapKind) => void
}

const CARD_SELECTOR = '.lib-card__main'

/** Ok tuşlarıyla kartlar arasında gezinme. Odak yeni karta geçince Tab durağı da o kart olur. */
function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
  const current = event.target
  if (!(current instanceof HTMLElement) || !current.matches(CARD_SELECTOR)) return

  const grid = event.currentTarget
  const cards = Array.from(grid.querySelectorAll<HTMLElement>(CARD_SELECTOR))
  const index = cards.indexOf(current)
  // Hesaplanmış değer her sütunu ayrı yazar ("150px 150px 150px"); sütun sayısı buradan okunur.
  const columns = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length)

  let target: number
  switch (event.key) {
    case 'ArrowRight':
      target = index + 1
      break
    case 'ArrowLeft':
      target = index - 1
      break
    case 'ArrowDown':
      target = index + columns
      break
    case 'ArrowUp':
      target = index - columns
      break
    case 'Home':
      target = 0
      break
    case 'End':
      target = cards.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  cards[target]?.focus()
}

/**
 * Bir bölmenin kart ızgarası. `memo`: panel her durum yayınında yeniden çizilir ama görseller ve
 * sahne kullanımı değişmediyse ızgaraya hiç dokunulmaz.
 *
 * Izgara klavyede tek duraktır: yalnızca bir kartın (ve onun düğmelerinin) `tabIndex`'i 0'dır. Her kart
 * ayrı durak olsaydı 40 görsellik bir bölmeyi geçmek 80 Tab ister, kütüphanenin ardındaki zar ve
 * pencere düğmelerine klavyeyle ulaşılamazdı.
 */
export const LibraryGrid = memo(function LibraryGrid({
  images,
  click,
  landscape,
  stage,
  onActivate,
  onDelete,
  onSetKind
}: LibraryGridProps): JSX.Element {
  const [focusedId, setFocusedId] = useState<ID | null>(null)
  // Son odaklanan kart listeden çıktıysa (silindi, arama değişti) durak ilk karta döner.
  const tabStopId = images.some((image) => image.id === focusedId) ? focusedId : images[0]?.id

  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const imageId = event.target.closest<HTMLElement>('[data-image-id]')?.dataset.imageId
    if (imageId !== undefined) setFocusedId(imageId)
  }

  return (
    <div className={cx('lib-grid', landscape && 'lib-grid--landscape')} onKeyDown={onGridKeyDown} onFocus={onFocus}>
      {images.map((image) => (
        <LibraryCard
          key={image.id}
          image={image}
          click={click}
          stageCount={stage.counts.get(image.id) ?? 0}
          isBackground={stage.backgroundImageId === image.id}
          tabbable={image.id === tabStopId}
          onActivate={onActivate}
          onDelete={onDelete}
          onSetKind={onSetKind}
        />
      ))}
    </div>
  )
})
