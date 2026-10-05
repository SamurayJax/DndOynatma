/**
 * Zar biçimleri, fizik ve atış planı. Bu modüller tuvale ya da pencereye dokunmaz; burada
 * Node ortamında sınanır. Çizim ve gerçek atışlar için: e2e/oyun/05-zar.mjs.
 */
import { describe, expect, it } from 'vitest'
import { DICE_SIDES } from '@shared/types'
import {
  D10,
  D20,
  D4,
  D4_EDGE,
  type DieLabel,
  type DieModel,
  modelFor,
  outcomeOfValue,
  outcomeUpAt,
  restOrientation
} from '../../src/renderer/src/game/dice/geometry'
import {
  type Quat,
  type Vec3,
  add,
  createRng,
  cross,
  dot,
  length,
  normalize,
  quatFromFrames,
  quatRotate,
  scale,
  sub
} from '../../src/renderer/src/game/dice/math'
import { finalPose, randomThrowStart, simulateThrow } from '../../src/renderer/src/game/dice/physics'
import { type DiePose, type StageBounds, pacingFor, planThrow } from '../../src/renderer/src/game/dice/throwPlan'

const MODELS: readonly DieModel[] = DICE_SIDES.map(modelFor)
const PHI = (1 + Math.sqrt(5)) / 2

/** Oyun ekranı (1920x1080, portre sütunu 300) zar birimiyle; player.ts'teki hesapla aynı. */
const EDGE_PX = 146
const STAGE: StageBounds = {
  width: 1920 / EDGE_PX,
  height: 1080 / EDGE_PX,
  landing: {
    x: (300 + 1620 * 0.3) / EDGE_PX,
    y: (1080 * 0.44) / EDGE_PX,
    width: (1620 * 0.4) / EDGE_PX,
    height: (1080 * 0.24) / EDGE_PX
  }
}

const name = (model: DieModel): string => `d${model.sides}`
const cornersOf = (model: DieModel, face: number): Vec3[] => model.faces[face].map((index) => model.vertices[index])
const allLabels = (model: DieModel): DieLabel[] => model.faceLabels.flat()
const valuesOf = (model: DieModel): number[] => model.outcomes.map((outcome) => outcome.value).sort((a, b) => a - b)
/** Yüz başına tek rakam yazan zarlarda (d20, d10) yüzlerin sayıları, yüz sırasıyla. */
const faceValues = (model: DieModel): number[] => model.faceLabels.map((labels) => labels[0].value)
const expectVec = (actual: Vec3, expected: Vec3, digits = 9): void => {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i], digits)
}

/** Verilen yönelimde zarın durduğu duruş: yukarı (izleyiciye) bakan yüz ya da köşe. */
function topOutcome(model: DieModel, q: Quat): number {
  let best = 0
  for (let outcome = 1; outcome < model.outcomes.length; outcome++) {
    if (quatRotate(q, model.outcomes[outcome].normal)[2] > quatRotate(q, model.outcomes[best].normal)[2]) best = outcome
  }
  return best
}

/** Köşelerin masadan yükseklikleri. */
function heights(model: DieModel, pose: { z: number; q: Quat }): number[] {
  return model.vertices.map((vertex) => pose.z + quatRotate(pose.q, vertex)[2])
}

function turnBetween(a: Quat, b: Quat): number {
  return 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])))
}

/** Rakamın ekrandaki eğimi (radyan): tepesi tam yukarı bakıyorsa 0. */
function screenTilt(q: Quat, up: Vec3): number {
  const turned = quatRotate(q, up)
  return Math.atan2(-turned[0], turned[1])
}

