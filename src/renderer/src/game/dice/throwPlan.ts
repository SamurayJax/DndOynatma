/**
 * Sonucu önceden belli olan bir atışı planlar.
 *
 * Fizik zarın hangi duruşta kalacağını kendisi belirler; biz sonucu değiştiremeyiz. Ama zarlar
 * simetriktir: sayıları zarın üzerinde "çevirerek" yerleştirmek hareketi hiç değiştirmez. Bu yüzden
 * önce hareket hesaplanır, sonra sayılar zarın durduğu duruşta istenen değer okunacak şekilde yerleştirilir
 * ve bütün sahne dikey eksende döndürülerek rakam ekranda dik getirilir. Böylece zar baştan sona
 * gerçek bir zar gibi davranır ve sonunda hiçbir sıçrama ya da düzeltme görünmez.
 *
 * Her duruşun, zarın bir dönme simetrisiyle her duruşa taşınabildiği zarlarda geçerlidir (d20, d10, d4).
 */
import type { DiceSides } from '@shared/types'
import { type DieModel, outcomeUpAt, restOrientation } from './geometry'
import {
  type Quat,
  quatBetween,
  quatConj,
  quatFromAxisAngle,
  quatMul,
  quatRotate,
  quatSlerp,
  smoothstep
} from './math'
import { screenRadius, shadowOf } from './optics'
import { type ThrowSim, finalPose, randomThrowStart, samplePose, simulateThrow } from './physics'

/** Ekran ölçüleri, zar birimiyle (d20'nin kenarı = 1); başlangıç sol üst, y aşağı. */
export interface StageBounds {
  width: number
  height: number
  /** Zarın durabileceği bölge (oyun alanının orta kısmı). */
  landing: { x: number; y: number; width: number; height: number }
}

export interface DiePose {
  /** Ekran koordinatı (zar birimi, y aşağı). */
  x: number
  y: number
  /** Merkezin masadan yüksekliği. */
  z: number
  /** Yönelim; x sağa, y yukarı, z izleyiciye. */
  q: Quat
}

export interface ThrowPlan {
  /** Zarın ekrana girişinden durmasına kadar geçen süre (s). */
  duration: number
  rest: DiePose
  /** 0..duration; duration ve sonrası için `rest`. */
  sample(time: number): DiePose
  /** 0: bütün koşullar sağlandı. Büyüdükçe atış ideal olandan uzaklaşır. */
  penalty: number
  attempts: number
  entrySide: 'left' | 'right' | 'top' | 'bottom' | 'none'
}

/** Bir atışın temposu: ne kadar sürmeli, kaç kez ve ne kadar yükseğe sekmeli. */
export interface Pacing {
  /** Zarın ekrana girişinden durmasına kadar geçen süre (s). */
  minDuration: number
  maxDuration: number
  /** En az bir sıçrama bu kadar yükselmeli. */
  bigHop: number
  /** Seçilebilen (MIN_SMALL_HOP'tan yüksek) sıçramaların en az sayısı. */
  hops: number
}

const ROLLING: Pacing = { minDuration: 1.9, maxDuration: 2.6, bigHop: 0.45, hops: 2 }

/**
 * d20 ve d10 masada yuvarlanır. d4 yuvarlanmaz: sivri olduğu için masaya çarpar, bir kez sekip
 * devrilir ve kalır; ondan uzun bir yuvarlanış beklemek, onu gerçek dışı hızla döndürmek demektir.
 */
const PACING: Record<DiceSides, Pacing> = {
  20: ROLLING,
  10: ROLLING,
  4: { minDuration: 1.6, maxDuration: 2.4, bigHop: 0.35, hops: 1 }
}

export function pacingFor(model: DieModel): Pacing {
  return PACING[model.sides]
}

/** İlk çarpmadan en az bu kadar önce zar ekranda görünmüş olmalı; düşüşü izlenebilsin. */
const MIN_VISIBLE_FALL = 0.12
/** Zar serbest uçuşta en fazla bu kadar geriye götürülür (ekran dışından getirmek için). */
const MAX_REWIND = 0.7
const SCAN_STEP = 1 / 120
/** Girişte zarın yüksekliği: çok alçaksa masanın içinden çıkmış gibi, çok yüksekse dev gibi görünür. */
const MIN_ENTRY_HEIGHT = 1.6
const MAX_ENTRY_HEIGHT = 4.4
/** İlk çarpmadan sonra zarın merkezi ekran kenarına bundan fazla yaklaşmamalı. */
const EDGE_MARGIN = 0.85
/** Bundan alçak sıçrama gözle seçilmez. */
const MIN_SMALL_HOP = 0.15
/**
 * Fizik, zar gözle durmuş göründükten sonra da bir süre mikroskobik titreşimleri hesaplar. Son duruştan
 * farkı bu eşiğin (kenar birimi, ekranda ~1,5 piksel) altına indiği an zar durmuş sayılır; kalan fark
 * SETTLE_BLEND süresine yayılarak sıfırlanır. Böylece sonuç, zar durur durmaz gösterilir.
 */
