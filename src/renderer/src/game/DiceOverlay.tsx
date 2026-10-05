import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { type DiceRoll, type DiceSides, isDiceSides } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { cx } from '@renderer/ui'
import { playThrow, toneOf } from './dice/player'
import './dice/dice.css'

interface ActiveRoll {
  id: string
  sides: DiceSides
  value: number
}

interface Reveal {
  rollId: string
  x: number
  y: number
}

function isPlayable(roll: DiceRoll): boolean {
  return isDiceSides(roll.sides) && Number.isInteger(roll.value) && roll.value >= 1 && roll.value <= roll.sides
}

/**
 * Zar animasyonu (d4, d10, d20). Sonuç ana süreçte belirlenir ve `window.dnd.onDiceRoll` ile gelir; burada yalnızca
 * gösterilir: zar ekrana düşer, yuvarlanır, gelen değerle durur, sayı büyük gösterilir ve kaybolur.
 * GameScreen bu bileşeni 1920x1080 sanal kutunun en üstüne yerleştirir.
 */
export function DiceOverlay(): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [roll, setRoll] = useState<ActiveRoll | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)

  // Yalnızca bundan sonra gelen atışlar oynatılır; geçmişteki atışlar yeniden gösterilmez.
  useEffect(
    () =>
      window.dnd.onDiceRoll((next) => {
        if (!isPlayable(next)) return
        setReveal(null)
        setRoll({ id: next.id, sides: next.sides, value: next.value })
      }),
    []
  )

  useEffect(() => {
    if (roll === null) return
    const root = rootRef.current
    const canvas = canvasRef.current
    if (root === null || canvas === null) return

    const finish = (): void => {
      // Bu arada yeni bir atış başladıysa ona dokunulmaz.
      setRoll((current) => (current === roll ? null : current))
      setReveal((current) => (current?.rollId === roll.id ? null : current))
    }
    // Yeni atış gelince ya da bileşen kaldırılınca dönen fonksiyon süren atışı iptal eder.
    return playThrow(root, canvas, roll.sides, roll.value, {
      onSettle: (spot) => setReveal({ rollId: roll.id, x: spot.x, y: spot.y }),
      onFinish: finish,
      onError: (error) => {
        reportError('Zar animasyonu', error)
        finish()
      }
    })
  }, [roll])

  const shown = roll !== null && reveal !== null && reveal.rollId === roll.id ? reveal : null
  const resultStyle: CSSProperties | undefined = shown ? { left: shown.x, top: shown.y } : undefined
  const tone = roll === null ? 'normal' : toneOf(roll.sides, roll.value)

  return (
    <div ref={rootRef} className="dice-overlay" aria-hidden="true">
      {roll !== null && <canvas ref={canvasRef} className="dice-canvas" />}
      {roll !== null && shown !== null && (
        <div
          key={roll.id}
          className={cx('dice-result', tone === 'crit' && 'is-crit', tone === 'fumble' && 'is-fumble')}
          style={resultStyle}
        >
          <span className="dice-result__number">{roll.value}</span>
        </div>
      )}
    </div>
  )
}
