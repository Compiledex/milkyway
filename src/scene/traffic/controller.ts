import { YARD } from '../../data/layout'
import { createRng } from '../../data/rng'
import type { Customer, Dock, Id, Shipment, Site, Truck } from '../../data/types'
import { planWorld } from '../../data/world'
import { Path, type Pose, type Pt } from './geometry'
import { RoadNetwork, dockedPose, type Route, type ShopGeo } from './network'

// Traffic simulation for the 3D view. Trucks follow the warehouse data
// (where they should be and when), but how they get there is decided here,
// so they stay on the roads and never overlap.
//
// Collision avoidance: the world is a 2 m grid. Every vehicle owns the cells
// under it plus the cells it is about to drive into. Before entering a "box"
// (roundabout, gate, door manoeuvre, yard exit) a vehicle must reserve the
// whole box at once, so nobody ever stops inside a junction.

export type Kind = 'truck' | 'car'

const DIMS: Record<Kind, { back: number; front: number; half: number }> = {
  truck: { back: 2.6, front: 6.5, half: 1.35 },
  car: { back: 1.1, front: 3.6, half: 1.0 },
}
const ROAD_SPEED: Record<Kind, number> = { truck: 8.5, car: 11.5 }
const YARD_SPEED = 4.2
const REVERSE_SPEED = 1.5
const ACCEL = 2.2
const BRAKE = 3.4
/** Grid size: fine enough that vehicles in opposite lanes on a curve never share a cell. */
const CELL = 1
const CAR_COUNT = 26
/** Average on-screen speed used to time trips against the data's ETAs (m/s). */
const PLAN_SPEED = 6.2

interface Box {
  s0: number
  s1: number
  reserved: boolean
}

interface Stop {
  s: number
  dwell: number
  done: boolean
}

interface Leg {
  path: Path
  boxes: Box[]
  stops: Stop[]
  slow?: Uint8Array
  allSlow?: boolean
  /** Don't drive past this distance (only used before a trip has started). */
  capS?: number
  /** Data time when this trip should be finished; the truck eases off to roughly match it. */
  arriveBy?: number
  /** Pace to `arriveBy` right now (the data still says the truck is on this drive). */
  pacing?: boolean
  hideAtEnd?: boolean
  tag: 'arrive' | 'dock' | 'reverse' | 'deliver' | 'return' | 'leave' | 'drive'
  /** Reserve this leg and the next one together (forward then reverse into a door). */
  chainNext?: boolean
}

export class Agent {
  readonly id: string
  readonly kind: Kind
  legs: Leg[] = []
  s = 0
  v = 0
  pose: Pose = { x: 0, z: 0, heading: 0 }
  visible = true
  /** Signed metres moved last frame (for wheel spin). */
  moved = 0
  held = new Set<number>()
  waitTimer = 0
  /** Clock time when this vehicle started waiting for a box (first come, first served). */
  waitingSince?: number
  /** Cells of the box this vehicle is queuing for. */
  requested: number[] = []
  /** Currently driving through a box it has reserved (will clear it without stopping). */
  holdingBox = false
  // Trucks
  siteId?: Id
  place: 'init' | 'offmap' | 'hold' | 'docked' | 'shop' | 'moving' = 'init'
  dock?: number
  shop?: ShopGeo
  // Cars
  color = '#ffffff'
  node?: string
  constructor(id: string, kind: Kind) {
    this.id = id
    this.kind = kind
  }
}

export interface TrafficInput {
  sites: Site[]
  customers: Record<Id, Customer>
  trucks: Record<Id, Truck>
  docks: Record<Id, Dock>
  shipments: Record<Id, Shipment>
  time: number
}

const CAR_COLORS = ['#e5484d', '#f2f4f8', '#2f5bea', '#1f2430', '#9aa3b2', '#f5a524', '#3fae6a', '#8e5bd8', '#d9dde6', '#b3392e']
const AT_DOOR = ['docking', 'waiting', 'loading', 'unloading']

