import { describe, expect, it } from 'vitest'
import { Action } from '@shared/actions'
import { reduce, TEXT_LIMITS } from '@shared/reducer'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  createInitialState,
  DEFAULT_CARD_HP,
  FullState,
  ImageKind,
  LibraryImage,
  MAX_CARD_HP,
  MAX_LEVEL,
  StageItem
} from '@shared/types'

const SCENE = 'pencere'

function image(id: string, kind: ImageKind, originalName = 'Goblin'): LibraryImage {
  return { id, kind, fileName: `${id}.png`, originalName, width: 800, height: 400, addedAt: '2026-10-31T00:00:00.000Z' }
}

function apply(state: FullState, ...actions: Action[]): FullState {
  return actions.reduce((current, action) => reduce(current, action).state, state)
}

function setup(): FullState {
  return apply(
    createInitialState(),
    { type: 'library/add', images: [image('dusman', 'enemy'), image('boss', 'boss', 'Ejderha'), image('esya', 'item', 'Kılıç'), image('mekan', 'place', 'Han')] },
    { type: 'scene/add', sceneId: SCENE, name: 'Orman' },
    { type: 'scene/setActive', sceneId: SCENE }
  )
}

function place(itemId: string, imageId: string, asCard = true): Action {
  return { type: 'stage/addItem', sceneId: SCENE, fallbackSceneId: 'yedek', itemId, imageId, asCard }
}

function itemOf(state: FullState, itemId: string): StageItem {
  const found = state.app.scenes[0].items.find((item) => item.id === itemId)
  if (found === undefined) throw new Error(`öğe yok: ${itemId}`)
  return found
}

function update(itemId: string, patch: Record<string, unknown>): Action {
  return { type: 'stage/updateCard', sceneId: SCENE, itemId, patch } as Action
}

describe('kart koyma', () => {
  it('kart, görselin oranına değil kartın oranına yerleşir ve dolu canla gelir', () => {
    const item = itemOf(apply(setup(), place('a', 'dusman')), 'a')
    expect(item.width / item.height).toBeCloseTo(CARD_WIDTH / CARD_HEIGHT)
    expect(item.card).toEqual({ name: 'Goblin', level: 1, maxHp: DEFAULT_CARD_HP, hp: DEFAULT_CARD_HP, frame: 'standard' })
  })

  it('asCard verilmezse görsel eskisi gibi düz gelir', () => {
    const state = reduce(setup(), { type: 'stage/addItem', sceneId: SCENE, fallbackSceneId: 'yedek', itemId: 'a', imageId: 'dusman' }).state
    const item = itemOf(state, 'a')
    expect(item.card).toBeUndefined()
    expect(item.width / item.height).toBeCloseTo(2)
  })

  it('eşya ve mekan kart olamaz', () => {
    for (const imageId of ['esya', 'mekan']) {
      const before = setup()
      const outcome = reduce(before, place('a', imageId))
      expect(outcome.state).toBe(before)
      expect(outcome.issue?.code).toBe('DND-306')
    }
  })

  it('boss gölge çerçeveyle başlar', () => {
    expect(itemOf(apply(setup(), place('a', 'boss')), 'a').card?.frame).toBe('shadow')
  })

  it('aynı görselden yeni kartlar numaralanır, her birinin canı ayrıdır', () => {
    const state = apply(setup(), place('a', 'dusman'), place('b', 'dusman'), place('c', 'dusman'), { type: 'stage/adjustCardHp', sceneId: SCENE, itemId: 'b', delta: -4 })
    expect(['a', 'b', 'c'].map((id) => itemOf(state, id).card?.name)).toEqual(['Goblin', 'Goblin 2', 'Goblin 3'])
    expect(['a', 'b', 'c'].map((id) => itemOf(state, id).card?.hp)).toEqual([10, 6, 10])
  })

  it('kaldırılan numara yeniden kullanılır', () => {
    const state = apply(setup(), place('a', 'dusman'), place('b', 'dusman'), { type: 'stage/removeItem', sceneId: SCENE, itemId: 'b' }, place('c', 'dusman'))
    expect(itemOf(state, 'c').card?.name).toBe('Goblin 2')
  })
})

