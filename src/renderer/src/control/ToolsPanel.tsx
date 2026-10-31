import type { JSX, ReactNode } from 'react'
import { PEN_COLORS, PEN_COLOR_INFO, usesPenColor } from '@shared/types'
import type { PenWidth, Tool } from '@shared/types'
import { dispatch, useApp, useSession } from '@renderer/lib/useAppState'
import { Button, CursorIcon, EraserIcon, GripIcon, Panel, PencilIcon, TrashIcon, cx } from '@renderer/ui'

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
  { id: 'pen', short: 'Kalem', full: 'Kalem', icon: <PencilIcon size={16} /> },
  { id: 'eraser', short: 'Silgi', full: 'Silgi', icon: <EraserIcon size={16} /> }
]

const WIDTHS: readonly { id: PenWidth; label: string }[] = [
  { id: 'thin', label: 'İnce' },
  { id: 'medium', label: 'Orta' },
  { id: 'thick', label: 'Kalın' }
]

const CLEAR_HINT = 'Çizimi yalnızca bu düğme siler; fareye geçince çizim kalır. Açık olan pencerenin çizimi silinir.'

/** Araç seçimi (fare, kalem, silgi), renk, kalınlık, "Çizimi temizle" ve oyun ekranındaki panelin görünürlüğü. */
export function ToolsPanel(): JSX.Element {
  const { tool, penColor, penWidth } = useSession()
  const { hidden } = useApp().settings.toolbar

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
        {/* T tuşu oyun ekranında çalışır; panel gizliyken geri açmanın görünür yolu burasıdır. */}
        <Button
          className="ctl-tool"
          active={!hidden}
          aria-label="Araç panelini oyun ekranında göster"
          title="Oyun ekranındaki araç paneli (oyun ekranında T tuşu)"
          icon={
            <span className="ctl-tool__swatch">
              <GripIcon size={16} />
            </span>
          }
          onClick={() => dispatch({ type: 'toolbar/update', patch: { hidden: !hidden } })}
        >
          Panel
        </Button>
      </div>
      {/* Sağ sütun 1080p'de tam dolu: renkler ayrı satır değil, kalınlıkla aynı satırda durur. */}
      <div className="ctl-tools__footer">
        <div className="ctl-colors" role="group" aria-label="Kalem rengi">
          {PEN_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={cx('ctl-color', usesPenColor(tool) && penColor === color && 'is-active')}
              style={{ background: PEN_COLOR_INFO[color].value }}
              aria-label={`Kalem rengi: ${PEN_COLOR_INFO[color].label}`}
              aria-pressed={usesPenColor(tool) && penColor === color}
              title={`Kalem: ${PEN_COLOR_INFO[color].label}`}
              onClick={() => dispatch({ type: 'session/setPenColor', color })}
            />
          ))}
        </div>
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
        <Button size="sm" className="ctl-clear" icon={<TrashIcon size={16} />} aria-label="Çizimi temizle" title={`Çizimi temizle. ${CLEAR_HINT}`} onClick={() => dispatch({ type: 'session/clearDrawing' })} />
      </div>
    </Panel>
  )
}
