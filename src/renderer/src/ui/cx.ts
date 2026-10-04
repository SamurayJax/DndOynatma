/** Koşullu sınıf adlarını tek bir `className` metninde birleştirir. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