export class TrafficController {
  readonly network: RoadNetwork
  readonly agents: Agent[] = []
  private readonly byId = new Map<string, Agent>()
  private readonly owner = new Map<number, Agent>()
  /** Cells wanted by vehicles queuing for a box; earlier queuers get them first. */
  private readonly requests = new Map<number, Agent>()
  /** Per time step: can this queuing vehicle go right now? */
  private readonly readyCache = new Map<Agent, boolean>()
  private clock = 0
  private readonly footprints = new WeakMap<Path, Map<number, number[]>>()
  private readonly rng = createRng(99)
  private readonly sites: Site[]
  private simTime = 0
  private simWall = 0
  private simRate = 60

  constructor(sites: Site[]) {
    this.sites = sites
    this.network = new RoadNetwork(sites, planWorld(sites))
    for (let i = 0; i < CAR_COUNT; i++) this.spawnCar(i)
  }

  get cars() {
    return this.agents.filter((a) => a.kind === 'car')
  }

  truck(id: Id) {
    return this.byId.get(id)
  }

  /** Feed the latest data time so ETAs can be interpolated smoothly between ticks. */
  setTime(time: number) {
    const now = performance.now()
    if (this.simTime && time > this.simTime) {
      const rate = (time - this.simTime) / Math.max(1, now - this.simWall)
      this.simRate = this.simRate * 0.7 + rate * 0.3
    }
    if (time !== this.simTime) {
      this.simTime = time
      this.simWall = now
    }
  }

  private speed = 1

  /** Time speed from the UI: scales how fast data time is extrapolated between ticks (0 = paused). */
  setSpeed(speed: number) {
    if (speed === this.speed) return
    if (this.speed > 0 && speed > 0) this.simRate *= speed / this.speed
    else if (speed > 0) this.simRate = 60 * speed
    this.speed = speed
  }

  private simNow() {
    if (this.speed <= 0) return this.simTime
    return this.simTime + Math.min(4000 / this.speed, performance.now() - this.simWall) * this.simRate
  }

  // --- Frame update -------------------------------------------------------------

  /** Advance by `dt` seconds of on-screen time (already multiplied by the time speed). */
  update(dt: number, data: TrafficInput) {
    for (const truck of Object.values(data.trucks)) this.planTruck(truck, data)
    // Small fixed steps keep reservations exact even at 8× speed.
    let left = Math.min(dt, 0.6)
    while (left > 1e-6) {
      const step = Math.min(0.05, left)
      left -= step
      this.clock += step
      this.readyCache.clear()
      for (const a of this.agents) this.stepAgent(a, step)
    }
  }

  // --- Trucks: decide the next legs from the warehouse data --------------------------

  private shopFor(truck: Truck, data: TrafficInput): ShopGeo | undefined {
    const c = truck.customerId ? data.customers[truck.customerId] : undefined
    return c ? this.network.shopNear(c.location) : undefined
  }

  private planTruck(truck: Truck, data: TrafficInput) {
    let a = this.byId.get(truck.id)
    const site = this.sites.find((s) => s.id === truck.siteId)!
    if (!a) {
      a = new Agent(truck.id, 'truck')
      a.siteId = truck.siteId
      this.agents.push(a)
      this.byId.set(truck.id, a)
      this.placeInitially(a, truck, site, data)
    }
    const leg = a.legs[0]
    if (leg) {
      // Keep pace with the ETA only while the data still says the truck is on that drive.
      leg.pacing = (leg.tag === 'arrive' && truck.status === 'to-terminal') || (leg.tag === 'deliver' && truck.status === 'to-customer')
      if (leg.pacing && truck.eta) leg.arriveBy = truck.eta
      return
    }
    const dockNo = truck.dockId ? data.docks[truck.dockId]?.number : undefined
    const st = truck.status
    switch (a.place) {
      case 'offmap':
        if (st === 'to-terminal' || st === 'queued' || AT_DOOR.includes(st)) this.startArrival(a, truck, site, data, this.network.edgesIn.includes('ME:out') ? 'ME:out' : this.network.edgesIn[0])
        else if (st === 'to-customer' || st === 'at-customer') this.startDelivery(a, truck, site, data, null)
        break
      case 'shop':
        if (st !== 'to-customer' && st !== 'at-customer') this.startReturn(a, truck, site)
        break
      case 'hold':
        if (dockNo !== undefined && AT_DOOR.includes(st)) this.startDocking(a, site, dockNo)
        else if (st === 'away') this.startLeave(a, site, null)
        break
      case 'docked': {
        const stillHere = AT_DOOR.includes(st) && dockNo === a.dock
        if (stillHere) break
        if (truck.role === 'supplier' || st === 'away' || !truck.customerId) this.startLeave(a, site, a.dock ?? 1)
        else this.startDelivery(a, truck, site, data, a.dock ?? 1)
        break
      }
    }
  }

