import { describe, expect, it } from 'vitest'
import { Action } from '@shared/actions'
import { reduce } from '@shared/reducer'
import {
  AmbientSound,
  FullState,
  MusicTrack,
  RepeatMode,
  SceneWindow,
  StageItem,
  createInitialState
} from '@shared/types'

const T1: MusicTrack = { id: 't1', fileName: 't1.mp3', originalName: 'Bir', hasVideo: false, loop: null, addedAt: '2026-10-28T10:00:00.000Z' }
const T2: MusicTrack = { id: 't2', fileName: 't2.mp3', originalName: 'İki', hasVideo: false, loop: null, addedAt: '2026-10-28T10:00:00.000Z' }
const T3: MusicTrack = { id: 't3', fileName: 't3.mp4', originalName: 'Üç', hasVideo: true, loop: { start: 1, end: 5 }, addedAt: '2026-10-28T10:00:00.000Z' }
const RAIN: AmbientSound = { id: 'yagmur', name: 'Yağmur', fileName: 'y.ogg', volume: 0.8, addedAt: '2026-10-28T10:00:00.000Z' }
const BIRD: AmbientSound = { id: 'kus', name: 'Kuş', fileName: 'k.ogg', volume: 0.5, addedAt: '2026-10-28T10:00:00.000Z' }
const PLACE = { id: 'mekan', kind: 'place' as const, fileName: 'm.png', originalName: 'Mekan', width: 1920, height: 1080, addedAt: '2026-10-28T10:00:00.000Z' }

function background(): StageItem {
  return { id: 'bg', imageId: PLACE.id, x: 0, y: 0, width: 1920, height: 1080, rotation: 0, label: '' }
}

function stateWith(options: { repeat?: RepeatMode; trackId?: string | null; playing?: boolean } = {}): FullState {
  const base = createInitialState()
  const scenes: SceneWindow[] = [
    { id: 's1', name: 'Bir', hotkey: 1, background: background(), videoTrackId: null, items: [] },
    { id: 's2', name: 'İki', hotkey: 2, background: null, videoTrackId: 't3', items: [] }
  ]
  return {
    app: {
      ...base.app,
      library: [PLACE],
      scenes,
      activeSceneId: 's1',
      music: { ...base.app.music, tracks: [T1, T2, T3], ambients: [RAIN, BIRD], repeat: options.repeat ?? 'all' }
    },
    session: {
      ...base.session,
      phase: 'playing',
      playback: { trackId: options.trackId ?? null, playing: options.playing ?? false, seekNonce: 5, seekTo: 0, ambientIds: [] }
    }
  }
}

function apply(state: FullState, ...actions: Action[]): FullState {
  return actions.reduce((current, action) => reduce(current, action).state, state)
}

