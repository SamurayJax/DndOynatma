import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AmbientSound, FullState, MusicTrack, createInitialSession } from '@shared/types'
import { isSupportedSoundName, mediaFileNameFromUrl, mediaTargetFromUrl, mimeTypeFor, parseRange } from '../../src/main/fileNames'
import { normalizeAppState } from '../../src/main/normalize'
import { copySoundsIntoFolder } from '../../src/main/soundImporter'
import { Store } from '../../src/main/store'
import { makeTempDir, removeTempDir, sampleAppState } from './helpers'

const TRACK: MusicTrack = { id: 't1', fileName: 't1.mp3', originalName: 'Taverna', hasVideo: false, loop: null, addedAt: '2026-10-28T10:00:00.000Z' }
const VIDEO: MusicTrack = { id: 'v1', fileName: 'v1.mp4', originalName: 'Şömine', hasVideo: true, loop: { start: 1, end: 4 }, addedAt: '2026-10-28T10:00:00.000Z' }
const AMBIENT: AmbientSound = { id: 'a1', name: 'Kuş sesi', fileName: 'a1.ogg', volume: 0.7, addedAt: '2026-10-28T10:00:00.000Z' }

describe('parseRange', () => {
  it('başlık yoksa ya da anlaşılmıyorsa dosyanın tamamı gönderilir', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=-', 1000)).toBeNull()
    expect(parseRange('items=0-10', 1000)).toBeNull()
    expect(parseRange('bytes=0-10,20-30', 1000)).toBeNull()
  })

  it('aralıkları çözer; bitiş dosyanın sonuna çekilir', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('dosyanın dışındaki aralık karşılanamaz', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=50-10', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable')
  })
})

describe('ses adresleri', () => {
  it('ses ve görsel adresleri kendi klasörlerine gider', () => {
    expect(mediaTargetFromUrl('dnd-media://ses/abc.mp3')).toEqual({ host: 'ses', fileName: 'abc.mp3' })
    expect(mediaTargetFromUrl('dnd-media://gorsel/abc.png')).toEqual({ host: 'gorsel', fileName: 'abc.png' })
    // Görsel yardımcısı ses adresini görsel saymaz.
    expect(mediaFileNameFromUrl('dnd-media://ses/abc.mp3')).toBeNull()
  })

  it('klasör dışına çıkan ya da tanınmayan adresleri reddeder', () => {
    for (const url of ['dnd-media://ses/..%2Fkayit.json', 'dnd-media://muzik/a.mp3', 'file:///c:/a.mp3', 'dnd-media://ses/']) {
      expect(mediaTargetFromUrl(url)).toBeNull()
    }
  })

  it('uzantıları ve türleri tanır', () => {
    for (const name of ['a.mp3', 'B.OGG', 'c.wav', 'd.m4a', 'e.MP4']) expect(isSupportedSoundName(name)).toBe(true)
    for (const name of ['a.flac', 'b.webm', 'c.png', 'mp3']) expect(isSupportedSoundName(name)).toBe(false)
    expect(mimeTypeFor('a.mp3')).toBe('audio/mpeg')
    expect(mimeTypeFor('a.mp4')).toBe('video/mp4')
  })
})

describe('copySoundsIntoFolder', () => {
  let dir: string
  let soundsDir: string

  beforeEach(() => {
    dir = makeTempDir()
    soundsDir = path.join(dir, 'muzik')
    fs.mkdirSync(soundsDir)
  })

  afterEach(() => removeTempDir(dir))

  function source(name: string, content = 'ses'): string {
    const file = path.join(dir, name)
    fs.writeFileSync(file, content)
    return file
  }

  it('dosyaları benzersiz adla, içeriğine dokunmadan kopyalar', async () => {
    const { copied, skipped } = await copySoundsIntoFolder(soundsDir, [source('Taverna Şarkısı.mp3', 'mp3-baytları'), source('ates.MP4', 'mp4')])
    expect(skipped).toEqual([])
    expect(copied.map((entry) => entry.originalName)).toEqual(['Taverna Şarkısı', 'ates'])
    expect(copied.map((entry) => entry.hasVideo)).toEqual([false, true])
    expect(copied[0].fileName).toMatch(/^[0-9a-f-]{36}\.mp3$/)
    expect(copied[1].fileName).toMatch(/\.mp4$/)
    expect(fs.readFileSync(path.join(soundsDir, copied[0].fileName), 'utf8')).toBe('mp3-baytları')
  })

  it('desteklenmeyen, olmayan ya da dosya olmayan yolları atlar', async () => {
    const folder = path.join(dir, 'klasor.mp3')
    fs.mkdirSync(folder)
    const { copied, skipped } = await copySoundsIntoFolder(soundsDir, [source('a.flac'), path.join(dir, 'yok.mp3'), folder])
    expect(copied).toEqual([])
    expect(skipped.map((entry) => entry.code)).toEqual(['DND-501', 'DND-502', 'DND-502'])
    expect(fs.readdirSync(soundsDir)).toEqual([])
  })
})

