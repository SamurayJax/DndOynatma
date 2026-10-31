import { memo, useState } from 'react'
import type { JSX } from 'react'
import { isCardable } from '@shared/layout'
import type { ID, LibraryImage } from '@shared/types'
import { Button, CheckIcon, IconButton, ImageThumb, TrashIcon, cx } from '@renderer/ui'

/** Karta tıklanınca olan: önizleme (Ayarlar) ya da oyun ekranına koyma (oyun). */
export type CardClick = 'preview' | 'place'

export type SwapKind = 'item' | 'teamItem'

export interface LibraryCardProps {
  image: LibraryImage
  click: CardClick
  /** Etkin pencerenin üstünde duran kopya sayısı. */
  stageCount: number
  /** Etkin pencerenin arka planı bu görsel mi. */
  isBackground: boolean
  /** Izgaranın Tab durağı bu kart mı; diğer kartlara ok tuşlarıyla geçilir (bkz. LibraryGrid). */
  tabbable: boolean
  // İşleyiciler kimlik alır ve hiç değişmez; böylece `memo` her yayında kartı yeniden çizdirmez.
  onActivate: (imageId: ID) => void
  onPlaceCard: (imageId: ID) => void
  onDelete: (imageId: ID) => void
  onSetKind: (imageId: ID, kind: SwapKind) => void
}

export const LibraryCard = memo(function LibraryCard({
  image,
  click,
  stageCount,
  isBackground,
  tabbable,
  onActivate,
  onPlaceCard,
  onDelete,
  onSetKind
}: LibraryCardProps): JSX.Element {
  // Her tıklamada artar; `key` olarak kullanılınca animasyon baştan oynar.
  const [flash, setFlash] = useState(0)
  const tabIndex = tabbable ? 0 : -1

  const activate = (): void => {
    // Durumun gidip gelmesi beklenmeden tıklamanın alındığı gösterilir.
    if (click !== 'preview') setFlash((count) => count + 1)
    onActivate(image.id)
  }

  return (
    <div className={cx('lib-card', stageCount > 0 && 'is-onstage', isBackground && 'is-background')} data-image-id={image.id}>
      <button
        type="button"
        className="lib-card__main"
        tabIndex={tabIndex}
        title={`${image.originalName} — ${image.width} × ${image.height} piksel`}
        onClick={activate}
      >
        <span className="lib-card__frame">
          {/* Ad hemen altta yazdığı için küçük resim ekran okuyucuya ayrıca okunmaz. */}
          <ImageThumb image={image} alt="" className="lib-card__image" />
          {(isBackground || stageCount > 0) && (
            <span className="lib-card__badges">
              {isBackground && <span className="lib-badge lib-badge--background">arka plan</span>}
              {stageCount > 0 && (
                <span className="lib-badge lib-badge--onstage">{stageCount > 1 ? `ekranda ×${stageCount}` : 'ekranda'}</span>
              )}
            </span>
          )}
          {flash > 0 && (
            <span key={flash} className="lib-card__flash" aria-hidden="true" onAnimationEnd={() => setFlash(0)}>
              <span className="lib-card__flash-mark">
                <CheckIcon size={26} strokeWidth={2.6} />
              </span>
            </span>
          )}
        </span>
        <span className="lib-card__name">{image.originalName}</span>
      </button>

      <div className="lib-card__actions">
        <IconButton
          className="lib-card__delete"
          label="Sil"
          size="sm"
          tabIndex={tabIndex}
          icon={<TrashIcon size={16} />}
          onClick={() => onDelete(image.id)}
        />
      </div>

      {click === 'place' && isCardable(image.kind) && (
        <Button
          className="lib-card__swap"
          size="sm"
          block
          tabIndex={tabIndex}
          title="Görseli ad, seviye ve canla birlikte kart olarak koy"
          onClick={() => {
            setFlash((count) => count + 1)
            onPlaceCard(image.id)
          }}
        >
          Kart olarak koy
        </Button>
      )}
      {image.kind === 'item' && (
        <Button
          className="lib-card__swap"
          size="sm"
          block
          tabIndex={tabIndex}
          title="Eşya oyunculara geçti: Takım Eşyaları'na taşı"
          onClick={() => onSetKind(image.id, 'teamItem')}
        >
          Takıma ver
        </Button>
      )}
      {image.kind === 'teamItem' && (
        <Button
          className="lib-card__swap"
          size="sm"
          block
          tabIndex={tabIndex}
          title="Eşya artık takımda değil: İtemler'e geri taşı"
          onClick={() => onSetKind(image.id, 'item')}
        >
          Geri al
        </Button>
      )}
    </div>
  )
})
