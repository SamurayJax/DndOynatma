import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type Konva from 'konva'
import { Layer, Line, Rect as HitRect, Text } from 'react-konva'
import type { Rect } from '@shared/layout'
import { ERASER_WIDTH_FACTOR, PEN_COLOR_INFO, PEN_WIDTH_PX } from '@shared/types'
import type { ID, PenColor, PenWidth, Tool } from '@shared/types'
import { constrainEnd, isShapeTool, isTooSmall, shapePoints } from './drawShapes'
import type { Point } from './drawShapes'
import { stagePalette } from './stageTheme'

/** Oyun alanına basılınca iz bırakan araçlar; metin ayrı yoldan gelir (bkz. `DrawingApi`). */
type DrawTool = Exclude<Tool, 'mouse' | 'text'>

interface Stroke {
  id: number
  /** Çizgi, çizildiği aracı, rengi ve kalınlığı korur. */
  tool: DrawTool
  color: PenColor
  width: number
  /** Düz dizi [x1, y1, x2, y2, …], sanal koordinat. */
  points: number[]
}

/** Oyun alanına yazılmış metin. */
interface TextMark {
  id: number
  tool: 'text'
  color: PenColor
  x: number
  y: number
  text: string
  fontSize: number
}

type Mark = Stroke | TextMark

interface ActiveStroke {
  pointerId: number
  tool: DrawTool
  color: PenColor
  width: number
  points: number[]
  /** Şekil araçlarında sürüklemenin başı ve o anki ucu; kalem ve silgide null. */
  start: Point | null
  end: Point | null
}

/** PlayStage'in tuval dışındaki yazı kutusundan metni katmana vermesi için. */
export interface DrawingApi {
  addText: (sceneKey: string, x: number, y: number, text: string, color: PenColor, fontSize: number) => void
}

/** Halenin çizgiden her iki yana taşan toplam genişliği. */
const HALO_EXTRA = 5
/** Bir önceki noktaya bundan yakın olan nokta eklenmez (sanal piksel). */
const MIN_POINT_DISTANCE = 1.5
const PEN_CURSOR = 'crosshair'
const TEXT_CURSOR = 'text'
/** Metnin zeminde kaybolmaması için çevresine çizilen şeridin kalınlığı. */
const TEXT_OUTLINE = 4
/**
 * Silgi, kendinden önce çizilmiş her şeyi geçtiği yerde saydamlaştırır. Çizimler ayrı bir katmanda
 * olduğu için alttaki görseller etkilenmez.
 */
const ERASE_OPERATION = 'destination-out'
const DRAW_OPERATION = 'source-over'

function widthFor(tool: Exclude<Tool, 'mouse'>, penWidth: PenWidth): number {
  const base = PEN_WIDTH_PX[penWidth]
  return tool === 'eraser' ? base * ERASER_WIDTH_FACTOR : base
}