describe.each(MODELS)('biçim: d$sides', (model) => {
  it('her yüz düzlemsel, dışa bakan, saat yönünün tersine dizili bir çokgendir', () => {
    for (let face = 0; face < model.faces.length; face++) {
      const corners = cornersOf(model, face)
      const normal = model.faceNormals[face]
      expect(length(normal)).toBeCloseTo(1, 12)
      expect(dot(normal, model.faceCenters[face])).toBeGreaterThan(0)
      for (let i = 0; i < corners.length; i++) {
        const here = corners[i]
        const next = corners[(i + 1) % corners.length]
        const after = corners[(i + 2) % corners.length]
        // Düzlemde: her köşe yüzün orta noktasıyla aynı düzlemdedir.
        expect(dot(sub(here, model.faceCenters[face]), normal)).toBeCloseTo(0, 12)
        // Dışbükey ve saat yönünün tersine: her dönemeç normalle aynı yöne bakar.
        expect(dot(cross(sub(next, here), sub(after, next)), normal)).toBeGreaterThan(1e-6)
      }
    }
  })

  it('kapalı bir cisimdir: her kenar tam iki yüzde, ters yönlerde geçer', () => {
    const edges = new Map<string, number>()
    for (const face of model.faces) {
      for (let i = 0; i < face.length; i++) {
        const key = `${face[i]}>${face[(i + 1) % face.length]}`
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    }
    for (const [key, count] of edges) {
      expect(count).toBe(1)
      expect(edges.get(key.split('>').reverse().join('>'))).toBe(1)
    }
    // Euler: köşe - kenar + yüz = 2
    expect(model.vertices.length - edges.size / 2 + model.faces.length).toBe(2)
  })

  it('ağırlık merkezi ortadadır ve bütün yüzler merkeze aynı uzaklıktadır', () => {
    expectVec(scale(model.vertices.reduce(add), 1 / model.vertices.length), [0, 0, 0], 12)
    for (let face = 0; face < model.faces.length; face++) {
      expect(dot(model.faceCenters[face], model.faceNormals[face])).toBeCloseTo(model.inradius, 12)
    }
    expect(model.inradius).toBeGreaterThan(0)
    expect(model.inradius).toBeLessThan(model.silhouetteRadius)
    expect(model.silhouetteRadius).toBeLessThanOrEqual(model.circumradius + 1e-12)
  })

  it('rakamlar yüzün içinde ve düzlemindedir; sağ, yukarı ve normal sağ el üçlüsüdür', () => {
    expect(model.faceLabels).toHaveLength(model.faces.length)
    for (let face = 0; face < model.faces.length; face++) {
      const corners = cornersOf(model, face)
      const normal = model.faceNormals[face]
      expect(model.faceLabels[face].length).toBeGreaterThan(0)
      for (const label of model.faceLabels[face]) {
        expect(dot(sub(label.center, model.faceCenters[face]), normal)).toBeCloseTo(0, 12)
        expect(length(label.up)).toBeCloseTo(1, 12)
        expect(dot(label.up, normal)).toBeCloseTo(0, 12)
        expectVec(cross(label.right, label.up), normal, 12)
        // Rakamın noktası her kenarın iç tarafındadır, kenardan da uzaktır.
        for (let i = 0; i < corners.length; i++) {
          const edge = normalize(sub(corners[(i + 1) % corners.length], corners[i]))
          expect(dot(cross(edge, sub(label.center, corners[i])), normal)).toBeGreaterThan(0.2)
        }
      }
    }
  })

  it('sayılar 1..N birer duruştur; her duruşta bir yüz masaya tam oturur', () => {
    expect(valuesOf(model)).toEqual(Array.from({ length: model.sides }, (_, i) => i + 1))
    for (let outcome = 0; outcome < model.outcomes.length; outcome++) {
      const { normal, up } = model.outcomes[outcome]
      expect(length(normal)).toBeCloseTo(1, 12)
      expect(length(up)).toBeCloseTo(1, 12)
      expect(dot(up, normal)).toBeCloseTo(0, 12)
      // Yukarı bakan yönün tam tersine bakan bir yüz vardır: zar onun üstünde durur.
      expect(model.faceNormals.findIndex((faceNormal) => dot(faceNormal, normal) < -1 + 1e-12)).not.toBe(-1)
      for (let turn = 0; turn < model.turns; turn++) {
        const turned = outcomeUpAt(model, outcome, turn)
        expect(length(turned)).toBeCloseTo(1, 12)
        expect(dot(turned, normal)).toBeCloseTo(0, 12)
        expect(dot(turned, up)).toBeCloseTo(Math.cos((2 * Math.PI * turn) / model.turns), 12)
      }
    }
  })

  it('sayıları başka bir duruşa taşıyan her dönüş zarı kendi üstüne getirir', () => {
    // Atış planının dayandığı özellik: herhangi bir değerin duruşu, herhangi bir duruşa, rakamın geçerli
    // her yönüyle, zarın biçimi değişmeden taşınabilir.
    for (let from = 0; from < model.outcomes.length; from++) {
      const source = model.outcomes[from]
      const read = allLabels(model).filter((label) => label.value === source.value)
      for (let to = 0; to < model.outcomes.length; to++) {
        const target = model.outcomes[to]
        const wanted = allLabels(model).filter((label) => label.value === target.value)
        for (let turn = 0; turn < model.turns; turn++) {
          const relabel = quatFromFrames(source.normal, source.up, target.normal, outcomeUpAt(model, to, turn))
          const hit = new Set<number>()
          for (const vertex of model.vertices) {
            const moved = quatRotate(relabel, vertex)
            const match = model.vertices.findIndex((other) => length(sub(other, moved)) < 1e-9)
            expect(match, `${name(model)}: ${source.value} → duruş ${to}, yön ${turn}`).not.toBe(-1)
            hit.add(match)
          }
          expect(hit.size).toBe(model.vertices.length)
          // Okunan rakamlar, hedef duruşta okunan rakamların tam yerine gelir.
          expect(read).toHaveLength(wanted.length)
          for (const label of read) {
            const moved = quatRotate(relabel, label.center)
            expect(wanted.some((other) => length(sub(other.center, moved)) < 1e-9)).toBe(true)
          }
        }
      }
    }
  })

  it('duruş yönelimi istenen değeri izleyiciye çevirir, rakamı verilen eğimle dik tutar', () => {
    for (const value of valuesOf(model)) {
      for (const tilt of [0, 0.1, -0.07]) {
        const q = restOrientation(model, value, tilt)
        const outcome = model.outcomes[outcomeOfValue(model, value)]
        expect(model.outcomes[topOutcome(model, q)].value).toBe(value)
        expectVec(quatRotate(q, outcome.normal), [0, 0, 1])
        expectVec(quatRotate(q, outcome.up), [-Math.sin(tilt), Math.cos(tilt), 0])
        // Karşıdaki yüz masada: en alttaki köşeler aynı yükseklikte, merkez yüz uzaklığı kadar yukarıda.
        const low = heights(model, { z: model.inradius, q }).sort((a, b) => a - b)
        expect(low[0]).toBeCloseTo(0, 9)
        expect(low[2]).toBeCloseTo(0, 9)
        // Okunan rakamlardan tam biri ekranda dik durur (verilen eğimle).
        const upright = allLabels(model).filter(
          (label) => label.value === value && Math.abs(screenTilt(q, label.up) - tilt) < 1e-9 && quatRotate(q, label.up)[2] > -1e-9
        )
        expect(upright, `${name(model)} = ${value}`).toHaveLength(1)
      }
    }
  })

  it('geçersiz değer en büyük sayının duruşunu gösterir', () => {
    expect(model.outcomes[outcomeOfValue(model, 0)].value).toBe(model.sides)
    expect(model.outcomes[outcomeOfValue(model, model.sides + 1)].value).toBe(model.sides)
  })
})

describe('d20', () => {
  it('yirmi üçgen yüz, 1-20 birer kez; karşılıklı yüzlerin toplamı 21', () => {
    expect(D20.faces).toHaveLength(20)
    expect(D20.faces.every((face) => face.length === 3)).toBe(true)
    expect(D20.faceLabels.every((labels) => labels.length === 1)).toBe(true)
    const values = faceValues(D20)
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    for (let face = 0; face < 20; face++) {
      const opposite = D20.faceNormals.findIndex((normal) => dot(normal, D20.faceNormals[face]) < -0.999999)
      expect(values[face] + values[opposite]).toBe(21)
    }
  })

  it('ölçüler düzgün yirmi yüzlünün bilinen değerleridir (kenar = 1)', () => {
    for (const [a, b] of [
      [0, 1],
      [0, 4],
      [0, 8]
    ]) {
      expect(length(sub(D20.vertices[a], D20.vertices[b]))).toBeCloseTo(1, 12)
    }
    expect(D20.circumradius).toBeCloseTo(Math.sqrt(PHI * PHI + 1) / 2, 12)
    expect(D20.inradius).toBeCloseTo((PHI * PHI) / (2 * Math.sqrt(3)), 12)
    expect(D20.silhouetteRadius).toBeCloseTo(PHI / Math.sqrt(3), 12)
    expect(D20.inertia).toBeCloseTo((PHI * PHI) / 10, 12)
  })

  it('yüz sırası ve sayıları sabittir; sonuç üstteki yüzden okunur, rakam yüzün ortasındadır', () => {
    expect(faceValues(D20)).toEqual([1, 7, 5, 13, 15, 3, 19, 17, 14, 20, 18, 4, 2, 16, 6, 8, 11, 12, 9, 10])
    expect(D20.faces[0]).toEqual([0, 1, 8])
    expect(D20.faces[9]).toEqual([2, 3, 11])
    expect(D20.turns).toBe(3)
    expect(D20.outcomes).toHaveLength(20)
    for (let face = 0; face < 20; face++) {
      const [label] = D20.faceLabels[face]
      expectVec(label.center, D20.faceCenters[face], 12)
      expect(D20.outcomes[face].value).toBe(label.value)
      expectVec(D20.outcomes[face].normal, D20.faceNormals[face], 12)
      expectVec(D20.outcomes[face].up, label.up, 12)
    }
  })

  it('rakamın tepesi yüzün ilk köşesine, öbür yönler öbür köşelere bakar', () => {
    for (let face = 0; face < 20; face++) {
      for (let corner = 0; corner < 3; corner++) {
        const toCorner = normalize(sub(D20.vertices[D20.faces[face][corner]], D20.faceCenters[face]))
        expectVec(outcomeUpAt(D20, face, corner), toCorner, 12)
      }
    }
  })
})

describe('d10', () => {
  it('on uçurtma yüz, 1-10 birer kez; bir kutupta tekler, öbüründe çiftler', () => {
    expect(D10.faces).toHaveLength(10)
    expect(D10.vertices).toHaveLength(12)
    expect(D10.faceLabels.every((labels) => labels.length === 1)).toBe(true)
    const values = faceValues(D10)
    expect([...values].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (let face = 0; face < 10; face++) {
      const upper = D10.faceNormals[face][2] > 0
      expect(values[face] % 2 === 1).toBe(upper)
      expect(D10.faces[face][0]).toBe(upper ? 0 : 1)
      expect(D10.outcomes[face].value).toBe(values[face])
      expectVec(D10.outcomes[face].normal, D10.faceNormals[face], 12)
    }
  })

  it('karşılıklı yüzlerin toplamı 0-9 sayımıyla 9 (10, sıfırın yerindedir)', () => {
    const values = faceValues(D10)
    for (let face = 0; face < 10; face++) {
      const opposite = D10.faceNormals.findIndex((normal) => dot(normal, D10.faceNormals[face]) < -0.999999)
      expect((values[face] % 10) + (values[opposite] % 10)).toBe(9)
    }
  })

  it('yüzler uçurtmadır: kutuptan iki uzun, kuyrukta iki kısa kenar; rakam iç teğet çemberin merkezinde', () => {
    expect(D10.turns).toBe(1)
    for (let face = 0; face < 10; face++) {
      const [apex, sideA, tail, sideB] = cornersOf(D10, face)
      const [label] = D10.faceLabels[face]
      const long = length(sub(sideA, apex))
      const short = length(sub(sideA, tail))
      expect(length(sub(sideB, apex))).toBeCloseTo(long, 12)
      expect(length(sub(sideB, tail))).toBeCloseTo(short, 12)
      expect(long).toBeGreaterThan(short * 1.5)
      // Kutuptan inen kenar eksenle 45° yapar.
      expect(Math.abs(sub(sideA, apex)[2]) / long).toBeCloseTo(Math.SQRT1_2, 12)
      // Rakamın tepesi kutba bakar.
      expectVec(label.up, normalize(sub(apex, tail)), 12)
      expectVec(D10.outcomes[face].up, label.up, 12)
      // Rakamın noktası dört kenara da aynı uzaklıktadır.
      expectVec(label.center, D10.faceCenters[face], 12)
      const corners = [apex, sideA, tail, sideB]
      const distances = corners.map((corner, i) => {
        const edge = normalize(sub(corners[(i + 1) % 4], corner))
        const toCenter = sub(label.center, corner)
        return length(sub(toCenter, scale(edge, dot(toCenter, edge))))
      })
      for (const distance of distances) expect(distance).toBeCloseTo(distances[0], 12)
      expect(distances[0]).toBeGreaterThan(0.35)
    }
  })
})

describe('d4', () => {
  it('düzgün dört yüzlüdür: dört eşkenar üçgen, dört köşe, bütün kenarlar eşit', () => {
    expect(D4.faces).toHaveLength(4)
    expect(D4.vertices).toHaveLength(4)
    expect(D4.faces.every((face) => face.length === 3)).toBe(true)
    expect(D4.turns).toBe(3)
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) expect(length(sub(D4.vertices[a], D4.vertices[b]))).toBeCloseTo(D4_EDGE, 12)
    }
  })

  it('ölçüler düzgün dört yüzlünün bilinen değerleridir', () => {
    expect(D4.circumradius).toBeCloseTo((D4_EDGE * Math.sqrt(6)) / 4, 12)
    expect(D4.inradius).toBeCloseTo((D4_EDGE * Math.sqrt(6)) / 12, 12)
    expect(D4.silhouetteRadius).toBeCloseTo(D4_EDGE / Math.sqrt(3), 12)
    expect(D4.inertia).toBeCloseTo((D4_EDGE * D4_EDGE) / 20, 12)
  })

  it('sonuç üstte kalan köşeden okunur: dört köşe dört duruştur, karşısındaki yüz masadadır', () => {
    expect(D4.outcomes).toHaveLength(4)
    for (let vertex = 0; vertex < 4; vertex++) {
      const outcome = D4.outcomes[vertex]
      expect(outcome.value).toBe(vertex + 1)
      expectVec(outcome.normal, normalize(D4.vertices[vertex]), 12)
      // Köşenin karşısındaki yüz: o köşeyi içermeyen tek yüz.
      const opposite = D4.faces.findIndex((face) => !face.includes(vertex))
      expectVec(D4.faceNormals[opposite], scale(outcome.normal, -1), 12)
    }
  })

  it('her yüzde, köşelerinin yanında o köşelerin sayıları yazar; rakamın tepesi kendi köşesine bakar', () => {
    for (let face = 0; face < 4; face++) {
      const labels = D4.faceLabels[face]
      expect(labels).toHaveLength(3)
      // Yüzün karşısındaki köşenin sayısı bu yüzde yazmaz.
      const opposite = [0, 1, 2, 3].find((vertex) => !D4.faces[face].includes(vertex)) ?? -1
      expect(labels.map((label) => label.value).sort()).toEqual([1, 2, 3, 4].filter((value) => value !== opposite + 1))
      for (const label of labels) {
        const vertex = D4.vertices[label.value - 1]
        const toVertex = sub(vertex, D4.faceCenters[face])
        expectVec(label.up, normalize(toVertex), 12)
        // Yüzün ortası ile köşe arasında, ortaya biraz daha yakın.
        expectVec(label.center, add(D4.faceCenters[face], scale(toVertex, 0.42)), 12)
      }
      // Aynı yüzdeki rakamlar üst üste binmeyecek kadar ayrıktır.
      for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) expect(length(sub(labels[a].center, labels[b].center))).toBeGreaterThan(0.6)
      }
    }
    // Her sayı, köşesine değen üç yüzde birer kez yazar.
    for (const value of [1, 2, 3, 4]) expect(allLabels(D4).filter((label) => label.value === value)).toHaveLength(3)
  })

  it('duran zarda üstteki köşenin sayısı görünen üç yüzde de yazar; biri izleyiciye göre dik durur', () => {
    for (const value of [1, 2, 3, 4]) {
      const q = restOrientation(D4, value)
      // Üstteki köşe merkezin tam üstünde, piramidin yüksekliği kadar yukarıda.
      const apex = quatRotate(q, D4.vertices[value - 1])
      expectVec(apex, [0, 0, D4.circumradius])
      expect(D4.inradius + D4.circumradius).toBeCloseTo(D4_EDGE * Math.sqrt(2 / 3), 12)
      // Masadaki yüz dışındaki üç yüz yukarıdan görünür ve aynı eğimdedir.
      const facing = D4.faceNormals.map((normal) => quatRotate(q, normal)[2])
      expect(facing.filter((z) => z > 0)).toHaveLength(3)
      for (const z of facing.filter((value) => value > 0)) expect(z).toBeCloseTo(1 / 3, 12)

      const read = allLabels(D4).filter((label) => label.value === value)
      const tilts = read.map((label) => (screenTilt(q, label.up) * 180) / Math.PI).sort((a, b) => a - b)
      expect(tilts[0]).toBeCloseTo(-120, 9)
      expect(tilts[1]).toBeCloseTo(0, 9)
      expect(tilts[2]).toBeCloseTo(120, 9)
      // Dik duran rakam, tepenin ekranda altında kalan yüzdedir.
      const upright = read.find((label) => Math.abs(screenTilt(q, label.up)) < 1e-9)
      expect(upright && quatRotate(q, upright.center)[1]).toBeLessThan(-0.1)
      // Görünen öbür rakamların hiçbiri dik değildir (dik duran tek rakam sonuçtur).
      for (let face = 0; face < 4; face++) {
        if (facing[face] <= 0) continue
        for (const label of D4.faceLabels[face]) {
          if (label.value !== value) expect(Math.abs(screenTilt(q, label.up))).toBeGreaterThan(0.3)
        }
      }
    }
  })
})

