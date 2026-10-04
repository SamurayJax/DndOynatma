/**
 * Kütüphaneye görsel yükleme: dosya seçtirme, kopyalama ve `library/add`.
 */
import { BrowserWindow, OpenDialogOptions, dialog } from 'electron'
import { ImportResult } from '@shared/ipc'
import { categoryInfo } from '@shared/layout'
import { ImageKind, LibraryCategory } from '@shared/types'
import { IMAGE_EXTENSIONS } from './fileNames'
import { copyImagesIntoLibrary, discardCopiedImage } from './importer'
import { log } from './logger'
import { Store } from './store'

export interface LibraryDeps {
  store: Store
  imagesDir: string
}

const CANCELED: ImportResult = { added: [], skipped: [], canceled: true }

async function pickFiles(parent: BrowserWindow | null, title: string, multiple: boolean): Promise<string[]> {
  const options: OpenDialogOptions = {
    title,
    buttonLabel: 'Yükle',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: 'Görseller (PNG, JPG, WEBP)', extensions: [...IMAGE_EXTENSIONS] }]
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

/** Verilen yollardaki dosyaları kopyalar ve tek bir `library/add` ile kütüphaneye ekler. */
export async function importFiles(deps: LibraryDeps, kind: ImageKind, filePaths: readonly string[]): Promise<ImportResult> {
  const { store, imagesDir } = deps
  const outcome = await copyImagesIntoLibrary(imagesDir, kind, filePaths)
  const skipped = [...outcome.skipped]
  let added = outcome.added

  if (added.length > 0) {
    store.dispatch({ type: 'library/add', images: added }, { trusted: true })
    // Kütüphaneye girmeyen kopya klasörde sahipsiz kalmasın.
    const libraryIds = new Set(store.getState().app.library.map((image) => image.id))
    for (const image of added) {
      if (libraryIds.has(image.id)) continue
      discardCopiedImage(imagesDir, image.fileName)
      skipped.push({ name: image.originalName, code: 'DND-202', detail: 'kütüphaneye eklenemedi' })
    }
    added = added.filter((image) => libraryIds.has(image.id))
  }

  // Atlanan dosyalar ImportResult ile arayüze döner; burada yalnızca loga yazılır.
  for (const entry of skipped) log.code(entry.code, `${entry.name}: ${entry.detail}`)
  for (const image of added) log.info(`Görsel eklendi: ${image.fileName} (${kind}, ${image.width}x${image.height})`)

  return { added, skipped: skipped.map(({ name, code }) => ({ name, code })), canceled: false }
}

export async function importWithDialog(deps: LibraryDeps, parent: BrowserWindow | null, kind: LibraryCategory): Promise<ImportResult> {
  const label = categoryInfo(kind)?.label ?? kind
  const files = await pickFiles(parent, `Görsel yükle — ${label}`, true)
  if (files.length === 0) return CANCELED
  return importFiles(deps, kind, files)
}

/** Tek dosya seçtirir, portre olarak ekler ve oyuncu yuvasına bağlar. */
export async function importPortrait(deps: LibraryDeps, parent: BrowserWindow | null, slot: number): Promise<ImportResult> {
  const files = await pickFiles(parent, `Portre seç — Oyuncu ${slot + 1}`, false)
  if (files.length === 0) return CANCELED
  return importPortraitFile(deps, slot, files[0])
}

/** Verilen yoldaki dosyayı portre olarak ekler ve oyuncu yuvasına bağlar. */
export async function importPortraitFile(deps: LibraryDeps, slot: number, filePath: string): Promise<ImportResult> {
  const result = await importFiles(deps, 'portrait', [filePath])
  const portrait = result.added[0]
  if (portrait) {
    // Eski portre artık kullanılmadığı için reducer onu kütüphaneden çıkarır; dosyasını store taşır.
    deps.store.dispatch({ type: 'player/update', slot, patch: { portraitId: portrait.id } }, { trusted: true })
  }
  return result
}