/** Silginin ekrandaki çapını gösteren daire imleç; çok küçük ya da büyükse tarayıcı sınırlarına çekilir. */
function eraserCursor(diameter: number): string {
  const size = Math.round(Math.min(Math.max(diameter, 8), 120))
  const half = size / 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${half}" cy="${half}" r="${half - 1.5}" fill="none" stroke="black" stroke-width="3"/>` +
    `<circle cx="${half}" cy="${half}" r="${half - 1.5}" fill="none" stroke="white" stroke-width="1.5"/>` +
    '</svg>'
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${half} ${half}, ${PEN_CURSOR}`
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
  // Şekillerin köşeleri keskin kalır; yumuşatma yalnızca serbest çizim içindir.
  if (shape.getAttr('straight') === true) {
    for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1])
    context.strokeShape(shape)
    return
  }
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

const MarkText = memo(function MarkText({ mark }: { mark: TextMark }): JSX.Element {
  const style = PEN_COLOR_INFO[mark.color]
  return (
    <Text
      x={mark.x}
      y={mark.y}
      text={mark.text}
      fontSize={mark.fontSize}
      fontStyle="600"
      fontFamily={stagePalette().fontBody}
      fill={style.value}
      stroke={style.halo ?? 'rgba(0, 0, 0, 0.55)'}
      strokeWidth={TEXT_OUTLINE}
      fillAfterStrokeEnabled
      wrap="none"
      listening={false}
    />
  )
})

const StrokeLines = memo(function StrokeLines({ stroke }: { stroke: Stroke }): JSX.Element {
  const points = drawablePoints(stroke.points)
  const straight = isShapeTool(stroke.tool)
  if (stroke.tool === 'eraser') {
    return <Line {...LINE_PROPS} points={points} stroke="#000" strokeWidth={stroke.width} globalCompositeOperation={ERASE_OPERATION} />
  }
  const style = PEN_COLOR_INFO[stroke.color]
  return (
    <>
      {style.halo !== null && <Line {...LINE_PROPS} straight={straight} points={points} stroke={style.halo} strokeWidth={stroke.width + HALO_EXTRA} />}
      <Line {...LINE_PROPS} straight={straight} points={points} stroke={style.value} strokeWidth={stroke.width} />
    </>
  )
})

/** Çizgi kimlikleri pencereler ve yeniden kurulumlar arasında çakışmasın diye tek sayaçtan verilir. */
let nextStrokeId = 1

interface DrawingSurfaceProps {
  /** Seçili çizim aracı; fare seçiliyken null. */
  tool: Exclude<Tool, 'mouse'> | null
  color: PenColor
  /** Seçili aracın o anki kalınlığı (sanal piksel). */
  width: number
  area: Rect
  /** Bu pencerenin bitmiş çizgileri; katmanda tutulur ki pencere değişip geri gelince dursunlar. */
  strokes: Mark[]
  setStrokes: (update: (previous: Mark[]) => Mark[]) => void
  /** Metin aracıyla oyun alanına tıklandı (sanal koordinat). */
  onTextPoint: (x: number, y: number) => void
}

/**
 * Bir pencerenin çizgilerini çizer ve yenilerini toplar. Katman bunu pencere ve sayaçla anahtarlar:
 * pencere ya da sayaç değişince baştan kurulur, yarım kalan çizgi bırakılır.
 */
function DrawingSurface({ tool, color, width, area, strokes, setStrokes, onTextPoint }: DrawingSurfaceProps): JSX.Element {
  // Çizilmekte olan çizgi React durumuna girmez; bu iki Konva çizgisi doğrudan güncellenir.
  const haloRef = useRef<Konva.Line>(null)
  const inkRef = useRef<Konva.Line>(null)
  const activeRef = useRef<ActiveStroke | null>(null)
  const stopTrackingRef = useRef<(() => void) | null>(null)
  const penActive = tool !== null

  const paint = (active: ActiveStroke): void => {
    const halo = haloRef.current
    const ink = inkRef.current
    if (!halo || !ink) return
    const points = drawablePoints(active.points)
    const straight = isShapeTool(active.tool)
    ink.setAttr('straight', straight)
    halo.setAttr('straight', straight)
    ink.strokeWidth(active.width)
    if (active.tool === 'eraser') {
      halo.points([])
      ink.globalCompositeOperation(ERASE_OPERATION)
      ink.stroke('#000')
    } else {
      const style = PEN_COLOR_INFO[active.color]
      halo.strokeWidth(active.width + HALO_EXTRA)
      if (style.halo !== null) halo.stroke(style.halo)
      halo.points(style.halo !== null ? points : [])
      ink.globalCompositeOperation(DRAW_OPERATION)
      ink.stroke(style.value)
    }
    ink.points(points)
    ink.getLayer()?.batchDraw()
  }

  const erase = (): void => {
    haloRef.current?.points([])
    inkRef.current?.points([])
    inkRef.current?.getLayer()?.batchDraw()
  }

  /** Olayın sanal koordinattaki yeri; `onStage`: imleç hâlâ sahnenin üstünde mi. */
  const locate = (evt: MouseEvent): { x: number; y: number; onStage: boolean } | null => {
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

  // Yazı kutusu basışta değil tıklama bitince açılır: basış sırasında tarayıcı odağı tuvale geri alır,
  // kutu açılır açılmaz kapanırdı. Açık kutu da aynı basışta odağını kaybedip kendini bırakmış olur.
  const onHitClick = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    if (tool !== 'text' || event.evt.button !== 0) return
    const point = locate(event.evt)
    if (point) onTextPoint(point.x, point.y)
  }

  /** Noktayı çizgiye ekler; imleç sahnenin üstündeyse true döner. */
  const extend = (active: ActiveStroke, evt: PointerEvent): boolean => {
    const point = locate(evt)
    if (!point) return false
    if (active.start !== null && isShapeTool(active.tool)) {
      const end = evt.shiftKey ? constrainEnd(active.tool, active.start, point) : { x: point.x, y: point.y }
      active.end = end
      active.points = shapePoints(active.tool, active.start, end, active.width)
      // Şekil, imleç sahneden çıksa da bırakılana kadar sürer; dışında kalan kısmı kırpılır.
      return true
    }
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
    if (active.start !== null && (active.end === null || isTooSmall(active.start, active.end))) {
      erase()
      return
    }
    const stroke: Stroke = { id: nextStrokeId++, tool: active.tool, color: active.color, width: active.width, points: active.points }
    // Geçici çizgi burada silinmez: React yeni çizgiyi çizene kadar ekranda kalır, yoksa bir an kaybolur.
    setStrokes((previous) => [...previous, stroke])
  }

  const begin = (evt: PointerEvent, withTool: DrawTool): void => {
    // Önceki çizgi bitmeden yeni basış geldiyse (ör. dokunurken fare) önce o kapatılır.
    finish()
    const start = locate(evt)
    if (!start) return
    const shape = isShapeTool(withTool)
    const active: ActiveStroke = {
      pointerId: evt.pointerId,
      tool: withTool,
      color,
      width,
      points: shape ? [] : [start.x, start.y],
      start: shape ? { x: start.x, y: start.y } : null,
      end: null
    }
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
    if (tool === null || tool === 'text' || !evt.isPrimary || evt.button !== 0) return
    begin(evt, tool)
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
      // Yazı kutusunda Ctrl+Z yazıyı geri alır, çizimi değil.
      if (event.target instanceof HTMLInputElement) return
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
      <HitRect x={area.x} y={area.y} width={area.width} height={area.height} onPointerDown={onPointerDown} onClick={onHitClick} />
      {strokes.map((mark) => (mark.tool === 'text' ? <MarkText key={mark.id} mark={mark} /> : <StrokeLines key={mark.id} stroke={mark} />))}
      <Line ref={haloRef} {...LINE_PROPS} />
      <Line ref={inkRef} {...LINE_PROPS} />
    </>
  )
}

interface DrawingStore {
  /** Çizimlerin en son temizlendiği sayaç değeri. */
  nonce: number
  byScene: Record<string, Mark[]>
}

const NO_STROKES: Mark[] = []
/** Hiç pencere yokken çizilenlerin tutulduğu anahtar. */
export const NO_SCENE = '(pencere yok)'

/**
 * Kalem çizimleri: GameScreen'deki `<Stage>` içinde en üst katman.
 * `tool`: seçili araç (kalem seçiliyken çizilir). `area`: çizilebilen oyun alanı (sanal koordinat).
 * `sceneId`: çizimler pencereye aittir; başka pencereye geçince gizlenir, geri dönünce yeniden görünür.
 * `nonce`: her değişiminde o an açık olan pencerenin çizimleri silinir ("Çizimi temizle").
 * `penColor`, `penWidth`: kalemin rengi, kalemin ve silginin kalınlığı; çizilmiş çizgiler kendininkini korur.
 * `undoNonce`: her değişiminde açık pencerenin son çizgisi geri alınır (araç panelindeki düğme).
 * Araç değişimi çizimleri silmez: çizdikten sonra fareye geçip görsel taşınabilir.
 * Çizimler hiçbir duruma girmez; yalnızca bu pencerenin belleğinde yaşar ve oyun bitince kaybolur.
 */
export function DrawingLayer(props: {
  tool: Tool
  penColor: PenColor
  penWidth: PenWidth
  nonce: number
  undoNonce: number
  area: Rect
  sceneId: ID | null
  onTextPoint: (x: number, y: number) => void
  /** PlayStage'in metin eklemek için tuttuğu bağlantı. */
  apiRef: { current: DrawingApi | null }
}): JSX.Element | null {
  const { tool, penColor, penWidth, nonce, undoNonce, area, onTextPoint, apiRef } = props
  const sceneKey = props.sceneId ?? NO_SCENE
  const drawTool = tool === 'mouse' ? null : tool
  const penActive = drawTool !== null
  const width = drawTool === null ? 0 : widthFor(drawTool, penWidth)
  const layerRef = useRef<Konva.Layer>(null)
  // Silgi imleci ekrandaki gerçek çapı gösterir; pencere boyutu değişince ölçek de değişir.
  const stageScale = layerRef.current?.getStage()?.scaleX() ?? 1
  const cursor = drawTool === 'eraser' ? eraserCursor(width * stageScale) : drawTool === 'text' ? TEXT_CURSOR : PEN_CURSOR

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
    (update: (previous: Mark[]) => Mark[]): void => {
      setStore((previous) => {
        const before = previous.byScene[sceneKey] ?? NO_STROKES
        const after = update(before)
        return after === before ? previous : { ...previous, byScene: { ...previous.byScene, [sceneKey]: after } }
      })
    },
    [sceneKey]
  )

  useEffect(() => {
    apiRef.current = {
      addText: (key, x, y, text, color, fontSize) => {
        const mark: TextMark = { id: nextStrokeId++, tool: 'text', color, x, y, text, fontSize }
        setStore((previous) => ({ ...previous, byScene: { ...previous.byScene, [key]: [...(previous.byScene[key] ?? NO_STROKES), mark] } }))
      }
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef])

  const lastUndo = useRef(undoNonce)
  useEffect(() => {
    if (lastUndo.current === undoNonce) return
    lastUndo.current = undoNonce
    setStrokes((previous) => (previous.length > 0 ? previous.slice(0, -1) : previous))
  }, [undoNonce, setStrokes])

  useEffect(() => {
    if (!penActive) return
    const container = layerRef.current?.getStage()?.container()
    if (!container) return
    const previous = { cursor: container.style.cursor, touchAction: container.style.touchAction }
    container.style.cursor = cursor
    // Parmak ya da tablet kalemiyle çizerken tarayıcı hareketi kaydırma sayıp çizgiyi yarıda kesmesin.
    container.style.touchAction = 'none'
    return () => {
      container.style.cursor = previous.cursor
      container.style.touchAction = previous.touchAction
    }
  }, [penActive, cursor])

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
      <DrawingSurface key={`${sceneKey}:${nonce}`} tool={drawTool} color={penColor} width={width} area={area} strokes={strokes} setStrokes={setStrokes} onTextPoint={onTextPoint} />
    </Layer>
  )
}
