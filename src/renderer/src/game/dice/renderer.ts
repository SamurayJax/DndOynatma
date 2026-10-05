/**
 * Zarı 2B tuvale çizer: kendi perspektif izdüşümü, arka yüz ayıklama, yüz başına ışıklandırma.
 * Zarlar dışbükey olduğu için görünen yüzler birbirini örtmez; sıralama gerekmez.
 */
import type { DieModel } from './geometry'
import { type Vec3, clamp, normalize } from './math'
import { LIGHT, perspective, shadowOf } from './optics'
import type { DiePose } from './throwPlan'

export type DieTone = 'normal' | 'crit' | 'fumble'

export interface DrawOptions {
  /** Zar birimi başına tuval pikseli. */
  scale: number
  /** 0..1; girişteki kısa belirme için. */
  alpha: number
  tone: DieTone
  /** 0..1; 20 ve 1 için durduktan sonra beliren hale. */
  glow: number
}

// Tuval CSS değişkenlerini okuyamaz; renkler temanın tonlarına (koyu kırmızı, altın, mürekkep) göre seçildi.
const BODY: Vec3 = [172, 30, 36]
const SPECULAR: Vec3 = [255, 226, 200]
const NUMERAL_LIT: Vec3 = [250, 232, 184]
const NUMERAL_DIM: Vec3 = [150, 112, 62]
const OUTLINE = 'rgba(18, 5, 6, 0.95)'
const EDGE = 'rgba(255, 196, 150, 0.34)'
const NUMERAL_SHADE = 'rgba(40, 6, 8, 0.55)'
const GLOW_COLORS: Record<Exclude<DieTone, 'normal'>, string> = {
  crit: '255, 200, 92',
  fumble: '214, 52, 40'
}

const AMBIENT = 0.36
const DIFFUSE = 0.76
const SHININESS = 28
const SPECULAR_STRENGTH = 0.55
const LIGHT_DIR = normalize(LIGHT)
/** Işık ile bakış yönünün ortası; parlama bu yöne bakan yüzlerde görülür. */
const HALF_DIR = normalize([LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2] + 1])

// Georgia'nın rakamları satır altına iner (eski stil); zar yüzünde hizalı rakam gerekir.
const NUMERAL_FONT = "'Palatino Linotype', 'Book Antiqua', Cambria, 'Times New Roman', serif"
/** Rakamlar yüzün kendi düzleminde, d20'nin kenarı = 100 birim olan bir uzayda yazılır. */
const TEXT_UNITS = 100
/** Alt çizgi ve gölge ölçüleri bu boydaki rakama göre yazıldı; öbür boylarda oranlanır. */
const REFERENCE_SIZE = 40
/** Bundan daha yandan görünen yüzlerde rakam çizilmez (okunmaz, bozuk görünür). */
const MIN_FACING_FOR_TEXT = 0.16

interface Label {
  text: string
  font: string
  x: number
  y: number
  /** Rakamın altındaki gölgenin kayması. */
  shadeX: number
  shadeY: number
  /** 6 ve 9 için alt çizgi: [x, y, genişlik, yükseklik]; diğerlerinde null. */
  underline: readonly [number, number, number, number] | null
}

const labelCache = new Map<string, Label>()

function labelFor(ctx: CanvasRenderingContext2D, model: DieModel, value: number): Label {
  const key = `${model.sides}:${value}`
  const cached = labelCache.get(key)
  if (cached) return cached
  const text = String(value)
  const size = model.numeralSizes[text.length > 1 ? 1 : 0]
  const unit = model.numeralSizes[0] / REFERENCE_SIZE
  const font = `700 ${size}px ${NUMERAL_FONT}`
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  // Mürekkebin gerçek kutusuna göre ortalanır; yazı tipinin satır aralığı rakamı yukarı kaydırmasın.
  const metrics = ctx.measureText(text)
  const left = metrics.actualBoundingBoxLeft
  const right = metrics.actualBoundingBoxRight
  const ascent = metrics.actualBoundingBoxAscent
  const descent = metrics.actualBoundingBoxDescent
  // Ters dönünce birbirine benzeyen 6 ve 9 alt çizgiyle ayrılır.
  const needsMark = value === 6 || value === 9
  // Alt çizgi rakamla birlikte ortalansın diye rakam biraz yukarı alınır.
  const lift = needsMark ? 3.5 * unit : 0
  const y = (ascent - descent) / 2 - lift
  const inkWidth = left + right
  const label: Label = {
    text,
    font,
    x: (left - right) / 2,
    y,
    shadeX: 1.4 * unit,
    shadeY: 1.6 * unit,
    underline: needsMark ? [-inkWidth * 0.46, y + descent + 3.6 * unit, inkWidth * 0.92, 3.4 * unit] : null
  }
  labelCache.set(key, label)
  return label
}

