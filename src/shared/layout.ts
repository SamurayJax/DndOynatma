/**
 * Durumdan türetilen bilgiler ve yerleşim hesapları. Saf fonksiyonlar; yan etki yok.
 */
import {
  AppState,
  ID,
  ImageKind,
  LibraryCategory,
  LibraryImage,
  PlayerProfile,
  PORTRAIT_COLUMN_WIDTH,
  SceneWindow,
  STAGE_HEIGHT,
  STAGE_WIDTH
} from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CategoryInfo {
  id: LibraryCategory
  label: string
  /** 'background': tıklanınca pencerenin arka planı olur. 'overlay': arka planın üstüne konur. */
  role: 'background' | 'overlay'
}

/** Kütüphane bölmeleri, kullanıcının belirlediği sırayla. */
export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'npc', label: "NPC'ler", role: 'overlay' },
  { id: 'merchant', label: 'Tüccarlar', role: 'overlay' },
  { id: 'place', label: 'Mekanlar', role: 'background' },
  { id: 'scene', label: 'Sahneler', role: 'background' },
  { id: 'enemy', label: 'Düşmanlar', role: 'overlay' },
  { id: 'boss', label: "Boss'lar", role: 'overlay' },
  { id: 'teamItem', label: 'Takım Eşyaları', role: 'overlay' },
  { id: 'item', label: 'İtemler', role: 'overlay' }
]

export function categoryInfo(kind: ImageKind): CategoryInfo | undefined {
  return CATEGORIES.find((c) => c.id === kind)
}

/** Portresi ya da adı olan kart "dolu" sayılır ve oyunda görünür. */
export function isPlayerFilled(player: PlayerProfile): boolean {
  return player.portraitId !== null || player.name.trim() !== ''
}

/** Dolu oyuncular, yuva numaralarıyla (0..3) birlikte. */
export function filledPlayers(app: AppState): { slot: number; player: PlayerProfile }[] {
  return app.players.map((player, slot) => ({ slot, player })).filter((p) => isPlayerFilled(p.player))
}

/** Portre sütununun o anki genişliği: dolu profil yoksa 0. */
export function portraitColumnWidth(app: AppState): number {
  return filledPlayers(app).length > 0 ? PORTRAIT_COLUMN_WIDTH : 0
}

/** Görsellerin konabildiği alan (sanal koordinat). Portre sütununun sağında kalan bölge. */
export function playArea(app: AppState): Rect {
  const left = portraitColumnWidth(app)
  return { x: left, y: 0, width: STAGE_WIDTH - left, height: STAGE_HEIGHT }
}

export function findImage(app: AppState, imageId: ID | null): LibraryImage | undefined {
  return imageId === null ? undefined : app.library.find((i) => i.id === imageId)
}

export function findScene(app: AppState, sceneId: ID | null): SceneWindow | undefined {
  return sceneId === null ? undefined : app.scenes.find((s) => s.id === sceneId)
}

export function activeScene(app: AppState): SceneWindow | undefined {
  return findScene(app, app.activeSceneId)
}

/** Görseli oranını bozmadan alanı tamamen kaplayacak şekilde ortalar (taşan kısım kırpılır). */
export function coverRect(imageWidth: number, imageHeight: number, area: Rect): Rect {
  const scale = Math.max(area.width / imageWidth, area.height / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height }
}

/** Görseli oranını bozmadan alanın `fraction` kadarına sığdırıp ortalar. Yeni konan görseller için. */
export function containRect(imageWidth: number, imageHeight: number, area: Rect, fraction = 0.6): Rect {
  const scale = Math.min((area.width * fraction) / imageWidth, (area.height * fraction) / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height }
}

/** Bir görselin hangi pencerelerde kullanıldığı (silme uyarısı için). */
export function scenesUsingImage(app: AppState, imageId: ID): SceneWindow[] {
  return app.scenes.filter(
    (s) => s.background?.imageId === imageId || s.items.some((item) => item.imageId === imageId)
  )
}
