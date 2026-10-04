/**
 * d20 geometrisi: kenar uzunluğu 1 olan düzgün yirmi yüzlü (ikosahedron) ve yüzlerin sayıları.
 */
import { type Quat, type Vec3, cross, dot, normalize, quatFromFrames, scale, sub } from './math'

const PHI = (1 + Math.sqrt(5)) / 2

/** Merkezden köşeye, yüz ortasına uzaklıklar (kenar = 1). */
export const CIRCUMRADIUS = Math.sqrt(PHI * PHI + 1) / 2
export const INRADIUS = (PHI * PHI) / (2 * Math.sqrt(3))
/** Tam üstten (bir yüzün karşısından) bakınca görünen altıgenin köşe uzaklığı. */
export const SILHOUETTE_RADIUS = PHI / Math.sqrt(3)
/** Dolu yirmi yüzlünün eylemsizlik momenti (kütle = 1, kenar = 1); her eksende aynıdır. */
export const INERTIA = (PHI * PHI) / 10

/** Altın orandan gelen 12 köşe: (0, ±1, ±φ) ve dönüşümlü permütasyonları, kenar 1 olacak şekilde yarıya ölçekli. */
export const VERTICES: readonly Vec3[] = (
  [
    [0, 1, PHI],
    [0, -1, PHI],
    [0, 1, -PHI],
    [0, -1, -PHI],
    [1, PHI, 0],
    [-1, PHI, 0],
    [1, -PHI, 0],
    [-1, -PHI, 0],
    [PHI, 0, 1],
    [-PHI, 0, 1],
    [PHI, 0, -1],
    [-PHI, 0, -1]
  ] as const
).map((v) => scale(v, 0.5))

function isEdge(a: number, b: number): boolean {
  const d = sub(VERTICES[a], VERTICES[b])
  return Math.abs(dot(d, d) - 1) < 1e-9
}

function buildFaces(): (readonly [number, number, number])[] {
  const faces: (readonly [number, number, number])[] = []
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      if (!isEdge(a, b)) continue
      for (let c = b + 1; c < 12; c++) {
        if (!isEdge(a, c) || !isEdge(b, c)) continue
        // Dışarıdan bakınca saat yönünün tersine dizilsin; görünürlük sınaması buna dayanır.
        const outward = dot(cross(sub(VERTICES[b], VERTICES[a]), sub(VERTICES[c], VERTICES[a])), VERTICES[a]) > 0
        faces.push(outward ? [a, b, c] : [a, c, b])
      }
    }
  }
  return faces
}

/** 20 üçgen yüz; köşe sıra numaralarıyla. Sıra sabittir (FACE_VALUES buna göre yazıldı). */
export const FACES: readonly (readonly [number, number, number])[] = buildFaces()

/**
 * Yüzlerin üzerindeki sayılar, FACES sırasıyla. Gerçek d20 dizilimi: karşılıklı yüzlerin toplamı 21,
 * 20'nin çevresinde 2-8-14, 1'in çevresinde 7-13-19.
 */
export const FACE_VALUES: readonly number[] = [1, 7, 5, 13, 15, 3, 19, 17, 14, 20, 18, 4, 2, 16, 6, 8, 11, 12, 9, 10]

export const FACE_CENTERS: readonly Vec3[] = FACES.map(([a, b, c]) => {
  const va = VERTICES[a]
  const vb = VERTICES[b]
  const vc = VERTICES[c]
  return [(va[0] + vb[0] + vc[0]) / 3, (va[1] + vb[1] + vc[1]) / 3, (va[2] + vb[2] + vc[2]) / 3]
})

export const FACE_NORMALS: readonly Vec3[] = FACE_CENTERS.map(normalize)

/** Yüz merkezinden k. köşesine giden birim vektör (yüz düzleminde). */
export function faceCorner(face: number, corner: number): Vec3 {
  return normalize(sub(VERTICES[FACES[face][corner]], FACE_CENTERS[face]))
}

/** Rakamın "yukarı" yönü: yüzün ilk köşesine doğru. */
export const FACE_UPS: readonly Vec3[] = FACES.map((_, face) => faceCorner(face, 0))

/** Rakamın "sağ" yönü (dışarıdan bakınca). */
export const FACE_RIGHTS: readonly Vec3[] = FACES.map((_, face) => cross(FACE_UPS[face], FACE_NORMALS[face]))

export function faceOfValue(value: number): number {
  const face = FACE_VALUES.indexOf(value)
  // Geçersiz değer gelirse animasyon yine de oynasın diye 20'nin yüzü kullanılır.
  return face === -1 ? FACE_VALUES.indexOf(20) : face
}

/**
 * Zarın durduğu andaki yönelimi: `value` yüzü izleyiciye (+z) bakar, rakam ekranda dik durur.
 * `tilt` (radyan) rakamı hafifçe yana yatırır; gerçek zar hiçbir zaman cetvelle hizalı durmaz.
 */
export function restOrientation(value: number, tilt = 0): Quat {
  const face = faceOfValue(value)
  const screenUp: Vec3 = [-Math.sin(tilt), Math.cos(tilt), 0]
  return quatFromFrames(FACE_NORMALS[face], FACE_UPS[face], [0, 0, 1], screenUp)
}
