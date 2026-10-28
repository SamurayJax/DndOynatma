/**
 * Bir atışın zaman çizelgesi: atış → sonuç gösterimi → kaybolma. Tek bir requestAnimationFrame
 * döngüsü yürütür; iptal edildiğinde geride kare ya da zamanlayıcı bırakmaz.
 */
import { playArea } from '@shared/layout'
import { type DiceSides, STAGE_HEIGHT, STAGE_WIDTH } from '@shared/types'
import { getFullState } from '@renderer/lib/useAppState'
import { modelFor } from './geometry'
import { clamp, smoothstep } from './math'
import { type DieTone, drawDie } from './renderer'
import { type StageBounds, planThrow } from './throwPlan'

/** Zar birimi: d20'nin kenar uzunluğu (sanal piksel). d20 yerde dururken ekranda yaklaşık 273 piksel genişlik kaplar. */
const EDGE_PX = 146
const REVEAL_SECONDS = 3
const FADE_SECONDS = 0.5
/** Zar ekran dışından geldiği için normalde görünmez; yalnızca yedek planda ortada beliren zarı yumuşatır. */
const ENTRY_FADE_SECONDS = 0.1
const GLOW_RISE_SECONDS = 0.45
/** Büyük sayının madalyonu zarın üstünde durur: zarın tepesinden madalyonun merkezine (sanal piksel). */
const BADGE_OFFSET_PX = 144
/** Tuvalin iç çözünürlüğü için üst sınır; 4K ekranda gereksiz büyük tuval açılmasın. */
const MAX_CANVAS_WIDTH = 2560
/** Zamanlayıcılar kare döngüsünün yedeğidir; pencere görünmezken kareler durur ama zamanlayıcı çalışır. */
const TIMER_SLACK_MS = 40

export interface RevealSpot {
  /** Büyük sayının merkezi; kök öğenin yerleşim pikseliyle. */
  x: number
  y: number
}

/**
 * center: tek zar, oyun alanının ortası · left / right: avantaj / dezavantajda iki zar yan yana düşer.
 */
export type ThrowLane = 'center' | 'left' | 'right'

export interface ThrowOptions {
  lane?: ThrowLane
  /** Zar durduktan sonra kaybolmaya başlayana kadar geçen süre (saniye). */
  holdSeconds?: number
  /**
   * false: zar durduktan sonra kaybolmaz ve onFinish çağrılmaz; atış dönen fonksiyonla iptal edilene
   * kadar yerinde kalır (iki zarlı atışta ikinci zar, birinci zarla birlikte kaldırılır).
   */
  fade?: boolean
}

/** Şeritlerin oyun alanındaki yatay yeri (oran): başlangıç ve genişlik. */
const LANES: Record<ThrowLane, { x: number; width: number }> = {
  center: { x: 0.3, width: 0.4 },
  left: { x: 0.16, width: 0.28 },
  right: { x: 0.56, width: 0.28 }
}

export interface ThrowHandlers {
  /** Zar durdu; sonuç gösterilebilir. */
  onSettle(spot: RevealSpot): void
  /** Her şey kayboldu. */
  onFinish(): void
  onError(error: unknown): void
}

/** 20 ve 1 yalnızca d20'de özeldir. */
export function toneOf(sides: DiceSides, value: number): DieTone {
  if (sides !== 20) return 'normal'
  return value === 20 ? 'crit' : value === 1 ? 'fumble' : 'normal'
}

/**
 * `sides` yüzlü zarın `value` ile biten atışını oynatır. Dönen fonksiyon atışı iptal eder (yeni atış
 * geldiğinde ya da bileşen kaldırıldığında) ve güvenle birden çok kez çağrılabilir.
 */
