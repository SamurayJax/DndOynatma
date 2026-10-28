import { describe, expect, it } from 'vitest'
import { Action } from '@shared/actions'
import {
  abilityModifier,
  computeAbilityCheck,
  computeSkillCheck,
  consumeEffects,
  effectiveRequirement,
  keptDieIndex,
  playerProficiency,
  proficiencyForLevel
} from '@shared/character'
import { isPlayerPristine } from '@shared/layout'
import { reduce } from '@shared/reducer'
import { FullState, PlayerProfile, Skill, createEmptyPlayer, createInitialState } from '@shared/types'

const AC: Skill = { id: 'ac', name: 'Ac', ability: 'str', requirement: 10 }

function hero(patch: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createEmptyPlayer(), name: 'Aras', level: 3, ...patch }
}

function stateWith(players: PlayerProfile[] = [hero()]): FullState {
  const base = createInitialState()
  return {
    ...base,
    app: {
      ...base.app,
      players: base.app.players.map((player, slot) => players[slot] ?? player),
      classes: [{ id: 'sav', name: 'Savaşçı', skills: [AC, { id: 'kos', name: 'Koş', ability: 'dex', requirement: 8 }] }]
    }
  }
}

function apply(state: FullState, ...actions: Action[]): FullState {
  return actions.reduce((current, action) => reduce(current, action).state, state)
}

describe('istatistik artısı ve yeterlilik', () => {
  it('her 2 puan bir artı / eksi: 10-11 → 0, 12 → +1, 8 → -1', () => {
    const table: [number, number][] = [
      [1, -5],
      [8, -1],
      [9, -1],
      [10, 0],
      [11, 0],
      [12, 1],
      [14, 2],
      [15, 2],
      [20, 5],
      [30, 10]
    ]
    for (const [score, modifier] of table) expect(abilityModifier(score), String(score)).toBe(modifier)
  })

  it('yeterlilik seviyeyle büyür: 1-4 → 2, 5-8 → 3, 9-12 → 4, 13-16 → 5, 17 ve üstü → 6', () => {
    const table: [number, number][] = [
      [1, 2],
      [4, 2],
      [5, 3],
      [8, 3],
      [9, 4],
      [13, 5],
      [16, 5],
      [17, 6],
      [99, 6]
    ]
    for (const [level, proficiency] of table) expect(proficiencyForLevel(level), String(level)).toBe(proficiency)
  })

  it('elle verilen yeterlilik seviyeden gelenin yerine geçer', () => {
    expect(playerProficiency(hero({ level: 9 }))).toBe(4)
    expect(playerProficiency(hero({ level: 9, proficiency: 1 }))).toBe(1)
  })

  it('yeterlilik gereksinimi düşürür, 1in altına indirmez', () => {
    expect(effectiveRequirement(10, 2)).toBe(8)
    expect(effectiveRequirement(3, 6)).toBe(1)
  })
})

