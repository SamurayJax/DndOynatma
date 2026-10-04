import type { LibraryImage } from '@shared/types'

/** Kütüphane görselinin `<img>` ve Konva'da kullanılabilecek adresi; görsel yoksa `null`. */
export function imageUrl(image: LibraryImage | undefined): string | null {
  return image ? window.dnd.mediaUrl(image.fileName) : null
}
