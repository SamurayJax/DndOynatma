import { useState } from 'react'
import type { JSX } from 'react'
import { filledPlayers } from '@shared/layout'
import { reportError } from '@renderer/lib/reportError'
import { useAppInfo } from '@renderer/lib/useAppInfo'
import { useApp } from '@renderer/lib/useAppState'
import {
  Button,
  CloseIcon,
  DiceIcon,
  ExitIcon,
  FolderIcon,
  IconButton,
  PlayIcon,
  SlidersIcon,
  WarningIcon,
  toast
} from '@renderer/ui'

export interface MainMenuProps {
  onOpenSettings: () => void
  crashNoticeHidden: boolean
  onHideCrashNotice: () => void
}

export function MainMenu({ onOpenSettings, crashNoticeHidden, onHideCrashNotice }: MainMenuProps): JSX.Element {
  const app = useApp()
  const info = useAppInfo()
  const [starting, setStarting] = useState(false)
  const hasPlayers = filledPlayers(app).length > 0

  const startGame = async (): Promise<void> => {
    // Pencereler açılırken ikinci tıklama ikinci bir başlatma isteği göndermesin.
    if (starting) return
    setStarting(true)
    try {
      await window.dnd.game.start()
    } catch (error) {
      reportError('Oyun başlatılamadı', error)
      toast('Oyun başlatılamadı. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="menu-main">
      {/* Çerçeve ve zemin dış kapta sabit durur; pencere küçükse yalnızca içerik kayar. */}
      <div className="menu-main__scroll">
        {info?.crashedLastTime === true && !crashNoticeHidden && (
          <div className="menu-crash" role="alert">
            <span className="menu-crash__icon">
              <WarningIcon size={22} />
            </span>
            <div className="menu-crash__text">
              <p>Uygulama geçen sefer beklenmedik şekilde kapandı. Kaydınız korunuyor.</p>
              <span className="ui-code">DND-903</span>
            </div>
            <Button size="sm" icon={<FolderIcon size={16} />} onClick={() => window.dnd.app.openLogFolder()}>
              Log klasörünü aç
            </Button>
            <IconButton label="Uyarıyı kapat" icon={<CloseIcon size={18} />} size="sm" onClick={onHideCrashNotice} />
          </div>
        )}

        <main className="menu-main__center">
          <span className="menu-emblem" aria-hidden="true">
            <DiceIcon size={80} strokeWidth={0.9} />
          </span>
          <h1 className="menu-title">DndOynatma</h1>
          <p className="menu-tagline">DnD oturumları için sahne yönetimi</p>
          <div className="menu-divider" aria-hidden="true">
            <span />
          </div>

          <nav className="menu-actions" aria-label="Ana menü">
            <Button
              className="menu-action menu-action--play"
              variant="primary"
              size="lg"
              icon={<PlayIcon size={22} />}
              disabled={starting}
              onClick={() => void startGame()}
            >
              Oyna
            </Button>
            {!hasPlayers && (
              <p className="menu-hint">
                Henüz oyuncu profili yok. Portre ve isimleri Ayarlar › Oyuncular bölümünden ekleyebilirsiniz.
              </p>
            )}
            <Button className="menu-action" size="lg" icon={<SlidersIcon size={22} />} onClick={onOpenSettings}>
              Ayarlar
            </Button>
            <Button
              className="menu-action"
              variant="ghost"
              size="lg"
              icon={<ExitIcon size={22} />}
              onClick={() => window.dnd.app.quit()}
            >
              Çıkış
            </Button>
          </nav>
        </main>
      </div>

      {info !== null && <footer className="menu-version">Sürüm {info.version}</footer>}
    </div>
  )
}
