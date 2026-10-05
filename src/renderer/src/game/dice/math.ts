/**
 * Zar için küçük vektör / dördey (quaternion) yardımcıları. Sağ el koordinat sistemi:
 * x sağa, y yukarı, z masadan izleyiciye doğru.
 */

export type Vec3 = readonly [number, number, number]
/** [x, y, z, w] */
export type Quat = readonly [number, number, number, number]

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1]

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a)
  return len === 0 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len]
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3])
  return len === 0 ? QUAT_IDENTITY : [q[0] / len, q[1] / len, q[2] / len, q[3] / len]
}

/** Önce b, sonra a uygulanır. */
export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ]
}

export function quatConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const unit = normalize(axis)
  const s = Math.sin(angle / 2)
  return [unit[0] * s, unit[1] * s, unit[2] * s, Math.cos(angle / 2)]
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(u × v) + 2u × (u × v)
  const u: Vec3 = [q[0], q[1], q[2]]
  const t = scale(cross(u, v), 2)
  const c = cross(u, t)
  return [v[0] + q[3] * t[0] + c[0], v[1] + q[3] * t[1] + c[1], v[2] + q[3] * t[2] + c[2]]
}

/** Küresel ara değer; kısa yoldan döner. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let cosine = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const sign = cosine < 0 ? -1 : 1
  cosine *= sign
  let wa = 1 - t
  let wb = t
  if (cosine < 0.9995) {
    const angle = Math.acos(cosine)
    const sine = Math.sin(angle)
    wa = Math.sin((1 - t) * angle) / sine
    wb = Math.sin(t * angle) / sine
  }
  wb *= sign
  return quatNormalize([
    a[0] * wa + b[0] * wb,
    a[1] * wa + b[1] * wb,
    a[2] * wa + b[2] * wb,
    a[3] * wa + b[3] * wb
  ])
}

/** `from` yönünü `to` yönüne taşıyan en kısa dönüş. İkisi de birim vektör olmalı. */
export function quatBetween(from: Vec3, to: Vec3): Quat {
  const cosine = dot(from, to)
  if (cosine < -0.999999) {
    // Tam ters: herhangi bir dik eksen etrafında yarım tur.
    const helper: Vec3 = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    return quatFromAxisAngle(cross(from, helper), Math.PI)
  }
  const axis = cross(from, to)
  return quatNormalize([axis[0], axis[1], axis[2], 1 + cosine])
}

/**
 * Birbirine dik iki birim vektör çiftini eşleyen dönüş: `fromA → toA` ve `fromB → toB`.
 */
export function quatFromFrames(fromA: Vec3, fromB: Vec3, toA: Vec3, toB: Vec3): Quat {
  const fromC = cross(fromA, fromB)
  const toC = cross(toA, toB)
  // M = [toA toB toC] · [fromA fromB fromC]ᵀ
  const m = (row: number, col: number): number =>
    toA[row] * fromA[col] + toB[row] * fromB[col] + toC[row] * fromC[col]
  const m00 = m(0, 0)
  const m11 = m(1, 1)
  const m22 = m(2, 2)
  const trace = m00 + m11 + m22
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    return quatNormalize([(m(2, 1) - m(1, 2)) / s, (m(0, 2) - m(2, 0)) / s, (m(1, 0) - m(0, 1)) / s, s / 4])
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    return quatNormalize([s / 4, (m(0, 1) + m(1, 0)) / s, (m(0, 2) + m(2, 0)) / s, (m(2, 1) - m(1, 2)) / s])
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    return quatNormalize([(m(0, 1) + m(1, 0)) / s, s / 4, (m(1, 2) + m(2, 1)) / s, (m(0, 2) - m(2, 0)) / s])
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2
  return quatNormalize([(m(0, 2) + m(2, 0)) / s, (m(1, 2) + m(2, 1)) / s, s / 4, (m(1, 0) - m(0, 1)) / s])
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Tekrarlanabilir rastgele sayı üreteci (mulberry32); testlerde aynı atışı yeniden üretmek için. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
