import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { CHECK_MODE_LABEL, signed } from '@shared/character'
import { type DiceRoll, type DiceSides, type SkillCheck, isDiceSides } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { cx } from '@renderer/ui'
import { type ThrowLane, playThrow, toneOf } from './dice/player'
import './dice/dice.css'

interface ActiveRoll {
  id: string
  sides: DiceSides
  value: number
  check: SkillCheck | null
}

interface Spot {
  x: number
  y: number
}

/** Beceri atışında artı / eksilerin sırası (ms): ilki zarlar durduktan bu kadar sonra uçar. */
const FIRST_MODIFIER_MS = 600
/** İki artı / eksi arasındaki süre: uçuş + sayma sığar. */
const MODIFIER_INTERVAL_MS = 1050
/** Artı / eksinin ekranın kenarından zara uçuşu (dice.css'teki `dice-fly` ile aynı). */
const FLIGHT_MS = 560
/** Sayının bir adım artması / azalması; büyük artıda adımlar kısalır, sayma en çok COUNT_MAX_MS sürer. */
const COUNT_STEP_MS = 70
const COUNT_MAX_MS = 420
/** Son sayma bitince sonuç yazısı bu kadar sonra çıkar. */
const VERDICT_DELAY_MS = 250
/** Sonuç yazısı belirdikten sonra okunma süresi (saniye). */
const READ_SECONDS = 3.2

function isPlayable(roll: DiceRoll): boolean {
  if (!isDiceSides(roll.sides) || !Number.isInteger(roll.value) || roll.value < 1 || roll.value > roll.sides) return false
  if (roll.check === undefined) return true
  const { dice, keptIndex } = roll.check
  return dice.length >= 1 && dice.length <= 2 && dice.every((die) => die >= 1 && die <= roll.sides) && dice[keptIndex] === roll.value
}

function countStepMs(value: number): number {
  return Math.min(COUNT_STEP_MS, COUNT_MAX_MS / Math.max(1, Math.abs(value)))
}

/** Zarlar durduktan sonra sonuç yazısının çıkacağı an (ms). */
function verdictAtMs(check: SkillCheck): number {
  const count = check.modifiers.length
  if (count === 0) return FIRST_MODIFIER_MS - 200
  const last = check.modifiers[count - 1]
  return FIRST_MODIFIER_MS + (count - 1) * MODIFIER_INTERVAL_MS + FLIGHT_MS + Math.abs(last.value) * countStepMs(last.value) + VERDICT_DELAY_MS
}

/** Zar durduktan sonra kaybolmaya başlayana kadar: beceri atışında artı / eksilere ve sonuca yer kalır. */
function holdSecondsFor(check: SkillCheck | null): number | undefined {
  if (check === null) return undefined
  // İkinci zar birincinden biraz geç durabilir; payı da eklenir.
  return verdictAtMs(check) / 1000 + READ_SECONDS + (check.dice.length > 1 ? 0.6 : 0)
}

function lanesFor(check: SkillCheck | null): ThrowLane[] {
  return check !== null && check.dice.length === 2 ? ['left', 'right'] : ['center']
}

/**
 * Zar animasyonu (d4, d10, d20). Sonuç ana süreçte belirlenir ve `window.dnd.onDiceRoll` ile gelir; burada yalnızca
 * gösterilir: zar ekrana düşer, yuvarlanır, gelen değerle durur, sayı büyük gösterilir ve kaybolur.
 *
 * Beceri atışında: avantaj / dezavantajda iki d20 yan yana düşer, alınmayan soluklaşır. Sonra artı / eksiler
 * ekranın kenarından tek tek uçup alınan zarın sayısına çarpar, sayı adım adım toplama gider ve
 * "Başarılı" / "Başarısız" yazar. GameScreen bu bileşeni 1920x1080 sanal kutunun en üstüne yerleştirir.
 */
export function DiceOverlay(): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)]
  const [roll, setRoll] = useState<ActiveRoll | null>(null)
  /** Zar sırasına göre durduğu yerler; henüz durmayan null. */
  const [spots, setSpots] = useState<(Spot | null)[]>([])

  // Yalnızca bundan sonra gelen atışlar oynatılır; geçmişteki atışlar yeniden gösterilmez.
  useEffect(
    () =>
      window.dnd.onDiceRoll((next) => {
        if (!isPlayable(next)) return
        setSpots([])
        setRoll({ id: next.id, sides: next.sides, value: next.value, check: next.check ?? null })
      }),
    []
  )

  useEffect(() => {
    if (roll === null) return
    const root = rootRef.current
    if (root === null) return
    const check = roll.check
    const dice = check ? check.dice : [roll.value]
    const keptIndex = check ? check.keptIndex : 0
    const lanes = lanesFor(check)

    const finish = (): void => {
      // Bu arada yeni bir atış başladıysa ona dokunulmaz.
      setRoll((current) => (current === roll ? null : current))
    }
    const cancels: (() => void)[] = []
    for (const [index, value] of dice.entries()) {
      const canvas = canvasRefs[index].current
      if (canvas === null) continue
      const kept = index === keptIndex
      cancels.push(
        playThrow(
          root,
          canvas,
          roll.sides,
          value,
          {
            onSettle: (spot) =>
              setSpots((current) => {
                const next = dice.map((_, position) => current[position] ?? null)
                next[index] = spot
                return next
              }),
            // Atışın bitişini alınan zar belirler; öbürü onunla birlikte kaldırılır.
            onFinish: kept ? finish : () => undefined,
            onError: (error) => {
              reportError('Zar animasyonu', error)
              finish()
            }
          },
          { lane: lanes[index], holdSeconds: holdSecondsFor(check), fade: kept }
        )
      )
    }
    // Yeni atış gelince ya da bileşen kaldırılınca süren atış iptal edilir.
    return () => {
      for (const cancel of cancels) cancel()
    }
    // canvasRefs her çizimde aynı ref nesnelerini taşır.
  }, [roll])

  const check = roll?.check ?? null
  const diceCount = check ? check.dice.length : 1
  const allSettled = roll !== null && spots.length === diceCount && spots.every((spot) => spot !== null)

  return (
    <div ref={rootRef} className="dice-overlay" aria-hidden="true">
      {roll !== null && <canvas ref={canvasRefs[0]} className="dice-canvas" />}
      {roll !== null && diceCount > 1 && <canvas ref={canvasRefs[1]} className="dice-canvas" />}
      {roll !== null &&
        spots.map((spot, index) => {
          if (spot === null) return null
          const value = check ? check.dice[index] : roll.value
          const dropped = check !== null && index !== check.keptIndex
          return (
            <ResultBadge
              key={`${roll.id}-${index}`}
              spot={spot}
              value={value}
              tone={toneOf(roll.sides, value)}
              dropped={dropped && allSettled}
              // Alınan zarın sayısı artı / eksilerle değişir; ötekininki sabit kalır.
              check={!dropped && allSettled ? check : null}
            />
          )
        })}
      {roll !== null && check !== null && <CheckHeader key={roll.id} check={check} sides={roll.sides} />}
    </div>
  )
}

