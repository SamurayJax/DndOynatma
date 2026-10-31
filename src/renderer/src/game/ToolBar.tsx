import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { PEN_COLORS, PEN_COLOR_INFO, PEN_WIDTHS, usesPenColor } from '@shared/types'
import type { PenWidth, Tool, ToolbarLayout } from '@shared/types'
import { dispatch, useApp, useSession } from '@renderer/lib/useAppState'
import { ChevronLeftIcon, ChevronRightIcon, CursorIcon, DrawArrowIcon, DrawEllipseIcon, DrawLineIcon, DrawRectIcon, DrawTextIcon, EraserIcon, GripIcon, OrientationIcon, PencilIcon, TrashIcon, UndoIcon, cx } from '@renderer/ui'
import type { FitScale } from './useFitScale'

const TOOLS: readonly { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'mouse', label: 'Fare', icon: <CursorIcon size={18} /> },
  { id: 'pen', label: 'Kalem', icon: <PencilIcon size={18} /> },
  { id: 'eraser', label: 'Silgi', icon: <EraserIcon size={18} /> },
  { id: 'line', label: 'Düz çizgi', icon: <DrawLineIcon size={18} /> },
  { id: 'arrow', label: 'Ok', icon: <DrawArrowIcon size={18} /> },
  { id: 'rect', label: 'Dikdörtgen', icon: <DrawRectIcon size={18} /> },
  { id: 'ellipse', label: 'Daire', icon: <DrawEllipseIcon size={18} /> },
  { id: 'text', label: 'Metin', icon: <DrawTextIcon size={18} /> }
]

