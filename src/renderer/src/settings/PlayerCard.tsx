import { memo, useId, useRef, useState } from 'react'
import type { DragEvent, JSX } from 'react'
import { ERROR_CODES } from '@shared/errors'
import type { ImportResult } from '@shared/ipc'
import { isPlayerFilled } from '@shared/layout'
import { TEXT_LIMITS } from '@shared/reducer'
import { createEmptyPlayer, MAX_LEVEL, MIN_LEVEL } from '@shared/types'
import type { LibraryImage, PlayerProfile } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { dispatch } from '@renderer/lib/useAppState'
import {
  Button,
  CheckIcon,
  CloseIcon,
  EyeOffIcon,
  Field,
  IconButton,
  ImageThumb,
  NumberStepper,
  TextInput,
  UploadIcon,
  confirmDialog,
  cx,
  toast
} from '@renderer/ui'

export interface PlayerCardProps {
  /** 0..3 */
  slot: number
  player: PlayerProfile
  /** Portre görseli; yoksa ya da kütüphanede bulunamadıysa `undefined`. */
  portrait: LibraryImage | undefined
}

const EMPTY_PLAYER = createEmptyPlayer()
const PLAYER_KEYS = Object.keys(EMPTY_PLAYER) as (keyof PlayerProfile)[]

/**
 * "Kartı boşalt" bir şey değiştirir mi? Yalnızca görünen alanlara bakılmaz: oyunda alınmış not
 * ve can da kartta durur, isim silinmiş olsa bile boşaltılabilmelidir.
 */
function isPristine(player: PlayerProfile): boolean {
  return PLAYER_KEYS.every((key) => player[key] === EMPTY_PLAYER[key])
}

function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes('Files')
}

function reportSkipped(result: ImportResult): void {
  for (const { name, code } of result.skipped) {
    toast(`“${name}” portre yapılamadı: ${ERROR_CODES[code].title}`, 'UYARI', code)
  }
}

