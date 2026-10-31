import { describe, expect, it } from 'vitest'
import { constrainEnd, isShapeTool, isTooSmall, shapePoints } from '../../src/renderer/src/game/drawShapes'

const A = { x: 100, y: 200 }
const B = { x: 400, y: 600 }

function pairs(points: number[]): [number, number][] {
  return Array.from({ length: points.length / 2 }, (_, i) => [points[i * 2], points[i * 2 + 1]])
}

describe('şekiller', () => {
  it('düz çizgi iki noktadır', () => {
    expect(shapePoints('line', A, B, 6)).toEqual([100, 200, 400, 600])
  })

  it('dikdörtgen dört köşeden geçip başladığı yere döner', () => {
    const points = pairs(shapePoints('rect', A, B, 6))
    expect(points).toEqual([[100, 200], [400, 200], [400, 600], [100, 600], [100, 200]])
  })

  it('elips kutuya teğettir, kapanır, kutunun dışına çıkmaz', () => {
    const points = pairs(shapePoints('ellipse', A, B, 6))
    expect(points[0][0]).toBeCloseTo(points.at(-1)?.[0] ?? 0, 9)
    expect(points[0][1]).toBeCloseTo(points.at(-1)?.[1] ?? 0, 9)
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    expect(Math.min(...xs)).toBeCloseTo(100, 6)
    expect(Math.max(...xs)).toBeCloseTo(400, 6)
    expect(Math.min(...ys)).toBeCloseTo(200, 6)
    expect(Math.max(...ys)).toBeCloseTo(600, 6)
  })

  it('ok ucuna gider, başı uçta simetriktir', () => {
    const points = pairs(shapePoints('arrow', { x: 0, y: 0 }, { x: 300, y: 0 }, 6))
    expect(points[0]).toEqual([0, 0])
    expect(points[1]).toEqual([300, 0])
    expect(points[3]).toEqual([300, 0])
    expect(points[2][0]).toBeCloseTo(points[4][0], 9)
    expect(points[2][1]).toBeCloseTo(-points[4][1], 9)
    expect(points[2][0]).toBeLessThan(300)
  })

  it('ok başı kalınlıkla büyür, kısa okta gövdeyi aşmaz', () => {
    const headOf = (width: number, length: number): number => 300 - pairs(shapePoints('arrow', { x: 300 - length, y: 0 }, { x: 300, y: 0 }, width))[2][0]
    expect(headOf(12, 300)).toBeGreaterThan(headOf(3, 300))
    expect(headOf(12, 10)).toBeLessThanOrEqual(5)
  })
})

describe('Shift', () => {
  it('çizgi 45° katlarına yapışır, uzunluk korunur', () => {
    const end = constrainEnd('line', { x: 0, y: 0 }, { x: 100, y: 12 })
    expect(end.x).toBeCloseTo(Math.hypot(100, 12), 9)
    expect(end.y).toBeCloseTo(0, 9)
    const diagonal = constrainEnd('arrow', { x: 0, y: 0 }, { x: 100, y: 90 })
    expect(diagonal.x).toBeCloseTo(diagonal.y, 9)
  })

  it.each([['rect'], ['ellipse']] as const)('%s kare olur, sürüklenen yönde', (tool) => {
    expect(constrainEnd(tool, { x: 50, y: 50 }, { x: 150, y: 80 })).toEqual({ x: 150, y: 150 })
    expect(constrainEnd(tool, { x: 50, y: 50 }, { x: 10, y: -100 })).toEqual({ x: -100, y: -100 })
  })
})

describe('yardımcılar', () => {
  it('yalnızca şekil araçları şekildir', () => {
    expect(['line', 'arrow', 'rect', 'ellipse'].every((tool) => isShapeTool(tool as never))).toBe(true)
    expect(['mouse', 'pen', 'eraser', 'text'].some((tool) => isShapeTool(tool as never))).toBe(false)
  })

  it('çok kısa sürükleme şekil sayılmaz', () => {
    expect(isTooSmall(A, { x: 102, y: 201 })).toBe(true)
    expect(isTooSmall(A, B)).toBe(false)
  })
})