describe('beceri atışı', () => {
  it('avantajda büyük, dezavantajda küçük zar alınır; eşitse ilki', () => {
    expect(keptDieIndex('advantage', [4, 17])).toBe(1)
    expect(keptDieIndex('advantage', [17, 4])).toBe(0)
    expect(keptDieIndex('disadvantage', [4, 17])).toBe(0)
    expect(keptDieIndex('disadvantage', [17, 4])).toBe(1)
    expect(keptDieIndex('advantage', [9, 9])).toBe(0)
    expect(keptDieIndex('normal', [12])).toBe(0)
  })

  it('toplam = alınan zar + istatistik artısı + etkiler; gereksinimden yeterlilik düşülür', () => {
    const player = hero({
      abilities: { ...createEmptyPlayer().abilities, str: 15 },
      effects: [
        { id: 'e1', label: 'İyi rol', value: 2, rolls: 1 },
        { id: 'e2', label: 'Kırık kol', value: -1, rolls: null }
      ]
    })
    const check = computeSkillCheck({ slot: 0, player, skill: AC, mode: 'advantage', dice: [5, 12] })
    expect(check).toMatchObject({ keptIndex: 1, total: 15, baseRequirement: 10, proficiency: 2, requirement: 8, success: true })
    expect(check.modifiers).toEqual([
      { label: 'STR', value: 2, kind: 'ability' },
      { label: 'İyi rol', value: 2, kind: 'effect' },
      { label: 'Kırık kol', value: -1, kind: 'effect' }
    ])
  })

  it('gereksinime eşit toplam başarılıdır, bir eksiği başarısız', () => {
    expect(computeSkillCheck({ slot: 0, player: hero(), skill: AC, mode: 'normal', dice: [8] }).success).toBe(true)
    expect(computeSkillCheck({ slot: 0, player: hero(), skill: AC, mode: 'normal', dice: [7] }).success).toBe(false)
  })

  it('sıfır artılar listeye girmez; isimsiz oyuncu yuvasıyla anılır', () => {
    const check = computeSkillCheck({ slot: 2, player: hero({ name: '  ' }), skill: AC, mode: 'normal', dice: [10] })
    expect(check.modifiers).toEqual([])
    expect(check.playerName).toBe('Oyuncu 3')
  })

  it('sayılı etkiler bir azalır, sıfırlanan düşer; kalıcılar kalır', () => {
    const player = hero({
      effects: [
        { id: 'bir', label: 'a', value: 1, rolls: 1 },
        { id: 'iki', label: 'b', value: -1, rolls: 2 },
        { id: 'kalici', label: 'c', value: -2, rolls: null }
      ]
    })
    expect(consumeEffects(player)).toEqual([
      { id: 'iki', label: 'b', value: -1, rolls: 1 },
      { id: 'kalici', label: 'c', value: -2, rolls: null }
    ])
    const permanentOnly = hero({ effects: [{ id: 'k', label: 'c', value: -2, rolls: null }] })
    expect(consumeEffects(permanentOnly)).toBe(permanentOnly.effects)
  })
})

describe('oyuncunun karakteri (reducer)', () => {
  it('istatistik 1–30 arasına çekilir', () => {
    const state = stateWith()
    expect(apply(state, { type: 'player/setAbility', slot: 0, ability: 'str', value: 45 }).app.players[0].abilities.str).toBe(30)
    expect(apply(state, { type: 'player/setAbility', slot: 0, ability: 'dex', value: -3 }).app.players[0].abilities.dex).toBe(1)
  })

  it('olmayan sınıf seçilemez; sınıf silinince oyuncunun sınıfı boşalır', () => {
    const state = apply(stateWith(), { type: 'player/update', slot: 0, patch: { classId: 'sav' } })
    expect(state.app.players[0].classId).toBe('sav')
    expect(reduce(state, { type: 'player/update', slot: 0, patch: { classId: 'yok' } }).state).toBe(state)
    expect(apply(state, { type: 'class/remove', classId: 'sav' }).app.players[0].classId).toBeNull()
  })

  it('etki: değer ±20 ile sınırlı, 0 olamaz, süre 1–99 ya da kalıcı, açıklama boşsa Artı / Eksi', () => {
    const state = stateWith()
    const next = apply(
      state,
      { type: 'player/addEffect', slot: 0, effect: { id: 'a', label: '  ', value: 50, rolls: 500 } },
      { type: 'player/addEffect', slot: 0, effect: { id: 'b', label: 'Kırık kol', value: -2, rolls: null } }
    )
    expect(next.app.players[0].effects).toEqual([
      { id: 'a', label: 'Artı', value: 20, rolls: 99 },
      { id: 'b', label: 'Kırık kol', value: -2, rolls: null }
    ])
    expect(reduce(state, { type: 'player/addEffect', slot: 0, effect: { id: 'c', label: 'x', value: 0, rolls: 1 } }).issue?.code).toBe('DND-306')
  })

  it('bir oyuncuda en fazla 12 etki olur', () => {
    let state = stateWith()
    for (let index = 0; index < 15; index++) {
      state = apply(state, { type: 'player/addEffect', slot: 0, effect: { id: `e${index}`, label: 'x', value: 1, rolls: 1 } })
    }
    expect(state.app.players[0].effects).toHaveLength(12)
  })

  it('kartı boşaltmak istatistikleri, sınıfı ve etkileri de sıfırlar', () => {
    const busy = hero({ name: '', classId: 'sav', abilities: { ...createEmptyPlayer().abilities, wis: 14 }, effects: [{ id: 'e', label: 'x', value: 1, rolls: 1 }] })
    expect(isPlayerPristine(busy)).toBe(false)
    const cleared = apply(stateWith([busy]), { type: 'player/clear', slot: 0 })
    expect(cleared.app.players[0]).toEqual(createEmptyPlayer())
  })
})