/** Tek oyuncu kartı: portre (tıkla ya da bırak), isim, seviye, oyunda görünürlük durumu. */
export const PlayerCard = memo(function PlayerCard({ slot, player, portrait }: PlayerCardProps): JSX.Element {
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  // Durum yeniden çizilene kadar gelen ikinci tıklama ikinci bir dosya penceresi açmasın.
  const importing = useRef(false)

  const title = `Oyuncu ${slot + 1}`
  const filled = isPlayerFilled(player)
  const hasPortrait = portrait !== undefined
  // Bırakma vurgusu ya da yükleme: portre alanının üstüne kısa bir mesaj gelir.
  const covered = busy || dropActive

  const runImport = async (job: () => Promise<ImportResult>): Promise<void> => {
    if (importing.current) return
    importing.current = true
    setBusy(true)
    try {
      reportSkipped(await job())
    } catch (error) {
      reportError(`${title} portresi yüklenemedi`, error)
      toast('Portre yüklenemedi. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
    } finally {
      importing.current = false
      setBusy(false)
    }
  }

  const pickPortrait = (): void => {
    void runImport(() => window.dnd.library.importPortrait(slot))
  }

  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event)) return
    // preventDefault olmadan tarayıcı bırakmayı kabul etmez.
    event.preventDefault()
    event.dataTransfer.dropEffect = importing.current ? 'none' : 'copy'
    if (!importing.current) setDropActive(true)
  }

  const onDragLeave = (event: DragEvent<HTMLElement>): void => {
    // Kartın içindeki bir öğeden diğerine geçerken de tetiklenir; yalnızca karttan çıkış sayılır.
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDropActive(false)
  }

  const onDrop = (event: DragEvent<HTMLElement>): void => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    setDropActive(false)
    const files = event.dataTransfer.files
    const file = files.item(0)
    if (file === null || importing.current) return

    let path = ''
    try {
      path = window.dnd.library.pathForFile(file)
    } catch (error) {
      reportError('Bırakılan dosyanın yolu okunamadı', error)
    }
    if (path === '') {
      // Tarayıcıdan ya da başka bir uygulamadan sürüklenen görselin diskte yolu olmaz.
      toast(`“${file.name}” diskteki bir dosya değil. Görseli önce bilgisayara kaydedin.`, 'UYARI')
      return
    }
    if (files.length > 1) toast(`Birden fazla dosya bırakıldı; yalnızca “${file.name}” kullanıldı.`)
    void runImport(() => window.dnd.library.importPortraitFile(slot, path))
  }

  const clearCard = async (): Promise<void> => {
    const confirmed = await confirmDialog({
      title: `${title} kartı boşaltılsın mı?`,
      message:
        'İsim, portre ve oyun sırasında alınan not silinir; seviye 1’e döner, can dolar. Boş kart oyunda görünmez.',
      danger: true,
      confirmLabel: 'Boşalt'
    })
    if (confirmed) dispatch({ type: 'player/clear', slot })
  }

  return (
    <section
      className={cx('set-player', filled && 'is-filled', dropActive && 'is-drop')}
      aria-labelledby={titleId}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="set-player__head">
        <div className="set-player__title-row">
          <h2 className="set-player__title" id={titleId}>
            {title}
          </h2>
          <Button
            className="set-player__clear set-quiet-danger"
            variant="ghost"
            size="sm"
            disabled={isPristine(player)}
            onClick={() => void clearCard()}
          >
            Kartı boşalt
          </Button>
        </div>
        <span className={cx('set-chip', filled && 'set-chip--on')}>
          {filled ? <CheckIcon size={14} /> : <EyeOffIcon size={14} />}
          {filled ? 'Oyunda görünür' : 'Boş — oyunda görünmez'}
        </span>
      </header>

      <div className={cx('set-portrait', hasPortrait && 'has-image')}>
        <button
          type="button"
          className="set-portrait__button"
          aria-label={hasPortrait ? `${title} portresini değiştir` : `${title} için portre seç`}
          aria-busy={busy || undefined}
          onClick={pickPortrait}
        >
          {hasPortrait ? (
            <>
              <ImageThumb image={portrait} fit="cover" alt="" className="set-portrait__img" />
              <span className="set-portrait__hint">
                <UploadIcon size={16} />
                Portreyi değiştir
              </span>
            </>
          ) : (
            // Örtü saydamdır; altında boş durum yazısı kalırsa iki yazı üst üste biner.
            !covered && (
              <span className="set-portrait__empty">
                <span className="set-portrait__empty-icon">
                  <UploadIcon size={22} />
                </span>
                <span className="set-portrait__empty-title">Portre ekle</span>
                <span className="set-portrait__empty-hint">Tıklayın ya da görseli buraya bırakın</span>
              </span>
            )
          )}
          {covered && (
            <span className="set-portrait__cover">
              {!busy && <UploadIcon size={22} />}
              {busy ? 'Yükleniyor…' : 'Portre yapmak için bırakın'}
            </span>
          )}
        </button>
        {hasPortrait && (
          <IconButton
            className="set-portrait__remove"
            label="Portreyi kaldır"
            icon={<CloseIcon size={16} />}
            size="sm"
            onClick={() => dispatch({ type: 'player/update', slot, patch: { portraitId: null } })}
          />
        )}
      </div>

      <Field label="İsim" className="set-player__name">
        <TextInput
          value={player.name}
          maxLength={TEXT_LIMITS.playerName}
          placeholder="Karakterin adı"
          onChange={(name) => dispatch({ type: 'player/update', slot, patch: { name } })}
        />
      </Field>

      <div className="set-player__level">
        <span className="set-label">Seviye</span>
        <NumberStepper
          value={player.level}
          min={MIN_LEVEL}
          max={MAX_LEVEL}
          label={`${title} seviyesi`}
          onChange={(level) => dispatch({ type: 'player/update', slot, patch: { level } })}
        />
      </div>
    </section>
  )
})
