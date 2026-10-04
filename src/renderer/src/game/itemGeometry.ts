import type { Rect } from '@shared/layout'
import { MIN_ITEM_SIZE } from '@shared/types'
import type { LibraryImage, StageItem } from '@shared/types'

/** Bir sahne öğesinin konumu ve boyutu (sanal koordinat). `StageItem` de bu biçime uyar. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

/** Bundan küçük fark kayan nokta gürültüsüdür. */
const EPSILON = 0.01

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isValidSize(size: Size | undefined): size is Size {
  return size !== undefined && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
}

/** Oranın kaynağı kütüphanedeki görseldir; görsel yoksa öğenin o anki oranı (reducer ile aynı kural). */
export function referenceSize(item: StageItem, image: LibraryImage | undefined): Size {
  if (isValidSize(image)) return image
  return isValidSize(item) ? item : { width: 1, height: 1 }
}

/** Merkezi oyun alanının içinde tutar; görsel portre sütununun altına ya da ekran dışına kaybolmasın. */
export function clampPosition(x: number, y: number, width: number, height: number, area: Rect): { x: number; y: number } {
  return {
    x: clamp(x, area.x - width / 2, area.x + area.width - width / 2),
    y: clamp(y, area.y - height / 2, area.y + area.height - height / 2)
  }
}

/**
 * Sürükleme ya da boyutlandırma sonucunu durumun kabul edeceği hale getirir: yükseklik genişlikten
 * türetilir, kısa kenar alt sınıra çekilir, merkez oyun alanında kalır. Reducer aynı kuralları
 * uygular; burada önceden hesaplanır ki durum geri geldiğinde görsel yerinden oynamasın.
 */
export function settleBox(x: number, y: number, width: number, reference: Size, area: Rect): Box {
  let nextWidth = Math.abs(width)
  let nextHeight = (nextWidth * reference.height) / reference.width
  if (Math.min(nextWidth, nextHeight) < MIN_ITEM_SIZE) {
    if (reference.width >= reference.height) {
      nextHeight = MIN_ITEM_SIZE
      nextWidth = (MIN_ITEM_SIZE * reference.width) / reference.height
    } else {
      nextWidth = MIN_ITEM_SIZE
      nextHeight = (MIN_ITEM_SIZE * reference.height) / reference.width
    }
  }
  return { ...clampPosition(x, y, nextWidth, nextHeight, area), width: nextWidth, height: nextHeight }
}

export function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < EPSILON &&
    Math.abs(a.y - b.y) < EPSILON &&
    Math.abs(a.width - b.width) < EPSILON &&
    Math.abs(a.height - b.height) < EPSILON
  )
}

export function isInside(point: { x: number; y: number }, area: Rect): boolean {
  return point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height
}
