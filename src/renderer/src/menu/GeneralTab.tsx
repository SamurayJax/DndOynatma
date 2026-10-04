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

/** Ayarlar › Genel: oyun ekranının monitörü, tam ekran tercihi, klasörler ve sürüm. */
export function GeneralTab(): JSX.Element {
  const { settings } = useApp()
  const info = useAppInfo()
  const displays = useDisplays()

  const selected = settings.gameDisplayId === null ? AUTO_DISPLAY : String(settings.gameDisplayId)
  const options: SelectOption[] = [
    { value: AUTO_DISPLAY, label: 'Otomatik (ikinci monitör)' },
    ...(displays ?? []).map((display) => ({ value: String(display.id), label: display.label }))
  ]
  // Kayıtlı monitör listede yoksa da seçim görünür kalmalı; yoksa liste yanlışlıkla "Otomatik" gösterirdi.
  const selectedListed = options.some((option) => option.value === selected)
  if (!selectedListed) {
    options.push({ value: selected, label: displays === null ? 'Monitörler okunuyor…' : 'Kayıtlı monitör (şu an bağlı değil)' })
  }
  const displayMissing = displays !== null && !selectedListed

  return (
    <div className="menu-general">
      <Panel title="Oyun ekranı">
        <div className="menu-general__stack">
          <Field
            label="Oyun ekranının açılacağı monitör"
            hint={
              displayMissing
                ? 'Kayıtlı monitör şu an bağlı değil. Başka bir monitör ya da "Otomatik" seçebilirsiniz.'
                : 'Oyuncularla paylaşılan pencere bu monitörde açılır. "Otomatik" seçiliyken ikinci monitör tercih edilir.'
            }
          >
            <Select
              value={selected}
              options={options}
              onChange={(value) =>
                dispatch({
                  type: 'settings/update',
                  patch: { gameDisplayId: value === AUTO_DISPLAY ? null : Number(value) }
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
