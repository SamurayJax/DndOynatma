import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { DragEvent, JSX } from 'react'
import type { ImportResult } from '@shared/ipc'
import { CATEGORIES, activeScene, categoryInfo, findImage, isCardable, scenesUsingImage } from '@shared/layout'
import type { ID, LibraryCategory, LibraryImage } from '@shared/types'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import {
  Button,
  CheckIcon,
  CursorIcon,
  EmptyState,
  EyeOffIcon,
  ImageIcon,
  MonitorIcon,
  Tabs,
  TextInput,
  UploadIcon,
  cx,
  toast
} from '@renderer/ui'
import type { TabItem } from '@renderer/ui'
import { ImagePreview } from './ImagePreview'
import type { CardClick, SwapKind } from './LibraryCard'
import { LibraryGrid } from './LibraryGrid'
import { confirmAndRemove, currentImage, droppedPaths, importAndReport, placeOnStage } from './libraryActions'
import { filterByName, groupByCategory, parseStageSignature, stageSignature } from './libraryModel'
import './library.css'

type PanelMode = 'manage' | 'play'

const NO_IMAGES: readonly LibraryImage[] = []
/** Gönderilen bölme değişikliğinin yayınla dönmesi için tanınan süre. */
const SWAP_GUARD_MS = 2000

// Ayarlar'da sekme değiştirince panel sökülüp yeniden kurulur; dönüldüğünde son bölme açık gelsin.
const lastTab: Record<PanelMode, LibraryCategory> = { manage: CATEGORIES[0].id, play: CATEGORIES[0].id }

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

/**
 * Kütüphane paneli: 8 bölme, yükleme (düğme ya da sürükle-bırak), arama, silme, İtem ↔ Takım Eşyası.
 * `manage`: Ayarlar'da düzenleme; karta tıklamak önizleme açar.
 * `play`: kontrol panelinde; karta tıklamak görseli oyun ekranına koyar.
 */