export function playThrow(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  sides: DiceSides,
  value: number,
  handlers: ThrowHandlers,
  options: ThrowOptions = {}
): () => void {
  const lane = LANES[options.lane ?? 'center']
  const fades = options.fade ?? true
  const model = modelFor(sides)
  // Kök öğe 1920x1080 sanal kutuyu kaplar; kutu pencereye CSS dönüşümüyle ölçeklenir.
  const width = root.clientWidth || STAGE_WIDTH
  const height = root.clientHeight || STAGE_HEIGHT
  const virtualScale = width / STAGE_WIDTH
  const unit = EDGE_PX * virtualScale

  // Tuval ekrandaki gerçek piksel sayısıyla açılır; yoksa büyütülen pencerede zar bulanık görünür.
  const onScreen = root.getBoundingClientRect().width
  const zoom = onScreen > 0 ? onScreen / width : 1
  const ratio = clamp(zoom * (window.devicePixelRatio || 1), 0.25, MAX_CANVAS_WIDTH / width)
  const canvasWidth = Math.max(1, Math.round(width * ratio))
  const canvasHeight = Math.max(1, Math.round(height * ratio))
  if (canvas.width !== canvasWidth) canvas.width = canvasWidth
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')

  root.style.setProperty('--dice-u', String(virtualScale))
  root.style.opacity = ''

  const app = getFullState()?.app
  const area = app ? playArea(app) : { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT }
  const stage: StageBounds = {
    width: width / unit,
    height: height / unit,
    // Oyun alanının ortası; üstte büyük sayıya yer kalsın diye biraz aşağıda.
    landing: {
      x: (area.x + area.width * lane.x) / EDGE_PX,
      y: (area.y + area.height * 0.44) / EDGE_PX,
      width: (area.width * lane.width) / EDGE_PX,
      height: (area.height * 0.24) / EDGE_PX
    }
  }
  const plan = planThrow(model, value, stage)
  const tone = toneOf(sides, value)
  const drawScale = unit * ratio

  const settleAt = plan.duration
  const fadeAt = fades ? settleAt + (options.holdSeconds ?? REVEAL_SECONDS) : Number.POSITIVE_INFINITY
  const endAt = fadeAt + FADE_SECONDS
  const startedAt = performance.now()

  let frame = 0
  let stopped = false
  let settled = false
  /** Duran zar bir kez çizildikten sonra tuval değişmez; boşuna yeniden çizilmez. */
  let restDrawn = false
  const timers: number[] = []

  const stop = (): void => {
    stopped = true
    cancelAnimationFrame(frame)
    for (const timer of timers) window.clearTimeout(timer)
    timers.length = 0
  }

  const advance = (now: number): void => {
    if (stopped) return
    const time = Math.max(0, (now - startedAt) / 1000)

    if (time < settleAt) {
      if (ctx) {
        drawDie(ctx, model, plan.sample(time), {
          scale: drawScale,
          alpha: plan.penalty === 0 ? 1 : time / ENTRY_FADE_SECONDS,
          tone,
          glow: 0
        })
      }
    } else {
      const glow = tone === 'normal' ? 0 : smoothstep((time - settleAt) / GLOW_RISE_SECONDS)
      if (ctx && !restDrawn) {
        drawDie(ctx, model, plan.rest, { scale: drawScale, alpha: 1, tone, glow })
        restDrawn = tone === 'normal' || glow >= 1
      }
      if (!settled) {
        settled = true
        handlers.onSettle({
          x: plan.rest.x * unit,
          y: plan.rest.y * unit - model.silhouetteRadius * unit - BADGE_OFFSET_PX * virtualScale
        })
      }
    }

    if (time >= fadeAt) root.style.opacity = String(clamp(1 - (time - fadeAt) / FADE_SECONDS, 0, 1))

    if (time >= endAt) {
      stop()
      handlers.onFinish()
      return
    }
    // Kaybolmayan zar durduktan ve son karesi çizildikten sonra kare döngüsünü boşuna döndürmez.
    if (!fades && settled && restDrawn) stop()
  }

  const guarded = (now: number): void => {
    try {
      advance(now)
    } catch (error) {
      stop()
      handlers.onError(error)
    }
  }

  const loop = (now: number): void => {
    guarded(now)
    if (!stopped) frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)

  for (const at of [settleAt, fadeAt, endAt]) {
    // Kaybolmayan zarın sonsuz zamanı için zamanlayıcı kurulmaz (setTimeout sonsuzu hemen çalıştırırdı).
    if (Number.isFinite(at)) timers.push(window.setTimeout(() => guarded(performance.now()), at * 1000 + TIMER_SLACK_MS))
  }

  return () => {
    if (!stopped) stop()
    root.style.opacity = ''
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }
}
