import { memo } from 'react'
import type { JSX } from 'react'
import { TEXT_LIMITS } from '@shared/reducer'
import { BOSS_FRAMES, BOSS_FRAME_LABELS, MAX_CARD_HP, MAX_LEVEL, MIN_LEVEL } from '@shared/types'
import type { BossFrame, ID, StageCard } from '@shared/types'
import { dispatch } from '@renderer/lib/useAppState'
import { Button, HeartIcon, NumberStepper, Select, TextInput } from '@renderer/ui'
import { HpQuickEntry } from './HealthControl'
import { blurOnEnterOrEscape } from './leaveField'

const FRAME_OPTIONS = BOSS_FRAMES.map((frame) => ({ value: frame, label: BOSS_FRAME_LABELS[frame] }))

interface CardEditorProps {
  sceneId: ID
  itemId: ID
  card: StageCard
  /** Boss görseli: çerçeve seçilebilir. */
  boss: boolean
  /** Ad, seviye, en yüksek can ve çerçeve açık mı. */
  editing: boolean
}

/**
 * "Ekrandakiler" satırındaki kart denetimleri. Dövüşte can sürekli değişir, kalanı nadiren: can hep
 * görünür, kalanı "Düzenle" ile açılır; yoksa panele aynı anda bir karttan fazlası sığmaz.
 */
export const CardEditor = memo(function CardEditor({ sceneId, itemId, card, boss, editing }: CardEditorProps): JSX.Element {
  const update = (patch: Partial<StageCard>): void => dispatch({ type: 'stage/updateCard', sceneId, itemId, patch })
  const adjust = (delta: number): void => dispatch({ type: 'stage/adjustCardHp', sceneId, itemId, delta })

  return (
    <div className="ctl-stage-card">
      <div className="ctl-stage-card__row">
        <span className="ctl-hp__label">
          <HeartIcon className="ctl-hp__icon" size={18} filled={card.hp > 0} />
          Can
        </span>
        <span className="ctl-hp__readout ctl-stage-card__hp" aria-live="polite">
          <span className="ctl-hp__value">{card.hp}</span>
          <span className="ctl-hp__max"> / {card.maxHp}</span>
        </span>
        <div className="ctl-hp__controls">
          <Button className="ctl-hp__step" aria-label="Kartın canını 1 azalt" onClick={() => adjust(-1)}>
            −1
          </Button>
          <Button className="ctl-hp__step" aria-label="Kartın canını 1 artır" onClick={() => adjust(1)}>
            +1
          </Button>
          <HpQuickEntry onEntry={(entry) => (entry.kind === 'delta' ? adjust(entry.amount) : update({ hp: entry.amount }))} />
        </div>
      </div>
      {editing && (
        <>
          <div className="ctl-stage-card__row">
            <TextInput
              className="ctl-stage-card__name"
              value={card.name}
              maxLength={TEXT_LIMITS.cardName}
              placeholder="Kartın adı"
              aria-label="Kartın adı"
              onChange={(name) => update({ name })}
              onKeyDown={blurOnEnterOrEscape}
            />
            <NumberStepper size="sm" value={card.level} min={MIN_LEVEL} max={MAX_LEVEL} label="Kartın seviyesi" format={(level) => `${level} LVL`} onChange={(level) => update({ level })} />
          </div>
          <div className="ctl-stage-card__row">
            <span className="ctl-hp__label">En yüksek can</span>
            {/* key: sınıra çekilen ya da reddedilen değer alanda kalmasın. */}
            <TextInput
              key={card.maxHp}
              className="ctl-stage-card__max"
              value={String(card.maxHp)}
              inputMode="numeric"
              maxLength={String(MAX_CARD_HP).length}
              aria-label="En yüksek can"
              onCommit={(text) => {
                const maxHp = Number(text)
                if (/^\d+$/.test(text.trim()) && maxHp >= 1) update({ maxHp })
              }}
              onKeyDown={blurOnEnterOrEscape}
            />
            {boss && (
              <Select<BossFrame>
                className="ctl-stage-card__frame"
                aria-label="Boss çerçevesi"
                value={card.frame === 'standard' ? 'shadow' : card.frame}
                options={FRAME_OPTIONS}
                onChange={(frame) => update({ frame })}
              />
            )}
          </div>
          <Button className="ctl-stage__mode" size="sm" onClick={() => dispatch({ type: 'stage/setCardMode', sceneId, itemId, enabled: false })}>
            Düz görsel yap
          </Button>
        </>
      )}
    </div>
  )
})