  private placeInitially(a: Agent, truck: Truck, site: Site, data: TrafficInput) {
    const dockNo = truck.dockId ? data.docks[truck.dockId]?.number : undefined
    if (dockNo !== undefined && (AT_DOOR.includes(truck.status) || truck.status === 'departing')) {
      a.place = 'docked'
      a.dock = dockNo
      a.pose = dockedPose(site, dockNo)
      return
    }
    if (truck.status === 'queued') {
      a.place = 'hold'
      a.pose = { ...this.network.nodes.get(`${site.id}:hold`)! }
      return
    }
    if (truck.status === 'at-customer') {
      const shop = this.shopFor(truck, data)
      const bay = shop ? this.network.nodes.get(shop.bayNode) : undefined
      if (shop && bay) {
        a.place = 'shop'
        a.shop = shop
        a.pose = { ...bay }
        return
      }
    }
    a.place = 'offmap'
    a.visible = false
  }

  /**
   * How far along a timed trip the truck may be by now so that it gets there
   * at `arriveBy`. The trip is assumed to take path length / PLAN_SPEED.
   */
  private timedCap(leg: Leg, arriveBy: number) {
    const left = this.trafficSecondsUntil(arriveBy)
    const travel = leg.path.length / PLAN_SPEED
    return left <= travel ? leg.path.length : 0
  }

  /** How many seconds of on-screen driving until a data time is reached. */
  private trafficSecondsUntil(time: number) {
    const dataMsPerTrafficSecond = this.speed > 0 ? (this.simRate * 1000) / this.speed : 60_000
    return (time - this.simNow()) / dataMsPerTrafficSecond
  }

  private legFromRoute(route: Route, tag: Leg['tag'], kind: Kind): Leg {
    return {
      path: route.path,
      boxes: route.boxes.map((b) => ({ ...b, reserved: false })),
      stops: kind === 'car' ? route.carStops.map((s) => ({ s, dwell: 4 + this.rng.next() * 8, done: false })) : [],
      slow: route.slow,
      tag,
    }
  }

  private begin(a: Agent, legs: Leg[], place: Agent['place'] = 'moving') {
    a.legs = legs
    a.s = 0
    a.place = place
  }

  /** Into the yard to the hold line, from a map edge or (returning) from a shop. */
  private startArrival(a: Agent, truck: Truck, site: Site, data: TrafficInput, spawn: string) {
    const shop = truck.role === 'distribution' ? this.shopFor(truck, data) : undefined
    const from = shop ? shop.bayNode : spawn
    const route = this.network.route(from, `${site.id}:hold`, 'truck')
    if (!route) return
    const leg = this.legFromRoute(route, 'arrive', 'truck')
    if (truck.status === 'to-terminal' && truck.eta) {
      if (this.timedCap(leg, truck.eta) <= 0) return // not time to set off yet
      leg.arriveBy = truck.eta
      leg.pacing = true
    }
    this.begin(a, [leg])
    a.pose = leg.path.poseAt(0)
  }

  private startReturn(a: Agent, truck: Truck, site: Site) {
    if (!a.shop) return
    const route = this.network.route(a.shop.bayNode, `${site.id}:hold`, 'truck')
    if (!route) return
    const leg = this.legFromRoute(route, 'return', 'truck')
    leg.tag = 'arrive'
    if (truck.status === 'to-terminal' && truck.eta) leg.arriveBy = truck.eta
    this.begin(a, [leg])
  }

  private startDocking(a: Agent, site: Site, dockNo: number) {
    const [forward, back] = this.network.dockManoeuvre(site, dockNo)
    this.begin(a, [
      { path: forward, boxes: [{ s0: 0, s1: forward.length, reserved: false }], stops: [], allSlow: true, tag: 'dock', chainNext: true },
      { path: back, boxes: [{ s0: 0, s1: back.length, reserved: false }], stops: [], allSlow: true, tag: 'reverse' },
    ])
    a.dock = dockNo
  }

