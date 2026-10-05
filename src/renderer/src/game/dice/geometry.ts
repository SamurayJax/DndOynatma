/**
 * Zar biçimleri: d20 (düzgün yirmi yüzlü), d10 (on uçurtma yüzlü beşgen trapezohedron) ve
 * d4 (düzgün dört yüzlü, piramit). Fizik, atış planı ve çizim bir `DieModel` alır; hiçbiri
 * belirli bir zara göre yazılmamıştır.
 *
 * d20 ve d10 bir yüzü üstte durur, sonuç o yüzden okunur. d4 bir köşesi üstte durur; sonuç o
 * köşeden okunur ve her yüzde, köşelerin yanında üç rakam yazar. İkisi de aynı iki kavramla
 * anlatılır: `outcomes` (zar durduğunda yukarı bakan yön ve değeri) ve `faceLabels` (yüzlerin
 * üzerindeki rakamlar).
 *
 * Uzunluk birimi d20'nin kenarıdır; öbür zarlar ekranda ona yakın büyüklükte görünecek ölçüdedir.
 */
import type { DiceSides } from '@shared/types'
import { type Quat, type Vec3, add, cross, dot, length, normalize, quatFromFrames, scale, sub } from './math'

/** Yüzün üzerine yazılı bir rakam. */
export interface DieLabel {
  value: number
  /** Rakamın yazıldığı nokta (yüz düzleminde). */
  center: Vec3
  /** Rakamın "yukarı" ve "sağ" yönleri (yüz düzleminde, dışarıdan bakınca). */
  up: Vec3
  right: Vec3
}

/** Zarın durabileceği duruşlardan biri ve o duruşta okunan değer. */
export interface DieOutcome {
  value: number
  /** Bu değer geldiğinde yukarı (izleyiciye) bakan yön: d20 ve d10'da üstteki yüzün normali, d4'te üstteki köşe. */
  normal: Vec3
  /** Okunan rakamın tepesinin baktığı yön, yukarıdan bakınca (`normal`e dik). Ekranda yukarı getirilir. */
  up: Vec3
}

export interface DieModel {
  sides: DiceSides
  vertices: readonly Vec3[]
  /** Çokgen yüzler, köşe sıra numaralarıyla; dışarıdan bakınca saat yönünün tersine dizili. */
  faces: readonly (readonly number[])[]
  /** Yüzün orta noktası (yüz düzleminde); d10'da rakamın durduğu iç teğet çember merkezi. */
  faceCenters: readonly Vec3[]
  faceNormals: readonly Vec3[]
  /** Her yüzün rakamları, `faces` sırasıyla: d20 ve d10'da bir tane, d4'te her köşenin yanında bir tane. */
  faceLabels: readonly (readonly DieLabel[])[]
  /** Zarın durabileceği duruşlar: d20 ve d10'da yüz başına, d4'te köşe başına bir tane. */
  outcomes: readonly DieOutcome[]
  /**
   * Zarı kendi üstüne getiren dönüşlerden kaçı bir duruşun eksenini yerinde bırakır: üçgen yüzde ve
   * d4'ün köşesinde 3, uçurtmada 1. Okunan rakam bu kadar farklı yönde "dik" durabilir (bkz. `outcomeUpAt`).
   */
  turns: number
  /** Merkezden en uzak köşeye uzaklık. */
  circumradius: number
  /** Merkezden yüz düzlemine uzaklık; duran zarın merkezinin masadan yüksekliğidir. */
  inradius: number
  /** Duran zara tam tepeden bakınca merkezden en uzak köşenin uzaklığı. */
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
  /**
   * Sonucun okunduğu yer. `face`: üstte kalan yüz; `values` yüz sırasıyladır, her yüzde bir rakam
   * yazar. `vertex`: üstte kalan köşe; `values` köşe sırasıyladır, her yüzde köşelerinin rakamları yazar.
   */
  reading: 'face' | 'vertex'
  values: readonly number[]
  /** Yüzün orta noktası; verilmezse köşelerin ortalaması. */
  centerOf?: (corners: readonly Vec3[]) => Vec3
  /** `vertex` okumada rakamın, yüzün ortasından köşesine giden yolun ne kadarında durduğu (0..1). */
  labelReach?: number
  turns: number
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

  /** `face` yüzünde, tepesi `toward` noktasına bakan, `reach` kadar o noktaya yaklaşmış rakam. */
  const labelOn = (face: number, value: number, toward: Vec3, reach: number): DieLabel => {
    const offset = sub(toward, faceCenters[face])
    const up = normalize(offset)
    return { value, center: add(faceCenters[face], scale(offset, reach)), up, right: cross(up, faceNormals[face]) }
  }