export function LibraryPanel(props: { mode: 'manage' | 'play' }): JSX.Element {
  const { mode } = props
  const app = useApp()
  const idBase = useId()
  const [tab, setTab] = useState<LibraryCategory>(() => lastTab[mode])
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(0)
  const [previewId, setPreviewId] = useState<ID | null>(null)
  const pendingSwaps = useRef(new Map<ID, { kind: SwapKind; at: number }>())

  const groups = useMemo(() => groupByCategory(app.library), [app.library])
  const images = groups.get(tab) ?? NO_IMAGES
  const visible = useMemo(() => filterByName(images, query), [images, query])

  const scene = activeScene(app)
  // Ayarlar'da rozet gösterilmez; özet boş kalınca pencereler değişse de kartlar yeniden çizilmez.
  const signature = mode === 'play' ? stageSignature(scene) : ''
  const stage = useMemo(() => parseStageSignature(signature), [signature])

  const category = categoryInfo(tab)
  const label = category?.label ?? tab
  // Mekan ve sahne görselleri genelde yataydır; kartları da yatay çizilir.
  const isBackgroundTab = category?.role === 'background'
  const click: CardClick = mode === 'manage' ? 'preview' : 'place'
  const searching = visible !== images

  const tabs: TabItem<LibraryCategory>[] = CATEGORIES.map((item) => {
    const count = groups.get(item.id)?.length ?? 0
    // Ayarlar sekmeleriyle aynı kural: boş bölmede rozet çizilmez.
    return { id: item.id, label: item.label, badge: count > 0 ? count : undefined }
  })

  const selectTab = (next: LibraryCategory): void => {
    lastTab[mode] = next
    setTab(next)
    // Başka bölmede eski arama yüzünden "görsel yok" görünmesin.
    setQuery('')
  }

  const runImport = (kind: LibraryCategory, start: () => Promise<ImportResult>): void => {
    setImporting((count) => count + 1)
    void importAndReport(kind, start).finally(() => setImporting((count) => count - 1))
  }

  const openFileDialog = (): void => runImport(tab, () => window.dnd.library.import(tab))

  const onDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    // Açık bir iletişim kutusu varken arkadaki panele bırakmak kafa karıştırır.
    if (!hasFiles(event) || document.querySelector('dialog[open]') !== null) return
    event.preventDefault()
    setDragging(true)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!dragging || !hasFiles(event)) return
    // preventDefault olmadan tarayıcı bırakmaya izin vermez.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!dragging) return
    event.preventDefault()
    setDragging(false)
    const paths = droppedPaths(event.dataTransfer.files)
    if (paths.length === 0) {
      toast('Bırakılan öğe diskteki bir dosya değil. Görseli önce bilgisayara kaydedin.', 'UYARI')
      return
    }
    runImport(tab, () => window.dnd.library.importFiles(tab, paths))
  }

  const handleActivate = useCallback(
    (imageId: ID): void => {
      if (mode === 'manage') setPreviewId(imageId)
      else placeOnStage(imageId)
    },
    [mode]
  )

  const handlePlaceCard = useCallback((imageId: ID): void => placeOnStage(imageId, true), [])

  const handleDelete = useCallback((imageId: ID): void => {
    void confirmAndRemove(imageId)
  }, [])

  const handleSetKind = useCallback((imageId: ID, kind: SwapKind): void => {
    const image = currentImage(imageId)
    if (image === undefined || image.kind === kind) return
    // Çift tıklamada ikinci istek "zaten o bölmede" uyarısı (DND-306) üretir; yayın dönene kadar yutulur.
    const pending = pendingSwaps.current.get(imageId)
    const now = Date.now()
    if (pending !== undefined && pending.kind === kind && now - pending.at < SWAP_GUARD_MS) return
    pendingSwaps.current.set(imageId, { kind, at: now })
    dispatch({ type: 'library/setKind', imageId, kind })
    // Kart bu bölmeden kaybolur; nereye gittiği söylenmezse silinmiş gibi görünür.
    toast(
      kind === 'teamItem'
        ? `“${image.originalName}” takıma verildi (Takım Eşyaları)`
        : `“${image.originalName}” geri alındı (İtemler)`
    )
  }, [])

  const targetScene = scene ?? app.scenes[0]
  const previewImage = previewId === null ? undefined : findImage(app, previewId)

  let content: JSX.Element
  if (images.length === 0) {
    content = (
      <EmptyState
        className="lib-empty"
        icon={<ImageIcon size={28} />}
        title="Bu bölmede görsel yok"
        hint={
          tab === 'teamItem'
            ? 'İtemler bölmesindeki bir eşyada “Takıma ver”e basın ya da buraya görsel yükleyin: “Görsel yükle” düğmesi veya dosyaları sürükleyip bırakma (PNG, JPG, WEBP).'
            : '“Görsel yükle” düğmesine basın ya da dosyaları buraya sürükleyip bırakın (PNG, JPG, WEBP).'
        }
        action={
          <Button icon={<UploadIcon size={18} />} disabled={importing > 0} onClick={openFileDialog}>
            Görsel yükle
          </Button>
        }
      />
    )
  } else if (visible.length === 0) {
    content = (
      <EmptyState
        className="lib-empty"
        icon={<ImageIcon size={28} />}
        title="Aramayla eşleşen görsel yok"
        hint={`“${query.trim()}” bu bölmedeki ${images.length} görselin adında geçmiyor.`}
        action={<Button onClick={() => setQuery('')}>Aramayı temizle</Button>}
      />
    )
  } else {
    content = (
      <LibraryGrid
        images={visible}
        click={click}
        landscape={isBackgroundTab}
        stage={stage}
        onActivate={handleActivate}
        onPlaceCard={handlePlaceCard}
        onDelete={handleDelete}
        onSetKind={handleSetKind}
      />
    )
  }

  return (
    <div className={cx('lib-panel', `lib-panel--${mode}`)} onDragEnter={onDragEnter} onDragOver={onDragOver} onDrop={onDrop}>
      <Tabs
        className="lib-tabs"
        tabs={tabs}
        value={tab}
        onChange={selectTab}
        label="Kütüphane bölmeleri"
        size="sm"
        idBase={idBase}
      />

      <div className="lib-toolbar">
        <Button variant="primary" icon={<UploadIcon size={18} />} disabled={importing > 0} onClick={openFileDialog}>
          Görsel yükle
        </Button>
        <TextInput
          key={tab}
          type="search"
          className="lib-search"
          value={query}
          onChange={setQuery}
          placeholder="Bu bölmede ara…"
          aria-label={`${label} bölmesinde ara`}
        />
        <span className="lib-count">
          {searching ? `${visible.length} / ${images.length} görsel` : `${images.length} görsel`}
        </span>
        {mode === 'play' && (
          <span className="lib-target" title="Tıklanan görsel bu pencereye konur">
            <span className="lib-target__icon">
              <MonitorIcon size={16} />
            </span>
            <span>Pencere:</span>
            <span className="lib-target__name">
              {targetScene === undefined ? 'yok (ilk görselle “Pencere 1” açılır)' : targetScene.name}
            </span>
          </span>
        )}
      </div>

      {(mode === 'play' || tab === 'item' || tab === 'teamItem') && (
        <div className="lib-info">
          {mode === 'play' && (
            <p className="lib-hint">
              <span className="lib-hint__icon">
                <CursorIcon size={16} />
              </span>
              <span>
                <strong>Tıkla: oyun ekranına koy</strong>
                {' — her tıklama bir kopya daha ekler'}
                {category !== undefined && isCardable(category.id) && '. “Kart olarak koy”: ad, seviye ve canla çerçeveli kart'}
              </span>
            </p>
          )}
          {tab === 'item' && (
            <p className="lib-owner lib-owner--unfound">
              <span className="lib-owner__icon">
                <EyeOffIcon size={16} />
              </span>
              <span>
                <strong>Henüz bulunmadı</strong> — bu eşyalar oyuncularda değil. Biri alınca “Takıma ver” ile Takım
                Eşyaları'na geçer.
              </span>
            </p>
          )}
          {tab === 'teamItem' && (
            <p className="lib-owner lib-owner--team">
              <span className="lib-owner__icon">
                <CheckIcon size={16} />
              </span>
              <span>
                <strong>Takımda</strong> — bu eşyalar oyuncularda. “Geri al” eşyayı İtemler'e döndürür.
              </span>
            </p>
          )}
        </div>
      )}

      {/* `key`: bölme değişince kaydırma başa döner. */}
      <div key={tab} className="lib-scroll" role="tabpanel" aria-labelledby={`${idBase}-${tab}`}>
        {content}
      </div>

      {dragging && (
        // Örtü paneli tümüyle kaplar; sürükleme çocuk öğeler arasında gezerken vurgu titremez.
        <div className="lib-drop" onDragLeave={() => setDragging(false)}>
          <span className="lib-drop__icon">
            <UploadIcon size={32} />
          </span>
          <p className="lib-drop__title">Görselleri buraya bırakın</p>
          <p className="lib-drop__hint">“{label}” bölmesine yüklenir · PNG, JPG, WEBP</p>
        </div>
      )}

      {mode === 'manage' && (
        <ImagePreview
          image={previewImage}
          scenes={previewImage === undefined ? [] : scenesUsingImage(app, previewImage.id)}
          onClose={() => setPreviewId(null)}
          onDelete={() => {
            if (previewImage !== undefined) handleDelete(previewImage.id)
          }}
        />
      )}
    </div>
  )
}
