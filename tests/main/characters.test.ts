import fs from 'node:fs'
import path from 'node:path'
import * as electron from 'electron'
import { Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryImage, MAX_HP, createInitialState } from '@shared/types'
import { decodeCharacterFile, encodeCharacterFile } from '../../src/main/characterFile'
import {
  CharacterDeps,
  applyCharacterImport,
  cancelCharacterImport,
  exportCharacters,
  exportCharactersTo,
  pickCharacterImport,
  previewCharacterFile
} from '../../src/main/characters'
import { importPortraitFile } from '../../src/main/library'
import { log } from '../../src/main/logger'
import { DataPaths, buildDataPaths, ensureDataDirs } from '../../src/main/paths'
import { Store } from '../../src/main/store'
import { makeTempDir, pngBytes, removeTempDir, webpLossyBytes } from './helpers'

vi.mock('electron', () => ({
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }
}))

const dialog = (electron as unknown as { dialog: { showSaveDialog: Mock; showOpenDialog: Mock } }).dialog

interface Fixture {
  paths: DataPaths
  store: Store
  deps: CharacterDeps
  trashed: LibraryImage[]
}

let dir: string
let exportFile: string

/** Kendi kayıt klasörü olan ayrı bir "bilgisayar". Silinen görseller gerçek kutu yerine listeye düşer. */
function makeFixture(name: string): Fixture {
  const paths = buildDataPaths(path.join(dir, name))
  ensureDataDirs(paths)
  const trashed: LibraryImage[] = []
  const store = new Store({
    initial: createInitialState(),
    saveEnabled: true,
    writeSave: vi.fn(),
    broadcast: vi.fn(),
    report: vi.fn(),
    trashImage: (image) => {
      trashed.push(image)
      fs.rmSync(path.join(paths.imagesDir, image.fileName), { force: true })
    },
    trashSound: vi.fn()
  })
  return { paths, store, trashed, deps: { store, imagesDir: paths.imagesDir, appVersion: () => '0.9.3' } }
}

function sourceFile(name: string, content: Buffer): string {
  const file = path.join(dir, name)
  fs.writeFileSync(file, content)
  return file
}

async function fillCard(fixture: Fixture, slot: number, name: string, portrait: Buffer | null, extra: { level?: number; hp?: number; note?: string } = {}): Promise<void> {
  if (portrait) await importPortraitFile(fixture.deps, slot, sourceFile(`portre-${slot}-${name}.png`, portrait))
  fixture.store.dispatch({ type: 'player/update', slot, patch: { name, level: extra.level ?? 1, note: extra.note ?? '' } })
  fixture.store.dispatch({ type: 'player/setHp', slot, hp: extra.hp ?? MAX_HP })
}

function portraitBytes(fixture: Fixture, slot: number): Buffer | null {
  const { players, library } = fixture.store.getState().app
  const image = library.find((entry) => entry.id === players[slot].portraitId)
  return image ? fs.readFileSync(path.join(fixture.paths.imagesDir, image.fileName)) : null
}

function cardsOf(fixture: Fixture): { name: string; level: number; hp: number; note: string }[] {
  return fixture.store.getState().app.players.map(({ name, level, hp, note }) => ({ name, level, hp, note }))
}

const imageFiles = (fixture: Fixture): string[] => fs.readdirSync(fixture.paths.imagesDir).sort()

function logText(): string {
  return fs.readFileSync(log.currentFile(), 'utf8')
}

/** Kaynak bilgisayar: üç dolu kart, ikisi portreli. */
async function sourceMachine(): Promise<Fixture> {
  const source = makeFixture('kaynak')
  await fillCard(source, 0, 'Kenji', pngBytes(400, 400), { level: 4, hp: 7, note: 'Gümüş kılıç onda' })
  await fillCard(source, 1, 'Jasper', webpLossyBytes(360, 480), { level: 5 })
  await fillCard(source, 3, 'Mira', null, { level: 2, hp: 0 })
  return source
}

