import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@shared/errors'
import { FullState, LibraryImage, createInitialSession } from '@shared/types'
import { copyImagesIntoLibrary } from '../../src/main/importer'
import { log } from '../../src/main/logger'
import { DataPaths, buildDataPaths, ensureDataDirs } from '../../src/main/paths'
import { loadAppState, saveAppState } from '../../src/main/storage'
import { Store } from '../../src/main/store'
import { makeTempDir, pngBytes, removeTempDir } from './helpers'

// Gerçek reducer ile: görsel yükleme, kayıt ve yeniden açma birlikte çalışıyor mu?
let dir: string
let paths: DataPaths
let trashed: LibraryImage[]
let reports: ErrorCode[]

function openStore(): Store {
  const loaded = loadAppState(paths.saveFile, paths.backupFile)
  const initial: FullState = { app: loaded.state, session: createInitialSession() }
  return new Store({
    initial,
    saveEnabled: !loaded.saveDisabled,
    writeSave: (app) => saveAppState(paths.saveFile, paths.backupFile, app),
    broadcast: () => undefined,
    report: (code) => {
      reports.push(code)
    },
    trashImage: (image) => {
      trashed.push(image)
    }
  })
}

async function importImage(store: Store, kind: LibraryImage['kind'], name: string): Promise<LibraryImage> {
  const file = path.join(dir, name)
  fs.writeFileSync(file, pngBytes(640, 480))
  const { added } = await copyImagesIntoLibrary(paths.imagesDir, kind, [file])
  store.dispatch({ type: 'library/add', images: added }, { trusted: true })
  return added[0]
}

beforeEach(() => {
  dir = makeTempDir()
  paths = buildDataPaths(path.join(dir, 'veri'))
  ensureDataDirs(paths)
  log.init(paths.logDir)
  trashed = []
  reports = []
})

afterEach(() => {
  log.close()
  removeTempDir(dir)
})

describe('ana süreç + reducer', () => {
  it('yüklenen görsel kütüphaneye girer, kaydedilir ve yeniden açılışta yerindedir', async () => {
    const store = openStore()
    const image = await importImage(store, 'npc', 'kral.png')

    expect(store.getState().app.library).toEqual([image])
    expect(store.flushSave()).toBe(true)

    const reopened = openStore()
    expect(reopened.getState().app.library).toEqual([image])
    expect(reports).toEqual([])
  })

  it('portre değişince eski portre kütüphaneden çıkar ve dosyası çöpe gönderilir', async () => {
    const store = openStore()
    const first = await importImage(store, 'portrait', 'eski.png')
    store.dispatch({ type: 'player/update', slot: 1, patch: { portraitId: first.id } }, { trusted: true })
    expect(store.getState().app.players[1].portraitId).toBe(first.id)
    expect(trashed).toEqual([])

    const second = await importImage(store, 'portrait', 'yeni.png')
    store.dispatch({ type: 'player/update', slot: 1, patch: { portraitId: second.id } }, { trusted: true })

    expect(store.getState().app.players[1].portraitId).toBe(second.id)
    expect(store.getState().app.library.map((image) => image.id)).toEqual([second.id])
    expect(trashed).toEqual([first])
  })

  it('silinen görselin dosyası çöpe gönderilir, kalanlara dokunulmaz', async () => {
    const store = openStore()
    const kept = await importImage(store, 'place', 'saray.png')
    const removed = await importImage(store, 'enemy', 'goblin.png')

    store.dispatch({ type: 'library/remove', imageId: removed.id })

    expect(store.getState().app.library).toEqual([kept])
    expect(trashed).toEqual([removed])
  })

  it('tam ekran ayarı kalıcıdır', () => {
    vi.useFakeTimers()
    try {
      const store = openStore()
      const before = store.getState().app.settings.gameFullscreen
      store.dispatch({ type: 'settings/update', patch: { gameFullscreen: !before } }, { trusted: true })
      vi.advanceTimersByTime(300)
      expect(openStore().getState().app.settings.gameFullscreen).toBe(!before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('var olmayan görseli silme isteği durumu değiştirmez', () => {
    const store = openStore()
    const before = store.getState()
    expect(store.dispatch({ type: 'library/remove', imageId: 'yok' })).toBe(false)
    expect(store.getState()).toBe(before)
    expect(trashed).toEqual([])
  })
})
