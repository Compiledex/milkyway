import type { DockStatus, ForkliftStatus, ShipmentDirection, ShipmentStatus, TruckStatus } from '../data/types'
import { currentLocale, t, type StringKey } from '../i18n'

// Formatting follows the selected language. Formatters are cached per locale.

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>()
function fmt<T extends Intl.DateTimeFormat | Intl.NumberFormat>(key: string, make: (locale: string) => T): T {
  const locale = currentLocale()
  const k = `${locale}|${key}`
  let f = cache.get(k) as T | undefined
  if (!f) {
    f = make(locale)
    cache.set(k, f)
  }
  return f
}

export const fmtTime = (ms: number) =>
  fmt('time', (l) => new Intl.DateTimeFormat(l, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })).format(ms)
export const fmtDay = (ms: number) => fmt('day', (l) => new Intl.DateTimeFormat(l, { weekday: 'short', day: 'numeric', month: 'short' })).format(ms)
export const fmtNumber = (v: number) => fmt('num', (l) => new Intl.NumberFormat(l)).format(Math.round(v))

export function fmtPercent(v: number | null, digits = 0) {
  if (v === null) return '–'
  const f = fmt(`pct${digits}`, (l) => new Intl.NumberFormat(l, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }))
  return f.format(v)
}

export const fmtSigned = (v: number) => (v > 0 ? `+${fmtNumber(v)}` : v < 0 ? `−${fmtNumber(-v)}` : '±0')

export function fmtRelative(ms: number, now: number) {
  const min = Math.round((ms - now) / 60_000)
  if (min === 0) return t('rel.now')
  const abs = Math.abs(min)
  const x = abs >= 60 ? t('rel.hm', { h: Math.floor(abs / 60), m: abs % 60 }) : t('rel.m', { m: abs })
  return min > 0 ? t('rel.in', { x }) : t('rel.ago', { x })
}

/** Rough minutes left until a dock job is done, from pallets remaining (about 5 min per pallet). */
export const minutesLeft = (pallets: number, handled: number) => Math.max(1, (pallets - handled) * 5)

export const aisleLetter = (aisle: number) => String.fromCharCode(65 + aisle)
export const rackLabel = (aisle: number, bay: number) => `${aisleLetter(aisle)}-${String(bay + 1).padStart(2, '0')}`

/** A record whose values are looked up in the current language on every read. */
function translated<K extends string>(prefix: string): Record<K, string> {
  return new Proxy({} as Record<K, string>, { get: (_, key) => t(`${prefix}.${String(key)}` as StringKey) })
}

export const TRUCK_STATUSES: TruckStatus[] = ['to-terminal', 'queued', 'docking', 'waiting', 'loading', 'unloading', 'departing', 'to-customer', 'at-customer', 'away']
export const truckStatusLabel = translated<TruckStatus>('truck')
export const forkliftStatusLabel = translated<ForkliftStatus>('forklift')
export const dockStatusLabel = translated<DockStatus>('dock')
export const shipmentStatusLabel = translated<ShipmentStatus>('shipment')
export const directionLabel = translated<ShipmentDirection>('dir')
