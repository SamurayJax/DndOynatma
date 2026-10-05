import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type Konva from 'konva'
import { Group, Layer, Stage, Transformer } from 'react-konva'
import { activeScene, findImage } from '@shared/layout'
import type { Rect } from '@shared/layout'
import { MIN_ITEM_SIZE } from '@shared/types'
import type { ID } from '@shared/types'
import { dispatch, useApp, useSession } from '@renderer/lib/useAppState'
import { ErrorBoundary } from '@renderer/ui'
import { DrawingLayer } from './DrawingLayer'
import { isInside, quarterTurn } from './itemGeometry'
import { ITEM_NODE_NAME, StageItemNode } from './StageItemNode'
import { stagePalette } from './stageTheme'
import type { FitScale } from './useFitScale'

interface Selection {
  sceneId: ID
  itemId: ID
}

type HitKind = 'empty' | 'item' | 'background' | 'other'

interface Hit {
  kind: HitKind
  itemId: ID | null
}

interface Press {
  kind: HitKind
  /** Basışın penceredeki yeri (ekran pikseli). */
  x: number
  y: number
  /** Basış bir sürüklemeye dönüştü. */
  moved: boolean
}

type BoundBoxFunc = NonNullable<Konva.TransformerConfig['boundBoxFunc']>

const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
/** Döndürme tutamacı bu açılara yaklaşınca yapışır; ters ya da yan duran görsel tam düzelir. */
const ROTATION_SNAPS = [0, 90, 180, 270]
const ROTATION_SNAP_TOLERANCE = 8
/** Basıp bırakma arasında fare bundan çok kaydıysa (ekran pikseli) çift tıklamanın parçası sayılmaz. */
const CLICK_SLOP = 4
/** Çift tıklama: iki tıklama arasındaki en uzun süre (ms) ve en büyük kayma (ekran pikseli). */
const DOUBLE_CLICK_MS = 400
const DOUBLE_CLICK_SLOP = 6

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

