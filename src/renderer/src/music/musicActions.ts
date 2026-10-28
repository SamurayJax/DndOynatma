/**
 * Müzik sekmesinin yükleme işleri: sonucu bildirme ve silme onayları.
 */
import { ERROR_CODES } from '@shared/errors'
import type { AmbientImportResult, MusicImportResult } from '@shared/ipc'
import type { AmbientSound, MusicTrack } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { dispatch, getFullState } from '@renderer/lib/useAppState'
import { confirmDialog, toast } from '@renderer/ui'

/** Aynı anda en çok 5 bildirim görünür; başarı mesajı ve özet satırına yer kalsın. */
const MAX_SKIP_TOASTS = 4

function reportSkipped(skipped: MusicImportResult['skipped']): void {
  const shown = skipped.length <= MAX_SKIP_TOASTS ? skipped : skipped.slice(0, MAX_SKIP_TOASTS - 1)
  for (const file of shown) {
    const info = ERROR_CODES[file.code]
    toast(`${file.name} atlandı: ${info.title}`, info.level === 'HATA' ? 'HATA' : 'UYARI', file.code)
  }
  const rest = skipped.length - shown.length
  if (rest > 0) toast(`${rest} dosya daha atlandı. Ayrıntı log dosyasında.`, 'UYARI')
}

/** Parça yüklemeyi çalıştırır ve sonucunu bildirir. Eklenen parçaları döndürür; hiçbir durumda reddedilmez. */
export async function importTracks(start: () => Promise<MusicImportResult>): Promise<MusicTrack[]> {
  try {
    const result = await start()
    if (result.canceled) return []
    if (result.added.length > 0) toast(result.added.length === 1 ? `“${result.added[0].originalName}” eklendi` : `${result.added.length} parça eklendi`)
    reportSkipped(result.skipped)
    return result.added
  } catch (error) {
    reportError('Müzik yüklenemedi', error)
    toast('Müzik yüklenemedi. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
    return []
  }
}

export async function addAmbient(start: () => Promise<AmbientImportResult>): Promise<AmbientSound | null> {
  try {
    const result = await start()
    if (result.canceled) return null
    if (result.ambient !== null) toast(`“${result.ambient.name}” ortam seslerine eklendi`)
    reportSkipped(result.skipped)
    return result.ambient
  } catch (error) {
    reportError('Ortam sesi eklenemedi', error)
    toast('Ortam sesi eklenemedi. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
    return null
  }
}

export async function confirmRemoveTrack(track: MusicTrack): Promise<void> {
  const scenes = getFullState()?.app.scenes.filter((scene) => scene.videoTrackId === track.id) ?? []
  const usage = scenes.length > 0 ? ` Hareketli arka plan olduğu ${scenes.length} pencereden de kalkar.` : ''
  const confirmed = await confirmDialog({
    title: 'Parça silinsin mi?',
    message: `“${track.originalName}” listeden kaldırılır, dosyası Geri Dönüşüm Kutusu'na gider.${usage}`,
    confirmLabel: 'Sil',
    danger: true
  })
  if (confirmed) dispatch({ type: 'music/removeTrack', trackId: track.id })
}

export async function confirmRemoveAmbient(ambient: AmbientSound): Promise<void> {
  const confirmed = await confirmDialog({
    title: 'Ortam sesi silinsin mi?',
    message: `“${ambient.name}” düğmesi kaldırılır, dosyası Geri Dönüşüm Kutusu'na gider.`,
    confirmLabel: 'Sil',
    danger: true
  })
  if (confirmed) dispatch({ type: 'ambient/remove', ambientId: ambient.id })
}

/** Bırakılan dosyaların diskteki yolları. Yolu olmayanlar atlanır. */
export function droppedPaths(files: FileList): string[] {
  const paths: string[] = []
  for (const file of Array.from(files)) {
    try {
      const path = window.dnd.library.pathForFile(file)
      if (path !== '') paths.push(path)
    } catch {
      // Yolu okunamayan öğe dosya değildir; diğerleri yine yüklenir.
    }
  }
  return paths
}