describe('çalma', () => {
  it('parçayı baştan başlatır; aynı parça da yeniden başa sarılır', () => {
    const started = apply(stateWith(), { type: 'playback/play', trackId: 't2' })
    expect(started.session.playback).toMatchObject({ trackId: 't2', playing: true, seekTo: 0, seekNonce: 6 })
    const again = apply(started, { type: 'playback/seek', position: 30 }, { type: 'playback/play', trackId: 't2' })
    expect(again.session.playback).toMatchObject({ trackId: 't2', seekTo: 0, seekNonce: 8 })
  })

  it('duraklatma ve devam yalnızca bir parça seçiliyken çalışır', () => {
    const idle = stateWith()
    expect(reduce(idle, { type: 'playback/resume' }).state).toBe(idle)
    const playing = stateWith({ trackId: 't1', playing: true })
    const paused = apply(playing, { type: 'playback/pause' })
    expect(paused.session.playback.playing).toBe(false)
    expect(reduce(paused, { type: 'playback/pause' }).state).toBe(paused)
    expect(apply(paused, { type: 'playback/resume' }).session.playback.playing).toBe(true)
  })

  it('sarma konumu eksiye inmez; parça yokken yok sayılır', () => {
    const playing = stateWith({ trackId: 't1', playing: true })
    expect(apply(playing, { type: 'playback/seek', position: -4 }).session.playback.seekTo).toBe(0)
    const idle = stateWith()
    expect(reduce(idle, { type: 'playback/seek', position: 10 }).state).toBe(idle)
  })

  it('ileri / geri listede gezinir; "tümünü tekrarla"da uçlardan döner', () => {
    const last = stateWith({ trackId: 't3', playing: true, repeat: 'all' })
    expect(apply(last, { type: 'playback/next' }).session.playback.trackId).toBe('t1')
    const first = stateWith({ trackId: 't1', playing: true, repeat: 'all' })
    expect(apply(first, { type: 'playback/previous' }).session.playback.trackId).toBe('t3')
    expect(apply(first, { type: 'playback/next' }).session.playback.trackId).toBe('t2')
  })

  it('tekrar kapalıyken: sondaki ileri bir şey yapmaz, baştaki geri ilk parçayı baştan çalar', () => {
    const last = stateWith({ trackId: 't3', playing: true, repeat: 'off' })
    expect(reduce(last, { type: 'playback/next' }).state).toBe(last)
    const first = stateWith({ trackId: 't1', playing: true, repeat: 'off' })
    const back = apply(first, { type: 'playback/previous' })
    expect(back.session.playback).toMatchObject({ trackId: 't1', playing: true, seekNonce: 6 })
  })

  it('hiçbir parça seçili değilken ileri ilk, geri son parçayı başlatır', () => {
    expect(apply(stateWith(), { type: 'playback/next' }).session.playback.trackId).toBe('t1')
    expect(apply(stateWith(), { type: 'playback/previous' }).session.playback.trackId).toBe('t3')
  })

  it('biten parça tekrar ayarına göre ilerler', () => {
    const ended: Action = { type: 'playback/ended', trackId: 't1' }
    expect(apply(stateWith({ trackId: 't1', playing: true, repeat: 'all' }), ended).session.playback.trackId).toBe('t2')
    const one = apply(stateWith({ trackId: 't1', playing: true, repeat: 'one' }), ended)
    expect(one.session.playback).toMatchObject({ trackId: 't1', playing: true, seekNonce: 6 })

    const lastEnded: Action = { type: 'playback/ended', trackId: 't3' }
    const off = apply(stateWith({ trackId: 't3', playing: true, repeat: 'off' }), lastEnded)
    // Son parça bitti: başa sarılıp durur, parça seçili kalır.
    expect(off.session.playback).toMatchObject({ trackId: 't3', playing: false, seekTo: 0, seekNonce: 6 })
    const wrapped = apply(stateWith({ trackId: 't3', playing: true, repeat: 'all' }), lastEnded)
    expect(wrapped.session.playback.trackId).toBe('t1')
  })

  it('geç gelen "bitti" bildirimi yok sayılır', () => {
    const state = stateWith({ trackId: 't2', playing: true })
    expect(reduce(state, { type: 'playback/ended', trackId: 't1' }).state).toBe(state)
    const paused = stateWith({ trackId: 't1', playing: false })
    expect(reduce(paused, { type: 'playback/ended', trackId: 't1' }).state).toBe(paused)
  })

  it('durdur parçayı bırakır; liste boşken ileri bir şey yapmaz', () => {
    const stopped = apply(stateWith({ trackId: 't2', playing: true }), { type: 'playback/stop' })
    expect(stopped.session.playback).toMatchObject({ trackId: null, playing: false })
    const empty = createInitialState()
    expect(reduce(empty, { type: 'playback/next' }).state).toBe(empty)
  })

  it('çalma işlemleri kaydı (app) değiştirmez', () => {
    const state = stateWith({ trackId: 't1', playing: true })
    const actions: Action[] = [
      { type: 'playback/pause' },
      { type: 'playback/seek', position: 12 },
      { type: 'playback/next' },
      { type: 'playback/stop' },
      { type: 'ambient/toggle', ambientId: 'kus' }
    ]
    for (const action of actions) expect(reduce(state, action).state.app).toBe(state.app)
  })
})

describe('parça listesi', () => {
  it('çalan parça silinince müzik durur ve parça arka plan olduğu pencereden kalkar', () => {
    const playing = stateWith({ trackId: 't3', playing: true })
    const next = apply(playing, { type: 'music/removeTrack', trackId: 't3' })
    expect(next.app.music.tracks.map((track) => track.id)).toEqual(['t1', 't2'])
    expect(next.session.playback).toMatchObject({ trackId: null, playing: false })
    expect(next.app.scenes[1].videoTrackId).toBeNull()
  })

  it('başka bir parça silinince çalan parça sürer', () => {
    const playing = stateWith({ trackId: 't1', playing: true })
    const next = apply(playing, { type: 'music/removeTrack', trackId: 't2' })
    expect(next.session).toBe(playing.session)
  })

  it('adı kırpılır, boş ad yok sayılır, sınırı aşan ad kesilir', () => {
    const state = stateWith()
    expect(apply(state, { type: 'music/renameTrack', trackId: 't1', name: '  Taverna  ' }).app.music.tracks[0].originalName).toBe('Taverna')
    expect(reduce(state, { type: 'music/renameTrack', trackId: 't1', name: '   ' }).state).toBe(state)
    expect(apply(state, { type: 'music/renameTrack', trackId: 't1', name: 'x'.repeat(200) }).app.music.tracks[0].originalName).toHaveLength(80)
  })

  it('sıra yukarı / aşağı değişir, uçlarda değişmez', () => {
    const state = stateWith()
    expect(apply(state, { type: 'music/moveTrack', trackId: 't3', to: 'up' }).app.music.tracks.map((t) => t.id)).toEqual(['t1', 't3', 't2'])
    expect(reduce(state, { type: 'music/moveTrack', trackId: 't1', to: 'up' }).state).toBe(state)
    expect(reduce(state, { type: 'music/moveTrack', trackId: 't3', to: 'down' }).state).toBe(state)
  })

  it('eklenen parçalar sona girer; videosuz parçaya döngü aralığı yazılmaz', () => {
    const added = apply(stateWith(), {
      type: 'music/addTracks',
      tracks: [{ ...T1, id: 'yeni', fileName: 'yeni.mp3', loop: { start: 0, end: 4 } }]
    })
    expect(added.app.music.tracks.at(-1)).toMatchObject({ id: 'yeni', loop: null })
  })

  it('ses düzeyi 0–1 arasına çekilir ve yüzde bire yuvarlanır', () => {
    const state = stateWith()
    expect(apply(state, { type: 'music/setVolume', volume: 1.7 }).app.music.musicVolume).toBe(1)
    expect(apply(state, { type: 'music/setVolume', volume: -1 }).app.music.musicVolume).toBe(0)
    expect(apply(state, { type: 'music/setAmbientVolume', volume: 0.3333 }).app.music.ambientVolume).toBe(0.33)
  })
})

