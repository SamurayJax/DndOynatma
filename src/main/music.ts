/**
 * Müzik listesine parça ve ortam sesi yükleme: dosya seçtirme, kopyalama ve listeye ekleme.
 */
import { randomUUID } from 'node:crypto'
import { BrowserWindow, OpenDialogOptions, dialog } from 'electron'
import { AmbientImportResult, MusicImportResult } from '@shared/ipc'
import { AmbientSound, DEFAULT_AMBIENT_VOLUME, MusicTrack } from '@shared/types'
import { SOUND_EXTENSIONS } from './fileNames'
import { log } from './logger'
import { SkippedSound, copySoundsIntoFolder, discardCopiedSound } from './soundImporter'
import { Store } from './store'

export interface MusicDeps {
  store: Store
  soundsDir: string
}

async function pickFiles(parent: BrowserWindow | null, title: string, multiple: boolean): Promise<string[]> {
  const options: OpenDialogOptions = {
    title,
    buttonLabel: 'Yükle',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: 'Ses ve video (MP3, OGG, WAV, M4A, MP4)', extensions: [...SOUND_EXTENSIONS] }]
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

function logSkipped(skipped: readonly SkippedSound[]): { name: string; code: SkippedSound['code'] }[] {
  // Atlanan dosyalar arayüze döner; burada yalnızca loga yazılır.
  for (const entry of skipped) log.code(entry.code, `${entry.name}: ${entry.detail}`)
  return skipped.map(({ name, code }) => ({ name, code }))
}

/** Verilen yollardaki dosyaları kopyalar ve tek bir `music/addTracks` ile listenin sonuna ekler. */
export async function importTracks(deps: MusicDeps, filePaths: readonly string[]): Promise<MusicImportResult> {
  const { store, soundsDir } = deps
  const outcome = await copySoundsIntoFolder(soundsDir, filePaths)
  const skipped = [...outcome.skipped]
  const now = new Date().toISOString()
  // MP4'ün döngü aralığı yüklemeden sonra sorulur; o zamana kadar yalnızca ses olarak durur.
  const tracks: MusicTrack[] = outcome.copied.map((copy) => ({ id: randomUUID(), ...copy, loop: null, addedAt: now }))

  let added: MusicTrack[] = []
  if (tracks.length > 0) {
    store.dispatch({ type: 'music/addTracks', tracks }, { trusted: true })
    const listed = new Set(store.getState().app.music.tracks.map((track) => track.id))
    for (const track of tracks) {
      if (listed.has(track.id)) continue
      // Listeye girmeyen kopya klasörde sahipsiz kalmasın.
      discardCopiedSound(soundsDir, track.fileName)
      skipped.push({ name: track.originalName, code: 'DND-502', detail: 'listeye eklenemedi' })
    }
    added = tracks.filter((track) => listed.has(track.id))
  }

  for (const track of added) log.info(`Parça eklendi: ${track.fileName}${track.hasVideo ? ' (video)' : ''}`)
  return { added, skipped: logSkipped(skipped), canceled: false }
}

export async function importTracksWithDialog(deps: MusicDeps, parent: BrowserWindow | null): Promise<MusicImportResult> {
  const files = await pickFiles(parent, 'Müzik yükle', true)
  if (files.length === 0) return { added: [], skipped: [], canceled: true }
  return importTracks(deps, files)
}

/** Tek dosya seçtirir ve dosyanın adıyla yeni bir ortam sesi düğmesi ekler. */
export async function addAmbientWithDialog(deps: MusicDeps, parent: BrowserWindow | null): Promise<AmbientImportResult> {
  const files = await pickFiles(parent, 'Ortam sesi seç', false)
  if (files.length === 0) return { ambient: null, skipped: [], canceled: true }
  return addAmbientFile(deps, files[0])
}

export async function addAmbientFile(deps: MusicDeps, filePath: string): Promise<AmbientImportResult> {
  const { store, soundsDir } = deps
  const outcome = await copySoundsIntoFolder(soundsDir, [filePath])
  const skipped = [...outcome.skipped]
  const copy = outcome.copied[0]
  let ambient: AmbientSound | null = null

  if (copy) {
    const candidate: AmbientSound = {
      id: randomUUID(),
      name: copy.originalName,
      fileName: copy.fileName,
      volume: DEFAULT_AMBIENT_VOLUME,
      addedAt: new Date().toISOString()
    }
    store.dispatch({ type: 'ambient/add', ambient: candidate }, { trusted: true })
    ambient = store.getState().app.music.ambients.find((entry) => entry.id === candidate.id) ?? null
    if (ambient === null) {
      discardCopiedSound(soundsDir, copy.fileName)
      skipped.push({ name: copy.originalName, code: 'DND-502', detail: 'ortam seslerine eklenemedi (en fazla sayıya ulaşılmış olabilir)' })
    } else {
      log.info(`Ortam sesi eklendi: ${ambient.fileName}`)
    }
  }

  return { ambient, skipped: logSkipped(skipped), canceled: false }
}