  /**
   * Boxes for pulling out of a door: first the yard up to the gate, then
   * (separately) the turn onto the road. A truck waits at the gate for a gap
   * in traffic instead of holding the whole road while still at the door.
   */
  private departureBoxes(site: Site, out: Path): Box[] {
    const gateZ = site.origin.z + YARD.maxZ - 1.5
    let gate = out.length
    for (let i = 0; i < out.zs.length; i++) {
      if (out.zs[i] > gateZ) {
        gate = i * 0.25
        break
      }
    }
    return [
      { s0: 0, s1: Math.max(1, gate - DIMS.truck.front - 0.5), reserved: false },
      { s0: gate, s1: out.length + 12, reserved: false },
    ]
  }

  /** Out of the door (or from the gate) to the shop's goods-in bay. */
  private startDelivery(a: Agent, truck: Truck, site: Site, data: TrafficInput, dockNo: number | null) {
    const shop = this.shopFor(truck, data)
    if (!shop) return this.startLeave(a, site, dockNo)
    const toShop = this.network.route(`${site.id}:join`, shop.bayNode, 'truck')
    if (!toShop) return
    const parts = dockNo !== null ? [this.network.departure(site, dockNo), toShop.path] : [toShop.path]
    const { path, offsets } = concat(parts)
    const o = offsets[parts.length - 1]
    const boxes: Box[] = [
      ...(dockNo !== null ? this.departureBoxes(site, parts[0]) : []),
      ...toShop.boxes.map((b) => ({ s0: b.s0 + o, s1: b.s1 + o, reserved: false })),
    ]
    const slow = new Uint8Array(Math.ceil(path.length) + 1)
    if (dockNo !== null) for (let m = 0; m <= Math.ceil(parts[0].length); m++) slow[m] = 1
    toShop.slow.forEach((v, m) => v && (slow[Math.min(slow.length - 1, m + Math.floor(o))] = 1))
    const leg: Leg = { path, boxes: mergeBoxes(boxes), stops: [], slow, tag: 'deliver' }
    if (truck.status === 'to-customer' && truck.eta) {
      leg.arriveBy = truck.eta
      leg.pacing = true
    }
    a.shop = shop
    this.begin(a, [leg])
    if (dockNo === null) a.pose = path.poseAt(0)
  }

  /** Off the map (supplier trucks), from a door or the hold line. */
  private startLeave(a: Agent, site: Site, dockNo: number | null) {
    const exit = this.network.edgesOut.includes('ME:in') ? 'ME:in' : this.network.edgesOut[0]
    const away = this.network.route(`${site.id}:join`, exit, 'truck')
    if (!away) return
    const parts = dockNo !== null ? [this.network.departure(site, dockNo), away.path] : [away.path]
    const { path, offsets } = concat(parts)
    const o = offsets[parts.length - 1]
    const boxes: Box[] = [
      ...(dockNo !== null ? this.departureBoxes(site, parts[0]) : []),
      ...away.boxes.map((b) => ({ s0: b.s0 + o, s1: b.s1 + o, reserved: false })),
    ]
    const slow = new Uint8Array(Math.ceil(path.length) + 1)
    if (dockNo !== null) for (let m = 0; m <= Math.ceil(parts[0].length); m++) slow[m] = 1
    this.begin(a, [{ path, boxes: mergeBoxes(boxes), stops: [], slow, hideAtEnd: true, tag: 'leave' }])
  }

  private finishLeg(a: Agent, leg: Leg) {
    a.waitingSince = undefined
    a.requested = []
    a.legs.shift()
    a.s = 0
    if (leg.hideAtEnd) {
      a.visible = false
      this.releaseAll(a)
    }
    if (a.kind === 'truck') {
      if (leg.tag === 'arrive') a.place = 'hold'
      else if (leg.tag === 'reverse') a.place = 'docked'
      else if (leg.tag === 'deliver') a.place = 'shop'
      else if (leg.tag === 'leave') {
        a.place = 'offmap'
        a.dock = undefined
      }
    } else {
      a.visible = false
      a.waitTimer = 1 + this.rng.next() * 6
      this.releaseAll(a)
    }
  }