const VISIBLE_SHIFT = 0.012
const SETTLE_BLEND = 0.2
/** Duran zarın rakamı en fazla bu kadar yatık olabilir (radyan). */
const REST_TILT = (6 * Math.PI) / 180
/** Rakamı üç yönde dik durabilen zar (d20, d4) için deneme sınırı ve atış başına denenen iniş yeri. */
const MAX_ATTEMPTS = 220
const LANDING_SPOTS = 2

interface Candidate {
  plan: ThrowPlan
  penalty: number
}

/** Zarın gözle durduğu an (fizik zamanı): bundan sonra son duruştan farkı seçilemez. */
function visibleRestTime(model: DieModel, sim: ThrowSim): number {
  const end = finalPose(sim)
  let quietFrom = sim.restTime
  for (let t = sim.restTime - 1 / 60; t > sim.firstImpactTime; t -= 1 / 60) {
    const pose = samplePose(sim, t)
    const alignment = Math.abs(
      pose.q[0] * end.q[0] + pose.q[1] * end.q[1] + pose.q[2] * end.q[2] + pose.q[3] * end.q[3]
    )
    const turn = 2 * Math.acos(Math.min(1, alignment))
    const shift = Math.hypot(pose.x - end.x, pose.y - end.y, pose.z - end.z)
    if (shift + turn * model.circumradius > VISIBLE_SHIFT) break
    quietFrom = t
  }
  return Math.min(sim.restTime, quietFrom + SETTLE_BLEND)
}

function evaluate(
  model: DieModel,
  sim: ThrowSim,
  restTime: number,
  value: number,
  turn: number,
  tilt: number,
  landing: { x: number; y: number },
  stage: StageBounds
): Candidate {
  const end = finalPose(sim)
  const pacing = pacingFor(model)

  // Fiziğin son duruşu neredeyse düzdür; kalan küçük eğim için düzeltme dönüşü.
  const topNormal = quatRotate(end.q, model.outcomes[sim.topOutcome].normal)
  const flatten = quatBetween(topNormal, [0, 0, 1])
  const flat = quatMul(flatten, end.q)

  const restQ = restOrientation(model, value, tilt)
  // Duruşun seçilen "yukarı" yönü ekranda da yukarı baksın diye sahnenin dönüşü.
  const upDir = quatRotate(flat, outcomeUpAt(model, sim.topOutcome, turn))
  const yawAngle = Math.PI / 2 + tilt - Math.atan2(upDir[1], upDir[0])
  const yaw = quatFromAxisAngle([0, 0, 1], yawAngle)
  // Sayıların zar üzerindeki yerleşimi: zarın kendi dönme simetrilerinden biri.
  const relabel = quatMul(quatConj(flat), quatMul(quatConj(yaw), restQ))
  const cos = Math.cos(yawAngle)
  const sin = Math.sin(yawAngle)

  const rest: DiePose = { x: landing.x, y: landing.y, z: model.inradius, q: restQ }

  const poseAt = (simTime: number): DiePose => {
    if (simTime >= restTime) return rest
    const pose = samplePose(sim, simTime)
    // Son anlarda fiziğin duruşu, tam düz son duruşa yumuşakça taşınır (fark zaten gözle seçilmez).
    const weight = smoothstep((simTime - (restTime - SETTLE_BLEND)) / SETTLE_BLEND)
    const keep = 1 - weight
    const q = weight > 0 ? quatSlerp(pose.q, flat, weight) : pose.q
    const dx = (pose.x - end.x) * keep
    const dy = (pose.y - end.y) * keep
    return {
      x: landing.x + dx * cos - dy * sin,
      // Dünya y'si yukarı, ekran y'si aşağı.
      y: landing.y - (dx * sin + dy * cos),
      z: pose.z * keep + model.inradius * weight,
      q: quatMul(yaw, quatMul(q, relabel))
    }
  }

  const isOffscreen = (pose: DiePose): boolean => {
    const radius = screenRadius(model, pose.z) * 1.05
    const dieOut =
      pose.x < -radius || pose.x > stage.width + radius || pose.y < -radius || pose.y > stage.height + radius
    if (!dieOut) return false
    const shadow = shadowOf(model, pose.x, pose.y, pose.z)
    return (
      shadow.x < -shadow.outer ||
      shadow.x > stage.width + shadow.outer ||
      shadow.y < -shadow.outer ||
      shadow.y > stage.height + shadow.outer
    )
  }

  let penalty = 0

  // Giriş anı: ilk çarpmadan geriye doğru, zarın (ve gölgesinin) ekranda hiç görünmediği son an.
  const latestEntry = sim.firstImpactTime - MIN_VISIBLE_FALL
  let entryTime = Number.NaN
  for (let t = latestEntry; t >= -MAX_REWIND; t -= SCAN_STEP) {
    const pose = poseAt(t)
    if (isOffscreen(pose)) {
      // Daha ilk bakışta dışarıdaysa ilk çarpma ekran dışında (ya da kenarında) kalıyor demektir.
      if (t === latestEntry) penalty += 3
      if (pose.z < MIN_ENTRY_HEIGHT) penalty += 2 * (MIN_ENTRY_HEIGHT - pose.z)
      if (pose.z > MAX_ENTRY_HEIGHT) penalty += 2 * (pose.z - MAX_ENTRY_HEIGHT)
      entryTime = t
      break
    }
  }
  if (Number.isNaN(entryTime)) {
    // Zar hiçbir anda ekran dışında değil: ortada belirecek (çizim kısa bir belirmeyle yumuşatır).
    entryTime = Math.min(latestEntry, 0) - 0.15
    penalty += 6
  }

  for (let t = sim.firstImpactTime; t < restTime; t += 1 / 30) {
    const pose = poseAt(t)
    const out = Math.max(
      EDGE_MARGIN - pose.x,
      pose.x - (stage.width - EDGE_MARGIN),
      EDGE_MARGIN - pose.y,
      pose.y - (stage.height - EDGE_MARGIN)
    )
    if (out > 0) {
      penalty += 2 + out
      break
    }
  }

  const duration = restTime - entryTime
  if (duration < pacing.minDuration) penalty += 4 * (pacing.minDuration - duration)
  if (duration > pacing.maxDuration) penalty += 4 * (duration - pacing.maxDuration)

  const highest = sim.hops.reduce((max, hop) => Math.max(max, hop), 0)
  if (highest < pacing.bigHop) penalty += 3 * (pacing.bigHop - highest)
  if (sim.hops.filter((hop) => hop >= MIN_SMALL_HOP).length < pacing.hops) penalty += 1

  const entry = poseAt(entryTime)
  const overflow = [-entry.x, entry.x - stage.width, -entry.y, entry.y - stage.height]
  const side = (['left', 'right', 'top', 'bottom'] as const)[overflow.indexOf(Math.max(...overflow))]

  return {
    penalty,
    plan: {
      duration,
      rest,
      sample: (time) => poseAt(entryTime + time),
      penalty,
      attempts: 0,
      entrySide: side
    }
  }
}

