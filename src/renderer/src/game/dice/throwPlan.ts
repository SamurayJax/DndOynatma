/**
 * Sonucu önceden belli olan bir atışı planlar.
 *
 * Fizik hangi yüzün üstte kalacağını kendisi belirler; biz sonucu değiştiremeyiz. Ama yirmi yüzlü
 * simetriktir: sayıları zarın üzerinde "çevirerek" yerleştirmek hareketi hiç değiştirmez. Bu yüzden
 * önce hareket hesaplanır, sonra sayılar üstte kalan yüze istenen değer gelecek şekilde yerleştirilir
 * ve bütün sahne dikey eksende döndürülerek rakam ekranda dik getirilir. Böylece zar baştan sona
 * gerçek bir zar gibi davranır ve sonunda hiçbir sıçrama ya da düzeltme görünmez.
 */
import { CIRCUMRADIUS, FACE_NORMALS, INRADIUS, faceCorner, restOrientation } from './geometry'
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

/** Ekran ölçüleri, zar birimiyle (kenar = 1); başlangıç sol üst, y aşağı. */
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

const MIN_DURATION = 1.9
const MAX_DURATION = 2.6
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
/** En az bir sıçrama bu kadar yükselmeli, en az iki sıçrama seçilebilmeli. */
const MIN_BIG_HOP = 0.45
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
const MAX_ATTEMPTS = 220
const CORNERS = [0, 1, 2] as const

interface Candidate {
  plan: ThrowPlan
  penalty: number
}

/** Zarın gözle durduğu an (fizik zamanı): bundan sonra son duruştan farkı seçilemez. */
function visibleRestTime(sim: ThrowSim): number {
  const end = finalPose(sim)
  let quietFrom = sim.restTime
  for (let t = sim.restTime - 1 / 60; t > sim.firstImpactTime; t -= 1 / 60) {
    const pose = samplePose(sim, t)
    const alignment = Math.abs(
      pose.q[0] * end.q[0] + pose.q[1] * end.q[1] + pose.q[2] * end.q[2] + pose.q[3] * end.q[3]
    )
    const turn = 2 * Math.acos(Math.min(1, alignment))
    const shift = Math.hypot(pose.x - end.x, pose.y - end.y, pose.z - end.z)
    if (shift + turn * CIRCUMRADIUS > VISIBLE_SHIFT) break
    quietFrom = t
  }
  return Math.min(sim.restTime, quietFrom + SETTLE_BLEND)
}

function evaluate(
  sim: ThrowSim,
  restTime: number,
  value: number,
  corner: number,
  tilt: number,
  landing: { x: number; y: number },
  stage: StageBounds
): Candidate {
  const end = finalPose(sim)

  // Fiziğin son duruşu neredeyse düzdür; kalan küçük eğim için düzeltme dönüşü.
  const topNormal = quatRotate(end.q, FACE_NORMALS[sim.topFace])
  const flatten = quatBetween(topNormal, [0, 0, 1])
  const flat = quatMul(flatten, end.q)

  const restQ = restOrientation(value, tilt)
  // Üstteki yüzün seçilen köşesi ekranda rakamın "yukarı" yönüne gelsin diye sahnenin dönüşü.
  const cornerDir = quatRotate(flat, faceCorner(sim.topFace, corner))
  const yawAngle = Math.PI / 2 + tilt - Math.atan2(cornerDir[1], cornerDir[0])
  const yaw = quatFromAxisAngle([0, 0, 1], yawAngle)
  // Sayıların zar üzerindeki yerleşimi: yirmi yüzlünün kendi simetrilerinden biri.
  const relabel = quatMul(quatConj(flat), quatMul(quatConj(yaw), restQ))
  const cos = Math.cos(yawAngle)
  const sin = Math.sin(yawAngle)

  const rest: DiePose = { x: landing.x, y: landing.y, z: INRADIUS, q: restQ }

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
      z: pose.z * keep + INRADIUS * weight,
      q: quatMul(yaw, quatMul(q, relabel))
    }
  }

  const isOffscreen = (pose: DiePose): boolean => {
    const radius = screenRadius(pose.z) * 1.05
    const dieOut =
      pose.x < -radius || pose.x > stage.width + radius || pose.y < -radius || pose.y > stage.height + radius
    if (!dieOut) return false
    const shadow = shadowOf(pose.x, pose.y, pose.z)
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
  if (duration < MIN_DURATION) penalty += 4 * (MIN_DURATION - duration)
  if (duration > MAX_DURATION) penalty += 4 * (duration - MAX_DURATION)

  const highest = sim.hops.reduce((max, hop) => Math.max(max, hop), 0)
  if (highest < MIN_BIG_HOP) penalty += 3 * (MIN_BIG_HOP - highest)
  if (sim.hops.filter((hop) => hop >= MIN_SMALL_HOP).length < 2) penalty += 1

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
function stillPlan(value: number, stage: StageBounds, attempts: number): ThrowPlan {
  const rest: DiePose = {
    x: stage.landing.x + stage.landing.width / 2,
    y: stage.landing.y + stage.landing.height / 2,
    z: INRADIUS,
    q: restOrientation(value)
  }
  return { duration: 0.3, rest, sample: () => rest, penalty: Infinity, attempts, entrySide: 'none' }
}

/**
 * `value` ile biten bir atış hazırlar. Rastgele atışlar dener; koşulların hepsini sağlayan ilkini,
 * yoksa en yakın olanı seçer. Tipik süre birkaç milisaniyedir.
 */
export function planThrow(value: number, stage: StageBounds, rng: () => number = Math.random): ThrowPlan {
  let best: Candidate | null = null
  let attempts = 0
  while (attempts < MAX_ATTEMPTS) {
    attempts++
    const sim = simulateThrow(randomThrowStart(rng))
    if (!sim.rested) continue
    const restTime = visibleRestTime(sim)
    const tilt = (rng() * 2 - 1) * REST_TILT
    const first = Math.floor(rng() * 3)
    for (let i = 0; i < 3; i++) {
      const corner = CORNERS[(first + i) % 3]
      for (let spot = 0; spot < 2; spot++) {
        const landing = {
          x: stage.landing.x + rng() * stage.landing.width,
          y: stage.landing.y + rng() * stage.landing.height
        }
        const candidate = evaluate(sim, restTime, value, corner, tilt, landing, stage)
        if (best === null || candidate.penalty < best.penalty) best = candidate
        if (candidate.penalty === 0) return { ...candidate.plan, attempts }
      }
    }
  }
  return best === null ? stillPlan(value, stage, attempts) : { ...best.plan, attempts }
}
