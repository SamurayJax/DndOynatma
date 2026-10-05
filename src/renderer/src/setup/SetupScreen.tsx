import { useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { SetupInfo, StorageCheck } from '@shared/ipc'
import { reportError } from '@renderer/lib/reportError'
import { Button, FolderIcon, InfoIcon, LoadingScreen, Toggle, WarningIcon, cx } from '@renderer/ui'
import './setup.css'

type NoteTone = 'info' | 'warning' | 'error'

function Note({ tone, children }: { tone: NoteTone; children: ReactNode }): JSX.Element {
  return (
    <p className={cx('setup-note', `setup-note--${tone}`)}>
      {tone === 'info' ? <InfoIcon size={18} /> : <WarningIcon size={18} />}
      <span>{children}</span>
    </p>
  )
}

/**
 * Açılışta kayıt klasörünün sorulduğu ekran. Kayıt henüz yüklenmediği için uygulama durumunu
 * kullanmaz; yalnızca `window.dnd.storage` ile konuşur. Klasör belli olunca pencere kapanır.
 */
export function SetupScreen(): JSX.Element {
  const [info, setInfo] = useState<SetupInfo | null>(null)
  const [check, setCheck] = useState<StorageCheck | null>(null)
  const [migrate, setMigrate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryFailed, setRetryFailed] = useState(false)

  useEffect(() => {
    let alive = true
    window.dnd.storage
      .getSetup()
      .then(async (setup) => {
        if (!alive || setup === null) return
        setInfo(setup)
        // İlk açılışta önerilen yer hazır gelir; bulunamayan klasörde kullanıcı önce yeniden denemeyi seçebilir.
        if (setup.reason === 'first-run') {
          const suggested = await window.dnd.storage.check(setup.suggestedParent)
          if (alive) setCheck(suggested)
        }
      })
      .catch((cause: unknown) => reportError('Kayıt klasörü bilgisi alınamadı', cause))
    return () => {
      alive = false
    }
  }, [])

  if (info === null) return <LoadingScreen />

  const missing = info.reason === 'missing'
  const legacy = info.legacy
  // Hedefte kayıt varsa o kullanılır; eski kayıt onun üstüne taşınmaz.
  const canMigrate = !missing && legacy !== null && check !== null && !check.hasSave
  const usable = check !== null && check.writable

  const choose = async (): Promise<void> => {
    try {
      const parent = await window.dnd.storage.pickParent()
      if (parent === null) return
      setError(null)
      setCheck(await window.dnd.storage.check(parent))
    } catch (cause) {
      reportError('Klasör seçilemedi', cause)
    }
  }

  const confirm = async (): Promise<void> => {
    if (check === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.dnd.storage.confirmSetup(check.parent, canMigrate && migrate)
      // Başarılıysa pencere kapanır ve uygulama açılır; burada yapılacak bir şey kalmaz.
      if (!result.ok) {
        setError(result.code === null ? result.message : `${result.message} (${result.code})`)
        setBusy(false)
      }
    } catch (cause) {
      reportError('Kayıt klasörü ayarlanamadı', cause)
      setError('Kayıt klasörü ayarlanamadı.')
      setBusy(false)
    }
  }

  const retry = async (): Promise<void> => {
    setRetryFailed(false)
    try {
      const found = await window.dnd.storage.retry()
      if (!found) setRetryFailed(true)
    } catch (cause) {
      reportError('Kayıt klasörü yeniden denenemedi', cause)
    }
  }

  return (
    <main className="setup-root">
      <section className="setup-card">
        <h1 className="setup-title">Kayıt klasörü</h1>

        {missing ? (
          <>
            <Note tone="warning">
              Kayıt klasörü bulunamadı. Klasör taşınmış, silinmiş ya da bulunduğu disk takılı olmayabilir.
            </Note>
            <code className="setup-path selectable">{info.missingDir}</code>
            <p className="setup-text">
              Diski takıp yeniden deneyebilir ya da kaydın tutulacağı başka bir yer seçebilirsin. Bulunamayan
              klasördeki kaydına dokunulmaz.
            </p>
            {retryFailed && <Note tone="error">Klasör hâlâ bulunamıyor.</Note>}
          </>
        ) : (
          <p className="setup-text">
            DndOynatma; oyuncuları, pencereleri, görselleri ve logları bilgisayarındaki bir klasörde tutar. Bu
            klasörün nerede açılacağını seç; uygulama seçtiğin yerin içine <strong>{info.folderName}</strong> adlı
            klasörü kendisi açar.
          </p>
        )}

        {check !== null && (
          <div className="setup-target">
            <span className="setup-label">Kayıt şuraya yapılacak</span>
            <code className="setup-path selectable">{check.target}</code>
          </div>
        )}

        <div className="setup-notes">
          {check !== null && !check.writable && <Note tone="error">Bu yere yazılamıyor; başka bir yer seç.</Note>}
          {check !== null && check.cloud !== null && (
            <Note tone="warning">
              Bu klasör {check.cloud} içinde: kayıtların buluta eşitlenir. Yerelde kalması için başka bir yer seç.
            </Note>
          )}
          {check !== null && check.hasSave && (
            <Note tone="info">Bu klasörde zaten bir DndOynatma kaydı var; o kayıt kullanılacak.</Note>
          )}
          {missing && check !== null && !check.hasSave && check.writable && (
            <Note tone="info">Bu klasörde kayıt yok; boş bir kayıtla başlanacak.</Note>
          )}
        </div>

        {canMigrate && legacy !== null && (
          <div className="setup-legacy">
            <Toggle label="Eski kaydımı buraya taşı" checked={migrate} onChange={setMigrate} disabled={busy} />
            <p className="setup-hint">
              Eski kaydın bulundu ({legacy.images} görsel): <code className="selectable">{legacy.dir}</code>. Taşınırsa
              önce kopyalanır, kopya doğrulanınca eski klasör Geri Dönüşüm Kutusu'na gönderilir. Taşımazsan eski
              kayıt yerinde kalır ve boş bir kayıtla başlanır.
            </p>
          </div>
        )}

        {error !== null && <Note tone="error">{error}</Note>}

        <div className="setup-actions">
          <Button variant="ghost" disabled={busy} onClick={() => window.dnd.app.quit()}>
            Çıkış
          </Button>
          <span className="setup-actions__spacer" />
          {missing && (
            <Button disabled={busy} onClick={() => void retry()}>
              Yeniden dene
            </Button>
          )}
          <Button icon={<FolderIcon size={18} />} disabled={busy} onClick={() => void choose()}>
            {check === null ? 'Klasör seç…' : 'Başka yer seç…'}
          </Button>
          {check !== null && (
            <Button variant="primary" disabled={!usable || busy} onClick={() => void confirm()}>
              {busy ? 'Hazırlanıyor…' : 'Bu klasörü kullan'}
            </Button>
          )}
        </div>
      </section>
    </main>
  )
}
