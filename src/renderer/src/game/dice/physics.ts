/**
 * Zarın masaya düşüşünü katı cisim olarak hesaplar: yerçekimi, köşelerin masaya çarpması,
 * sekme ve sürtünme. Birimler: uzunluk = d20'nin kenarı, zaman = saniye, kütle = 1.
 * Masa z = 0 düzlemidir; z yukarı (izleyiciye) bakar.
 *
 * Hesap, animasyon başlamadan önce bir kerede yapılır ve kareler kaydedilir. Hangi sayının
 * geleceği burada belirlenmez; zarlar simetrik olduğu için sayılar sonradan, zarın durduğu
 * duruşa göre yerleştirilir (bkz. throwPlan.ts).
 *
 * Eylemsizlik her eksende aynı sayılır. d20 ve d4 için bu tamdır; d10'da eksenler arasındaki
 * küçük fark göz ardı edilir (yuvarlanışta seçilmez).
 */
import type { DiceSides } from '@shared/types'
import type { DieModel } from './geometry'
import { type Quat, type Vec3, quatNormalize, quatRotate } from './math'

/** Atışın karakterini belirleyen ayarlar; deneme betikleri farklı değerlerle çağırabilir. */
export interface PhysicsTuning {
  /** Gerçek değerin çok altında: ekranda dev bir zar ağır çekimde izlenir, böylece yuvarlanışı seçilir. */
  gravity: number
  restitution: number
  friction: number
  /** Masaya değerken dönüşü ve kaymayı yavaşlatan küçük kayıplar (yuvarlanma direnci). */
  angularDrag: number
  linearDrag: number
}

export const DEFAULT_TUNING: PhysicsTuning = {
  gravity: 46,
  restitution: 0.8,
  friction: 0.6,
  angularDrag: 1.4,
  linearDrag: 0.7
}

/**
 * Yüzü az olan zar daha zor yuvarlanır: bir kenarının üstünden devrilmesi için merkezinin daha çok
 * yükselmesi gerekir, bu yüzden masaya çarptığı gibi durmaya yatkındır. d10, d20 kadar canlı
 * yuvarlansın diye daha hızlı döndürülerek atılır ve biraz daha çok seker. d4 ne yapılsa yuvarlanmaz;
 * havada takla atıp bir kez seksin diye hızlı döndürülür, ondan beklenen tempo da kısadır
 * (bkz. throwPlan.ts, `PACING`). Değerler, her zar kendi temposunda d20 ile aynı oranda "iyi atış"
 * verecek şekilde denemeyle seçildi.
 */
const THROW_STYLES: Record<DiceSides, { spin: number; restitution: number }> = {
  20: { spin: 1, restitution: DEFAULT_TUNING.restitution },
  10: { spin: 1.5, restitution: 0.86 },
  4: { spin: 2.5, restitution: 0.9 }
}

export function tuningFor(model: DieModel): PhysicsTuning {
  return { ...DEFAULT_TUNING, restitution: THROW_STYLES[model.sides].restitution }
}

/** Bundan yavaş çarpmalar sekmez; yoksa zar durmak yerine sonsuza dek titrer. */
const BOUNCE_MIN_SPEED = 1.1
const STEP = 1 / 480
const RECORD_EVERY = 2
const MAX_TIME = 4.5
const CONTACT_ITERATIONS = 3
const CONTACT_SLOP = 0.015
/**
 * Durma sınaması anlık hıza değil, kısa bir aralıktaki yer değiştirmeye bakar: duran zarın anlık
 * hızı her adımda yerçekimi + değme düzeltmesi yüzünden sıfırın çevresinde titrer.
 */
const REST_WINDOW = 0.06
const REST_MAX_SHIFT = 0.002
const REST_MAX_TURN = 0.0015
/** Bundan alçak sıçramalar "sekme" sayılmaz. */
const HOP_MIN_HEIGHT = 0.1

export const FRAME_STEP = STEP * RECORD_EVERY
const FRAME_SIZE = 7

export interface ThrowStart {
  position: Vec3
  velocity: Vec3
  orientation: Quat
  /** Açısal hız (rad/s), dünya eksenlerinde. */
  spin: Vec3
}

