import {
  APPROACH_Z,
  DOCK_WALL_Z,
  EXIT_Z,
  GATE_IN_X,
  GATE_OUT_X,
  HOLD_Z,
  ROAD_INBOUND_Z,
  ROAD_OUTBOUND_Z,
  dockApproachX,
  dockPosition,
} from '../../data/layout'
import type { Site } from '../../data/types'
import { MAIN_ROAD_Z, RA_ARM_LENGTH, STRAIGHT_FROM, STRAIGHT_TO, armPoint, type PlanEnd, type PlanShop, type WorldPlan } from '../../data/world'
import { Path, filleted, headingOf, hermite, ccwArc, joinPoints, type Pose, type Pt } from './geometry'

// The drivable world as a directed lane graph (right-hand traffic), built
// from the world plan: curved roads between roundabouts, the straight stretch
// of main road in front of each yard with its gate, and shops with a loop for
// cars and a separate goods-in lane for trucks.

export const LANE_OFFSET = (ROAD_OUTBOUND_Z - ROAD_INBOUND_Z) / 2
export const RA_RADIUS = 9
export type VehicleKind = 'truck' | 'car'

export interface RoundaboutGeo {
  id: string
  cx: number
  cz: number
  arms: { name: string; angle: number }[]
}

export interface ShopGeo extends PlanShop {
  /** Local layout half-sizes. */
  dims: ShopDims
  /** World transform helper. */
  toWorld: (lx: number, lz: number) => Pt
  /** Node where trucks unload. */
  bayNode: string
  armOut: string
  armIn: string
}

interface ShopDims {
  top: number
  back: number
  carSide: number
  truckSide: number
  mouth: number
  buildingW: number
  buildingD: number
  buildingZ: number
  lotW: number
  parkingZ: number
}

export const SHOP_DIMS: Record<PlanShop['size'], ShopDims> = {
  large: { top: -20, back: 16, carSide: 21, truckSide: 25, mouth: -26, buildingW: 34, buildingD: 12, buildingZ: 2, lotW: 29, parkingZ: -12 },
  small: { top: -15, back: 12, carSide: 15, truckSide: 19, mouth: -21, buildingW: 20, buildingD: 9, buildingZ: 1.5, lotW: 23, parkingZ: -9 },
}

export interface BoxSpec {
  leadIn: number
  tail: number
}

export interface Edge {
  from: string
  to: string
  path: Path
  kind: 'road' | 'yard'
  box?: BoxSpec
  /** Only this vehicle kind may use the edge. */
  only?: VehicleKind
  /** Where cars stop on a shop loop. */
  carStop?: number
}

/** A drawn road: dense centreline. */
export interface RoadStrip {
  pts: Pt[]
}

const rightOf = (d: Pt): Pt => ({ x: -d.z, z: d.x })

/** Offset a dense polyline sideways (positive = right of the drawing direction). */
function offsetLine(pts: Pt[], offset: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const r = rightOf({ x: (b.x - a.x) / len, z: (b.z - a.z) / len })
    return { x: p.x + r.x * offset, z: p.z + r.z * offset }
  })
}

/** Split a polyline at the point nearest `target`, inserting the target. */
function splitAt(pts: Pt[], target: Pt): [Pt[], Pt[]] {
  let best = 0
  let bestD = Infinity
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - target.x, p.z - target.z)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return [[...pts.slice(0, best), target], [target, ...pts.slice(best + 1)]]
}

export class RoadNetwork {
  readonly nodes = new Map<string, Pose>()
  readonly edges: Edge[] = []
  readonly out = new Map<string, Edge[]>()
  readonly roundabouts: RoundaboutGeo[] = []
  readonly shops: ShopGeo[] = []
  readonly strips: RoadStrip[] = []
  readonly edgesIn: string[] = []
  readonly edgesOut: string[] = []
  private readonly routeCache = new Map<string, Route | null>()
  private readonly sites: Site[]

