import { memo, useMemo } from 'react'
import type { JSX } from 'react'
import { activeScene } from '@shared/layout'
import { TEXT_LIMITS } from '@shared/reducer'
import type { ID, LibraryImage, SceneWindow, StageItem } from '@shared/types'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  EmptyState,
  IconButton,
  ImageIcon,
  ImageThumb,
  Panel,
  TextInput,
  TrashIcon,
  confirmDialog,
  cx
} from '@renderer/ui'
import { blurOnEnterOrEscape } from './leaveField'

const MISSING_IMAGE_NAME = 'Görsel bulunamadı'

async function clearItems(scene: SceneWindow): Promise<void> {
  const confirmed = await confirmDialog({
    title: 'Tüm görseller kaldırılsın mı?',
    message: `"${scene.name}" penceresindeki ${scene.items.length} görsel oyun ekranından kaldırılır. Arka plan kalır; görseller kütüphaneden silinmez.`,
    confirmLabel: 'Tümünü kaldır',
    danger: true
  })
  if (confirmed) dispatch({ type: 'stage/clearItems', sceneId: scene.id })
}

/** Etkin pencerede oyun ekranında duranlar: arka plan, sonra en üstteki başta olmak üzere görseller. */
export function StagePanel(): JSX.Element {
  const app = useApp()
  const scene = activeScene(app)
  const images = useMemo(() => new Map(app.library.map((image) => [image.id, image])), [app.library])

  const itemCount = scene?.items.length ?? 0
  const hasAnything = scene !== undefined && (scene.background !== null || itemCount > 0)

  return (
    <Panel
      className="ctl-panel ctl-stage"
      flush
      scroll
      title={
        <>
          Ekrandakiler
          {itemCount > 0 && <span className="ctl-count">{itemCount}</span>}
        </>
      }
      actions={
        <Button size="sm" variant="ghost" disabled={scene === undefined || itemCount === 0} onClick={() => scene !== undefined && void clearItems(scene)}>
          Tümünü kaldır
        </Button>
      }
    >
      {!hasAnything ? (
        <EmptyState
          compact
          icon={<ImageIcon size={22} />}
          title="Ekranda görsel yok"
          hint="Kütüphaneden bir görsele tıklayınca oyun ekranına konur ve burada listelenir."
        />
      ) : (
        <ul className="ctl-stage__list">
          {/* Arka plan satırı boşken de durur: arka plan konunca alttaki satırlar yer değiştirmesin. */}
          <BackgroundRow sceneId={scene.id} background={scene.background} image={images.get(scene.background?.imageId ?? '')} />
          {scene.items
            .map((item, index) => (
              <ItemRow
                key={item.id}
                sceneId={scene.id}
                item={item}
                image={images.get(item.imageId)}
                canForward={index < itemCount - 1}
                canBackward={index > 0}
              />
            ))
            // Dizinin sonu en üstte çizilir; listede en üstteki başta görünür.
            .reverse()}
        </ul>
      )}
    </Panel>
  )
}

interface BackgroundRowProps {
  sceneId: ID
  background: StageItem | null
  image: LibraryImage | undefined
}

const BackgroundRow = memo(function BackgroundRow({ sceneId, background, image }: BackgroundRowProps): JSX.Element {
  return (
    <li className="ctl-stage__row ctl-stage__row--background">
      <ImageThumb className="ctl-stage__thumb ctl-thumb" image={image} fit="cover" emptyLabel="" alt="" />
      <div className="ctl-stage__text">
        <span className="ctl-stage__kind">Arka plan</span>
        <span className={cx('ctl-stage__name', background === null && 'is-none')} title={image?.originalName}>
          {background === null ? 'yok' : (image?.originalName ?? MISSING_IMAGE_NAME)}
        </span>
      </div>
      {background !== null && (
        <div className="ctl-stage__actions">
          <IconButton
            label="Arka planı kaldır"
            size="sm"
            variant="ghost"
            className="ctl-stage__remove"
            icon={<TrashIcon size={16} />}
            onClick={() => dispatch({ type: 'stage/clearBackground', sceneId })}
          />
        </div>
      )}
    </li>
  )
})

interface ItemRowProps {
  sceneId: ID
  item: StageItem
  image: LibraryImage | undefined
  canForward: boolean
  canBackward: boolean
}

// Oyun ekranında bir görsel sürüklenirken yalnızca o görselin satırı yeniden çizilir.
const ItemRow = memo(function ItemRow({ sceneId, item, image, canForward, canBackward }: ItemRowProps): JSX.Element {
  const name = image?.originalName ?? MISSING_IMAGE_NAME
  const itemId = item.id

  return (
    <li className="ctl-stage__row">
      <ImageThumb className="ctl-stage__thumb ctl-thumb" image={image} emptyLabel="" alt="" />
      <div className="ctl-stage__text">
        <span className="ctl-stage__name" title={name}>
          {name}
        </span>
        <TextInput
          className="ctl-stage__label"
          value={item.label}
          maxLength={TEXT_LIMITS.itemLabel}
          placeholder="Etiket (ör. 7 LVL)"
          aria-label={`${name} etiketi`}
          onChange={(label) => dispatch({ type: 'stage/updateItem', sceneId, itemId, patch: { label } })}
          onKeyDown={blurOnEnterOrEscape}
        />
      </div>
      <div className="ctl-stage__actions">
        <IconButton
          label="Öne al"
          size="sm"
          icon={<ArrowUpIcon size={16} />}
          disabled={!canForward}
          onClick={() => dispatch({ type: 'stage/reorderItem', sceneId, itemId, to: 'forward' })}
        />
        <IconButton
          label="Arkaya al"
          size="sm"
          icon={<ArrowDownIcon size={16} />}
          disabled={!canBackward}
          onClick={() => dispatch({ type: 'stage/reorderItem', sceneId, itemId, to: 'backward' })}
        />
        <IconButton
          label={`${name} görselini kaldır`}
          size="sm"
          className="ctl-stage__remove"
          icon={<TrashIcon size={16} />}
          onClick={() => dispatch({ type: 'stage/removeItem', sceneId, itemId })}
        />
      </div>
    </li>
  )
})
