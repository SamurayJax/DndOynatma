import type { JSX, ReactNode } from 'react'
import type { Tool } from '@shared/types'
import { dispatch, useSession } from '@renderer/lib/useAppState'
import { Button, CursorIcon, EraserIcon, Panel, PencilIcon, cx } from '@renderer/ui'

interface ToolChoice {
  id: Tool
  name: string
  /** İkinci satırda gösterilen ek (kalemin rengi). */
  detail?: string
  icon: ReactNode
}

const TOOLS: readonly ToolChoice[] = [
  { id: 'mouse', name: 'Fare', icon: <CursorIcon size={18} /> },
  { id: 'pen-red', name: 'Kalem', detail: '(kırmızı)', icon: <PencilIcon size={16} /> },
  { id: 'pen-black', name: 'Kalem', detail: '(siyah)', icon: <PencilIcon size={16} /> }
]

/** Araç seçimi: Fare / Kalem kırmızı / Kalem siyah ve "Çizimi temizle". */
export function ToolsPanel(): JSX.Element {
  const { tool } = useSession()
  const penActive = tool !== 'mouse'

  return (
    <Panel className="ctl-panel" title="Araçlar">
      <div className="ctl-tools" role="group" aria-label="Araç">
        {TOOLS.map((choice) => (
          <Button
            key={choice.id}
            className={cx('ctl-tool', `ctl-tool--${choice.id}`)}
            active={tool === choice.id}
            icon={<span className="ctl-tool__swatch">{choice.icon}</span>}
            onClick={() => dispatch({ type: 'session/setTool', tool: choice.id })}
          >
            {choice.name}
            {choice.detail !== undefined && (
              <>
                {' '}
                <span className="ctl-tool__detail">{choice.detail}</span>
              </>
            )}
          </Button>
        ))}
      </div>
      <div className="ctl-tools__footer">
        <Button size="sm" icon={<EraserIcon size={16} />} disabled={!penActive} onClick={() => dispatch({ type: 'session/clearDrawing' })}>
          Çizimi temizle
        </Button>
        <p className="ctl-hint">Fareye dönünce çizimler silinir.</p>
      </div>
    </Panel>
  )
}
