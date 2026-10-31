import { memo, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { activeScene, isCardable, isStretched } from '@shared/layout'
import { TEXT_LIMITS } from '@shared/reducer'
import type { ID, LibraryImage, MusicTrack, SceneWindow, StageItem } from '@shared/types'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import { VideoThumb } from '@renderer/music/VideoThumb'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  EmptyState,
  IconButton,
  ImageIcon,
  ImageThumb,
  Panel,
  RotateIcon,
  TextInput,
  TrashIcon,
  confirmDialog,
  cx
} from '@renderer/ui'
import { CardEditor } from './CardEditor'
import { blurOnEnterOrEscape } from './leaveField'

const MISSING_IMAGE_NAME = 'Görsel bulunamadı'

/** Saat yönünde bir sonraki çeyrek tur; elle eğilmiş görsel en yakın düz açıya gelir. */
function nextQuarterTurn(rotation: number): number {
  return ((Math.floor(rotation / 90 + 0.001) + 1) * 90) % 360
}

function rotate(sceneId: ID, item: StageItem): void {
  dispatch({ type: 'stage/updateItem', sceneId, itemId: item.id, patch: { rotation: nextQuarterTurn(item.rotation) } })
}

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
  const video = scene === undefined || scene.videoTrackId === null ? undefined : app.music.tracks.find((track) => track.id === scene.videoTrackId)
  const hasAnything = scene !== undefined && (scene.background !== null || video !== undefined || itemCount > 0)

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
          <BackgroundRow sceneId={scene.id} background={scene.background} image={images.get(scene.background?.imageId ?? '')} video={video} />
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
  /** Hareketli arka plan; varsa görsel arka plan yoktur. */
  video: MusicTrack | undefined
}

function ResetRatioButton({ sceneId, itemId }: { sceneId: ID; itemId: ID }): JSX.Element {
  return (
    <Button className="ctl-stage__mode" size="sm" title="Esnetilmiş görseli kendi oranına döndürür" onClick={() => dispatch({ type: 'stage/resetRatio', sceneId, itemId })}>
      Oranı düzelt
    </Button>
  )
}

const BackgroundRow = memo(function BackgroundRow({ sceneId, background, image, video }: BackgroundRowProps): JSX.Element {
  if (video !== undefined) {
    return (
      <li className="ctl-stage__row ctl-stage__row--background">
        <VideoThumb className="ctl-stage__thumb" track={video} />
        <div className="ctl-stage__text">
          <span className="ctl-stage__kind">Hareketli arka plan</span>
          <span className="ctl-stage__name" title={video.originalName}>
            {video.originalName}
          </span>
        </div>
        <div className="ctl-stage__actions">
          <IconButton
            label="Hareketli arka planı kaldır"
            size="sm"
            variant="ghost"
            className="ctl-stage__remove"
            icon={<TrashIcon size={16} />}
            onClick={() => dispatch({ type: 'scene/setVideo', sceneId, trackId: null })}
          />
        </div>
      </li>
    )
  }
  return (
    <li className="ctl-stage__row ctl-stage__row--background">
      <ImageThumb className="ctl-stage__thumb ctl-thumb" image={image} fit="cover" emptyLabel="" alt="" />
      <div className="ctl-stage__text">
        <span className="ctl-stage__kind">Arka plan</span>
        <span className={cx('ctl-stage__name', background === null && 'is-none')} title={image?.originalName}>
          {background === null ? 'yok' : (image?.originalName ?? MISSING_IMAGE_NAME)}
        </span>
        {background !== null && isStretched(background, image) && <ResetRatioButton sceneId={sceneId} itemId={background.id} />}
      </div>
      {background !== null && (
        <div className="ctl-stage__actions">
          <IconButton
            label="Arka planı 90° döndür"
            size="sm"
            icon={<RotateIcon size={16} />}
            onClick={() => rotate(sceneId, background)}
          />
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
  const name = item.card?.name ?? image?.originalName ?? MISSING_IMAGE_NAME
  const itemId = item.id
  const [editing, setEditing] = useState(false)

  return (
    <li className="ctl-stage__row">
      <ImageThumb className="ctl-stage__thumb ctl-thumb" image={image} emptyLabel="" alt="" />
      <div className="ctl-stage__text">
        <span className="ctl-stage__name" title={name}>
          {name}
        </span>
        {item.card === undefined && (
          <TextInput
            className="ctl-stage__label"
            value={item.label}
            maxLength={TEXT_LIMITS.itemLabel}
            placeholder="Etiket (ör. 7 LVL)"
            aria-label={`${name} etiketi`}
            onChange={(label) => dispatch({ type: 'stage/updateItem', sceneId, itemId, patch: { label } })}
            onKeyDown={blurOnEnterOrEscape}
          />
        )}
        <div className="ctl-stage__buttons">
          {item.card !== undefined ? (
            <Button className="ctl-stage__mode" size="sm" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
              {editing ? 'Kapat' : 'Düzenle'}
            </Button>
          ) : (
            image !== undefined &&
            isCardable(image.kind) && (
              <Button className="ctl-stage__mode" size="sm" onClick={() => dispatch({ type: 'stage/setCardMode', sceneId, itemId, enabled: true })}>
                Karta çevir
              </Button>
            )
          )}
          {isStretched(item, image) && <ResetRatioButton sceneId={sceneId} itemId={itemId} />}
        </div>
      </div>
      {item.card !== undefined && <CardEditor sceneId={sceneId} itemId={itemId} card={item.card} boss={image?.kind === 'boss'} editing={editing} />}
      <div className="ctl-stage__actions">
        <IconButton label={`${name} görselini 90° döndür`} size="sm" icon={<RotateIcon size={16} />} onClick={() => rotate(sceneId, item)} />
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
