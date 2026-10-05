/**
 * Zar biçimleri: d20 (düzgün yirmi yüzlü), d10 (on uçurtma yüzlü beşgen trapezohedron) ve
 * d3 (yüzlerinde 1-2-3 ikişer kez yazan küp). Fizik, atış planı ve çizim bir `DieModel` alır;
 * hiçbiri belirli bir zara göre yazılmamıştır.
 *
 * Uzunluk birimi d20'nin kenarıdır; öbür zarlar ekranda ona yakın büyüklükte görünecek ölçüdedir.
 */
import type { DiceSides } from '@shared/types'
import { type Quat, type Vec3, add, cross, dot, length, normalize, quatFromFrames, scale, sub } from './math'

export interface DieModel {
  sides: DiceSides
  vertices: readonly Vec3[]
  /** Çokgen yüzler, köşe sıra numaralarıyla; dışarıdan bakınca saat yönünün tersine dizili. */
  faces: readonly (readonly number[])[]
  /** Yüzlerin üzerindeki sayılar, `faces` sırasıyla. */
  faceValues: readonly number[]
  /** Rakamın yazıldığı nokta (yüz düzleminde). */
  faceCenters: readonly Vec3[]
  faceNormals: readonly Vec3[]
  /** Rakamın "yukarı" ve "sağ" yönleri (yüz düzleminde, dışarıdan bakınca). */
  faceUps: readonly Vec3[]
  faceRights: readonly Vec3[]
  /**
   * Zarı kendi üstüne getiren dönüşlerden kaçı bir yüzü yerinde bırakır: üçgen yüzde 3, karede 4,
   * uçurtmada 1. Üstte kalan yüze rakam bu kadar farklı yönde "dik" yazılabilir (bkz. `faceUpAt`).
   */
  faceTurns: number
  /** Merkezden en uzak köşeye uzaklık. */
  circumradius: number
  /** Merkezden yüz düzlemine uzaklık; duran zarın merkezinin masadan yüksekliğidir. */
  inradius: number
  /** Bir yüzü üstte duran zara tam tepeden bakınca merkezden en uzak köşenin uzaklığı. */
  silhouetteRadius: number
  /** Dolu cismin eylemsizlik momenti (kütle = 1); eksenlerin ortalaması. */
  inertia: number
  /** Rakam boyu, tek ve çift haneli sayılar için (1 birim = 100). */
  numeralSizes: readonly [number, number]
}

interface Shape {
  sides: DiceSides
  vertices: readonly Vec3[]
  /** Köşeler çevre sırasıyla; yönü (saat yönü / tersi) burada önemli değildir. */
  faces: readonly (readonly number[])[]
  faceValues: readonly number[]
  /** Rakamın yazıldığı nokta; verilmezse köşelerin ortalaması. */
  centerOf?: (corners: readonly Vec3[]) => Vec3
  /** Rakamın tepesi yüzün ilk köşesine mi, ilk kenarının ortasına mı bakar. */
  upToward: 'corner' | 'edge'
  faceTurns: number
  numeralSizes: readonly [number, number]
}

function centroid(points: readonly Vec3[]): Vec3 {
  return scale(points.reduce(add), 1 / points.length)
}

/** Düzlemsel çokgenin birim normali; köşeler normalin ucundan bakınca saat yönünün tersine dizilidir. */
function polygonNormal(points: readonly Vec3[]): Vec3 {
  let sum: Vec3 = [0, 0, 0]
  for (let i = 0; i < points.length; i++) sum = add(sum, cross(points[i], points[(i + 1) % points.length]))
  return normalize(sum)
}

/** Merkezi başlangıç noktasında olan dolu çokyüzlünün ortalama eylemsizlik momenti (kütle = 1). */
function meanInertia(vertices: readonly Vec3[], faces: readonly (readonly number[])[]): number {
  let volume = 0
  let second = 0
  // Her yüz üçgenlere, her üçgen merkezle birlikte bir dörtyüzlüye bölünür.
  for (const face of faces) {
    const a = vertices[face[0]]
    for (let i = 1; i + 1 < face.length; i++) {
      const b = vertices[face[i]]
      const c = vertices[face[i + 1]]
      const part = dot(a, cross(b, c)) / 6
      volume += part
      // Dörtyüzlü üzerinde ∫|x|² dV
      second += (part / 10) * (dot(a, a) + dot(b, b) + dot(c, c) + dot(a, b) + dot(a, c) + dot(b, c))
    }
  }
  // Eylemsizlik tensörünün izi 2·∫|x|² dm; üç eksenin ortalaması bunun üçte biridir.
  return ((2 / 3) * second) / volume
}