describe.each(MODELS)('fizik: d$sides', (model) => {
  it('her atışta zar bir yüzünün üstünde, masaya oturmuş olarak durur', () => {
    const rng = createRng(model.sides * 1000 + 7)
    const tops = new Set<number>()
    let rested = 0
    for (let i = 0; i < 60; i++) {
      const sim = simulateThrow(model, randomThrowStart(model, rng))
      if (!sim.rested) continue
      rested++
      const end = finalPose(sim)
      tops.add(sim.topOutcome)
      expect(sim.topOutcome).toBe(topOutcome(model, end.q))
      // Duruşun ekseni neredeyse dik, merkez yüz uzaklığı kadar yukarıda, hiçbir köşe masanın altında değil.
      expect(quatRotate(end.q, model.outcomes[sim.topOutcome].normal)[2]).toBeGreaterThan(0.9995)
      expect(Math.abs(end.z - model.inradius)).toBeLessThan(0.02)
      const low = heights(model, end).sort((a, b) => a - b)
      expect(low[0]).toBeGreaterThan(-0.02)
      expect(low[2]).toBeLessThan(0.03)
      expect(sim.restTime).toBeLessThan(4.5)
      expect(sim.firstImpactTime).toBeGreaterThan(0)
    }
    // Süresi dolan atış planlamada atlanır; ender olmalı.
    expect(rested).toBeGreaterThanOrEqual(57)
    // Sonuç fiziğe bağlı değildir ama zar hep aynı duruşta kalmamalı.
    expect(tops.size).toBeGreaterThanOrEqual(Math.min(4, model.outcomes.length))
  })
})

