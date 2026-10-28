import { describe, expect, it } from 'vitest'
import {
  activeScene,
  CATEGORIES,
  categoryInfo,
  containRect,
  coverRect,
  filledPlayers,
  findImage,
  findScene,
  isPlayerFilled,
  isPlayerPristine,
  playArea,
  portraitColumnWidth,
  Rect,
  scenesUsingImage
} from '@shared/layout'
import {
  AppState,
  createEmptyPlayer,
  createInitialAppState,
  LibraryImage,
  PORTRAIT_COLUMN_WIDTH,
  SceneWindow,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  StageItem
} from '@shared/types'

const FULL_STAGE: Rect = { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT }
const BESIDE_PORTRAITS: Rect = {
  x: PORTRAIT_COLUMN_WIDTH,
  y: 0,
  width: STAGE_WIDTH - PORTRAIT_COLUMN_WIDTH,
  height: STAGE_HEIGHT
}

function image(id: string, kind: LibraryImage['kind'], width = 800, height = 600): LibraryImage {
  return { id, kind, fileName: `${id}.png`, originalName: id, width, height, addedAt: '2026-01-01T00:00:00.000Z' }
}

function stageItem(id: string, imageId: string): StageItem {
  return { id, imageId, x: 0, y: 0, width: 100, height: 100, rotation: 0, label: '' }
}

function scene(id: string, background: StageItem | null, items: StageItem[]): SceneWindow {
  return { id, name: id, hotkey: null, background, videoTrackId: null, items }
}

function appWith(patch: Partial<AppState>): AppState {
  return { ...createInitialAppState(), ...patch }
}

function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

describe('isPlayerFilled', () => {
  it('boş kart dolu sayılmaz', () => {
    expect(isPlayerFilled(createEmptyPlayer())).toBe(false)
  })

  it('yalnızca adı olan kart doludur', () => {
    expect(isPlayerFilled({ ...createEmptyPlayer(), name: 'Aragorn' })).toBe(true)
  })

  it('yalnızca portresi olan kart doludur', () => {
    expect(isPlayerFilled({ ...createEmptyPlayer(), portraitId: 'p1' })).toBe(true)
  })

  it('adı yalnızca boşluk olan kart dolu sayılmaz', () => {
    expect(isPlayerFilled({ ...createEmptyPlayer(), name: '   ' })).toBe(false)
  })

  it('seviye, can ve not kartı doldurmaz', () => {
    expect(isPlayerFilled({ ...createEmptyPlayer(), level: 7, hp: 3, note: 'not' })).toBe(false)
  })
})

describe('isPlayerPristine', () => {
  it('yalnızca hiçbir alanı dolu olmayan kartı boş sayar', () => {
    const empty = createEmptyPlayer()
    expect(isPlayerPristine(empty)).toBe(true)
    expect(isPlayerPristine({ ...empty, name: ' ' })).toBe(false)
    expect(isPlayerPristine({ ...empty, note: 'not' })).toBe(false)
    expect(isPlayerPristine({ ...empty, level: 2 })).toBe(false)
    expect(isPlayerPristine({ ...empty, hp: empty.hp - 1 })).toBe(false)
    expect(isPlayerPristine({ ...empty, portraitId: 'p' })).toBe(false)
  })

  it('oyunda görünmeyen ama notu kalmış kart boş değildir', () => {
    const player = { ...createEmptyPlayer(), note: 'oyunda alındı' }
    expect(isPlayerFilled(player)).toBe(false)
    expect(isPlayerPristine(player)).toBe(false)
  })
})

