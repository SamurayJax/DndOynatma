import { useId, useMemo } from 'react'
import type { JSX, ReactNode } from 'react'
import { cx } from './cx'
import { FieldContext } from './fieldContext'
import type { FieldContextValue } from './fieldContext'

export interface FieldProps {
  label: ReactNode
  /** Tek bir kontrol (TextInput, TextArea, Select, NumberStepper, Toggle). Etiket ona otomatik bağlanır. */
  children: ReactNode
  /** Kontrolün altındaki açıklama. */
  hint?: ReactNode
  /** Verilirse kontrol hatalı işaretlenir ve mesaj kırmızı gösterilir. */
  error?: ReactNode
  /** Etiket ve kontrol yan yana dizilir. */
  inline?: boolean
  /** Kontrole elle id verildiyse etiketi o id'ye bağlar. */
  htmlFor?: string
  className?: string
}

/** Etiket + kontrol. Etiketi kontrole id ile bağlar; içine tek kontrol konur. */
export function Field({ label, children, hint, error, inline = false, htmlFor, className }: FieldProps): JSX.Element {
  const baseId = useId()
  const controlId = htmlFor ?? `${baseId}-control`
  const labelId = `${baseId}-label`
  const hasHint = hint !== undefined && hint !== null && hint !== false
  const hasError = error !== undefined && error !== null && error !== false
  const hintId = hasHint ? `${baseId}-hint` : undefined
  const errorId = hasError ? `${baseId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const context = useMemo<FieldContextValue>(
    () => ({ controlId, labelId, describedBy, invalid: hasError }),
    [controlId, labelId, describedBy, hasError]
  )

  return (
    <div className={cx('ui-field', inline && 'ui-field--inline', className)}>
      <label className="ui-field__label" id={labelId} htmlFor={controlId}>
        {label}
      </label>
      <div className="ui-field__control">
        <FieldContext value={context}>{children}</FieldContext>
      </div>
      {hasHint && (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {hasError && (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