  let faceLabels: DieLabel[][]
  let outcomes: DieOutcome[]
  if (shape.reading === 'face') {
    // Tek rakam, yüzün ortasında; tepesi yüzün ilk köşesine bakar.
    faceLabels = faces.map((_, face) => [labelOn(face, shape.values[face], corners[face][0], 0)])
    outcomes = faceLabels.map(([label], face) => ({ value: label.value, normal: faceNormals[face], up: label.up }))
  } else {
    const reach = shape.labelReach ?? 0.4
    faceLabels = faces.map((face, index) => face.map((vertex) => labelOn(index, shape.values[vertex], vertices[vertex], reach)))
    outcomes = vertices.map((vertex, index) => {
      const normal = normalize(vertex)
      // Köşeye değen ilk yüzdeki rakamın tepesi köşeye bakar; yukarıdan bakınca bu yön okunur.
      const face = faces.findIndex((candidate) => candidate.includes(index))
      const toVertex = sub(vertex, faceCenters[face])
      return { value: shape.values[index], normal, up: normalize(sub(toVertex, scale(normal, dot(toVertex, normal)))) }
    })
  }

  // Duran zarın ekseni: bir yüz masadadır, tam karşısındaki yüz ya da köşe yukarı bakar.
  const axis = faceNormals[0]
  return {
    sides: shape.sides,
    vertices,
    faces,
    faceCenters,
    faceNormals,
    faceLabels,
    outcomes,
    turns: shape.turns,
    circumradius: Math.max(...vertices.map(length)),
    inradius: dot(faceCenters[0], axis),
    silhouetteRadius: Math.max(...vertices.map((vertex) => length(sub(vertex, scale(axis, dot(vertex, axis)))))),
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
  reading: 'face',
  values: D20_VALUES,
  turns: 3,
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
  // Her yüzün ilk köşesi kutuptur; rakamın tepesi kutba bakar.
  reading: 'face',
  values: D10_VALUES,
  centerOf: kiteCenter,
  turns: 1,
  numeralSizes: [54, 44]
})

// --- d4: düzgün dört yüzlü ---

/** Kenar uzunluğu; duran zar ekranda d20 ile yaklaşık aynı yeri kaplar. */
export const D4_EDGE = 1.8

/** Bir küpün birbirine komşu olmayan dört köşesi düzgün dört yüzlü verir. */
const D4_VERTICES: readonly Vec3[] = (
  [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1]
  ] as const
).map((v) => scale(v, D4_EDGE / (2 * Math.SQRT2)))

/** Her yüz bir köşenin karşısındadır: o köşe dışındaki üç köşe. */
const D4_FACES: readonly (readonly number[])[] = [
  [1, 2, 3],
  [0, 2, 3],
  [0, 1, 3],
  [0, 1, 2]
]

/** Köşelerin sayıları. Zar durunca üstte kalan köşenin sayısı okunur; o sayı görünen üç yüzde de yazar. */
const D4_VALUES: readonly number[] = [1, 2, 3, 4]

export const D4: DieModel = buildModel({
  sides: 4,
  vertices: D4_VERTICES,
  faces: D4_FACES,
  reading: 'vertex',
  values: D4_VALUES,
  labelReach: 0.42,
  turns: 3,
  numeralSizes: [58, 48]
})

const MODELS: Record<DiceSides, DieModel> = { 4: D4, 10: D10, 20: D20 }

export function modelFor(sides: DiceSides): DieModel {
  return MODELS[sides]
}

/**
 * Bir duruşta okunan rakam için geçerli "yukarı" yönlerinden biri: `turn` = 0 duruşun kendi yönüdür,
 * sonrakiler duruş ekseni etrafında eşit adımlarla dönmüş halleri (yukarıdan bakınca saat yönünün
 * tersine). Zar bu yönlerin hepsinde aynı göründüğü için sayılar herhangi birine göre yerleştirilebilir.
 */
export function outcomeUpAt(model: DieModel, outcome: number, turn: number): Vec3 {
  const { normal, up } = model.outcomes[outcome]
  if (turn % model.turns === 0) return up
  const angle = (2 * Math.PI * turn) / model.turns
  const left = cross(normal, up)
  return add(scale(up, Math.cos(angle)), scale(left, Math.sin(angle)))
}

export function outcomeOfValue(model: DieModel, value: number): number {
  const outcome = model.outcomes.findIndex((entry) => entry.value === value)
  // Geçersiz değer gelirse animasyon yine de oynasın diye en büyük sayının duruşu kullanılır.
  return outcome === -1 ? model.outcomes.findIndex((entry) => entry.value === model.sides) : outcome
}

/**
 * Zarın durduğu andaki yönelimi: `value` izleyiciye (+z) bakar, okunan rakam ekranda dik durur.
 * `tilt` (radyan) rakamı hafifçe yana yatırır; gerçek zar hiçbir zaman cetvelle hizalı durmaz.
 */
export function restOrientation(model: DieModel, value: number, tilt = 0): Quat {
  const { normal, up } = model.outcomes[outcomeOfValue(model, value)]
  const screenUp: Vec3 = [-Math.sin(tilt), Math.cos(tilt), 0]
  return quatFromFrames(normal, up, [0, 0, 1], screenUp)
}
