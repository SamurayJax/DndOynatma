import { describe, expect, it } from 'vitest'
import { Action } from '@shared/actions'
import { ErrorCode } from '@shared/errors'
import { containRect, coverRect, Rect } from '@shared/layout'
import { reduce, TEXT_LIMITS } from '@shared/reducer'
import {
  AmbientSound,
  createEmptyMusic,
  createEmptyPlayer,
  createStoppedPlayback,
  MusicLibrary,
  MusicTrack,
  createInitialState,
  FullState,
  ImageKind,
  LibraryImage,
  MAX_HP,
  MAX_LEVEL,
  MIN_ITEM_SIZE,
  MIN_LEVEL,
  PlayerProfile,
  SceneWindow,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  StageItem
} from '@shared/types'

// --- Test düzeneği -----------------------------------------------------------

/** Dolu oyuncu varken oyun alanı: portre sütununun sağı. */
const AREA: Rect = { x: 300, y: 0, width: 1620, height: 1080 }
const FULL_STAGE: Rect = { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT }

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function image(id: string, kind: ImageKind, width: number, height: number): LibraryImage {
  return { id, kind, fileName: `${id}.png`, originalName: id, width, height, addedAt: '2026-01-01T00:00:00.000Z' }
}

function contained(id: string, source: LibraryImage, label = ''): StageItem {
  return { id, imageId: source.id, ...containRect(source.width, source.height, AREA), rotation: 0, label }
}

function covering(id: string, source: LibraryImage): StageItem {
  return { id, imageId: source.id, ...coverRect(source.width, source.height, AREA), rotation: 0, label: '' }
}

const NPC = image('npc', 'npc', 400, 800)
const PLACE = image('place', 'place', 1920, 1080)
const SCENE = image('scene', 'scene', 1000, 1000)
const ITEM = image('item', 'item', 200, 100)
const TEAM = image('team', 'teamItem', 300, 300)
/** Yalnızca 0. oyuncu kullanır. */
const PORTRAIT_SOLO = image('por-solo', 'portrait', 512, 512)
/** 1. ve 2. oyuncu ortak kullanır. */
const PORTRAIT_SHARED = image('por-shared', 'portrait', 512, 512)
/** Yüklenmiş ama henüz kimseye bağlanmamış. */
const PORTRAIT_SPARE = image('por-spare', 'portrait', 512, 512)

const TRACK_A: MusicTrack = { id: 'ta', fileName: 'ta.mp3', originalName: 'Taverna', hasVideo: false, loop: null, addedAt: '2026-10-28T10:00:00.000Z' }
const TRACK_B: MusicTrack = { id: 'tb', fileName: 'tb.ogg', originalName: 'Savaş', hasVideo: false, loop: null, addedAt: '2026-10-28T10:00:00.000Z' }
const TRACK_V: MusicTrack = { id: 'tv', fileName: 'tv.mp4', originalName: 'Şömine', hasVideo: true, loop: { start: 2, end: 8 }, addedAt: '2026-10-28T10:00:00.000Z' }
const AMBIENT: AmbientSound = { id: 'am1', name: 'Kuş sesi', fileName: 'am1.mp3', volume: 0.8, addedAt: '2026-10-28T10:00:00.000Z' }

function sampleMusic(): MusicLibrary {
  return { ...createEmptyMusic(), tracks: [TRACK_A, TRACK_B, TRACK_V].map((track) => ({ ...track })), ambients: [{ ...AMBIENT }] }
}

/**
 * Her işlemin dokunabileceği bir şey olan dolu durum. Dondurulmuş döner; reducer girdiyi
 * değiştirmeye kalkarsa (ES modülleri strict olduğu için) test TypeError ile düşer.
 */
function makeState(): FullState {
  const players: PlayerProfile[] = [
    {
      ...createEmptyPlayer(),
      portraitId: PORTRAIT_SOLO.id,
      name: 'Aragorn',
      level: 5,
      hp: 7,
      note: 'kılıcı var',
      classId: 'savasci',
      abilities: { ...createEmptyPlayer().abilities, str: 15 },
      effects: [{ id: 'iyi-rol', label: 'İyi rol', value: 2, rolls: 1 }]
    },
    { ...createEmptyPlayer(), portraitId: PORTRAIT_SHARED.id, name: 'Legolas', level: 4, hp: MAX_HP, note: '' },
    { ...createEmptyPlayer(), portraitId: PORTRAIT_SHARED.id, name: '', level: 1, hp: 0, note: '' },
    createEmptyPlayer()
  ]
  const scenes: SceneWindow[] = [
    {
      id: 's1',
      name: 'Kraliyet İçi',
      hotkey: 1,
      background: covering('b1', PLACE),
      videoTrackId: null,
      items: [contained('a1', NPC, '7 LVL'), contained('a2', ITEM), contained('a3', NPC)]
    },
    { id: 's2', name: 'Orman Yolu', hotkey: 2, background: null, videoTrackId: null, items: [contained('c1', ITEM)] },
    { id: 's3', name: 'Köy', hotkey: null, background: covering('b3', SCENE), videoTrackId: null, items: [] }
  ]
  return deepFreeze({
    app: {
      schema: 1,
      players,
      library: [NPC, PLACE, SCENE, ITEM, TEAM, PORTRAIT_SOLO, PORTRAIT_SHARED, PORTRAIT_SPARE].map((entry) => ({ ...entry })),
      scenes,
      activeSceneId: 's1',
      generalNote: 'genel not',
      settings: { gameDisplayId: null, controlDisplayId: null, gameFullscreen: true },
      music: sampleMusic(),
      classes: [{ id: 'savasci', name: 'Savaşçı', skills: [{ id: 'ac', name: 'Ac', ability: 'str', requirement: 10 }, { id: 'kos', name: 'Koş', ability: 'dex', requirement: 12 }] }]
    },
    session: {
      phase: 'playing',
      tool: 'pen-red',
      penWidth: 'medium',
      drawingNonce: 3,
      diceHistory: [],
      playback: { ...createStoppedPlayback(), trackId: 'ta', playing: true, seekNonce: 2, ambientIds: ['am1'] }
    }
  })
}

function emptyState(): FullState {
  return deepFreeze(createInitialState())
}

/** Bilerek yanlış tipte işlem göndermek için. */
function bad(action: unknown): Action {
  return action as Action
}

/** İşlem durumu değiştirmeli ve sorun bildirmemeli. Sonuç da dondurulur ki zincirleme adımlar da denetlensin. */
function apply(state: FullState, action: Action): FullState {
  const result = reduce(state, action)
  expect(result.issue).toBeUndefined()
  expect(result.state).not.toBe(state)
  return deepFreeze(result.state)
}

/** İşlem hiçbir şey değiştirmemeli: aynı nesne dönmeli, sorun da olmamalı. */
function expectNoop(state: FullState, action: Action): void {
  const result = reduce(state, action)
  expect(result.state).toBe(state)
  expect(result.issue).toBeUndefined()
}

/** İşlem reddedilmeli: aynı nesne ve verilen kod. */
function expectRejected(state: FullState, action: Action, code: ErrorCode): void {
  const result = reduce(state, action)
  expect(result.state).toBe(state)
  expect(result.issue?.code).toBe(code)
  expect(result.issue?.detail).toEqual(expect.any(String))
  expect(result.issue?.detail).not.toBe('')
}

function sceneOf(state: FullState, sceneId: string): SceneWindow {
  const found = state.app.scenes.find((entry) => entry.id === sceneId)
  if (!found) throw new Error(`pencere yok: ${sceneId}`)
  return found
}

function itemOf(state: FullState, sceneId: string, itemId: string): StageItem {
  const owner = sceneOf(state, sceneId)
  const found = owner.items.find((entry) => entry.id === itemId) ?? (owner.background?.id === itemId ? owner.background : null)
  if (!found) throw new Error(`öğe yok: ${itemId}`)
  return found
}

function libraryIds(state: FullState): string[] {
  return state.app.library.map((entry) => entry.id)
}

function itemIds(state: FullState, sceneId: string): string[] {
  return sceneOf(state, sceneId).items.map((entry) => entry.id)
}

function centerOf(item: StageItem): { x: number; y: number } {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 }
}

function hasOnlyFiniteNumbers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'object' && value !== null) return Object.values(value).every(hasOnlyFiniteNumbers)
  return true
}

const INVALID_SLOTS: unknown[] = [-1, 4, 1.5, Number.NaN, '0', null, undefined]

// --- Genel kurallar ----------------------------------------------------------

/** Derleyici burada her işlem türünün yazılmasını zorunlu tutar; yeni tür eklenince test de güncellenir. */
const ALL_ACTION_TYPES: Record<Action['type'], true> = {
  'player/update': true,
  'player/setHp': true,
  'player/adjustHp': true,
  'player/clear': true,
  'library/add': true,
  'library/remove': true,
  'library/setKind': true,
  'scene/add': true,
  'scene/update': true,
  'scene/remove': true,
  'scene/setActive': true,
  'scene/activateHotkey': true,
  'stage/setBackground': true,
  'stage/clearBackground': true,
  'stage/addItem': true,
  'stage/updateItem': true,
  'stage/removeItem': true,
  'stage/reorderItem': true,
  'stage/clearItems': true,
  'stage/setCardMode': true,
  'stage/updateCard': true,
  'stage/adjustCardHp': true,
  'note/setGeneral': true,
  'settings/update': true,
  'session/setTool': true,
  'session/setPenWidth': true,
  'session/clearDrawing': true,
  'scene/setVideo': true,
  'music/addTracks': true,
  'music/removeTrack': true,
  'music/renameTrack': true,
  'music/moveTrack': true,
  'music/setLoop': true,
  'music/setVolume': true,
  'music/setAmbientVolume': true,
  'music/setRepeat': true,
  'ambient/add': true,
  'ambient/update': true,
  'ambient/remove': true,
  'playback/play': true,
  'playback/pause': true,
  'playback/resume': true,
  'playback/seek': true,
  'playback/next': true,
  'playback/previous': true,
  'playback/stop': true,
  'playback/ended': true,
  'ambient/toggle': true,
  'ambient/stopAll': true,
  'player/setAbility': true,
  'player/addEffect': true,
  'player/removeEffect': true,
  'player/consumeEffects': true,
  'class/add': true,
  'class/update': true,
  'class/remove': true,
  'class/move': true,
  'skill/add': true,
  'skill/update': true,
  'skill/remove': true,
  'skill/move': true
}

