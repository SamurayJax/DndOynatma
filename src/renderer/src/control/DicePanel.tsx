import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import type { DiceRoll, DiceSides } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { useSession } from '@renderer/lib/useAppState'
import { Button, D10Icon, D4Icon, DiceIcon, Panel, cx, toast } from '@renderer/ui'

/** Art arda tıklamayla zar yığılmasın; oyun ekranındaki animasyon da bu sürede oturur. */
const ROLL_COOLDOWN_MS = 1200

interface DieChoice {
  sides: DiceSides
  /** İpucunda görünen açıklama. */
  hint: string
  icon: ReactNode
}

/** En çok atılan zar en solda ve vurgulu. */
const DICE: readonly DieChoice[] = [
  { sides: 20, hint: '20 yüzlü zar', icon: <DiceIcon size={24} strokeWidth={1.5} /> },
  { sides: 10, hint: '10 yüzlü zar', icon: <D10Icon size={24} strokeWidth={1.5} /> },
  { sides: 4, hint: '4 yüzlü zar (piramit; üstte kalan köşedeki sayı okunur)', icon: <D4Icon size={24} strokeWidth={1.5} /> }
]

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Yalnızca d20'de 20 ve 1 hafifçe vurgulanır. */
function rollTone(roll: DiceRoll): string | false {
  if (roll.sides !== 20) return false
  if (roll.value === 20) return 'is-crit'
  return roll.value === 1 && 'is-fumble'
}

/** Zar düğmeleri, son atış ve atış geçmişi. Zar oyun ekranında atılır; sonuç ana süreçte üretilir. */
export function DicePanel(): JSX.Element {
  const { diceHistory } = useSession()
  const [cooling, setCooling] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const latest: DiceRoll | undefined = diceHistory[0]

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const roll = (sides: DiceSides): void => {
    if (cooling) return
    setCooling(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCooling(false), ROLL_COOLDOWN_MS)
    window.dnd.dice
      .roll(sides)
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
        <div className="ctl-dice__buttons" role="group" aria-label="Zar at">
          {DICE.map((die) => (
            /*
              `disabled` yerine `aria-disabled`: odaktaki düğme gerçekten devre dışı kalırsa odak kaybolur
              ve klavyeyle yeniden atmak için düğmeye dönmek gerekir. Bekleme süresi üç zar için ortaktır.
            */
            <Button
              key={die.sides}
              variant={die.sides === 20 ? 'primary' : 'secondary'}
              className={cx('ctl-dice__btn', cooling && 'is-cooling')}
              style={{ '--ctl-cooldown': `${ROLL_COOLDOWN_MS}ms` } as CSSProperties}
              icon={die.icon}
              aria-label={`d${die.sides} at`}
              title={`${die.hint} at`}
              aria-disabled={cooling}
              onClick={() => roll(die.sides)}
            >
              d{die.sides}
            </Button>
          ))}
        </div>
        <div className="ctl-dice__result" aria-live="polite">
          <span className="ctl-dice__caption">
            Son atış
            {latest !== undefined && (
              <span className="ctl-dice__caption-die" title={latest.check?.skillName}>
                {' '}
                · {latest.check ? latest.check.skillName : `d${latest.sides}`}
              </span>
            )}
          </span>
          {latest === undefined ? (
            <span className="ctl-dice__value is-empty">—</span>
          ) : (
            // Aynı sayı art arda gelse de canlanma yeniden oynasın diye atışın kimliği anahtar olur.
            <span key={latest.id} className={cx('ctl-dice__value', rollTone(latest), latest.check && (latest.check.success ? 'is-success' : 'is-fail'))}>
              {latest.check ? latest.check.total : latest.value}
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
              <li key={entry.id} className={cx('ctl-dice__roll', rollTone(entry), entry.check && (entry.check.success ? 'is-success' : 'is-fail'))}>
                <span className="ctl-dice__roll-die" title={entry.check ? `${entry.check.playerName} · ${entry.check.skillName}` : undefined}>
                  {entry.check ? `${entry.check.playerName} · ${entry.check.skillName}` : `d${entry.sides}`}
                </span>
                <span className="ctl-dice__roll-value">
                  {entry.check ? `${entry.check.total} / ${entry.check.requirement} ${entry.check.success ? '✓' : '✗'}` : entry.value}
                </span>
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
