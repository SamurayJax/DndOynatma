import type { JSX } from 'react'
import { activeScene } from '@shared/layout'
import { reportError } from '@renderer/lib/reportError'
import { useApp } from '@renderer/lib/useAppState'
import { Button, DiceIcon, ExitIcon, FullscreenIcon, confirmDialog, toast } from '@renderer/ui'
import { HotkeyBadge } from './HotkeyBadge'

async function endGame(): Promise<void> {
  const confirmed = await confirmDialog({
    title: 'Oyun bitirilsin mi?',
    message: 'Oyun ekranı ve kontrol paneli kapanır, ana menüye dönülür. Zar geçmişi silinir; oyuncular, pencereler ve notlar kayıtlı kalır.',
    confirmLabel: 'Oyunu bitir',
    danger: true
  })
  if (!confirmed) return
  try {
    await window.dnd.game.end()
  } catch (error) {
    reportError('Oyun bitirilemedi', error)
    toast('Oyun bitirilemedi. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
  }
}

/** Üst şerit: başlık, ekrandaki pencerenin adı, tam ekran ve oyunu bitirme. */
export function TopBar(): JSX.Element {
  const app = useApp()
  const scene = activeScene(app)
  const fullscreen = app.settings.gameFullscreen

  return (
    <header className="ctl-topbar">
      <div className="ctl-topbar__brand">
        <span className="ctl-topbar__emblem">
          <DiceIcon size={26} strokeWidth={1.5} />
        </span>
        <h1 className="ctl-topbar__title">Kontrol Paneli</h1>
      </div>

      <div className="ctl-topbar__scene">
        <span className="ctl-topbar__scene-label">Pencere</span>
        {scene === undefined ? (
          <span className="ctl-topbar__scene-none">Pencere yok</span>
        ) : (
          <>
            <HotkeyBadge hotkey={scene.hotkey} />
            <span className="ctl-topbar__scene-name" title={scene.name}>
              {scene.name}
            </span>
          </>
        )}
      </div>

      <div className="ctl-topbar__actions">
        <Button
          icon={<FullscreenIcon size={18} />}
          active={fullscreen}
          aria-label="Tam ekran"
          title={fullscreen ? 'Oyun ekranı tam ekranda. Çıkmak için tıkla (oyun ekranında F11).' : 'Oyun ekranını tam ekran yap (oyun ekranında F11).'}
          onClick={() => window.dnd.app.toggleGameFullscreen()}
        >
          Tam ekran
        </Button>
        <Button icon={<ExitIcon size={18} />} aria-label="Oyunu bitir" title="Oyunu bitir ve ana menüye dön" onClick={() => void endGame()}>
          Oyunu bitir
        </Button>
      </div>
    </header>
  )
}
