import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { MAX_HOTKEY, MIN_HOTKEY, TEXT_LIMITS } from '@shared/reducer'
import type { ID, LibraryImage, SceneWindow } from '@shared/types'
import { dispatch } from '@renderer/lib/useAppState'
import {
  Button,
  CheckIcon,
  Field,
  IconButton,
  ImageIcon,
  ImageThumb,
  Select,
  TextInput,
  TrashIcon,
  confirmDialog,
  cx,
  toast
} from '@renderer/ui'
import type { SelectOption } from '@renderer/ui'

export interface SceneRowProps {
  scene: SceneWindow
  /** Bütün pencereler; atama tuşlarının kimde olduğunu göstermek için. */
  scenes: readonly SceneWindow[]
  active: boolean
  /** Arka planın kütüphanedeki görseli; arka plan yoksa `undefined`. */
  background: LibraryImage | undefined
  /** Yeni eklenen pencere: ad alanı odaklanır ki hemen adlandırılabilsin. */
  focusName: boolean
  onNameFocused: () => void
  onPickBackground: (sceneId: ID) => void
}

const NO_HOTKEY = 'none'
const HOTKEYS = Array.from({ length: MAX_HOTKEY - MIN_HOTKEY + 1 }, (_, index) => MIN_HOTKEY + index)

function hotkeyOwner(scenes: readonly SceneWindow[], scene: SceneWindow, hotkey: number): SceneWindow | undefined {
  return scenes.find((other) => other.id !== scene.id && other.hotkey === hotkey)
}

/** Pencere listesinin bir satırı: ad, atama tuşu, arka plan, etkinleştirme ve silme. */
export function SceneRow({ scene, scenes, active, background, focusName, onNameFocused, onPickBackground }: SceneRowProps): JSX.Element {
  const rowRef = useRef<HTMLLIElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // Boş ad reddedilince giriş yeniden kurulur; böylece yazılan boşluk yerine eski ad hemen görünür.
  const [nameResetKey, setNameResetKey] = useState(0)

  useEffect(() => {
    if (!focusName) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
    nameRef.current?.focus()
    nameRef.current?.select()
    onNameFocused()
  }, [focusName, onNameFocused])

  const hotkeyOptions: SelectOption[] = [
    { value: NO_HOTKEY, label: 'Yok' },
    ...HOTKEYS.map((hotkey) => {
      const owner = hotkeyOwner(scenes, scene, hotkey)
      return { value: String(hotkey), label: owner ? `${hotkey} — “${owner.name}” penceresinde` : String(hotkey) }
    })
  ]

  const commitName = (text: string): void => {
    const name = text.trim()
    if (name === '') {
      // Reducer boş adı yok sayar; adsız pencere olmaz.
      setNameResetKey((key) => key + 1)
      return
    }
    if (name !== scene.name) dispatch({ type: 'scene/update', sceneId: scene.id, patch: { name } })
  }

  const changeHotkey = (value: string): void => {
    const hotkey = value === NO_HOTKEY ? null : Number(value)
    const previousOwner = hotkey === null ? undefined : hotkeyOwner(scenes, scene, hotkey)
    dispatch({ type: 'scene/update', sceneId: scene.id, patch: { hotkey } })
    // Tuşu kaybeden satır ekranın dışında olabilir; değişiklik sessiz kalmasın.
    if (previousOwner !== undefined) toast(`${hotkey} tuşu “${previousOwner.name}” penceresinden alındı.`)
  }

  const removeScene = async (): Promise<void> => {
    const confirmed = await confirmDialog({
      title: `“${scene.name}” silinsin mi?`,
      message:
        'Bu pencerenin düzeni kaybolur: arka plan seçimi ve üstüne yerleştirilen görsellerin yeri, boyutu, etiketi. Görsellerin kendisi kütüphanede kalır.',
      danger: true,
      confirmLabel: 'Sil'
    })
    if (confirmed) dispatch({ type: 'scene/remove', sceneId: scene.id })
  }

  const itemCount = scene.items.length
  const pickBackground = (): void => onPickBackground(scene.id)

  return (
    <li ref={rowRef} className={cx('set-scene', active && 'is-active')} aria-label={scene.name}>
      <button
        type="button"
        className="set-scene__thumb"
        title="Arka plan seç"
        aria-label={background ? `Arka plan: ${background.originalName}` : 'Arka plan yok'}
        onClick={pickBackground}
      >
        <ImageThumb image={background} fit="cover" alt="" emptyLabel="Arka plan yok" className="set-scene__thumb-img" />
      </button>

      <div className="set-scene__fields">
        <Field label="Pencere adı" className="set-scene__name">
          <TextInput
            key={nameResetKey}
            ref={nameRef}
            value={scene.name}
            maxLength={TEXT_LIMITS.sceneName}
            placeholder="Pencere adı"
            onCommit={commitName}
            onKeyDown={(event) => {
              // Enter "tamam" demektir: odak çıkar, kayıtlı (kırpılmış) ad görünür.
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
            }}
          />
        </Field>
        <div className="set-scene__key">
          <Field label="Atama tuşu" className="set-scene__hotkey">
            <Select
              value={scene.hotkey === null ? NO_HOTKEY : String(scene.hotkey)}
              options={hotkeyOptions}
              onChange={changeHotkey}
            />
          </Field>
          <IconButton
            className="set-quiet-danger"
            label="Pencereyi sil"
            icon={<TrashIcon size={18} />}
            onClick={() => void removeScene()}
          />
        </div>
      </div>

      <div className="set-scene__meta">
        <span className="set-scene__count">
          <ImageIcon size={16} />
          {itemCount === 0 ? 'Görsel yok' : `${itemCount} görsel`}
        </span>
        <Button size="sm" onClick={pickBackground}>
          Arka plan seç
        </Button>
        {scene.background !== null && (
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'stage/clearBackground', sceneId: scene.id })}>
            Arka planı kaldır
          </Button>
        )}
        <span className="set-scene__state">
          {active ? (
            <span className="set-chip set-chip--on" title="Oyun ekranında şu an bu pencere açık">
              <CheckIcon size={14} />
              Etkin
            </span>
          ) : (
            <Button size="sm" onClick={() => dispatch({ type: 'scene/setActive', sceneId: scene.id })}>
              Etkin yap
            </Button>
          )}
        </span>
      </div>
    </li>
  )
}