describe.each(MODELS)('atış planı: d$sides', (model) => {
  const values = valuesOf(model)
  const pacing = pacingFor(model)

  /** Her değer için birkaç atış: toplam en az 36. */
  const plans = values.flatMap((value) =>
    Array.from({ length: Math.ceil(36 / values.length) }, (_, round) => {
      const rng = createRng(model.sides * 100000 + value * 100 + round)
      return { value, plan: planThrow(model, value, STAGE, rng) }
    })
  )

  it('zar istenen değer üstte, rakam dik ve masaya oturmuş olarak durur', () => {
    for (const { value, plan } of plans) {
      const { rest } = plan
      const outcome = model.outcomes[topOutcome(model, rest.q)]
      expect(outcome.value, `${name(model)} = ${value}`).toBe(value)
      expectVec(quatRotate(rest.q, outcome.normal), [0, 0, 1])
      // Okunan rakamın ekrandaki eğimi en fazla 6°.
      expect(Math.abs(screenTilt(rest.q, outcome.up))).toBeLessThanOrEqual((6 * Math.PI) / 180 + 1e-9)
      expect(rest.z).toBeCloseTo(model.inradius, 12)
      const low = heights(model, rest).sort((a, b) => a - b)
      expect(low[0]).toBeCloseTo(0, 9)
      expect(low[2]).toBeCloseTo(0, 9)
      // Oyun alanının ortasındaki iniş bölgesinde.
      expect(rest.x).toBeGreaterThanOrEqual(STAGE.landing.x)
      expect(rest.x).toBeLessThanOrEqual(STAGE.landing.x + STAGE.landing.width)
      expect(rest.y).toBeGreaterThanOrEqual(STAGE.landing.y)
      expect(rest.y).toBeLessThanOrEqual(STAGE.landing.y + STAGE.landing.height)
    }
  })

  it('hareket boyunca zar masanın içine girmez; sayılar yer değiştirmez, sonda sıçrama olmaz', () => {
    const step = 1 / 240
    for (const { value, plan } of plans) {
      let previous: DiePose = plan.sample(0)
      let maxTurn = 0
      let maxShift = 0
      for (let time = step; time <= plan.duration + step; time += step) {
        const pose = plan.sample(time)
        // Sayıların yerleşimi zarın bir simetrisi olmasaydı köşeler fiziğin hesapladığı yerde olmaz,
        // masaya gömülür ya da havada kalırdı.
        expect(Math.min(...heights(model, pose)), `${name(model)} = ${value}, t = ${time.toFixed(3)}`).toBeGreaterThan(-0.03)
        maxTurn = Math.max(maxTurn, turnBetween(previous.q, pose.q))
        maxShift = Math.max(maxShift, Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z))
        previous = pose
      }
      // Kareler arası en büyük dönüş ve yer değiştirme: atışın en hızlı anıyla sınırlı, sıçrama yok.
      expect(maxTurn).toBeLessThan(0.25)
      expect(maxShift).toBeLessThan(0.12)
      expect(plan.sample(plan.duration + 0.001)).toEqual(plan.rest)
      expect(plan.sample(plan.duration + 5)).toEqual(plan.rest)
      // Son karede zar zaten duruşundadır: kalan fark ekranda bir pikselin çok altında.
      const justBefore = plan.sample(plan.duration - step)
      expect(turnBetween(justBefore.q, plan.rest.q)).toBeLessThan(0.004)
      expect(Math.hypot(justBefore.x - plan.rest.x, justBefore.y - plan.rest.y, justBefore.z - plan.rest.z)).toBeLessThan(0.004)
    }
  })

  it('atışlar koşulları sağlar: ekran dışından gelir, zarın kendi temposunda durur', () => {
    // d20 ve d10 yuvarlanır (1,9-2,6 s); d4 çarpıp kalır, atışı daha kısadır.
    expect(pacing.minDuration).toBeGreaterThanOrEqual(1.5)
    expect(pacing.maxDuration).toBeLessThanOrEqual(2.6)
    const clean = plans.filter(({ plan }) => plan.penalty === 0)
    for (const { plan } of clean) {
      expect(plan.duration).toBeGreaterThanOrEqual(pacing.minDuration)
      expect(plan.duration).toBeLessThanOrEqual(pacing.maxDuration)
      expect(plan.entrySide).not.toBe('none')
    }
    // Planlayıcı koşulların hepsini sağlayan bir atış bulur; bulamadığı durum ender, sapması küçük olmalı.
    expect(clean.length).toBeGreaterThanOrEqual(plans.length - 1)
    for (const { plan } of plans) {
      expect(plan.penalty).toBeLessThan(0.5)
      expect(plan.duration).toBeLessThan(pacing.maxDuration + 0.2)
    }
  })

  it('aynı tohum aynı atışı üretir', () => {
    const first = planThrow(model, values[0], STAGE, createRng(42))
    const second = planThrow(model, values[0], STAGE, createRng(42))
    expect(second.duration).toBe(first.duration)
    expect(second.rest).toEqual(first.rest)
    expect(second.sample(0.7)).toEqual(first.sample(0.7))
  })
})

describe('tempo', () => {
  it('d20 ve d10 aynı tempoda yuvarlanır; d4 daha kısa sürer ve tek sekmeyle yetinir', () => {
    expect(pacingFor(D20)).toEqual({ minDuration: 1.9, maxDuration: 2.6, bigHop: 0.45, hops: 2 })
    expect(pacingFor(D10)).toEqual(pacingFor(D20))
    expect(pacingFor(D4).minDuration).toBeLessThan(pacingFor(D20).minDuration)
    expect(pacingFor(D4).hops).toBe(1)
  })
})
