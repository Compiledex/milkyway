import { chargerPosition, dockStagingPoint, pickPoint, planRoute } from './layout'
import type { SeedProfile } from './profiles/profile'
import { MINUTE } from './rules'
import { createRng, type Rng } from './rng'
import type {
  Customer,
  Dock,
  Forklift,
  InventoryItem,
  Shipment,
  ShipmentLine,
  Site,
  SiteSensor,
  StorageLocation,
  Truck,
  WarehouseSnapshot,
} from './types'
import { drivingDistance, planWorld } from './world'

// Test data that is consistent from the first frame: every truck, order and
// pallet is in a state the simulation could have produced. Times are
// relative to `now`.

const ITEMS_PER_SITE = [14, 13, 13]
const FORKLIFTS_PER_SITE = [3, 3, 2]
/** Average speed used to turn map distance into driving minutes (1 sim-minute ≈ 1 s on screen). */
export const METRES_PER_MINUTE = 6.2

export function createSeed(now: number, profile: SeedProfile): WarehouseSnapshot {
  const rng = createRng(20261013)
  const t = (minutes: number) => now + Math.round(minutes * MINUTE)

  const sites: Site[] = profile.sites.map((s) => ({ ...s, aisles: 4, baysPerAisle: 8, levelsPerBay: 3 }))
  const plan = planWorld(sites)

  // Shops on the map become customers, big shops first.
  const shops = [...plan.shops.filter((s) => s.size === 'large'), ...plan.shops.filter((s) => s.size === 'small')]
  const customers: Customer[] = shops.slice(0, profile.customers.length).map((shop, i) => ({
    id: `cust-${shop.id}`,
    ...profile.customers[i],
    location: { x: shop.x, z: shop.z },
    travelMinutes: Object.fromEntries(
      sites.map((site) => [site.id, Math.max(12, Math.round(drivingDistance(plan, site, shop) / METRES_PER_MINUTE))]),
    ),
  }))

  const docks: Dock[] = sites.flatMap((site) =>
    Array.from({ length: 6 }, (_, i) => ({
      id: `${site.id}-dock-${i + 1}`,
      siteId: site.id,
      number: i + 1,
      status: site.id === sites[1]?.id && i === 5 ? ('maintenance' as const) : ('free' as const),
      truckId: null,
      lastUpdate: t(-rng.int(5, 90)),
    })),
  )
  const dockAt = (site: Site, n: number) => docks.find((d) => d.siteId === site.id && d.number === n)!

  // Inventory: unique rack slots per site, roughly one in six below reorder point.
  const inventory: InventoryItem[] = []
  let catalogIndex = 0
  sites.forEach((site, s) => {
    const used = new Set<string>()
    for (let i = 0; i < ITEMS_PER_SITE[s]; i++) {
      let location: StorageLocation
      do {
        location = { aisle: rng.int(0, site.aisles - 1), bay: rng.int(0, site.baysPerAisle - 1), level: rng.int(0, site.levelsPerBay - 1) }
      } while (used.has(`${location.aisle}-${location.bay}-${location.level}`))
      used.add(`${location.aisle}-${location.bay}-${location.level}`)
      const [sku, name, category, unit] = profile.catalog[catalogIndex++ % profile.catalog.length]
      const capacity = rng.pick([80, 120, 160, 240])
      const reorderPoint = Math.round(capacity * 0.2)
      const low = rng.chance(0.16)
      inventory.push({
        id: `item-${sku.toLowerCase()}`,
        sku,
        name,
        category,
        siteId: site.id,
        location,
        quantity: low ? rng.int(4, reorderPoint) : rng.int(reorderPoint + 10, capacity),
        capacity,
        reorderPoint,
        unit,
        lastUpdate: t(-rng.int(10, 600)),
      })
    }
  })

  const shipments: Shipment[] = []
  const trucks: Truck[] = []
  const forklifts: Forklift[] = []
  const ids = { order: 5100, inbound: 2300, plate: 41207 }

  sites.forEach((site, s) => {
    const items = inventory.filter((i) => i.siteId === site.id)
    const travel = (c: Customer) => c.travelMinutes[site.id]
    const customerFor = (k: number) => customers[(s * 2 + k) % customers.length]

    const order = (c: Customer, createdMin: number, requestedMin: number): Shipment => {
      const no = ids.order++
      return {
        id: `ord-${no}`,
        reference: `ORD-${no}`,
        direction: 'outbound',
        siteId: site.id,
        customerId: c.id,
        supplier: null,
        truckId: null,
        dockId: null,
        lines: orderLines(items, rng),
        pallets: rng.int(3, 7),
        palletsStaged: 0,
        palletsDone: 0,
        scheduledAt: t(requestedMin),
        eta: null,
        status: 'received',
        events: { created: t(createdMin) },
        lastUpdate: t(createdMin),
      }
    }

    const newTruck = (role: Truck['role'], carrier: string, k: number): Truck => {
      const plate = `${rng.pick(['SV', 'VH', 'BR', 'EK', 'ZT'])} ${ids.plate}`
      ids.plate += rng.int(113, 2971)
      return {
        id: `truck-${site.code.toLowerCase()}-${k}`,
        plate,
        carrier,
        siteId: site.id,
        role,
        status: 'away',
        dockId: null,
        shipmentId: null,
        customerId: null,
        eta: null,
        lastUpdate: t(-rng.int(1, 10)),
      }
    }
    const park = (truck: Truck, dockNo: number) => {
      const d = dockAt(site, dockNo)
      d.status = 'occupied'
      d.truckId = truck.id
      truck.dockId = d.id
    }

    // 1. Loading at door 1: order fully picked, partly loaded.
    const t1 = newTruck('distribution', profile.carriers[0], 1)
    const c1 = customerFor(0)
    const o1 = order(c1, -95, 60)
    Object.assign(o1, { status: 'loading', truckId: t1.id, dockId: dockAt(site, 1).id, palletsStaged: o1.pallets, palletsDone: rng.int(1, o1.pallets - 2) })
    o1.events = { created: t(-95), pickingStarted: t(-70), picked: t(-30), loadingStarted: t(-12) }
    Object.assign(t1, { status: 'loading', shipmentId: o1.id, customerId: c1.id })
    park(t1, 1)

    // 2. On the way to a shop.
    const t2 = newTruck('distribution', profile.carriers[(s + 1) % profile.carriers.length], 2)
    const c2 = customerFor(1)
    const departed = -Math.round(travel(c2) * 0.45)
    const o2 = order(c2, -140, departed + travel(c2) + rng.int(-5, 20))
    Object.assign(o2, {
      status: 'in-transit',
      truckId: t2.id,
      dockId: dockAt(site, 3).id,
      palletsStaged: o2.pallets,
      palletsDone: o2.pallets,
      eta: t(travel(c2) + departed),
    })
    o2.events = { created: t(-140), pickingStarted: t(-110), picked: t(departed - 45), loadingStarted: t(departed - 30), loaded: t(departed - 4), departed: t(departed) }
    Object.assign(t2, { status: 'to-customer', shipmentId: o2.id, customerId: c2.id, eta: o2.eta })

    // 3. Varies per site: returning empty, at a shop, or waiting at a door.
    const t3 = newTruck('distribution', profile.carriers[(s + 2) % profile.carriers.length], 3)
    const c3 = customerFor(2)
    if (s % 3 === 0) {
      const back = Math.round(travel(c3) * 0.3)
      Object.assign(t3, { status: 'to-terminal', customerId: c3.id, eta: t(back) })
      const arrivedAtShop = -Math.round(travel(c3) * 0.7) - 14
      shipments.push(deliveredOrder(order(c3, -260, arrivedAtShop + 6), t3.id, arrivedAtShop, travel(c3), t))
    } else if (s % 3 === 1) {
      const o3 = order(c3, -200, -8 + rng.int(-10, 20))
      Object.assign(o3, { status: 'at-customer', truckId: t3.id, palletsStaged: o3.pallets, palletsDone: o3.pallets, eta: t(-6) })
      o3.events = { created: t(-200), pickingStarted: t(-170), picked: t(-120), loadingStarted: t(-100), loaded: t(-80), departed: t(-6 - travel(c3)), arrived: t(-6) }
      Object.assign(t3, { status: 'at-customer', shipmentId: o3.id, customerId: c3.id, eta: t(9) })
      shipments.push(o3)
    } else {
      Object.assign(t3, { status: 'waiting' })
      park(t3, 5)
    }

    // 4. Supplier truck: unloading, on its way in, or away.
    const t4 = newTruck('supplier', profile.carriers[(s + 3) % profile.carriers.length], 4)
    if (s % 3 !== 2) {
      const no = ids.inbound++
      const inbound: Shipment = {
        id: `inn-${no}`,
        reference: `INN-${no}`,
        direction: 'inbound',
        siteId: site.id,
        customerId: null,
        supplier: rng.pick(profile.suppliers),
        truckId: t4.id,
        dockId: null,
        lines: replenishLines(items, rng),
        pallets: rng.int(4, 6),
        palletsStaged: 0,
        palletsDone: 0,
        scheduledAt: t(s % 3 === 0 ? -25 : 18),
        eta: null,
        status: 'in-transit',
        events: { created: t(-300) },
        lastUpdate: t(-5),
      }
      if (s % 3 === 0) {
        Object.assign(inbound, { status: 'unloading', dockId: dockAt(site, 4).id, palletsStaged: 3, palletsDone: 1 })
        inbound.events = { created: t(-300), arrived: t(-22), unloadingStarted: t(-14) }
        Object.assign(t4, { status: 'unloading', shipmentId: inbound.id })
        park(t4, 4)
      } else {
        Object.assign(inbound, { eta: t(24) })
        inbound.events = { created: t(-300), departed: t(-40) }
        Object.assign(t4, { status: 'to-terminal', shipmentId: inbound.id, eta: t(24) })
      }
      shipments.push(inbound)
    } else {
      Object.assign(t4, { status: 'away', eta: t(35) })
    }

    // Orders in the warehouse: one being picked at door 2, one or two just received.
    const picking = order(customerFor(3), -40, 150)
    Object.assign(picking, { status: 'picking', dockId: dockAt(site, 2).id, palletsStaged: 2 })
    picking.events = { created: t(-40), pickingStarted: t(-16) }
    const received = [order(customerFor(4), -12, 190)]
    if (s !== 1) received.push(order(customerFor(5), -4, 230))

    // Delivered earlier today, mostly on time.
    for (let k = 0; k < 4; k++) {
      const c = customerFor(k + 1)
      const arrived = -rng.int(120, 420)
      const late = rng.chance(0.25) ? rng.int(20, 45) : -rng.int(0, 12)
      shipments.push(deliveredOrder(order(c, arrived - 200, arrived - late), rng.pick([t1, t2, t3]).id, arrived, travel(c), t))
    }

    shipments.push(o1, o2, picking, ...received)
    trucks.push(t1, t2, t3, t4)

    // Forklifts: one carrying a picked pallet to door 2, one charging, the rest idle.
    for (let i = 0; i < FORKLIFTS_PER_SITE[s]; i++) {
      const fl: Forklift = {
        id: `fl-${site.code.toLowerCase()}-${i + 1}`,
        name: `${profile.forkliftName} ${site.code}-${String(i + 1).padStart(2, '0')}`,
        siteId: site.id,
        status: 'idle',
        battery: rng.int(45, 95),
        position: pickPoint(rng.pick(items).location),
        route: [],
        task: null,
        carrying: false,
        movesToday: rng.int(12, 40),
        lastUpdate: t(-rng.int(0, 5)),
      }
      if (i === 0) {
        const item = items.find((it) => it.id === picking.lines[0].itemId)!
        const from = pickPoint(item.location)
        fl.position = from
        fl.status = 'moving'
        fl.carrying = true
        fl.task = { kind: 'pick', shipmentId: picking.id, itemId: item.id, dockNumber: 2, phase: 'to-drop' }
        fl.route = planRoute(from, dockStagingPoint(2))
      } else if (i === FORKLIFTS_PER_SITE[s] - 1) {
        fl.status = 'charging'
        fl.battery = rng.int(12, 30)
        fl.position = chargerPosition(i)
      }
      forklifts.push(fl)
    }
  })

  const sensors: SiteSensor[] = profile.coldChain
    ? sites.map((site) => ({
        id: `${site.id}-cold`,
        siteId: site.id,
        coldRoomTempC: Number((3.2 + rng.next() * 1.2).toFixed(1)),
        targetTempC: 4,
        lastUpdate: now,
      }))
    : []

  return { time: now, sites, customers, docks, trucks, forklifts, inventory, shipments, sensors }
}