  // --- Cars ----------------------------------------------------------------------

  private spawnCar(i: number) {
    const a = new Agent(`car-${i}`, 'car')
    a.color = CAR_COLORS[i % CAR_COLORS.length]
    this.agents.push(a)
    // Start somewhere along a random trip so the town is busy from the first frame.
    for (let attempt = 0; attempt < 14; attempt++) {
      const trip = this.carTrip(this.rng.pick(this.network.edgesIn))
      if (!trip) continue
      const { leg, to } = trip
      const s = this.rng.next() * leg.path.length * 0.85
      if (leg.boxes.some((b) => s > b.s0 - 8 && s < b.s1 + 2)) continue
      if (leg.stops.some((st) => Math.abs(st.s - s) < 10)) continue
      const cells = this.footprintCells(leg.path, s, 'car')
      if (cells.some((c) => this.owner.has(c))) continue
      a.legs = [leg]
      a.s = s
      a.v = 6
      a.node = to
      a.pose = leg.path.poseAt(s)
      leg.stops.forEach((st) => (st.done = st.s < s))
      for (const c of cells) this.claim(a, c)
      return
    }
    a.visible = false
    a.waitTimer = 1 + this.rng.next() * 5
  }

  /**
   * A car trip from a map edge: either straight to another edge, or via a
   * shop (stop, then drive on). Ending only at map edges means no car ever
   * parks at a roundabout entry.
   */
  private carTrip(from: string): { leg: Leg; to: string } | null {
    const edges = this.network.edgesOut.filter((n) => n.split(':')[0] !== from.split(':')[0])
    const to = this.rng.pick(edges)
    if (this.rng.chance(0.6)) {
      const shop = this.rng.pick(this.network.shops)
      const r1 = this.network.route(from, shop.armIn, 'car')
      const r2 = this.network.route(shop.armIn, to, 'car')
      if (r1 && r2) {
        const { path, offsets } = concat([r1.path, r2.path])
        const boxes = mergeBoxes([
          ...r1.boxes.map((b) => ({ ...b, reserved: false })),
          ...r2.boxes.map((b) => ({ s0: b.s0 + offsets[1], s1: b.s1 + offsets[1], reserved: false })),
        ])
        const slow = new Uint8Array(Math.ceil(path.length) + 1)
        r1.slow.forEach((v, m) => v && (slow[Math.min(slow.length - 1, m)] = 1))
        const stops = r1.carStops.map((s) => ({ s, dwell: 4 + this.rng.next() * 8, done: false }))
        return { leg: { path, boxes, stops, slow, hideAtEnd: true, tag: 'drive' }, to }
      }
    }
    const route = this.network.route(from, to, 'car')
    if (!route) return null
    const leg = this.legFromRoute(route, 'drive', 'car')
    leg.hideAtEnd = true
    return { leg, to }
  }

  private respawnCar(a: Agent) {
    const trip = this.carTrip(this.rng.pick(this.network.edgesIn))
    if (!trip) return
    const cells = this.footprintCells(trip.leg.path, 0, 'car')
    if (cells.some((c) => this.owner.get(c) && this.owner.get(c) !== a)) {
      a.waitTimer = 1
      return
    }
    a.legs = [trip.leg]
    a.node = trip.to
    a.s = 0
    a.v = ROAD_SPEED.car * 0.6
    a.pose = trip.leg.path.poseAt(0)
    a.visible = true
  }

  // --- Motion with reservations --------------------------------------------------------

