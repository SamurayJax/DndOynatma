import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { reportError } from '../lib/reportError'
import { Button } from './Button'
import { FolderIcon, WarningIcon } from './icons'

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Loga yazılan bağlam: hatanın hangi bölümde olduğu ("menu", "zar" gibi). */
  scope: string
  /**
   * Hata olunca gösterilecek içerik. Verilmezse tam ekran hata mesajı çizilir.
   * İsteğe bağlı bir parçayı sessizce gizlemek için `null` verilir (ör. zar animasyonu).
   */
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Altındaki bileşenlerde oluşan hatayı yakalar, DND-902 ile loga yazar ve yedek içerik gösterir.
 * React'te hata sınırı yalnızca sınıf bileşeniyle yazılabilir.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const where = info.componentStack
      ?.split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .slice(0, 3)
      .join(' < ')
    reportError(`Bileşen hatası (${this.props.scope}${where ? `; ${where}` : ''})`, error)
  }

  private readonly retry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback

    return (
      <div className="ui-screen ui-error" role="alert">
        <span className="ui-error__icon">
          <WarningIcon size={44} strokeWidth={1.4} />
        </span>
        <h1 className="ui-error__title">Beklenmeyen bir hata oluştu</h1>
        <span className="ui-code">DND-902</span>
        <p className="ui-error__text">Kaydınız korunuyor. Hatanın ayrıntısı log dosyasına yazıldı.</p>
        <p className="ui-error__detail selectable">{error.message}</p>
        <div className="ui-error__actions">
          <Button variant="primary" onClick={this.retry}>
            Yeniden dene
          </Button>
          <Button icon={<FolderIcon size={18} />} onClick={() => window.dnd.app.openLogFolder()}>
            Log klasörünü aç
          </Button>
        </div>
      </div>
    )
  }
}
