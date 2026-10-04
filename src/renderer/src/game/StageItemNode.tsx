import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage, Rect, Text } from 'react-konva'
import type { Rect as Area } from '@shared/layout'
import type { ID, LibraryImage, StageItem } from '@shared/types'
import { imageUrl } from '@renderer/lib/media'
import { dispatch } from '@renderer/lib/useAppState'
import { clampPosition, referenceSize, sameBox, settleBox } from './itemGeometry'
import type { Box } from './itemGeometry'
import { stagePalette, withAlpha } from './stageTheme'
import { useStageImage } from './useStageImage'

/** Sahnedeki her görselin tutulan (sürüklenen, boyutlandırılan) düğümü bu adı taşır; kimliği öğeninkidir. */
export const ITEM_NODE_NAME = 'game-item'

const LABEL_FONT_SIZE = 27
const LABEL_PAD_X = 18
const LABEL_PAD_Y = 8
/** Etiket ile görselin alt kenarı arasındaki boşluk. */
const LABEL_GAP = 10
/** Etiketin oyun alanı kenarına en fazla ne kadar yaklaşabileceği. */
const LABEL_MARGIN = 8
/** Gönderilen değişiklik bu sürede duruma yansımadıysa (reddedildiyse) geçici kutu bırakılır. */
const PENDING_TIMEOUT_MS = 1500

