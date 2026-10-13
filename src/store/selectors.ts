import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { deliveredOnTime, isClosed, isDelayed, isLowStock } from '../data/rules'
import type { Id, InventoryItem, Shipment, SiteSensor, Truck } from '../data/types'
import { useWarehouse, type Filters, type WarehouseState } from './warehouseStore'

const ON_SITE = ['queued', 'docking', 'waiting', 'loading', 'unloading', 'departing']

export interface SiteKpis {
  stock: number
  capacity: number
  stockDelta: number
  onTimeRate: number | null
  /** Orders delivered so far (basis for on-time rate). */
  deliveredCount: number
  openOrders: number
  docksInUse: number
  docksAvailable: number
  docksTotal: number
  activeTrucks: number
  inboundTrucks: number
  lowStock: InventoryItem[]
  delayed: number
  coldRoom: SiteSensor | null
}

type KpiInput = Pick<
  WarehouseState,
  'time' | 'shipments' | 'shipmentIds' | 'docks' | 'dockIds' | 'trucks' | 'truckIds' | 'inventory' | 'inventoryIds' | 'sensors' | 'baselineStock'
>

export function computeKpis(s: KpiInput, siteId: Id): SiteKpis {
  const shipments = s.shipmentIds.map((id) => s.shipments[id]).filter((sh) => sh.siteId === siteId)
  const delivered = shipments.filter((sh) => deliveredOnTime(sh) !== null)
  const onTime = delivered.filter((sh) => deliveredOnTime(sh))
  const docks = s.dockIds.map((id) => s.docks[id]).filter((d) => d.siteId === siteId)
  const trucks = s.truckIds.map((id) => s.trucks[id]).filter((t) => t.siteId === siteId)
  const items = s.inventoryIds.map((id) => s.inventory[id]).filter((i) => i.siteId === siteId)
  const stock = items.reduce((sum, i) => sum + i.quantity, 0)
  return {
    stock,
    capacity: items.reduce((sum, i) => sum + i.capacity, 0),
    stockDelta: stock - (s.baselineStock?.[siteId] ?? stock),
    onTimeRate: delivered.length ? onTime.length / delivered.length : null,
    deliveredCount: delivered.length,
    openOrders: shipments.filter((sh) => sh.direction === 'outbound' && !isClosed(sh)).length,
    docksInUse: docks.filter((d) => d.status === 'occupied').length,
    docksAvailable: docks.filter((d) => d.status !== 'maintenance').length,
    docksTotal: docks.length,
    activeTrucks: trucks.filter((t) => ON_SITE.includes(t.status)).length,
    inboundTrucks: trucks.filter((t) => t.status === 'to-terminal').length,
    lowStock: items.filter(isLowStock),
    delayed: shipments.filter((sh) => isDelayed(sh, s.time)).length,
    coldRoom: s.sensors[siteId] ?? null,
  }
}

export function useSiteKpis(siteId: Id | null): SiteKpis | null {
  const input = useWarehouse(
    useShallow((s): KpiInput => ({
      time: s.time,
      shipments: s.shipments,
      shipmentIds: s.shipmentIds,
      docks: s.docks,
      dockIds: s.dockIds,
      trucks: s.trucks,
      truckIds: s.truckIds,
      inventory: s.inventory,
      inventoryIds: s.inventoryIds,
      sensors: s.sensors,
      baselineStock: s.baselineStock,
    })),
  )
  return useMemo(() => (siteId ? computeKpis(input, siteId) : null), [input, siteId])
}

export function shipmentMatches(sh: Shipment, filters: Filters, now: number) {
  return !filters.delayedOnly || isDelayed(sh, now)
}

export function truckMatches(truck: Truck, s: Pick<WarehouseState, 'filters' | 'shipments' | 'time'>) {
  const { filters } = s
  if (filters.truckStatus !== 'all' && truck.status !== filters.truckStatus) return false
  if (filters.delayedOnly) {
    const sh = truck.shipmentId ? s.shipments[truck.shipmentId] : undefined
    if (!sh || !isDelayed(sh, s.time)) return false
  }
  return true
}

/** True when a filter is active and this truck does not match it, so the scene can dim it. */
export function useTruckDimmed(truckId: Id) {
  return useWarehouse((s) => {
    const truck = s.trucks[truckId]
    if (!truck) return false
    if (s.filters.truckStatus === 'all' && !s.filters.delayedOnly) return false
    return !truckMatches(truck, s)
  })
}

export function useSiteShipments(siteId: Id | null) {
  const shipments = useWarehouse((s) => s.shipments)
  const ids = useWarehouse((s) => s.shipmentIds)
  const filters = useWarehouse((s) => s.filters)
  const time = useWarehouse((s) => s.time)
  return useMemo(() => {
    const list = ids
      .map((id) => shipments[id])
      .filter((sh) => sh.siteId === siteId && !isClosed(sh) && shipmentMatches(sh, filters, time))
    return list.sort((a, b) => (a.eta ?? a.scheduledAt) - (b.eta ?? b.scheduledAt))
  }, [ids, shipments, filters, time, siteId])
}