/** Her tür için değiştiren, değiştirmeyen ve reddedilen örnekler. */
function everyAction(): Action[] {
  return [
    { type: 'player/update', slot: 0, patch: { name: 'Boromir', level: 9, note: 'kalkan', portraitId: PORTRAIT_SPARE.id } },
    { type: 'player/update', slot: 0, patch: { portraitId: null } },
    { type: 'player/update', slot: 0, patch: {} },
    { type: 'player/update', slot: 9, patch: { name: 'x' } },
    bad({ type: 'player/update', slot: 0, patch: null }),
    bad({ type: 'player/update', slot: 0, patch: { name: 5, level: 'x', note: [], portraitId: 7 } }),
    { type: 'player/setHp', slot: 0, hp: 2 },
    { type: 'player/setHp', slot: 0, hp: 7 },
    { type: 'player/setHp', slot: 0, hp: Number.NaN },
    { type: 'player/setHp', slot: -1, hp: 2 },
    { type: 'player/adjustHp', slot: 0, delta: -3 },
    { type: 'player/adjustHp', slot: 1, delta: 5 },
    { type: 'player/adjustHp', slot: 0, delta: Number.POSITIVE_INFINITY },
    { type: 'player/clear', slot: 0 },
    { type: 'player/clear', slot: 3 },
    { type: 'player/clear', slot: 4 },
    { type: 'library/add', images: [image('new', 'boss', 640, 480), NPC] },
    { type: 'library/add', images: [NPC] },
    bad({ type: 'library/add', images: 'x' }),
    bad({ type: 'library/add', images: [null, { id: 'broken' }, image('zero', 'npc', 0, 10)] }),
    { type: 'library/remove', imageId: 'npc' },
    { type: 'library/remove', imageId: 'place' },
    { type: 'library/remove', imageId: PORTRAIT_SHARED.id },
    { type: 'library/remove', imageId: 'yok' },
    { type: 'library/setKind', imageId: 'item', kind: 'teamItem' },
    { type: 'library/setKind', imageId: 'team', kind: 'item' },
    { type: 'library/setKind', imageId: 'item', kind: 'item' },
    { type: 'library/setKind', imageId: 'npc', kind: 'item' },
    { type: 'library/setKind', imageId: 'yok', kind: 'item' },
    { type: 'scene/add', sceneId: 's4', name: '  Zindan  ' },
    { type: 'scene/add', sceneId: 's5', name: '' },
    { type: 'scene/add', sceneId: 's1', name: 'kopya' },
    bad({ type: 'scene/add', sceneId: 42, name: null }),
    { type: 'scene/update', sceneId: 's3', patch: { name: 'Liman', hotkey: 1 } },
    { type: 'scene/update', sceneId: 's1', patch: { hotkey: null } },
    { type: 'scene/update', sceneId: 's1', patch: { name: '   ' } },
    { type: 'scene/update', sceneId: 's1', patch: { hotkey: 12 } },
    { type: 'scene/update', sceneId: 'yok', patch: { name: 'x' } },
    bad({ type: 'scene/update', sceneId: 's1', patch: 'x' }),
    { type: 'scene/remove', sceneId: 's1' },
    { type: 'scene/remove', sceneId: 's2' },
    { type: 'scene/remove', sceneId: 'yok' },
    { type: 'scene/setActive', sceneId: 's2' },
    { type: 'scene/setActive', sceneId: 's1' },
    { type: 'scene/setActive', sceneId: 'yok' },
    { type: 'scene/activateHotkey', hotkey: 2 },
    { type: 'scene/activateHotkey', hotkey: 1 },
    { type: 'scene/activateHotkey', hotkey: 8 },
    bad({ type: 'scene/activateHotkey', hotkey: null }),
    { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb1', imageId: 'scene' },
    { type: 'stage/setBackground', sceneId: 's2', fallbackSceneId: 'f1', itemId: 'nb2', imageId: 'place' },
    { type: 'stage/setBackground', sceneId: 'yok', fallbackSceneId: 'f1', itemId: 'nb3', imageId: 'place' },
    { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb4', imageId: PORTRAIT_SOLO.id },
    { type: 'stage/clearBackground', sceneId: 's1' },
    { type: 'stage/clearBackground', sceneId: 's2' },
    { type: 'stage/clearBackground', sceneId: 'yok' },
    { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'npc' },
    { type: 'stage/addItem', sceneId: 's3', fallbackSceneId: 'f1', itemId: 'n2', imageId: 'team' },
    { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'a1', imageId: 'npc' },
    { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n3', imageId: 'yok' },
    { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: 10, y: 20, width: 500, height: 3, rotation: 0, label: 'etiket' } },
    { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { height: 2000 } },
    { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: {} },
    { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: Number.NaN } },
    { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width: 0 } },
    { type: 'stage/updateItem', sceneId: 's1', itemId: 'yok', patch: { x: 1 } },
    { type: 'stage/updateItem', sceneId: 'yok', itemId: 'a1', patch: { x: 1 } },
    bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: undefined }),
    { type: 'stage/removeItem', sceneId: 's1', itemId: 'a2' },
    { type: 'stage/removeItem', sceneId: 's1', itemId: 'b1' },
    { type: 'stage/removeItem', sceneId: 's1', itemId: 'yok' },
    { type: 'stage/removeItem', sceneId: 'yok', itemId: 'a2' },
    { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a1', to: 'front' },
    { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a3', to: 'back' },
    { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a2', to: 'forward' },
    { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a2', to: 'backward' },
    { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a3', to: 'front' },
    { type: 'stage/reorderItem', sceneId: 's1', itemId: 'b1', to: 'front' },
    { type: 'stage/reorderItem', sceneId: 's1', itemId: 'yok', to: 'front' },
    bad({ type: 'stage/reorderItem', sceneId: 's1', itemId: 'a1', to: 'up' }),
    { type: 'stage/clearItems', sceneId: 's1' },
    { type: 'stage/clearItems', sceneId: 's3' },
    { type: 'stage/clearItems', sceneId: 'yok' },
    { type: 'stage/setCardMode', sceneId: 's1', itemId: 'a1', enabled: true },
    { type: 'stage/setCardMode', sceneId: 's1', itemId: 'yok', enabled: true },
    { type: 'stage/updateCard', sceneId: 's1', itemId: 'a1', patch: { hp: 1 } },
    { type: 'stage/updateCard', sceneId: 'yok', itemId: 'a1', patch: { hp: 1 } },
    { type: 'stage/adjustCardHp', sceneId: 's1', itemId: 'a1', delta: -1 },
    { type: 'stage/adjustCardHp', sceneId: 's1', itemId: 'yok', delta: -1 },
    { type: 'note/setGeneral', text: 'yeni not' },
    { type: 'note/setGeneral', text: 'genel not' },
    bad({ type: 'note/setGeneral', text: 5 }),
    { type: 'settings/update', patch: { gameDisplayId: 2, controlDisplayId: null, gameFullscreen: false } },
    { type: 'settings/update', patch: {} },
    bad({ type: 'settings/update', patch: { gameDisplayId: 'x', gameFullscreen: 1 } }),
    { type: 'session/setTool', tool: 'mouse' },
    { type: 'session/setTool', tool: 'pen-black' },
    { type: 'session/setTool', tool: 'pen-red' },
    { type: 'session/setTool', tool: 'eraser' },
    bad({ type: 'session/setTool', tool: 'firca' }),
    { type: 'session/setPenWidth', width: 'thick' },
    { type: 'session/setPenWidth', width: 'medium' },
    bad({ type: 'session/setPenWidth', width: 'dev' }),
    { type: 'session/clearDrawing' },
    { type: 'scene/setVideo', sceneId: 's2', trackId: 'tv' },
    { type: 'scene/setVideo', sceneId: 's1', trackId: 'tv' },
    { type: 'scene/setVideo', sceneId: 's2', trackId: null },
    { type: 'scene/setVideo', sceneId: 's2', trackId: 'ta' },
    { type: 'scene/setVideo', sceneId: 's2', trackId: 'yok' },
    { type: 'scene/setVideo', sceneId: 'yok', trackId: 'tv' },
    { type: 'music/addTracks', tracks: [{ ...TRACK_A, id: 'yeni', fileName: 'yeni.mp3' }] },
    { type: 'music/addTracks', tracks: [{ ...TRACK_A }] },
    bad({ type: 'music/addTracks', tracks: 'x' }),
    bad({ type: 'music/addTracks', tracks: [{ id: 'eksik' }] }),
    { type: 'music/removeTrack', trackId: 'ta' },
    { type: 'music/removeTrack', trackId: 'tv' },
    { type: 'music/removeTrack', trackId: 'yok' },
    { type: 'music/renameTrack', trackId: 'tb', name: 'Ejderha' },
    { type: 'music/renameTrack', trackId: 'tb', name: '  ' },
    bad({ type: 'music/renameTrack', trackId: 'tb', name: 3 }),
    { type: 'music/moveTrack', trackId: 'tb', to: 'up' },
    { type: 'music/moveTrack', trackId: 'ta', to: 'up' },
    { type: 'music/moveTrack', trackId: 'tv', to: 'down' },
    bad({ type: 'music/moveTrack', trackId: 'tb', to: 'yana' }),
    { type: 'music/setLoop', trackId: 'tv', loop: { start: 1, end: 3 } },
    { type: 'music/setLoop', trackId: 'tv', loop: { start: 2, end: 8 } },
    { type: 'music/setLoop', trackId: 'tv', loop: null },
    { type: 'music/setLoop', trackId: 'tv', loop: { start: 5, end: 5.1 } },
    { type: 'music/setLoop', trackId: 'ta', loop: { start: 1, end: 3 } },
    { type: 'music/setVolume', volume: 0.3 },
    { type: 'music/setVolume', volume: 7 },
    bad({ type: 'music/setVolume', volume: 'yüksek' }),
    { type: 'music/setAmbientVolume', volume: 0.25 },
    { type: 'music/setRepeat', repeat: 'one' },
    { type: 'music/setRepeat', repeat: 'all' },
    bad({ type: 'music/setRepeat', repeat: 'hep' }),
    { type: 'ambient/add', ambient: { ...AMBIENT, id: 'am2', fileName: 'am2.mp3', name: 'Yağmur' } },
    { type: 'ambient/add', ambient: { ...AMBIENT } },
    bad({ type: 'ambient/add', ambient: { id: 'eksik' } }),
    { type: 'ambient/update', ambientId: 'am1', patch: { name: 'Baykuş', volume: 0.5 } },
    { type: 'ambient/update', ambientId: 'am1', patch: { name: '' } },
    { type: 'ambient/update', ambientId: 'yok', patch: { volume: 1 } },
    { type: 'ambient/remove', ambientId: 'am1' },
    { type: 'ambient/remove', ambientId: 'yok' },
    { type: 'playback/play', trackId: 'tb' },
    { type: 'playback/play', trackId: 'yok' },
    { type: 'playback/pause' },
    { type: 'playback/resume' },
    { type: 'playback/seek', position: 42 },
    bad({ type: 'playback/seek', position: 'orta' }),
    { type: 'playback/next' },
    { type: 'playback/previous' },
    { type: 'playback/stop' },
    { type: 'playback/ended', trackId: 'ta' },
    { type: 'playback/ended', trackId: 'tb' },
    { type: 'ambient/toggle', ambientId: 'am1' },
    { type: 'ambient/toggle', ambientId: 'yok' },
    { type: 'ambient/stopAll' },
    { type: 'player/update', slot: 1, patch: { classId: 'savasci', proficiency: 4 } },
    { type: 'player/update', slot: 1, patch: { classId: 'yok' } },
    { type: 'player/update', slot: 0, patch: { classId: null, proficiency: null } },
    { type: 'player/setAbility', slot: 0, ability: 'dex', value: 18 },
    { type: 'player/setAbility', slot: 0, ability: 'str', value: 15 },
    bad({ type: 'player/setAbility', slot: 0, ability: 'sans', value: 12 }),
    { type: 'player/setAbility', slot: 9, ability: 'str', value: 12 },
    { type: 'player/addEffect', slot: 1, effect: { id: 'kirik-kol', label: 'Kırık kol', value: -2, rolls: null } },
    { type: 'player/addEffect', slot: 0, effect: { id: 'iyi-rol', label: 'İyi rol', value: 2, rolls: 1 } },
    { type: 'player/addEffect', slot: 0, effect: { id: 'sifir', label: 'Hiç', value: 0, rolls: 1 } },
    bad({ type: 'player/addEffect', slot: 0, effect: null }),
    { type: 'player/removeEffect', slot: 0, effectId: 'iyi-rol' },
    { type: 'player/removeEffect', slot: 0, effectId: 'yok' },
    { type: 'player/consumeEffects', slot: 0 },
    { type: 'player/consumeEffects', slot: 1 },
    { type: 'class/add', classId: 'buyucu', name: 'Büyücü' },
    { type: 'class/add', classId: 'savasci', name: 'Tekrar' },
    bad({ type: 'class/add', classId: '', name: 'x' }),
    { type: 'class/update', classId: 'savasci', name: 'Şövalye' },
    { type: 'class/update', classId: 'savasci', name: '   ' },
    { type: 'class/update', classId: 'yok', name: 'x' },
    { type: 'class/remove', classId: 'savasci' },
    { type: 'class/remove', classId: 'yok' },
    { type: 'class/move', classId: 'savasci', to: 'up' },
    bad({ type: 'class/move', classId: 'savasci', to: 'yana' }),
    { type: 'skill/add', classId: 'savasci', skill: { id: 'kalkan', name: 'Kalkan', ability: 'con', requirement: 11 } },
    { type: 'skill/add', classId: 'savasci', skill: { id: 'ac', name: 'Ac', ability: 'str', requirement: 10 } },
    bad({ type: 'skill/add', classId: 'savasci', skill: { id: 'x', name: 'x', ability: 'sans', requirement: 10 } }),
    { type: 'skill/update', classId: 'savasci', skillId: 'ac', patch: { requirement: 12, ability: 'dex' } },
    { type: 'skill/update', classId: 'savasci', skillId: 'ac', patch: { name: 'Ac', requirement: 10 } },
    { type: 'skill/update', classId: 'savasci', skillId: 'yok', patch: { name: 'x' } },
    { type: 'skill/remove', classId: 'savasci', skillId: 'kos' },
    { type: 'skill/remove', classId: 'savasci', skillId: 'yok' },
    { type: 'skill/move', classId: 'savasci', skillId: 'kos', to: 'up' },
    { type: 'skill/move', classId: 'savasci', skillId: 'ac', to: 'up' },
    bad({ type: 'bilinmeyen/islem' }),
    bad({}),
    bad(null),
    bad(undefined),
    bad('player/clear'),
    bad(42),
    bad([])
  ]
}

describe('genel kurallar', () => {
  it('örnek liste bütün işlem türlerini içerir', () => {
    const covered = new Set(
      everyAction()
        .map((action) => (action as { type?: unknown } | null)?.type)
        .filter((type) => typeof type === 'string')
    )
    for (const type of Object.keys(ALL_ACTION_TYPES)) expect(covered, type).toContain(type)
  })

  it('hiçbir işlem girdiyi değiştirmez (dolu durum)', () => {
    for (const action of everyAction()) {
      const state = makeState()
      const snapshot = structuredClone(state)
      expect(() => reduce(state, action), JSON.stringify(action)).not.toThrow()
      expect(state, JSON.stringify(action)).toEqual(snapshot)
    }
  })

  it('hiçbir işlem girdiyi değiştirmez (boş durum)', () => {
    for (const action of everyAction()) {
      const state = emptyState()
      const snapshot = structuredClone(state)
      expect(() => reduce(state, action), JSON.stringify(action)).not.toThrow()
      expect(state, JSON.stringify(action)).toEqual(snapshot)
    }
  })

  it('aynı girdiye aynı çıktıyı verir', () => {
    for (const action of everyAction()) {
      const first = reduce(makeState(), action)
      const second = reduce(makeState(), action)
      expect(second, JSON.stringify(action)).toEqual(first)
    }
  })

  it('içeriği aynı kalan durum için yeni nesne üretmez', () => {
    for (const state of [makeState(), emptyState()]) {
      for (const action of everyAction()) {
        const result = reduce(state, action)
        if (result.state !== state) expect(result.state, JSON.stringify(action)).not.toEqual(state)
      }
    }
  })

  it('sonuçta NaN ya da sonsuz sayı bırakmaz, oyuncu sayısını bozmaz', () => {
    for (const state of [makeState(), emptyState()]) {
      for (const action of everyAction()) {
        const result = reduce(state, action)
        expect(hasOnlyFiniteNumbers(result.state), JSON.stringify(action)).toBe(true)
        expect(result.state.app.players, JSON.stringify(action)).toHaveLength(4)
      }
    }
  })

  it('sorun bildiren her sonuçta bilinen bir kod ve Türkçe açıklama vardır', () => {
    for (const action of everyAction()) {
      const { issue } = reduce(makeState(), action)
      if (!issue) continue
      expect(issue.code).toMatch(/^DND-30[1-7]$/)
      expect(issue.detail.length).toBeGreaterThan(0)
    }
  })

  it('sorun ayrıntısında kullanıcı metni (isim, not, etiket, pencere adı, dosya adı) geçmez', () => {
    // Ayrıntılar log dosyasına yazılır; log kullanıcının yazdığı hiçbir metni içermemelidir.
    const base = makeState()
    const state = deepFreeze({
      ...base,
      app: { ...base.app, library: base.app.library.map((entry) => ({ ...entry, originalName: `ozel-dosya-${entry.id}` })) }
    })
    const secrets = ['Aragorn', 'Legolas', 'kılıcı var', 'Kraliyet', 'Orman Yolu', 'Köy', '7 LVL', 'genel not', 'ozel-dosya']
    const typed = ['Boromir', 'kalkan', 'Zindan', 'kopya', 'Liman', 'yeni not', 'Gizli Mahzen', 'Ejder Yuvası']
    const actions: Action[] = [
      ...everyAction(),
      { type: 'scene/update', sceneId: 's2', patch: { name: 'Gizli Mahzen', hotkey: 1 } },
      { type: 'scene/update', sceneId: 'yok', patch: { name: 'Gizli Mahzen' } },
      { type: 'stage/updateItem', sceneId: 's1', itemId: 'yok', patch: { label: 'Ejder Yuvası' } },
      bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { label: 'Ejder Yuvası', x: 'Boromir' } }),
      bad({ type: 'player/update', slot: 7, patch: { name: 'Boromir', note: 'kalkan' } }),
      bad({ type: 'note/setGeneral', text: ['yeni not'] })
    ]
    let issues = 0
    for (const action of actions) {
      const { issue } = reduce(state, action)
      if (!issue) continue
      issues += 1
      for (const text of [...secrets, ...typed]) expect(issue.detail, JSON.stringify(action)).not.toContain(text)
    }
    expect(issues).toBeGreaterThan(20)
  })

  it.each([[null], [undefined], [42], ['player/clear'], [true], [[]]])('nesne olmayan işlem (%j) DND-306 ile reddedilir', (action) => {
    expectRejected(makeState(), bad(action), 'DND-306')
  })

  it('türü bilinmeyen ya da olmayan işlem DND-306 ile reddedilir', () => {
    expectRejected(makeState(), bad({ type: 'bilinmeyen/islem' }), 'DND-306')
    expectRejected(makeState(), bad({}), 'DND-306')
    expectRejected(makeState(), bad({ type: 7 }), 'DND-306')
  })
})

// --- Oyuncular ---------------------------------------------------------------

describe('oyuncu yuvası denetimi', () => {
  it.each(INVALID_SLOTS.map((slot) => [slot]))('geçersiz yuva (%j) dört oyuncu işleminde de DND-307 verir', (slot) => {
    const state = makeState()
    expectRejected(state, bad({ type: 'player/update', slot, patch: { name: 'x' } }), 'DND-307')
    expectRejected(state, bad({ type: 'player/setHp', slot, hp: 1 }), 'DND-307')
    expectRejected(state, bad({ type: 'player/adjustHp', slot, delta: 1 }), 'DND-307')
    expectRejected(state, bad({ type: 'player/clear', slot }), 'DND-307')
  })

  it.each([[0], [1], [2], [3]])('%i numaralı yuva geçerlidir', (slot) => {
    const next = apply(makeState(), { type: 'player/update', slot, patch: { name: 'Yeni İsim' } })
    expect(next.app.players[slot].name).toBe('Yeni İsim')
  })
})

describe('player/update', () => {
  it('ismi 24 karaktere keser ama baştaki ve sondaki boşluğa dokunmaz', () => {
    const state = makeState()
    const long = apply(state, { type: 'player/update', slot: 3, patch: { name: `  ${'x'.repeat(30)}` } })
    expect(long.app.players[3].name).toBe(`  ${'x'.repeat(22)}`)
    expect(long.app.players[3].name).toHaveLength(TEXT_LIMITS.playerName)

    const typing = apply(state, { type: 'player/update', slot: 3, patch: { name: 'Gimli ' } })
    expect(typing.app.players[3].name).toBe('Gimli ')
  })

  it('keserken iki birimlik karakteri (emoji) ortadan bölmez', () => {
    const next = apply(makeState(), { type: 'player/update', slot: 3, patch: { name: `${'a'.repeat(23)}😀` } })
    expect(next.app.players[3].name).toBe('a'.repeat(23))
  })

  it('seviyeyi yuvarlar ve sınırlar', () => {
    const state = makeState()
    const level = (value: number): number =>
      reduce(state, { type: 'player/update', slot: 3, patch: { level: value } }).state.app.players[3].level
    expect(level(4.6)).toBe(5)
    expect(level(4.4)).toBe(4)
    expect(level(0)).toBe(MIN_LEVEL)
    expect(level(-20)).toBe(MIN_LEVEL)
    expect(level(150)).toBe(MAX_LEVEL)
    expect(level(MAX_LEVEL)).toBe(MAX_LEVEL)
  })

  it('notu 2000 karaktere keser', () => {
    const next = apply(makeState(), { type: 'player/update', slot: 0, patch: { note: 'n'.repeat(2500) } })
    expect(next.app.players[0].note).toBe('n'.repeat(2000))
  })

  it('birden çok alanı birlikte uygular, cana dokunmaz', () => {
    const next = apply(makeState(), { type: 'player/update', slot: 0, patch: { name: 'Boromir', level: 9, note: 'kalkan' } })
    expect(next.app.players[0]).toMatchObject({ portraitId: PORTRAIT_SOLO.id, name: 'Boromir', level: 9, hp: 7, note: 'kalkan', classId: 'savasci' })
  })

  it('yanlış tipteki alanları yok sayar', () => {
    const state = makeState()
    expectNoop(state, bad({ type: 'player/update', slot: 0, patch: { name: 5, level: '9', note: null, portraitId: 12 } }))
    expectNoop(state, { type: 'player/update', slot: 0, patch: { level: Number.NaN } })
    expectNoop(state, { type: 'player/update', slot: 0, patch: { level: Number.POSITIVE_INFINITY } })

    const mixed = apply(state, bad({ type: 'player/update', slot: 0, patch: { name: 'Boromir', level: 'x' } }))
    expect(mixed.app.players[0].name).toBe('Boromir')
    expect(mixed.app.players[0].level).toBe(5)
  })

  it('patch nesne değilse DND-306 verir', () => {
    expectRejected(makeState(), bad({ type: 'player/update', slot: 0, patch: null }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'player/update', slot: 0, patch: 'isim' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'player/update', slot: 0 }), 'DND-306')
  })

  it('değer aynıysa aynı durumu döndürür', () => {
    const state = makeState()
    expectNoop(state, { type: 'player/update', slot: 0, patch: {} })
    expectNoop(state, { type: 'player/update', slot: 0, patch: { name: 'Aragorn', level: 5, note: 'kılıcı var', portraitId: PORTRAIT_SOLO.id } })
    expectNoop(state, { type: 'player/update', slot: 0, patch: { level: 5.2 } })
    expectNoop(state, { type: 'player/update', slot: 3, patch: { portraitId: null } })
  })

  it('yalnızca değişen oyuncu yeni nesne olur', () => {
    const state = makeState()
    const next = apply(state, { type: 'player/update', slot: 1, patch: { level: 6 } })
    expect(next.app.players[0]).toBe(state.app.players[0])
    expect(next.app.players[1]).not.toBe(state.app.players[1])
    expect(next.app.players[2]).toBe(state.app.players[2])
    expect(next.app.library).toBe(state.app.library)
    expect(next.app.scenes).toBe(state.app.scenes)
    expect(next.app.settings).toBe(state.app.settings)
    expect(next.session).toBe(state.session)
  })

  describe('portre', () => {
    it('türü portre olan görseli bağlar', () => {
      const state = makeState()
      const next = apply(state, { type: 'player/update', slot: 3, patch: { portraitId: PORTRAIT_SPARE.id } })
      expect(next.app.players[3].portraitId).toBe(PORTRAIT_SPARE.id)
      expect(next.app.library).toBe(state.app.library)
    })

    it('portre olmayan ya da bilinmeyen görseli yok sayar', () => {
      const state = makeState()
      expectNoop(state, { type: 'player/update', slot: 3, patch: { portraitId: 'npc' } })
      expectNoop(state, { type: 'player/update', slot: 3, patch: { portraitId: 'yok' } })
      expectNoop(state, { type: 'player/update', slot: 0, patch: { portraitId: 'place' } })
    })

    it('geçersiz portre diğer alanların uygulanmasını engellemez', () => {
      const next = apply(makeState(), { type: 'player/update', slot: 0, patch: { name: 'Boromir', portraitId: 'npc' } })
      expect(next.app.players[0].name).toBe('Boromir')
      expect(next.app.players[0].portraitId).toBe(PORTRAIT_SOLO.id)
      expect(libraryIds(next)).toContain(PORTRAIT_SOLO.id)
    })

    it('portre kaldırılınca başka kullanan yoksa görsel kütüphaneden çıkar', () => {
      const state = makeState()
      const next = apply(state, { type: 'player/update', slot: 0, patch: { portraitId: null } })
      expect(next.app.players[0].portraitId).toBeNull()
      expect(libraryIds(next)).not.toContain(PORTRAIT_SOLO.id)
      expect(next.app.library).toHaveLength(state.app.library.length - 1)
    })

    it('portre değişince eski görsel kütüphaneden çıkar, yenisi kalır', () => {
      const next = apply(makeState(), { type: 'player/update', slot: 0, patch: { portraitId: PORTRAIT_SPARE.id } })
      expect(next.app.players[0].portraitId).toBe(PORTRAIT_SPARE.id)
      expect(libraryIds(next)).not.toContain(PORTRAIT_SOLO.id)
      expect(libraryIds(next)).toContain(PORTRAIT_SPARE.id)
    })

    it('başka oyuncunun da kullandığı portre kütüphanede kalır; son kullanan bırakınca çıkar', () => {
      const state = makeState()
      const first = apply(state, { type: 'player/update', slot: 1, patch: { portraitId: null } })
      expect(libraryIds(first)).toContain(PORTRAIT_SHARED.id)
      expect(first.app.library).toBe(state.app.library)

      const second = apply(first, { type: 'player/update', slot: 2, patch: { portraitId: null } })
      expect(libraryIds(second)).not.toContain(PORTRAIT_SHARED.id)
    })

    it('portre olmayan görseller ve kimseye bağlı olmayan portreler temizlikten etkilenmez', () => {
      const next = apply(makeState(), { type: 'player/update', slot: 0, patch: { portraitId: null } })
      expect(libraryIds(next)).toEqual(['npc', 'place', 'scene', 'item', 'team', PORTRAIT_SHARED.id, PORTRAIT_SPARE.id])
    })

    it('eski portre kimliği portre olmayan bir görseli gösteriyorsa o görsel silinmez', () => {
      const base = makeState()
      const broken = deepFreeze({
        ...base,
        app: { ...base.app, players: base.app.players.map((player, slot) => (slot === 3 ? { ...player, portraitId: 'npc' } : player)) }
      })
      const next = apply(broken, { type: 'player/update', slot: 3, patch: { portraitId: null } })
      expect(libraryIds(next)).toContain('npc')
    })
  })
})