  constructor(sites: Site[], plan: WorldPlan) {
    this.sites = sites
    for (const r of plan.roundabouts) {
      const geo = { id: r.id, cx: r.x, cz: r.z, arms: r.arms }
      this.roundabouts.push(geo)
      this.addRoundabout(geo)
    }
    const ra = (id: string) => plan.roundabouts.find((r) => r.id === id)!

    // Combine "RA → site west" and "site east → RA" into one main-road piece per site.
    const siteLinks = new Map<string, { west?: PlanEnd; east?: PlanEnd }>()
    for (const l of plan.links) {
      const siteEnd = l.a.kind === 'site' ? l.a : l.b.kind === 'site' ? l.b : null
      if (!siteEnd || siteEnd.kind !== 'site') {
        this.addRoad(this.endPose(l.a, ra, l.b), this.endPose(l.b, ra, l.a))
        continue
      }
      const other = siteEnd === l.a ? l.b : l.a
      const entry = siteLinks.get(siteEnd.siteId) ?? {}
      entry[siteEnd.side] = other
      siteLinks.set(siteEnd.siteId, entry)
    }
    for (const [siteId, { west, east }] of siteLinks) {
      const site = sites.find((s) => s.id === siteId)!
      if (west && east) this.addSiteRoad(site, this.endPose(west, ra), this.endPose(east, ra))
    }
    for (const shop of plan.shops) this.addShop(shop, ra(shop.ra))
  }

  // --- Ends of roads ---------------------------------------------------------------

  /** Pose at a road end, heading pointing *away* from the end, into the road. */
  private endPose(e: PlanEnd, ra: (id: string) => { x: number; z: number; arms: { name: string; angle: number }[]; id: string }, other?: PlanEnd): Pose & { node: string } {
    if (e.kind === 'ra') {
      const r = ra(e.ra)
      const p = armPoint(r, e.arm)
      const a = r.arms.find((x) => x.name === e.arm)!.angle
      return { ...p, heading: headingOf(Math.cos(a), -Math.sin(a)), node: `${e.ra}:${e.arm}` }
    }
    if (e.kind === 'edge') {
      const otherX = other && other.kind === 'ra' ? ra(other.ra).x : 0
      const inward = { x: Math.sign(otherX - e.x) || 1, z: 0 }
      const pose = { x: e.x, z: e.z, heading: headingOf(inward.x, inward.z), node: e.id }
      const outward = { x: -inward.x, z: 0 }
      this.nodes.set(`${e.id}:out`, { ...add(pose, rightOf(inward), LANE_OFFSET), heading: headingOf(inward.x, inward.z) })
      this.nodes.set(`${e.id}:in`, { ...add(pose, rightOf(outward), LANE_OFFSET), heading: headingOf(outward.x, outward.z) })
      this.edgesIn.push(`${e.id}:out`)
      this.edgesOut.push(`${e.id}:in`)
      return pose
    }
    throw new Error('site ends are handled by addSiteRoad')
  }

  // --- Roundabouts ------------------------------------------------------------------

  private addRoundabout(r: RoundaboutGeo) {
    for (const arm of r.arms) {
      const u = { x: Math.cos(arm.angle), z: -Math.sin(arm.angle) }
      const base = { x: r.cx + u.x * RA_ARM_LENGTH, z: r.cz + u.z * RA_ARM_LENGTH }
      const inDir = { x: -u.x, z: -u.z }
      this.nodes.set(`${r.id}:${arm.name}:in`, { ...add(base, rightOf(inDir), LANE_OFFSET), heading: headingOf(inDir.x, inDir.z) })
      this.nodes.set(`${r.id}:${arm.name}:out`, { ...add(base, rightOf(u), LANE_OFFSET), heading: headingOf(u.x, u.z) })
    }
    const circle = (theta: number): Pose => ({
      x: r.cx + RA_RADIUS * Math.cos(theta),
      z: r.cz - RA_RADIUS * Math.sin(theta),
      heading: headingOf(-Math.sin(theta), -Math.cos(theta)),
    })
    for (const a of r.arms) {
      for (const b of r.arms) {
        const tin = a.angle + 0.5
        const tout = b.angle - 0.5
        const inPose = this.nodes.get(`${r.id}:${a.name}:in`)!
        const outPose = this.nodes.get(`${r.id}:${b.name}:out`)!
        const pts = joinPoints(hermite(inPose, circle(tin), false, 0.8), ccwArc(r.cx, r.cz, RA_RADIUS, tin, tout), hermite(circle(tout), outPose, false, 0.8))
        this.addEdge({ from: `${r.id}:${a.name}:in`, to: `${r.id}:${b.name}:out`, path: new Path(pts), kind: 'road', box: { leadIn: 3, tail: 7.5 } })
      }
    }
  }

