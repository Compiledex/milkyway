// WareTrack domain model.
// All timestamps are epoch milliseconds. Relations are by id so the same
// shapes can come straight from a REST/JSON API later.

export type Id = string

export interface Vec2 {
  x: number
  z: number
}

export interface Site {
  id: Id
  code: string
  name: string
  city: string
  /** World offset of the site in the 3D map, in metres. */
  origin: Vec2
  /** Rack layout of the warehouse floor. */
  aisles: number
  baysPerAisle: number
  levelsPerBay: number
}

/** A shop that orders from the terminals. */
export interface Customer {
  id: Id
  name: string
  /** Chain/brand key, used for the logo and colour. */
  brand: string
  address: string
  /** Position on the 3D map (world metres). */
  location: Vec2
  /** Typical one-way driving time from each site, in minutes. */
  travelMinutes: Record<Id, number>
}

export type DockStatus = 'free' | 'occupied' | 'maintenance'

export interface Dock {
  id: Id
  siteId: Id
  number: number
  status: DockStatus
  truckId: Id | null
  lastUpdate: number
}

export type TruckRole = 'distribution' | 'supplier'

export type TruckStatus =
  /** Off the map between jobs (supplier trucks). */
  | 'away'
  /** Driving to the terminal (returning empty, or bringing goods in). */
  | 'to-terminal'
  /** At the gate, waiting for a door. */
  | 'queued'
  | 'docking'
  /** At a door, waiting for an order to be picked. */
  | 'waiting'
  | 'loading'
  | 'unloading'
  | 'departing'
  /** Driving to a shop with an order. */
  | 'to-customer'
  /** Unloading at the shop. */
  | 'at-customer'

export interface Truck {
  id: Id
  plate: string
  carrier: string
  siteId: Id
  role: TruckRole
  status: TruckStatus
  dockId: Id | null
  shipmentId: Id | null
  /** Shop the truck is driving to, at, or coming back from. */
  customerId: Id | null
  /** Expected arrival at the next stop (terminal or shop), or the end of the current stop. */
  eta: number | null
  lastUpdate: number
}

export type ForkliftStatus = 'idle' | 'moving' | 'lifting' | 'charging'

export interface ForkliftTask {
  kind: 'pick' | 'putaway'
  shipmentId: Id
  itemId: Id
  dockNumber: number
  phase: 'to-pickup' | 'lift' | 'to-drop' | 'drop'
}

export interface Forklift {
  id: Id
  name: string
  siteId: Id
  status: ForkliftStatus
  /** 0–100 */
  battery: number
  /** Local position on the site floor, in metres from the site origin. */
  position: Vec2
  /** Remaining waypoints while moving; the last one is the destination. */
  route: Vec2[]
  task: ForkliftTask | null
  /** Has a pallet on the forks. */
  carrying: boolean
  /** Pallet moves completed today. */
  movesToday: number
  lastUpdate: number
}

export interface StorageLocation {
  aisle: number
  bay: number
  level: number
}

export interface InventoryItem {
  id: Id
  sku: string
  name: string
  category: string
  siteId: Id
  location: StorageLocation
  quantity: number
  capacity: number
  reorderPoint: number
  unit: string
  lastUpdate: number
}

/** outbound = a shop's order, inbound = a supplier delivery. */
export type ShipmentDirection = 'inbound' | 'outbound'

export type ShipmentStatus =
  // Shop orders
  | 'received'
  | 'picking'
  | 'picked'
  | 'loading'
  | 'in-transit'
  | 'at-customer'
  | 'delivered'
  // Supplier deliveries (also use 'in-transit')
  | 'arrived'
  | 'unloading'
  | 'stored'

export interface ShipmentLine {
  itemId: Id
  quantity: number
}

/** Timestamps of everything that has happened to a shipment. */
export interface ShipmentEvents {
  created: number
  pickingStarted?: number
  picked?: number
  loadingStarted?: number
  loaded?: number
  departed?: number
  arrived?: number
  delivered?: number
  unloadingStarted?: number
  unloaded?: number
  stored?: number
}

export interface Shipment {
  id: Id
  reference: string
  direction: ShipmentDirection
  siteId: Id
  /** Ordering shop (outbound). */
  customerId: Id | null
  /** Sending supplier (inbound). */
  supplier: string | null
  truckId: Id | null
  /** Door the pallets are staged at. */
  dockId: Id | null
  lines: ShipmentLine[]
  pallets: number
  /** Outbound: picked to the door. Inbound: unloaded from the truck. */
  palletsStaged: number
  /** Outbound: loaded onto the truck. Inbound: put away in the racks. */
  palletsDone: number
  /** Requested delivery time (orders) or booked slot (supplier deliveries). */
  scheduledAt: number
  /** Current estimate for arriving at the shop or terminal while driving. */
  eta: number | null
  status: ShipmentStatus
  events: ShipmentEvents
  lastUpdate: number
}

/** Cold-room sensor for a site (cold-chain operations such as dairies). */
export interface SiteSensor {
  id: Id
  siteId: Id
  coldRoomTempC: number
  targetTempC: number
  lastUpdate: number
}

/** A complete snapshot of the warehouse network. */
export interface WarehouseSnapshot {
  time: number
  sites: Site[]
  customers: Customer[]
  docks: Dock[]
  trucks: Truck[]
  forklifts: Forklift[]
  inventory: InventoryItem[]
  shipments: Shipment[]
  /** Optional: only for sites with sensor integration. */
  sensors?: SiteSensor[]
}
