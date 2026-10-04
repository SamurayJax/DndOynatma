import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { LogLevel } from '@shared/errors'
import type { Notice } from '@shared/ipc'
import { dismissNotice, useNotices } from '../lib/useNotices'
import { cx } from './cx'
import { IconButton } from './IconButton'
import { CloseIcon, InfoIcon, WarningIcon } from './icons'

const AUTO_DISMISS_MS = 6000

const LEVEL_CLASS: Record<LogLevel, string> = {
  BILGI: 'ui-toast--info',
  UYARI: 'ui-toast--warning',
  HATA: 'ui-toast--error'
}

const LEVEL_NAME: Record<LogLevel, string> = {
  BILGI: 'Bilgi',
  UYARI: 'Uyarı',
  HATA: 'Hata'
}

function Toast({ notice }: { notice: Notice }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  // Hatalar kendiliğinden kapanmaz: DM oyunun ortasında gözden kaçırmış olabilir.
  const sticky = notice.level === 'HATA'

  useEffect(() => {
    if (sticky || hovered) return
    const timer = window.setTimeout(() => dismissNotice(notice.id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [sticky, hovered, notice.id])

  return (
    <div
      className={cx('ui-toast', LEVEL_CLASS[notice.level])}
      role={sticky ? 'alert' : 'status'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="ui-toast__icon">{notice.level === 'BILGI' ? <InfoIcon /> : <WarningIcon />}</span>
      <div className="ui-toast__content">
        <span className="ui-sr-only">{LEVEL_NAME[notice.level]}: </span>
        <p className="ui-toast__message">{notice.message}</p>
        {notice.code !== null && <span className="ui-code">{notice.code}</span>}
      </div>
      <IconButton label="Bildirimi kapat" icon={<CloseIcon size={16} />} size="sm" onClick={() => dismissNotice(notice.id)} />
    </div>
  )
}

/**
 * Bildirimleri pencerenin sağ altında gösterir: ana süreçten gelenler ve `toast()` ile verilenler.
 * Menüde ve kontrol panelinde bağlanır; oyun ekranında bağlanmaz (oyuncular DM bildirimlerini görmemeli).
 */
export function ToastHost(): JSX.Element {
  const notices = useNotices()
  return (
    <div className="ui-toasts" role="region" aria-label="Bildirimler">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} />
      ))}
    </div>
  )
}
