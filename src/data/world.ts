import { GATE_X, YARD } from './layout'
import { createRng } from './rng'
import type { Id, Vec2 } from './types'

// The macro layout of the world around the sites: where roundabouts, roads
// and shops are. Deterministic but irregular, so nothing sits on a grid.
// The test-data simulation uses it for driving times; the 3D scene builds
// the actual lanes from it.

/** Main road runs in front of each yard at this z (site-local). */
export const MAIN_ROAD_Z = 56
/** Straight stretch of main road in front of each yard (site-local x). */
export const STRAIGHT_FROM = -45
export const STRAIGHT_TO = 64
export const WORLD_WEST = -320
export const WORLD_EAST = 760

export interface PlanArm {
  name: string
  /** Math angle: 0 = +x (east), π/2 = north (−z). */
  angle: number
}

export interface PlanRoundabout {
  id: string
  x: number
  z: number
  arms: PlanArm[]
}

export type PlanEnd = { kind: 'ra'; ra: string; arm: string } | { kind: 'edge'; id: string; x: number; z: number } | { kind: 'site'; siteId: Id; side: 'west' | 'east' }

export interface PlanLink {
  a: PlanEnd
  b: PlanEnd
}

export interface PlanShop {
  id: string
  ra: string
  arm: string
  x: number
  z: number
  /** Heading of the shop's "back": local +z points away from the access road. */
  rotation: number
  size: 'large' | 'small'
}

export interface WorldPlan {
  roundabouts: PlanRoundabout[]
  links: PlanLink[]
  shops: PlanShop[]
}

export const RA_ARM_LENGTH = 17

export function armPoint(ra: PlanRoundabout, arm: string, distance = RA_ARM_LENGTH): Vec2 {
  const a = ra.arms.find((x) => x.name === arm)!.angle
  return { x: ra.x + Math.cos(a) * distance, z: ra.z - Math.sin(a) * distance }
}

export function planWorld(sites: { id: Id; origin: Vec2 }[]): WorldPlan {
  const rng = createRng(1907)
  const jitter = (r: number) => (rng.next() * 2 - 1) * r
  const sorted = [...sites].sort((a, b) => a.origin.x - b.origin.x)
  const roadZ = (s: { origin: Vec2 }) => s.origin.z + MAIN_ROAD_Z
  const roundabouts: PlanRoundabout[] = []
  const links: PlanLink[] = []
  const shops: PlanShop[] = []

  // Main road roundabouts: before the first site, between sites, after the last.
  const raPos: Vec2[] = []
  raPos.push({ x: sorted[0].origin.x + STRAIGHT_FROM - 42, z: roadZ(sorted[0]) + jitter(6) })
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    raPos.push({ x: (a.origin.x + STRAIGHT_TO + b.origin.x + STRAIGHT_FROM) / 2 + jitter(3), z: (roadZ(a) + roadZ(b)) / 2 + jitter(2) })
  }
  const last = sorted[sorted.length - 1]
  raPos.push({ x: last.origin.x + STRAIGHT_TO + 44, z: roadZ(last) + jitter(6) })

  raPos.forEach((p, i) => {
    const between = i > 0 && i < raPos.length - 1
    const arms: PlanArm[] = [
      { name: 'W', angle: Math.PI },
      { name: 'E', angle: 0 },
      { name: 'S', angle: -Math.PI / 2 + jitter(0.3) },
    ]
    if (between) arms.push({ name: 'N', angle: Math.PI / 2 + jitter(0.12) })
    roundabouts.push({ id: `RA${i}`, x: p.x, z: p.z, arms })
  })

  // High street roundabouts, south of each main road roundabout, not lined up.
  const rbPos = raPos.map((p) => ({ x: p.x + jitter(22), z: p.z + 82 + jitter(12) }))
  rbPos.forEach((p, i) => {
    const ra = raPos[i]
    const toRa = Math.atan2(-(ra.z - p.z), ra.x - p.x)
    roundabouts.push({
      id: `RB${i}`,
      x: p.x,
      z: p.z,
      arms: [
        { name: 'N', angle: toRa },
        { name: 'W', angle: Math.PI + jitter(0.22) },
        { name: 'E', angle: jitter(0.22) },
        { name: 'S', angle: -Math.PI / 2 + jitter(0.4) },
      ],
    })
  })

  // Main road: edge – RA0 – site – RA1 – site – … – RAn – edge.
  links.push({ a: { kind: 'edge', id: 'MW', x: WORLD_WEST, z: raPos[0].z + jitter(10) }, b: { kind: 'ra', ra: 'RA0', arm: 'W' } })
  sorted.forEach((s, i) => {
    links.push({ a: { kind: 'ra', ra: `RA${i}`, arm: 'E' }, b: { kind: 'site', siteId: s.id, side: 'west' } })
    links.push({ a: { kind: 'site', siteId: s.id, side: 'east' }, b: { kind: 'ra', ra: `RA${i + 1}`, arm: 'W' } })
  })
  links.push({ a: { kind: 'ra', ra: `RA${raPos.length - 1}`, arm: 'E' }, b: { kind: 'edge', id: 'ME', x: WORLD_EAST, z: raPos[raPos.length - 1].z + jitter(10) } })
  // Avenues and the high street.
  rbPos.forEach((_, i) => links.push({ a: { kind: 'ra', ra: `RA${i}`, arm: 'S' }, b: { kind: 'ra', ra: `RB${i}`, arm: 'N' } }))
  links.push({ a: { kind: 'edge', id: 'SW', x: WORLD_WEST, z: rbPos[0].z + jitter(14) }, b: { kind: 'ra', ra: 'RB0', arm: 'W' } })
  for (let i = 1; i < rbPos.length; i++) links.push({ a: { kind: 'ra', ra: `RB${i - 1}`, arm: 'E' }, b: { kind: 'ra', ra: `RB${i}`, arm: 'W' } })
  links.push({ a: { kind: 'ra', ra: `RB${rbPos.length - 1}`, arm: 'E' }, b: { kind: 'edge', id: 'SE', x: WORLD_EAST, z: rbPos[rbPos.length - 1].z + jitter(14) } })

  // Shops: a big one off each high street roundabout, small ones between the sites.
  const place = (ra: PlanRoundabout, arm: string, size: PlanShop['size'], id: string) => {
    const a = ra.arms.find((x) => x.name === arm)!.angle
    const dir = { x: Math.cos(a), z: -Math.sin(a) }
    const dist = RA_ARM_LENGTH + (size === 'large' ? 30 : 24)
    shops.push({ id, ra: ra.id, arm, x: ra.x + dir.x * dist, z: ra.z + dir.z * dist, rotation: Math.atan2(dir.x, dir.z), size })
  }
  roundabouts.filter((r) => r.id.startsWith('RB')).forEach((r, i) => place(r, 'S', 'large', `shop-s${i}`))
  roundabouts.filter((r) => r.arms.some((a) => a.name === 'N') && r.id.startsWith('RA')).forEach((r, i) => place(r, 'N', 'small', `shop-n${i}`))

  return { roundabouts, links, shops }
}

