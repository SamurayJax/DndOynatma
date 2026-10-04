import { useState } from 'react'
import type { JSX } from 'react'
import { useFullState } from '@renderer/lib/useAppState'
import { LoadingScreen, ToastHost } from '@renderer/ui'
import { MainMenu } from './MainMenu'
import { SettingsView } from './SettingsView'
import './menu.css'

type MenuView = 'menu' | 'settings'

/** Menü penceresinin kökü: ana menü ile ayarlar arasında geçiş yapar. */
export function MenuRoot(): JSX.Element {
  const state = useFullState()
  const [view, setView] = useState<MenuView>('menu')
  // Uyarı bir kez kapatıldıysa ayarlara girip çıkınca yeniden belirmesin diye burada tutulur.
  const [crashNoticeHidden, setCrashNoticeHidden] = useState(false)

  let content: JSX.Element
  if (state === null) {
    content = <LoadingScreen />
  } else if (view === 'settings') {
    content = <SettingsView onBack={() => setView('menu')} />
  } else {
    content = (
      <MainMenu
        onOpenSettings={() => setView('settings')}
        crashNoticeHidden={crashNoticeHidden}
        onHideCrashNotice={() => setCrashNoticeHidden(true)}
      />
    )
  }

  return (
    <div className="menu-root">
      {content}
      <ToastHost />
    </div>
  )
}