describe('player/setHp', () => {
  it('yuvarlar ve 0..MAX_HP arasına sınırlar', () => {
    const state = makeState()
    const hp = (value: number): number => reduce(state, { type: 'player/setHp', slot: 0, hp: value }).state.app.players[0].hp
    expect(hp(3)).toBe(3)
    expect(hp(3.6)).toBe(4)
    expect(hp(-5)).toBe(0)
    expect(hp(99)).toBe(MAX_HP)
    expect(hp(0)).toBe(0)
  })

  it('değer aynıysa aynı durumu döndürür', () => {
    const state = makeState()
    expectNoop(state, { type: 'player/setHp', slot: 0, hp: 7 })
    expectNoop(state, { type: 'player/setHp', slot: 0, hp: 7.3 })
    expectNoop(state, { type: 'player/setHp', slot: 1, hp: 500 })
    expectNoop(state, { type: 'player/setHp', slot: 2, hp: -1 })
  })

  it('sayı olmayan can DND-306 verir', () => {
    const state = makeState()
    expectRejected(state, { type: 'player/setHp', slot: 0, hp: Number.NaN }, 'DND-306')
    expectRejected(state, { type: 'player/setHp', slot: 0, hp: Number.POSITIVE_INFINITY }, 'DND-306')
    expectRejected(state, bad({ type: 'player/setHp', slot: 0, hp: '5' }), 'DND-306')
    expectRejected(state, bad({ type: 'player/setHp', slot: 0 }), 'DND-306')
  })

  it('boş karta da uygulanır', () => {
    const next = apply(makeState(), { type: 'player/setHp', slot: 3, hp: 4 })
    expect(next.app.players[3]).toEqual({ ...createEmptyPlayer(), hp: 4 })
  })
})

describe('player/adjustHp', () => {
  it('farkı ekler ve sınırlar', () => {
    const state = makeState()
    const hp = (delta: number): number => reduce(state, { type: 'player/adjustHp', slot: 0, delta }).state.app.players[0].hp
    expect(hp(-5)).toBe(2)
    expect(hp(2)).toBe(9)
    expect(hp(99)).toBe(MAX_HP)
    expect(hp(-99)).toBe(0)
    expect(hp(1.5)).toBe(9)
  })

  it('sınırdayken ya da fark sıfırken aynı durumu döndürür', () => {
    const state = makeState()
    expectNoop(state, { type: 'player/adjustHp', slot: 0, delta: 0 })
    expectNoop(state, { type: 'player/adjustHp', slot: 0, delta: 0.4 })
    expectNoop(state, { type: 'player/adjustHp', slot: 1, delta: 1 })
    expectNoop(state, { type: 'player/adjustHp', slot: 2, delta: -1 })
  })

  it('sayı olmayan fark DND-306 verir', () => {
    expectRejected(makeState(), { type: 'player/adjustHp', slot: 0, delta: Number.NaN }, 'DND-306')
    expectRejected(makeState(), bad({ type: 'player/adjustHp', slot: 0, delta: '-5' }), 'DND-306')
  })
})