describe('kayıt onarımı (müzik)', () => {
  it('eski kayıtta müzik yoksa boş liste ve varsayılan ses düzeyleri gelir', () => {
    const { music: _music, ...old } = sampleAppState()
    const state = normalizeAppState(old)
    expect(state?.music).toEqual({ tracks: [], ambients: [], musicVolume: 0.6, ambientVolume: 0.8, repeat: 'all' })
    expect(state?.scenes.every((scene) => scene.videoTrackId === null)).toBe(true)
  })

  it('hatalı parçaları atar, ses düzeyini sınırlar, tanımadığı tekrarı varsayılana çeker', () => {
    const state = normalizeAppState({
      ...sampleAppState(),
      music: {
        tracks: [TRACK, { ...TRACK }, { ...TRACK, id: 'kotu', fileName: '../kayit.json' }, { ...VIDEO, loop: { start: 3, end: 3.1 } }, 'parça'],
        ambients: [AMBIENT, { ...AMBIENT, id: 'a2', name: '  ', volume: 9 }],
        musicVolume: 4,
        ambientVolume: 'yüksek',
        repeat: 'hep'
      }
    })
    expect(state?.music.tracks.map((track) => track.id)).toEqual(['t1', 'v1'])
    // Kısa döngü geçersiz: video yalnızca ses olarak kalır.
    expect(state?.music.tracks[1].loop).toBeNull()
    expect(state?.music.ambients[1]).toMatchObject({ name: 'Ortam sesi', volume: 1 })
    expect(state?.music).toMatchObject({ musicVolume: 1, ambientVolume: 0.8, repeat: 'all' })
  })

  it('pencerenin hareketli arka planı yalnızca döngüsü olan bir parçayı gösterebilir', () => {
    const base = sampleAppState()
    const scenes = [
      { ...base.scenes[0], background: null, videoTrackId: 'v1' },
      { ...base.scenes[1], videoTrackId: 't1' }
    ]
    const state = normalizeAppState({ ...base, scenes, music: { ...base.music, tracks: [TRACK, VIDEO] } })
    expect(state?.scenes.map((scene) => scene.videoTrackId)).toEqual(['v1', null])

    // Görsel arka planı olan pencerede hareketli arka plan olamaz.
    const both = normalizeAppState({ ...base, scenes: [{ ...base.scenes[0], videoTrackId: 'v1' }], music: { ...base.music, tracks: [VIDEO] } })
    expect(both?.scenes[0].videoTrackId).toBeNull()
  })
})

describe('Store (müzik)', () => {
  function createStore(): { store: Store; trashSound: ReturnType<typeof vi.fn>; report: ReturnType<typeof vi.fn> } {
    const app = sampleAppState()
    app.music = { ...app.music, tracks: [TRACK, VIDEO], ambients: [AMBIENT] }
    const initial: FullState = { app, session: createInitialSession() }
    const trashSound = vi.fn()
    const report = vi.fn()
    const store = new Store({ initial, saveEnabled: true, writeSave: vi.fn(), broadcast: vi.fn(), report, trashImage: vi.fn(), trashSound, saveDelayMs: 10_000 })
    return { store, trashSound, report }
  }

  it('dosya adı taşıyan müzik işlemlerini arayüzden kabul etmez', () => {
    const { store, report } = createStore()
    expect(store.dispatch({ type: 'music/addTracks', tracks: [{ ...TRACK, id: 'x', fileName: '../../x.mp3' }] })).toBe(false)
    expect(store.dispatch({ type: 'ambient/add', ambient: { ...AMBIENT, id: 'x' } })).toBe(false)
    expect(report).toHaveBeenCalledTimes(2)
    expect(store.dispatch({ type: 'music/addTracks', tracks: [{ ...TRACK, id: 'yeni', fileName: 'yeni.mp3' }] }, { trusted: true })).toBe(true)
  })

  it('listeden çıkan parçanın ve ortam sesinin dosyası geri dönüşüm kutusuna gider', () => {
    const { store, trashSound } = createStore()
    store.dispatch({ type: 'music/removeTrack', trackId: 'v1' })
    store.dispatch({ type: 'ambient/remove', ambientId: 'a1' })
    expect(trashSound.mock.calls).toEqual([['v1.mp4'], ['a1.ogg']])
  })

  it('çalma işlemleri dosyalara dokunmaz', () => {
    const { store, trashSound } = createStore()
    store.dispatch({ type: 'playback/play', trackId: 't1' })
    store.dispatch({ type: 'playback/stop' })
    store.dispatch({ type: 'ambient/toggle', ambientId: 'a1' })
    expect(trashSound).not.toHaveBeenCalled()
  })
})
