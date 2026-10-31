import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { UpdateStatus } from '@shared/ipc'
import { reportError } from '@renderer/lib/reportError'
import { useAppInfo } from '@renderer/lib/useAppInfo'
import { Button, Modal } from '@renderer/ui'

function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ phase: 'idle' })

  useEffect(() => {
    let alive = true
    // Denetim pencere hazır olmadan bitmiş olabilir; önce abone olunur, sonra son durum sorulur.
    const unsubscribe = window.dnd.update.onStatus(setStatus)
    window.dnd.update
      .getStatus()
      .then((current) => {
        if (alive) setStatus(current)
      })
      .catch((error: unknown) => reportError('Güncelleme durumu alınamadı', error))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return status
}

/** Yeni sürüm varsa onay ister; onay gelince indirmeyi ve kurulumu gösterir. Yalnızca ana menüde görünür. */
export function UpdatePrompt(): JSX.Element | null {
  const status = useUpdateStatus()
  const info = useAppInfo()
  if (status.phase === 'idle') return null

  const decline = (): void => window.dnd.update.decline()

  switch (status.phase) {
    case 'available':
      return (
        <Modal
          open
          size="sm"
          title="Yeni sürüm var"
          closeOnBackdrop={false}
          onClose={decline}
          footer={
            <>
              <Button onClick={decline}>Şimdi değil</Button>
              <Button variant="primary" data-autofocus onClick={() => window.dnd.update.accept()}>
                Güncelle
              </Button>
            </>
          }
        >
          <p className="menu-update__text">
            DndOynatma <strong>{status.version}</strong> yayımlandı{info !== null && ` (sizdeki sürüm: ${info.version})`}.
          </p>
          <p className="menu-update__text">Kayıtlarınız, görselleriniz ve karakterleriniz etkilenmez. Güncelleme bitince uygulama kendiliğinden yeniden açılır.</p>
        </Modal>
      )
    case 'downloading':
      return (
        <Modal open size="sm" title="Güncelleme indiriliyor" closeOnBackdrop={false} onClose={decline} footer={<Button onClick={decline}>Vazgeç</Button>}>
          <p className="menu-update__text">DndOynatma {status.version} indiriliyor: %{status.percent}</p>
          <div className="menu-update__bar" role="progressbar" aria-label="İndirme" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.percent}>
            <span className="menu-update__fill" style={{ width: `${status.percent}%` }} />
          </div>
        </Modal>
      )
    case 'installing':
      // Kurulum başladı, geri dönüşü yok; kapatmak bir şey değiştirmez.
      return (
        <Modal open size="sm" title="Güncelleme kuruluyor" closeOnBackdrop={false} onClose={() => {}}>
          <p className="menu-update__text">Uygulama birazdan kapanıp yeni sürümle yeniden açılacak.</p>
        </Modal>
      )
    case 'failed':
      return (
        <Modal
          open
          size="sm"
          title="Güncelleme indirilemedi"
          closeOnBackdrop={false}
          onClose={decline}
          footer={
            <>
              <Button onClick={decline}>Kapat</Button>
              <Button variant="primary" data-autofocus onClick={() => window.dnd.update.accept()}>
                Yeniden dene
              </Button>
            </>
          }
        >
          <p className="menu-update__text">İnternet bağlantınızı denetleyip yeniden deneyin. Uygulamanız olduğu gibi duruyor, hiçbir şey değişmedi. (DND-602)</p>
        </Modal>
      )
  }
}