describe('player/clear', () => {
  it('kartı boşaltır ve kimsenin kullanmadığı portreyi kütüphaneden çıkarır', () => {
    const next = apply(makeState(), { type: 'player/clear', slot: 0 })
    expect(next.app.players[0]).toEqual(createEmptyPlayer())
    expect(libraryIds(next)).not.toContain(PORTRAIT_SOLO.id)
  })

  it('ortak portre başka oyuncuda duruyorsa kütüphanede kalır', () => {
    const state = makeState()
    const next = apply(state, { type: 'player/clear', slot: 1 })
    expect(next.app.players[1]).toEqual(createEmptyPlayer())
    expect(next.app.library).toBe(state.app.library)
    expect(next.app.players[2]).toBe(state.app.players[2])
  })

  it('zaten boş kartta aynı durumu döndürür', () => {
    expectNoop(makeState(), { type: 'player/clear', slot: 3 })
  })
})

// --- Kütüphane ---------------------------------------------------------------

describe('library/add', () => {
  it('görselleri sona ekler', () => {
    const state = makeState()
    const boss = image('boss', 'boss', 640, 480)
    const portrait = image('por-new', 'portrait', 256, 256)
    const next = apply(state, { type: 'library/add', images: [boss, portrait] })
    expect(libraryIds(next)).toEqual([...libraryIds(state), 'boss', 'por-new'])
    expect(next.app.library.at(-2)).toEqual(boss)
    expect(next.app.library[0]).toBe(state.app.library[0])
    expect(next.app.scenes).toBe(state.app.scenes)
    expect(next.app.players).toBe(state.app.players)
  })

  it('kimliği zaten olanları atlar', () => {
    const state = makeState()
    const next = apply(state, { type: 'library/add', images: [image('npc', 'boss', 1, 1), image('boss', 'boss', 640, 480)] })
    expect(libraryIds(next)).toEqual([...libraryIds(state), 'boss'])
    expect(next.app.library[0]).toBe(state.app.library[0])
  })

  it('aynı işlemde tekrar eden kimliği bir kez ekler', () => {
    const state = makeState()
    const next = apply(state, { type: 'library/add', images: [image('boss', 'boss', 640, 480), image('boss', 'enemy', 10, 10)] })
    expect(next.app.library).toHaveLength(state.app.library.length + 1)
    expect(next.app.library.at(-1)?.kind).toBe('boss')
  })

  it('eklenecek yeni görsel yoksa aynı durumu döndürür', () => {
    expectNoop(makeState(), { type: 'library/add', images: [] })
    expectNoop(makeState(), { type: 'library/add', images: [NPC, PLACE] })
  })

  it('images dizi değilse DND-306 verir', () => {
    expectRejected(makeState(), bad({ type: 'library/add', images: NPC }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'library/add' }), 'DND-306')
  })

  it('hatalı kayıtları atlar, sağlamları ekler ve DND-306 bildirir', () => {
    const state = makeState()
    const broken: unknown[] = [
      null,
      'npc',
      { id: 'eksik' },
      image('', 'npc', 10, 10),
      image('sifir-en', 'npc', 0, 10),
      image('eksi-boy', 'npc', 10, -1),
      { ...image('nan', 'npc', 10, 10), width: Number.NaN },
      { ...image('tur', 'npc', 10, 10), kind: 'dragon' },
      { ...image('dosya', 'npc', 10, 10), fileName: '' }
    ]
    const result = reduce(state, bad({ type: 'library/add', images: [...broken, image('boss', 'boss', 640, 480)] }))
    expect(result.issue?.code).toBe('DND-306')
    expect(libraryIds(result.state)).toEqual([...libraryIds(state), 'boss'])

    expectRejected(state, bad({ type: 'library/add', images: broken }), 'DND-306')
  })
})

describe('library/remove', () => {
  it('görseli kütüphaneden ve bütün pencerelerdeki öğelerden kaldırır', () => {
    const state = makeState()
    const next = apply(state, { type: 'library/remove', imageId: 'item' })
    expect(libraryIds(next)).not.toContain('item')
    expect(itemIds(next, 's1')).toEqual(['a1', 'a3'])
    expect(itemIds(next, 's2')).toEqual([])
    expect(sceneOf(next, 's1').background).toBe(sceneOf(state, 's1').background)
  })

  it('aynı görselden birden çok öğe varsa hepsini kaldırır', () => {
    const next = apply(makeState(), { type: 'library/remove', imageId: 'npc' })
    expect(itemIds(next, 's1')).toEqual(['a2'])
  })

  it('arka plan olarak kullanılıyorsa arka planı boşaltır, öğelere dokunmaz', () => {
    const state = makeState()
    const next = apply(state, { type: 'library/remove', imageId: 'place' })
    expect(sceneOf(next, 's1').background).toBeNull()
    expect(sceneOf(next, 's1').items).toBe(sceneOf(state, 's1').items)
    expect(sceneOf(next, 's3').background).toBe(sceneOf(state, 's3').background)
  })

  it('görseli kullanmayan pencereler ve oyuncular aynı nesne olarak kalır', () => {
    const state = makeState()
    const next = apply(state, { type: 'library/remove', imageId: 'npc' })
    expect(sceneOf(next, 's2')).toBe(sceneOf(state, 's2'))
    expect(sceneOf(next, 's3')).toBe(sceneOf(state, 's3'))
    expect(next.app.players).toBe(state.app.players)
    expect(next.app.activeSceneId).toBe('s1')
    expect(next.session).toBe(state.session)
  })

  it('hiçbir yerde kullanılmayan görselde pencere dizisi aynı kalır', () => {
    const state = makeState()
    const next = apply(state, { type: 'library/remove', imageId: 'team' })
    expect(libraryIds(next)).not.toContain('team')
    expect(next.app.scenes).toBe(state.app.scenes)
    expect(next.app.players).toBe(state.app.players)
  })

  it('portre ise onu kullanan bütün oyuncuların portresini boşaltır', () => {
    const state = makeState()
    const next = apply(state, { type: 'library/remove', imageId: PORTRAIT_SHARED.id })
    expect(next.app.players[1].portraitId).toBeNull()
    expect(next.app.players[2].portraitId).toBeNull()
    expect(next.app.players[1].name).toBe('Legolas')
    expect(next.app.players[0]).toBe(state.app.players[0])
    expect(next.app.players[3]).toBe(state.app.players[3])
    expect(next.app.scenes).toBe(state.app.scenes)
  })

  it('bilinmeyen kimlik DND-302 verir', () => {
    expectRejected(makeState(), { type: 'library/remove', imageId: 'yok' }, 'DND-302')
    expectRejected(makeState(), bad({ type: 'library/remove', imageId: null }), 'DND-302')
    expectRejected(makeState(), bad({ type: 'library/remove' }), 'DND-302')
  })
})

describe('library/setKind', () => {
  it('İtem -> Takım Eşyası ve geri', () => {
    const state = makeState()
    const given = apply(state, { type: 'library/setKind', imageId: 'item', kind: 'teamItem' })
    expect(given.app.library.find((entry) => entry.id === 'item')).toEqual({ ...ITEM, kind: 'teamItem' })
    expect(given.app.library[0]).toBe(state.app.library[0])
    expect(given.app.scenes).toBe(state.app.scenes)

    const back = apply(given, { type: 'library/setKind', imageId: 'item', kind: 'item' })
    expect(back.app.library.find((entry) => entry.id === 'item')?.kind).toBe('item')

    const team = apply(state, { type: 'library/setKind', imageId: 'team', kind: 'item' })
    expect(team.app.library.find((entry) => entry.id === 'team')?.kind).toBe('item')
  })

  it('bölme zaten aynıysa DND-306 verir', () => {
    expectRejected(makeState(), { type: 'library/setKind', imageId: 'item', kind: 'item' }, 'DND-306')
    expectRejected(makeState(), { type: 'library/setKind', imageId: 'team', kind: 'teamItem' }, 'DND-306')
  })

  it('başka bölmedeki görselde ya da başka hedefte DND-306 verir', () => {
    expectRejected(makeState(), { type: 'library/setKind', imageId: 'npc', kind: 'item' }, 'DND-306')
    expectRejected(makeState(), { type: 'library/setKind', imageId: PORTRAIT_SOLO.id, kind: 'teamItem' }, 'DND-306')
    expectRejected(makeState(), bad({ type: 'library/setKind', imageId: 'item', kind: 'npc' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'library/setKind', imageId: 'item' }), 'DND-306')
  })

  it('bilinmeyen kimlik DND-302 verir', () => {
    expectRejected(makeState(), { type: 'library/setKind', imageId: 'yok', kind: 'item' }, 'DND-302')
  })
})

// --- Pencereler --------------------------------------------------------------

describe('scene/add', () => {
  it('adı kırpar; tuşsuz, arka plansız ve boş bir pencereyi sona ekler', () => {
    const state = makeState()
    const next = apply(state, { type: 'scene/add', sceneId: 's4', name: '  Zindan  ' })
    expect(next.app.scenes).toHaveLength(4)
    expect(next.app.scenes[3]).toEqual({ id: 's4', name: 'Zindan', hotkey: null, background: null, videoTrackId: null, items: [] })
    expect(next.app.scenes[0]).toBe(state.app.scenes[0])
  })

  it('etkin pencere varken onu değiştirmez ve çizimleri silmez', () => {
    const state = makeState()
    const next = apply(state, { type: 'scene/add', sceneId: 's4', name: 'Zindan' })
    expect(next.app.activeSceneId).toBe('s1')
    expect(next.session).toBe(state.session)
  })

  it('adı 40 karaktere keser', () => {
    const next = apply(makeState(), { type: 'scene/add', sceneId: 's4', name: 'z'.repeat(60) })
    expect(sceneOf(next, 's4').name).toBe('z'.repeat(TEXT_LIMITS.sceneName))
  })

  it('ad boşsa "Pencere N" verir (N = pencere sayısı + 1)', () => {
    const state = makeState()
    expect(sceneOf(apply(state, { type: 'scene/add', sceneId: 's4', name: '' }), 's4').name).toBe('Pencere 4')
    expect(sceneOf(apply(state, { type: 'scene/add', sceneId: 's4', name: '   ' }), 's4').name).toBe('Pencere 4')
    expect(sceneOf(apply(state, bad({ type: 'scene/add', sceneId: 's4' })), 's4').name).toBe('Pencere 4')
    expect(sceneOf(apply(emptyState(), { type: 'scene/add', sceneId: 'ilk', name: '' }), 'ilk').name).toBe('Pencere 1')
  })

  it('etkin pencere yoksa yeni pencere etkin olur', () => {
    const state = emptyState()
    const first = apply(state, { type: 'scene/add', sceneId: 'ilk', name: 'İlk' })
    expect(first.app.activeSceneId).toBe('ilk')
    expect(first.session).toBe(state.session)

    const second = apply(first, { type: 'scene/add', sceneId: 'ikinci', name: 'İkinci' })
    expect(second.app.activeSceneId).toBe('ilk')
  })

  it('aynı kimlik ikinci kez eklenirse DND-306 verir', () => {
    expectRejected(makeState(), { type: 'scene/add', sceneId: 's1', name: 'Kopya' }, 'DND-306')
  })

  it('kimlik boş ya da metin değilse DND-306 verir', () => {
    expectRejected(makeState(), { type: 'scene/add', sceneId: '', name: 'x' }, 'DND-306')
    expectRejected(makeState(), bad({ type: 'scene/add', sceneId: 5, name: 'x' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'scene/add', name: 'x' }), 'DND-306')
  })
})

