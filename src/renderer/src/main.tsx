import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Sıra önemli: önce belirteçler, sonra ortak parçalar; özellik stilleri App ile birlikte en son yüklenir.
import './ui/theme.css'
import './ui/ui.css'
import type { WindowRole } from '@shared/ipc'
import { App } from './App'
import { reportError } from './lib/reportError'

const WINDOW_TITLES: Record<WindowRole, string> = {
  menu: 'DndOynatma',
  game: 'DndOynatma — Oyun Ekranı',
  control: 'DndOynatma — Kontrol Paneli',
  setup: 'DndOynatma — Kayıt Klasörü'
}

function start(): void {
  const container = document.getElementById('root')
  if (container === null) return

  if (!('dnd' in window)) {
    // Sayfa Electron dışında (düz tarayıcıda) açılmış: köprü yok, hiçbir şey çalışmaz.
    container.textContent = 'Bu sayfa yalnızca DndOynatma uygulamasının içinde çalışır.'
    return
  }

  window.addEventListener('error', (event) => {
    // Zararsız tarayıcı uyarısı; hata gibi loglanırsa gerçek hataları gölgeler.
    if (event.message.startsWith('ResizeObserver loop')) return
    const error: unknown = event.error
    reportError('Yakalanmamış hata', error ?? `${event.message} (${event.filename}:${event.lineno})`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    reportError('Yakalanmamış promise reddi', reason)
  })

  const role = window.dnd.role
  // Stil (ör. oyun ekranının siyah zemini) ve ekran paylaşımındaki pencere adı role göre değişir.
  document.documentElement.dataset.role = role
  document.title = WINDOW_TITLES[role]

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

start()
