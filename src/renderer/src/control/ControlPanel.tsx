import { useState } from 'react'
import type { JSX } from 'react'
import { LibraryPanel } from '@renderer/library/LibraryPanel'
import { useFullState } from '@renderer/lib/useAppState'
import { useSceneHotkeys } from '@renderer/lib/useSceneHotkeys'
import { EmptyState, ErrorBoundary, LoadingScreen, Tabs, ToastHost, WarningIcon } from '@renderer/ui'
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

const VIEWS: readonly TabItem<ColumnView>[] = [
  { id: 'players', label: 'Oyuncular' },
  { id: 'library', label: 'Kütüphane' },
  { id: 'tools', label: 'Araçlar' }
]

function ControlLayout(): JSX.Element {
  // Yalnızca dar pencerede (tek monitörde oyun ekranının yanında) kullanılır: üç sütun yan yana
  // sığmayınca sekme şeridi görünür ve seçili sütun tek başına gösterilir. Geniş pencerede CSS yok sayar.
  const [view, setView] = useState<ColumnView>('players')
  const [editingScenes, setEditingScenes] = useState(false)

  return (
    <div className="ctl-root" data-view={view}>
      <TopBar />
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
      {state === null ? <LoadingScreen /> : <ControlLayout />}
      <ToastHost />
    </>
  )
}