function buildModel(shape: Shape): DieModel {
  const { vertices } = shape
  // Dışarıdan bakınca saat yönünün tersine dizilsin; görünürlük sınaması buna dayanır. İlk köşe yerinde kalır.
  const faces = shape.faces.map((face) => {
    const corners = face.map((index) => vertices[index])
    return dot(polygonNormal(corners), corners[0]) > 0 ? face : [face[0], ...face.slice(1).reverse()]
  })
  const corners = faces.map((face) => face.map((index) => vertices[index]))
  const faceNormals = corners.map(polygonNormal)
  const faceCenters = corners.map(shape.centerOf ?? centroid)
  const faceUps = corners.map((points, face) => {
    const target = shape.upToward === 'corner' ? points[0] : scale(add(points[0], points[1]), 0.5)
    return normalize(sub(target, faceCenters[face]))
  })
  const top = faceNormals[0]
  return {
    sides: shape.sides,
    vertices,
    faces,
    faceValues: shape.faceValues,
    faceCenters,
    faceNormals,
    faceUps,
    faceRights: faceUps.map((up, face) => cross(up, faceNormals[face])),
    faceTurns: shape.faceTurns,
    circumradius: Math.max(...vertices.map(length)),
    inradius: dot(faceCenters[0], top),
    silhouetteRadius: Math.max(...vertices.map((vertex) => length(sub(vertex, scale(top, dot(vertex, top)))))),
    inertia: meanInertia(vertices, faces),
    numeralSizes: shape.numeralSizes
  }
}

// --- d20: kenarı 1 olan düzgün yirmi yüzlü ---

const PHI = (1 + Math.sqrt(5)) / 2

