import type { JSX, ReactNode } from 'react'
import type { PenWidth, Tool } from '@shared/types'
import { dispatch, useSession } from '@renderer/lib/useAppState'
import { Button, CursorIcon, EraserIcon, Panel, PencilIcon, TrashIcon, cx } from '@renderer/ui'

interface ToolChoice {
  id: Tool
  /** Düğmenin altında görünen kısa ad. */
  short: string
  /** Ekran okuyucu ve ipucu için tam ad. */
  full: string
  icon: ReactNode
}

const TOOLS: readonly ToolChoice[] = [
  { id: 'mouse', short: 'Fare', full: 'Fare', icon: <CursorIcon size={18} /> },
  { id: 'pen-red', short: 'Kırmızı', full: 'Kalem (kırmızı)', icon: <PencilIcon size={16} /> },
  { id: 'pen-black', short: 'Siyah', full: 'Kalem (siyah)', icon: <PencilIcon size={16} /> },
  { id: 'eraser', short: 'Silgi', full: 'Silgi', icon: <EraserIcon size={16} /> }
]

const WIDTHS: readonly { id: PenWidth; label: string }[] = [
  { id: 'thin', label: 'İnce' },
  { id: 'medium', label: 'Orta' },
  { id: 'thick', label: 'Kalın' }
]

const CLEAR_HINT = 'Çizimi yalnızca bu düğme siler; fareye geçince çizim kalır. Açık olan pencerenin çizimi silinir.'

/** Araç seçimi (fare, iki kalem, silgi), kalınlık ve "Çizimi temizle". */
export function ToolsPanel(): JSX.Element {
  const { tool, penWidth } = useSession()

  return (
    <Panel className="ctl-panel" title="Araçlar">
      <div className="ctl-tools" role="group" aria-label="Araç">
        {TOOLS.map((choice) => (
          <Button
            key={choice.id}
            className={cx('ctl-tool', `ctl-tool--${choice.id}`)}
            active={tool === choice.id}
            aria-label={choice.full}
            title={choice.full}
            icon={<span className="ctl-tool__swatch">{choice.icon}</span>}
            onClick={() => dispatch({ type: 'session/setTool', tool: choice.id })}
          >
            {choice.short}
          </Button>
        ))}
      </div>
      <div className="ctl-tools__footer">
        {/* Kalınlık kalem ve silgi için ortaktır; silgi aynı ayarda kalemden geniştir. */}
        <div className="ctl-widths" role="group" aria-label="Kalınlık">
          {WIDTHS.map((width) => (
            <Button
              key={width.id}
              size="sm"
              className={cx('ctl-width', `ctl-width--${width.id}`)}
              active={penWidth === width.id}
              aria-label={`Kalınlık: ${width.label.toLocaleLowerCase('tr')}`}
              title={`Kalem ve silgi kalınlığı: ${width.label.toLocaleLowerCase('tr')}`}
              onClick={() => dispatch({ type: 'session/setPenWidth', width: width.id })}
            >
              <span className="ctl-width__line" aria-hidden="true" />
            </Button>
          ))}
        </div>
        {/* Çizimler oyun ekranında tutulur; burada var olup olmadıkları bilinmez, düğme hep açıktır. */}
        <Button size="sm" icon={<TrashIcon size={16} />} title={CLEAR_HINT} onClick={() => dispatch({ type: 'session/clearDrawing' })}>
          Çizimi temizle
        </Button>
      </div>
    </Panel>
  )
}
