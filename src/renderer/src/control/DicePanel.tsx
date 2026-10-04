import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import type { DiceRoll } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { useSession } from '@renderer/lib/useAppState'
import { Button, DiceIcon, Panel, cx, toast } from '@renderer/ui'

/** Art arda tıklamayla zar yığılmasın; oyun ekranındaki animasyon da bu sürede oturur. */
const ROLL_COOLDOWN_MS = 1200

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 20 ve 1 hafifçe vurgulanır. */
function rollTone(roll: DiceRoll): string | false {
  if (roll.value === roll.sides) return 'is-crit'
  return roll.value === 1 && 'is-fumble'
}

/** d20 düğmesi, son atış ve atış geçmişi. Zar oyun ekranında atılır; sonuç ana süreçte üretilir. */
export function DicePanel(): JSX.Element {
  const { diceHistory } = useSession()
  const [cooling, setCooling] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const latest: DiceRoll | undefined = diceHistory[0]

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const roll = (): void => {
    if (cooling) return
    setCooling(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCooling(false), ROLL_COOLDOWN_MS)
    window.dnd.dice
      .roll()
      .then((result) => {
        if (result === null) toast('Zar atılamadı: oyun açık değil.', 'UYARI', 'DND-401')
      })
      .catch((error: unknown) => {
        reportError('Zar atılamadı', error)
        toast('Zar atılamadı. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
      })
  }

  return (
    <Panel className="ctl-panel" title="Zar">
      <div className="ctl-dice__top">
        {/*
          `disabled` yerine `aria-disabled`: odaktaki düğme gerçekten devre dışı kalırsa odak kaybolur
          ve klavyeyle yeniden atmak için düğmeye dönmek gerekir.
        */}
        <Button
          variant="primary"
          size="lg"
          className={cx('ctl-dice__btn', cooling && 'is-cooling')}
          style={{ '--ctl-cooldown': `${ROLL_COOLDOWN_MS}ms` } as CSSProperties}
          icon={<DiceIcon size={30} strokeWidth={1.5} />}
          aria-disabled={cooling}
          onClick={roll}
        >
          d20 at
        </Button>
        <div className="ctl-dice__result" aria-live="polite">
          <span className="ctl-dice__caption">Son atış</span>
          {latest === undefined ? (
            <span className="ctl-dice__value is-empty">—</span>
          ) : (
            // Aynı sayı art arda gelse de canlanma yeniden oynasın diye atışın kimliği anahtar olur.
            <span key={latest.id} className={cx('ctl-dice__value', rollTone(latest))}>
              {latest.value}
            </span>
          )}
        </div>
      </div>

      {/* Sabit yükseklik: yeni atış geldikçe alttaki paneller kaymaz. */}
      <div className="ctl-dice__history">
        {diceHistory.length === 0 ? (
          <p className="ctl-dice__empty">Henüz zar atılmadı.</p>
        ) : (
          <ol className="ctl-dice__list" aria-label="Son atışlar">
            {diceHistory.map((entry) => (
              <li key={entry.id} className={cx('ctl-dice__roll', rollTone(entry))}>
                <span className="ctl-dice__roll-value">{entry.value}</span>
                <time className="ctl-dice__roll-time" dateTime={entry.at}>
                  {formatTime(entry.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  )
}
