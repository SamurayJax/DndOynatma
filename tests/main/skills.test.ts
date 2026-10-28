import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiceRoll, FullState, createEmptyPlayer, createInitialState } from '@shared/types'
import { decodeCharacterFile, encodeCharacterFile } from '../../src/main/characterFile'
import { applyCharacterImport, exportCharactersTo, previewCharacterFile } from '../../src/main/characters'
import { rollSkill } from '../../src/main/dice'
import { log } from '../../src/main/logger'
import { buildDataPaths, ensureDataDirs } from '../../src/main/paths'
import { loadDiceHistory, writeDiceHistory } from '../../src/main/storage'
import { Store } from '../../src/main/store'
import { makeTempDir, removeTempDir } from './helpers'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }
}))

let dir: string

beforeEach(() => {
  dir = makeTempDir()
  vi.spyOn(log, 'info').mockImplementation(() => undefined)
  vi.spyOn(log, 'code').mockImplementation(() => undefined)
  vi.spyOn(log, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  removeTempDir(dir)
})

function makeStore(playing = true): Store {
  const base = createInitialState()
  const initial: FullState = {
    app: {
      ...base.app,
      players: base.app.players.map((player, slot) =>
        slot === 0
          ? {
              ...createEmptyPlayer(),
              name: 'Aras',
              level: 5,
              classId: 'sav',
              abilities: { ...createEmptyPlayer().abilities, str: 16 },
              effects: [
                { id: 'iyi', label: 'İyi rol', value: 2, rolls: 1 },
                { id: 'kol', label: 'Kırık kol', value: -2, rolls: null }
              ]
            }
          : player
      ),
      classes: [{ id: 'sav', name: 'Savaşçı', skills: [{ id: 'ac', name: 'Ac', ability: 'str', requirement: 12 }] }]
    },
    session: { ...base.session, phase: playing ? 'playing' : 'menu' }
  }
  return new Store({ initial, saveEnabled: false, writeSave: vi.fn(), broadcast: vi.fn(), report: vi.fn(), trashImage: vi.fn(), trashSound: vi.fn() })
}

describe('rollSkill', () => {
  it('zar + istatistik + etkiler; gereksinimden yeterlilik düşülür; sayılı etki düşer', () => {
    const store = makeStore()
    const diceFile = path.join(dir, 'zar.json')
    const roll = rollSkill(store, diceFile, 0, 'ac', 'normal')
    if (typeof roll !== 'object') throw new Error(`atış yapılmadı: ${roll}`)
    const check = roll.check!
    expect(roll.sides).toBe(20)
    expect(roll.value).toBe(check.dice[0])
    // STR 16 → +3, İyi rol +2, Kırık kol -2; 5. seviye → yeterlilik 3, 12 - 3 = 9.
    expect(check.total).toBe(check.dice[0] + 3)
    expect(check).toMatchObject({ requirement: 9, proficiency: 3, baseRequirement: 12, success: check.total >= 9 })
    expect(store.getState().app.players[0].effects.map((effect) => effect.id)).toEqual(['kol'])
    expect(store.getState().session.diceHistory[0]).toBe(roll)
    // zar.json'dan geri okunan atış hesabıyla birlikte gelir.
    expect(loadDiceHistory(diceFile).rolls[0]).toEqual(roll)
  })

  it('avantajda iki zar atılır, büyüğü alınır', () => {
    const store = makeStore()
    for (let index = 0; index < 20; index++) {
      const roll = rollSkill(store, path.join(dir, 'zar.json'), 0, 'ac', 'advantage') as DiceRoll
      const { dice, keptIndex } = roll.check!
      expect(dice).toHaveLength(2)
      expect(dice[keptIndex]).toBe(Math.max(...dice))
    }
  })

  it('oyun açık değilken ya da beceri oyuncunun sınıfında değilken atılmaz', () => {
    expect(rollSkill(makeStore(false), path.join(dir, 'zar.json'), 0, 'ac', 'normal')).toBe('not-playing')
    const store = makeStore()
    expect(rollSkill(store, path.join(dir, 'zar.json'), 0, 'yok', 'normal')).toBe('invalid')
    expect(rollSkill(store, path.join(dir, 'zar.json'), 1, 'ac', 'normal')).toBe('invalid')
    expect(store.getState().session.diceHistory).toEqual([])
  })
})

describe('zar.json (beceri atışı)', () => {
  it('bozuk hesap atılır, atış düz d20 olarak kalır', () => {
    const diceFile = path.join(dir, 'zar.json')
    const roll: DiceRoll = { id: 'r', sides: 20, value: 7, at: '2026-10-28T10:00:00.000Z' }
    writeDiceHistory(diceFile, [{ ...roll, check: { slot: 'x' } as never }])
    expect(loadDiceHistory(diceFile).rolls).toEqual([roll])
  })
})

describe('karakter dosyası (sürüm 2)', () => {
  const META = { appVersion: '0.9.7', exportedAt: '2026-10-28T10:00:00.000Z' }

  it('istatistikleri, yeterliliği ve sınıfı taşır', () => {
    const card = {
      slot: 1,
      name: 'Lira',
      level: 6,
      hp: 9,
      note: '',
      abilities: { ...createEmptyPlayer().abilities, int: 17 },
      proficiency: 4,
      characterClass: { name: 'Büyücü', skills: [{ name: 'Ateş Topu', ability: 'int' as const, requirement: 13 }] },
      portrait: null
    }
    const decoded = decodeCharacterFile(encodeCharacterFile([card], META))
    expect(decoded).toMatchObject({ ok: true, cards: [card] })
  })

  it('sürüm 1 dosyası varsayılan istatistiklerle okunur', () => {
    const header = JSON.stringify({ format: 'dndoynatma-karakterler', version: 1, appVersion: '0.9.3', exportedAt: META.exportedAt, cards: [{ slot: 0, name: 'Eski', level: 2, hp: 10, note: '', portrait: null }] })
    const length = Buffer.alloc(4)
    length.writeUInt32LE(Buffer.byteLength(header))
    const decoded = decodeCharacterFile(Buffer.concat([Buffer.from('DNDOYNATMA-KARAKTER\n', 'latin1'), length, Buffer.from(header)]))
    expect(decoded).toMatchObject({ ok: true, cards: [{ name: 'Eski', abilities: createEmptyPlayer().abilities, proficiency: null, characterClass: null }] })
  })

  it('içe aktarmada sınıf adıyla eşleşir; yoksa becerileriyle eklenir', async () => {
    const make = (name: string): Store => {
      const paths = buildDataPaths(path.join(dir, name))
      ensureDataDirs(paths)
      return new Store({ initial: createInitialState(), saveEnabled: false, writeSave: vi.fn(), broadcast: vi.fn(), report: vi.fn(), trashImage: vi.fn(), trashSound: vi.fn() })
    }
    const source = make('kaynak')
    source.dispatch({ type: 'class/add', classId: 'c1', name: 'Savaşçı' })
    source.dispatch({ type: 'skill/add', classId: 'c1', skill: { id: 's1', name: 'Ac', ability: 'str', requirement: 10 } })
    source.dispatch({ type: 'class/add', classId: 'c2', name: 'Büyücü' })
    source.dispatch({ type: 'player/update', slot: 0, patch: { name: 'Aras', classId: 'c1', proficiency: 5 } })
    source.dispatch({ type: 'player/setAbility', slot: 0, ability: 'str', value: 18 })
    source.dispatch({ type: 'player/update', slot: 1, patch: { name: 'Lira', classId: 'c2' } })
    const file = path.join(dir, 'kartlar.dndkarakter')
    await exportCharactersTo({ store: source, imagesDir: path.join(dir, 'kaynak', 'gorseller'), appVersion: () => '0.9.7' }, file)

    const target = make('hedef')
    // Hedefte "savaşçı" zaten var (kendi becerileriyle); dosyadakiyle değiştirilmez.
    target.dispatch({ type: 'class/add', classId: 'yerel', name: 'savaşçı' })
    const deps = { store: target, imagesDir: path.join(dir, 'hedef', 'gorseller'), appVersion: () => '0.9.7' }
    const preview = await previewCharacterFile(deps, file)
    expect(preview.cards.map((card) => card.className)).toEqual(['Savaşçı', 'Büyücü'])
    await applyCharacterImport(deps, preview.token)

    const app = target.getState().app
    expect(app.players[0]).toMatchObject({ name: 'Aras', classId: 'yerel', proficiency: 5 })
    expect(app.players[0].abilities.str).toBe(18)
    expect(app.classes.find((entry) => entry.id === 'yerel')?.skills).toEqual([])
    const wizard = app.classes.find((entry) => entry.name === 'Büyücü')
    expect(wizard).toBeDefined()
    expect(app.players[1].classId).toBe(wizard?.id)
    expect(fs.existsSync(file)).toBe(true)
  })
})
