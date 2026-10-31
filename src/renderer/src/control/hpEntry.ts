export type HpEntry = { kind: 'delta'; amount: number } | { kind: 'set'; amount: number }

/**
 * Can hızlı girişini çözer: "-5" / "+3" o kadar azaltır ya da artırır, işaretsiz "7" canı 7 yapar.
 * Sayı olmayan her şey `null` döner; sınırlar (oyuncuda 0..MAX_HP, kartta 0..maxHp) reducer'da uygulanır.
 */
export function parseHpEntry(raw: string): HpEntry | null {
  // Tipografik eksi (−) ve kısa çizgi (–) de eksi sayılır; bazı klavye düzenleri bunları üretir.
  const text = raw.trim().replace(/[−–]/g, '-')
  const match = /^([+-]?)\s*(\d{1,4})$/.exec(text)
  if (match === null) return null
  const amount = Number(match[2])
  if (match[1] === '') return { kind: 'set', amount }
  return { kind: 'delta', amount: match[1] === '-' ? -amount : amount }
}