  // --- Roads --------------------------------------------------------------------------

  /** Curved two-way road between two ends (headings point into the road). */
  private addRoad(a: Pose & { node: string }, b: Pose & { node: string }) {
    const centre = hermite(a, { ...b, heading: b.heading + Math.PI }, false, 0.9)
    this.addLanes(centre, a.node, b.node)
  }

  private addLanes(centre: Pt[], aNode: string, bNode: string, split?: { forward?: [Pt, string]; backward?: [Pt, string] }) {
    this.strips.push({ pts: centre })
    const fwd = offsetLine(centre, LANE_OFFSET)
    const bwd = offsetLine(centre, -LANE_OFFSET).reverse()
    const lane = (pts: Pt[], from: string, to: string, at?: [Pt, string]) => {
      if (!at) {
        this.addEdge({ from, to, path: new Path(pts), kind: 'road' })
        return
      }
      const [p1, p2] = splitAt(pts, at[0])
      this.addEdge({ from, to: at[1], path: new Path(p1), kind: 'road' })
      this.addEdge({ from: at[1], to, path: new Path(p2), kind: 'road' })
    }
    lane(fwd, `${aNode}:out`, `${bNode}:in`, split?.forward)
    lane(bwd, `${bNode}:out`, `${aNode}:in`, split?.backward)
  }

  /** Main road past a yard: curve in, straight past the gate, curve out. */
  private addSiteRoad(site: Site, west: Pose & { node: string }, east: Pose & { node: string }) {
    const ox = site.origin.x
    const oz = site.origin.z
    const z = oz + MAIN_ROAD_Z
    const w: Pose = { x: ox + STRAIGHT_FROM, z, heading: Math.PI / 2 }
    const e: Pose = { x: ox + STRAIGHT_TO, z, heading: Math.PI / 2 }
    const centre = joinPoints(hermite(west, w, false, 0.9), [w, e], hermite(e, { ...east, heading: east.heading + Math.PI }, false, 0.9))

    const turnIn: Pose = { x: ox + GATE_IN_X + 8, z: oz + ROAD_INBOUND_Z, heading: -Math.PI / 2 }
    const join: Pose = { x: ox + GATE_OUT_X + 12, z: oz + ROAD_OUTBOUND_Z, heading: Math.PI / 2 }
    this.nodes.set(`${site.id}:turnIn`, turnIn)
    this.nodes.set(`${site.id}:join`, join)
    this.addLanes(centre, west.node, east.node, { forward: [join, `${site.id}:join`], backward: [turnIn, `${site.id}:turnIn`] })

    // Into the yard: right turn off the westbound lane, up the east gate lane to the hold line.
    const hold: Pose = { x: ox + GATE_IN_X, z: oz + HOLD_Z, heading: Math.PI }
    this.nodes.set(`${site.id}:hold`, hold)
    this.addEdge({
      from: `${site.id}:turnIn`,
      to: `${site.id}:hold`,
      path: new Path(filleted([turnIn, { x: ox + GATE_IN_X, z: oz + ROAD_INBOUND_Z }, hold], 6)),
      kind: 'yard',
      box: { leadIn: 10, tail: 0 },
      only: 'truck',
    })
  }

  // --- Shops ------------------------------------------------------------------------------