  private stepAgent(a: Agent, dt: number) {
    a.moved = 0
    const leg = a.legs[0]
    if (!leg) {
      a.v = 0
      if (!a.visible) {
        this.releaseAll(a)
        if (a.kind === 'car') {
          a.waitTimer -= dt
          if (a.waitTimer <= 0) this.respawnCar(a)
        }
        return
      }
      // Parked: hold exactly what we stand on.
      this.keepOnly(a, this.poseCells(a.pose, a.kind))
      return
    }

    const path = leg.path
    const needed = new Set(this.footprintCells(path, a.s, a.kind))
    let limit = Math.min(path.length, leg.capS ?? Infinity)

    // Dwell at a stop (unloading at a shop, dropping off).
    const stop = leg.stops.find((st) => !st.done)
    if (stop) {
      if (a.s >= stop.s - 0.05 && a.v < 0.15) {
        a.waitTimer += dt
        if (a.waitTimer >= stop.dwell) {
          stop.done = true
          a.waitTimer = 0
        }
        limit = Math.min(limit, stop.s)
      } else {
        limit = Math.min(limit, stop.s)
      }
    }

    // Boxes: reserve the whole stretch before entering, keep it until we're through.
    a.holdingBox = false
    for (let i = 0; i < leg.boxes.length; i++) {
      const box = leg.boxes[i]
      if (box.s1 <= a.s) continue
      if (!box.reserved) {
        // The front of the vehicle must stay out of the box until it is ours.
        const front = DIMS[a.kind].front
        // Only take a box we're allowed to drive all the way through (never stop inside one).
        if (Math.min(path.length, leg.capS ?? Infinity) < box.s1 - 0.01 && box.s1 < path.length) {
          limit = Math.min(limit, Math.max(a.s, box.s0 - front - 0.4))
          break
        }
        const lookahead = (a.v * a.v) / (2 * BRAKE) + 3 + front
        if (a.s + lookahead < box.s0) break
        const cells = this.sweep(path, Math.max(a.s, box.s0), box.s1, a.kind)
        const next = leg.chainNext && i === leg.boxes.length - 1 ? a.legs[1] : undefined
        if (next) for (const c of this.sweep(next.path, 0, next.path.length, a.kind)) cells.push(c)
        const mySince = a.waitingSince ?? this.clock
        const queuedAhead = (c: number) => {
          const r = this.requests.get(c)
          if (!r || r === a) return false
          if (r.waitingSince === undefined) {
            this.requests.delete(c)
            return false
          }
          // Only give way to an earlier queuer that could go right now; yielding to
          // someone who is itself blocked could make us wait on each other forever.
          if (r.waitingSince >= mySince) return false
          let ready = this.readyCache.get(r)
          if (ready === undefined) {
            // Ready = everything in the way is free or is someone already driving through.
            ready = r.requested.every((x) => {
              const o = this.owner.get(x)
              return !o || o === r || (o.holdingBox && o.waitingSince === undefined)
            })
            this.readyCache.set(r, ready)
          }
          return ready
        }
        if (cells.every((c) => (!this.owner.has(c) || this.owner.get(c) === a) && !queuedAhead(c))) {
          box.reserved = true
          if (next) next.boxes.forEach((b) => (b.reserved = true))
          for (const c of cells) if (this.requests.get(c) === a) this.requests.delete(c)
          a.waitingSince = undefined
          a.requested = []
        } else {
          // Queue for the box so later arrivals can't keep taking it first.
          if (a.waitingSince === undefined && a.s + 0.5 >= box.s0 - front - 0.4) a.waitingSince = this.clock
          if (a.waitingSince !== undefined) {
            a.requested = cells
            for (const c of cells) {
              const r = this.requests.get(c)
              if (!r || r.waitingSince === undefined || r.waitingSince > a.waitingSince) this.requests.set(c, a)
            }
          }
          limit = Math.min(limit, Math.max(a.s, box.s0 - front - 0.4))
          break
        }
      }
      if (box.reserved) {
        a.holdingBox = true
        for (const c of this.sweep(path, Math.max(a.s, box.s0), box.s1, a.kind)) needed.add(c)
        if (leg.chainNext && i === leg.boxes.length - 1 && a.legs[1]) {
          for (const c of this.sweep(a.legs[1].path, 0, a.legs[1].path.length, a.kind)) needed.add(c)
        }
      }
      break
    }

    // Rolling look-ahead outside boxes: stop behind whoever is in front.
    const look = (a.v * a.v) / (2 * BRAKE) + 2.5
    for (let d = 0.5; d <= Math.ceil(look); d += 0.5) {
      const st = Math.floor(a.s * 2) / 2 + d
      if (st > limit) break
      const cells = this.footprintCells(path, Math.min(st, path.length), a.kind)
      const blocked = cells.some((c) => {
        const o = this.owner.get(c)
        return o !== undefined && o !== a
      })
      if (blocked) {
        limit = Math.min(limit, Math.max(a.s, st - 1.3))
        break
      }
      for (const c of cells) needed.add(c)
    }

    // Speed: road or yard limit, curves, and stopping before the limit.
    const slow = leg.allSlow || (leg.slow?.[Math.floor(a.s)] ?? 0) === 1
    let vmax = path.reverse ? REVERSE_SPEED : slow ? YARD_SPEED : ROAD_SPEED[a.kind]
    if (leg.pacing && leg.arriveBy !== undefined && !slow) {
      // Ease off to arrive around the ETA, but never crawl or stop on the road.
      const left = Math.max(1, this.trafficSecondsUntil(leg.arriveBy))
      vmax = Math.min(vmax, Math.max(ROAD_SPEED[a.kind] * 0.45, (path.length - a.s) / left))
    }
    const vCurve = path.speedLimitAhead(a.s, look + 6, BRAKE)
    const vStop = Math.sqrt(2 * BRAKE * Math.max(0, limit - a.s - 0.05))
    const target = Math.min(vmax, vCurve, vStop)
    const dv = target - a.v
    a.v = Math.max(0, a.v + Math.max(-BRAKE * 1.6 * dt, Math.min(ACCEL * dt, dv)))
    const before = a.s
    a.s = Math.min(limit < a.s ? a.s : limit, a.s + a.v * dt)
    a.moved = (a.s - before) * (path.reverse ? -1 : 1)
    a.pose = path.poseAt(a.s)
    if (!a.visible && a.kind === 'truck' && a.s > 0.5) a.visible = true

    this.keepOnly(a, needed)

    if (a.s >= path.length - 0.05 && a.v < 0.4 && !leg.stops.some((st) => !st.done)) this.finishLeg(a, leg)
  }