describe('kart bilgileri', () => {
  it('ad, seviye, en yüksek can ve çerçeve görsele yazılır; bir sonraki kart onlarla gelir ama can dolu başlar', () => {
    const state = apply(
      setup(),
      place('a', 'boss'),
      update('a', { name: 'Kızıl Ejderha', level: 30, maxHp: 200, frame: 'blood' }),
      { type: 'stage/adjustCardHp', sceneId: SCENE, itemId: 'a', delta: -50 },
      { type: 'stage/removeItem', sceneId: SCENE, itemId: 'a' },
      place('b', 'boss')
    )
    expect(itemOf(state, 'b').card).toEqual({ name: 'Kızıl Ejderha', level: 30, maxHp: 200, hp: 200, frame: 'blood' })
  })

  it('kopyanın numarası görsele yazılmaz', () => {
    const state = apply(setup(), place('a', 'dusman'), place('b', 'dusman'), update('b', { level: 5 }))
    expect(state.app.library.find((entry) => entry.id === 'dusman')?.cardDefaults).toEqual({ name: 'Goblin', level: 5, maxHp: 10, frame: 'standard' })
  })

  it('yalnızca can değişince görsele dokunulmaz', () => {
    const before = apply(setup(), place('a', 'dusman'))
    const after = apply(before, update('a', { hp: 3 }))
    expect(after.app.library).toBe(before.app.library)
  })

  it('sınırlar uygulanır', () => {
    const state = apply(setup(), place('a', 'dusman'), update('a', { level: 5000, maxHp: 99999, name: 'x'.repeat(100) }))
    const card = itemOf(state, 'a').card
    expect(card?.level).toBe(MAX_LEVEL)
    expect(card?.maxHp).toBe(MAX_CARD_HP)
    expect(card?.name).toHaveLength(TEXT_LIMITS.cardName)
  })

  it('boş ad yok sayılır', () => {
    const state = apply(setup(), place('a', 'dusman'), update('a', { name: '   ' }))
    expect(itemOf(state, 'a').card?.name).toBe('Goblin')
  })

  it('dolu kartın en yüksek canı artınca dolu kalır; yaralı kartın canı değişmez, azalınca sınıra iner', () => {
    const full = apply(setup(), place('a', 'dusman'), update('a', { maxHp: 60 }))
    expect(itemOf(full, 'a').card?.hp).toBe(60)
    const hurt = apply(full, { type: 'stage/adjustCardHp', sceneId: SCENE, itemId: 'a', delta: -20 }, update('a', { maxHp: 100 }))
    expect(itemOf(hurt, 'a').card?.hp).toBe(40)
    expect(itemOf(apply(hurt, update('a', { maxHp: 25 })), 'a').card?.hp).toBe(25)
  })

  it('can 0 ile en yüksek can arasında kalır; değişmeyen işlem durumu değiştirmez', () => {
    const start = apply(setup(), place('a', 'dusman'))
    const down = apply(start, { type: 'stage/adjustCardHp', sceneId: SCENE, itemId: 'a', delta: -999 })
    expect(itemOf(down, 'a').card?.hp).toBe(0)
    expect(reduce(down, { type: 'stage/adjustCardHp', sceneId: SCENE, itemId: 'a', delta: -1 }).state).toBe(down)
    expect(itemOf(apply(down, update('a', { hp: 500 })), 'a').card?.hp).toBe(10)
  })

  it('boss dışındaki kart boss çerçevesi alamaz, geçersiz çerçeve gölgeye düşer', () => {
    expect(itemOf(apply(setup(), place('a', 'dusman'), update('a', { frame: 'blood' })), 'a').card?.frame).toBe('standard')
    expect(itemOf(apply(setup(), place('a', 'boss'), update('a', { frame: 'pembe' })), 'a').card?.frame).toBe('shadow')
  })

  it('bozuk patch ve kart olmayan öğe reddedilir', () => {
    const before = apply(setup(), place('a', 'dusman'), place('d', 'dusman', false))
    expect(reduce(before, update('a', { hp: 'çok' })).issue?.code).toBe('DND-306')
    expect(reduce(before, update('d', { hp: 1 })).issue?.code).toBe('DND-306')
    expect(reduce(before, { type: 'stage/adjustCardHp', sceneId: SCENE, itemId: 'd', delta: 1 }).issue?.code).toBe('DND-306')
  })
})

describe('kart boyutu ve çevirme', () => {
  it('kart boyutlanırken görselin değil kartın oranını korur', () => {
    const state = apply(setup(), place('a', 'dusman'), { type: 'stage/updateItem', sceneId: SCENE, itemId: 'a', patch: { width: 150 } })
    const item = itemOf(state, 'a')
    expect(item.width).toBe(150)
    expect(item.height).toBeCloseTo((150 * CARD_HEIGHT) / CARD_WIDTH)
  })

  it('düz görsel karta, kart düz görsele döner; merkez yerinde, oran doğru', () => {
    const plain = apply(setup(), place('a', 'dusman', false))
    const before = itemOf(plain, 'a')
    const asCard = itemOf(apply(plain, { type: 'stage/setCardMode', sceneId: SCENE, itemId: 'a', enabled: true }), 'a')
    expect(asCard.card?.name).toBe('Goblin')
    expect(asCard.width / asCard.height).toBeCloseTo(CARD_WIDTH / CARD_HEIGHT)
    expect(asCard.x + asCard.width / 2).toBeCloseTo(before.x + before.width / 2)
    expect(asCard.y + asCard.height / 2).toBeCloseTo(before.y + before.height / 2)

    const back = itemOf(
      apply(plain, { type: 'stage/setCardMode', sceneId: SCENE, itemId: 'a', enabled: true }, { type: 'stage/setCardMode', sceneId: SCENE, itemId: 'a', enabled: false }),
      'a'
    )
    expect(back.card).toBeUndefined()
    expect(back.width / back.height).toBeCloseTo(2)
  })

  it('eşya ve arka plan çevrilemez', () => {
    const state = apply(setup(), place('e', 'esya', false), { type: 'stage/setBackground', sceneId: SCENE, fallbackSceneId: 'yedek', itemId: 'bg', imageId: 'mekan' })
    expect(reduce(state, { type: 'stage/setCardMode', sceneId: SCENE, itemId: 'e', enabled: true }).issue?.code).toBe('DND-306')
    expect(reduce(state, { type: 'stage/setCardMode', sceneId: SCENE, itemId: 'bg', enabled: true }).issue?.code).toBe('DND-306')
  })
})
