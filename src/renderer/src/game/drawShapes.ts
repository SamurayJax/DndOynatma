/**
 * Şekil araçlarının çizgileri. Her şekil düz bir nokta dizisine çevrilir: kalem çizgisiyle aynı yoldan
 * çizilir, silinir ve geri alınır. Saf fonksiyonlar; tuvale dokunmaz.
 */
import type { Tool } from '@shared/types'

export type ShapeTool = Extract<Tool, 'line' | 'arrow' | 'rect' | 'ellipse'>

export interface Point {
  x: number
  y: number
}

const SNAP_ANGLE = Math.PI / 4
const ELLIPSE_SEGMENTS = 72
/** Ok başı en az bu kadar uzundur (sanal piksel); kalın çizgide kalınlıkla büyür. */
const MIN_HEAD = 22
const HEAD_PER_WIDTH = 3.5
const HEAD_ANGLE = Math.PI / 7

export function isShapeTool(tool: Tool): tool is ShapeTool {
  return tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse'
}

/** Shift basılıyken: çizgi ve ok 45°'lik açılara yapışır, dikdörtgen kare, elips daire olur. */
export function constrainEnd(tool: ShapeTool, start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (tool === 'line' || tool === 'arrow') {
    const angle = Math.round(Math.atan2(dy, dx) / SNAP_ANGLE) * SNAP_ANGLE
    const reach = Math.hypot(dx, dy)
    return { x: start.x + Math.cos(angle) * reach, y: start.y + Math.sin(angle) * reach }
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) }
}

/** Şeklin çizgisi: düz dizi [x1, y1, x2, y2, …]. `width`: çizgi kalınlığı (ok başının büyüklüğü için). */
export function shapePoints(tool: ShapeTool, start: Point, end: Point, width: number): number[] {
  switch (tool) {
    case 'line':
      return [start.x, start.y, end.x, end.y]
    case 'arrow': {
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      // Kısa okta baş gövdeden uzun olmasın.
      const head = Math.min(Math.max(MIN_HEAD, width * HEAD_PER_WIDTH), length / 2)
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const wing = (side: number): number[] => [end.x - Math.cos(angle + side * HEAD_ANGLE) * head, end.y - Math.sin(angle + side * HEAD_ANGLE) * head]
      return [start.x, start.y, end.x, end.y, ...wing(1), end.x, end.y, ...wing(-1)]
    }
    case 'rect':
      return [start.x, start.y, end.x, start.y, end.x, end.y, start.x, end.y, start.x, start.y]
    case 'ellipse': {
      const centerX = (start.x + end.x) / 2
      const centerY = (start.y + end.y) / 2
      const radiusX = Math.abs(end.x - start.x) / 2
      const radiusY = Math.abs(end.y - start.y) / 2
      const points: number[] = []
      for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
        const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2
        points.push(centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY)
      }
      return points
    }
  }
}

/** Bundan kısa sürükleme şekil sayılmaz; yanlışlıkla tıklama iz bırakmasın. */
const MIN_DRAG = 4

export function isTooSmall(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) < MIN_DRAG
}
