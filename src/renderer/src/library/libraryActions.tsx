/**
 * Kütüphane panelinin yaptığı işlemler: yükleme sonucunu bildirme, silme onayı, oyun ekranına koyma.
 * Hepsi durumu çağrıldığı anda okur; böylece karta verilen işleyiciler hiç değişmez.
 */
import type { JSX } from 'react'
import { ERROR_CODES } from '@shared/errors'
import { newId } from '@shared/id'
import type { ImportResult } from '@shared/ipc'
import { categoryInfo, findImage, scenesUsingImage } from '@shared/layout'
import type { ID, LibraryCategory, LibraryImage, SceneWindow } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { dispatch, getFullState } from '@renderer/lib/useAppState'
import { confirmDialog, toast } from '@renderer/ui'

/** Aynı anda en çok 5 bildirim görünür; başarı mesajı ve özet satırına yer kalsın. */
const MAX_SKIP_TOASTS = 4

export function currentImage(imageId: ID): LibraryImage | undefined {
  const app = getFullState()?.app
  return app === undefined ? undefined : findImage(app, imageId)
}

function reportImport(result: ImportResult, kind: LibraryCategory): void {
  if (result.canceled) return
  const label = categoryInfo(kind)?.label ?? kind
  const { added, skipped } = result

  if (added.length > 0) toast(`${added.length} görsel “${label}” bölmesine eklendi`)

  const shown = skipped.length <= MAX_SKIP_TOASTS ? skipped : skipped.slice(0, MAX_SKIP_TOASTS - 1)
  for (const file of shown) {
    const info = ERROR_CODES[file.code]
    toast(`${file.name} atlandı: ${info.title}`, info.level === 'HATA' ? 'HATA' : 'UYARI', file.code)
  }
  const rest = skipped.length - shown.length
  if (rest > 0) toast(`${rest} dosya daha atlandı. Ayrıntı log dosyasında.`, 'UYARI')
}

/** Yüklemeyi çalıştırır ve sonucunu bildirir. Hiçbir durumda reddedilmez. */
export async function importAndReport(kind: LibraryCategory, start: () => Promise<ImportResult>): Promise<void> {
  try {
    reportImport(await start(), kind)
  } catch (error) {
    reportError('Görsel yüklenemedi', error)
    toast('Görsel yüklenemedi. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
  }
}

/** Bırakılan dosyaların diskteki yolları. Yolu olmayanlar (ör. tarayıcıdan sürüklenen resim) atlanır. */
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

/**
 * Görseli etkin pencerenin üstüne ekler. Mekan ve sahne görselleri de arka plan yapılmaz; DM onları
 * oyun ekranında kendisi yerleştirir. Arka plan yalnızca Ayarlar'daki seçiciden konur.
 */
export function placeOnStage(imageId: ID, asCard = false): void {
  const app = getFullState()?.app
  if (app === undefined || findImage(app, imageId) === undefined) return
  dispatch({
    type: 'stage/addItem',
    itemId: newId(),
    fallbackSceneId: newId(),
    imageId,
    ...(asCard ? { asCard: true } : {})
  })
}

function DeleteMessage({ name, scenes }: { name: string; scenes: readonly SceneWindow[] }): JSX.Element {
  return (
    <div className="lib-confirm">
      <p>“{name}” kütüphaneden kaldırılır; dosyası Geri Dönüşüm Kutusu'na taşınır.</p>
      {scenes.length > 0 && (
        <>
          <p>
            Bu görsel şu {scenes.length === 1 ? 'pencerede' : 'pencerelerde'} kullanılıyor; silinirse{' '}
            {scenes.length === 1 ? 'o pencereden' : 'o pencerelerden'} de kalkar:
          </p>
          <ul className="lib-confirm__scenes">
            {scenes.map((scene) => (
              <li key={scene.id}>{scene.name}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Onay ister; kullanıldığı pencereleri sayar. Onaylanırsa görseli kütüphaneden kaldırır. */
export async function confirmAndRemove(imageId: ID): Promise<void> {
  const app = getFullState()?.app
  const image = app === undefined ? undefined : findImage(app, imageId)
  if (app === undefined || image === undefined) return

  const confirmed = await confirmDialog({
    title: 'Görsel silinsin mi?',
    message: <DeleteMessage name={image.originalName} scenes={scenesUsingImage(app, imageId)} />,
    danger: true,
    confirmLabel: 'Sil'
  })
  if (!confirmed) return
  // Onay beklenirken başka pencereden silinmiş olabilir; olmayan görseli silmek loga boş kayıt düşer.
  if (currentImage(imageId) === undefined) return
  dispatch({ type: 'library/remove', imageId })
}
