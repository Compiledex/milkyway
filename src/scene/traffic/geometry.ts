// Drivable paths. Every path is resampled to points 0.25 m apart, so looking up
// a pose by distance is an array index. Heading convention: 0 faces +z,
// heading = atan2(dx, dz).

export interface Pt {
  x: number
  z: number
}

export interface Pose extends Pt {
  heading: number
}

export const STEP = 0.25

export class Path {
  readonly xs: Float32Array
  readonly zs: Float32Array
  readonly hs: Float32Array
  readonly length: number
  /** Driving direction: true when the vehicle reverses along this path. */
  readonly reverse: boolean
  /** Max comfortable speed per metre, from curvature. */
  readonly curveSpeed: Float32Array

  constructor(points: Pt[], reverse = false) {
    const resampled = resample(points)
    const n = resampled.length
    this.xs = new Float32Array(n)
    this.zs = new Float32Array(n)
    this.hs = new Float32Array(n)
    this.reverse = reverse
    for (let i = 0; i < n; i++) {
      this.xs[i] = resampled[i].x
      this.zs[i] = resampled[i].z
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1)
      const b = Math.min(n - 1, i + 1)
      let dx = this.xs[b] - this.xs[a]
      let dz = this.zs[b] - this.zs[a]
      if (reverse) {
        dx = -dx
        dz = -dz
      }
      this.hs[i] = dx === 0 && dz === 0 ? (i > 0 ? this.hs[i - 1] : 0) : Math.atan2(dx, dz)
    }
    this.length = (n - 1) * STEP
    // Curvature over ~2 m windows -> speed limit v = sqrt(a_lat * radius).
    const metres = Math.ceil(this.length) + 1
    this.curveSpeed = new Float32Array(metres)
    for (let m = 0; m < metres; m++) {
      const i = Math.min(n - 1, Math.round(m / STEP))
      const j = Math.min(n - 1, i + 8)
      const dh = Math.abs(angleDiff(this.hs[i], this.hs[j]))
      const dist = (j - i) * STEP
      const radius = dh > 1e-3 ? dist / dh : Infinity
      this.curveSpeed[m] = Math.min(30, Math.sqrt(2.1 * radius))
    }
  }

  get end(): Pose {
    return this.poseAt(this.length)
  }

  poseAt(s: number): Pose {
    const f = Math.max(0, Math.min(this.length, s)) / STEP
    const i = Math.min(this.xs.length - 2, Math.floor(f))
    if (i < 0) return { x: this.xs[0], z: this.zs[0], heading: this.hs[0] }
    const t = f - i
    return {
      x: this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t,
      z: this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t,
      heading: this.hs[i] + angleDiff(this.hs[i], this.hs[i + 1]) * t,
    }
  }

  /** Lowest comfortable speed between s and s + ahead, accounting for braking distance. */
  speedLimitAhead(s: number, ahead: number, brake: number) {
    let limit = Infinity
    const from = Math.max(0, Math.floor(s))
    const to = Math.min(this.curveSpeed.length - 1, Math.ceil(s + ahead))
    for (let m = from; m <= to; m++) {
      const d = Math.max(0, m - s)
      limit = Math.min(limit, Math.sqrt(this.curveSpeed[m] ** 2 + 2 * brake * d))
    }
    return limit
  }
}

export function angleDiff(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a))
}

export const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz)
export const dirOf = (heading: number): Pt => ({ x: Math.sin(heading), z: Math.cos(heading) })

function resample(points: Pt[]): Pt[] {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 1e-4)
  if (clean.length < 2) return [clean[0] ?? { x: 0, z: 0 }, clean[0] ?? { x: 0, z: 0 }]
  const out: Pt[] = [clean[0]]
  let carry = 0
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1]
    const b = clean[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    let d = STEP - carry
    while (d <= len) {
      const t = d / len
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      d += STEP
    }
    carry = len - (d - STEP)
  }
  const last = clean[clean.length - 1]
  const tail = out[out.length - 1]
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > 1e-3) out.push(last)
  return out
}

/** Polyline with every corner rounded by an arc of `radius` (shrunk if the legs are short). */
export function filleted(points: Pt[], radius: number): Pt[] {
  if (points.length < 3) return points
  const out: Pt[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const a = points[i - 1]
    const b = points[i + 1]
    const la = Math.hypot(p.x - a.x, p.z - a.z)
    const lb = Math.hypot(b.x - p.x, b.z - p.z)
    const d1 = { x: (p.x - a.x) / la, z: (p.z - a.z) / la }
    const d2 = { x: (b.x - p.x) / lb, z: (b.z - p.z) / lb }
    const turn = Math.abs(angleDiff(headingOf(d1.x, d1.z), headingOf(d2.x, d2.z)))
    if (turn < 1e-3) {
      out.push(p)
      continue
    }
    const t = Math.min(radius * Math.tan(turn / 2), la * 0.48, lb * 0.48)
    const s = { x: p.x - d1.x * t, z: p.z - d1.z * t }
    const e = { x: p.x + d2.x * t, z: p.z + d2.z * t }
    out.push(...arcBetween(s, p, e))
  }
  out.push(points[points.length - 1])
  return out
}

/** Quadratic Bézier from s to e with control c, sampled finely. Close to a circular arc for fillets. */
function arcBetween(s: Pt, c: Pt, e: Pt): Pt[] {
  const pts: Pt[] = []
  const n = 16
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push({ x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, z: u * u * s.z + 2 * u * t * c.z + t * t * e.z })
  }
  return pts
}

/**
 * Smooth transition between two poses (cubic Hermite). For a reversing
 * manoeuvre pass `reverse`: the vehicle faces the opposite way to its motion.
 */
export function hermite(from: Pose, to: Pose, reverse = false, tension = 1): Pt[] {
  const dist = Math.hypot(to.x - from.x, to.z - from.z)
  const k = dist * tension * (reverse ? -1 : 1)
  const m0 = dirOf(from.heading)
  const m1 = dirOf(to.heading)
  const pts: Pt[] = []
  const n = Math.max(12, Math.ceil(dist * 2))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    pts.push({
      x: h00 * from.x + h10 * m0.x * k + h01 * to.x + h11 * m1.x * k,
      z: h00 * from.z + h10 * m0.z * k + h01 * to.z + h11 * m1.z * k,
    })
  }
  return pts
}

/** Counter-clockwise (seen from above) arc on a circle, from angle a to b. Angle 0 = +x, +π/2 = north (−z). */
export function ccwArc(cx: number, cz: number, r: number, a: number, b: number): Pt[] {
  let span = b - a
  while (span <= 0) span += Math.PI * 2
  const n = Math.max(4, Math.ceil((span * r) / 0.5))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = a + (span * i) / n
    pts.push({ x: cx + r * Math.cos(t), z: cz - r * Math.sin(t) })
  }
  return pts
}

export function joinPoints(...parts: Pt[][]): Pt[] {
  const out: Pt[] = []
  for (const part of parts) {
    for (const p of part) {
      const last = out[out.length - 1]
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-3) out.push(p)
    }
  }
  return out
}