describe('filledPlayers ve portraitColumnWidth', () => {
  it('dolu kartları yuva numarasıyla döndürür', () => {
    const players = [
      createEmptyPlayer(),
      { ...createEmptyPlayer(), name: 'Legolas' },
      createEmptyPlayer(),
      { ...createEmptyPlayer(), portraitId: 'p1' }
    ]
    const filled = filledPlayers(appWith({ players }))
    expect(filled.map((entry) => entry.slot)).toEqual([1, 3])
    expect(filled[0].player).toBe(players[1])
  })

  it('dolu kart yoksa sütun genişliği 0, varsa sabit genişliktir', () => {
    expect(portraitColumnWidth(createInitialAppState())).toBe(0)
    const players = [{ ...createEmptyPlayer(), name: 'Gimli' }, createEmptyPlayer(), createEmptyPlayer(), createEmptyPlayer()]
    expect(portraitColumnWidth(appWith({ players }))).toBe(PORTRAIT_COLUMN_WIDTH)
  })
})

describe('playArea', () => {
  it('dolu kart yokken bütün sahneyi kaplar', () => {
    expect(playArea(createInitialAppState())).toEqual(FULL_STAGE)
  })

  it('en az bir dolu kart varken portre sütununun sağında kalır', () => {
    const players = [createEmptyPlayer(), createEmptyPlayer(), { ...createEmptyPlayer(), name: 'Frodo' }, createEmptyPlayer()]
    expect(playArea(appWith({ players }))).toEqual({ x: 300, y: 0, width: 1620, height: 1080 })
  })

  it('dolu kart sayısı arttıkça alan değişmez', () => {
    const one = [{ ...createEmptyPlayer(), name: 'A' }, createEmptyPlayer(), createEmptyPlayer(), createEmptyPlayer()]
    const four = Array.from({ length: 4 }, (_, index) => ({ ...createEmptyPlayer(), name: `P${index}` }))
    expect(playArea(appWith({ players: four }))).toEqual(playArea(appWith({ players: one })))
  })
})

describe('coverRect', () => {
  it('aynı orandaki görsel alanı tam doldurur', () => {
    expect(coverRect(3840, 2160, FULL_STAGE)).toEqual(FULL_STAGE)
  })

  it('alandan geniş görselde yükseklik oturur, yanlar taşar', () => {
    const rect = coverRect(4000, 1000, FULL_STAGE)
    expect(rect.height).toBeCloseTo(1080)
    expect(rect.width).toBeCloseTo(4320)
    expect(rect.x).toBeCloseTo(-1200)
    expect(rect.y).toBeCloseTo(0)
  })

  it('alandan dar görselde genişlik oturur, üst ve alt taşar', () => {
    const rect = coverRect(1000, 1000, BESIDE_PORTRAITS)
    expect(rect).toEqual({ x: 300, y: -270, width: 1620, height: 1620 })
  })

  it.each([
    [1920, 1080],
    [800, 600],
    [300, 900],
    [5000, 400],
    [64, 64]
  ])('%ix%i görselde oranı korur, alanı tamamen kaplar ve ortalar', (width, height) => {
    for (const area of [FULL_STAGE, BESIDE_PORTRAITS]) {
      const rect = coverRect(width, height, area)
      expect(rect.width / rect.height).toBeCloseTo(width / height)
      expect(rect.width).toBeGreaterThanOrEqual(area.width - 1e-9)
      expect(rect.height).toBeGreaterThanOrEqual(area.height - 1e-9)
      expect(centerOf(rect).x).toBeCloseTo(centerOf(area).x)
      expect(centerOf(rect).y).toBeCloseTo(centerOf(area).y)
      // Kenarlardan en az biri alana tam oturur; gereğinden fazla büyütülmez.
      const fitsExactly = Math.abs(rect.width - area.width) < 1e-9 || Math.abs(rect.height - area.height) < 1e-9
      expect(fitsExactly).toBe(true)
    }
  })
})