/** Order lines: two to four products the site has in stock. */
export function orderLines(items: InventoryItem[], rng: Rng): ShipmentLine[] {
  const sellable = items.filter((i) => !['Emballasje', 'Rengjøring'].includes(i.category))
  const pool = sellable.length >= 2 ? sellable : items
  const picked = new Set<string>()
  const count = Math.min(pool.length, rng.int(2, 4))
  while (picked.size < count) picked.add(rng.pick(pool).id)
  return [...picked].map((itemId) => ({ itemId, quantity: rng.int(12, 48) }))
}

/** Supplier lines: refill whatever is low, else packaging and other consumables. */
export function replenishLines(items: InventoryItem[], rng: Rng): ShipmentLine[] {
  const low = items.filter((i) => i.quantity <= i.reorderPoint * 1.5)
  const pool = low.length ? low : items
  const picked = new Set<string>()
  const count = Math.min(pool.length, rng.int(1, 3))
  while (picked.size < count) picked.add(rng.pick(pool).id)
  return [...picked].map((itemId) => {
    const it = items.find((i) => i.id === itemId)!
    return { itemId, quantity: Math.max(20, Math.round((it.capacity - it.quantity) * 0.8)) }
  })
}

function deliveredOrder(o: Shipment, truckId: string, arrivedMin: number, travelMin: number, t: (m: number) => number): Shipment {
  const departed = arrivedMin - travelMin
  o.status = 'delivered'
  o.truckId = truckId
  o.palletsStaged = o.pallets
  o.palletsDone = o.pallets
  o.events = {
    created: o.events.created,
    pickingStarted: t(departed - 80),
    picked: t(departed - 40),
    loadingStarted: t(departed - 25),
    loaded: t(departed - 3),
    departed: t(departed),
    arrived: t(arrivedMin),
    delivered: t(arrivedMin + 14),
  }
  o.lastUpdate = t(arrivedMin + 14)
  return o
}
