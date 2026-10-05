import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type Konva from 'konva'
import { Layer, Line, Rect as HitRect } from 'react-konva'
import type { Rect } from '@shared/layout'
import type { ID, Tool } from '@shared/types'

type Pen = Exclude<Tool, 'mouse'>

interface PenStyle {
  color: string
  /** Çizginin altına çizilen daha geniş şeridin rengi; hale yoksa null. */
  halo: string | null
}

interface Stroke {
  id: number
  /** Çizgi, çizildiği kalemin rengini korur. */
  pen: Pen
  /** Düz dizi [x1, y1, x2, y2, …], sanal koordinat. */
  points: number[]
}

interface ActiveStroke {
  pointerId: number
  pen: Pen
  points: number[]
}

const STROKE_WIDTH = 6
const HALO_WIDTH = STROKE_WIDTH + 5
/** Bir önceki noktaya bundan yakın olan nokta eklenmez (sanal piksel). */
const MIN_POINT_DISTANCE = 1.5
const PEN_CURSOR = 'crosshair'

const PEN_STYLES: Record<Pen, PenStyle> = {
  'pen-red': { color: '#ff2a2a', halo: null },
  // Siyah çizgi koyu haritada kaybolmasın diye açık renkli ince bir hale ile çevrilir.
  'pen-black': { color: '#0a0a0a', halo: 'rgba(255, 255, 255, 0.6)' }
}

/**
 * Noktaları köşesiz birleştirir: her nokta eğrinin denetim noktası, komşu iki noktanın ortası eğrinin ucudur.
 * Konva'nın `tension` eğrisi yerine bu kullanılır; o, hızlı çizimdeki seyrek noktalarda keskin dönüşlerin
 * dışına taşıp kanca yapıyor.
 */
function drawSmoothStroke(context: Konva.Context, shape: Konva.Shape): void {
  const points: number[] = shape.getAttr('points') ?? []
  if (points.length < 4) return
  context.beginPath()
  context.moveTo(points[0], points[1])
  for (let i = 2; i < points.length - 2; i += 2) {
    context.quadraticCurveTo(points[i], points[i + 1], (points[i] + points[i + 2]) / 2, (points[i + 1] + points[i + 3]) / 2)
  }
  context.lineTo(points[points.length - 2], points[points.length - 1])
  context.strokeShape(shape)
}

const LINE_PROPS = { lineCap: 'round', lineJoin: 'round', listening: false, sceneFunc: drawSmoothStroke } as const

/** Tek noktadan çizgi çıkmaz; tıklama nokta olarak görünsün diye çok kısa bir çizgiye çevrilir. */
function drawablePoints(points: number[]): number[] {
  return points.length === 2 ? [points[0], points[1], points[0] + 0.01, points[1]] : points
}

const StrokeLines = memo(function StrokeLines({ stroke }: { stroke: Stroke }): JSX.Element {
  const style = PEN_STYLES[stroke.pen]
  const points = drawablePoints(stroke.points)
  return (
    <>
      {style.halo !== null && <Line {...LINE_PROPS} points={points} stroke={style.halo} strokeWidth={HALO_WIDTH} />}
      <Line {...LINE_PROPS} points={points} stroke={style.color} strokeWidth={STROKE_WIDTH} />
    </>
  )
})

/** Çizgi kimlikleri pencereler ve yeniden kurulumlar arasında çakışmasın diye tek sayaçtan verilir. */
let nextStrokeId = 1

interface DrawingSurfaceProps {
  pen: Pen | null
  area: Rect
  /** Bu pencerenin bitmiş çizgileri; katmanda tutulur ki pencere değişip geri gelince dursunlar. */
  strokes: Stroke[]
  setStrokes: (update: (previous: Stroke[]) => Stroke[]) => void
}

/**
 * Bir pencerenin çizgilerini çizer ve yenilerini toplar. Katman bunu pencere ve sayaçla anahtarlar:
 * pencere ya da sayaç değişince baştan kurulur, yarım kalan çizgi bırakılır.
 */