export interface ThrowSim {
  start: ThrowStart
  gravity: number
  /** Her kare: x, y, z, qx, qy, qz, qw. Kareler FRAME_STEP aralıklıdır; ilki t = 0, sonuncusu restTime. */
  frames: Float64Array
  frameCount: number
  /** Zar tamamen durmadan hesap süresi dolduysa false. */
  rested: boolean
  restTime: number
  firstImpactTime: number
  /** İlk çarpmadan sonraki sıçramaların tepe yükseklikleri (en alçak köşenin masadan uzaklığı). */
  hops: number[]
  /** Durduğu duruş: yukarı bakan yüz ya da köşe (modelin `outcomes` sırası). */
  topOutcome: number
}

export interface SimPose {
  x: number
  y: number
  z: number
  q: Quat
}

/** Rastgele ama inandırıcı bir atış: +x yönünde ilerler, ilerleme yönünde yuvarlanır. */
export function randomThrowStart(model: DieModel, rng: () => number): ThrowStart {
  const between = (min: number, max: number): number => min + (max - min) * rng()
  const { spin } = THROW_STYLES[model.sides]
  // Düzgün dağılımlı rastgele yönelim (Shoemake).
  const u1 = rng()
  const u2 = rng() * Math.PI * 2
  const u3 = rng() * Math.PI * 2
  const a = Math.sqrt(1 - u1)
  const b = Math.sqrt(u1)
  return {
    position: [0, 0, between(2.4, 3.2)],
    velocity: [between(3.5, 10), between(-0.7, 0.7), between(-13, -8)],
    orientation: [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)],
    // +x yönünde yuvarlanan cisim +y ekseni etrafında döner; diğer eksenler takla katar.
    spin: [between(-7, 7) * spin, between(6, 14) * spin, between(-7, 7) * spin]
  }
}