describe('hareketli arka plan', () => {
  it('döngü aralığı en az yarım saniye olmalı; yalnızca videolu parçaya verilir', () => {
    const state = stateWith()
    expect(reduce(state, { type: 'music/setLoop', trackId: 't3', loop: { start: 2, end: 2.3 } }).issue?.code).toBe('DND-306')
    expect(reduce(state, { type: 'music/setLoop', trackId: 't1', loop: { start: 0, end: 3 } }).issue?.code).toBe('DND-306')
    const set = apply(state, { type: 'music/setLoop', trackId: 't3', loop: { start: -2, end: 6.123 } })
    expect(set.app.music.tracks[2].loop).toEqual({ start: 0, end: 6.12 })
  })

  it('görüntüsü kapatılan parça arka plan olduğu pencerelerden kalkar', () => {
    const next = apply(stateWith(), { type: 'music/setLoop', trackId: 't3', loop: null })
    expect(next.app.music.tracks[2].loop).toBeNull()
    expect(next.app.scenes[1].videoTrackId).toBeNull()
  })

  it('hareketli arka plan görsel arka planın yerine geçer, görsel arka plan da onun', () => {
    const withVideo = apply(stateWith(), { type: 'scene/setVideo', sceneId: 's1', trackId: 't3' })
    expect(withVideo.app.scenes[0]).toMatchObject({ videoTrackId: 't3', background: null })

    const withImage = apply(stateWith(), {
      type: 'stage/setBackground',
      sceneId: 's2',
      fallbackSceneId: 'x',
      itemId: 'yeni-bg',
      imageId: PLACE.id
    })
    expect(withImage.app.scenes[1].videoTrackId).toBeNull()
    expect(withImage.app.scenes[1].background?.id).toBe('yeni-bg')
  })

  it('döngüsü olmayan parça arka plan yapılamaz', () => {
    const state = stateWith()
    expect(reduce(state, { type: 'scene/setVideo', sceneId: 's1', trackId: 't1' }).issue?.code).toBe('DND-306')
    expect(reduce(state, { type: 'scene/setVideo', sceneId: 's1', trackId: 'yok' }).issue?.code).toBe('DND-302')
  })

  it('"arka planı kaldır" hareketli arka planı da kaldırır', () => {
    const next = apply(stateWith(), { type: 'stage/clearBackground', sceneId: 's2' })
    expect(next.app.scenes[1].videoTrackId).toBeNull()
  })
})

describe('ortam sesleri', () => {
  it('birden çok ortam sesi aynı anda açılır ve tek tek kapanır', () => {
    const both = apply(stateWith(), { type: 'ambient/toggle', ambientId: 'yagmur' }, { type: 'ambient/toggle', ambientId: 'kus' })
    expect(both.session.playback.ambientIds).toEqual(['yagmur', 'kus'])
    expect(apply(both, { type: 'ambient/toggle', ambientId: 'yagmur' }).session.playback.ambientIds).toEqual(['kus'])
    expect(apply(both, { type: 'ambient/stopAll' }).session.playback.ambientIds).toEqual([])
  })

  it('çalan ortam sesi silinince susar', () => {
    const on = apply(stateWith(), { type: 'ambient/toggle', ambientId: 'kus' })
    const removed = apply(on, { type: 'ambient/remove', ambientId: 'kus' })
    expect(removed.app.music.ambients.map((a) => a.id)).toEqual(['yagmur'])
    expect(removed.session.playback.ambientIds).toEqual([])
  })

  it('ad boş bırakılamaz; ses düzeyi sınırlanır', () => {
    const state = stateWith()
    expect(reduce(state, { type: 'ambient/update', ambientId: 'kus', patch: { name: '  ' } }).state).toBe(state)
    const next = apply(state, { type: 'ambient/update', ambientId: 'kus', patch: { name: ' Baykuş ', volume: 3 } })
    expect(next.app.music.ambients[1]).toMatchObject({ name: 'Baykuş', volume: 1 })
  })

  it('en fazla 24 ortam sesi eklenir', () => {
    let state = stateWith()
    for (let index = 0; index < 30; index++) {
      state = apply(state, { type: 'ambient/add', ambient: { ...RAIN, id: `a${index}`, fileName: `a${index}.ogg` } })
    }
    expect(state.app.music.ambients).toHaveLength(24)
  })
})
