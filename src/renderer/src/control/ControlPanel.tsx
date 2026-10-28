import { useState } from 'react'
import type { JSX } from 'react'
import { LibraryPanel } from '@renderer/library/LibraryPanel'
import { useFullState, useSession } from '@renderer/lib/useAppState'
import { MusicPage } from '@renderer/music/MusicPage'
import { CharactersPage } from '@renderer/characters/CharactersPage'
import { useSceneHotkeys } from '@renderer/lib/useSceneHotkeys'
import { DiceIcon, EmptyState, ErrorBoundary, LoadingScreen, MusicIcon, ShieldIcon, Tabs, ToastHost, WarningIcon } from '@renderer/ui'
import type { TabItem } from '@renderer/ui'
import { DicePanel } from './DicePanel'
import { NotePanel } from './NotePanel'
import { PlayersColumn } from './PlayersColumn'
import { SceneEditor, ScenesPanel } from './ScenesPanel'
import { StagePanel } from './StagePanel'
import { ToolsPanel } from './ToolsPanel'
import { TopBar } from './TopBar'
import './control.css'

type ColumnView = 'players' | 'library' | 'tools'
type Page = 'control' | 'characters' | 'music'

const VIEWS: readonly TabItem<ColumnView>[] = [
  { id: 'players', label: 'Oyuncular' },
  { id: 'library', label: 'Kütüphane' },
  { id: 'tools', label: 'Araçlar' }
]

/**
 * Üst sekmeler: her bölüm kendi sayfasında. Sayfalar gizlenir ama kapanmaz; sekme değişince kütüphanenin
 * seçili bölmesi ya da yarım kalan bir yazı kaybolmaz. Müzik oyun ekranında çaldığı için sekmeden etkilenmez.
 */
function ControlPages(): JSX.Element {
  const [page, setPage] = useState<Page>('control')
  const { playback } = useSession()
  const musicPlaying = playback.playing || playback.ambientIds.length > 0

  const pages: readonly TabItem<Page>[] = [
    { id: 'control', label: 'Kontrol Paneli', icon: <DiceIcon size={18} /> },
    { id: 'characters', label: 'Karakterler', icon: <ShieldIcon size={18} /> },
    {
      id: 'music',
      label: 'Müzik',
      // Başka sekmedeyken de bir şeyin çaldığı görünsün.
      icon: <MusicIcon size={18} className={musicPlaying ? 'ctl-pages__playing' : undefined} />
    }
  ]

  return (
    <div className="ctl-root">
      <TopBar pages={<Tabs className="ctl-pages" tabs={pages} value={page} onChange={setPage} label="Kontrol paneli sayfaları" idBase="ctl-page" />} />
      <div className="ctl-page" role="tabpanel" aria-labelledby="ctl-page-control" hidden={page !== 'control'}>
        <ControlLayout />
      </div>
      <div className="ctl-page" role="tabpanel" aria-labelledby="ctl-page-characters" hidden={page !== 'characters'}>
        <ErrorBoundary
          scope="kontrol paneli karakterleri"
          fallback={
            <EmptyState
              icon={<WarningIcon size={24} />}
              title="Karakterler gösterilemiyor"
              hint="Beklenmeyen bir hata oluştu (DND-902). Ayrıntı log dosyasında; diğer kontroller çalışmaya devam eder."
            />
          }
        >
          <CharactersPage />
        </ErrorBoundary>
      </div>
      <div className="ctl-page" role="tabpanel" aria-labelledby="ctl-page-music" hidden={page !== 'music'}>
        <ErrorBoundary
          scope="kontrol paneli müziği"
          fallback={
            <EmptyState
              icon={<WarningIcon size={24} />}
              title="Müzik gösterilemiyor"
              hint="Beklenmeyen bir hata oluştu (DND-902). Ayrıntı log dosyasında; diğer kontroller çalışmaya devam eder."
            />
          }
        >
          <MusicPage />
        </ErrorBoundary>
      </div>
    </div>
  )
}

function ControlLayout(): JSX.Element {
  // Yalnızca dar pencerede (tek monitörde oyun ekranının yanında) kullanılır: üç sütun yan yana
  // sığmayınca sekme şeridi görünür ve seçili sütun tek başına gösterilir. Geniş pencerede CSS yok sayar.
  const [view, setView] = useState<ColumnView>('players')
  const [editingScenes, setEditingScenes] = useState(false)

  return (
    <div className="ctl-control" data-view={view}>
      <Tabs className="ctl-views" tabs={VIEWS} value={view} onChange={setView} label="Kontrol paneli bölümleri" />
      <main className="ctl-columns">
        <PlayersColumn />

        <section className="ctl-col ctl-col--library" aria-label="Kütüphane">
          {/* Kütüphanedeki bir hata can ve zar kontrollerini de götürmesin. */}
          <ErrorBoundary
            scope="kontrol paneli kütüphanesi"
            fallback={
              <EmptyState
                icon={<WarningIcon size={24} />}
                title="Kütüphane gösterilemiyor"
                hint="Beklenmeyen bir hata oluştu (DND-902). Ayrıntı log dosyasında; diğer kontroller çalışmaya devam eder."
              />
            }
          >
            <LibraryPanel mode="play" />
          </ErrorBoundary>
        </section>

        <aside className="ctl-col ctl-col--side" aria-label="Araçlar, zar, pencereler ve notlar">
          <ToolsPanel />
          <DicePanel />
          <ScenesPanel onEdit={() => setEditingScenes(true)} />
          <StagePanel />
          <NotePanel />
        </aside>
      </main>
      <SceneEditor open={editingScenes} onClose={() => setEditingScenes(false)} />
    </div>
  )
}

/**
 * DM'in kontrol paneli: solda oyuncu kartları, ortada kütüphane, sağda araçlar, zar, pencereler,
 * ekrandakiler ve genel not. Durum yüklenene kadar bekler, bildirimleri gösterir ve 1–9 atama
 * tuşlarını dinler.
 */
export function ControlPanel(): JSX.Element {
  const state = useFullState()
  useSceneHotkeys()

  return (
    <>
      {state === null ? <LoadingScreen /> : <ControlPages />}
      <ToastHost />
    </>
  )
}