export function simulateThrow(model: DieModel, start: ThrowStart, tuning: PhysicsTuning = tuningFor(model)): ThrowSim {
  const { gravity, restitution, friction, angularDrag, linearDrag } = tuning
  const { vertices, outcomes, circumradius, inertia } = model
  const vertexCount = vertices.length
  let [x, y, z] = start.position
  let [vx, vy, vz] = start.velocity
  let [wx, wy, wz] = start.spin
  let [qx, qy, qz, qw] = quatNormalize(start.orientation)

  const frames = new Float64Array((Math.ceil(MAX_TIME / FRAME_STEP) + 2) * FRAME_SIZE)
  let frameCount = 0
  const record = (): void => {
    const at = frameCount * FRAME_SIZE
    frames[at] = x
    frames[at + 1] = y
    frames[at + 2] = z
    frames[at + 3] = qx
    frames[at + 4] = qy
    frames[at + 5] = qz
    frames[at + 6] = qw
    frameCount++
  }
  record()

  const offsets = new Float64Array(vertexCount * 3)
  const totalSteps = Math.round(MAX_TIME / STEP)
  const windowSteps = Math.round(REST_WINDOW / STEP)
  let rested = false
  let firstImpactTime = -1
  let airborne = true
  let hopApex = 0
  const hops: number[] = []
  // Son sınama penceresinin başındaki duruş ve o andaki kare sayısı.
  let anchor = [x, y, z, qx, qy, qz, qw]
  let anchorFrames = frameCount
  let quietWindows = 0
  let quietFrames = 0

  for (let step = 1; step <= totalSteps && !rested; step++) {
    const time = step * STEP
    vz -= gravity * STEP
    x += vx * STEP
    y += vy * STEP
    z += vz * STEP

    // q ← q + ½·dt·(ω ⊗ q)
    const hx = wx * STEP * 0.5
    const hy = wy * STEP * 0.5
    const hz = wz * STEP * 0.5
    const nx = qx + hx * qw + hy * qz - hz * qy
    const ny = qy + hy * qw + hz * qx - hx * qz
    const nz = qz + hz * qw + hx * qy - hy * qx
    const nw = qw - hx * qx - hy * qy - hz * qz
    const norm = Math.hypot(nx, ny, nz, nw)
    qx = nx / norm
    qy = ny / norm
    qz = nz / norm
    qw = nw / norm

    let touching = 0
    let lowest = z - circumradius
    if (lowest < CONTACT_SLOP) {
      const m00 = 1 - 2 * (qy * qy + qz * qz)
      const m01 = 2 * (qx * qy - qz * qw)
      const m02 = 2 * (qx * qz + qy * qw)
      const m10 = 2 * (qx * qy + qz * qw)
      const m11 = 1 - 2 * (qx * qx + qz * qz)
      const m12 = 2 * (qy * qz - qx * qw)
      const m20 = 2 * (qx * qz - qy * qw)
      const m21 = 2 * (qy * qz + qx * qw)
      const m22 = 1 - 2 * (qx * qx + qy * qy)
      let minZ = Infinity
      for (let i = 0; i < vertexCount; i++) {
        const v = vertices[i]
        const rz = m20 * v[0] + m21 * v[1] + m22 * v[2]
        offsets[i * 3] = m00 * v[0] + m01 * v[1] + m02 * v[2]
        offsets[i * 3 + 1] = m10 * v[0] + m11 * v[1] + m12 * v[2]
        offsets[i * 3 + 2] = rz
        if (rz < minZ) minZ = rz
        if (z + rz < CONTACT_SLOP) touching++
      }
      lowest = z + minZ

      if (lowest < 0) {
        for (let iteration = 0; iteration < CONTACT_ITERATIONS; iteration++) {
          for (let i = 0; i < vertexCount; i++) {
            const rx = offsets[i * 3]
            const ry = offsets[i * 3 + 1]
            const rz = offsets[i * 3 + 2]
            if (z + rz >= 0) continue
            // Değme noktasının hızı: v + ω × r
            const uz = vz + wx * ry - wy * rx
            if (uz >= 0) continue
            const bounce = -uz > BOUNCE_MIN_SPEED ? restitution : 0
            const normalImpulse = (-(1 + bounce) * uz) / (1 + (rx * rx + ry * ry) / inertia)
            vz += normalImpulse
            wx += (ry * normalImpulse) / inertia
            wy -= (rx * normalImpulse) / inertia

            // Sürtünme: değme noktasının masadaki kaymasını durdurmaya çalışır, μ·N ile sınırlı.
            const ux = vx + wy * rz - wz * ry
            const uy = vy + wz * rx - wx * rz
            const slip = Math.hypot(ux, uy)
            if (slip < 1e-9) continue
            const tx = ux / slip
            const ty = uy / slip
            const cx = -rz * ty
            const cy = rz * tx
            const cz = rx * ty - ry * tx
            const needed = slip / (1 + (cx * cx + cy * cy + cz * cz) / inertia)
            const frictionImpulse = Math.min(needed, friction * normalImpulse)
            vx -= tx * frictionImpulse
            vy -= ty * frictionImpulse
            wx -= (cx * frictionImpulse) / inertia
            wy -= (cy * frictionImpulse) / inertia
            wz -= (cz * frictionImpulse) / inertia
          }
        }
        // Masanın altına inen zar yüzeye geri çıkarılır.
        z -= lowest
        lowest = 0
      }
    }

    if (touching > 0) {
      const spinKeep = 1 - angularDrag * STEP
      const slideKeep = 1 - linearDrag * STEP
      wx *= spinKeep
      wy *= spinKeep
      wz *= spinKeep
      vx *= slideKeep
      vy *= slideKeep
      if (firstImpactTime < 0) firstImpactTime = time
      if (airborne) {
        if (hopApex > HOP_MIN_HEIGHT) hops.push(hopApex)
        airborne = false
      }
      hopApex = 0
    } else {
      airborne = true
      // İlk düşüş sekme değildir.
      if (firstImpactTime >= 0 && lowest > hopApex) hopApex = lowest
    }

    if (step % RECORD_EVERY === 0) record()

    if (step % windowSteps === 0) {
      const shift = Math.hypot(x - anchor[0], y - anchor[1], z - anchor[2])
      const alignment = Math.abs(qx * anchor[3] + qy * anchor[4] + qz * anchor[5] + qw * anchor[6])
      const turn = 2 * Math.acos(Math.min(1, alignment))
      if (touching >= 3 && shift < REST_MAX_SHIFT && turn < REST_MAX_TURN) {
        if (quietWindows === 0) quietFrames = anchorFrames
        quietWindows++
        if (quietWindows >= 2) rested = true
      } else {
        quietWindows = 0
      }
      anchor = [x, y, z, qx, qy, qz, qw]
      anchorFrames = frameCount
    }
  }

  // Sakin geçen süre kayıttan atılır: zar o sürenin başında zaten durmuştu.
  if (rested) frameCount = quietFrames

  const end = frameAt(frames, frameCount - 1)
  let topOutcome = 0
  let topHeight = -Infinity
  for (let outcome = 0; outcome < outcomes.length; outcome++) {
    const height = quatRotate(end.q, outcomes[outcome].normal)[2]
    if (height > topHeight) {
      topHeight = height
      topOutcome = outcome
    }
  }

  const restTime = (frameCount - 1) * FRAME_STEP
  return {
    start,
    gravity,
    frames,
    frameCount,
    rested,
    restTime,
    firstImpactTime: firstImpactTime < 0 ? restTime : firstImpactTime,
    hops,
    topOutcome
  }
}

