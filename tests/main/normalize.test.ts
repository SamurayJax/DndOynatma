import { describe, expect, it } from 'vitest'
import { MAX_HP, MAX_LEVEL, MAX_PLAYERS, SCHEMA_VERSION, createEmptyPlayer, createInitialAppState } from '@shared/types'
import { normalizeAppState } from '../../src/main/normalize'
import { sampleAppState } from './helpers'

/** Geçerli kaydın üzerine bozuk alanlar koyup onarılmış hâlini döndürür. */
function repaired(overrides: Record<string, unknown>) {
  const state = normalizeAppState({ ...sampleAppState(), ...overrides })
  if (!state) throw new Error('kayıt nesnesi bekleniyordu')
  return state
}

describe('kartlar', () => {
  const stored = (card: unknown): unknown => ({
    library: [{ id: 'g', kind: 'enemy', fileName: 'g.png', originalName: 'G', width: 10, height: 10, addedAt: 'x', cardDefaults: { name: 'G', level: 3, maxHp: 50, frame: 'standard' } }],
    scenes: [{ id: 's', name: 'S', items: [{ id: 'i', imageId: 'g', x: 0, y: 0, width: 300, height: 420, rotation: 0, label: '', card }], background: { id: 'b', imageId: 'g', x: 0, y: 0, width: 10, height: 10, card } }]
  })

  it('eski kayıttaki öğe düz görsel kalır', () => {
    const state = normalizeAppState(stored(undefined))
    expect(state?.scenes[0].items[0]).not.toHaveProperty('card')
  })

  it('kart ve görselin kart bilgileri korunur; arka plan kart olamaz', () => {
    const card = { name: 'Goblin', level: 5, maxHp: 40, hp: 12, frame: 'blood' }
    const state = normalizeAppState(stored(card))
    expect(state?.scenes[0].items[0].card).toEqual(card)
    expect(state?.scenes[0].background).not.toHaveProperty('card')
    expect(state?.library[0].cardDefaults).toEqual({ name: 'G', level: 3, maxHp: 50, frame: 'standard' })
  })

  it('bozuk kart onarılır', () => {
    const state = normalizeAppState(stored({ name: '  ', level: -4, maxHp: 1e9, hp: 'x', frame: 'pembe' }))
    expect(state?.scenes[0].items[0].card).toEqual({ name: 'Kart', level: 1, maxHp: 9999, hp: 9999, frame: 'standard' })
  })
})