interface ResultBadgeProps {
  spot: Spot
  value: number
  tone: ReturnType<typeof toneOf>
  dropped: boolean
  /** Verilirse artı / eksiler uçar, sayı toplama gider ve sonuç yazılır. */
  check: SkillCheck | null
}

function ResultBadge({ spot, value, tone, dropped, check }: ResultBadgeProps): JSX.Element {
  const [shown, setShown] = useState(value)
  const [flying, setFlying] = useState<number | null>(null)
  const [applied, setApplied] = useState(0)
  const [bump, setBump] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (check === null) return
    const timers: number[] = []
    const at = (ms: number, run: () => void): void => {
      timers.push(window.setTimeout(run, ms))
    }
    let running = value
    check.modifiers.forEach((modifier, index) => {
      const start = FIRST_MODIFIER_MS + index * MODIFIER_INTERVAL_MS
      at(start, () => setFlying(index))
      // Çarpınca sayı adım adım değişir.
      const from = running
      const steps = Math.abs(modifier.value)
      const direction = Math.sign(modifier.value)
      const stepMs = countStepMs(modifier.value)
      for (let step = 1; step <= steps; step++) {
        at(start + FLIGHT_MS + (step - 1) * stepMs, () => setShown(from + direction * step))
      }
      at(start + FLIGHT_MS, () => {
        setApplied(index + 1)
        setBump((count) => count + 1)
      })
      running += modifier.value
    })
    at(verdictAtMs(check), () => {
      setFlying(null)
      setShown(check.total)
      setDone(true)
    })
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [check, value])

  const style: CSSProperties = { left: spot.x, top: spot.y }
  const modifiers = check?.modifiers ?? []
  const delta = shown - value
  return (
    <>
      <div
        className={cx(
          'dice-result',
          tone === 'crit' && 'is-crit',
          tone === 'fumble' && 'is-fumble',
          dropped && 'is-dropped',
          done && check !== null && check.success !== null && (check.success ? 'is-success' : 'is-fail')
        )}
        style={style}
      >
        <span key={bump} className={cx('dice-result__number', bump > 0 && 'is-bumped', delta > 0 && 'is-up', delta < 0 && 'is-down')}>
          {shown}
        </span>
      </div>
      {flying !== null && modifiers[flying] !== undefined && (
        <span
          key={flying}
          className={cx('dice-fly', modifiers[flying].value > 0 ? 'is-plus' : 'is-minus')}
          style={{ ...style, '--dice-from': modifiers[flying].value > 0 ? '1' : '-1' } as CSSProperties}
        >
          <strong>{signed(modifiers[flying].value)}</strong> {modifiers[flying].label}
        </span>
      )}
      {check !== null && applied > 0 && (
        // Sağdaki zarda liste sola açılır; ekrandan taşmasın.
        <ul className={cx('dice-applied', spot.x > 1100 && 'is-left')} style={style}>
          {modifiers.slice(0, applied).map((modifier, index) => (
            <li key={index} className={modifier.value > 0 ? 'is-plus' : 'is-minus'}>
              <strong>{signed(modifier.value)}</strong> {modifier.label}
            </li>
          ))}
        </ul>
      )}
      {/* İstatistik atışında hedef yoktur; toplam madalyondaki sayıdır. */}
      {check !== null && done && check.success !== null && (
        <div className={cx('dice-verdict', check.success ? 'is-success' : 'is-fail')} style={style}>
          <span className="dice-verdict__word">{check.success ? 'Başarılı' : 'Başarısız'}</span>
          <span className="dice-verdict__need">en az {check.requirement}</span>
        </div>
      )}
    </>
  )
}

/** Atışın alt yazısı: kim, hangi beceri ya da istatistik, avantaj / dezavantaj. */
function CheckHeader({ check, sides }: { check: SkillCheck; sides: DiceSides }): JSX.Element {
  return (
    <div className="dice-check">
      <span className="dice-check__who">{check.playerName}</span>
      <span className="dice-check__skill">{check.skillName}</span>
      {sides !== 20 && <span className="dice-check__who">d{sides}</span>}
      {check.mode !== 'normal' && <span className={cx('dice-check__mode', `is-${check.mode}`)}>{CHECK_MODE_LABEL[check.mode]}</span>}
    </div>
  )
}
