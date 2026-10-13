import { create } from 'zustand'
import type { WarehouseDataSource } from '../api'
import type {
  Customer,
  Dock,
  Forklift,
  Id,
  InventoryItem,
  Shipment,
  Site,
  SiteSensor,
  TruckStatus,
  Truck,
  WarehouseSnapshot,
} from '../data/types'

export type Selection =
  | { kind: 'truck'; id: Id }
  | { kind: 'forklift'; id: Id }
  | { kind: 'dock'; id: Id }
  | { kind: 'rack'; id: Id } // `${siteId}:${aisle}:${bay}`
  | { kind: 'shipment'; id: Id }

export type CameraCommand = 'zoomIn' | 'zoomOut' | 'rotateLeft' | 'rotateRight' | 'home'

export interface Filters {
  delayedOnly: boolean
  truckStatus: TruckStatus | 'all'
}

type Table<T> = Record<Id, T>

export interface WarehouseState {
  connection: 'loading' | 'live' | 'error'
  sourceName: string
  error: string | null
  time: number
  sites: Site[]
  customers: Table<Customer>
  docks: Table<Dock>
  trucks: Table<Truck>
  forklifts: Table<Forklift>
  inventory: Table<InventoryItem>
  shipments: Table<Shipment>
  /** Keyed by siteId. */
  sensors: Table<SiteSensor>
  dockIds: Id[]
  truckIds: Id[]
  forkliftIds: Id[]
  inventoryIds: Id[]
  shipmentIds: Id[]

  activeSiteId: Id | null
  selection: Selection | null
  filters: Filters
  /** Inventory total per site at first load, for the "since start" delta. */
  baselineStock: Record<Id, number> | null

  /** Last camera command from the map controls; `nonce` makes repeats fire. */
  cameraCommand: { command: CameraCommand; nonce: number } | null
  /** Fly the camera to the current selection. */
  focusNonce: number
  /** Camera is close enough to look inside the buildings. */
  zoomedIn: boolean
  /** User asked to always see inside. */
  xrayLocked: boolean
  /** Time speed for simulated data: 0 = paused, 1 = normal, up to 8. */
  speed: number
  /** The data source can change speed (test data only). */
  canControlTime: boolean
  /** Camera keeps the selected vehicle in view. */
  follow: boolean

  select: (selection: Selection | null) => void
  /** Select and fly the camera there (lists, search). */
  focus: (selection: Selection) => void
  issueCamera: (command: CameraCommand) => void
  setZoomedIn: (zoomedIn: boolean) => void
  toggleXray: () => void
  setSpeed: (speed: number) => void
  setFollow: (follow: boolean) => void
  setActiveSite: (siteId: Id) => void
  setFilters: (filters: Partial<Filters>) => void
  applySnapshot: (snapshot: WarehouseSnapshot) => void
}