function rgb(color: Vec3, factor: number, add: Vec3 | null = null, addFactor = 0): string {
  const channel = (i: 0 | 1 | 2): number =>
    Math.round(clamp(color[i] * factor + (add === null ? 0 : add[i] * addFactor), 0, 255))
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

function mixRgb(from: Vec3, to: Vec3, t: number): string {
  const k = clamp(t, 0, 1)
  const channel = (i: 0 | 1 | 2): number => Math.round(from[i] + (to[i] - from[i]) * k)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

// Her karede yeniden ayırmamak için ortak tamponlar; köşesi daha çok olan bir zar gelirse büyür.
let screenX = new Float64Array(12)
let screenY = new Float64Array(12)

function softDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  inner: number,
  outer: number,
  color: string,
  alpha: number
): void {
  if (alpha <= 0 || outer <= 0) return
  const gradient = ctx.createRadialGradient(x, y, Math.min(inner, outer * 0.98), x, y, outer)
  gradient.addColorStop(0, `rgba(${color}, ${alpha})`)
  gradient.addColorStop(0.55, `rgba(${color}, ${alpha * 0.38})`)
  gradient.addColorStop(1, `rgba(${color}, 0)`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, outer, 0, Math.PI * 2)
  ctx.fill()
}

/** Tuvalin tamamını temizleyip zarı ve gölgesini çizer. */
export function drawDie(ctx: CanvasRenderingContext2D, model: DieModel, pose: DiePose, options: DrawOptions): void {
  const { scale, tone, glow } = options
  const { vertices, faces, faceCenters, faceNormals, faceRights, faceUps, faceValues, circumradius, inradius } = model
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  if (options.alpha <= 0) return
  ctx.globalAlpha = clamp(options.alpha, 0, 1)

  const centerX = pose.x * scale
  const centerY = pose.y * scale

  // --- Gölge ---
  const shadow = shadowOf(model, pose.x, pose.y, pose.z)
  softDisc(ctx, shadow.x * scale, shadow.y * scale, shadow.inner * scale, shadow.outer * scale, '0, 0, 0', shadow.alpha)
  // Yere yaklaştıkça zarın hemen altında sıkı, koyu bir temas gölgesi belirir.
  const lift = Math.max(0, pose.z - inradius)
  const contact = clamp(1 - lift / 0.8, 0, 1)
  if (contact > 0) {
    softDisc(
      ctx,
      centerX + 0.09 * scale,
      centerY + 0.12 * scale,
      circumradius * 0.8 * scale,
      circumradius * 1.17 * scale,
      '0, 0, 0',
      0.5 * contact
    )
  }

  if (tone !== 'normal' && glow > 0) {
    softDisc(ctx, centerX, centerY, circumradius * 0.7 * scale, circumradius * 1.8 * scale, GLOW_COLORS[tone], 0.5 * glow)
  }

  // --- Köşeler ---
  const [qx, qy, qz, qw] = pose.q
  const m00 = 1 - 2 * (qy * qy + qz * qz)
  const m01 = 2 * (qx * qy - qz * qw)
  const m02 = 2 * (qx * qz + qy * qw)
  const m10 = 2 * (qx * qy + qz * qw)
  const m11 = 1 - 2 * (qx * qx + qz * qz)
  const m12 = 2 * (qy * qz - qx * qw)
  const m20 = 2 * (qx * qz - qy * qw)
  const m21 = 2 * (qy * qz + qx * qw)
  const m22 = 1 - 2 * (qx * qx + qy * qy)

  /** Zarın merkezine göre verilen bir noktanın tuvaldeki yeri. Dünya y'si yukarı, tuval y'si aşağıdır. */
  const project = (v: Vec3): [number, number] => {
    const x = m00 * v[0] + m01 * v[1] + m02 * v[2]
    const y = m10 * v[0] + m11 * v[1] + m12 * v[2]
    const z = m20 * v[0] + m21 * v[1] + m22 * v[2]
    const k = perspective(model, pose.z + z) * scale
    return [centerX + x * k, centerY - y * k]
  }

  if (screenX.length < vertices.length) {
    screenX = new Float64Array(vertices.length)
    screenY = new Float64Array(vertices.length)
  }
  for (let i = 0; i < vertices.length; i++) {
    const [x, y] = project(vertices[i])
    screenX[i] = x
    screenY[i] = y
  }

  // --- Görünen yüzler ---
  const visible: number[] = []
  for (let face = 0; face < faces.length; face++) {
    const corners = faces[face]
    // Çokgenin tuvaldeki işaretli alanının iki katı.
    let area = 0
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % corners.length]
      area += screenX[a] * screenY[b] - screenX[b] * screenY[a]
    }
    // Dışarıdan saat yönünün tersine dizili yüz, y'si aşağı bakan tuvalde negatif alan verir.
    if (area < 0) visible.push(face)
  }

  const trace = (face: number): void => {
    const corners = faces[face]
    ctx.beginPath()
    ctx.moveTo(screenX[corners[0]], screenY[corners[0]])
    for (let i = 1; i < corners.length; i++) ctx.lineTo(screenX[corners[i]], screenY[corners[i]])
    ctx.closePath()
  }

  // Koyu dış çizgi: açık renkli arka planlarda zarın kenarı kaybolmasın.
  ctx.lineJoin = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 0.05 * scale
  for (const face of visible) {
    trace(face)
    ctx.stroke()
  }

  for (const face of visible) {
    const n = faceNormals[face]
    const nx = m00 * n[0] + m01 * n[1] + m02 * n[2]
    const ny = m10 * n[0] + m11 * n[1] + m12 * n[2]
    const nz = m20 * n[0] + m21 * n[1] + m22 * n[2]
    const diffuse = Math.max(0, nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2])
    const halfway = Math.max(0, nx * HALF_DIR[0] + ny * HALF_DIR[1] + nz * HALF_DIR[2])
    const intensity = AMBIENT + DIFFUSE * diffuse
    const specular = SPECULAR_STRENGTH * Math.pow(halfway, SHININESS)

    // Yüz içinde ışığa doğru hafif bir açılma: düz boyadan daha "cilalı" görünür.
    const [fx, fy] = project(faceCenters[face])
    const reach = 0.5 * scale
    const sheen = ctx.createLinearGradient(
      fx + LIGHT_DIR[0] * reach,
      fy - LIGHT_DIR[1] * reach,
      fx - LIGHT_DIR[0] * reach,
      fy + LIGHT_DIR[1] * reach
    )
    sheen.addColorStop(0, rgb(BODY, intensity * 1.12, SPECULAR, specular))
    sheen.addColorStop(1, rgb(BODY, intensity * 0.86, SPECULAR, specular * 0.6))
    trace(face)
    ctx.fillStyle = sheen
    ctx.fill()

    // --- Rakam ---
    if (nz < MIN_FACING_FOR_TEXT) continue
    const center = faceCenters[face]
    const right = faceRights[face]
    const up = faceUps[face]
    const span = 0.25
    const [rx, ry] = project([center[0] + right[0] * span, center[1] + right[1] * span, center[2] + right[2] * span])
    const [ux, uy] = project([center[0] + up[0] * span, center[1] + up[1] * span, center[2] + up[2] * span])
    const k = 1 / (span * TEXT_UNITS)
    // Yazının y ekseni aşağı baktığı için "yukarı" vektörü ters çevrilir.
    ctx.setTransform((rx - fx) * k, (ry - fy) * k, -(ux - fx) * k, -(uy - fy) * k, fx, fy)
    const label = labelFor(ctx, model, faceValues[face])
    ctx.font = label.font
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    // Çok yandan görünen yüzde rakam yavaşça kaybolsun; birden belirip kaybolmasın.
    const fade = clamp((nz - MIN_FACING_FOR_TEXT) / 0.14, 0, 1)
    const previousAlpha = ctx.globalAlpha
    ctx.globalAlpha = previousAlpha * fade
    ctx.fillStyle = NUMERAL_SHADE
    ctx.fillText(label.text, label.x + label.shadeX, label.y + label.shadeY)
    ctx.fillStyle = mixRgb(NUMERAL_DIM, NUMERAL_LIT, (intensity - AMBIENT) / DIFFUSE + specular)
    ctx.fillText(label.text, label.x, label.y)
    if (label.underline) ctx.fillRect(...label.underline)
    ctx.globalAlpha = previousAlpha
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  // Kenarlar: gerçek zarın pahlı kenarları ışığı yakalar.
  ctx.strokeStyle = EDGE
  ctx.lineWidth = Math.max(1, 0.013 * scale)
  for (const face of visible) {
    trace(face)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
}
