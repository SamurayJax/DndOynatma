/**
 * Konva tuvale çizdiği için CSS değişkenlerini kendiliğinden göremez; tema belirteçleri
 * buradan bir kez okunur. Böylece sahnedeki renkler `ui/theme.css` ile aynı kalır.
 */
export interface StagePalette {
  accent: string
  text: string
  textMuted: string
  bgDeep: string
  bgControl: string
  borderStrong: string
  fontBody: string
}

const FALLBACK: StagePalette = {
  accent: '#d4a84b',
  text: '#ede3d0',
  textMuted: '#b9ac95',
  bgDeep: '#0c0a08',
  bgControl: '#26211b',
  borderStrong: '#4d4336',
  fontBody: "'Segoe UI', system-ui, sans-serif"
}

let cached: StagePalette | null = null

export function stagePalette(): StagePalette {
  if (cached !== null) return cached
  const style = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback
  cached = {
    accent: read('--accent', FALLBACK.accent),
    text: read('--text', FALLBACK.text),
    textMuted: read('--text-muted', FALLBACK.textMuted),
    bgDeep: read('--bg-0', FALLBACK.bgDeep),
    bgControl: read('--bg-3', FALLBACK.bgControl),
    borderStrong: read('--border-strong', FALLBACK.borderStrong),
    fontBody: read('--font-body', FALLBACK.fontBody)
  }
  return cached
}

/** `#rrggbb` rengi saydamlıkla birlikte verir; başka biçimdeki renk olduğu gibi döner. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match) return color
  const value = Number.parseInt(match[1], 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}