export const useWarehouse = create<WarehouseState>()((set, get) => ({
  connection: 'loading',
  sourceName: '',
  error: null,
  time: 0,
  sites: [],
  customers: {},
  docks: {},
  trucks: {},
  forklifts: {},
  inventory: {},
  shipments: {},
  sensors: {},
  dockIds: [],
  truckIds: [],
  forkliftIds: [],
  inventoryIds: [],
  shipmentIds: [],

  activeSiteId: null,
  selection: null,
  filters: { delayedOnly: false, truckStatus: 'all' },
  baselineStock: null,
  cameraCommand: null,
  focusNonce: 0,
  zoomedIn: false,
  speed: 1,
  canControlTime: false,
  follow: false,
  xrayLocked: false,

  select: (selection) => set({ selection, follow: isMoving(selection) }),
  focus: (selection) => {
    const siteId = siteOf(get(), selection)
    set((s) => ({
      selection,
      activeSiteId: siteId ?? s.activeSiteId,
      focusNonce: s.focusNonce + 1,
      follow: isMoving(selection),
    }))
  },
  issueCamera: (command) => set((s) => ({ cameraCommand: { command, nonce: (s.cameraCommand?.nonce ?? 0) + 1 } })),
  setZoomedIn: (zoomedIn) => {
    if (get().zoomedIn !== zoomedIn) set({ zoomedIn })
  },
  toggleXray: () => set((s) => ({ xrayLocked: !s.xrayLocked })),
  setSpeed: (speed) => {
    activeSource?.setSpeed?.(speed)
    set({ speed })
  },
  setFollow: (follow) => set({ follow }),
  setActiveSite: (activeSiteId) => set({ activeSiteId, selection: null }),
  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),

  applySnapshot: (snap) => {
    const s = get()
    const customers = reconcile(s.customers, snap.customers ?? [])
    const docks = reconcile(s.docks, snap.docks)
    const trucks = reconcile(s.trucks, snap.trucks)
    const forklifts = reconcile(s.forklifts, snap.forklifts)
    const inventory = reconcile(s.inventory, snap.inventory)
    const shipments = reconcile(s.shipments, snap.shipments)
    const sensors = reconcile(
      s.sensors,
      (snap.sensors ?? []).map((sensor) => ({ ...sensor, id: sensor.siteId })),
    )
    set({
      connection: 'live',
      error: null,
      time: snap.time,
      sites: sameJson(s.sites, snap.sites) ? s.sites : snap.sites,
      customers: customers.table,
      docks: docks.table,
      dockIds: sameIds(s.dockIds, docks.ids),
      trucks: trucks.table,
      truckIds: sameIds(s.truckIds, trucks.ids),
      forklifts: forklifts.table,
      forkliftIds: sameIds(s.forkliftIds, forklifts.ids),
      inventory: inventory.table,
      inventoryIds: sameIds(s.inventoryIds, inventory.ids),
      shipments: shipments.table,
      shipmentIds: sameIds(s.shipmentIds, shipments.ids),
      sensors: sensors.table,
      activeSiteId: s.activeSiteId ?? snap.sites[0]?.id ?? null,
      baselineStock:
        s.baselineStock ??
        snap.inventory.reduce<Record<Id, number>>((acc, i) => ((acc[i.siteId] = (acc[i.siteId] ?? 0) + i.quantity), acc), {}),
    })
  },
}))

/** Vehicles (and orders, which follow their truck) are worth following with the camera. */
function isMoving(selection: Selection | null) {
  return selection?.kind === 'truck' || selection?.kind === 'forklift' || selection?.kind === 'shipment'
}

let activeSource: WarehouseDataSource | undefined

/** Connects the store to a data source. Returns a cleanup function. */
export function connectDataSource(source: WarehouseDataSource): () => void {
  activeSource = source
  useWarehouse.setState({ canControlTime: typeof source.setSpeed === 'function', speed: 1 })
  let unsubscribe: (() => void) | undefined
  let cancelled = false
  const fail = (e: Error) => useWarehouse.setState({ connection: 'error', error: e.message })

  useWarehouse.setState({ sourceName: source.name, connection: 'loading' })
  source
    .load()
    .then((snapshot) => {
      if (cancelled) return
      useWarehouse.getState().applySnapshot(snapshot)
      unsubscribe = source.subscribe((snap) => useWarehouse.getState().applySnapshot(snap), fail)
    })
    .catch(fail)

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

// Keep the previous object when nothing changed, so components subscribed to
// one entity only re-render when that entity changes. Matters for API data,
// where every poll returns fresh objects.
function reconcile<T extends { id: Id }>(prev: Table<T>, list: T[]) {
  const table: Table<T> = {}
  const ids: Id[] = []
  let changed = Object.keys(prev).length !== list.length
  for (const row of list) {
    const old = prev[row.id]
    const keep = old !== undefined && (old === row || sameJson(old, row))
    table[row.id] = keep ? old : row
    if (!keep) changed = true
    ids.push(row.id)
  }
  return { table: changed ? table : prev, ids }
}

function sameJson(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function sameIds(prev: Id[], next: Id[]) {
  return prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next
}

export const rackId = (siteId: Id, aisle: number, bay: number) => `${siteId}:${aisle}:${bay}`
export function parseRackId(id: Id) {
  const [siteId, aisle, bay] = id.split(':')
  return { siteId, aisle: Number(aisle), bay: Number(bay) }
}

/** Which site a selection belongs to. */
export function siteOf(s: Pick<WarehouseState, 'trucks' | 'forklifts' | 'docks' | 'shipments'>, sel: Selection): Id | null {
  switch (sel.kind) {
    case 'truck':
      return s.trucks[sel.id]?.siteId ?? null
    case 'forklift':
      return s.forklifts[sel.id]?.siteId ?? null
    case 'dock':
      return s.docks[sel.id]?.siteId ?? null
    case 'rack':
      return parseRackId(sel.id).siteId
    case 'shipment':
      return (s as Pick<WarehouseState, 'shipments'>).shipments?.[sel.id]?.siteId ?? null
  }
}
