import { useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import type { LibraryImage } from '@shared/types'
import { imageUrl } from '../lib/media'
import { cx } from './cx'
import { ImageIcon, ImageOffIcon } from './icons'

export interface ImageThumbProps {
  /** `findImage(app, id)` sonucu doğrudan verilebilir; `undefined` ise yer tutucu çizilir. */
  image: LibraryImage | undefined
  /** `contain` (varsayılan) görselin tamamını gösterir; `cover` kutuyu doldurup taşanı kırpar. */
  fit?: 'contain' | 'cover'
  /** Varsayılan: görselin özgün dosya adı. */
  alt?: string
  /** Görsel yokken yer tutucuda yazan metin. Varsayılan "Görsel yok". */
  emptyLabel?: string
  className?: string
  style?: CSSProperties
}

/**
 * Kütüphane görselinin küçük resmi. Varsayılan olarak kabının genişliğini kaplayan bir karedir;
 * boyut ve oran `className`/`style` ile değiştirilir (`aspect-ratio`, `width`).
 */
export function ImageThumb({ image, fit = 'contain', alt, emptyLabel = 'Görsel yok', className, style }: ImageThumbProps): JSX.Element {
  const src = imageUrl(image)
  // Hangi adresin açılamadığı tutulur; görsel değişince hata durumu kendiliğinden düşer.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = src !== null && failedSrc === src

  return (
    <span className={cx('ui-thumb', fit === 'cover' && 'ui-thumb--cover', broken && 'ui-thumb--broken', className)} style={style}>
      {src !== null && !broken ? (
        <img
          className="ui-thumb__img"
          src={src}
          alt={alt ?? image?.originalName ?? ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="ui-thumb__placeholder">
          {broken ? <ImageOffIcon /> : <ImageIcon />}
          <span>{broken ? 'Görsel bulunamadı' : emptyLabel}</span>
          {broken && <span className="ui-code">DND-203</span>}
        </span>
      )}
    </span>
  )
}
