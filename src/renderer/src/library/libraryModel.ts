/**
 * Kütüphane panelinin durumdan türettiği bilgiler. Saf fonksiyonlar; yan etki yok.
 */
import { CATEGORIES } from '@shared/layout'
import type { ID, ImageKind, LibraryImage, SceneWindow } from '@shared/types'

export type ImageGroups = ReadonlyMap<ImageKind, readonly LibraryImage[]>

function byNewest(a: LibraryImage, b: LibraryImage): number {
  // ISO tarihler metin olarak da doğru sıralanır.
  if (a.addedAt === b.addedAt) return 0
  return a.addedAt < b.addedAt ? 1 : -1
}

/** Görselleri bölmelere ayırır; her bölmede en yeni başta. Portreler hiçbir bölmeye girmez. */
export function groupByCategory(library: readonly LibraryImage[]): ImageGroups {
  const groups = new Map<ImageKind, LibraryImage[]>()
  for (const category of CATEGORIES) groups.set(category.id, [])
  // Sondan başa: aynı anda yüklenenlerin tarihi eşit olabilir; o zaman kütüphanedeki sıra belirler.
  for (let index = library.length - 1; index >= 0; index--) {
    const image = library[index]
    groups.get(image.kind)?.push(image)
  }
  for (const images of groups.values()) images.sort(byNewest)
  return groups
}

/**
 * Aramada karşılaştırılan sade metin. Önce Türkçe kurallarıyla küçültülür (I→ı, İ→i), sonra
 * işaretli harfler yalın haline iner. Böylece "kilic" yazan "Kılıç"ı, "item" yazan "ITEM"i de bulur;
 * yalnızca Türkçe küçültme yapılsaydı İngilizce adlı dosyalardaki büyük I hiç eşleşmezdi.
 */
export function searchKey(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replaceAll('ı', 'i')
    .trim()
}

/** Arama boşsa gelen dizinin aynısını döndürür. */
export function filterByName(images: readonly LibraryImage[], query: string): readonly LibraryImage[] {
  const needle = searchKey(query)
  if (needle === '') return images
  return images.filter((image) => searchKey(image.originalName).includes(needle))
}

/** Etkin pencerede hangi görsellerin durduğu ("ekranda" / "arka plan" rozetleri için). */
export interface StageUsage {
  /** Görsel kimliği → pencerenin üstünde duran kopya sayısı. */
  counts: ReadonlyMap<ID, number>
  backgroundImageId: ID | null
}

const SEPARATOR = '|'

/**
 * Pencerenin görsel kullanımının metin özeti. Oyun ekranında bir görsel taşınırken pencere nesnesi
 * sürekli yenilenir ama bu özet aynı kalır; kartlar da boşuna yeniden çizilmez.
 */
export function stageSignature(scene: SceneWindow | undefined): string {
  if (scene === undefined) return ''
  return [scene.background?.imageId ?? '', ...scene.items.map((item) => item.imageId)].join(SEPARATOR)
}

export function parseStageSignature(signature: string): StageUsage {
  const [background = '', ...placed] = signature.split(SEPARATOR)
  const counts = new Map<ID, number>()
  for (const imageId of placed) counts.set(imageId, (counts.get(imageId) ?? 0) + 1)
  return { counts, backgroundImageId: background === '' ? null : background }
}
