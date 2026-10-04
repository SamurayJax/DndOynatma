import type { ComponentProps, JSX } from 'react'
import { cx } from './cx'
import { useFieldControl } from './fieldContext'
import { ChevronDownIcon } from './icons'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectProps<T extends string = string>
  extends Omit<ComponentProps<'select'>, 'value' | 'defaultValue' | 'onChange' | 'children' | 'multiple'> {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  invalid?: boolean
}

/** Yerel açılır liste. Değerler metindir; sayı ya da `null` seçenekleri çağıran taraf metne çevirir. */
export function Select<T extends string = string>({
  value,
  options,
  onChange,
  invalid,
  id,
  className,
  ...rest
}: SelectProps<T>): JSX.Element {
  const field = useFieldControl(id, invalid)

  return (
    <span className={cx('ui-select', field['aria-invalid'] && 'ui-select--invalid', className)}>
      <select
        {...field}
        {...rest}
        className="ui-select__native"
        value={value}
        onChange={(event) => {
          const picked = options.find((option) => option.value === event.target.value)
          if (picked !== undefined) onChange(picked.value)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="ui-select__chevron" size={16} />
    </span>
  )
}
