/**
 * Zar biçimleri, fizik ve atış planı. Bu modüller tuvale ya da pencereye dokunmaz; burada
 * Node ortamında sınanır. Çizim ve gerçek atışlar için: e2e/oyun/05-zar.mjs.
 */
import { describe, expect, it } from 'vitest'
import { DICE_SIDES } from '@shared/types'
import {
  D10,
  D20,
  D3,
  type DieModel,
  faceOfValue,
  faceUpAt,
  modelFor,
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
import { type DiePose, type StageBounds, planThrow } from '../../src/renderer/src/game/dice/throwPlan'

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
const expectVec = (actual: Vec3, expected: Vec3, digits = 9): void => {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i], digits)
}

/** Verilen duruşta üstte (izleyiciye bakan) yüz. */
function topFace(model: DieModel, q: Quat): number {
  let best = 0
  for (let face = 1; face < model.faces.length; face++) {
    if (quatRotate(q, model.faceNormals[face])[2] > quatRotate(q, model.faceNormals[best])[2]) best = face
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
        // Düzlemde: her köşe yüzün rakam noktasıyla aynı düzlemdedir.
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

  it('rakam yönleri yüz düzlemindedir; sağ, yukarı ve normal sağ el üçlüsüdür', () => {
    for (let face = 0; face < model.faces.length; face++) {
      const up = model.faceUps[face]
      const right = model.faceRights[face]
      const normal = model.faceNormals[face]
      expect(length(up)).toBeCloseTo(1, 12)
      expect(dot(up, normal)).toBeCloseTo(0, 12)
      expectVec(cross(right, up), normal, 12)
      for (let turn = 0; turn < model.faceTurns; turn++) {
        const turned = faceUpAt(model, face, turn)
        expect(length(turned)).toBeCloseTo(1, 12)
        expect(dot(turned, normal)).toBeCloseTo(0, 12)
        expect(dot(turned, up)).toBeCloseTo(Math.cos((2 * Math.PI * turn) / model.faceTurns), 12)
      }
    }
  })

  it('her yüzün tam karşısında ona paralel bir yüz vardır (zar düz bir yüzle üstte durur)', () => {
    for (let face = 0; face < model.faces.length; face++) {
      const opposite = model.faceNormals.findIndex((normal) => dot(normal, model.faceNormals[face]) < -1 + 1e-12)
      expect(opposite).not.toBe(-1)
    }
  })

  it('sayıları üstte kalan yüze taşıyan her dönüş zarı kendi üstüne getirir', () => {
    // Atış planının dayandığı özellik: herhangi bir değerin yüzü, herhangi bir yüze, rakamın geçerli
    // her yönüyle, zarın biçimi değişmeden taşınabilir.
    const values = [...new Set(model.faceValues)]
    for (const value of values) {
      const from = faceOfValue(model, value)
      for (let face = 0; face < model.faces.length; face++) {
        for (let turn = 0; turn < model.faceTurns; turn++) {
          const relabel = quatFromFrames(
            model.faceNormals[from],
            model.faceUps[from],
            model.faceNormals[face],
            faceUpAt(model, face, turn)
          )
          expectVec(quatRotate(relabel, model.faceCenters[from]), model.faceCenters[face])
          const hit = new Set<number>()
          for (const vertex of model.vertices) {
            const moved = quatRotate(relabel, vertex)
            const match = model.vertices.findIndex((other) => length(sub(other, moved)) < 1e-9)
            expect(match, `d${model.sides}: ${value} → yüz ${face}, yön ${turn}`).not.toBe(-1)
            hit.add(match)
          }
          expect(hit.size).toBe(model.vertices.length)
        }
      }
    }
  })

  it('duruş yönelimi istenen değeri izleyiciye çevirir, rakamı verilen eğimle dik tutar', () => {
    for (const value of new Set(model.faceValues)) {
      for (const tilt of [0, 0.1, -0.07]) {
        const q = restOrientation(model, value, tilt)
        const face = faceOfValue(model, value)
        expect(model.faceValues[topFace(model, q)]).toBe(value)
        expectVec(quatRotate(q, model.faceNormals[face]), [0, 0, 1])
        expectVec(quatRotate(q, model.faceUps[face]), [-Math.sin(tilt), Math.cos(tilt), 0])
        // Karşı yüz masada: en alttaki köşeler aynı yükseklikte, merkez yüz uzaklığı kadar yukarıda.
        const low = heights(model, { z: model.inradius, q }).sort((a, b) => a - b)
        expect(low[0]).toBeCloseTo(0, 9)
        expect(low[2]).toBeCloseTo(0, 9)
      }
    }
  })

  it('geçersiz değer en büyük sayının yüzünü gösterir', () => {
    expect(model.faceValues[faceOfValue(model, 0)]).toBe(model.sides)
    expect(model.faceValues[faceOfValue(model, model.sides + 1)]).toBe(model.sides)
  })
})

