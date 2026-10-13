import type { InventoryItem, Shipment } from './types'

export const MINUTE = 60_000

/** Arriving within this window after the requested time / booked slot counts as on time. */
export const ON_TIME_GRACE_MS = 15 * MINUTE

export const isOutbound = (sh: Shipment) => sh.direction === 'outbound'

/** Finished: delivered to the shop, or put away on the shelves. */
export const isClosed = (sh: Shipment) => sh.status === 'delivered' || sh.status === 'stored'

/**
 * Open shipment that will miss (or has missed) its time: an order not yet
 * at the shop, or a supplier truck not yet at the terminal.
 */
export function isDelayed(sh: Shipment, now: number): boolean {
  if (isClosed(sh)) return false
  const limit = sh.scheduledAt + ON_TIME_GRACE_MS
  if (isOutbound(sh)) {
    if (sh.status === 'at-customer') return (sh.events.arrived ?? now) > limit
    if (sh.status === 'in-transit') return (sh.eta ?? now) > limit
    return now > limit
  }
  if (sh.events.arrived) return false
  return Math.max(sh.eta ?? now, now) > limit
}

/** For delivered orders: did the truck reach the shop in time? */
export function deliveredOnTime(sh: Shipment): boolean | null {
  if (!isOutbound(sh) || !sh.events.arrived) return null
  return sh.events.arrived <= sh.scheduledAt + ON_TIME_GRACE_MS
}

export function isLowStock(item: InventoryItem): boolean {
  return item.quantity <= item.reorderPoint
}
