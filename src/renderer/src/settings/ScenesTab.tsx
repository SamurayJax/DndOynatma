import { useCallback, useState } from 'react'
import type { JSX } from 'react'
import { newId } from '@shared/id'
import { findImage, findScene } from '@shared/layout'
import type { ID } from '@shared/types'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import { Button, EmptyState, MonitorIcon, PlusIcon } from '@renderer/ui'
import { BackgroundPicker } from './BackgroundPicker'
import { SceneRow } from './SceneRow'
import './settings.css'

/**
 * Ayarlar › Pencereler. Oyun sırasında kontrol panelindeki bir kutunun içinde de açılır;
 * bu yüzden boyut varsaymaz: verilen alanı doldurur, liste kendi içinde kayar.
 */
export function ScenesTab(): JSX.Element {
  const app = useApp()
  const [focusSceneId, setFocusSceneId] = useState<ID | null>(null)
  const [pickerSceneId, setPickerSceneId] = useState<ID | null>(null)

  const clearFocus = useCallback(() => setFocusSceneId(null), [])

  const addScene = (): void => {
    const sceneId = newId()
    setFocusSceneId(sceneId)
    // Boş ad: reducer "Pencere N" adını verir.
    dispatch({ type: 'scene/add', sceneId, name: '' })
  }

  // Seçici açıkken pencere başka yerden silinirse seçici de kapanır.
  const pickerScene = findScene(app, pickerSceneId)

  return (
    <>
      <div className="set-scenes">
        <header className="set-intro">
          <p className="set-intro__text">
            Pencere, oyun sırasında tek tuşla geçtiğiniz hazır düzendir: bir arka plan ve üstüne yerleştirilen görseller.
          </p>
          <Button variant="primary" icon={<PlusIcon size={18} />} onClick={addScene}>
            Yeni pencere
          </Button>
        </header>

        {app.scenes.length === 0 ? (
          <EmptyState
            className="set-scenes__empty"
            icon={<MonitorIcon size={28} />}
            title="Henüz pencere yok"
            hint="“Kraliyet İçi”, “Orman Yolu” gibi her mekan için bir pencere hazırlayın; oyunda 1–9 tuşlarıyla aralarında geçersiniz."
            action={
              <Button icon={<PlusIcon size={18} />} onClick={addScene}>
                İlk pencereyi oluştur
              </Button>
            }
          />
        ) : (
          <ul className="set-scenes__list" aria-label="Pencereler">
            {app.scenes.map((scene) => (
              <SceneRow
                key={scene.id}
                scene={scene}
                scenes={app.scenes}
                active={scene.id === app.activeSceneId}
                background={findImage(app, scene.background?.imageId ?? null)}
                focusName={scene.id === focusSceneId}
                onNameFocused={clearFocus}
                onPickBackground={setPickerSceneId}
              />
            ))}
          </ul>
        )}
      </div>

      {pickerScene !== undefined && (
        <BackgroundPicker scene={pickerScene} library={app.library} onClose={() => setPickerSceneId(null)} />
      )}
    </>
  )
}
