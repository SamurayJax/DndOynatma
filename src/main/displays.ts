/**
 * Oyun ekranı ve kontrol panelinin hangi monitörde, nerede açılacağını hesaplar.
 * Saf fonksiyonlar; Electron'un `Display` nesnesinin yalnızca gereken alanlarını alır.
 */
import { DisplayInfo } from '@shared/ipc'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayLike {
  id: number
  bounds: Bounds
  workArea: Bounds
  scaleFactor: number
}

export interface WindowPlan {
  game: { display: DisplayLike; bounds: Bounds; fullscreen: boolean }
  control: { display: DisplayLike; bounds: Bounds; maximize: boolean }
  /** İki pencere aynı monitörde. */
  shared: boolean
}

export function pickGameDisplay(displays: readonly DisplayLike[], primaryId: number, preferredId: number | null): DisplayLike {
  const primary = displays.find((d) => d.id === primaryId) ?? displays[0]
  const preferred = preferredId === null ? undefined : displays.find((d) => d.id === preferredId)
  if (preferred) return preferred
  // Seçim yoksa ya da seçilen monitör artık takılı değilse: paylaşılan ekran DM'in ana ekranı olmasın.
  return displays.find((d) => d.id !== primary.id) ?? primary
}

export function pickControlDisplay(displays: readonly DisplayLike[], primaryId: number, game: DisplayLike): DisplayLike {
  const primary = displays.find((d) => d.id === primaryId) ?? displays[0]
  if (primary.id !== game.id) return primary
  return displays.find((d) => d.id !== game.id) ?? game
}

function centered(area: Bounds, width: number, height: number): Bounds {
  const w = Math.min(Math.round(width), area.width)
  const h = Math.min(Math.round(height), area.height)
  return { x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round((area.height - h) / 2), width: w, height: h }
}

/** Alanın `fraction` kadarına sığan en büyük 16:9 dikdörtgen, ortalanmış. */
function centered16by9(area: Bounds, fraction: number): Bounds {
  const width = Math.min(area.width * fraction, ((area.height * fraction) / 9) * 16)
  return centered(area, width, (width / 16) * 9)
}

export function planGameWindows(
  displays: readonly DisplayLike[],
  primaryId: number,
  settings: { gameDisplayId: number | null; gameFullscreen: boolean }
): WindowPlan {
  const gameDisplay = pickGameDisplay(displays, primaryId, settings.gameDisplayId)
  const controlDisplay = pickControlDisplay(displays, primaryId, gameDisplay)
  const shared = gameDisplay.id === controlDisplay.id

  if (!shared) {
    return {
      // Tam ekrandan çıkılınca pencerenin döneceği boyut da budur.
      game: { display: gameDisplay, bounds: centered16by9(gameDisplay.workArea, 0.8), fullscreen: settings.gameFullscreen },
      control: { display: controlDisplay, bounds: centered(controlDisplay.workArea, 1280, 800), maximize: true },
      shared
    }
  }

  // Tek monitör: oyun solda, kontrol paneli sağda yan yana.
  const area = gameDisplay.workArea
  const controlWidth = Math.min(Math.max(420, Math.round(area.width * 0.35)), Math.round(area.width / 2))
  const gameWidth = area.width - controlWidth
  return {
    game: {
      display: gameDisplay,
      bounds: { x: area.x, y: area.y, width: gameWidth, height: area.height },
      fullscreen: settings.gameFullscreen
    },
    control: {
      display: controlDisplay,
      bounds: { x: area.x + gameWidth, y: area.y, width: controlWidth, height: area.height },
      maximize: false
    },
    shared
  }
}

/** Ayarlardaki monitör listesi: soldan sağa numaralanır, çözünürlük fiziksel pikseldir. */
export function describeDisplays(displays: readonly DisplayLike[], primaryId: number): DisplayInfo[] {
  return [...displays]
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((display, index) => {
      const width = Math.round(display.bounds.width * display.scaleFactor)
      const height = Math.round(display.bounds.height * display.scaleFactor)
      const primary = display.id === primaryId
      return { id: display.id, label: `${index + 1}: ${width}x${height}${primary ? ' (ana)' : ''}`, width, height, primary }
    })
}