/** Zarın düşmeden, olduğu yerde belirdiği plan: fizik hiç sonuç vermezse son çare. */
function stillPlan(model: DieModel, value: number, stage: StageBounds, attempts: number): ThrowPlan {
  const rest: DiePose = {
    x: stage.landing.x + stage.landing.width / 2,
    y: stage.landing.y + stage.landing.height / 2,
    z: model.inradius,
    q: restOrientation(model, value)
  }
  return { duration: 0.3, rest, sample: () => rest, penalty: Infinity, attempts, entrySide: 'none' }
}

/**
 * `value` ile biten bir atış hazırlar. Rastgele atışlar dener; koşulların hepsini sağlayan ilkini,
 * yoksa en yakın olanı seçer. Tipik süre 10 milisaniye dolayındadır; en kötü durumda 0,1 saniyeyi bulur.
 */
export function planThrow(
  model: DieModel,
  value: number,
  stage: StageBounds,
  rng: () => number = Math.random
): ThrowPlan {
  const { turns } = model
  // Rakamı tek yöne yazılabilen zarda (d10) atış başına aday azdır; açık, daha çok iniş yeri ve
  // daha çok denemeyle kapatılır.
  const scarcity = Math.max(1, 3 / turns)
  const maxAttempts = Math.round(MAX_ATTEMPTS * scarcity)
  const spots = Math.round(LANDING_SPOTS * scarcity)
  let best: Candidate | null = null
  let attempts = 0
  while (attempts < maxAttempts) {
    attempts++
    const sim = simulateThrow(model, randomThrowStart(model, rng))
    if (!sim.rested) continue
    const restTime = visibleRestTime(model, sim)
    const tilt = (rng() * 2 - 1) * REST_TILT
    // Rakamın dik durabileceği her yön, zarın ekrana başka bir yönden girmesi demektir.
    const first = Math.floor(rng() * turns)
    for (let i = 0; i < turns; i++) {
      const turn = (first + i) % turns
      for (let spot = 0; spot < spots; spot++) {
        const landing = {
          x: stage.landing.x + rng() * stage.landing.width,
          y: stage.landing.y + rng() * stage.landing.height
        }
        const candidate = evaluate(model, sim, restTime, value, turn, tilt, landing, stage)
        if (best === null || candidate.penalty < best.penalty) best = candidate
        if (candidate.penalty === 0) return { ...candidate.plan, attempts }
      }
    }
  }
  return best === null ? stillPlan(model, value, stage, attempts) : { ...best.plan, attempts }
}