  private addShop(plan: PlanShop, r: { id: string; x: number; z: number; arms: { name: string; angle: number }[] }) {
    const d = SHOP_DIMS[plan.size]
    const cos = Math.cos(plan.rotation)
    const sin = Math.sin(plan.rotation)
    const toWorld = (lx: number, lz: number): Pt => ({ x: plan.x + lx * cos + lz * sin, z: plan.z - lx * sin + lz * cos })
    const armOut = `${r.id}:${plan.arm}:out`
    const armIn = `${r.id}:${plan.arm}:in`
    const bayNode = `${plan.id}:bay`
    const geo: ShopGeo = { ...plan, dims: d, toWorld, bayNode, armOut, armIn }
    this.shops.push(geo)

    const W = (lx: number, lz: number) => toWorld(lx, lz)
    const inPose = this.nodes.get(armOut)!
    const outPose = this.nodes.get(armIn)!
    const mouthIn = W(-LANE_OFFSET, d.mouth)
    const mouthOut = W(LANE_OFFSET, d.mouth)
    this.strips.push({ pts: [armPoint(r, plan.arm), W(0, d.mouth + 0.5)] })

    const loop = (side: number) => [
      inPose,
      mouthIn,
      W(-LANE_OFFSET, d.top),
      W(-d.carSide, d.top),
      W(-d.carSide, d.back),
      W(side, d.back),
      W(side, d.top),
      W(LANE_OFFSET, d.top),
      mouthOut,
      outPose,
    ]
    // Cars: one loop past the entrance, stop at the drop-off.
    const carPath = new Path(filleted(loop(d.carSide), 4.5))
    this.addEdge({ from: armOut, to: armIn, path: carPath, kind: 'yard', only: 'car', carStop: nearestS(carPath, W(-d.carSide * 0.55, d.top)) })
    // Trucks: the outer goods-in lane on the east side, stop at the bay, then out.
    const truckPts = filleted(loop(d.truckSide), 4.5)
    const bay = W(d.truckSide, d.buildingZ + 2)
    const [toBay, fromBay] = splitAt(truckPts, bay)
    const bayPath = new Path(toBay)
    this.nodes.set(bayNode, bayPath.end)
    this.addEdge({ from: armOut, to: bayNode, path: bayPath, kind: 'yard', only: 'truck' })
    this.addEdge({ from: bayNode, to: armIn, path: new Path(fromBay), kind: 'yard', only: 'truck' })
  }

  private addEdge(e: Edge) {
    this.edges.push(e)
    const list = this.out.get(e.from) ?? []
    list.push(e)
    this.out.set(e.from, list)
  }

  // --- Site yard manoeuvres -------------------------------------------------------------------

  /** Hold line → along the approach lane → stop past the door (forward), then reverse in. */
  dockManoeuvre(site: Site, dockNumber: number): [Path, Path] {
    const ox = site.origin.x
    const oz = site.origin.z
    const hold = this.nodes.get(`${site.id}:hold`)!
    const ax = ox + dockApproachX(dockNumber)
    const forward = new Path(filleted([hold, { x: ox + GATE_IN_X, z: oz + APPROACH_Z }, { x: ax, z: oz + APPROACH_Z }], 6))
    const back = new Path(hermite({ x: ax, z: oz + APPROACH_Z, heading: -Math.PI / 2 }, dockedPose(site, dockNumber), true, 1.05), true)
    return [forward, back]
  }

  /** Pull out of a door, east along the exit lane, out of the west gate lane onto the eastbound road. */
  departure(site: Site, dockNumber: number): Path {
    const ox = site.origin.x
    const oz = site.origin.z
    const d = dockedPose(site, dockNumber)
    const join = this.nodes.get(`${site.id}:join`)!
    return new Path(
      filleted([d, { x: d.x, z: oz + EXIT_Z }, { x: ox + GATE_OUT_X, z: oz + EXIT_Z }, { x: ox + GATE_OUT_X, z: oz + ROAD_OUTBOUND_Z }, join], 5.5),
    )
  }