/**
 * Ekranın piksel oranı. Pencere farklı ölçekli bir monitöre taşınınca ya da Windows'ta ölçek değişince değişir.
 */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1)
  useEffect(() => {
    // Sorgu yalnızca o anki oran için doğrudur; oran değişince tetiklenir ve yenisiyle baştan kurulur.
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`)
    const update = (): void => setRatio(window.devicePixelRatio || 1)
    query.addEventListener('change', update)
    // Sorgu kurulana kadar değişmiş olabilir.
    update()
    return () => query.removeEventListener('change', update)
  }, [ratio])
  return ratio
}

export interface PlayStageProps {
  fit: FitScale
  /** Oyun alanı (sanal koordinat); nesne kimliği sabit olmalı. */
  area: Rect
}

/**
 * Konva sahnesi: etkin pencerenin arka planı ve görselleri, seçim çerçevesi ve en üstte çizim katmanı.
 * Seçim yalnızca bu pencerede yaşar; duruma girmez.
 */
export function PlayStage({ fit, area }: PlayStageProps): JSX.Element {
  const app = useApp()
  const session = useSession()
  const scene = activeScene(app)
  const mouseMode = session.tool === 'mouse'
  const palette = stagePalette()

  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodes = useRef(new Map<ID, Konva.Group>())
  /** Son basışın nereye yapıldığı; tıklama ancak aynı yerde ve sürüklemeden bittiyse seçimi kaldırır. */
  const press = useRef<Press>({ kind: 'other', x: 0, y: 0, moved: false })
  /** Boşluğa yapılan son tıklama; ikincisi yeterince yakın ve çabuksa çift tıklamadır. */
  const lastEmptyClick = useRef<{ time: number; x: number; y: number } | null>(null)
  /** Arka planın çift tıklamayla seçildiği an (olay zaman damgası). */
  const backgroundPickedAt = useRef(Number.NEGATIVE_INFINITY)
  const [selection, setSelection] = useState<Selection | null>(null)

  const sceneId = scene?.id ?? null
  const background = scene?.background ?? null
  const backgroundId = background?.id ?? null
  // Tuş dinleyicisi her durum değişiminde yeniden kurulmasın diye güncel pencere buradan okunur.
  const sceneRef = useRef(scene)
  sceneRef.current = scene

  // Seçim ancak fare aracında, etkin pencerede ve öğe hâlâ duruyorsa geçerlidir.
  let selectedId: ID | null = null
  if (mouseMode && scene !== undefined && selection !== null && selection.sceneId === scene.id) {
    const exists = selection.itemId === backgroundId || scene.items.some((item) => item.id === selection.itemId)
    if (exists) selectedId = selection.itemId
  }
  const backgroundSelected = selectedId !== null && selectedId === backgroundId

  useEffect(() => {
    // Geçersiz kalan seçim tamamen unutulur; fareye ya da eski pencereye dönünce geri gelmesin.
    if (selection !== null && selectedId === null) setSelection(null)
  }, [selection, selectedId])

  useLayoutEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const node = selectedId !== null ? nodes.current.get(selectedId) : undefined
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedId])

  const pixelRatio = useDevicePixelRatio()
  useLayoutEffect(() => {
    // Konva piksel oranını ilk tuvali açarken bir kez okur. Oran sonradan büyürse tuval eski çözünürlükte
    // kalıp CSS ile büyütülür ve oyun ekranı bulanık görünür; katmanların tuvalleri yeni orana geçirilir.
    const stage = stageRef.current
    if (!stage) return
    for (const layer of stage.getLayers()) {
      const canvas = layer.getCanvas()
      if (canvas.getPixelRatio() === pixelRatio) continue
      canvas.setPixelRatio(pixelRatio)
      layer.batchDraw()
    }
  }, [pixelRatio])

  const registerNode = useCallback((itemId: ID, node: Konva.Group | null): void => {
    if (node) nodes.current.set(itemId, node)
    else nodes.current.delete(itemId)
  }, [])

  const refreshTransformer = useCallback((itemId: ID): void => {
    const transformer = transformerRef.current
    const node = nodes.current.get(itemId)
    // Çerçeve grubun içindeki görselin boyut değişimini kendiliğinden fark etmez.
    if (transformer && node && transformer.nodes().includes(node)) transformer.forceUpdate()
  }, [])

  // Seçim çerçevesi ekran pikseliyle çalışır; sanal alt sınır pencere ölçeğine çevrilir.
  const boundBox = useCallback<BoundBoxFunc>(
    (oldBox, newBox) => {
      const min = MIN_ITEM_SIZE * fit.scale
      return newBox.width < min || newBox.height < min ? oldBox : newBox
    },
    [fit.scale]
  )

  useEffect(() => {
    if (selectedId === null || sceneId === null) return
    const itemId = selectedId

    const reorder = (to: 'front' | 'back' | 'forward' | 'backward'): void => {
      // Arka plan her zaman en alttadır.
      if (!backgroundSelected) dispatch({ type: 'stage/reorderItem', sceneId, itemId, to })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      // Köşeli ayraçlar Türkçe klavyede AltGr ile yazılır; değiştirici tuşlara bakılmaz.
      switch (event.key) {
        case 'Escape':
          setSelection(null)
          break
        case 'Delete':
        case 'Backspace':
          if (event.repeat) return
          dispatch(backgroundSelected ? { type: 'stage/clearBackground', sceneId } : { type: 'stage/removeItem', sceneId, itemId })
          break
        case 'PageUp':
        case ']':
          reorder('forward')
          break
        case 'PageDown':
        case '[':
          reorder('backward')
          break
        case 'Home':
          reorder('front')
          break
        case 'End':
          reorder('back')
          break
        case 'r':
        case 'R': {
          // R: saat yönünde çeyrek tur, Shift+R: ters yönde. Ctrl+R gibi birleşimlere dokunulmaz.
          if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
          const current = sceneRef.current
          const target = backgroundSelected ? current?.background : current?.items.find((item) => item.id === itemId)
          if (!target) return
          dispatch({
            type: 'stage/updateItem',
            sceneId,
            itemId,
            patch: { rotation: quarterTurn(target.rotation, event.shiftKey ? -1 : 1) }
          })
          break
        }
        default:
          return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, sceneId, backgroundSelected])

  useEffect(() => {
    if (!mouseMode && wrapRef.current) wrapRef.current.style.cursor = ''
  }, [mouseMode])

  const classify = (target: Konva.Node): Hit => {
    if (target === target.getStage()) return { kind: 'empty', itemId: null }
    const holder: Konva.Node | undefined = target.findAncestor(`.${ITEM_NODE_NAME}`, true)
    if (!holder) return { kind: 'other', itemId: null }
    const itemId = holder.id()
    return { kind: itemId === backgroundId ? 'background' : 'item', itemId }
  }

  const handleMouseDown = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    const { button, clientX, clientY } = event.evt
    if (!mouseMode || button !== 0) {
      press.current = { kind: 'other', x: clientX, y: clientY, moved: false }
      return
    }
    const hit = classify(event.target)
    press.current = { kind: hit.kind, x: clientX, y: clientY, moved: false }
    if (hit.kind === 'item' && hit.itemId !== null && sceneId !== null) {
      setSelection({ sceneId, itemId: hit.itemId })
    }
  }

  const handleDragStart = (): void => {
    press.current.moved = true
  }

  const isPointerInArea = (target: Konva.Node): boolean => {
    const point = target.getStage()?.getRelativePointerPosition()
    return point !== null && point !== undefined && isInside(point, area)
  }

  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    const { button, clientX, clientY, timeStamp } = event.evt
    const pressed = press.current
    if (!mouseMode || button !== 0 || pressed.moved) return
    // Çift tıklamanın ardından gelen fazladan tıklama arka planı hemen bırakmasın.
    if (timeStamp - backgroundPickedAt.current <= DOUBLE_CLICK_MS) return

    const hit = classify(event.target)
    const steady = Math.hypot(clientX - pressed.x, clientY - pressed.y) <= CLICK_SLOP

    if (pressed.kind === 'empty' && hit.kind === 'empty') {
      // Konva'nın kendi çift tıklaması kullanılmaz: boşlukta fareyi gezdirip bırakmayı da tıklama sayıyor
      // ve iki tıklamanın aynı yerde olmasına bakmıyor; arka plan yanlışlıkla seçiliyordu.
      const previous = lastEmptyClick.current
      const isDouble =
        steady &&
        previous !== null &&
        timeStamp - previous.time <= DOUBLE_CLICK_MS &&
        Math.hypot(clientX - previous.x, clientY - previous.y) <= DOUBLE_CLICK_SLOP
      lastEmptyClick.current = steady && !isDouble ? { time: timeStamp, x: clientX, y: clientY } : null
      if (isDouble && sceneId !== null && backgroundId !== null && isPointerInArea(event.target)) {
        backgroundPickedAt.current = timeStamp
        setSelection({ sceneId, itemId: backgroundId })
      } else {
        setSelection(null)
      }
      return
    }

    lastEmptyClick.current = null
    // Seçili arka plana sürüklemeden tıklamak da "boşluğa tıklamak" sayılır; yoksa seçimden çıkılamazdı.
    if (pressed.kind === 'background' && hit.kind === 'background' && steady) setSelection(null)
  }

  const handleMouseMove = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    const wrap = wrapRef.current
    if (!wrap) return
    // İmleç sarmalayıcıda tutulur; kalem katmanı ve seçim çerçevesi kendi imlecini sahnenin içinde ayarlar.
    const kind = mouseMode ? classify(event.target).kind : 'other'
    const cursor = kind === 'item' || kind === 'background' ? 'move' : ''
    if (wrap.style.cursor !== cursor) wrap.style.cursor = cursor
  }

  const handleMouseLeave = (): void => {
    if (wrapRef.current) wrapRef.current.style.cursor = ''
  }

  return (
    <div className="game-stage" ref={wrapRef}>
      {/* Sahne Konva'nın kendi ölçeğiyle büyür: tuval gerçek çözünürlükte çizilir, görseller bulanmaz. */}
      <Stage
        ref={stageRef}
        width={fit.width}
        height={fit.height}
        scaleX={fit.scale}
        scaleY={fit.scale}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDragStart={handleDragStart}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <Layer listening={mouseMode}>
          <Group clipX={area.x} clipY={area.y} clipWidth={area.width} clipHeight={area.height}>
            {scene !== undefined && background !== null && (
              <StageItemNode
                key={background.id}
                item={background}
                image={findImage(app, background.imageId)}
                sceneId={scene.id}
                area={area}
                interactive={mouseMode && backgroundSelected}
                registerNode={registerNode}
                onBoxApplied={refreshTransformer}
              />
            )}
            {scene?.items.map((item) => (
              <StageItemNode
                key={item.id}
                item={item}
                image={findImage(app, item.imageId)}
                sceneId={scene.id}
                area={area}
                interactive={mouseMode}
                registerNode={registerNode}
                onBoxApplied={refreshTransformer}
              />
            ))}
          </Group>
          <Transformer
            ref={transformerRef}
            visible={selectedId !== null}
            keepRatio
            rotateEnabled
            rotationSnaps={ROTATION_SNAPS}
            rotationSnapTolerance={ROTATION_SNAP_TOLERANCE}
            rotateAnchorOffset={36}
            flipEnabled={false}
            ignoreStroke
            enabledAnchors={CORNER_ANCHORS}
            boundBoxFunc={boundBox}
            anchorSize={13}
            anchorCornerRadius={3}
            anchorFill={palette.bgDeep}
            anchorStroke={palette.accent}
            anchorStrokeWidth={2}
            borderStroke={palette.accent}
            borderStrokeWidth={2}
          />
        </Layer>
        {/* Çizim katmanındaki bir hata oyun ekranının tamamını düşürmesin. */}
        <ErrorBoundary scope="çizim" fallback={null}>
          <DrawingLayer tool={session.tool} nonce={session.drawingNonce} area={area} sceneId={sceneId} />
        </ErrorBoundary>
      </Stage>
    </div>
  )
}