const WIDTH_LABELS: Record<PenWidth, string> = { thin: 'ince', medium: 'orta', thick: 'kalın' }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function update(patch: Partial<ToolbarLayout>): void {
  dispatch({ type: 'toolbar/update', patch })
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

function ToolButton(props: { label: string; active?: boolean; className?: string; onClick: () => void; children: ReactNode }): JSX.Element {
  const { label, active, className, onClick, children } = props
  return (
    <button type="button" className={cx('game-tb__btn', active === true && 'is-active', className)} title={label} aria-label={label} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  )
}

/**
 * Oyun ekranındaki araç paneli: fare, kalem, silgi, şekiller, metin, renk, kalınlık, geri al ve temizle. DM tutamaçtan
 * sürükleyerek taşır, yatay ya da dikey dizer, küçültür; `T` tuşu gizler ve geri açar. Yeri kayda girer.
 * Oyuncular da görür (paylaşılan pencere burası); bu yüzden üstüne gelinmedikçe yarı saydamdır.
 *
 * Boyutu pencere ölçeğine bağlı değildir: 2560'lık monitörde de elle tutulur kalır. Yeri çerçevenin oranı
 * olarak tutulur, pencere küçülünce dışarıda kalmaması için çizerken sınırlanır.
 */
export function ToolBar({ fit }: { fit: FitScale }): JSX.Element | null {
  const layout = useApp().settings.toolbar
  const { tool, penColor, penWidth } = useSession()
  const rootRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  // Sürüklenirken yer yalnızca burada değişir; bırakınca tek işlem gönderilir.
  const [dragged, setDragged] = useState<{ x: number; y: number } | null>(null)
  const grab = useRef<{ pointerId: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return
      if (isTypingTarget(event.target) || event.key.toLocaleLowerCase('tr') !== 't') return
      event.preventDefault()
      update({ hidden: !layout.hidden })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [layout.hidden])

  const { hidden, collapsed, vertical } = layout
  useLayoutEffect(() => {
    const root = rootRef.current
    if (root) setSize({ width: root.offsetWidth, height: root.offsetHeight })
    // Pencere daralınca panel alt satıra geçebilir; ölçü yeniden alınır.
  }, [hidden, collapsed, vertical, fit.width, fit.height])

  if (hidden) return null

  const spot = dragged ?? layout
  const left = clamp(spot.x * fit.width, 0, Math.max(0, fit.width - size.width))
  const top = clamp(spot.y * fit.height, 0, Math.max(0, fit.height - size.height))

  const pointerSpot = (event: ReactPointerEvent<HTMLElement>, held: { dx: number; dy: number }): { x: number; y: number } => {
    const frame = rootRef.current?.parentElement?.getBoundingClientRect()
    if (!frame) return spot
    const maxX = Math.max(0, fit.width - size.width)
    const maxY = Math.max(0, fit.height - size.height)
    return {
      x: clamp(event.clientX - frame.left - held.dx, 0, maxX) / fit.width,
      y: clamp(event.clientY - frame.top - held.dy, 0, maxY) / fit.height
    }
  }

  const onGripDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    const box = rootRef.current?.getBoundingClientRect()
    if (!box) return
    event.currentTarget.setPointerCapture(event.pointerId)
    grab.current = { pointerId: event.pointerId, dx: event.clientX - box.left, dy: event.clientY - box.top }
  }

  const onGripMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const held = grab.current
    if (held?.pointerId === event.pointerId) setDragged(pointerSpot(event, held))
  }

  const onGripUp = (event: ReactPointerEvent<HTMLElement>): void => {
    const held = grab.current
    if (held?.pointerId !== event.pointerId) return
    grab.current = null
    update(pointerSpot(event, held))
    setDragged(null)
  }

  return (
    <div ref={rootRef} className={cx('game-tb', vertical && 'game-tb--vertical', dragged !== null && 'is-dragging')} style={{ left, top }} role="toolbar" aria-label="Araç paneli" aria-orientation={vertical ? 'vertical' : 'horizontal'}>
      <div
        className="game-tb__grip"
        title="Sürükleyerek taşı"
        aria-hidden="true"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={() => {
          grab.current = null
          setDragged(null)
        }}
      >
        <GripIcon size={18} />
      </div>
      {collapsed ? (
        <ToolButton label="Paneli aç" onClick={() => update({ collapsed: false })}>
          <ChevronRightIcon size={18} />
        </ToolButton>
      ) : (
        <>
          {TOOLS.map((choice) => (
            <ToolButton key={choice.id} label={choice.label} active={tool === choice.id} onClick={() => dispatch({ type: 'session/setTool', tool: choice.id })}>
              {choice.icon}
            </ToolButton>
          ))}
          <span className="game-tb__sep" />
          {PEN_COLORS.map((color) => (
            <ToolButton key={color} label={`Renk: ${PEN_COLOR_INFO[color].label}`} active={usesPenColor(tool) && penColor === color} className="game-tb__color" onClick={() => dispatch({ type: 'session/setPenColor', color })}>
              <span className="game-tb__dot" style={{ background: PEN_COLOR_INFO[color].value }} />
            </ToolButton>
          ))}
          <span className="game-tb__sep" />
          {PEN_WIDTHS.map((width) => (
            <ToolButton key={width} label={`Kalınlık: ${WIDTH_LABELS[width]}`} active={penWidth === width} onClick={() => dispatch({ type: 'session/setPenWidth', width })}>
              <span className={cx('game-tb__width', `game-tb__width--${width}`)} />
            </ToolButton>
          ))}
          <span className="game-tb__sep" />
          <ToolButton label="Son çizimi geri al" onClick={() => dispatch({ type: 'session/undoDrawing' })}>
            <UndoIcon size={18} />
          </ToolButton>
          <ToolButton label="Çizimi temizle" onClick={() => dispatch({ type: 'session/clearDrawing' })}>
            <TrashIcon size={18} />
          </ToolButton>
          <span className="game-tb__sep" />
          <ToolButton label={vertical ? 'Yatay diz' : 'Dikey diz'} onClick={() => update({ vertical: !vertical })}>
            <OrientationIcon size={18} />
          </ToolButton>
          <ToolButton label="Paneli küçült" onClick={() => update({ collapsed: true })}>
            <ChevronLeftIcon size={18} />
          </ToolButton>
        </>
      )}
    </div>
  )
}
