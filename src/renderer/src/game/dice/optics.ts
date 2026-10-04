/**
 * Kamera ve ışık. Kamera masaya tam tepeden bakar (oyun ekranı = masa); zarın yüksekliği
 * ekranda büyüme ve gölgenin uzaklaşması olarak görünür. Uzunluk birimi zarın kenarıdır.
 */
import { CIRCUMRADIUS, INRADIUS } from './geometry'
import type { Vec3 } from './math'

/** Kameranın masadan yüksekliği. Küçüldükçe perspektif sertleşir. */
export const CAMERA_HEIGHT = 8

/** Masadan `height` yukarıdaki bir noktanın ekrandaki ölçeği; yerde duran zarın merkezinde 1'dir. */
export function perspective(height: number): number {
  return (CAMERA_HEIGHT - INRADIUS) / (CAMERA_HEIGHT - height)
}

/** Yüzleri aydınlatan ışığın yönü (zardan ışığa doğru): sol üstten, izleyici tarafından. */
export const LIGHT: Vec3 = [-0.42, 0.58, 0.697]

/** Birim yükseklik başına gölgenin ekranda kayması (sağa, aşağı). */
const SHADOW_SHIFT_X = 0.34
const SHADOW_SHIFT_Y = 0.46

export interface ShadowShape {
  /** Ekran koordinatı (zar birimi, y aşağı). */
  x: number
  y: number
  /** Tam koyu çekirdeğin ve tamamen kaybolduğu dış sınırın yarıçapı. */
  inner: number
  outer: number
  alpha: number
}

/**
 * Zarın masadaki gölgesi. Zar yükseldikçe gölge ışığın tersine kayar, genişler ve solar;
 * yere indikçe zarın altında toplanıp koyulaşır.
 */
export function shadowOf(x: number, y: number, z: number): ShadowShape {
  const lift = Math.max(0, z - INRADIUS)
  const ground = perspective(0)
  const radius = CIRCUMRADIUS * ground
  return {
    x: x + SHADOW_SHIFT_X * z * ground,
    y: y + SHADOW_SHIFT_Y * z * ground,
    inner: radius * Math.max(0.2, 0.78 - 0.22 * lift),
    outer: radius * (1.16 + 0.3 * lift),
    alpha: 0.2 + 0.36 / (1 + 1.1 * lift)
  }
}

/** Zarın ekranda kaplayabileceği en büyük dairenin yarıçapı (kameraya en yakın köşe için). */
export function screenRadius(z: number): number {
  return CIRCUMRADIUS * perspective(Math.min(z + CIRCUMRADIUS, CAMERA_HEIGHT - 0.5))
}
