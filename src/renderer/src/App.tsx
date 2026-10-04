import type { JSX } from 'react'
import type { WindowRole } from '@shared/ipc'
import { ControlPanel } from './control/ControlPanel'
import { GameScreen } from './game/GameScreen'
import { MenuRoot } from './menu/MenuRoot'
import { ConfirmHost, ErrorBoundary } from './ui'

function RoleRoot({ role }: { role: WindowRole }): JSX.Element {
  switch (role) {
    case 'menu':
      return <MenuRoot />
    case 'game':
      return <GameScreen />
    case 'control':
      return <ControlPanel />
  }
}

/** Üç pencere aynı uygulamayı yükler; hangisinin çizileceğini pencerenin rolü belirler. */
export function App(): JSX.Element {
  const role = window.dnd.role
  return (
    <ErrorBoundary scope={role}>
      <RoleRoot role={role} />
      <ConfirmHost />
    </ErrorBoundary>
  )
}
