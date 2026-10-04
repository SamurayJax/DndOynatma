import { useSyncExternalStore } from 'react'
import type { JSX, ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

export interface ConfirmOptions {
  title: string
  /** Sorunun ayrıntısı (ör. görselin hangi pencerelerde kullanıldığı). */
  message?: ReactNode
  /** Varsayılan "Onayla". */
  confirmLabel?: string
  /** Varsayılan "Vazgeç". */
  cancelLabel?: string
  /** Silme gibi geri alınamayan işlemler: onay düğmesi kırmızı olur, ilk odak "Vazgeç"e gider. */
  danger?: boolean
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  /** "Vazgeç", Escape ya da dışarı tıklama. */
  onCancel: () => void
}

/** Denetimli onay kutusu. Çoğu durumda `confirmDialog()` daha kısadır. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  // Yanlışlıkla Enter'a basmak yıkıcı işlemi onaylamasın diye odak güvenli düğmede başlar.
  const focusCancel = danger
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} data-autofocus={focusCancel ? '' : undefined}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={focusCancel ? undefined : ''}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message !== undefined && <div className="ui-confirm__message">{message}</div>}
    </Modal>
  )
}

interface PendingConfirm {
  id: number
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

let queue: readonly PendingConfirm[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function settle(id: number, confirmed: boolean): void {
  const pending = queue.find((item) => item.id === id)
  if (pending === undefined) return
  queue = queue.filter((item) => item.id !== id)
  pending.resolve(confirmed)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    // Kutu ekrandan kalktıysa (ör. hata ekranına düşüldü) bekleyen sorular yanıtsız kalmasın.
    if (listeners.size === 0) {
      for (const item of queue) settle(item.id, false)
    }
  }
}

function getQueue(): readonly PendingConfirm[] {
  return queue
}

/**
 * Onay kutusu açar; "Onayla" için true, "Vazgeç"/Escape için false döner.
 * `ConfirmHost` App içinde bağlıdır; ayrıca bir şey yerleştirmek gerekmez.
 *
 *   if (await confirmDialog({ title: 'Görsel silinsin mi?', danger: true, confirmLabel: 'Sil' })) { ... }
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (listeners.size === 0) {
      console.warn('confirmDialog: ConfirmHost bağlı değil; soru "Vazgeç" sayıldı.')
      resolve(false)
      return
    }
    queue = [...queue, { id: nextId++, options, resolve }]
    emit()
  })
}

/** `confirmDialog()` çağrılarını ekrana getirir. App içinde bir kez bağlanır. */
export function ConfirmHost(): JSX.Element | null {
  const pending = useSyncExternalStore(subscribe, getQueue)
  const current = pending[0]
  if (current === undefined) return null
  return (
    <ConfirmDialog
      key={current.id}
      open
      {...current.options}
      onConfirm={() => settle(current.id, true)}
      onCancel={() => settle(current.id, false)}
    />
  )
}