describe('scene/update', () => {
  it('adı kırpar ve 40 karaktere keser', () => {
    const state = makeState()
    const next = apply(state, { type: 'scene/update', sceneId: 's2', patch: { name: '  Karanlık Orman  ' } })
    expect(sceneOf(next, 's2').name).toBe('Karanlık Orman')
    expect(sceneOf(next, 's2').hotkey).toBe(2)
    expect(sceneOf(next, 's2').items).toBe(sceneOf(state, 's2').items)
    expect(sceneOf(next, 's1')).toBe(sceneOf(state, 's1'))

    const long = apply(state, { type: 'scene/update', sceneId: 's2', patch: { name: `${'k'.repeat(39)} orman` } })
    expect(sceneOf(long, 's2').name).toBe('k'.repeat(39))
  })

  it('boş kalacak adı yok sayar', () => {
    const state = makeState()
    expectNoop(state, { type: 'scene/update', sceneId: 's1', patch: { name: '' } })
    expectNoop(state, { type: 'scene/update', sceneId: 's1', patch: { name: '    ' } })
    expectNoop(state, bad({ type: 'scene/update', sceneId: 's1', patch: { name: 7 } }))

    const next = apply(state, { type: 'scene/update', sceneId: 's3', patch: { name: ' ', hotkey: 5 } })
    expect(sceneOf(next, 's3')).toMatchObject({ name: 'Köy', hotkey: 5 })
  })

  it('boş tuşu atar ve tuşu kaldırır', () => {
    const state = makeState()
    const assigned = apply(state, { type: 'scene/update', sceneId: 's3', patch: { hotkey: 9 } })
    expect(sceneOf(assigned, 's3').hotkey).toBe(9)
    expect(sceneOf(assigned, 's1')).toBe(sceneOf(state, 's1'))

    const cleared = apply(state, { type: 'scene/update', sceneId: 's1', patch: { hotkey: null } })
    expect(sceneOf(cleared, 's1').hotkey).toBeNull()
    expect(sceneOf(cleared, 's2').hotkey).toBe(2)
  })

  it('başka pencerenin tuşunu alır: değişiklik uygulanır, eskisi boşalır, DND-303 bildirilir', () => {
    const state = makeState()
    const result = reduce(state, { type: 'scene/update', sceneId: 's3', patch: { hotkey: 1 } })
    expect(result.issue?.code).toBe('DND-303')
    // Ayrıntı loga yazılır: pencere adı değil, kimlik ve tuş içerir.
    expect(result.issue?.detail).toBe('1 tuşu "s1" penceresinden alındı, "s3" penceresine verildi.')
    expect(result.state).not.toBe(state)
    expect(sceneOf(result.state, 's3').hotkey).toBe(1)
    expect(sceneOf(result.state, 's1').hotkey).toBeNull()
    expect(sceneOf(result.state, 's1').items).toBe(sceneOf(state, 's1').items)
    expect(sceneOf(result.state, 's2')).toBe(sceneOf(state, 's2'))
    expect(result.state.app.activeSceneId).toBe('s1')
    expect(result.state.session).toBe(state.session)
  })

  it('tuşu olan pencere başkasının tuşunu alınca kendi eski tuşu boşta kalır', () => {
    const result = reduce(makeState(), { type: 'scene/update', sceneId: 's2', patch: { hotkey: 1, name: 'Yol' } })
    expect(result.issue?.code).toBe('DND-303')
    expect(result.issue?.detail).not.toContain('Yol')
    expect(result.issue?.detail).not.toContain('Kraliyet')
    expect(result.state.app.scenes.map((entry) => entry.hotkey)).toEqual([null, 1, null])
    expect(sceneOf(result.state, 's2').name).toBe('Yol')
  })

  it('pencerenin kendi tuşunu yeniden vermek hiçbir şey değiştirmez', () => {
    expectNoop(makeState(), { type: 'scene/update', sceneId: 's1', patch: { hotkey: 1 } })
    expectNoop(makeState(), { type: 'scene/update', sceneId: 's3', patch: { hotkey: null } })
    expectNoop(makeState(), { type: 'scene/update', sceneId: 's1', patch: {} })
    expectNoop(makeState(), { type: 'scene/update', sceneId: 's1', patch: { name: 'Kraliyet İçi' } })
  })

  it.each([[0], [10], [-1], [2.5], [Number.NaN], ['3'], [true]])('geçersiz tuş (%j) DND-306 verir', (hotkey) => {
    expectRejected(makeState(), bad({ type: 'scene/update', sceneId: 's3', patch: { hotkey } }), 'DND-306')
  })

  it('geçersiz tuş aynı işlemdeki ad değişikliğini de durdurur', () => {
    expectRejected(makeState(), { type: 'scene/update', sceneId: 's3', patch: { name: 'Liman', hotkey: 12 } }, 'DND-306')
  })

  it.each([[1], [5], [9]])('%i geçerli bir tuştur', (hotkey) => {
    const result = reduce(makeState(), { type: 'scene/update', sceneId: 's3', patch: { hotkey } })
    expect(sceneOf(result.state, 's3').hotkey).toBe(hotkey)
  })

  it('bilinmeyen pencere DND-301, nesne olmayan patch DND-306 verir', () => {
    expectRejected(makeState(), { type: 'scene/update', sceneId: 'yok', patch: { name: 'x' } }, 'DND-301')
    expectRejected(makeState(), bad({ type: 'scene/update', sceneId: 's1', patch: null }), 'DND-306')
  })
})

describe('scene/remove', () => {
  it('etkin olmayan pencereyi kaldırır; etkin pencere ve çizimler aynı kalır', () => {
    const state = makeState()
    const next = apply(state, { type: 'scene/remove', sceneId: 's2' })
    expect(next.app.scenes.map((entry) => entry.id)).toEqual(['s1', 's3'])
    expect(next.app.activeSceneId).toBe('s1')
    expect(next.session).toBe(state.session)
    expect(next.app.scenes[0]).toBe(state.app.scenes[0])
    expect(next.app.library).toBe(state.app.library)
  })

  it('etkin pencere kaldırılınca kalanların ilki etkin olur; çizim sayacına dokunulmaz', () => {
    const state = makeState()
    const next = apply(state, { type: 'scene/remove', sceneId: 's1' })
    expect(next.app.scenes.map((entry) => entry.id)).toEqual(['s2', 's3'])
    expect(next.app.activeSceneId).toBe('s2')
    expect(next.session).toBe(state.session)
  })

  it('son pencere de kaldırılınca etkin pencere kalmaz', () => {
    let state = makeState()
    state = apply(state, { type: 'scene/remove', sceneId: 's1' })
    state = apply(state, { type: 'scene/remove', sceneId: 's3' })
    expect(state.app.activeSceneId).toBe('s2')
    state = apply(state, { type: 'scene/remove', sceneId: 's2' })
    expect(state.app.scenes).toEqual([])
    expect(state.app.activeSceneId).toBeNull()
    expect(state.session.drawingNonce).toBe(3)
  })

  it('bilinmeyen pencere DND-301 verir', () => {
    expectRejected(makeState(), { type: 'scene/remove', sceneId: 'yok' }, 'DND-301')
    expectRejected(emptyState(), { type: 'scene/remove', sceneId: 's1' }, 'DND-301')
  })
})

describe('scene/setActive', () => {
  it('pencereyi etkin yapar; çizimler pencereye ait olduğu için sayaç artmaz', () => {
    const state = makeState()
    const next = apply(state, { type: 'scene/setActive', sceneId: 's3' })
    expect(next.app.activeSceneId).toBe('s3')
    expect(next.session).toBe(state.session)
    expect(next.app.scenes).toBe(state.app.scenes)
  })

  it('zaten etkin pencerede aynı durumu döndürür, sayaç artmaz', () => {
    expectNoop(makeState(), { type: 'scene/setActive', sceneId: 's1' })
  })

  it('bilinmeyen pencere DND-301 verir', () => {
    expectRejected(makeState(), { type: 'scene/setActive', sceneId: 'yok' }, 'DND-301')
    expectRejected(makeState(), bad({ type: 'scene/setActive', sceneId: null }), 'DND-301')
  })
})

describe('scene/activateHotkey', () => {
  it('tuşa bağlı pencereyi etkin yapar; çizim sayacı artmaz', () => {
    const state = makeState()
    const next = apply(state, { type: 'scene/activateHotkey', hotkey: 2 })
    expect(next.app.activeSceneId).toBe('s2')
    expect(next.session).toBe(state.session)
  })

  it('tuş zaten etkin pencereninse aynı durumu döndürür', () => {
    expectNoop(makeState(), { type: 'scene/activateHotkey', hotkey: 1 })
  })

  it.each([[3], [9], [0], [10]])('%i tuşuna bağlı pencere yokken sorun bildirmeden aynı durumu döndürür', (hotkey) => {
    expectNoop(makeState(), { type: 'scene/activateHotkey', hotkey })
  })

  it('sayı olmayan tuş DND-306 verir; null, tuşsuz pencereyi etkinleştirmez', () => {
    expectRejected(makeState(), bad({ type: 'scene/activateHotkey', hotkey: null }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'scene/activateHotkey', hotkey: '2' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'scene/activateHotkey' }), 'DND-306')
  })

  it('tuşu başka pencereye geçmiş eski sahibini etkinleştirmez', () => {
    const stolen = deepFreeze(reduce(makeState(), { type: 'scene/update', sceneId: 's3', patch: { hotkey: 2 } }).state)
    const next = apply(stolen, { type: 'scene/activateHotkey', hotkey: 2 })
    expect(next.app.activeSceneId).toBe('s3')
  })
})

// --- Oyun alanı: yerleştirme -------------------------------------------------

