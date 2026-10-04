import { useId, useLayoutEffect, useRef } from 'react'
import type { JSX, MouseEvent, ReactNode } from 'react'
import { cx } from './cx'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'

export interface ModalProps {
  open: boolean
  /** Escape, kapat düğmesi ya da dışarı tıklama ile istenir. Kapatmak çağıranın işidir (`open`'ı false yapar). */
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** Alt şeritteki düğmeler. */
  footer?: ReactNode
  /** Varsayılan `md`. */
  size?: 'sm' | 'md' | 'lg'
  /** Dışarı tıklayınca kapansın mı. Varsayılan true. */
  closeOnBackdrop?: boolean
  className?: string
}

const FOCUSABLE = ':is(input, textarea, select, button, [tabindex]):not([disabled], [tabindex="-1"])'

function isOutside(event: MouseEvent<HTMLDialogElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
}

function ModalDialog({ onClose, title, children, footer, size = 'md', closeOnBackdrop = true, className }: Omit<ModalProps, 'open'>): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressedOutside = useRef(false)
  const titleId = useId()

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Yerel <dialog>: odak içeride tutulur, arkadaki sayfa etkisizleşir, hep en üstte çizilir.
    if (!dialog.open) dialog.showModal()
    const target =
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog.querySelector<HTMLElement>(`.ui-modal__body ${FOCUSABLE}`) ??
      dialog.querySelector<HTMLElement>(`.ui-modal__footer ${FOCUSABLE}`)
    target?.focus()
    return () => {
      if (dialog.open) dialog.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className={cx('ui-modal', `ui-modal--${size}`, className)}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // React olayı bileşen ağacında yukarı taşır; iç içe kutuda Escape dıştakini de kapatmasın.
        if (event.target !== event.currentTarget) return
        // Escape: kapanışa tarayıcı değil çağıran karar verir.
        event.preventDefault()
        onClose()
      }}
      onClose={(event) => {
        // Tarayıcı kutuyu kendiliğinden kapattıysa (art arda iki Escape) durum da kapansın.
        // Hâlâ açıksa bu, yeniden bağlanmadan kalma eski bir olaydır; yok sayılır.
        if (!event.currentTarget.open) onClose()
      }}
      onMouseDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget && isOutside(event)
      }}
      onClick={(event) => {
        // İçerideki tıklamalar, kutuyu açan öğenin (ör. tıklanabilir bir kart) işleyicisine sızmasın.
        event.stopPropagation()
        // Basış da dışarıda başlamış olmalı; içeride yazı seçerken dışarıda bırakmak kapatmasın.
        const outside = pressedOutside.current && event.target === event.currentTarget && isOutside(event)
        pressedOutside.current = false
        if (outside && closeOnBackdrop) onClose()
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="ui-modal__header">
        <h2 className="ui-modal__title" id={titleId}>
          {title}
        </h2>
        <IconButton label="Kapat" icon={<CloseIcon />} size="sm" onClick={onClose} />
      </header>
      <div className="ui-modal__body">{children}</div>
      {footer !== undefined && <footer className="ui-modal__footer">{footer}</footer>}
    </dialog>
  )
}

/**
 * Kipli iletişim kutusu. İlk odak `data-autofocus` taşıyan öğeye, yoksa gövdedeki ilk kontrole gider.
 * Kapalıyken hiçbir şey çizmez; içeriğin durumu her açılışta sıfırlanır.
 */
export function Modal({ open, ...rest }: ModalProps): JSX.Element | null {
  if (!open) return null
  return <ModalDialog {...rest} />
}
