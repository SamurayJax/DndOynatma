/**
 * Arayüzde beklenmeyen hataları log dosyasına DND-902 koduyla yazar.
 */

const MAX_REPORTS = 40

let reportCount = 0
let lastMessage = ''

/** Hatanın tek satırlık, loga yazılabilir özeti. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const head = `${error.name}: ${error.message}`
    const frames = error.stack
      ?.split('\n')
      .slice(1, 5)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join(' | ')
    return frames ? `${head} (${frames})` : head
  }
  if (typeof error === 'string') return error
  try {
    const text = JSON.stringify(error) as string | undefined
    return text ?? String(error)
  } catch {
    return String(error)
  }
}

/** `context`: hatanın nerede olduğunu anlatan kısa Türkçe ifade ("Oyun başlatılamadı" gibi). */
export function reportError(context: string, error: unknown): void {
  const message = `[${window.dnd.role}] ${context}: ${describeError(error)}`
  // Her karede yinelenen bir hata log dosyasını ve IPC kanalını doldurmasın.
  if (message === lastMessage || reportCount >= MAX_REPORTS) return
  lastMessage = message
  reportCount += 1
  window.dnd.log('HATA', 'DND-902', message)
  if (reportCount === MAX_REPORTS) {
    window.dnd.log('UYARI', 'DND-902', `[${window.dnd.role}] Çok fazla hata oluştu; bu pencereden yeni hata yazılmayacak.`)
  }
}