function DrawingSurface({ pen, area, strokes, setStrokes }: DrawingSurfaceProps): JSX.Element {
  // Çizilmekte olan çizgi React durumuna girmez; bu iki Konva çizgisi doğrudan güncellenir.
  const haloRef = useRef<Konva.Line>(null)
  const inkRef = useRef<Konva.Line>(null)
  const activeRef = useRef<ActiveStroke | null>(null)
  const stopTrackingRef = useRef<(() => void) | null>(null)
  const penActive = pen !== null

  const paint = (active: ActiveStroke): void => {
    const halo = haloRef.current
    const ink = inkRef.current
    if (!halo || !ink) return
    const style = PEN_STYLES[active.pen]
    const points = drawablePoints(active.points)
    if (style.halo !== null) halo.stroke(style.halo)
    halo.points(style.halo !== null ? points : [])
    ink.stroke(style.color)
    ink.points(points)
    ink.getLayer()?.batchDraw()
  }

  const erase = (): void => {
    haloRef.current?.points([])
    inkRef.current?.points([])
    inkRef.current?.getLayer()?.batchDraw()
  }

  /** Olayın sanal koordinattaki yeri; `onStage`: imleç hâlâ sahnenin üstünde mi. */
  const locate = (evt: PointerEvent): { x: number; y: number; onStage: boolean } | null => {
    const layer = inkRef.current?.getLayer()
    const stage = layer?.getStage()
    if (!layer || !stage) return null
    // Sahnenin dışındaki ve birleştirilmiş (coalesced) hareketleri Konva görmez; konum elle bildirilir.
    stage.setPointersPositions(evt)
    const raw = stage.getPointerPosition()
    // Sahne nasıl ölçeklenirse ölçeklensin sanal koordinatı verir.
    const point = layer.getRelativePointerPosition()
    if (!raw || !point) return null
    const onStage = raw.x >= 0 && raw.y >= 0 && raw.x <= stage.width() && raw.y <= stage.height()
    return { x: point.x, y: point.y, onStage }
  }

  /** Noktayı çizgiye ekler; imleç sahnenin üstündeyse true döner. */
  const extend = (active: ActiveStroke, evt: PointerEvent): boolean => {
    const point = locate(evt)
    if (!point) return false
    const { points } = active
    const dx = point.x - points[points.length - 2]
    const dy = point.y - points[points.length - 1]
    if (dx * dx + dy * dy >= MIN_POINT_DISTANCE * MIN_POINT_DISTANCE) points.push(point.x, point.y)
    return point.onStage
  }

  const stopTracking = (): void => {
    stopTrackingRef.current?.()
    stopTrackingRef.current = null
  }

  const finish = (): void => {
    const active = activeRef.current
    if (!active) return
    activeRef.current = null
    stopTracking()
    const stroke: Stroke = { id: nextStrokeId++, pen: active.pen, points: active.points }
    // Geçici çizgi burada silinmez: React yeni çizgiyi çizene kadar ekranda kalır, yoksa bir an kaybolur.
    setStrokes((previous) => [...previous, stroke])
  }

  const begin = (evt: PointerEvent, withPen: Pen): void => {
    // Önceki çizgi bitmeden yeni basış geldiyse (ör. dokunurken fare) önce o kapatılır.
    finish()
    const start = locate(evt)
    if (!start) return
    const active: ActiveStroke = { pointerId: evt.pointerId, pen: withPen, points: [start.x, start.y] }
    activeRef.current = active
    paint(active)

    const onMove = (move: PointerEvent): void => {
      if (move.pointerId !== active.pointerId) return
      // Tuş pencerenin dışında bırakıldıysa pointerup hiç gelmemiş olabilir.
      if (move.pointerType === 'mouse' && (move.buttons & 1) === 0) {
        finish()
        return
      }
      // Hızlı harekette tarayıcı olayları birleştirir; ara noktalar çizgiyi köşeli olmaktan kurtarır.
      const samples = move.getCoalescedEvents()
      let onStage = true
      for (const sample of samples.length > 0 ? samples : [move]) onStage = extend(active, sample)
      paint(active)
      if (!onStage) finish()
    }
    const onUp = (up: PointerEvent): void => {
      if (up.pointerId !== active.pointerId) return
      extend(active, up)
      paint(active)
      finish()
    }
    const onCancel = (cancel: PointerEvent): void => {
      if (cancel.pointerId === active.pointerId) finish()
    }

    // Sahne yerine pencere dinlenir: tuş sahnenin, hatta pencerenin dışında bırakılsa da çizgi kapanır.
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', finish)
    stopTrackingRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', finish)
    }
  }

  const onPointerDown = (event: Konva.KonvaEventObject<PointerEvent>): void => {
    const evt = event.evt
    // İkinci parmak ve sol dışındaki fare tuşları çizmez.
    if (pen === null || !evt.isPrimary || evt.button !== 0) return
    begin(evt, pen)
  }

  // Biten çizgi artık listeden çiziliyor; geçici çizgi aynı karede kaldırılır.
  useLayoutEffect(() => {
    if (activeRef.current === null) erase()
  }, [strokes])

  // Çizerken fareye dönülürse çizgi yarım kalmasın.
  useEffect(() => {
    if (!penActive) finish()
    // `finish` yalnızca ref'lere dokunur; hangi çizimdeki kopyası çağrılırsa çağrılsın aynı işi yapar.
  }, [penActive])

  // Sökülürken (pencere ya da sayaç değişti, oyun ekranı kapandı) yarım çizgi dinleyicileriyle birlikte bırakılır.
  useEffect(
    () => () => {
      stopTracking()
      activeRef.current = null
      erase()
    },
    []
  )

  useEffect(() => {
    if (!penActive) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
      if (event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (activeRef.current !== null) return
      setStrokes((previous) => (previous.length > 0 ? previous.slice(0, -1) : previous))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [penActive])

  return (
    <>
      {/* Dolgusu yok, görünmez; ama Konva isabet alanına çizildiği için oyun alanındaki basışları yakalar. */}
      <HitRect x={area.x} y={area.y} width={area.width} height={area.height} onPointerDown={onPointerDown} />
      {strokes.map((stroke) => (
        <StrokeLines key={stroke.id} stroke={stroke} />
      ))}
      <Line ref={haloRef} {...LINE_PROPS} strokeWidth={HALO_WIDTH} />
      <Line ref={inkRef} {...LINE_PROPS} strokeWidth={STROKE_WIDTH} />
    </>
  )
}

interface DrawingStore {
  /** Çizimlerin en son temizlendiği sayaç değeri. */
  nonce: number
  byScene: Record<string, Stroke[]>
}

const NO_STROKES: Stroke[] = []
/** Hiç pencere yokken çizilenlerin tutulduğu anahtar. */
const NO_SCENE = '(pencere yok)'

/**
 * Kalem çizimleri: GameScreen'deki `<Stage>` içinde en üst katman.
 * `tool`: seçili araç (kalem seçiliyken çizilir). `area`: çizilebilen oyun alanı (sanal koordinat).
 * `sceneId`: çizimler pencereye aittir; başka pencereye geçince gizlenir, geri dönünce yeniden görünür.
 * `nonce`: her değişiminde o an açık olan pencerenin çizimleri silinir ("Çizimi temizle").
 * Araç değişimi çizimleri silmez: çizdikten sonra fareye geçip görsel taşınabilir.
 * Çizimler hiçbir duruma girmez; yalnızca bu pencerenin belleğinde yaşar ve oyun bitince kaybolur.
 */
export function DrawingLayer(props: { tool: Tool; nonce: number; area: Rect; sceneId: ID | null }): JSX.Element | null {
  const { tool, nonce, area } = props
  const sceneKey = props.sceneId ?? NO_SCENE
  const pen = tool === 'mouse' ? null : tool
  const penActive = pen !== null
  const layerRef = useRef<Konva.Layer>(null)

  const [store, setStore] = useState<DrawingStore>(() => ({ nonce, byScene: {} }))
  let current = store
  if (store.nonce !== nonce) {
    // Sayaç arttı: yalnızca o an açık olan pencerenin çizimleri silinir. Çizim sırasında düzeltme
    // (etki beklemeden) yapılır ki silinen çizgiler bir kare bile görünmesin.
    const { [sceneKey]: _cleared, ...rest } = store.byScene
    current = { nonce, byScene: rest }
    setStore(current)
  }
  const strokes = current.byScene[sceneKey] ?? NO_STROKES

  const setStrokes = useCallback(
    (update: (previous: Stroke[]) => Stroke[]): void => {
      setStore((previous) => {
        const before = previous.byScene[sceneKey] ?? NO_STROKES
        const after = update(before)
        return after === before ? previous : { ...previous, byScene: { ...previous.byScene, [sceneKey]: after } }
      })
    },
    [sceneKey]
  )

  useEffect(() => {
    if (!penActive) return
    const container = layerRef.current?.getStage()?.container()
    if (!container) return
    const previous = { cursor: container.style.cursor, touchAction: container.style.touchAction }
    container.style.cursor = PEN_CURSOR
    // Parmak ya da tablet kalemiyle çizerken tarayıcı hareketi kaydırma sayıp çizgiyi yarıda kesmesin.
    container.style.touchAction = 'none'
    return () => {
      container.style.cursor = previous.cursor
      container.style.touchAction = previous.touchAction
    }
  }, [penActive])

  // Katman her zaman çizilir (çizgiler araç değişince kaybolmasın); fare seçiliyken yalnızca olayları
  // dinlemez, böylece alttaki görseller seçilip taşınabilir. Kırpma portre sütununu korur.
  return (
    <Layer
      ref={layerRef}
      listening={penActive}
      clipX={area.x}
      clipY={area.y}
      clipWidth={area.width}
      clipHeight={area.height}
    >
      <DrawingSurface key={`${sceneKey}:${nonce}`} pen={pen} area={area} strokes={strokes} setStrokes={setStrokes} />
    </Layer>
  )
}