/**
 * Rough driving distance in metres between a site's gate and a shop, along
 * the planned roads. Used to give test-data trips believable durations.
 */
export function drivingDistance(plan: WorldPlan, site: { id: Id; origin: Vec2 }, shop: PlanShop): number {
  const nodes = new Map<string, Vec2>()
  for (const r of plan.roundabouts) nodes.set(r.id, { x: r.x, z: r.z })
  const gate = { x: site.origin.x + GATE_X, z: site.origin.z + MAIN_ROAD_Z }
  nodes.set('gate', gate)
  nodes.set('shop', { x: shop.x, z: shop.z })
  const edges: [string, string][] = []
  for (const l of plan.links) {
    const id = (e: PlanEnd) => (e.kind === 'ra' ? e.ra : e.kind === 'site' ? (e.siteId === site.id ? 'gate' : `site:${e.siteId}`) : `edge:${e.id}`)
    edges.push([id(l.a), id(l.b)])
  }
  // Sites other than ours are pass-through: connect their two neighbours.
  const pass = new Map<string, string[]>()
  for (const [a, b] of edges) {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      if (x.startsWith('site:')) pass.set(x, [...(pass.get(x) ?? []), y])
    }
  }
  for (const [, ns] of pass) if (ns.length === 2) edges.push([ns[0], ns[1]])
  edges.push([shop.ra, 'shop'])
  const dist = (a: string, b: string) => {
    const p = nodes.get(a)
    const q = nodes.get(b)
    return p && q ? Math.hypot(p.x - q.x, p.z - q.z) * 1.12 : Infinity
  }
  const best = new Map<string, number>([['gate', 0]])
  const open = new Set(['gate'])
  while (open.size) {
    let cur = ''
    let d = Infinity
    for (const n of open) if ((best.get(n) ?? Infinity) < d) [cur, d] = [n, best.get(n)!]
    open.delete(cur)
    for (const [a, b] of edges) {
      const other = a === cur ? b : b === cur ? a : null
      if (!other) continue
      const nd = d + dist(cur, other)
      if (nd < (best.get(other) ?? Infinity)) {
        best.set(other, nd)
        open.add(other)
      }
    }
  }
  return (best.get('shop') ?? 600) + 80 + (YARD.maxZ - 14)
}