beforeEach(() => {
  dir = makeTempDir()
  exportFile = path.join(dir, 'kartlar.dndkarakter')
  log.init(path.join(dir, 'log'))
  dialog.showSaveDialog.mockReset()
  dialog.showOpenDialog.mockReset()
})

afterEach(() => {
  log.close()
  removeTempDir(dir)
})

describe('karakterleri dışa aktarma', () => {
  it('dolu kartları portreleriyle tek dosyaya yazar', async () => {
    const source = await sourceMachine()
    const result = await exportCharactersTo(source.deps, exportFile)

    expect(result).toEqual({ ok: true, canceled: false, code: null, fileName: 'kartlar.dndkarakter', count: 3, missingPortraits: [] })
    const decoded = decodeCharacterFile(fs.readFileSync(exportFile))
    if (!decoded.ok) throw new Error(decoded.detail)
    expect(decoded.cards.map((card) => [card.slot, card.name, card.level, card.hp, card.note])).toEqual([
      [0, 'Kenji', 4, 7, 'Gümüş kılıç onda'],
      [1, 'Jasper', 5, MAX_HP, ''],
      [3, 'Mira', 2, 0, '']
    ])
    expect(decoded.cards[0].portrait?.data.equals(pngBytes(400, 400))).toBe(true)
    expect(decoded.cards[1].portrait?.data.equals(webpLossyBytes(360, 480))).toBe(true)
    expect(decoded.cards[2].portrait).toBeNull()
    // Yan dosya kalmaz; kaynağın kaydına ve görsellerine dokunulmaz.
    expect(fs.readdirSync(dir).filter((name) => name.includes('yaziliyor'))).toEqual([])
    expect(imageFiles(source)).toHaveLength(2)
    expect(source.trashed).toEqual([])
  })

  it('isimleri ve notları loga yazmaz', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    const preview = await previewCharacterFile(target.deps, exportFile)
    await applyCharacterImport(target.deps, preview.token)

    const text = logText()
    expect(text).toContain('Karakterler dışa aktarıldı: 3 kart')
    expect(text).toContain('Karakterler içe aktarıldı: 3 kart')
    for (const secret of ['Kenji', 'Jasper', 'Mira', 'Gümüş']) expect(text).not.toContain(secret)
  })

  it('kaydetme penceresini açar; uzantı yazılmadıysa ekler', async () => {
    const source = await sourceMachine()
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: path.join(dir, 'ekibim') })

    const result = await exportCharacters(source.deps, null)

    expect(result).toMatchObject({ ok: true, fileName: 'ekibim.dndkarakter', count: 3 })
    expect(fs.existsSync(path.join(dir, 'ekibim.dndkarakter'))).toBe(true)
    const [options] = dialog.showSaveDialog.mock.calls[0]
    expect(options.defaultPath).toMatch(/^DndOynatma-Karakterler-\d{4}-\d{2}-\d{2}\.dndkarakter$/)
    expect(options.filters).toEqual([{ name: 'DndOynatma karakter dosyası', extensions: ['dndkarakter'] }])
  })

  it('pencere iptal edilirse hiçbir şey yazmaz', async () => {
    const source = await sourceMachine()
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })
    expect(await exportCharacters(source.deps, null)).toMatchObject({ ok: false, canceled: true, code: null })
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.dndkarakter'))).toEqual([])
  })

  it('dolu kart yoksa pencere açmaz', async () => {
    const empty = makeFixture('bos')
    expect(await exportCharacters(empty.deps, null)).toEqual({ ok: false, canceled: false, code: null, fileName: null, count: 0, missingPortraits: [] })
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })

  it('adı silinmiş ama notu kalmış kartı da yazar', async () => {
    const source = makeFixture('kaynak')
    await fillCard(source, 2, '', null, { note: 'oyunda alınmış not' })
    expect(await exportCharactersTo(source.deps, exportFile)).toMatchObject({ ok: true, count: 1 })
  })

  it('portre dosyası kayıpsa kartı portresiz yazar ve bildirir (DND-203)', async () => {
    const source = await sourceMachine()
    const [first] = imageFiles(source)
    const lostSlot = source.store.getState().app.players.findIndex(
      (player) => source.store.getState().app.library.find((image) => image.id === player.portraitId)?.fileName === first
    )
    fs.rmSync(path.join(source.paths.imagesDir, first))

    const result = await exportCharactersTo(source.deps, exportFile)

    expect(result).toMatchObject({ ok: true, count: 3, missingPortraits: [lostSlot] })
    const decoded = decodeCharacterFile(fs.readFileSync(exportFile))
    if (!decoded.ok) throw new Error(decoded.detail)
    expect(decoded.cards.find((card) => card.slot === lostSlot)?.portrait).toBeNull()
    expect(logText()).toContain('[DND-203]')
  })

  it('tek içeriği kayıp portre olan kart dosyaya girmez', async () => {
    const source = makeFixture('kaynak')
    await importPortraitFile(source.deps, 0, sourceFile('tek.png', pngBytes(20, 20)))
    fs.rmSync(path.join(source.paths.imagesDir, imageFiles(source)[0]))
    expect(await exportCharactersTo(source.deps, exportFile)).toMatchObject({ ok: false, count: 0 })
    expect(fs.existsSync(exportFile)).toBe(false)
  })

  it('yazılamazsa DND-111 döner, var olan dosyayı bozmaz', async () => {
    const source = await sourceMachine()
    // Hedef bir klasör: üzerine dosya yazılamaz.
    const blocked = path.join(dir, 'klasor.dndkarakter')
    fs.mkdirSync(blocked)
    fs.writeFileSync(path.join(blocked, 'icerik.txt'), 'dokunma')

    const result = await exportCharactersTo(source.deps, blocked)

    expect(result).toMatchObject({ ok: false, canceled: false, code: 'DND-111', count: 0 })
    expect(fs.readFileSync(path.join(blocked, 'icerik.txt'), 'utf8')).toBe('dokunma')
    expect(fs.readdirSync(dir).filter((name) => name.includes('yaziliyor'))).toEqual([])
    expect(logText()).toContain('[DND-111]')
  })
})

