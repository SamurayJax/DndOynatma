import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { ERROR_CODES } from '@shared/errors'
import type { ErrorCode } from '@shared/errors'
import type { CharacterImportPreview, IncomingCard } from '@shared/ipc'
import { isPlayerPristine } from '@shared/layout'
import { MAX_HP } from '@shared/types'
import type { PlayerProfile } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { Button, ExportIcon, ImportIcon, Modal, cx, toast } from '@renderer/ui'

export interface CharacterTransferProps {
  /** Dört oyuncu kartı, yuva sırasıyla. */
  players: readonly PlayerProfile[]
}

function toastCode(code: ErrorCode, extra = ''): void {
  const info = ERROR_CODES[code]
  toast(extra === '' ? info.title : `${info.title}: ${extra}`, info.level, code)
}

/** "Kenji · seviye 4" gibi kısa gösterim; adı olmayan kart için "İsimsiz". */
function cardTitle(name: string, level: number): string {
  return `${name.trim() === '' ? 'İsimsiz' : name} · seviye ${level}`
}

function formatDate(iso: string | null): string {
  if (iso === null) return ''
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })
}

interface ImportRowProps {
  slot: number
  player: PlayerProfile
  incoming: IncomingCard | undefined
}

function ImportRow({ slot, player, incoming }: ImportRowProps): JSX.Element {
  const pristine = isPlayerPristine(player)
  const current = pristine ? 'Boş kart' : cardTitle(player.name, player.level)
  const changes = incoming !== undefined && !incoming.unchanged
  const status = incoming === undefined ? 'Dosyada yok' : incoming.unchanged ? 'Zaten aynı' : 'Değişecek'

  return (
    <li className={cx('set-import__row', changes && 'is-changing')} data-slot={slot}>
      <span className="set-import__slot">Oyuncu {slot + 1}</span>
      <div className="set-import__detail">
        {changes ? (
          <>
            <span className="set-import__change">
              <span className={cx('set-import__old', !pristine && 'is-replaced')}>{current}</span>
              <span className="set-import__arrow" aria-hidden="true">
                →
              </span>
              <span className="ui-sr-only">yerine</span>
              <span className="set-import__new">{cardTitle(incoming.name, incoming.level)}</span>
            </span>
            <span className="set-import__meta">
              Can {incoming.hp}/{MAX_HP} · {incoming.hasPortrait ? 'portre var' : 'portre yok'} · {incoming.hasNote ? 'not var' : 'not yok'}
            </span>
          </>
        ) : (
          <span className="set-import__same">{current}</span>
        )}
      </div>
      <span className={cx('set-chip', changes && 'set-chip--on')}>{status}</span>
    </li>
  )
}

/**
 * Ayarlar › Oyuncular'daki "İçe aktar" / "Dışa aktar". Yalnızca dört kart taşınır
 * (isim, seviye, can, not, portre); kütüphane ve pencereler taşınmaz.
 */
export function CharacterTransfer({ players }: CharacterTransferProps): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<CharacterImportPreview | null>(null)
  // Durum yeniden çizilene kadar gelen ikinci tıklama ikinci bir dosya penceresi açmasın.
  const running = useRef(false)

  const run = async (what: string, job: () => Promise<void>): Promise<void> => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await job()
    } catch (error) {
      reportError(what, error)
      toast(`${what}. Ayrıntı log dosyasında.`, 'HATA', 'DND-902')
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const exportCards = (): Promise<void> =>
    run('Karakterler dışa aktarılamadı', async () => {
      const result = await window.dnd.characters.export()
      if (result.canceled) return
      if (!result.ok) {
        if (result.code !== null) toastCode(result.code)
        else toast('Dışa aktarılacak dolu kart yok.')
        return
      }
      toast(`${result.count} kart dışa aktarıldı: ${result.fileName ?? ''}`)
      for (const slot of result.missingPortraits) {
        toastCode('DND-203', `Oyuncu ${slot + 1} portresiz yazıldı`)
      }
    })

  const pickFile = (): Promise<void> =>
    run('Karakter dosyası açılamadı', async () => {
      const picked = await window.dnd.characters.pickImport()
      if (picked.canceled) return
      if (!picked.ok) {
        if (picked.code !== null) toastCode(picked.code, picked.fileName)
        return
      }
      setPreview(picked)
    })

  const cancelImport = (): void => {
    if (running.current) return
    if (preview?.token != null) window.dnd.characters.cancelImport(preview.token)
    setPreview(null)
  }

  const applyImport = (): Promise<void> =>
    run('Karakterler içe aktarılamadı', async () => {
      const token = preview?.token
      if (token == null) return
      try {
        const result = await window.dnd.characters.applyImport(token)
        if (result.ok) toast(`${result.slots.length} kart içe aktarıldı.`)
        else if (result.code !== null) toastCode(result.code)
      } finally {
        setPreview(null)
      }
    })

  const nothingToExport = players.every(isPlayerPristine)
  const incoming = preview?.cards ?? []
  const changing = incoming.filter((card) => !card.unchanged)
  // Yerine geçilen kartta bilgi varsa, onun silineceği açıkça söylenir.
  const overwrites = changing.some((card) => !isPlayerPristine(players[card.slot]))

  return (
    <div className="set-transfer">
      <Button size="sm" icon={<ImportIcon size={16} />} disabled={busy} onClick={() => void pickFile()}>
        İçe aktar
      </Button>
      <Button
        size="sm"
        icon={<ExportIcon size={16} />}
        disabled={busy || nothingToExport}
        title={nothingToExport ? 'Dışa aktarılacak dolu kart yok' : undefined}
        onClick={() => void exportCards()}
      >
        Dışa aktar
      </Button>

      <Modal
        open={preview !== null}
        onClose={cancelImport}
        title="Karakterleri içe aktar"
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={cancelImport} data-autofocus="">
              Vazgeç
            </Button>
            <Button variant="primary" disabled={busy || changing.length === 0} onClick={() => void applyImport()}>
              {changing.length > 0 ? `${changing.length} kartı içe aktar` : 'İçe aktar'}
            </Button>
          </>
        }
      >
        {preview !== null && (
          <div className="set-import">
            <p className="set-import__file">
              <span className="set-import__file-name">{preview.fileName}</span>
              {preview.exportedAt !== null && <span className="set-import__file-date">{formatDate(preview.exportedAt)}</span>}
            </p>
            <ul className="set-import__list">
              {players.map((player, slot) => (
                <ImportRow key={slot} slot={slot} player={player} incoming={incoming.find((card) => card.slot === slot)} />
              ))}
            </ul>
            <p className="set-import__note">
              {incoming.length === 0
                ? 'Bu dosyada kart yok.'
                : changing.length === 0
                  ? 'Dosyadaki kartlar şu ankilerle aynı; değişecek bir şey yok.'
                  : overwrites
                    ? 'Değişecek kartların şimdiki bilgileri silinir, eski portreleri Geri Dönüşüm Kutusu’na gider. Dosyada olmayan kartlara dokunulmaz.'
                    : 'Dosyada olmayan kartlara dokunulmaz. Kütüphane ve pencereler bu dosyayla taşınmaz.'}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