describe('stage/setBackground', () => {
  it('sceneId verilmezse etkin pencerenin arka planını koyar; alanı oranı bozmadan doldurur', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb', imageId: 'scene' })
    const background = sceneOf(next, 's1').background
    expect(background).toEqual({ id: 'nb', imageId: 'scene', ...coverRect(1000, 1000, AREA), rotation: 0, label: '' })
    expect(background).toMatchObject({ x: 300, y: -270, width: 1620, height: 1620 })
    expect(sceneOf(next, 's1').items).toBe(sceneOf(state, 's1').items)
    expect(sceneOf(next, 's2')).toBe(sceneOf(state, 's2'))
    expect(next.app.scenes).toHaveLength(3)
    expect(next.app.activeSceneId).toBe('s1')
    expect(next.session).toBe(state.session)
  })

  it('sceneId verilirse o pencereye koyar, etkin pencere değişmez', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/setBackground', sceneId: 's2', fallbackSceneId: 'f1', itemId: 'nb', imageId: 'place' })
    expect(sceneOf(next, 's2').background).toEqual({ id: 'nb', imageId: 'place', x: 150, y: 0, width: 1920, height: 1080, rotation: 0, label: '' })
    expect(sceneOf(next, 's1')).toBe(sceneOf(state, 's1'))
    expect(next.app.activeSceneId).toBe('s1')
  })

  it('dolu oyuncu yokken bütün sahneyi alan olarak kullanır', () => {
    const state = deepFreeze(
      reduce(reduce(emptyState(), { type: 'library/add', images: [PLACE] }).state, { type: 'scene/add', sceneId: 's1', name: '' }).state
    )
    const next = apply(state, { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb', imageId: 'place' })
    expect(sceneOf(next, 's1').background).toMatchObject(FULL_STAGE)
  })

  it('overlay türündeki görsel de arka plan yapılabilir', () => {
    const next = apply(makeState(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb', imageId: 'npc' })
    expect(sceneOf(next, 's1').background?.imageId).toBe('npc')
  })

  it('bilinmeyen pencere DND-301 verir', () => {
    expectRejected(makeState(), { type: 'stage/setBackground', sceneId: 'yok', fallbackSceneId: 'f1', itemId: 'nb', imageId: 'place' }, 'DND-301')
  })

  it('bilinmeyen görsel ya da portre DND-302 verir', () => {
    expectRejected(makeState(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb', imageId: 'yok' }, 'DND-302')
    expectRejected(makeState(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb', imageId: PORTRAIT_SOLO.id }, 'DND-302')
    expectRejected(makeState(), bad({ type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb' }), 'DND-302')
  })

  it('öğe kimliği geçersizse ya da penceredeki bir öğeyle çakışıyorsa DND-306 verir', () => {
    expectRejected(makeState(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: '', imageId: 'place' }, 'DND-306')
    expectRejected(makeState(), bad({ type: 'stage/setBackground', fallbackSceneId: 'f1', imageId: 'place' }), 'DND-306')
    expectRejected(makeState(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'a1', imageId: 'place' }, 'DND-306')
  })

  it('eski arka planın kimliğiyle yeni arka plan konabilir', () => {
    const next = apply(makeState(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'b1', imageId: 'scene' })
    expect(sceneOf(next, 's1').background).toMatchObject({ id: 'b1', imageId: 'scene' })
  })
})

describe('stage/addItem', () => {
  it('görseli etkin pencerenin en üstüne, alanın ortasına oranıyla koyar', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'npc' })
    expect(itemIds(next, 's1')).toEqual(['a1', 'a2', 'a3', 'n1'])
    const added = itemOf(next, 's1', 'n1')
    expect(added).toEqual({ id: 'n1', imageId: 'npc', ...containRect(400, 800, AREA), rotation: 0, label: '' })
    expect(added.width).toBeCloseTo(324)
    expect(added.height).toBeCloseTo(648)
    expect(centerOf(added).x).toBeCloseTo(300 + 1620 / 2)
    expect(centerOf(added).y).toBeCloseTo(540)
    expect(sceneOf(next, 's1').items[0]).toBe(sceneOf(state, 's1').items[0])
    expect(sceneOf(next, 's1').background).toBe(sceneOf(state, 's1').background)
    expect(sceneOf(next, 's2')).toBe(sceneOf(state, 's2'))
    expect(next.session).toBe(state.session)
  })

  it.each([
    ['yatay şerit', 4000, 100, 1600, MIN_ITEM_SIZE],
    ['dikey şerit', 100, 4000, MIN_ITEM_SIZE, 1600]
  ])('aşırı ince görselde (%s) kısa kenar alt sınıra çekilir, oran ve ortalama korunur', (_, width, height, expectedWidth, expectedHeight) => {
    const base = makeState()
    const state = deepFreeze({ ...base, app: { ...base.app, library: [...base.app.library, image('serit', 'item', width, height)] } })
    const next = apply(state, { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'serit' })
    const placed = itemOf(next, 's1', 'n1')
    expect(placed.width).toBeCloseTo(expectedWidth, 9)
    expect(placed.height).toBeCloseTo(expectedHeight, 9)
    expect(centerOf(placed).x).toBeCloseTo(AREA.x + AREA.width / 2, 9)
    expect(centerOf(placed).y).toBeCloseTo(AREA.height / 2, 9)
  })

  it('sceneId verilirse o pencereye koyar', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/addItem', sceneId: 's3', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'team' })
    expect(itemIds(next, 's3')).toEqual(['n1'])
    expect(itemIds(next, 's1')).toEqual(['a1', 'a2', 'a3'])
    expect(next.app.activeSceneId).toBe('s1')
  })

  it('aynı görsel birden çok kez konabilir', () => {
    const next = apply(makeState(), { type: 'stage/addItem', sceneId: 's2', fallbackSceneId: 'f1', itemId: 'c2', imageId: 'item' })
    expect(sceneOf(next, 's2').items.map((entry) => entry.imageId)).toEqual(['item', 'item'])
  })

  it('bilinmeyen pencere DND-301, bilinmeyen görsel ya da portre DND-302 verir', () => {
    expectRejected(makeState(), { type: 'stage/addItem', sceneId: 'yok', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'npc' }, 'DND-301')
    expectRejected(makeState(), { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'yok' }, 'DND-302')
    expectRejected(makeState(), { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: PORTRAIT_SPARE.id }, 'DND-302')
  })

  it('öğe kimliği geçersizse ya da pencerede zaten varsa DND-306 verir', () => {
    expectRejected(makeState(), { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: '', imageId: 'npc' }, 'DND-306')
    expectRejected(makeState(), { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'a2', imageId: 'npc' }, 'DND-306')
    expectRejected(makeState(), { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'b1', imageId: 'npc' }, 'DND-306')
  })

  it('aynı öğe kimliği başka bir pencerede kullanılabilir', () => {
    const next = apply(makeState(), { type: 'stage/addItem', sceneId: 's2', fallbackSceneId: 'f1', itemId: 'a1', imageId: 'npc' })
    expect(itemIds(next, 's2')).toEqual(['c1', 'a1'])
  })
})

describe('hiç pencere yokken yerleştirme', () => {
  function libraryOnly(): FullState {
    return deepFreeze(reduce(emptyState(), { type: 'library/add', images: [NPC, PLACE, PORTRAIT_SOLO] }).state)
  }

  it('stage/addItem "Pencere 1" oluşturur, etkin yapar ve görseli içine koyar', () => {
    const state = libraryOnly()
    const next = apply(state, { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'npc' })
    expect(next.app.scenes).toEqual([
      {
        id: 'f1',
        name: 'Pencere 1',
        hotkey: null,
        background: null,
        videoTrackId: null,
        items: [{ id: 'n1', imageId: 'npc', ...containRect(400, 800, FULL_STAGE), rotation: 0, label: '' }]
      }
    ])
    expect(next.app.activeSceneId).toBe('f1')
    expect(next.session).toBe(state.session)
  })

  it('stage/setBackground "Pencere 1" oluşturur, etkin yapar ve arka planı koyar', () => {
    const next = apply(libraryOnly(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb', imageId: 'place' })
    expect(next.app.scenes).toEqual([
      {
        id: 'f1',
        name: 'Pencere 1',
        hotkey: null,
        background: { id: 'nb', imageId: 'place', x: 0, y: 0, width: 1920, height: 1080, rotation: 0, label: '' },
        videoTrackId: null,
        items: []
      }
    ])
    expect(next.app.activeSceneId).toBe('f1')
  })

  it('görsel geçersizse pencere de oluşturulmaz', () => {
    expectRejected(libraryOnly(), { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'yok' }, 'DND-302')
    expectRejected(libraryOnly(), { type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'nb', imageId: PORTRAIT_SOLO.id }, 'DND-302')
  })

  it('sceneId verilmişse yedek pencere oluşturulmaz, DND-301 döner', () => {
    expectRejected(libraryOnly(), { type: 'stage/addItem', sceneId: 's1', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'npc' }, 'DND-301')
  })

  it('yedek pencere kimliği geçersizse DND-306 verir', () => {
    expectRejected(libraryOnly(), { type: 'stage/addItem', fallbackSceneId: '', itemId: 'n1', imageId: 'npc' }, 'DND-306')
    expectRejected(libraryOnly(), bad({ type: 'stage/addItem', itemId: 'n1', imageId: 'npc' }), 'DND-306')
  })

  it('pencere varken yedek kimlik kullanılmaz', () => {
    const next = apply(makeState(), { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'npc' })
    expect(next.app.scenes.map((entry) => entry.id)).toEqual(['s1', 's2', 's3'])
  })

  it('pencere var ama etkin olan yoksa ilk pencere kullanılır ve etkin olur', () => {
    const base = makeState()
    const dangling = deepFreeze({ ...base, app: { ...base.app, activeSceneId: null } })
    const next = apply(dangling, { type: 'stage/addItem', fallbackSceneId: 'f1', itemId: 'n1', imageId: 'npc' })
    expect(next.app.scenes).toHaveLength(3)
    expect(itemIds(next, 's1')).toEqual(['a1', 'a2', 'a3', 'n1'])
    expect(next.app.activeSceneId).toBe('s1')
  })
})

// --- Oyun alanı: düzenleme ---------------------------------------------------

describe('stage/updateItem', () => {
  it('öğeyi taşır; boyut, etiket ve diğer öğeler aynı kalır', () => {
    const state = makeState()
    const before = itemOf(state, 's1', 'a1')
    const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: 500, y: 100 } })
    expect(itemOf(next, 's1', 'a1')).toEqual({ ...before, x: 500, y: 100 })
    expect(itemOf(next, 's1', 'a2')).toBe(itemOf(state, 's1', 'a2'))
    expect(sceneOf(next, 's1').background).toBe(sceneOf(state, 's1').background)
    expect(sceneOf(next, 's2')).toBe(sceneOf(state, 's2'))
    expect(itemIds(next, 's1')).toEqual(['a1', 'a2', 'a3'])
  })

  it('yalnızca x ya da yalnızca y verilebilir', () => {
    const state = makeState()
    const before = itemOf(state, 's1', 'a1')
    expect(itemOf(apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: 400 } }), 's1', 'a1')).toEqual({ ...before, x: 400 })
    expect(itemOf(apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { y: 50 } }), 's1', 'a1')).toEqual({ ...before, y: 50 })
  })

  describe('en-boy oranı (üstteki görsel)', () => {
    it('genişlik verilince yüksekliği görselin oranından türetir', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width: 200 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ width: 200, height: 400 })
    })

    it('yalnızca yükseklik verilince genişliği türetir', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { height: 300 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ width: 150, height: 300 })
    })

    it('ikisi de verilirse genişlik esas alınır, orana uymayan yükseklik atılır', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width: 200, height: 999 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ width: 200, height: 400 })
    })

    it('yatay görselde de oran korunur', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a2', patch: { width: 500 } })
      expect(itemOf(next, 's1', 'a2')).toMatchObject({ width: 500, height: 250 })
    })

    it.each([[41], [77.7], [123.456], [640], [1999], [5000]])('genişlik %d için oran görselinkiyle aynıdır', (width) => {
      const state = makeState()
      for (const [itemId, source] of [['a1', NPC], ['a2', ITEM]] as const) {
        const item = itemOf(reduce(state, { type: 'stage/updateItem', sceneId: 's1', itemId, patch: { width } }).state, 's1', itemId)
        expect(item.width / item.height).toBeCloseTo(source.width / source.height, 9)
      }
    })

    it('boyut değişirken sol üst köşe yerinde kalır', () => {
      const state = makeState()
      const before = itemOf(state, 's1', 'a1')
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width: 200 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ x: before.x, y: before.y })
    })
  })

  describe('en-boy oranı (arka plan)', () => {
    it('itemId arka planınsa arka planı günceller', () => {
      const state = makeState()
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { x: 0, y: 10, label: 'harita' } })
      expect(sceneOf(next, 's1').background).toEqual({ id: 'b1', imageId: 'place', x: 0, y: 10, width: 1920, height: 1080, rotation: 0, label: 'harita' })
      expect(sceneOf(next, 's1').items).toBe(sceneOf(state, 's1').items)
    })

    it('genişlikten yüksekliği, yükseklikten genişliği türetir', () => {
      const state = makeState()
      const byWidth = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { width: 960 } })
      expect(sceneOf(byWidth, 's1').background).toMatchObject({ width: 960, height: 540 })

      const byHeight = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { height: 2160 } })
      expect(sceneOf(byHeight, 's1').background).toMatchObject({ width: 3840, height: 2160 })
    })

    it('orana uymayan çifti düzeltir', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's3', itemId: 'b3', patch: { width: 800, height: 100 } })
      expect(sceneOf(next, 's3').background).toMatchObject({ width: 800, height: 800 })
    })
  })

  describe('en küçük boyut', () => {
    it('dikey görselde kısa kenar (genişlik) alt sınıra çekilir, oran korunur', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width: 10 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ width: MIN_ITEM_SIZE, height: MIN_ITEM_SIZE * 2 })
    })

    it('yatay görselde kısa kenar (yükseklik) alt sınıra çekilir, oran korunur', () => {
      const byHeight = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a2', patch: { height: 5 } })
      expect(itemOf(byHeight, 's1', 'a2')).toMatchObject({ width: MIN_ITEM_SIZE * 2, height: MIN_ITEM_SIZE })

      // Genişlik sınırın üstünde olsa da kısa kenar altında kalıyor.
      const byWidth = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a2', patch: { width: 60 } })
      expect(itemOf(byWidth, 's1', 'a2')).toMatchObject({ width: MIN_ITEM_SIZE * 2, height: MIN_ITEM_SIZE })
    })

    it('kare görselde iki kenar da alt sınıra çekilir', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's3', itemId: 'b3', patch: { height: 1 } })
      expect(sceneOf(next, 's3').background).toMatchObject({ width: MIN_ITEM_SIZE, height: MIN_ITEM_SIZE })
    })

    it.each([[0], [-50], [0.001]])('genişlik %d verilirse en küçük boyuta çekilir', (width) => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ width: MIN_ITEM_SIZE, height: MIN_ITEM_SIZE * 2 })
    })

    it('tam alt sınırdaki boyut olduğu gibi kabul edilir', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width: MIN_ITEM_SIZE } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ width: MIN_ITEM_SIZE, height: MIN_ITEM_SIZE * 2 })
    })
  })

  describe('konum sınırı', () => {
    it('merkez oyun alanının dışına çıkamaz (portre sütununun altına da giremez)', () => {
      const state = makeState()
      const { width, height } = itemOf(state, 's1', 'a1')

      const topLeft = itemOf(apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: -5000, y: -5000 } }), 's1', 'a1')
      expect(centerOf(topLeft).x).toBeCloseTo(AREA.x)
      expect(centerOf(topLeft).y).toBeCloseTo(0)
      expect(topLeft.x).toBeCloseTo(AREA.x - width / 2)
      expect(topLeft.y).toBeCloseTo(-height / 2)

      const bottomRight = itemOf(apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: 99999, y: 99999 } }), 's1', 'a1')
      expect(centerOf(bottomRight).x).toBeCloseTo(STAGE_WIDTH)
      expect(centerOf(bottomRight).y).toBeCloseTo(STAGE_HEIGHT)
    })

    it('sınırın içindeki konuma dokunmaz (görselin bir kısmı sütunun altında kalabilir)', () => {
      const state = makeState()
      const { width } = itemOf(state, 's1', 'a1')
      const x = AREA.x - width / 2 + 1
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x, y: -200 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ x, y: -200 })
    })

    it('merkezi sütunun altına düşüren konum oyun alanının kenarına çekilir', () => {
      const state = makeState()
      const { width } = itemOf(state, 's1', 'a1')
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: -100, y: 40 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ x: AREA.x - width / 2, y: 40 })
    })

    it('etkin olmayan penceredeki öğe için de geçerlidir', () => {
      const state = makeState()
      const { width } = itemOf(state, 's2', 'c1')
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's2', itemId: 'c1', patch: { x: -400 } })
      expect(itemOf(next, 's2', 'c1').x).toBeCloseTo(AREA.x - width / 2)
    })

    it('dolu oyuncu yokken sınır bütün sahnedir', () => {
      const base = makeState()
      const state = deepFreeze({ ...base, app: { ...base.app, players: base.app.players.map(createEmptyPlayer) } })
      const { width, height } = itemOf(state, 's1', 'a1')
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: -5000, y: -5000 } })
      expect(itemOf(next, 's1', 'a1')).toMatchObject({ x: -width / 2, y: -height / 2 })
    })

    it('yalnızca etiket değişse de merkezi alanın dışında kalmış (eski kayıt) öğe içeri çekilir', () => {
      const base = makeState()
      const stray: StageItem = { id: 'k1', imageId: 'item', x: 0, y: 500, width: 200, height: 100, rotation: 0, label: '' }
      const state = deepFreeze({
        ...base,
        app: { ...base.app, scenes: base.app.scenes.map((entry) => (entry.id === 's2' ? { ...entry, items: [...entry.items, stray] } : entry)) }
      })
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's2', itemId: 'k1', patch: { label: 'yeni' } })
      expect(itemOf(next, 's2', 'k1')).toEqual({ ...stray, x: AREA.x - 100, label: 'yeni' })
    })

    it('büyütme merkezi dışarı taşırırsa konum geri çekilir', () => {
      const moved = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a2', patch: { x: 1700, y: 900 } })
      const grown = itemOf(apply(moved, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a2', patch: { width: 1000 } }), 's1', 'a2')
      expect(grown).toMatchObject({ width: 1000, height: 500, x: 1420, y: 830 })
    })

    it('arka plan için de geçerlidir', () => {
      const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { x: 5000, y: -5000 } })
      expect(sceneOf(next, 's1').background).toMatchObject({ x: 960, y: -540 })

      const left = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { x: -5000 } })
      expect(sceneOf(left, 's1').background).toMatchObject({ x: AREA.x - 960 })
    })
  })

  describe('etiket', () => {
    it('etiketi 40 karaktere keser, konuma ve boyuta dokunmaz', () => {
      const state = makeState()
      const before = itemOf(state, 's1', 'a2')
      const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a2', patch: { label: 'e'.repeat(50) } })
      expect(itemOf(next, 's1', 'a2')).toEqual({ ...before, label: 'e'.repeat(TEXT_LIMITS.itemLabel) })
    })

    it('etiket boşaltılabilir ve kırpılmaz', () => {
      const state = makeState()
      expect(itemOf(apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { label: '' } }), 's1', 'a1').label).toBe('')
      expect(itemOf(apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { label: '8 LVL ' } }), 's1', 'a1').label).toBe('8 LVL ')
    })
  })

  it('değişiklik yoksa aynı durumu döndürür', () => {
    const state = makeState()
    const item = itemOf(state, 's1', 'a1')
    const background = itemOf(state, 's1', 'b1')
    expectNoop(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: {} })
    expectNoop(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: item.x, y: item.y } })
    expectNoop(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { label: '7 LVL' } })
    expectNoop(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { width: item.width } })
    expectNoop(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { height: item.height } })
    expectNoop(state, {
      type: 'stage/updateItem',
      sceneId: 's1',
      itemId: 'a1',
      patch: { x: item.x, y: item.y, width: item.width, height: item.height, label: item.label }
    })
    expectNoop(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { width: background.width, height: background.height } })
    expectNoop(state, bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { x: undefined, width: undefined } }))
  })

  it.each([
    [{ x: Number.NaN }],
    [{ y: Number.POSITIVE_INFINITY }],
    [{ width: '100' }],
    [{ height: null }],
    [{ label: 5 }],
    [{ x: 10, y: 10, width: Number.NaN }],
    [{ label: 'geçerli', x: '1' }]
  ])('geçersiz alan içeren patch (%j) tümüyle reddedilir (DND-306)', (patch) => {
    expectRejected(makeState(), bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch }), 'DND-306')
  })

  it('nesne olmayan patch DND-306 verir', () => {
    expectRejected(makeState(), bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: null }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: [1, 2] }), 'DND-306')
  })

  it('bilinmeyen pencere DND-301, bilinmeyen öğe DND-302 verir', () => {
    expectRejected(makeState(), { type: 'stage/updateItem', sceneId: 'yok', itemId: 'a1', patch: { x: 1 } }, 'DND-301')
    expectRejected(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'yok', patch: { x: 1 } }, 'DND-302')
    // Öğe var ama başka pencerede.
    expectRejected(makeState(), { type: 'stage/updateItem', sceneId: 's2', itemId: 'a1', patch: { x: 1 } }, 'DND-302')
    expectRejected(makeState(), { type: 'stage/updateItem', sceneId: 's2', itemId: 'b1', patch: { x: 1 } }, 'DND-302')
    expectRejected(makeState(), bad({ type: 'stage/updateItem', sceneId: 's2', patch: { x: 1 } }), 'DND-302')
  })

  it('görseli kütüphanede bulunmayan öğede o anki oran korunur', () => {
    const base = makeState()
    const orphan: StageItem = { id: 'o1', imageId: 'silinmis', x: 400, y: 400, width: 300, height: 100, rotation: 0, label: '' }
    const state = deepFreeze({
      ...base,
      app: { ...base.app, scenes: base.app.scenes.map((entry) => (entry.id === 's2' ? { ...entry, items: [...entry.items, orphan] } : entry)) }
    })
    const next = apply(state, { type: 'stage/updateItem', sceneId: 's2', itemId: 'o1', patch: { width: 600 } })
    expect(itemOf(next, 's2', 'o1')).toMatchObject({ width: 600, height: 200 })
  })
})

