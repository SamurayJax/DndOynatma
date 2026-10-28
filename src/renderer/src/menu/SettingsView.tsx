import { useId, useState } from 'react'
import type { JSX } from 'react'
import { categoryInfo, filledPlayers } from '@shared/layout'
import { LibraryPanel } from '@renderer/library/LibraryPanel'
import { useApp } from '@renderer/lib/useAppState'
import { ClassesTab } from '@renderer/settings/ClassesTab'
import { ProfilesTab } from '@renderer/settings/ProfilesTab'
import { ScenesTab } from '@renderer/settings/ScenesTab'
import { Button, ChevronLeftIcon, Tabs } from '@renderer/ui'
import type { TabItem } from '@renderer/ui'
import { GeneralTab } from './GeneralTab'

type SettingsTab = 'players' | 'classes' | 'library' | 'scenes' | 'general'

/** Sıfır rozet göstermek kalabalık yapar; boşsa rozet hiç çizilmez. */
function countBadge(count: number): number | undefined {
  return count > 0 ? count : undefined
}

function TabContent({ tab }: { tab: SettingsTab }): JSX.Element {
  switch (tab) {
    case 'players':
      return <ProfilesTab />
    case 'classes':
      return <ClassesTab />
    case 'library':
      return <LibraryPanel mode="manage" />
    case 'scenes':
      return <ScenesTab />
    case 'general':
      return <GeneralTab />
  }
}

export interface SettingsViewProps {
  onBack: () => void
}

export function SettingsView({ onBack }: SettingsViewProps): JSX.Element {
  const app = useApp()
  const [tab, setTab] = useState<SettingsTab>('players')
  const idBase = useId()

  // Portreler aynı depoda durur ama kütüphane bölmelerinde görünmez; sayıya katılmaz.
  const libraryCount = app.library.filter((image) => categoryInfo(image.kind) !== undefined).length

  const tabs: TabItem<SettingsTab>[] = [
    { id: 'players', label: 'Oyuncular', badge: countBadge(filledPlayers(app).length) },
    { id: 'classes', label: 'Sınıflar', badge: countBadge(app.classes.length) },
    { id: 'library', label: 'Kütüphane', badge: countBadge(libraryCount) },
    { id: 'scenes', label: 'Pencereler', badge: countBadge(app.scenes.length) },
    { id: 'general', label: 'Genel' }
  ]

  return (
    <div className="menu-settings">
      <header className="menu-settings__header">
        <Button variant="ghost" icon={<ChevronLeftIcon size={18} />} onClick={onBack}>
          Ana menü
        </Button>
        <h1 className="menu-settings__title">Ayarlar</h1>
      </header>
      <Tabs
        className="menu-settings__tabs"
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label="Ayarlar bölümleri"
        idBase={idBase}
      />
      <div className="menu-settings__content" role="tabpanel" aria-labelledby={`${idBase}-${tab}`}>
        <TabContent tab={tab} />
      </div>
    </div>
  )
}