  /** Dev: who is in this vehicle's way (box owners or the vehicle ahead). */
  debugBlock(id: string) {
    const a = this.agents.find((x) => x.id === id)
    const leg = a?.legs[0]
    if (!a || !leg) return 'no leg'
    const owners = (cells: number[]) => [...new Set(cells.map((c) => this.owner.get(c)).filter((o) => o && o !== a).map((o) => o!.id))]
    const box = leg.boxes.find((b) => b.s1 > a.s)
    const boxInfo = box ? `box ${box.s0.toFixed(0)}-${box.s1.toFixed(0)} reserved=${box.reserved} owners=${owners(this.sweep(leg.path, Math.max(a.s, box.s0), box.s1, a.kind)).join(',')}` : 'no box'
    const ahead = owners(this.footprintCells(leg.path, Math.min(leg.path.length, a.s + 2), a.kind))
    const queued = box ? [...new Set(this.sweep(leg.path, Math.max(a.s, box.s0), box.s1, a.kind).map((c) => this.requests.get(c)).filter((r) => r && r !== a).map((r) => r!.id))] : []
    return `s=${a.s.toFixed(1)} cap=${leg.capS?.toFixed(1)} ${boxInfo} ahead=${ahead.join(',')} queuedAhead=${queued.join(',')}`
  }