describe('karakterleri içe aktarma', () => {
  it('başka bir kayıt klasöründe dört kartı portreleriyle aynı getirir', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')

    const preview = await previewCharacterFile(target.deps, exportFile)
    expect(preview).toMatchObject({ ok: true, canceled: false, code: null, fileName: 'kartlar.dndkarakter' })
    expect(Number.isNaN(Date.parse(preview.exportedAt ?? ''))).toBe(false)
    expect(preview.cards).toEqual([
      { slot: 0, name: 'Kenji', level: 4, hp: 7, hasNote: true, hasPortrait: true, className: null, unchanged: false },
      { slot: 1, name: 'Jasper', level: 5, hp: MAX_HP, hasNote: false, hasPortrait: true, className: null, unchanged: false },
      { slot: 3, name: 'Mira', level: 2, hp: 0, hasNote: false, hasPortrait: false, className: null, unchanged: false }
    ])
    // Önizleme kayda dokunmaz.
    expect(cardsOf(target)).toEqual(cardsOf(makeFixture('bos')))
    expect(imageFiles(target)).toEqual([])

    const result = await applyCharacterImport(target.deps, preview.token)

    expect(result).toEqual({ ok: true, code: null, slots: [0, 1, 3] })
    expect(cardsOf(target)).toEqual(cardsOf(source))
    expect(portraitBytes(target, 0)?.equals(pngBytes(400, 400))).toBe(true)
    expect(portraitBytes(target, 1)?.equals(webpLossyBytes(360, 480))).toBe(true)
    expect(portraitBytes(target, 3)).toBeNull()
    const library = target.store.getState().app.library
    expect(library.map((image) => image.kind)).toEqual(['portrait', 'portrait'])
    expect(library.map((image) => [image.width, image.height])).toEqual([
      [400, 400],
      [360, 480]
    ])
    expect(library.map((image) => path.extname(image.fileName))).toEqual(['.png', '.webp'])
    expect(imageFiles(target)).toEqual(library.map((image) => image.fileName).sort())
  })

  it('aynı dosya ikinci kez içe aktarılınca hiçbir şey değişmez', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    await applyCharacterImport(target.deps, (await previewCharacterFile(target.deps, exportFile)).token)
    const stateBefore = target.store.getState().app
    const filesBefore = imageFiles(target)

    const preview = await previewCharacterFile(target.deps, exportFile)
    expect(preview.cards.map((card) => card.unchanged)).toEqual([true, true, true])
    expect(await applyCharacterImport(target.deps, preview.token)).toEqual({ ok: true, code: null, slots: [] })

    expect(target.store.getState().app).toBe(stateBefore)
    expect(imageFiles(target)).toEqual(filesBefore)
    expect(target.trashed).toEqual([])
  })

  it('dosyadaki kart aynı numaralı kartın yerine geçer; dosyada olmayan karta dokunulmaz', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    await fillCard(target, 0, 'Eski Kahraman', pngBytes(64, 64), { level: 9, hp: 3, note: 'silinecek not' })
    await fillCard(target, 2, 'Dokunulmaz', pngBytes(32, 32), { level: 6, note: 'kalacak' })
    const oldPortrait = target.store.getState().app.library.find((image) => image.id === target.store.getState().app.players[0].portraitId)
    const keptPortrait = portraitBytes(target, 2)

    const preview = await previewCharacterFile(target.deps, exportFile)
    const result = await applyCharacterImport(target.deps, preview.token)

    expect(result.slots).toEqual([0, 1, 3])
    expect(cardsOf(target)[0]).toEqual({ name: 'Kenji', level: 4, hp: 7, note: 'Gümüş kılıç onda' })
    expect(cardsOf(target)[2]).toEqual({ name: 'Dokunulmaz', level: 6, hp: MAX_HP, note: 'kalacak' })
    expect(portraitBytes(target, 2)?.equals(keptPortrait ?? Buffer.alloc(0))).toBe(true)
    // Yerine geçilen kartın portresi kütüphaneden çıkar ve geri dönüşüm kutusuna gönderilir.
    expect(target.trashed).toEqual([oldPortrait])
    expect(target.store.getState().app.library.some((image) => image.id === oldPortrait?.id)).toBe(false)
    expect(target.store.getState().app.library).toHaveLength(3)
  })

  it('dosyadaki kart portresizse karşısındaki kartın portresi kalkar', async () => {
    const source = makeFixture('kaynak')
    await fillCard(source, 1, 'Portresiz', null, { level: 3 })
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    await fillCard(target, 1, 'Portreli', pngBytes(50, 50))

    const preview = await previewCharacterFile(target.deps, exportFile)
    await applyCharacterImport(target.deps, preview.token)

    expect(target.store.getState().app.players[1]).toMatchObject({ portraitId: null, name: 'Portresiz', level: 3, hp: MAX_HP, note: '' })
    expect(target.trashed).toHaveLength(1)
    expect(target.store.getState().app.library).toEqual([])
  })

  it('yalnızca portresi farklı olan kartı değişmiş sayar', async () => {
    const source = makeFixture('kaynak')
    await fillCard(source, 0, 'Aynı İsim', pngBytes(100, 100), { level: 2 })
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    await fillCard(target, 0, 'Aynı İsim', pngBytes(100, 101), { level: 2 })

    const preview = await previewCharacterFile(target.deps, exportFile)
    expect(preview.cards[0].unchanged).toBe(false)
    expect((await applyCharacterImport(target.deps, preview.token)).slots).toEqual([0])
    expect(portraitBytes(target, 0)?.equals(pngBytes(100, 100))).toBe(true)
  })

  it('portresi aynı kalan kartta portreyi yeniden yazmaz, eskisini de çöpe atmaz', async () => {
    const source = makeFixture('kaynak')
    await fillCard(source, 0, 'Yeni İsim', pngBytes(100, 100), { level: 8, hp: 2 })
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    await fillCard(target, 0, 'Eski İsim', pngBytes(100, 100), { level: 2 })
    const files = imageFiles(target)
    const portraitId = target.store.getState().app.players[0].portraitId

    const preview = await previewCharacterFile(target.deps, exportFile)
    expect(preview.cards[0].unchanged).toBe(false)
    expect((await applyCharacterImport(target.deps, preview.token)).slots).toEqual([0])

    expect(target.store.getState().app.players[0]).toMatchObject({ portraitId, name: 'Yeni İsim', level: 8, hp: 2, note: '' })
    expect(imageFiles(target)).toEqual(files)
    expect(target.trashed).toEqual([])
  })

  it('önizlemeden sonra kart elle aynı hale getirildiyse ona dokunmaz', async () => {
    const source = makeFixture('kaynak')
    await fillCard(source, 0, 'Kenji', null, { level: 4 })
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    const preview = await previewCharacterFile(target.deps, exportFile)
    await fillCard(target, 0, 'Kenji', null, { level: 4 })

    expect(await applyCharacterImport(target.deps, preview.token)).toEqual({ ok: true, code: null, slots: [] })
  })

  it('dosya seçme penceresi iptal edilirse canceled döner', async () => {
    const target = makeFixture('hedef')
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    expect(await pickCharacterImport(target.deps, null)).toMatchObject({ ok: false, canceled: true, token: null })
  })

  it('seçilen dosyayı okur', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [exportFile] })

    const preview = await pickCharacterImport(target.deps, null)

    expect(preview).toMatchObject({ ok: true, fileName: 'kartlar.dndkarakter' })
    expect(preview.cards).toHaveLength(3)
    const [options] = dialog.showOpenDialog.mock.calls[0]
    expect(options.properties).toEqual(['openFile'])
  })
})

