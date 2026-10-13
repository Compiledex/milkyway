import type { DockStatus, ForkliftStatus, ShipmentStatus, TruckStatus } from '../data/types'

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'

export const truckTone: Record<TruckStatus, Tone> = {
  away: 'neutral',
  'to-terminal': 'info',
  queued: 'warn',
  docking: 'info',
  waiting: 'neutral',
  loading: 'good',
  unloading: 'good',
  departing: 'neutral',
  'to-customer': 'info',
  'at-customer': 'good',
}

export const shipmentTone: Record<ShipmentStatus, Tone> = {
  received: 'neutral',
  picking: 'info',
  picked: 'info',
  loading: 'good',
  'in-transit': 'info',
  'at-customer': 'good',
  delivered: 'good',
  arrived: 'warn',
  unloading: 'good',
  stored: 'good',
}

export const forkliftTone: Record<ForkliftStatus, Tone> = {
  idle: 'neutral',
  moving: 'info',
  lifting: 'good',
  charging: 'warn',
}

export const dockTone: Record<DockStatus, Tone> = {
  free: 'neutral',
  occupied: 'info',
  maintenance: 'bad',
}