  /** Dev check: pairs of visible vehicles whose bodies overlap (should always be empty). */
  overlaps(): string[] {
    const vis = this.agents.filter((a) => a.visible)
    const boxes = vis.map((a) => obb(a.pose, DIMS[a.kind]))
    const out: string[] = []
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        if (Math.hypot(vis[i].pose.x - vis[j].pose.x, vis[i].pose.z - vis[j].pose.z) > 14) continue
        if (obbOverlap(boxes[i], boxes[j])) out.push(`${vis[i].id}×${vis[j].id}@${vis[i].pose.x.toFixed(0)},${vis[i].pose.z.toFixed(0)}`)
      }
    }
    return out
  }

  // --- Grid -------------------------------------------------------------------------------

  private cellKey(x: number, z: number) {
    return Math.floor((x + 600) / CELL) * 4096 + Math.floor((z + 600) / CELL)
  }

  private poseCells(p: Pose, kind: Kind): number[] {
    const d = DIMS[kind]
    const fx = Math.sin(p.heading)
    const fz = Math.cos(p.heading)
    const out = new Set<number>()
    for (let u = -d.back; u <= d.front + 1e-6; u += 0.8) {
      for (let v = -d.half; v <= d.half + 1e-6; v += 0.54) {
        out.add(this.cellKey(p.x + fx * u - fz * v, p.z + fz * u + fx * v))
      }
    }
    return [...out]
  }

  private footprintCells(path: Path, s: number, kind: Kind): number[] {
    let cache = this.footprints.get(path)
    if (!cache) {
      cache = new Map()
      this.footprints.set(path, cache)
    }
    const key = Math.round(Math.max(0, Math.min(path.length, s)) * 2) * 2 + (kind === 'truck' ? 0 : 1)
    let cells = cache.get(key)
    if (!cells) {
      cells = this.poseCells(path.poseAt(key >> 1 ? (key >> 1) / 2 : 0), kind)
      cache.set(key, cells)
    }
    return cells
  }

  /**
   * Every cell the vehicle covers between s0 and s1. Sampled on a fixed 0.5 m
   * grid along the path (not relative to s0), so the set doesn't flicker at its
   * edges from frame to frame and let someone else slip in.
   */
  private sweep(path: Path, s0: number, s1: number, kind: Kind): number[] {
    const out = new Set<number>()
    for (const c of this.footprintCells(path, s0, kind)) out.add(c)
    for (let s = Math.ceil(s0 * 2) / 2; s < s1; s += 0.5) for (const c of this.footprintCells(path, s, kind)) out.add(c)
    for (const c of this.footprintCells(path, Math.min(s1, path.length), kind)) out.add(c)
    return [...out]
  }

  private claim(a: Agent, c: number) {
    if (this.owner.has(c) && this.owner.get(c) !== a) return
    this.owner.set(c, a)
    a.held.add(c)
  }

  private keepOnly(a: Agent, needed: Iterable<number>) {
    const want = needed instanceof Set ? needed : new Set(needed)
    for (const c of a.held) {
      if (!want.has(c)) {
        a.held.delete(c)
        if (this.owner.get(c) === a) this.owner.delete(c)
      }
    }
    for (const c of want) this.claim(a, c)
  }

  private releaseAll(a: Agent) {
    for (const c of a.held) if (this.owner.get(c) === a) this.owner.delete(c)
    a.held.clear()
  }
}

function concat(paths: Path[]): { path: Path; offsets: number[] } {
  const pts: Pt[] = []
  const offsets: number[] = []
  let total = 0
  for (const p of paths) {
    offsets.push(total)
    for (let i = 0; i < p.xs.length; i++) {
      const q = { x: p.xs[i], z: p.zs[i] }
      const last = pts[pts.length - 1]
      if (!last || Math.hypot(q.x - last.x, q.z - last.z) > 1e-3) pts.push(q)
    }
    total += p.length
  }
  return { path: new Path(pts), offsets }
}

function mergeBoxes(boxes: Box[]): Box[] {
  const sorted = [...boxes].sort((a, b) => a.s0 - b.s0)
  const out: Box[] = []
  for (const b of sorted) {
    const last = out[out.length - 1]
    if (last && b.s0 <= last.s1) last.s1 = Math.max(last.s1, b.s1)
    else out.push({ ...b })
  }
  return out
}

/** Oriented body rectangle, slightly shrunk so touching bumpers don't count. */
function obb(p: Pose, d: { back: number; front: number; half: number }) {
  const fx = Math.sin(p.heading)
  const fz = Math.cos(p.heading)
  const c = (d.front - d.back) / 2
  return { cx: p.x + fx * c, cz: p.z + fz * c, fx, fz, hl: (d.front + d.back) / 2 - 0.5, hw: d.half - 0.3 }
}

function obbOverlap(a: ReturnType<typeof obb>, b: ReturnType<typeof obb>) {
  const axes = [
    [a.fx, a.fz],
    [-a.fz, a.fx],
    [b.fx, b.fz],
    [-b.fz, b.fx],
  ]
  const dx = b.cx - a.cx
  const dz = b.cz - a.cz
  for (const [ax, az] of axes) {
    const ra = a.hl * Math.abs(a.fx * ax + a.fz * az) + a.hw * Math.abs(-a.fz * ax + a.fx * az)
    const rb = b.hl * Math.abs(b.fx * ax + b.fz * az) + b.hw * Math.abs(-b.fz * ax + b.fx * az)
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false
  }
  return true
}
