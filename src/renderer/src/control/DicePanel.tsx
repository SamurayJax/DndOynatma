import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import { ABILITY_INFO, CHECK_MODE_LABEL, abilityModifier, signed } from '@shared/character'
import { filledPlayers } from '@shared/layout'
import { ABILITIES } from '@shared/types'
import type { Ability, CheckMode, DiceRoll, DiceSides } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { useApp, useSession } from '@renderer/lib/useAppState'
import { Button, D10Icon, D4Icon, DiceIcon, Panel, Select, cx, toast } from '@renderer/ui'
import type { SelectOption } from '@renderer/ui'

/** Art arda tıklamayla zar yığılmasın; oyun ekranındaki animasyon da bu sürede oturur. */
const ROLL_COOLDOWN_MS = 1200
const NOBODY = 'none'
const MODES: readonly CheckMode[] = ['normal', 'advantage', 'disadvantage']

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

/** Yalnızca d20'de 20 ve 1 hafifçe vurgulanır (alınan zara bakılır). */
function rollTone(roll: DiceRoll): string | false {
  if (roll.sides !== 20) return false
  if (roll.value === 20) return 'is-crit'
  return roll.value === 1 && 'is-fumble'
}

/**
 * Zar düğmeleri ve son atış. İsteğe bağlı olarak bir oyuncu ve istatistik seçilir: o zaman basılan zara
 * istatistiğin artısı ve oyuncunun geçici artı / eksileri eklenir, avantaj / dezavantaj seçilebilir
 * (hedef ve yeterlilik yoktur). Zar oyun ekranında atılır; sonuç ana süreçte üretilir.
 */
export function DicePanel(): JSX.Element {
  const app = useApp()
  const { diceHistory } = useSession()
  const [cooling, setCooling] = useState(false)
  const [slotChoice, setSlotChoice] = useState(NOBODY)
  const [ability, setAbility] = useState<Ability>('str')
  const [mode, setMode] = useState<CheckMode>('normal')
  const timer = useRef<number | undefined>(undefined)
  const latest: DiceRoll | undefined = diceHistory[0]

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const players = filledPlayers(app)
  // Seçilen oyuncunun kartı boşaldıysa seçim kendiliğinden düşer.
  const chosen = players.find(({ slot }) => String(slot) === slotChoice)
  const playerOptions: SelectOption[] = [
    { value: NOBODY, label: 'Karakter yok (düz zar)' },
    ...players.map(({ slot, player }) => ({ value: String(slot), label: player.name.trim() || `Oyuncu ${slot + 1}` }))
  ]
  const abilityOptions: SelectOption<Ability>[] = ABILITIES.map((entry) => {
    const modifier = chosen ? ` (${signed(abilityModifier(chosen.player.abilities[entry]))})` : ''
    return { value: entry, label: `${ABILITY_INFO[entry].short} · ${ABILITY_INFO[entry].name}${modifier}` }
  })

  const roll = (sides: DiceSides): void => {
    if (cooling) return
    setCooling(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCooling(false), ROLL_COOLDOWN_MS)
    const request = chosen ? window.dnd.dice.rollAbility(chosen.slot, ability, sides, mode) : window.dnd.dice.roll(sides)
    request
      .then((result) => {
        if (result === null || result === 'not-playing') toast('Zar atılamadı: oyun açık değil.', 'UYARI', 'DND-401')
        // Avantaj / dezavantaj tek atış içindir.
        else if (typeof result === 'object' && chosen) setMode('normal')
      })
      .catch((error: unknown) => {
        reportError('Zar atılamadı', error)
        toast('Zar atılamadı. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
      })
  }

  const check = latest?.check
  const sum = check ? check.modifiers.reduce((total, modifier) => total + modifier.value, 0) : 0

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
              title={chosen ? `${die.hint} at: ${ABILITY_INFO[ability].name} artısı ve etkiler eklenir` : `${die.hint} at`}
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
            {/* Kimin attığı yazmaz (kullanıcı kararı, 2026-10-29); yalnızca zar. */}
            {latest !== undefined && <span className="ctl-dice__caption-die"> · d{latest.sides}</span>}
          </span>
          {latest === undefined ? (
            <span className="ctl-dice__value is-empty">—</span>
          ) : (
            // Aynı sayı art arda gelse de canlanma yeniden oynasın diye atışın kimliği anahtar olur.
            <span
              key={latest.id}
              className={cx('ctl-dice__value', rollTone(latest), check && check.success !== null && (check.success ? 'is-success' : 'is-fail'))}
            >
              {check ? check.total : latest.value}
            </span>
          )}
          {check && sum !== 0 && (
            <span className="ctl-dice__math">
              {check.dice[check.keptIndex]} {signed(sum)}
            </span>
          )}
        </div>
      </div>

      <div className="ctl-dice__who">
        <Select aria-label="Kimin için atılsın" value={chosen ? slotChoice : NOBODY} options={playerOptions} onChange={setSlotChoice} />
        <Select aria-label="Hangi istatistikle" value={ability} options={abilityOptions} onChange={setAbility} disabled={!chosen} />
        <div className="ctl-dice__modes" role="radiogroup" aria-label="Atış türü">
          {MODES.map((entry) => (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={mode === entry}
              disabled={!chosen}
              className={cx('ctl-dice__mode', `ctl-dice__mode--${entry}`, mode === entry && 'is-selected')}
              onClick={() => setMode(entry)}
            >
              {CHECK_MODE_LABEL[entry]}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  )
}