  shopNear(p: Pt): ShopGeo | undefined {
    let best: ShopGeo | undefined
    let bestD = Infinity
    for (const s of this.shops) {
      const d = Math.hypot(s.x - p.x, s.z - p.z)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  get siteList() {
    return this.sites
  }

  // --- Routing ------------------------------------------------------------------------------------

  /** Shortest route for a vehicle kind, as one drivable path with its boxes and stops. */
  route(from: string, to: string, kind: VehicleKind): Route | null {
    const key = `${kind}|${from}>${to}`
    if (this.routeCache.has(key)) return this.routeCache.get(key)!
    const dist = new Map<string, number>([[from, 0]])
    const prev = new Map<string, Edge>()
    const open = new Set([from])
    while (open.size) {
      let cur = ''
      let best = Infinity
      for (const n of open) {
        const d = dist.get(n)!
        if (d < best) {
          best = d
          cur = n
        }
      }
      open.delete(cur)
      if (cur === to) break
      for (const e of this.out.get(cur) ?? []) {
        if (e.only && e.only !== kind) continue
        const nd = best + e.path.length + (e.box ? 6 : 0)
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd)
          prev.set(e.to, e)
          open.add(e.to)
        }
      }
    }
    if (!prev.has(to) && from !== to) {
      this.routeCache.set(key, null)
      return null
    }
    const edges: Edge[] = []
    for (let n = to; n !== from; ) {
      const e = prev.get(n)!
      edges.unshift(e)
      n = e.from
    }
    const r = buildRoute(edges)
    this.routeCache.set(key, r)
    return r
  }
}

const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, z: a.z + b.z * k })

function nearestS(path: Path, p: Pt) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < path.xs.length; i += 2) {
    const d = Math.hypot(path.xs[i] - p.x, path.zs[i] - p.z)
    if (d < bestD) {
      bestD = d
      best = i * 0.25
    }
  }
  return best
}

export interface Route {
  path: Path
  boxes: { s0: number; s1: number }[]
  /** Distances where cars stop at a shop. */
  carStops: number[]
  /** Per metre: 1 where yard speed applies. */
  slow: Uint8Array
}

function buildRoute(edges: Edge[]): Route {
  const pts: Pt[] = []
  const boxes: { s0: number; s1: number }[] = []
  const carStops: number[] = []
  const slowRanges: [number, number][] = []
  let offset = 0
  for (const e of edges) {
    for (let i = 0; i < e.path.xs.length; i++) {
      const p = { x: e.path.xs[i], z: e.path.zs[i] }
      const last = pts[pts.length - 1]
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-3) pts.push(p)
    }
    if (e.box) boxes.push({ s0: Math.max(0, offset - e.box.leadIn), s1: offset + e.path.length + e.box.tail })
    if (e.carStop !== undefined) carStops.push(offset + e.carStop)
    if (e.kind === 'yard') slowRanges.push([offset, offset + e.path.length])
    offset += e.path.length
  }
  const path = new Path(pts)
  const slow = new Uint8Array(Math.ceil(path.length) + 1)
  for (const [a, b] of slowRanges) for (let m = Math.floor(a); m <= Math.min(slow.length - 1, Math.ceil(b)); m++) slow[m] = 1
  boxes.sort((a, b) => a.s0 - b.s0)
  const merged: { s0: number; s1: number }[] = []
  for (const b of boxes) {
    const last = merged[merged.length - 1]
    if (last && b.s0 <= last.s1) last.s1 = Math.max(last.s1, b.s1)
    else merged.push({ ...b, s1: Math.min(b.s1, path.length) })
  }
  return { path, boxes: merged, carStops, slow }
}

/** Rear axle pose of a truck parked at a door. */
export function dockedPose(site: Site, dockNumber: number): Pose {
  const d = dockPosition(dockNumber)
  return { x: site.origin.x + d.x, z: site.origin.z + DOCK_WALL_Z + 2.55, heading: 0 }
}
