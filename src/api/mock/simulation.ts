import { chargerPosition, dockStagingPoint, pickPoint, planRoute } from '../../data/layout'
import type { SeedProfile } from '../../data/profiles/profile'
import { MINUTE } from '../../data/rules'
import type { Rng } from '../../data/rng'
import { orderLines, replenishLines } from '../../data/seed'
import type { Customer, Dock, Forklift, Id, InventoryItem, Shipment, Truck, Vec2, WarehouseSnapshot } from '../../data/types'

// One simulation step of the test data (2 minutes of warehouse time).
//
// Shop orders:   received → picking (forklifts bring pallets to a door) → picked
//                → loading (truck at that door) → in-transit → at-customer → delivered
// Trucks:        to-terminal → queued → docking → waiting/loading → departing
//                → to-customer → at-customer → to-terminal …
// Supplier:      away → to-terminal → queued → docking → unloading → departing → away
//                (pallets are then put away by forklifts → stored)
//
// Pure: snapshot in, snapshot out. Unchanged entities keep their identity.

export const SIM_STEP_MS = 2 * MINUTE
const FORKLIFT_METRES_PER_STEP = 5
const MAX_CLOSED = 36
const MAX_OPEN_ORDERS = 6

type Entity = { id: Id; lastUpdate: number }

class Table<T extends Entity> {
  private readonly rows: Map<Id, T>
  private readonly added: Id[] = []
  private readonly removed = new Set<Id>()
  private readonly original: T[]
  private readonly now: number
  constructor(list: T[], now: number) {
    this.original = list
    this.rows = new Map(list.map((r) => [r.id, r]))
    this.now = now
  }
  get(id: Id | null | undefined): T | undefined {
    return id ? this.rows.get(id) : undefined
  }
  all(): T[] {
    return [...this.rows.values()]
  }
  patch(id: Id, changes: Partial<T>): T {
    const next = { ...this.rows.get(id)!, ...changes, lastUpdate: this.now }
    this.rows.set(id, next)
    return next
  }
  add(row: T) {
    this.rows.set(row.id, row)
    this.added.push(row.id)
  }
  remove(id: Id) {
    this.rows.delete(id)
    this.removed.add(id)
  }
  toList(): T[] {
    const keep = (id: Id) => !this.removed.has(id)
    return [...this.original.map((r) => r.id), ...this.added].filter(keep).map((id) => this.rows.get(id)!)
  }
}

const OPEN_AT_DOOR = ['picking', 'picked', 'loading', 'arrived', 'unloading']