describe('sınıflar ve beceriler (reducer)', () => {
  it('sınıf eklenir, adı kırpılır, boş ad yok sayılır', () => {
    const state = apply(stateWith(), { type: 'class/add', classId: 'buy', name: '  Büyücü ' })
    expect(state.app.classes.at(-1)).toEqual({ id: 'buy', name: 'Büyücü', skills: [] })
    expect(reduce(state, { type: 'class/update', classId: 'buy', name: '   ' }).state).toBe(state)
  })

  it('beceri eklenir; gereksinim 1–40, istatistik geçerli olmalı', () => {
    const state = apply(stateWith(), { type: 'skill/add', classId: 'sav', skill: { id: 'k', name: 'Kalkan', ability: 'con', requirement: 99 } })
    expect(state.app.classes[0].skills.at(-1)).toEqual({ id: 'k', name: 'Kalkan', ability: 'con', requirement: 40 })
    const updated = apply(state, { type: 'skill/update', classId: 'sav', skillId: 'k', patch: { requirement: 0, ability: 'wis' } })
    expect(updated.app.classes[0].skills.at(-1)).toMatchObject({ ability: 'wis', requirement: 1 })
  })

  it('beceri ve sınıf sırası değişir', () => {
    const state = apply(stateWith(), { type: 'skill/move', classId: 'sav', skillId: 'kos', to: 'up' })
    expect(state.app.classes[0].skills.map((skill) => skill.id)).toEqual(['kos', 'ac'])
    const two = apply(state, { type: 'class/add', classId: 'buy', name: 'Büyücü' }, { type: 'class/move', classId: 'buy', to: 'up' })
    expect(two.app.classes.map((entry) => entry.id)).toEqual(['buy', 'sav'])
  })
})

describe('istatistik atışı (zar paneli)', () => {
  it('zar + istatistik artısı + etkiler; hedef ve yeterlilik yok', () => {
    const player = hero({
      level: 17,
      abilities: { ...createEmptyPlayer().abilities, dex: 8 },
      effects: [{ id: 'e', label: 'İyi rol', value: 2, rolls: 1 }]
    })
    const check = computeAbilityCheck({ slot: 1, player, ability: 'dex', mode: 'normal', dice: [7] })
    expect(check).toMatchObject({
      kind: 'ability',
      skillName: 'Çeviklik',
      total: 8,
      requirement: null,
      baseRequirement: null,
      proficiency: null,
      success: null
    })
    expect(check.modifiers).toEqual([
      { label: 'DEX', value: -1, kind: 'ability' },
      { label: 'İyi rol', value: 2, kind: 'effect' }
    ])
  })

  it('avantaj ve dezavantaj d10 ile de çalışır', () => {
    expect(computeAbilityCheck({ slot: 0, player: hero(), ability: 'str', mode: 'advantage', dice: [3, 9] }).total).toBe(9)
    expect(computeAbilityCheck({ slot: 0, player: hero(), ability: 'str', mode: 'disadvantage', dice: [3, 9] }).total).toBe(3)
  })
})