describe('karakterleri içe aktarma: hatalı durumlar', () => {
  async function filledTarget(): Promise<Fixture> {
    const target = makeFixture('hedef')
    await fillCard(target, 0, 'Yerinde Kalan', pngBytes(64, 64), { level: 7, hp: 4, note: 'not' })
    return target
  }

  it('bozuk ya da yabancı dosya kayda dokunmaz (DND-112)', async () => {
    const target = await filledTarget()
    const before = target.store.getState()
    const files = imageFiles(target)

    for (const [name, content] of [
      ['bos.dndkarakter', Buffer.alloc(0)],
      ['resim.dndkarakter', pngBytes(200, 200)],
      ['metin.dndkarakter', Buffer.from('{"players": []}')]
    ] as const) {
      const preview = await previewCharacterFile(target.deps, sourceFile(name, content))
      expect(preview).toEqual({ ok: false, canceled: false, code: 'DND-112', token: null, fileName: name, exportedAt: null, cards: [] })
    }
    expect(await previewCharacterFile(target.deps, path.join(dir, 'yok.dndkarakter'))).toMatchObject({ ok: false, code: 'DND-112' })
    expect(await previewCharacterFile(target.deps, dir)).toMatchObject({ ok: false, code: 'DND-112' })

    expect(target.store.getState()).toBe(before)
    expect(imageFiles(target)).toEqual(files)
    expect(logText()).toContain('[DND-112]')
  })

  it('kesik dosya kayda dokunmaz', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const whole = fs.readFileSync(exportFile)
    const target = await filledTarget()
    const before = target.store.getState()

    const preview = await previewCharacterFile(target.deps, sourceFile('kesik.dndkarakter', whole.subarray(0, whole.length - 10)))

    expect(preview).toMatchObject({ ok: false, code: 'DND-112', token: null })
    expect(target.store.getState()).toBe(before)
  })

  it('daha yeni biçimdeki dosyayı ayrı kodla reddeder (DND-113)', async () => {
    const target = await filledTarget()
    const file = encodeCharacterFile([], { appVersion: '9.0.0', exportedAt: new Date().toISOString() })
    const text = file.toString('latin1').replace('"version":2', '"version":3')
    const preview = await previewCharacterFile(target.deps, sourceFile('yeni.dndkarakter', Buffer.from(text, 'latin1')))
    expect(preview).toMatchObject({ ok: false, code: 'DND-113', token: null })
  })

  it('sınırdan büyük dosyayı okumadan reddeder', async () => {
    const target = await filledTarget()
    const huge = sourceFile('dev.dndkarakter', Buffer.alloc(0))
    fs.truncateSync(huge, 4 * 50 * 1024 * 1024 + 2 * 1024 * 1024)
    const readFile = vi.spyOn(fs.promises, 'readFile')
    try {
      expect(await previewCharacterFile(target.deps, huge)).toMatchObject({ ok: false, code: 'DND-112' })
      expect(readFile).not.toHaveBeenCalled()
    } finally {
      readFile.mockRestore()
      fs.rmSync(huge)
    }
  })

  it('onay anahtarı tutmuyorsa uygulamaz (DND-306)', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = await filledTarget()
    const before = target.store.getState()

    expect(await applyCharacterImport(target.deps, 'uydurma')).toEqual({ ok: false, code: 'DND-306', slots: [] })
    const preview = await previewCharacterFile(target.deps, exportFile)
    expect(await applyCharacterImport(target.deps, `${preview.token}x`)).toEqual({ ok: false, code: 'DND-306', slots: [] })
    expect(await applyCharacterImport(target.deps, undefined)).toEqual({ ok: false, code: 'DND-306', slots: [] })
    expect(target.store.getState()).toBe(before)
  })

  it('anahtar bir kez kullanılır', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    const preview = await previewCharacterFile(target.deps, exportFile)

    expect((await applyCharacterImport(target.deps, preview.token)).ok).toBe(true)
    expect(await applyCharacterImport(target.deps, preview.token)).toEqual({ ok: false, code: 'DND-306', slots: [] })
  })

  it('vazgeçilen dosya sonradan uygulanamaz', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = await filledTarget()
    const before = target.store.getState()
    const preview = await previewCharacterFile(target.deps, exportFile)

    cancelCharacterImport('baska-anahtar')
    cancelCharacterImport(preview.token)

    expect(await applyCharacterImport(target.deps, preview.token)).toMatchObject({ ok: false, code: 'DND-306' })
    expect(target.store.getState()).toBe(before)
  })

  it('okunamayan ikinci dosya, bekleyen ilk dosyayı da düşürür', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = makeFixture('hedef')
    const first = await previewCharacterFile(target.deps, exportFile)
    await previewCharacterFile(target.deps, sourceFile('bozuk.dndkarakter', Buffer.from('x')))

    expect(await applyCharacterImport(target.deps, first.token)).toMatchObject({ ok: false, code: 'DND-306' })
  })

  it('portre yazılamazsa kartlara hiç dokunmaz ve yarım dosya bırakmaz (DND-202)', async () => {
    const source = await sourceMachine()
    await exportCharactersTo(source.deps, exportFile)
    const target = await filledTarget()
    const before = target.store.getState()
    const files = imageFiles(target)
    const preview = await previewCharacterFile(target.deps, exportFile)

    // İlk portre yazılır, ikincisinde disk hata verir.
    const realWrite = fs.promises.writeFile
    let calls = 0
    const writeFile = vi.spyOn(fs.promises, 'writeFile').mockImplementation((...args: Parameters<typeof realWrite>) => {
      calls += 1
      return calls === 2 ? Promise.reject(new Error('ENOSPC: disk dolu')) : realWrite(...args)
    })
    let result
    try {
      result = await applyCharacterImport(target.deps, preview.token)
    } finally {
      writeFile.mockRestore()
    }

    expect(result).toEqual({ ok: false, code: 'DND-202', slots: [] })
    expect(calls).toBe(2)
    expect(target.store.getState()).toBe(before)
    expect(imageFiles(target)).toEqual(files)
    expect(target.trashed).toEqual([])
    expect(logText()).toContain('[DND-202]')
  })
})
