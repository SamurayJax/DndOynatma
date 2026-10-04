import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { STAGE_HEIGHT, STAGE_WIDTH } from '@shared/types'

export interface FitScale {
  /** Sanal 1920x1080 uzayın pencereye sığdığı ölçek. */
  scale: number
  /** Ölçeklenmiş kutunun gerçek piksel boyutu (tam sayı). */
  width: number
  height: number
}

function fit(boxWidth: number, boxHeight: number): FitScale {
  const scale = Math.max(Math.min(boxWidth / STAGE_WIDTH, boxHeight / STAGE_HEIGHT), 0.01)
  // Kesirli tuval boyutu bulanık çizilir; kutu tam piksele yuvarlanır, ölçek tek tip kalır.
  return { scale, width: Math.round(STAGE_WIDTH * scale), height: Math.round(STAGE_HEIGHT * scale) }
}

/** Kök öğenin boyutunu izler ve sanal sahnenin ona sığan ölçeğini verir. İlk ölçümden önce `null`. */
export function useFitScale(ref: RefObject<HTMLElement | null>): FitScale | null {
  const [value, setValue] = useState<FitScale | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = (): void => {
      const next = fit(element.clientWidth, element.clientHeight)
      setValue((previous) =>
        previous !== null && previous.scale === next.scale && previous.width === next.width && previous.height === next.height
          ? previous
          : next
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return value
}
