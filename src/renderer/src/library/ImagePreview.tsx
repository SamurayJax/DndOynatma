import type { JSX } from 'react'
import { categoryInfo } from '@shared/layout'
import type { LibraryImage, SceneWindow } from '@shared/types'
import { Button, ImageThumb, Modal, TrashIcon } from '@renderer/ui'

export interface ImagePreviewProps {
  /** `undefined` ise kutu kapalıdır (görsel bu sırada silinmiş de olabilir). */
  image: LibraryImage | undefined
  /** Görseli kullanan pencereler. */
  scenes: readonly SceneWindow[]
  onClose: () => void
  onDelete: () => void
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })
}

/** Ayarlar'da karta tıklanınca açılan büyük önizleme: ad, boyut ve kullanıldığı pencereler. */
export function ImagePreview({ image, scenes, onClose, onDelete }: ImagePreviewProps): JSX.Element | null {
  if (image === undefined) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={image.originalName}
      size="lg"
      footer={
        <>
          <Button variant="danger" icon={<TrashIcon size={18} />} onClick={onDelete}>
            Sil
          </Button>
          <Button onClick={onClose} data-autofocus="">
            Kapat
          </Button>
        </>
      }
    >
      <div className="lib-preview">
        <ImageThumb image={image} className="lib-preview__image" />
        <dl className="lib-preview__facts">
          <dt>Boyut</dt>
          <dd>
            {image.width} × {image.height} piksel
          </dd>
          <dt>Bölme</dt>
          <dd>{categoryInfo(image.kind)?.label ?? '—'}</dd>
          <dt>Eklendi</dt>
          <dd>{formatDate(image.addedAt)}</dd>
          <dt>Pencereler</dt>
          <dd>
            {scenes.length === 0 ? (
              <span className="lib-preview__none">Hiçbir pencerede kullanılmıyor</span>
            ) : (
              <ul className="lib-preview__scenes">
                {scenes.map((scene) => (
                  <li key={scene.id}>{scene.name}</li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </div>
    </Modal>
  )
}
