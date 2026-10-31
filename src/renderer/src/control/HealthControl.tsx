import { memo, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { MAX_HP } from '@shared/types'
import { dispatch } from '@renderer/lib/useAppState'
import { Button, HeartIcon, TextInput, cx } from '@renderer/ui'
import { parseHpEntry } from './hpEntry'
import type { HpEntry } from './hpEntry'

const SEGMENTS: readonly number[] = Array.from({ length: MAX_HP }, (_, index) => index + 1)

interface HealthControlProps {
  slot: number
  hp: number
}

/**
 * Can: kutucuklu bar, −1 / +1 ve hızlı giriş. Uygulamanın en çok kullanılan kontrolü.
 * Klavyede durak yalnızca −1, +1 ve hızlı giriştir; kutucuklar fare içindir (her kartta 10 durak olmasın).
 */
export const HealthControl = memo(function HealthControl({ slot, hp }: HealthControlProps): JSX.Element {
  return (
    <div className="ctl-hp">
      <div className="ctl-hp__row">
        <span className="ctl-hp__label">
          <HeartIcon className="ctl-hp__icon" size={18} filled={hp > 0} />
          Can
        </span>
        <span className="ctl-hp__readout" aria-live="polite">
          <span className="ctl-hp__value">{hp}</span>
          <span className="ctl-hp__max"> / {MAX_HP}</span>
        </span>
        <div className="ctl-hp__controls">
          {/* Sınırda da etkin kalır: odaktaki düğme devre dışı kalırsa odak kaybolur; sınırı reducer uygular. */}
          <Button className="ctl-hp__step" aria-label="Canı 1 azalt" onClick={() => dispatch({ type: 'player/adjustHp', slot, delta: -1 })}>
            −1
          </Button>
          <Button className="ctl-hp__step" aria-label="Canı 1 artır" onClick={() => dispatch({ type: 'player/adjustHp', slot, delta: 1 })}>
            +1
          </Button>
          <HpQuickEntry
            onEntry={(entry) =>
              dispatch(entry.kind === 'delta' ? { type: 'player/adjustHp', slot, delta: entry.amount } : { type: 'player/setHp', slot, hp: entry.amount })
            }
          />
        </div>
      </div>

      <div className="ctl-hp__bar" role="group" aria-label="Can kutucukları" style={{ gridTemplateColumns: `repeat(${MAX_HP}, minmax(0, 1fr))` }}>
        {SEGMENTS.map((n) => (
          <button
            key={n}
            type="button"
            tabIndex={-1}
            className={cx('ctl-hp__seg', n <= hp && 'is-filled')}
            aria-label={`Can ${n}`}
            aria-pressed={n <= hp}
            // Dolu son kutucuğa tıklamak onu söndürür; yoksa bardan 0'a inilemezdi.
            onClick={() => dispatch({ type: 'player/setHp', slot, hp: n === hp ? n - 1 : n })}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
})

/** "-5" / "+3" yazıp Enter: fark uygular. İşaretsiz sayı: canı o değere ayarlar. */
export function HpQuickEntry({ onEntry }: { onEntry: (entry: HpEntry) => void }): JSX.Element {
  // Alan uygulamadan sonra boşalmalı. TextInput odaktayken yazılanı tuttuğu için boşaltmanın yolu
  // onu yeniden bağlamaktır; odak da art arda giriş yapılabilsin diye geri verilir.
  const [generation, setGeneration] = useState(0)
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const refocus = useRef(false)

  useLayoutEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    inputRef.current?.focus()
  }, [generation])

  const reset = (): void => {
    refocus.current = true
    setInvalid(false)
    setGeneration((current) => current + 1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      // Dolu alanı boşaltır; boş alanda odaktan çıkar ki 1–9 atama tuşları yeniden çalışsın.
      if (event.currentTarget.value !== '') reset()
      else event.currentTarget.blur()
      return
    }
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    const text = event.currentTarget.value
    if (text.trim() === '') return
    const entry = parseHpEntry(text)
    if (entry === null) {
      setInvalid(true)
      return
    }
    onEntry(entry)
    reset()
  }

  return (
    <TextInput
      key={generation}
      ref={inputRef}
      className="ctl-hp__entry"
      value=""
      inputMode="numeric"
      maxLength={5}
      placeholder="-5 / +3"
      aria-label="Can hızlı giriş"
      title="-5 ya da +3 yazıp Enter: o kadar azaltır / artırır. İşaretsiz sayı (ör. 7): canı o değere ayarlar."
      invalid={invalid}
      onChange={() => setInvalid(false)}
      onKeyDown={onKeyDown}
    />
  )
}