describe('containRect', () => {
  it('dikey görseli alanın %60 yüksekliğine sığdırıp ortalar', () => {
    const rect = containRect(400, 800, BESIDE_PORTRAITS)
    expect(rect.width).toBeCloseTo(324)
    expect(rect.height).toBeCloseTo(648)
    expect(rect.x).toBeCloseTo(948)
    expect(rect.y).toBeCloseTo(216)
  })

  it('yatay görseli alanın %60 genişliğine sığdırır', () => {
    const rect = containRect(2000, 500, FULL_STAGE)
    expect(rect.width).toBeCloseTo(1152)
    expect(rect.height).toBeCloseTo(288)
  })

  it('küçük görseli de büyütür', () => {
    const rect = containRect(10, 10, FULL_STAGE)
    expect(rect.width).toBeCloseTo(648)
    expect(rect.height).toBeCloseTo(648)
  })

  it('fraction verilirse ona göre sığdırır', () => {
    const rect = containRect(1920, 1080, FULL_STAGE, 1)
    expect(rect.x).toBeCloseTo(0)
    expect(rect.y).toBeCloseTo(0)
    expect(rect.width).toBeCloseTo(1920)
    expect(rect.height).toBeCloseTo(1080)

    const quarter = containRect(1920, 1080, FULL_STAGE, 0.25)
    expect(quarter.width).toBeCloseTo(480)
    expect(quarter.height).toBeCloseTo(270)
  })

  it.each([
    [1920, 1080],
    [800, 600],
    [300, 900],
    [5000, 400],
    [64, 64]
  ])('%ix%i görselde oranı korur, alanın içinde kalır ve ortalar', (width, height) => {
    for (const area of [FULL_STAGE, BESIDE_PORTRAITS]) {
      const rect = containRect(width, height, area)
      expect(rect.width / rect.height).toBeCloseTo(width / height)
      expect(rect.width).toBeLessThanOrEqual(area.width * 0.6 + 1e-9)
      expect(rect.height).toBeLessThanOrEqual(area.height * 0.6 + 1e-9)
      expect(rect.x).toBeGreaterThanOrEqual(area.x)
      expect(centerOf(rect).x).toBeCloseTo(centerOf(area).x)
      expect(centerOf(rect).y).toBeCloseTo(centerOf(area).y)
    }
  })
})

describe('arama yardımcıları', () => {
  const library = [image('npc', 'npc'), image('place', 'place')]
  const scenes = [
    scene('s1', stageItem('b1', 'place'), [stageItem('a1', 'npc')]),
    scene('s2', null, [stageItem('c1', 'npc')]),
    scene('s3', stageItem('b3', 'place'), [])
  ]
  const app = appWith({ library, scenes, activeSceneId: 's2' })

  it('findImage kimliğe göre bulur; null ya da bilinmeyen kimlikte undefined döner', () => {
    expect(findImage(app, 'place')).toBe(library[1])
    expect(findImage(app, 'yok')).toBeUndefined()
    expect(findImage(app, null)).toBeUndefined()
  })

  it('findScene ve activeScene', () => {
    expect(findScene(app, 's3')).toBe(scenes[2])
    expect(findScene(app, 'yok')).toBeUndefined()
    expect(findScene(app, null)).toBeUndefined()
    expect(activeScene(app)).toBe(scenes[1])
    expect(activeScene(appWith({ scenes, activeSceneId: null }))).toBeUndefined()
  })

  it('scenesUsingImage arka planı ve üstteki görselleri birlikte sayar', () => {
    expect(scenesUsingImage(app, 'npc').map((entry) => entry.id)).toEqual(['s1', 's2'])
    expect(scenesUsingImage(app, 'place').map((entry) => entry.id)).toEqual(['s1', 's3'])
    expect(scenesUsingImage(app, 'yok')).toEqual([])
  })

  it('categoryInfo sekiz bölmeyi tanır, portreyi tanımaz', () => {
    expect(CATEGORIES).toHaveLength(8)
    expect(categoryInfo('place')?.role).toBe('background')
    expect(categoryInfo('scene')?.role).toBe('background')
    expect(categoryInfo('boss')?.role).toBe('overlay')
    expect(categoryInfo('portrait')).toBeUndefined()
  })
})
