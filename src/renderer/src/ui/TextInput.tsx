import type { ComponentProps, JSX } from 'react'
import { cx } from './cx'
import { useFieldControl } from './fieldContext'
import { useDraft } from './useDraft'

export interface TextInputProps extends Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  /** Durumdaki değer. Kullanıcı yazarken kendi yazdığı gösterilir (bkz. useDraft). */
  value: string
  /** Her tuş vuruşunda çağrılır; doğrudan `dispatch` edilebilir. */
  onChange?: (value: string) => void
  /** Kullanıcı metni değiştirdiyse odak çıkınca ya da Enter'a basınca bir kez çağrılır. */
  onCommit?: (value: string) => void
  type?: 'text' | 'search'
  invalid?: boolean
}

export function TextInput({
  value,
  onChange,
  onCommit,
  type = 'text',
  invalid,
  id,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: TextInputProps): JSX.Element {
  const field = useFieldControl(id, invalid)
  const draft = useDraft(value, onChange, onCommit)

  return (
    <input
      autoComplete="off"
      spellCheck={false}
      {...field}
      {...rest}
      type={type}
      className={cx('ui-input', field['aria-invalid'] && 'ui-input--invalid', className)}
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
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) draft.commit()
        onKeyDown?.(event)
      }}
    />
  )
}