describe('oyun alanı değişince (portre sütunu belirir / kalkar)', () => {
  /** Dolu oyuncusu olmayan, öğeleri bütün sahneye yayılmış durum. */
  function wideState(): FullState {
    const base = createInitialState()
    const scenes: SceneWindow[] = [
      {
        id: 's1',
        name: 'Bir',
        hotkey: 1,
        background: { id: 'b1', imageId: 'place', ...coverRect(PLACE.width, PLACE.height, FULL_STAGE), rotation: 0, label: '' },
        videoTrackId: null,
        items: [
          { id: 'sol', imageId: 'item', x: 20, y: 500, width: 200, height: 100, rotation: 0, label: 'solda' },
          { id: 'sinir', imageId: 'item', x: 200, y: 100, width: 200, height: 100, rotation: 0, label: '' },
          { id: 'orta', imageId: 'npc', x: 900, y: 200, width: 324, height: 648, rotation: 0, label: '' }
        ]
      },
      {
        id: 's2',
        name: 'İki',
        hotkey: 2,
        // Elle sola çekilmiş arka plan: merkezi sütunun altında kalacak.
        background: { id: 'b2', imageId: 'scene', x: -400, y: 0, width: 600, height: 600, rotation: 0, label: '' },
        videoTrackId: null,
        items: [{ id: 'sol2', imageId: 'item', x: -100, y: -50, width: 200, height: 100, rotation: 0, label: '' }]
      },
      { id: 's3', name: 'Üç', hotkey: null, background: null, videoTrackId: null, items: [{ id: 'sag', imageId: 'item', x: 1500, y: 900, width: 200, height: 100, rotation: 0, label: '' }] }
    ]
    return deepFreeze({
      ...base,
      app: { ...base.app, library: [NPC, PLACE, SCENE, ITEM, PORTRAIT_SOLO].map((entry) => ({ ...entry })), scenes, activeSceneId: 's1' }
    })
  }

  function centersInside(state: FullState, area: Rect): boolean {
    return state.app.scenes.every((scene) =>
      [...scene.items, ...(scene.background ? [scene.background] : [])].every((item) => {
        const center = centerOf(item)
        return center.x >= area.x - 1e-9 && center.x <= area.x + area.width + 1e-9 && center.y >= area.y - 1e-9 && center.y <= area.y + area.height + 1e-9
      })
    )
  }

  it('ilk kart dolunca merkezi sütunun altında kalan öğeler bütün pencerelerde içeri çekilir', () => {
    const state = wideState()
    const next = apply(state, { type: 'player/update', slot: 2, patch: { name: 'A' } })
    expect(centersInside(next, AREA)).toBe(true)
    expect(itemOf(next, 's1', 'sol')).toEqual({ ...itemOf(state, 's1', 'sol'), x: 200 })
    expect(itemOf(next, 's2', 'sol2')).toEqual({ ...itemOf(state, 's2', 'sol2'), x: 200 })
    // Elle taşınmış arka plan yalnızca içeri çekilir; boyutu ve y'si aynı kalır.
    expect(itemOf(next, 's2', 'b2')).toEqual({ ...itemOf(state, 's2', 'b2'), x: 0 })
  })

  it('merkezi zaten alanın içinde olan öğeler ve dokunulmayan pencereler aynı nesne olarak kalır', () => {
    const state = wideState()
    const next = apply(state, { type: 'player/update', slot: 0, patch: { name: 'A' } })
    // Merkezi tam sınırda (x = 300) olan öğe yerinde kalır.
    expect(itemOf(next, 's1', 'sinir')).toBe(itemOf(state, 's1', 'sinir'))
    expect(itemOf(next, 's1', 'orta')).toBe(itemOf(state, 's1', 'orta'))
    expect(sceneOf(next, 's3')).toBe(sceneOf(state, 's3'))
    expect(itemIds(next, 's1')).toEqual(['sol', 'sinir', 'orta'])
  })

  it('yerine dokunulmamış arka plan yeni alanı yeniden doldurur (iki yönde de)', () => {
    const state = wideState()
    const filled = apply(state, { type: 'player/update', slot: 0, patch: { name: 'A' } })
    expect(itemOf(filled, 's1', 'b1')).toEqual({ id: 'b1', imageId: 'place', ...coverRect(PLACE.width, PLACE.height, AREA), rotation: 0, label: '' })

    const emptied = apply(filled, { type: 'player/clear', slot: 0 })
    expect(itemOf(emptied, 's1', 'b1')).toEqual(itemOf(state, 's1', 'b1'))
    // Genişlerken öğeler geri taşınmaz: içeri çekilen öğe çekildiği yerde kalır.
    expect(itemOf(emptied, 's1', 'sol')).toBe(itemOf(filled, 's1', 'sol'))
  })

  it('portre yükleyerek dolan kartta da uygulanır', () => {
    const state = wideState()
    const next = apply(state, { type: 'player/update', slot: 1, patch: { portraitId: PORTRAIT_SOLO.id } })
    expect(centersInside(next, AREA)).toBe(true)
  })

  it('ikinci kart dolunca ya da dolu kart değişince pencerelere dokunulmaz', () => {
    const one = apply(wideState(), { type: 'player/update', slot: 0, patch: { name: 'A' } })
    const two = apply(one, { type: 'player/update', slot: 1, patch: { name: 'B', level: 3 } })
    expect(two.app.scenes).toBe(one.app.scenes)
    const renamed = apply(two, { type: 'player/update', slot: 0, patch: { name: 'C' } })
    expect(renamed.app.scenes).toBe(one.app.scenes)
    // Bir kart boşalsa da başka dolu kart olduğu sürece alan değişmez.
    const cleared = apply(renamed, { type: 'player/clear', slot: 0 })
    expect(cleared.app.scenes).toBe(one.app.scenes)
  })

  it('tek dolu kartın portresi kütüphaneden silinince alan genişler; dokunulmamış arka plan sahneyi doldurur', () => {
    const base = wideState()
    const withPortrait = apply(base, { type: 'player/update', slot: 0, patch: { portraitId: PORTRAIT_SOLO.id } })
    expect(itemOf(withPortrait, 's1', 'b1').x).toBe(150)
    const removed = apply(withPortrait, { type: 'library/remove', imageId: PORTRAIT_SOLO.id })
    expect(removed.app.players[0].portraitId).toBeNull()
    expect(itemOf(removed, 's1', 'b1')).toEqual(itemOf(base, 's1', 'b1'))
  })

  it('alan değişmeyen işlemlerde pencere dizisi aynı nesnedir', () => {
    const state = makeState()
    expect(apply(state, { type: 'player/setHp', slot: 0, hp: 1 }).app.scenes).toBe(state.app.scenes)
    expect(apply(state, { type: 'player/update', slot: 3, patch: { name: 'Gimli' } }).app.scenes).toBe(state.app.scenes)
    expect(apply(state, { type: 'library/remove', imageId: PORTRAIT_SPARE.id }).app.scenes).toBe(state.app.scenes)
  })

  it('girdiyi değiştirmez ve aynı girdiye aynı çıktıyı verir', () => {
    const state = wideState()
    const action: Action = { type: 'player/update', slot: 0, patch: { name: 'A' } }
    expect(reduce(state, action)).toEqual(reduce(state, action))
  })
})

describe('stage/removeItem', () => {
  it('üstteki görseli kaldırır', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/removeItem', sceneId: 's1', itemId: 'a2' })
    expect(itemIds(next, 's1')).toEqual(['a1', 'a3'])
    expect(sceneOf(next, 's1').items[0]).toBe(sceneOf(state, 's1').items[0])
    expect(sceneOf(next, 's1').background).toBe(sceneOf(state, 's1').background)
    expect(sceneOf(next, 's2')).toBe(sceneOf(state, 's2'))
    expect(next.app.library).toBe(state.app.library)
  })

  it('kimlik arka planınsa arka planı boşaltır', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/removeItem', sceneId: 's1', itemId: 'b1' })
    expect(sceneOf(next, 's1').background).toBeNull()
    expect(sceneOf(next, 's1').items).toBe(sceneOf(state, 's1').items)
  })

  it('bilinmeyen pencere DND-301, bilinmeyen öğe DND-302 verir', () => {
    expectRejected(makeState(), { type: 'stage/removeItem', sceneId: 'yok', itemId: 'a2' }, 'DND-301')
    expectRejected(makeState(), { type: 'stage/removeItem', sceneId: 's1', itemId: 'yok' }, 'DND-302')
    expectRejected(makeState(), { type: 'stage/removeItem', sceneId: 's2', itemId: 'a2' }, 'DND-302')
  })

  it('aynı öğe ikinci kez silinmek istenirse DND-302 verir', () => {
    const next = apply(makeState(), { type: 'stage/removeItem', sceneId: 's1', itemId: 'a2' })
    expectRejected(next, { type: 'stage/removeItem', sceneId: 's1', itemId: 'a2' }, 'DND-302')
  })
})

