import type { ComponentProps, JSX } from 'react'
import { cx } from './cx'
import { useFieldControl } from './fieldContext'
import { useDraft } from './useDraft'

export interface TextAreaProps extends Omit<ComponentProps<'textarea'>, 'value' | 'defaultValue' | 'onChange'> {
  /** Durumdaki değer. Kullanıcı yazarken kendi yazdığı gösterilir (bkz. useDraft). */
  value: string
  /** Her tuş vuruşunda çağrılır; doğrudan `dispatch` edilebilir. */
  onChange?: (value: string) => void
  /** Kullanıcı metni değiştirdiyse odak çıkınca bir kez çağrılır. */
  onCommit?: (value: string) => void
  invalid?: boolean
}

export function TextArea({
  value,
  onChange,
  onCommit,
  invalid,
  id,
  className,
  rows = 3,
  onFocus,
  onBlur,
  ...rest
}: TextAreaProps): JSX.Element {
  const field = useFieldControl(id, invalid)
  const draft = useDraft(value, onChange, onCommit)

  return (
    <textarea
      spellCheck={false}
      {...field}
      {...rest}
      rows={rows}
      className={cx('ui-textarea', field['aria-invalid'] && 'ui-textarea--invalid', className)}
      value={draft.shown}
      onChange={(event) => draft.handleChange(event.target.value)}
      onFocus={(event) => {
        draft.handleFocus()
        onFocus?.(event)
      }}
      onBlur={(event) => {
        draft.handleBlur()
        onBlur?.(event)
      }}
    />
  )
}