describe('normalizeAppState', () => {
  it('nesne olmayan girdide null döner', () => {
    for (const input of [null, undefined, 42, 'kayıt', true, [], [{}]]) {
      expect(normalizeAppState(input)).toBeNull()
    }
  })

  it('boş nesneyi varsayılan kayda tamamlar', () => {
    expect(normalizeAppState({})).toEqual(createInitialAppState())
  })

  it('geçerli kaydı değiştirmez', () => {
    expect(normalizeAppState(sampleAppState())).toEqual(sampleAppState())
  })

  it('JSON gidiş-dönüşünden sonra da aynı kaydı verir', () => {
    expect(normalizeAppState(JSON.parse(JSON.stringify(sampleAppState())))).toEqual(sampleAppState())
  })

  it('şema alanını her zaman bu sürümünkine çeker', () => {
    expect(repaired({ schema: 0 }).schema).toBe(SCHEMA_VERSION)
    expect(repaired({ schema: 'x' }).schema).toBe(SCHEMA_VERSION)
  })

  describe('oyuncular', () => {
    it('eksik yuvaları boş kartla tamamlar', () => {
      const state = repaired({ players: [sampleAppState().players[0]] })
      expect(state.players).toHaveLength(MAX_PLAYERS)
      expect(state.players[0].name).toBe('Şövalye')
      expect(state.players.slice(1)).toEqual([createEmptyPlayer(), createEmptyPlayer(), createEmptyPlayer()])
    })

    it('fazla yuvaları atar', () => {
      const six = Array.from({ length: 6 }, (_, index) => ({ ...createEmptyPlayer(), name: `Oyuncu ${index + 1}` }))
      const state = repaired({ players: six })
      expect(state.players.map((player) => player.name)).toEqual(['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3', 'Oyuncu 4'])
    })

    it('liste değilse ya da yuva nesne değilse boş kart koyar', () => {
      expect(repaired({ players: 'yok' }).players).toEqual(createInitialAppState().players)
      expect(repaired({ players: [null, 5, 'x', []] }).players).toEqual(createInitialAppState().players)
    })

    it('canı 0..MAX_HP aralığına çeker', () => {
      const hpOf = (hp: unknown): number => repaired({ players: [{ ...createEmptyPlayer(), hp }] }).players[0].hp
      expect(hpOf(-3)).toBe(0)
      expect(hpOf(99)).toBe(MAX_HP)
      expect(hpOf(4.6)).toBe(5)
      expect(hpOf('7')).toBe(MAX_HP)
      expect(hpOf(Number.NaN)).toBe(MAX_HP)
      expect(hpOf(0)).toBe(0)
    })

    it('seviyeyi 1..MAX_LEVEL aralığına çeker', () => {
      const levelOf = (level: unknown): number => repaired({ players: [{ ...createEmptyPlayer(), level }] }).players[0].level
      expect(levelOf(0)).toBe(1)
      expect(levelOf(-10)).toBe(1)
      expect(levelOf(150)).toBe(MAX_LEVEL)
      expect(levelOf(null)).toBe(1)
      expect(levelOf(12)).toBe(12)
    })

    it('metin olmayan isim ve notu boşaltır', () => {
      const player = repaired({ players: [{ portraitId: null, name: 12, level: 3, hp: 5, note: { a: 1 } }] }).players[0]
      expect(player).toEqual({ ...createEmptyPlayer(), portraitId: null, name: '', level: 3, hp: 5, note: '' })
    })

    it('kütüphanede olmayan portreyi boşaltır', () => {
      const players = [{ ...createEmptyPlayer(), portraitId: 'silinmis' }, { ...createEmptyPlayer(), portraitId: 'img-portrait' }]
      const state = repaired({ players })
      expect(state.players[0].portraitId).toBeNull()
      expect(state.players[1].portraitId).toBe('img-portrait')
    })
  })

  describe('kütüphane', () => {
    const valid = sampleAppState().library[0]

    it('eksik ya da geçersiz alanlı kayıtları atar', () => {
      const library = [
        valid,
        { ...valid, id: undefined },
        { ...valid, id: '' },
        { ...valid, id: 'a', fileName: undefined },
        { ...valid, id: 'b', kind: 'ejderha' },
        { ...valid, id: 'c', width: 0 },
        { ...valid, id: 'd', height: 'yüksek' },
        { ...valid, id: 'e', width: Number.POSITIVE_INFINITY },
        null,
        'görsel',
        42
      ]
      expect(repaired({ library }).library).toEqual([valid])
    })

    it('klasör dışını gösteren dosya adlarını atar', () => {
      const library = [
        { ...valid, id: 'a', fileName: '..\\..\\Windows\\win.ini' },
        { ...valid, id: 'b', fileName: '../kayit.json' },
        { ...valid, id: 'c', fileName: 'alt/klasor.png' },
        { ...valid, id: 'd', fileName: 'C:\\gizli.png' },
        { ...valid, id: 'e', fileName: 'iyi.png' }
      ]
      expect(repaired({ library }).library.map((image) => image.id)).toEqual(['e'])
    })

    it('aynı kimlikli ikinci kaydı atar', () => {
      const library = [valid, { ...valid, fileName: 'kopya.png' }]
      expect(repaired({ library }).library).toEqual([valid])
    })

    it('özgün ad ve tarih eksikse kaydı atmadan tamamlar', () => {
      const { originalName: _name, addedAt: _date, ...partial } = valid
      const image = repaired({ library: [partial] }).library[0]
      expect(image.originalName).toBe('')
      expect(typeof image.addedAt).toBe('string')
      expect(image.id).toBe(valid.id)
    })

    it('liste değilse boş kütüphane verir ve ona bağlı her şeyi temizler', () => {
      const state = repaired({ library: { 0: valid } })
      expect(state.library).toEqual([])
      expect(state.players[0].portraitId).toBeNull()
      expect(state.scenes[0].background).toBeNull()
      expect(state.scenes[0].items).toEqual([])
    })
  })

  describe('pencereler', () => {
    const scene = sampleAppState().scenes[0]
    const item = scene.items[0]

    it('kimliği olmayan ya da nesne olmayan pencereleri atar', () => {
      const scenes = [{ ...scene, id: undefined }, null, 'pencere', { ...scene, id: 'iyi', hotkey: null }]
      expect(repaired({ scenes, activeSceneId: 'iyi' }).scenes.map((entry) => entry.id)).toEqual(['iyi'])
    })

    it('aynı kimlikli ikinci pencereyi atar', () => {
      const scenes = [scene, { ...scene, name: 'Kopya' }]
      expect(repaired({ scenes }).scenes).toEqual([scene])
    })

    it('eksik alanları tamamlar', () => {
      expect(repaired({ scenes: [{ id: 'yalın' }] }).scenes).toEqual([
        { id: 'yalın', name: '', hotkey: null, background: null, videoTrackId: null, items: [] }
      ])
    })

    it('görseli kütüphanede olmayan öğeleri atar', () => {
      const items = [item, { ...item, id: 'item-2', imageId: 'silinmis' }]
      expect(repaired({ scenes: [{ ...scene, items }] }).scenes[0].items).toEqual([item])
    })

    it('görseli kütüphanede olmayan arka planı boşaltır', () => {
      const background = { ...scene.background, imageId: 'silinmis' }
      expect(repaired({ scenes: [{ ...scene, background }] }).scenes[0].background).toBeNull()
    })

    it('eksik ya da geçersiz alanlı öğeleri atar', () => {
      const items = [
        { ...item, id: 'a', x: undefined },
        { ...item, id: 'b', y: Number.NaN },
        { ...item, id: 'c', width: 0 },
        { ...item, id: 'd', height: -5 },
        { ...item, id: '' },
        { ...item, id: 'e', imageId: 7 },
        null,
        { ...item, id: 'f', label: 99 }
      ]
      const result = repaired({ scenes: [{ ...scene, items }] }).scenes[0].items
      expect(result).toEqual([{ ...item, id: 'f', label: '' }])
    })

    it('döndürme alanı olmayan eski kayıttaki öğeyi 0 dereceyle açar, açıyı 0–360 aralığına çeker', () => {
      const { rotation: _unused, ...oldItem } = scene.items[0]
      const state = repaired({
        scenes: [
          {
            ...scene,
            items: [oldItem, { ...scene.items[0], id: 'item-2', rotation: 450 }, { ...scene.items[0], id: 'item-3', rotation: 'ters' }]
          }
        ]
      })
      expect(state.scenes[0].items.map((item) => item.rotation)).toEqual([0, 90, 0])
    })

    it('bir pencerede aynı kimlikli ikinci öğeyi atar', () => {
      const items = [item, { ...item, x: 5 }, { ...item, id: 'item-bg' }]
      expect(repaired({ scenes: [{ ...scene, items }] }).scenes[0].items).toEqual([item])
    })

    it('aynı atama tuşunu yalnızca ilk pencerede bırakır', () => {
      const scenes = [
        { id: 'a', name: 'A', hotkey: 3, background: null, items: [] },
        { id: 'b', name: 'B', hotkey: 3, background: null, items: [] },
        { id: 'c', name: 'C', hotkey: 4, background: null, items: [] },
        { id: 'd', name: 'D', hotkey: 3, background: null, items: [] }
      ]
      expect(repaired({ scenes, activeSceneId: 'a' }).scenes.map((entry) => entry.hotkey)).toEqual([3, null, 4, null])
    })

    it('1-9 dışındaki atama tuşunu boşaltır', () => {
      const hotkeys = [0, 10, 2.5, '3', -1, null, undefined, 9]
      const scenes = hotkeys.map((hotkey, index) => ({ id: `s${index}`, name: '', hotkey, background: null, items: [] }))
      expect(repaired({ scenes, activeSceneId: null }).scenes.map((entry) => entry.hotkey)).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        9
      ])
    })

    it('var olmayan etkin pencereyi boşaltır, var olanı korur', () => {
      expect(repaired({ activeSceneId: 'silinmis' }).activeSceneId).toBeNull()
      expect(repaired({ activeSceneId: 42 }).activeSceneId).toBeNull()
      expect(repaired({ activeSceneId: 'scene-2' }).activeSceneId).toBe('scene-2')
    })
  })

  describe('not ve ayarlar', () => {
    it('metin olmayan genel notu boşaltır', () => {
      expect(repaired({ generalNote: 123 }).generalNote).toBe('')
    })

    it('eksik ya da geçersiz ayarları varsayılana çeker', () => {
      const defaults = createInitialAppState().settings
      expect(repaired({ settings: undefined }).settings).toEqual(defaults)
      expect(repaired({ settings: 'tam ekran' }).settings).toEqual(defaults)
      expect(repaired({ settings: { gameDisplayId: 'iki', gameFullscreen: 'evet' } }).settings).toEqual(defaults)
      expect(repaired({ settings: { gameDisplayId: 2779098405, gameFullscreen: false } }).settings).toEqual({
        gameDisplayId: 2779098405,
        // Kontrol paneli monitörü sonradan eklendi; eski kayıtta yoksa otomatik sayılır.
        controlDisplayId: null,
        gameFullscreen: false
      })
      expect(repaired({ settings: { controlDisplayId: 7, gameFullscreen: true } }).settings.controlDisplayId).toBe(7)
      expect(repaired({ settings: { controlDisplayId: 'sol' } }).settings.controlDisplayId).toBeNull()
    })
  })
})
