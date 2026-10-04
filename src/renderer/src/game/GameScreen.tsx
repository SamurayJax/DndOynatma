import { useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { playArea } from '@shared/layout'
import type { Rect } from '@shared/layout'
import { STAGE_HEIGHT, STAGE_WIDTH } from '@shared/types'
import { useApp, useFullState } from '@renderer/lib/useAppState'
import { useSceneHotkeys } from '@renderer/lib/useSceneHotkeys'
import { ErrorBoundary } from '@renderer/ui'
import { DiceOverlay } from './DiceOverlay'
import { PlayStage } from './PlayStage'
import { PortraitColumn } from './PortraitColumn'
import { useFitScale } from './useFitScale'
import type { FitScale } from './useFitScale'
import './game.css'

/**
 * Oyuncuların gördüğü oyun ekranı (portre sütunu + oyun alanı, 1920x1080 sanal uzay).
 * Burada ToastHost bağlanmaz: oyuncular DM'e gelen bildirimleri görmemeli.
 */
export function GameScreen(): JSX.Element {
  const state = useFullState()
  const rootRef = useRef<HTMLDivElement>(null)
  const fit = useFitScale(rootRef)
  useSceneHotkeys()

  // Durum gelene kadar boş (siyah) ekran: paylaşılan pencerede "Yükleniyor" yazısı görünmesin.
  return (
    <div className="game-root" ref={rootRef}>
      {state !== null && fit !== null && <GameFrame fit={fit} />}
    </div>
  )
}

/** Değerleri aynı kaldıkça aynı nesneyi verir; alt bileşenlerin `memo`'su bozulmasın. */
function useStableRect(rect: Rect): Rect {
  const { x, y, width, height } = rect
  return useMemo(() => ({ x, y, width, height }), [x, y, width, height])
}

function GameFrame({ fit }: { fit: FitScale }): JSX.Element {
  const app = useApp()
  const area = useStableRect(playArea(app))

  return (
    <div className="game-frame" style={{ width: fit.width, height: fit.height }}>
      {/* Arka planı olmayan (ya da arka planın örtmediği) yerde görünen düz zemin. */}
      <div className="game-backdrop" style={{ left: `${(area.x / STAGE_WIDTH) * 100}%` }} />
      <PlayStage fit={fit} area={area} />
      <div className="game-virtual" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${fit.scale})` }}>
        <PortraitColumn />
        {/* Zar animasyonundaki bir hata oyun ekranını düşürmesin. */}
        <ErrorBoundary scope="zar" fallback={null}>
          <DiceOverlay />
        </ErrorBoundary>
      </div>
    </div>
  )
}