export function simulate(prev: WarehouseSnapshot, rng: Rng, profile: SeedProfile): WarehouseSnapshot {
  const now = prev.time + SIM_STEP_MS
  const docks = new Table<Dock>(prev.docks, now)
  const trucks = new Table<Truck>(prev.trucks, now)
  const forklifts = new Table<Forklift>(prev.forklifts, now)
  const inventory = new Table<InventoryItem>(prev.inventory, now)
  const shipments = new Table<Shipment>(prev.shipments, now)
  const customers = new Map<Id, Customer>(prev.customers.map((c) => [c.id, c]))
  const m = (minutes: number) => Math.round(minutes * MINUTE)
  const nextNo = (prefix: string) =>
    Math.max(0, ...shipments.all().filter((s) => s.id.startsWith(prefix)).map((s) => Number(s.id.replace(/\D/g, '')) || 0)) + 1

  for (const site of prev.sites) {
    const siteDocks = () => docks.all().filter((d) => d.siteId === site.id)
    const siteItems = () => inventory.all().filter((i) => i.siteId === site.id)
    const siteShipments = () => shipments.all().filter((s) => s.siteId === site.id)
    const dockNo = (id: Id | null) => docks.get(id)?.number
    // A door is "staged" while an order is being picked to it or goods are waiting there.
    const stagedAt = (d: Dock) =>
      siteShipments().some((s) => s.dockId === d.id && (OPEN_AT_DOOR.includes(s.status) || (s.direction === 'inbound' && s.palletsDone < s.palletsStaged)))
    const freeDock = () => siteDocks().find((d) => d.status === 'free' && !d.truckId && !stagedAt(d))

    // --- Shops place orders ------------------------------------------------------------
    const open = siteShipments().filter((s) => s.direction === 'outbound' && s.status !== 'delivered').length
    if (open < MAX_OPEN_ORDERS && rng.chance(0.09) && customers.size) {
      const c = rng.pick([...customers.values()])
      const no = nextNo('ord-')
      shipments.add({
        id: `ord-${no}`,
        reference: `ORD-${no}`,
        direction: 'outbound',
        siteId: site.id,
        customerId: c.id,
        supplier: null,
        truckId: null,
        dockId: null,
        lines: orderLines(siteItems(), rng),
        pallets: rng.int(3, 7),
        palletsStaged: 0,
        palletsDone: 0,
        scheduledAt: now + m(rng.int(110, 220)),
        eta: null,
        status: 'received',
        events: { created: now },
        lastUpdate: now,
      })
    }

    // --- Picking starts when a door is free to stage at --------------------------------------
    const pickingNow = siteShipments().filter((s) => s.status === 'picking').length
    const next = siteShipments()
      .filter((s) => s.status === 'received')
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0]
    if (next && pickingNow < 2) {
      // Prefer a door where an empty truck is already waiting.
      const waitingTruck = trucks.all().find((t) => t.siteId === site.id && t.status === 'waiting' && !t.shipmentId && t.dockId)
      const dock = waitingTruck ? docks.get(waitingTruck.dockId)! : freeDock()
      if (dock && !stagedAt(dock)) {
        shipments.patch(next.id, { status: 'picking', dockId: dock.id, events: { ...next.events, pickingStarted: now } })
        if (waitingTruck) {
          trucks.patch(waitingTruck.id, { shipmentId: next.id, customerId: next.customerId })
          shipments.patch(next.id, { truckId: waitingTruck.id })
        }
      }
    }

    // --- Supplier trucks set off ----------------------------------------------------------
    for (const tr of trucks.all().filter((t) => t.siteId === site.id && t.role === 'supplier' && t.status === 'away')) {
      if (tr.eta !== null && now < tr.eta) continue
      const no = nextNo('inn-')
      const travel = rng.int(35, 60)
      const sh: Shipment = {
        id: `inn-${no}`,
        reference: `INN-${no}`,
        direction: 'inbound',
        siteId: site.id,
        customerId: null,
        supplier: rng.pick(profile.suppliers),
        truckId: tr.id,
        dockId: null,
        lines: replenishLines(siteItems(), rng),
        pallets: rng.int(3, 6),
        palletsStaged: 0,
        palletsDone: 0,
        scheduledAt: now + m(travel),
        eta: now + m(travel + rng.int(-4, 10)),
        status: 'in-transit',
        events: { created: now, departed: now },
        lastUpdate: now,
      }
      shipments.add(sh)
      trucks.patch(tr.id, { status: 'to-terminal', shipmentId: sh.id, eta: sh.eta, customerId: null })
    }

    // --- Trucks ------------------------------------------------------------------------------
    for (const truck of trucks.all().filter((t) => t.siteId === site.id)) {
      const tr = trucks.get(truck.id)!
      const sh = shipments.get(tr.shipmentId)
      switch (tr.status) {
        case 'to-terminal':
        case 'to-customer': {
          if (rng.chance(0.03) && tr.eta) {
            const eta = tr.eta + m(rng.int(4, 12))
            trucks.patch(tr.id, { eta })
            if (sh && sh.status === 'in-transit') shipments.patch(sh.id, { eta })
            break
          }
          if (tr.eta !== null && now < tr.eta) break
          if (tr.status === 'to-terminal') {
            trucks.patch(tr.id, { status: 'queued', eta: null })
            if (sh && sh.direction === 'inbound') shipments.patch(sh.id, { status: 'arrived', eta: null, events: { ...sh.events, arrived: now } })
          } else {
            trucks.patch(tr.id, { status: 'at-customer', eta: now + m(rng.int(10, 18)) })
            if (sh) shipments.patch(sh.id, { status: 'at-customer', events: { ...sh.events, arrived: now } })
          }
          break
        }
        case 'at-customer': {
          if (tr.eta !== null && now < tr.eta) break
          if (sh) shipments.patch(sh.id, { status: 'delivered', events: { ...sh.events, delivered: now } })
          const c = customers.get(tr.customerId ?? '')
          const back = c ? c.travelMinutes[site.id] : 40
          trucks.patch(tr.id, { status: 'to-terminal', shipmentId: null, eta: now + m(back + rng.int(-3, 6)) })
          break
        }
        case 'queued': {
          // Our order's door, else a door with an order and no truck, else any free door.
          let order = sh?.direction === 'outbound' ? sh : undefined
          let dock = order?.dockId ? docks.get(order.dockId) : undefined
          if (!order && tr.role === 'distribution') {
            order = siteShipments().find((s) => s.direction === 'outbound' && ['picking', 'picked'].includes(s.status) && !s.truckId)
            dock = order ? docks.get(order.dockId) : undefined
          }
          if (!dock) dock = freeDock()
          if (!dock || dock.truckId || dock.status === 'maintenance') break
          docks.patch(dock.id, { status: 'occupied', truckId: tr.id })
          trucks.patch(tr.id, { status: 'docking', dockId: dock.id, shipmentId: order?.id ?? tr.shipmentId, customerId: order?.customerId ?? tr.customerId })
          if (order) shipments.patch(order.id, { truckId: tr.id })
          if (sh?.direction === 'inbound') shipments.patch(sh.id, { dockId: dock.id })
          break
        }
        case 'docking': {
          if (!rng.chance(0.6)) break
          if (sh?.direction === 'inbound') {
            trucks.patch(tr.id, { status: 'unloading' })
            shipments.patch(sh.id, { status: 'unloading', events: { ...sh.events, unloadingStarted: now } })
          } else {
            trucks.patch(tr.id, { status: 'waiting' })
          }
          break
        }
        case 'waiting':
        case 'loading': {
          if (!sh) break
          if (sh.palletsDone < sh.palletsStaged) {
            if (rng.chance(0.55)) {
              shipments.patch(sh.id, { status: 'loading', palletsDone: sh.palletsDone + 1, events: { ...sh.events, loadingStarted: sh.events.loadingStarted ?? now } })
              trucks.patch(tr.id, { status: 'loading' })
            }
          } else if (sh.palletsDone >= sh.pallets) {
            shipments.patch(sh.id, { events: { ...sh.events, loaded: now } })
            trucks.patch(tr.id, { status: 'departing' })
          }
          break
        }
        case 'unloading': {
          if (!sh) break
          if (sh.palletsStaged < sh.pallets) {
            if (rng.chance(0.5)) shipments.patch(sh.id, { palletsStaged: sh.palletsStaged + 1 })
          } else {
            shipments.patch(sh.id, { events: { ...sh.events, unloaded: now } })
            trucks.patch(tr.id, { status: 'departing' })
          }
          break
        }
        case 'departing': {
          if (!rng.chance(0.6)) break
          const dock = docks.get(tr.dockId)
          if (dock) docks.patch(dock.id, { status: 'free', truckId: null })
          if (tr.role === 'supplier') {
            trucks.patch(tr.id, { status: 'away', dockId: null, shipmentId: null, eta: now + m(rng.int(70, 150)) })
          } else if (sh) {
            const c = customers.get(sh.customerId ?? '')
            const eta = now + m((c ? c.travelMinutes[site.id] : 40) + rng.int(-3, 5))
            shipments.patch(sh.id, { status: 'in-transit', eta, events: { ...sh.events, departed: now } })
            trucks.patch(tr.id, { status: 'to-customer', dockId: null, eta })
          }
          break
        }
      }
    }

    // --- Shipment milestones driven by pallet counts ------------------------------------------
    for (const sh of siteShipments()) {
      // Loading can start before picking ends, so the picked time is set whatever the status.
      if (sh.direction === 'outbound' && !sh.events.picked && sh.events.pickingStarted && sh.palletsStaged >= sh.pallets) {
        shipments.patch(sh.id, { ...(sh.status === 'picking' ? { status: 'picked' as const } : {}), events: { ...sh.events, picked: now } })
      }
      if (sh.direction === 'inbound' && sh.events.unloaded && sh.palletsDone >= sh.pallets && sh.status !== 'stored') {
        shipments.patch(sh.id, { status: 'stored', events: { ...sh.events, stored: now } })
      }
    }

    // --- Forklifts: picking to doors, putting deliveries away, charging ----------------------
    const inFlight = (shipmentId: Id) => forklifts.all().filter((f) => f.task?.shipmentId === shipmentId).length
    const siteForklifts = forklifts.all().filter((f) => f.siteId === site.id)
    for (const f0 of siteForklifts) {
      const fl = forklifts.get(f0.id)!
      switch (fl.status) {
        case 'charging': {
          const battery = Math.min(100, fl.battery + 7)
          forklifts.patch(fl.id, battery >= 95 ? { battery, status: 'idle' } : { battery })
          break
        }
        case 'idle': {
          const slot = siteForklifts.findIndex((f) => f.id === fl.id)
          if (fl.battery < 20) {
            forklifts.patch(fl.id, { status: 'moving', route: planRoute(fl.position, chargerPosition(slot)), task: null })
            break
          }
          const pickFor = siteShipments().find((s) => s.status === 'picking' && s.palletsStaged + inFlight(s.id) < s.pallets)
          const putFor = siteShipments().find((s) => s.direction === 'inbound' && s.dockId && s.palletsDone + inFlight(s.id) < s.palletsStaged)
          const job = pickFor && (!putFor || rng.chance(0.6)) ? pickFor : putFor
          if (!job || !job.dockId) break
          const door = dockNo(job.dockId)!
          const line = job.lines[(job.palletsStaged + job.palletsDone + inFlight(job.id)) % job.lines.length]
          const item = inventory.get(line.itemId)
          if (!item) break
          const kind = job === pickFor ? 'pick' : 'putaway'
          const target = kind === 'pick' ? pickPoint(item.location) : dockStagingPoint(door)
          forklifts.patch(fl.id, {
            status: 'moving',
            route: planRoute(fl.position, target),
            task: { kind, shipmentId: job.id, itemId: item.id, dockNumber: door, phase: 'to-pickup' },
          })
          break
        }
        case 'moving': {
          const { position, route } = advance(fl.position, fl.route, FORKLIFT_METRES_PER_STEP)
          const battery = Math.max(0, fl.battery - 0.7)
          if (route.length > 0) forklifts.patch(fl.id, { position, route, battery })
          else if (fl.task) forklifts.patch(fl.id, { position, route, battery, status: 'lifting', task: { ...fl.task, phase: fl.task.phase === 'to-pickup' ? 'lift' : 'drop' } })
          else forklifts.patch(fl.id, { position, route, battery, status: fl.battery < 25 ? 'charging' : 'idle' })
          break
        }
        case 'lifting': {
          const task = fl.task
          if (!task) {
            forklifts.patch(fl.id, { status: 'idle' })
            break
          }
          const job = shipments.get(task.shipmentId)
          const item = inventory.get(task.itemId)
          if (task.phase === 'lift') {
            const drop = task.kind === 'pick' ? dockStagingPoint(task.dockNumber) : item ? pickPoint(item.location) : fl.position
            forklifts.patch(fl.id, { status: 'moving', carrying: true, route: planRoute(fl.position, drop), task: { ...task, phase: 'to-drop' }, battery: fl.battery - 1 })
            break
          }
          if (job && item) {
            const line = job.lines.find((l) => l.itemId === item.id)
            const share = Math.max(1, Math.round((line?.quantity ?? 10) / Math.max(1, job.pallets / job.lines.length)))
            if (task.kind === 'pick') {
              inventory.patch(item.id, { quantity: Math.max(0, item.quantity - share) })
              shipments.patch(job.id, { palletsStaged: Math.min(job.pallets, job.palletsStaged + 1) })
            } else {
              inventory.patch(item.id, { quantity: Math.min(item.capacity, item.quantity + share) })
              shipments.patch(job.id, { palletsDone: Math.min(job.pallets, job.palletsDone + 1) })
            }
          }
          forklifts.patch(fl.id, { status: 'idle', carrying: false, task: null, movesToday: fl.movesToday + 1 })
          break
        }
      }
    }
  }

  // --- Doors: occasional maintenance on idle doors -----------------------------------------
  for (const dock of docks.all()) {
    const busy = dock.truckId || shipments.all().some((s) => s.dockId === dock.id && OPEN_AT_DOOR.includes(s.status))
    if (dock.status === 'free' && !busy && rng.chance(0.002)) docks.patch(dock.id, { status: 'maintenance' })
    else if (dock.status === 'maintenance' && rng.chance(0.06)) docks.patch(dock.id, { status: 'free' })
  }

  // --- Cold-room sensors --------------------------------------------------------------------
  const sensors = prev.sensors?.map((sensor) => {
    const spike = rng.chance(0.03) ? rng.next() * 1.8 : 0
    const pull = (sensor.targetTempC - 0.6 - sensor.coldRoomTempC) * 0.25
    const next = Number((sensor.coldRoomTempC + pull + (rng.next() - 0.5) * 0.3 + spike).toFixed(1))
    return next === sensor.coldRoomTempC ? sensor : { ...sensor, coldRoomTempC: next, lastUpdate: now }
  })

  // --- Keep history bounded --------------------------------------------------------------------
  const closed = shipments
    .all()
    .filter((s) => (s.status === 'delivered' || s.status === 'stored') && !trucks.all().some((t) => t.shipmentId === s.id))
    .sort((a, b) => (a.events.delivered ?? a.events.stored ?? 0) - (b.events.delivered ?? b.events.stored ?? 0))
  for (const s of closed.slice(0, Math.max(0, closed.length - MAX_CLOSED))) shipments.remove(s.id)

  return {
    time: now,
    sites: prev.sites,
    customers: prev.customers,
    sensors,
    docks: docks.toList(),
    trucks: trucks.toList(),
    forklifts: forklifts.toList(),
    inventory: inventory.toList(),
    shipments: shipments.toList(),
  }
}

function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Move along the route by `metres`, returning the new position and the waypoints left. */
function advance(from: Vec2, route: Vec2[], metres: number): { position: Vec2; route: Vec2[] } {
  let position = from
  let left = metres
  const remaining = [...route]
  while (remaining.length > 0 && left > 0) {
    const next = remaining[0]
    const d = distance(position, next)
    if (d <= left) {
      position = next
      left -= d
      remaining.shift()
    } else {
      const k = left / d
      position = { x: position.x + (next.x - position.x) * k, z: position.z + (next.z - position.z) * k }
      left = 0
    }
  }
  return { position, route: remaining }
}