describe('stage/reorderItem', () => {
  const order = (itemId: string, to: 'front' | 'back' | 'forward' | 'backward'): string[] =>
    itemIds(apply(makeState(), { type: 'stage/reorderItem', sceneId: 's1', itemId, to }), 's1')

  it('front en üste (dizinin sonuna) alır', () => {
    expect(order('a1', 'front')).toEqual(['a2', 'a3', 'a1'])
    expect(order('a2', 'front')).toEqual(['a1', 'a3', 'a2'])
  })

  it('back en alta (dizinin başına) alır', () => {
    expect(order('a3', 'back')).toEqual(['a3', 'a1', 'a2'])
    expect(order('a2', 'back')).toEqual(['a2', 'a1', 'a3'])
  })

  it('forward bir üste alır', () => {
    expect(order('a1', 'forward')).toEqual(['a2', 'a1', 'a3'])
    expect(order('a2', 'forward')).toEqual(['a1', 'a3', 'a2'])
  })

  it('backward bir alta alır', () => {
    expect(order('a3', 'backward')).toEqual(['a1', 'a3', 'a2'])
    expect(order('a2', 'backward')).toEqual(['a2', 'a1', 'a3'])
  })

  it('öğelerin kendisi ve arka plan aynı nesne olarak kalır', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a1', to: 'front' })
    expect(sceneOf(next, 's1').items[2]).toBe(sceneOf(state, 's1').items[0])
    expect(sceneOf(next, 's1').background).toBe(sceneOf(state, 's1').background)
    expect(sceneOf(next, 's2')).toBe(sceneOf(state, 's2'))
  })

  it('öğe zaten uçtaysa sorun bildirmeden aynı durumu döndürür', () => {
    const state = makeState()
    expectNoop(state, { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a3', to: 'front' })
    expectNoop(state, { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a3', to: 'forward' })
    expectNoop(state, { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a1', to: 'back' })
    expectNoop(state, { type: 'stage/reorderItem', sceneId: 's1', itemId: 'a1', to: 'backward' })
    expectNoop(state, { type: 'stage/reorderItem', sceneId: 's2', itemId: 'c1', to: 'front' })
    expectNoop(state, { type: 'stage/reorderItem', sceneId: 's2', itemId: 'c1', to: 'backward' })
  })

  it.each([['front'], ['back'], ['forward'], ['backward']] as const)('arka plan için %s sorun bildirmeden aynı durumu döndürür', (to) => {
    expectNoop(makeState(), { type: 'stage/reorderItem', sceneId: 's1', itemId: 'b1', to })
  })

  it('bilinmeyen öğe DND-302, bilinmeyen pencere DND-301, geçersiz yön DND-306 verir', () => {
    expectRejected(makeState(), { type: 'stage/reorderItem', sceneId: 's1', itemId: 'yok', to: 'front' }, 'DND-302')
    expectRejected(makeState(), { type: 'stage/reorderItem', sceneId: 's2', itemId: 'b1', to: 'front' }, 'DND-302')
    expectRejected(makeState(), { type: 'stage/reorderItem', sceneId: 'yok', itemId: 'a1', to: 'front' }, 'DND-301')
    expectRejected(makeState(), bad({ type: 'stage/reorderItem', sceneId: 's1', itemId: 'a1', to: 'up' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'stage/reorderItem', sceneId: 's1', itemId: 'a1' }), 'DND-306')
  })
})

describe('stage/clearItems', () => {
  it('üstteki görselleri boşaltır, arka plan kalır', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/clearItems', sceneId: 's1' })
    expect(sceneOf(next, 's1').items).toEqual([])
    expect(sceneOf(next, 's1').background).toBe(sceneOf(state, 's1').background)
    expect(sceneOf(next, 's2')).toBe(sceneOf(state, 's2'))
  })

  it('etkin olmayan pencerede de çalışır', () => {
    const next = apply(makeState(), { type: 'stage/clearItems', sceneId: 's2' })
    expect(sceneOf(next, 's2').items).toEqual([])
    expect(itemIds(next, 's1')).toEqual(['a1', 'a2', 'a3'])
  })

  it('zaten boşsa aynı durumu döndürür; bilinmeyen pencere DND-301 verir', () => {
    expectNoop(makeState(), { type: 'stage/clearItems', sceneId: 's3' })
    expectRejected(makeState(), { type: 'stage/clearItems', sceneId: 'yok' }, 'DND-301')
  })
})

describe('stage/clearBackground', () => {
  it('arka planı boşaltır, üstteki görseller kalır', () => {
    const state = makeState()
    const next = apply(state, { type: 'stage/clearBackground', sceneId: 's1' })
    expect(sceneOf(next, 's1').background).toBeNull()
    expect(sceneOf(next, 's1').items).toBe(sceneOf(state, 's1').items)
    expect(sceneOf(next, 's3')).toBe(sceneOf(state, 's3'))
  })

  it('arka plan yoksa aynı durumu döndürür; bilinmeyen pencere DND-301 verir', () => {
    expectNoop(makeState(), { type: 'stage/clearBackground', sceneId: 's2' })
    expectRejected(makeState(), { type: 'stage/clearBackground', sceneId: 'yok' }, 'DND-301')
    expectRejected(makeState(), bad({ type: 'stage/clearBackground' }), 'DND-301')
  })
})

// --- Diğer -------------------------------------------------------------------

describe('note/setGeneral', () => {
  it('notu yazar, kırpmaz', () => {
    const state = makeState()
    const next = apply(state, { type: 'note/setGeneral', text: '  yeni not\n' })
    expect(next.app.generalNote).toBe('  yeni not\n')
    expect(next.app.players).toBe(state.app.players)
    expect(next.session).toBe(state.session)
  })

  it('20000 karaktere keser', () => {
    const next = apply(makeState(), { type: 'note/setGeneral', text: 'n'.repeat(25000) })
    expect(next.app.generalNote).toHaveLength(TEXT_LIMITS.generalNote)
    expect(next.app.generalNote).toHaveLength(20000)
  })

  it('aynı metinde aynı durumu döndürür; metin değilse DND-306 verir', () => {
    expectNoop(makeState(), { type: 'note/setGeneral', text: 'genel not' })
    expectRejected(makeState(), bad({ type: 'note/setGeneral', text: 5 }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'note/setGeneral' }), 'DND-306')
  })
})

describe('settings/update', () => {
  it('monitörü ve tam ekranı ayarlar', () => {
    const state = makeState()
    const next = apply(state, { type: 'settings/update', patch: { gameDisplayId: 2528732444, controlDisplayId: null, gameFullscreen: false } })
    expect(next.app.settings).toEqual({ gameDisplayId: 2528732444, controlDisplayId: null, gameFullscreen: false })
    expect(next.app.scenes).toBe(state.app.scenes)

    const back = apply(next, { type: 'settings/update', patch: { gameDisplayId: null } })
    expect(back.app.settings).toEqual({ gameDisplayId: null, controlDisplayId: null, gameFullscreen: false })
  })

  it('yanlış tipteki alanları yok sayar, doğru olanları uygular', () => {
    const state = makeState()
    expectNoop(state, bad({ type: 'settings/update', patch: { gameDisplayId: '2', gameFullscreen: 'evet' } }))
    expectNoop(state, bad({ type: 'settings/update', patch: { gameDisplayId: Number.NaN, gameFullscreen: 0 } }))

    const next = apply(state, bad({ type: 'settings/update', patch: { gameDisplayId: 'x', gameFullscreen: false } }))
    expect(next.app.settings).toEqual({ gameDisplayId: null, controlDisplayId: null, gameFullscreen: false })
  })

  it('değer aynıysa aynı durumu döndürür; patch nesne değilse DND-306 verir', () => {
    expectNoop(makeState(), { type: 'settings/update', patch: {} })
    expectNoop(makeState(), { type: 'settings/update', patch: { gameDisplayId: null, controlDisplayId: null, gameFullscreen: true } })
    expectRejected(makeState(), bad({ type: 'settings/update', patch: null }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'settings/update' }), 'DND-306')
  })
})

describe('stage/updateItem: döndürme', () => {
  it('açıyı uygular; konum ve boyut değişmez', () => {
    const state = makeState()
    const before = itemOf(state, 's1', 'a1')
    const next = apply(state, { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { rotation: 90 } })
    expect(itemOf(next, 's1', 'a1')).toEqual({ ...before, rotation: 90 })
  })

  it('açıyı 0–360 aralığına çeker', () => {
    const turn = (rotation: number): number =>
      itemOf(apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { rotation } }), 's1', 'a1').rotation
    expect(turn(450)).toBe(90)
    expect(turn(-90)).toBe(270)
    expect(turn(725)).toBe(5)
  })

  it('arka plan da döndürülebilir', () => {
    const next = apply(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'b1', patch: { rotation: 180 } })
    expect(sceneOf(next, 's1').background?.rotation).toBe(180)
  })

  it('aynı açı aynı durumu döndürür; sayı olmayan açı DND-306 verir', () => {
    expectNoop(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { rotation: 0 } })
    expectNoop(makeState(), { type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { rotation: 360 } })
    expectRejected(makeState(), bad({ type: 'stage/updateItem', sceneId: 's1', itemId: 'a1', patch: { rotation: 'ters' } }), 'DND-306')
  })

  it('yeni konan görsel ve arka plan döndürülmemiş başlar', () => {
    let state = makeState()
    state = apply(state, { type: 'stage/addItem', sceneId: 's1', fallbackSceneId: 'f', itemId: 'yeni', imageId: 'npc' })
    state = apply(state, { type: 'stage/setBackground', sceneId: 's2', fallbackSceneId: 'f', itemId: 'yeni-bg', imageId: 'place' })
    expect(itemOf(state, 's1', 'yeni').rotation).toBe(0)
    expect(sceneOf(state, 's2').background?.rotation).toBe(0)
  })
})

describe('settings/update: kontrol paneli monitörü', () => {
  it('kontrol paneli monitörünü ayarlar ve otomatiğe döndürür', () => {
    const chosen = apply(makeState(), { type: 'settings/update', patch: { controlDisplayId: 7 } })
    expect(chosen.app.settings).toEqual({ gameDisplayId: null, controlDisplayId: 7, gameFullscreen: true })
    const auto = apply(chosen, { type: 'settings/update', patch: { controlDisplayId: null } })
    expect(auto.app.settings.controlDisplayId).toBeNull()
  })

  it('yanlış tipte kontrol monitörünü yok sayar', () => {
    expectNoop(makeState(), bad({ type: 'settings/update', patch: { controlDisplayId: 'sağdaki' } }))
  })
})

describe('session/setTool', () => {
  it('kalemden fareye dönünce çizimler silinmez (sayaç artmaz)', () => {
    const state = makeState()
    const next = apply(state, { type: 'session/setTool', tool: 'mouse' })
    expect(next.session).toEqual({ ...state.session, tool: 'mouse' })
    expect(next.app).toBe(state.app)
  })

  it('kalem rengi değişince sayaç artmaz', () => {
    const next = apply(makeState(), { type: 'session/setTool', tool: 'pen-black' })
    expect(next.session.tool).toBe('pen-black')
    expect(next.session.drawingNonce).toBe(3)
  })

  it('fareden kaleme geçince sayaç artmaz', () => {
    const mouse = apply(makeState(), { type: 'session/setTool', tool: 'mouse' })
    const pen = apply(mouse, { type: 'session/setTool', tool: 'pen-red' })
    expect(pen.session.tool).toBe('pen-red')
    expect(pen.session.drawingNonce).toBe(3)
  })

  it('araç aynıysa aynı durumu döndürür (fare -> fare dahil)', () => {
    expectNoop(makeState(), { type: 'session/setTool', tool: 'pen-red' })
    expectNoop(emptyState(), { type: 'session/setTool', tool: 'mouse' })
  })

  it('silgi de bir araçtır; seçilince çizimler ve kalınlık değişmez', () => {
    const state = makeState()
    const next = apply(state, { type: 'session/setTool', tool: 'eraser' })
    expect(next.session).toEqual({ ...state.session, tool: 'eraser' })
  })

  it('geçersiz araç DND-306 verir', () => {
    expectRejected(makeState(), bad({ type: 'session/setTool', tool: 'firca' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'session/setTool' }), 'DND-306')
  })
})

describe('session/setPenWidth', () => {
  it('kalınlığı değiştirir; araca ve çizim sayacına dokunmaz', () => {
    const state = makeState()
    const next = apply(state, { type: 'session/setPenWidth', width: 'thick' })
    expect(next.session).toEqual({ ...state.session, penWidth: 'thick' })
    expect(next.app).toBe(state.app)
  })

  it('araç değişince kalınlık korunur', () => {
    let state = apply(makeState(), { type: 'session/setPenWidth', width: 'thin' })
    state = apply(state, { type: 'session/setTool', tool: 'eraser' })
    state = apply(state, { type: 'session/setTool', tool: 'mouse' })
    expect(state.session.penWidth).toBe('thin')
  })

  it('aynı kalınlık aynı durumu döndürür; geçersiz kalınlık DND-306 verir', () => {
    expectNoop(makeState(), { type: 'session/setPenWidth', width: 'medium' })
    expectRejected(makeState(), bad({ type: 'session/setPenWidth', width: 'dev' }), 'DND-306')
    expectRejected(makeState(), bad({ type: 'session/setPenWidth' }), 'DND-306')
  })
})

describe('session/clearDrawing', () => {
  it('her seferinde çizim sayacını artırır, başka hiçbir şeye dokunmaz', () => {
    const state = makeState()
    const once = apply(state, { type: 'session/clearDrawing' })
    expect(once.session).toEqual({ ...state.session, drawingNonce: 4 })
    expect(once.app).toBe(state.app)

    const twice = apply(once, { type: 'session/clearDrawing' })
    expect(twice.session.drawingNonce).toBe(5)
  })
})

// --- Uçtan uca akış ----------------------------------------------------------

describe('boş durumdan başlayan oturum', () => {
  it('ardışık işlemler tutarlı bir durum üretir', () => {
    let state = emptyState()
    const step = (action: Action): void => {
      state = apply(state, action)
    }

    step({ type: 'library/add', images: [NPC, PLACE, PORTRAIT_SOLO] })
    step({ type: 'player/update', slot: 0, patch: { name: 'Aragorn', portraitId: PORTRAIT_SOLO.id } })
    step({ type: 'stage/setBackground', fallbackSceneId: 'f1', itemId: 'bg', imageId: 'place' })
    step({ type: 'stage/addItem', fallbackSceneId: 'f2', itemId: 'i1', imageId: 'npc' })
    step({ type: 'scene/add', sceneId: 's2', name: 'Orman' })
    step({ type: 'scene/update', sceneId: 's2', patch: { hotkey: 2 } })
    step({ type: 'session/setTool', tool: 'pen-black' })
    step({ type: 'scene/activateHotkey', hotkey: 2 })
    step({ type: 'player/adjustHp', slot: 0, delta: -4 })
    step({ type: 'stage/updateItem', sceneId: 'f1', itemId: 'i1', patch: { x: 900, y: 300, width: 250, label: 'Muhafız' } })

    expect(state.app.scenes.map((entry) => entry.name)).toEqual(['Pencere 1', 'Orman'])
    expect(state.app.activeSceneId).toBe('s2')
    expect(state.session).toMatchObject({ tool: 'pen-black', drawingNonce: 0 })
    expect(state.app.players[0]).toMatchObject({ name: 'Aragorn', hp: 6, portraitId: PORTRAIT_SOLO.id })
    // Oyuncu dolduktan sonra konduğu için arka plan portre sütununun sağındaki alana göre yerleşir.
    expect(sceneOf(state, 'f1').background).toMatchObject({ x: 150, y: 0, width: 1920, height: 1080 })
    expect(itemOf(state, 'f1', 'i1')).toEqual({ id: 'i1', imageId: 'npc', x: 900, y: 300, width: 250, height: 500, rotation: 0, label: 'Muhafız' })

    step({ type: 'library/remove', imageId: 'npc' })
    step({ type: 'player/clear', slot: 0 })
    expect(sceneOf(state, 'f1').items).toEqual([])
    expect(libraryIds(state)).toEqual(['place'])
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})
