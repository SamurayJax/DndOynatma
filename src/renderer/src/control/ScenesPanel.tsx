import type { JSX } from 'react'
import { newId } from '@shared/id'
import { ScenesTab } from '@renderer/settings/ScenesTab'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import { Button, EmptyState, IconButton, Modal, MonitorIcon, Panel, PlusIcon, cx } from '@renderer/ui'
import { HotkeyBadge } from './HotkeyBadge'

/** Pencere listesi: tıklayınca o pencereye geçilir. Ad, tuş ve silme "Düzenle" kutusundadır (`SceneEditor`). */
export function ScenesPanel({ onEdit }: { onEdit: () => void }): JSX.Element {
  const { scenes, activeSceneId } = useApp()

  return (
    <Panel
      className="ctl-panel"
      title="Pencereler"
      actions={
        <>
          <span className="ctl-hint ctl-scenes__hint">1–9 tuşlarıyla geçiş</span>
          {/* Ad boş gönderilir; reducer "Pencere N" adını verir. */}
          <IconButton
            label="Pencere ekle"
            size="sm"
            icon={<PlusIcon size={18} />}
            onClick={() => dispatch({ type: 'scene/add', sceneId: newId(), name: '' })}
          />
          <Button size="sm" onClick={onEdit}>
            Düzenle
          </Button>
        </>
      }
    >
      {scenes.length === 0 ? (
        <EmptyState
          compact
          icon={<MonitorIcon size={22} />}
          title="Henüz pencere yok"
          hint="+ ile ekleyebilir ya da kütüphaneden bir görsele tıklayabilirsin."
        />
      ) : (
        <ul className="ctl-scenes">
          {scenes.map((scene) => {
            const active = scene.id === activeSceneId
            return (
              <li key={scene.id}>
                <button
                  type="button"
                  className={cx('ctl-scene', active && 'is-active')}
                  aria-current={active ? 'true' : undefined}
                  title={scene.name}
                  onClick={() => dispatch({ type: 'scene/setActive', sceneId: scene.id })}
                >
                  <HotkeyBadge hotkey={scene.hotkey} />
                  <span className="ctl-scene__name">{scene.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/**
 * "Pencereleri düzenle" kutusu. Sütunların dışında çizilir: dar pencerede sütun gizlenince
 * (`display: none`) içindeki açık kutu da kaybolur, sayfa ise etkisiz kalırdı.
 */
export function SceneEditor({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  return (
    <Modal
      open={open}
      onClose={onClose}
      className="ctl-scene-editor"
      title="Pencereleri düzenle"
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Tamam
        </Button>
      }
    >
      <ScenesTab />
    </Modal>
  )
}
