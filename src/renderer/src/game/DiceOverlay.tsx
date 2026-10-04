import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { reportError } from '@renderer/lib/reportError'
import { cx } from '@renderer/ui'
import { playThrow } from './dice/player'
import './dice/dice.css'

interface ActiveRoll {
  id: string
  value: number
}

interface Reveal {
  rollId: string
  x: number
  y: number
}

function isD20Value(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 20
}

/**
 * d20 animasyonu. Sonuç ana süreçte belirlenir ve `window.dnd.onDiceRoll` ile gelir; burada yalnızca
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
        if (!isD20Value(next.value)) return
        setReveal(null)
        setRoll({ id: next.id, value: next.value })
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
    return playThrow(root, canvas, roll.value, {
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

  return (
    <div ref={rootRef} className="dice-overlay" aria-hidden="true">
      {roll !== null && <canvas ref={canvasRef} className="dice-canvas" />}
      {roll !== null && shown !== null && (
        <div
          key={roll.id}
          className={cx('dice-result', roll.value === 20 && 'is-crit', roll.value === 1 && 'is-fumble')}
          style={resultStyle}
        >
          <span className="dice-result__number">{roll.value}</span>
        </div>
      )}
    </div>
  )
}
