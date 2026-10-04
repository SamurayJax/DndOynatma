import useImage from 'use-image'

export type StageImageStatus = 'loaded' | 'loading' | 'failed'

/** Daha önce çözülmüş görseller. Pencereler arasında gidip gelirken görseller bir an kaybolmasın diye tutulur. */
const decoded = new Map<string, HTMLImageElement>()
const MAX_DECODED = 96

function remember(url: string, image: HTMLImageElement): void {
  if (decoded.get(url) === image) return
  decoded.delete(url)
  decoded.set(url, image)
  // Map ekleme sırasını korur: ilk anahtar en eski kayıttır.
  while (decoded.size > MAX_DECODED) {
    const oldest = decoded.keys().next()
    if (oldest.done) break
    decoded.delete(oldest.value)
  }
}

/**
 * Konva için görsel yükler (`use-image`, tuval kirlenmesin diye `crossOrigin: 'anonymous'`).
 * `url` yoksa (kütüphane kaydı silinmiş) doğrudan `failed` döner.
 */
export function useStageImage(url: string | null): [HTMLImageElement | undefined, StageImageStatus] {
  const [image, status] = useImage(url ?? '', 'anonymous')
  if (url === null) return [undefined, 'failed']
  if (image !== undefined) {
    remember(url, image)
    return [image, 'loaded']
  }
  if (status === 'failed') {
    decoded.delete(url)
    return [undefined, 'failed']
  }
  const known = decoded.get(url)
  return known !== undefined ? [known, 'loaded'] : [undefined, 'loading']
}
