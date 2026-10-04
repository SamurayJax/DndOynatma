import { createContext, useContext } from 'react'

export interface FieldContextValue {
  controlId: string
  labelId: string
  describedBy: string | undefined
  invalid: boolean
}

/** `Field` içindeki kontrol, etiketle bağlanmak için kimliğini buradan alır. */
export const FieldContext = createContext<FieldContextValue | null>(null)

export interface FieldControlProps {
  id: string | undefined
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
}

/** Kontrolün `Field` ile eşleşen id/aria özelliklerini verir. `Field` dışında da güvenle çağrılır. */
export function useFieldControl(id?: string, invalid?: boolean): FieldControlProps {
  const field = useContext(FieldContext)
  return {
    id: id ?? field?.controlId,
    'aria-describedby': field?.describedBy,
    'aria-invalid': invalid === true || field?.invalid === true ? true : undefined
  }
}

/** Etiketi `for` ile bağlanamayan bileşik kontroller (ör. NumberStepper) için etiketin id'si. */
export function useFieldLabelId(): string | undefined {
  return useContext(FieldContext)?.labelId
}
