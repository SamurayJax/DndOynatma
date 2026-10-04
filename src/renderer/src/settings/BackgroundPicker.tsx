import type { JSX } from 'react'
import { newId } from '@shared/id'
import { CATEGORIES } from '@shared/layout'
import type { LibraryImage, SceneWindow } from '@shared/types'
import { dispatch } from '@renderer/lib/useAppState'
import { Button, CheckIcon, EmptyState, ImageIcon, ImageThumb, Modal, cx } from '@renderer/ui'

export interface BackgroundPickerProps {
  scene: SceneWindow
  library: readonly LibraryImage[]
  onClose: () => void
}

/** Arka plan olabilen bölmeler (Mekanlar, Sahneler); etiketler kütüphaneyle aynı kaynaktan gelir. */
const BACKGROUND_CATEGORIES = CATEGORIES.filter((category) => category.role === 'background')

/** Bir pencerenin arka planını kütüphanedeki Mekanlar ve Sahneler arasından seçtirir. */
export function BackgroundPicker({ scene, library, onClose }: BackgroundPickerProps): JSX.Element {
  const groups = BACKGROUND_CATEGORIES.map((category) => ({
    category,
    images: library.filter((image) => image.kind === category.id)
  }))
  const hasImages = groups.some((group) => group.images.length > 0)
  const currentImageId = scene.background?.imageId ?? null

  const pick = (image: LibraryImage): void => {
    // Zaten arka plan olan görsel yeniden konmaz: yeniden koymak DM'in elle verdiği yeri ve boyutu sıfırlardı.
    if (image.id !== currentImageId) {
      dispatch({
        type: 'stage/setBackground',
        sceneId: scene.id,
        fallbackSceneId: newId(),
        itemId: newId(),
        imageId: image.id
      })
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Arka plan seç — ${scene.name}`} size="lg" footer={<Button onClick={onClose}>Vazgeç</Button>}>
      {hasImages ? (
        <div className="set-picker">
          {groups.map(({ category, images }) => (
            <section key={category.id} className="set-picker__group" aria-label={category.label}>
              <h3 className="set-picker__title">
                {category.label}
                <span className="set-picker__count">{images.length}</span>
              </h3>
              {images.length === 0 ? (
                <p className="set-picker__none">Bu bölmede görsel yok.</p>
              ) : (
                <div className="set-picker__grid">
                  {images.map((image) => {
                    const selected = image.id === currentImageId
                    return (
                      <button
                        key={image.id}
                        type="button"
                        className={cx('set-picker__item', selected && 'is-selected')}
                        title={image.originalName}
                        aria-pressed={selected}
                        data-autofocus={selected ? '' : undefined}
                        onClick={() => pick(image)}
                      >
                        <ImageThumb image={image} fit="cover" alt="" className="set-picker__thumb" />
                        <span className="set-picker__name">{image.originalName}</span>
                        {selected && (
                          <span className="set-picker__check">
                            <CheckIcon size={14} strokeWidth={2.6} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ImageIcon size={28} />}
          title="Arka plan olabilecek görsel yok"
          hint="Arka planlar kütüphanenin Mekanlar ve Sahneler bölmelerinden seçilir. Önce Ayarlar › Kütüphane bölümünden bu bölmelere görsel yükleyin."
        />
      )}
    </Modal>
  )
}
