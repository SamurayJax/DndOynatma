import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { DisplayInfo } from '@shared/ipc'
import { reportError } from '@renderer/lib/reportError'
import { useAppInfo } from '@renderer/lib/useAppInfo'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import { Button, Field, FolderIcon, Panel, Select, Toggle } from '@renderer/ui'
import type { SelectOption } from '@renderer/ui'

const AUTO_DISPLAY = 'auto'

function useDisplays(): DisplayInfo[] | null {
  const [displays, setDisplays] = useState<DisplayInfo[] | null>(null)

  useEffect(() => {
    let alive = true
    const load = (): void => {
      window.dnd.app
        .getDisplays()
        .then((list) => {
          if (alive) setDisplays(list)
        })
        .catch((error: unknown) => reportError('Monitör listesi alınamadı', error))
    }
    load()
    // Ayarlar açıkken monitör takılıp çıkarılabilir; pencere yeniden öne gelince liste yenilenir.
    window.addEventListener('focus', load)
    return () => {
      alive = false
      window.removeEventListener('focus', load)
    }
  }, [])

  return displays
}

interface DisplayChoice {
  selected: string
  options: SelectOption[]
  /** Kayıtlı monitör şu an bağlı değil. */
  missing: boolean
}

function displayChoice(displays: DisplayInfo[] | null, displayId: number | null, autoLabel: string): DisplayChoice {
  const selected = displayId === null ? AUTO_DISPLAY : String(displayId)
  const options: SelectOption[] = [
    { value: AUTO_DISPLAY, label: autoLabel },
    ...(displays ?? []).map((display) => ({ value: String(display.id), label: display.label }))
  ]
  // Kayıtlı monitör listede yoksa da seçim görünür kalmalı; yoksa liste yanlışlıkla "Otomatik" gösterirdi.
  const listed = options.some((option) => option.value === selected)
  if (!listed) {
    options.push({ value: selected, label: displays === null ? 'Monitörler okunuyor…' : 'Kayıtlı monitör (şu an bağlı değil)' })
  }
  return { selected, options, missing: displays !== null && !listed }
}

const MISSING_DISPLAY_HINT = 'Kayıtlı monitör şu an bağlı değil. Başka bir monitör ya da "Otomatik" seçebilirsiniz.'

/** Ayarlar › Genel: oyun ekranının ve kontrol panelinin monitörü, tam ekran tercihi, klasörler ve sürüm. */
export function GeneralTab(): JSX.Element {
  const { settings } = useApp()
  const info = useAppInfo()
  const displays = useDisplays()

  const game = displayChoice(displays, settings.gameDisplayId, 'Otomatik (en büyük monitör)')
  const control = displayChoice(displays, settings.controlDisplayId, 'Otomatik (oyun ekranının olmadığı monitör)')
  const sameDisplay = settings.gameDisplayId !== null && settings.gameDisplayId === settings.controlDisplayId

  return (
    <div className="menu-general">
      <Panel title="Monitörler">
        <div className="menu-general__stack">
          <Field
            label="Oyun ekranının açılacağı monitör"
            hint={
              game.missing
                ? MISSING_DISPLAY_HINT
                : 'Oyuncularla paylaşılan pencere bu monitörde açılır. "Otomatik" seçiliyken en büyük monitör kullanılır.'
            }
          >
            <Select
              value={game.selected}
              options={game.options}
              onChange={(value) =>
                dispatch({
                  type: 'settings/update',
                  patch: { gameDisplayId: value === AUTO_DISPLAY ? null : Number(value) }
                })
              }
            />
          </Field>
          <Field
            label="Kontrol panelinin açılacağı monitör"
            hint={
              control.missing
                ? MISSING_DISPLAY_HINT
                : sameDisplay
                  ? 'İki pencere için aynı monitör seçili: oyun ekranı solda, kontrol paneli sağda yan yana açılır.'
                  : 'Yalnızca sizin gördüğünüz pencere bu monitörde açılır. Değişiklik bir sonraki "Oyna"da geçerli olur.'
            }
          >
            <Select
              value={control.selected}
              options={control.options}
              onChange={(value) =>
                dispatch({
                  type: 'settings/update',
                  patch: { controlDisplayId: value === AUTO_DISPLAY ? null : Number(value) }
                })
              }
            />
          </Field>
          <Toggle
            label="Oyun ekranı tam ekran açılsın"
            checked={settings.gameFullscreen}
            onChange={(checked) => dispatch({ type: 'settings/update', patch: { gameFullscreen: checked } })}
          />
        </div>
      </Panel>

      <Panel title="Klasörler">
        {/* İki satır aynı ızgarayı paylaşır; böylece düğmeler aynı genişlikte hizalanır. */}
        <div className="menu-general__folders">
          <div className="menu-general__folder-text">
            <span className="menu-general__label">Kayıt klasörü</span>
            <code className="menu-path selectable">{info?.dataDir ?? '…'}</code>
          </div>
          <Button icon={<FolderIcon size={18} />} onClick={() => window.dnd.app.openDataFolder()}>
            Kayıt klasörünü aç
          </Button>
          <div className="menu-general__folder-text">
            <span className="menu-general__label">Log klasörü</span>
            <code className="menu-path selectable">{info?.logDir ?? '…'}</code>
          </div>
          <Button icon={<FolderIcon size={18} />} onClick={() => window.dnd.app.openLogFolder()}>
            Log klasörünü aç
          </Button>
        </div>
      </Panel>

      <Panel title="Hakkında">
        <dl className="menu-general__about">
          <dt>Uygulama</dt>
          <dd>DndOynatma</dd>
          <dt>Sürüm</dt>
          <dd className="selectable">{info?.version ?? '…'}</dd>
        </dl>
      </Panel>
    </div>
  )
}