/** Altın orandan gelen 12 köşe: (0, ±1, ±φ) ve dönüşümlü permütasyonları, kenar 1 olacak şekilde yarıya ölçekli. */
const D20_VERTICES: readonly Vec3[] = (
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

/** Birbirine kenarla bağlı her üç köşe bir yüzdür. Sıra sabittir (`D20_VALUES` buna göre yazıldı). */
function icosahedronFaces(vertices: readonly Vec3[]): number[][] {
  const isEdge = (a: number, b: number): boolean => {
    const d = sub(vertices[a], vertices[b])
    return Math.abs(dot(d, d) - 1) < 1e-9
  }
  const faces: number[][] = []
  for (let a = 0; a < vertices.length; a++) {
    for (let b = a + 1; b < vertices.length; b++) {
      if (!isEdge(a, b)) continue
      for (let c = b + 1; c < vertices.length; c++) {
        if (isEdge(a, c) && isEdge(b, c)) faces.push([a, b, c])
      }
    }
  }
  return faces
}

/**
 * Gerçek d20 dizilimi: karşılıklı yüzlerin toplamı 21, 20'nin çevresinde 2-8-14,
 * 1'in çevresinde 7-13-19.
 */
const D20_VALUES: readonly number[] = [1, 7, 5, 13, 15, 3, 19, 17, 14, 20, 18, 4, 2, 16, 6, 8, 11, 12, 9, 10]

export const D20: DieModel = buildModel({
  sides: 20,
  vertices: D20_VERTICES,
  faces: icosahedronFaces(D20_VERTICES),
  faceValues: D20_VALUES,
  upToward: 'corner',
  faceTurns: 3,
  numeralSizes: [40, 33]
})

// --- d10: beşgen trapezohedron ---

/** Kuşaktaki on köşenin eksene uzaklığı; kutuplar merkezden yaklaşık 1 birim uzakta kalır. */
const D10_RING = 0.9
const TAN_SQUARED = Math.tan(Math.PI / 10) ** 2
/** Kutbun merkeze uzaklığı. Kutuptan inen kenarlar eksenle 45° yapar: bilinen d10 oranı. */
const D10_POLE = D10_RING / (1 - TAN_SQUARED)
/** Kuşak köşeleri sırayla ekvatorun bu kadar üstünde ve altındadır; uçurtma yüzler ancak bu oranda düz olur. */
const D10_ZIGZAG = D10_POLE * TAN_SQUARED

/** 0: üst kutup, 1: alt kutup, 2..11: kuşak (36° arayla; çift sıradakiler üstte). */
const D10_VERTICES: readonly Vec3[] = [
  [0, 0, D10_POLE],
  [0, 0, -D10_POLE],
  ...Array.from({ length: 10 }, (_, k): Vec3 => {
    const angle = (k * Math.PI) / 5
    return [D10_RING * Math.cos(angle), D10_RING * Math.sin(angle), k % 2 === 0 ? D10_ZIGZAG : -D10_ZIGZAG]
  })
]

const ring = (k: number): number => 2 + (k % 10)

/** Her yüz: kutup, kuşaktan ardışık üç köşe. Önce üst kutbun beş yüzü, sonra alt kutbunkiler. */
const D10_FACES: readonly (readonly number[])[] = [
  ...Array.from({ length: 5 }, (_, i) => [0, ring(2 * i), ring(2 * i + 1), ring(2 * i + 2)]),
  ...Array.from({ length: 5 }, (_, i) => [1, ring(2 * i + 1), ring(2 * i + 2), ring(2 * i + 3)])
]

/**
 * Gerçek d10 dizilimi: bir kutbun çevresinde tekler, öbüründe çiftler; karşılıklı yüzlerin toplamı
 * 0-9 sayımıyla 9. Zarın üzerinde 0 yerine 10 yazar; sonuç da 1-10 arasındadır.
 */
const D10_UPPER_VALUES: readonly number[] = [1, 7, 5, 3, 9]
const D10_VALUES: readonly number[] = [
  ...D10_UPPER_VALUES,
  // Alt kutbun j. yüzü, üst kutbun (j + 3). yüzünün tam karşısındadır.
  ...Array.from({ length: 5 }, (_, j) => 9 - D10_UPPER_VALUES[(j + 3) % 5] || 10)
]

/**
 * Uçurtmanın iç teğet çemberinin merkezi: rakam için en geniş yer. Köşe sırası kutup, yan köşe,
 * kuyruk (kutbun karşısı), öbür yan köşe. Yan köşenin açıortayı ekseni kenarları oranında böler.
 */
function kiteCenter(corners: readonly Vec3[]): Vec3 {
  const [apex, side, tail] = corners
  const long = length(sub(side, apex))
  const short = length(sub(side, tail))
  return add(apex, scale(sub(tail, apex), long / (long + short)))
}

export const D10: DieModel = buildModel({
  sides: 10,
  vertices: D10_VERTICES,
  faces: D10_FACES,
  faceValues: D10_VALUES,
  centerOf: kiteCenter,
  // Rakamın tepesi kutba bakar.
  upToward: 'corner',
  faceTurns: 1,
  numeralSizes: [54, 44]
})

// --- d3: küp ---

const D3_HALF_EDGE = 0.6

/** Sekiz köşe; sıra numarasının bitleri x, y, z'nin işaretini verir. */
const D3_VERTICES: readonly Vec3[] = Array.from({ length: 8 }, (_, i): Vec3 => [
  i & 1 ? D3_HALF_EDGE : -D3_HALF_EDGE,
  i & 2 ? D3_HALF_EDGE : -D3_HALF_EDGE,
  i & 4 ? D3_HALF_EDGE : -D3_HALF_EDGE
])

/** +x, -x, +y, -y, +z, -z */
const D3_FACES: readonly (readonly number[])[] = [
  [1, 3, 7, 5],
  [0, 4, 6, 2],
  [2, 6, 7, 3],
  [0, 1, 5, 4],
  [4, 5, 7, 6],
  [0, 2, 3, 1]
]

/** Karşılıklı yüzlerde aynı sayı yazar. */
const D3_VALUES: readonly number[] = [1, 1, 2, 2, 3, 3]

export const D3: DieModel = buildModel({
  sides: 3,
  vertices: D3_VERTICES,
  faces: D3_FACES,
  faceValues: D3_VALUES,
  upToward: 'edge',
  faceTurns: 4,
  numeralSizes: [84, 70]
})

const MODELS: Record<DiceSides, DieModel> = { 3: D3, 10: D10, 20: D20 }

export function modelFor(sides: DiceSides): DieModel {
  return MODELS[sides]
}

/**
 * Yüzün rakamı için geçerli "yukarı" yönlerinden biri: `turn` = 0 yüzün kendi yönüdür, sonrakiler
 * yüz ekseni etrafında eşit adımlarla dönmüş halleri (dışarıdan bakınca saat yönünün tersine).
 * Zar bu yönlerin hepsinde aynı göründüğü için sayılar herhangi birine göre yerleştirilebilir.
 */
export function faceUpAt(model: DieModel, face: number, turn: number): Vec3 {
  const up = model.faceUps[face]
  if (turn % model.faceTurns === 0) return up
  const angle = (2 * Math.PI * turn) / model.faceTurns
  const left = cross(model.faceNormals[face], up)
  return add(scale(up, Math.cos(angle)), scale(left, Math.sin(angle)))
}

export function faceOfValue(model: DieModel, value: number): number {
  const face = model.faceValues.indexOf(value)
  // Geçersiz değer gelirse animasyon yine de oynasın diye en büyük sayının yüzü kullanılır.
  return face === -1 ? model.faceValues.indexOf(model.sides) : face
}

/**
 * Zarın durduğu andaki yönelimi: `value` yüzü izleyiciye (+z) bakar, rakam ekranda dik durur.
 * `tilt` (radyan) rakamı hafifçe yana yatırır; gerçek zar hiçbir zaman cetvelle hizalı durmaz.
 */
export function restOrientation(model: DieModel, value: number, tilt = 0): Quat {
  const face = faceOfValue(model, value)
  const screenUp: Vec3 = [-Math.sin(tilt), Math.cos(tilt), 0]
  return quatFromFrames(model.faceNormals[face], model.faceUps[face], [0, 0, 1], screenUp)
}