export interface StageItemNodeProps {
  item: StageItem
  image: LibraryImage | undefined
  sceneId: ID
  /** Oyun alanı (sanal koordinat). Nesne kimliği sabit olmalı; yoksa her çizimde yeniden çizilir. */
  area: Area
  /** Fareyle tutulabilir mi. Kalem seçiliyken ve seçili olmayan arka planda `false`. */
  interactive: boolean
  registerNode: (itemId: ID, node: Konva.Group | null) => void
  /** Kutunun yeri ya da boyutu tuvale işlendi; seçim çerçevesi yenilenmeli. */
  onBoxApplied: (itemId: ID) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Kütüphane kaydı ya da dosyası olmayan görselin yerine çizilen kutu. */
function MissingImage({ width, height }: { width: number; height: number }): JSX.Element {
  const palette = stagePalette()
  return (
    <>
      <Rect
        width={width}
        height={height}
        cornerRadius={Math.min(10, width / 8, height / 8)}
        fill={withAlpha(palette.bgControl, 0.92)}
        stroke={palette.borderStrong}
        strokeWidth={2}
        dash={[10, 8]}
      />
      <Text
        width={width}
        height={height}
        padding={6}
        align="center"
        verticalAlign="middle"
        text="görsel bulunamadı"
        fontFamily={palette.fontBody}
        fontSize={clamp(Math.min(width / 9, height / 3), 12, 30)}
        fill={palette.textMuted}
        listening={false}
      />
    </>
  )
}

/**
 * Oyun alanındaki tek bir görsel (arka plan da aynı bileşenle çizilir) ve altındaki etiketi.
 * Sürükleme ve boyutlandırma Konva düğümü üzerinde yapılır; bırakıldığında tek bir işlem gönderilir.
 */
export const StageItemNode = memo(function StageItemNode({
  item,
  image,
  sceneId,
  area,
  interactive,
  registerNode,
  onBoxApplied
}: StageItemNodeProps): JSX.Element {
  const bodyRef = useRef<Konva.Group>(null)
  const labelRef = useRef<Konva.Group>(null)
  const pillRef = useRef<Konva.Rect>(null)
  const textRef = useRef<Konva.Text>(null)
  // Durum IPC ile sonradan gelir; o gelene kadar bırakılan yer burada tutulur ki görsel eski yerine sıçramasın.
  const [pending, setPending] = useState<Box | null>(null)
  const [picture, status] = useStageImage(imageUrl(image))

  const palette = stagePalette()
  const box: Box = pending ?? item
  const label = item.label.trim()
  const itemId = item.id

  useEffect(() => {
    if (pending === null) return
    if (sameBox(pending, item)) {
      setPending(null)
      return
    }
    const timer = window.setTimeout(() => setPending(null), PENDING_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [pending, item])

  useLayoutEffect(() => {
    registerNode(itemId, bodyRef.current)
    return () => registerNode(itemId, null)
  }, [itemId, registerNode])

  /** Etiketi verilen kutunun altına ortalar; oyun alanının dışına taşırmaz. */
  const layoutLabel = useCallback(
    (current: Box): void => {
      const group = labelRef.current
      const pill = pillRef.current
      const text = textRef.current
      if (!group || !pill || !text) return
      const width = text.width() + LABEL_PAD_X * 2
      const height = text.height() + LABEL_PAD_Y * 2
      pill.size({ width, height })
      pill.cornerRadius(height / 2)
      text.position({ x: LABEL_PAD_X, y: LABEL_PAD_Y })
      const minX = area.x + LABEL_MARGIN
      const maxX = Math.max(minX, area.x + area.width - width - LABEL_MARGIN)
      const minY = area.y + LABEL_MARGIN
      const maxY = Math.max(minY, area.y + area.height - height - LABEL_MARGIN)
      group.position({
        x: clamp(current.x + current.width / 2 - width / 2, minX, maxX),
        y: clamp(current.y + current.height + LABEL_GAP, minY, maxY)
      })
    },
    [area]
  )

  const { x, y, width, height } = box
  useLayoutEffect(() => {
    const node = bodyRef.current
    // Görsel sürüklenirken ya da boyutlanırken etiketi başka pencereden değişirse tuvaldeki kutu durumdakinden
    // farklıdır; etiket durumdaki (eski) yere değil, düğümün o anki yerine dizilir.
    const live = node !== null && (node.isDragging() || node.scaleX() !== 1 || node.scaleY() !== 1)
    layoutLabel(
      live ? { x: node.x(), y: node.y(), width: width * Math.abs(node.scaleX()), height: height * Math.abs(node.scaleY()) } : { x, y, width, height }
    )
    onBoxApplied(itemId)
  }, [layoutLabel, onBoxApplied, itemId, x, y, width, height, label, status])

  /** Düğümün o anki (sürüklenirken / boyutlanırken) kutusu. */
  const liveBox = (node: Konva.Group): Box => ({
    x: node.x(),
    y: node.y(),
    width: box.width * Math.abs(node.scaleX()),
    height: box.height * Math.abs(node.scaleY())
  })

  const commit = (next: Box, resized: boolean): void => {
    const node = bodyRef.current
    if (node) {
      // Yeni boyut çocuklara genişlik/yükseklik olarak verilir; ölçek birikmesin.
      node.scale({ x: 1, y: 1 })
      node.position({ x: next.x, y: next.y })
    }
    layoutLabel(next)
    if (sameBox(next, item)) {
      setPending(null)
      onBoxApplied(itemId)
      return
    }
    setPending(next)
    dispatch({
      type: 'stage/updateItem',
      sceneId,
      itemId,
      patch: resized ? { x: next.x, y: next.y, width: next.width } : { x: next.x, y: next.y }
    })
  }

  const handleDragMove = (): void => {
    const node = bodyRef.current
    if (!node) return
    const position = clampPosition(node.x(), node.y(), box.width, box.height, area)
    node.position(position)
    layoutLabel({ ...box, ...position })
  }

  const handleDragEnd = (): void => {
    const node = bodyRef.current
    if (!node) return
    commit({ ...box, ...clampPosition(node.x(), node.y(), box.width, box.height, area) }, false)
  }

  const handleTransform = (): void => {
    const node = bodyRef.current
    if (node) layoutLabel(liveBox(node))
  }

  const handleTransformEnd = (): void => {
    const node = bodyRef.current
    if (!node) return
    const live = liveBox(node)
    commit(settleBox(live.x, live.y, live.width, referenceSize(item, image), area), true)
  }

  return (
    <Group>
      <Group
        ref={bodyRef}
        id={itemId}
        name={ITEM_NODE_NAME}
        x={box.x}
        y={box.y}
        listening={interactive}
        draggable={interactive}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        {picture !== undefined ? (
          <KonvaImage image={picture} width={box.width} height={box.height} />
        ) : status === 'failed' ? (
          <MissingImage width={box.width} height={box.height} />
        ) : (
          // Yüklenirken görünmez; yalnızca seçim çerçevesi doğru boyutu görsün diye durur.
          <Rect width={box.width} height={box.height} />
        )}
      </Group>
      {label !== '' && (
        <Group ref={labelRef} listening={false}>
          <Rect
            ref={pillRef}
            fill={withAlpha(palette.bgDeep, 0.84)}
            stroke={withAlpha(palette.accent, 0.6)}
            strokeWidth={1.5}
            shadowColor="#000"
            shadowBlur={10}
            shadowOpacity={0.55}
            shadowOffsetY={2}
          />
          <Text
            ref={textRef}
            text={label}
            fontFamily={palette.fontBody}
            fontSize={LABEL_FONT_SIZE}
            fontStyle="600"
            fill={palette.text}
            wrap="none"
          />
        </Group>
      )}
    </Group>
  )
})