describe('d20', () => {
  it('yirmi üçgen yüz, 1-20 birer kez; karşılıklı yüzlerin toplamı 21', () => {
    expect(D20.faces).toHaveLength(20)
    expect(D20.faces.every((face) => face.length === 3)).toBe(true)
    expect([...D20.faceValues].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    for (let face = 0; face < 20; face++) {
      const opposite = D20.faceNormals.findIndex((normal) => dot(normal, D20.faceNormals[face]) < -0.999999)
      expect(D20.faceValues[face] + D20.faceValues[opposite]).toBe(21)
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

  it('yüz sırası ve sayıları sabittir; rakamın tepesi yüzün ilk köşesine, öbür yönler öbür köşelere bakar', () => {
    expect(D20.faceValues).toEqual([1, 7, 5, 13, 15, 3, 19, 17, 14, 20, 18, 4, 2, 16, 6, 8, 11, 12, 9, 10])
    expect(D20.faces[0]).toEqual([0, 1, 8])
    expect(D20.faces[9]).toEqual([2, 3, 11])
    expect(D20.faceTurns).toBe(3)
    for (let face = 0; face < 20; face++) {
      for (let corner = 0; corner < 3; corner++) {
        const toCorner = normalize(sub(D20.vertices[D20.faces[face][corner]], D20.faceCenters[face]))
        expectVec(faceUpAt(D20, face, corner), toCorner, 12)
      }
    }
  })
})

describe('d10', () => {
  it('on uçurtma yüz, 1-10 birer kez; bir kutupta tekler, öbüründe çiftler', () => {
    expect(D10.faces).toHaveLength(10)
    expect(D10.vertices).toHaveLength(12)
    expect([...D10.faceValues].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (let face = 0; face < 10; face++) {
      const upper = D10.faceNormals[face][2] > 0
      expect(D10.faceValues[face] % 2 === 1).toBe(upper)
      expect(D10.faces[face][0]).toBe(upper ? 0 : 1)
    }
  })

  it('karşılıklı yüzlerin toplamı 0-9 sayımıyla 9 (10, sıfırın yerindedir)', () => {
    for (let face = 0; face < 10; face++) {
      const opposite = D10.faceNormals.findIndex((normal) => dot(normal, D10.faceNormals[face]) < -0.999999)
      expect((D10.faceValues[face] % 10) + (D10.faceValues[opposite] % 10)).toBe(9)
    }
  })

  it('yüzler uçurtmadır: kutuptan iki uzun, kuyrukta iki kısa kenar; rakam iç teğet çemberin merkezinde', () => {
    expect(D10.faceTurns).toBe(1)
    for (let face = 0; face < 10; face++) {
      const [apex, sideA, tail, sideB] = cornersOf(D10, face)
      const long = length(sub(sideA, apex))
      const short = length(sub(sideA, tail))
      expect(length(sub(sideB, apex))).toBeCloseTo(long, 12)
      expect(length(sub(sideB, tail))).toBeCloseTo(short, 12)
      expect(long).toBeGreaterThan(short * 1.5)
      // Kutuptan inen kenar eksenle 45° yapar.
      expect(Math.abs(sub(sideA, apex)[2]) / long).toBeCloseTo(Math.SQRT1_2, 12)
      // Rakamın tepesi kutba bakar.
      expectVec(D10.faceUps[face], normalize(sub(apex, tail)), 12)
      // Merkez dört kenara da aynı uzaklıktadır.
      const corners = [apex, sideA, tail, sideB]
      const distances = corners.map((corner, i) => {
        const edge = normalize(sub(corners[(i + 1) % 4], corner))
        const toCenter = sub(D10.faceCenters[face], corner)
        return length(sub(toCenter, scale(edge, dot(toCenter, edge))))
      })
      for (const distance of distances) expect(distance).toBeCloseTo(distances[0], 12)
      expect(distances[0]).toBeGreaterThan(0.35)
    }
  })
})

describe('d3', () => {
  it('küptür: altı kare yüz, 1-2-3 ikişer kez, karşılıklı yüzlerde aynı sayı', () => {
    expect(D3.faces).toHaveLength(6)
    expect(D3.vertices).toHaveLength(8)
    expect(D3.faceTurns).toBe(4)
    expect([...D3.faceValues].sort((a, b) => a - b)).toEqual([1, 1, 2, 2, 3, 3])
    const edge = length(sub(D3.vertices[0], D3.vertices[1]))
    for (let face = 0; face < 6; face++) {
      const corners = cornersOf(D3, face)
      for (let i = 0; i < 4; i++) {
        expect(length(sub(corners[i], corners[(i + 1) % 4]))).toBeCloseTo(edge, 12)
        expect(dot(sub(corners[(i + 1) % 4], corners[i]), sub(corners[(i + 2) % 4], corners[(i + 1) % 4]))).toBeCloseTo(0, 12)
      }
      const opposite = D3.faceNormals.findIndex((normal) => dot(normal, D3.faceNormals[face]) < -0.999999)
      expect(D3.faceValues[opposite]).toBe(D3.faceValues[face])
      // Rakam kenarlara paralel durur (köşeye doğru değil).
      expect(Math.max(...D3.faceUps[face].map(Math.abs))).toBeCloseTo(1, 12)
    }
    expect(D3.inradius).toBeCloseTo(edge / 2, 12)
    expect(D3.inertia).toBeCloseTo((edge * edge) / 6, 12)
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
      tops.add(sim.topFace)
      expect(sim.topFace).toBe(topFace(model, end.q))
      // Üstteki yüz neredeyse yatay, merkez yüz uzaklığı kadar yukarıda, hiçbir köşe masanın altında değil.
      expect(quatRotate(end.q, model.faceNormals[sim.topFace])[2]).toBeGreaterThan(0.9995)
      expect(Math.abs(end.z - model.inradius)).toBeLessThan(0.02)
      const low = heights(model, end).sort((a, b) => a - b)
      expect(low[0]).toBeGreaterThan(-0.02)
      expect(low[2]).toBeLessThan(0.03)
      expect(sim.restTime).toBeLessThan(4.5)
      expect(sim.firstImpactTime).toBeGreaterThan(0)
    }
    // Süresi dolan atış planlamada atlanır; ender olmalı.
    expect(rested).toBeGreaterThanOrEqual(57)
    // Sonuç fiziğe bağlı değildir ama zar hep aynı yüzde durmamalı.
    expect(tops.size).toBeGreaterThanOrEqual(Math.min(4, model.faces.length))
  })
})

describe.each(MODELS)('atış planı: d$sides', (model) => {
  const values = [...new Set(model.faceValues)].sort((a, b) => a - b)

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
      const face = topFace(model, rest.q)
      expect(model.faceValues[face], `${name(model)} = ${value}`).toBe(value)
      expectVec(quatRotate(rest.q, model.faceNormals[face]), [0, 0, 1])
      // Rakamın ekrandaki eğimi en fazla 6°.
      const up = quatRotate(rest.q, model.faceUps[face])
      expect(Math.abs(Math.atan2(-up[0], up[1]))).toBeLessThanOrEqual((6 * Math.PI) / 180 + 1e-9)
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

  it('atışlar koşulları sağlar: ekran dışından gelir, 1,9-2,6 saniyede durur', () => {
    const clean = plans.filter(({ plan }) => plan.penalty === 0)
    for (const { plan } of clean) {
      expect(plan.duration).toBeGreaterThanOrEqual(1.9)
      expect(plan.duration).toBeLessThanOrEqual(2.6)
      expect(plan.entrySide).not.toBe('none')
    }
    // Planlayıcı koşulların hepsini sağlayan bir atış bulur; bulamadığı durum ender, sapması küçük olmalı.
    expect(clean.length).toBeGreaterThanOrEqual(plans.length - 1)
    for (const { plan } of plans) {
      expect(plan.penalty).toBeLessThan(0.5)
      expect(plan.duration).toBeLessThan(2.8)
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