function frameAt(frames: Float64Array, index: number): SimPose {
  const at = index * FRAME_SIZE
  return {
    x: frames[at],
    y: frames[at + 1],
    z: frames[at + 2],
    q: [frames[at + 3], frames[at + 4], frames[at + 5], frames[at + 6]]
  }
}

export function finalPose(sim: ThrowSim): SimPose {
  return frameAt(sim.frames, sim.frameCount - 1)
}

/**
 * `time` anındaki konum ve yönelim. Negatif zaman da geçerlidir: ilk çarpmadan önce zar serbest
 * uçuşta olduğu için hareket geriye doğru da tam olarak bilinir (zar ekranın dışından getirilebilsin diye).
 */
export function samplePose(sim: ThrowSim, time: number): SimPose {
  if (time <= 0) {
    const { position, velocity, orientation, spin } = sim.start
    const rate = Math.hypot(spin[0], spin[1], spin[2])
    let q = quatNormalize(orientation)
    if (rate > 1e-9) {
      const half = (rate * time) / 2
      const s = Math.sin(half) / rate
      const tx = spin[0] * s
      const ty = spin[1] * s
      const tz = spin[2] * s
      const tw = Math.cos(half)
      // Dünya eksenindeki dönüş soldan çarpılır.
      q = [
        tw * q[0] + tx * q[3] + ty * q[2] - tz * q[1],
        tw * q[1] - tx * q[2] + ty * q[3] + tz * q[0],
        tw * q[2] + tx * q[1] - ty * q[0] + tz * q[3],
        tw * q[3] - tx * q[0] - ty * q[1] - tz * q[2]
      ]
    }
    return {
      x: position[0] + velocity[0] * time,
      y: position[1] + velocity[1] * time,
      z: position[2] + velocity[2] * time - 0.5 * sim.gravity * time * time,
      q
    }
  }
  const last = sim.frameCount - 1
  const exact = time / FRAME_STEP
  if (exact >= last) return frameAt(sim.frames, last)
  const index = Math.floor(exact)
  return mix(frameAt(sim.frames, index), frameAt(sim.frames, index + 1), exact - index)
}

function mix(a: SimPose, b: SimPose, t: number): SimPose {
  // Ardışık kareler birbirine çok yakın; doğrusal karışım + normalleştirme yeterli.
  const sign = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3] < 0 ? -1 : 1
  const s = 1 - t
  return {
    x: a.x * s + b.x * t,
    y: a.y * s + b.y * t,
    z: a.z * s + b.z * t,
    q: quatNormalize([
      a.q[0] * s + b.q[0] * t * sign,
      a.q[1] * s + b.q[1] * t * sign,
      a.q[2] * s + b.q[2] * t * sign,
      a.q[3] * s + b.q[3] * t * sign
    ])
  }
}
