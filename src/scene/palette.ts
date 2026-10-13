import { brand } from '../brand'
import type { ScenePalette } from '../brand/types'
import type { DockStatus, ForkliftStatus, TruckStatus } from '../data/types'

// Light, high-key "product render" look.
const base: ScenePalette = {
  background: '#e9ecf6',
  ground: '#c9cee2',
  yard: '#bcc2d6',
  road: '#aeb5cc',
  roadLine: '#ffffff',
  curb: '#dde1ec',
  floor: '#bdc4d6',
  wall: '#e9ecf4',
  wallRib: '#cfd4e2',
  wallTrim: '#2f55d4',
  roof: '#3b63de',
  roofEdge: '#2a4cc0',
  door: '#dfe3ec',
  accent: '#2f5bea',
  marking: '#f2c230',
  rackPost: '#2f55d4',
  rackBeam: '#f08a24',
  pallet: '#c99a62',
  load: '#d9a86c',
  loadLow: '#ef5a5a',
  truckBody: '#eef0f6',
  forklift: '#f4b81c',
  forkliftDark: '#2b2f38',
  tree: '#93d6a3',
  treeDark: '#74c48b',
  trunk: '#b8916a',
  fence: '#c3c9da',
  neighbour: '#d3d8e6',
}

/** Scene colours: defaults overridden by the active brand. */
export const palette: ScenePalette = { ...base, ...brand.scene }

export const carrierColors = brand.carrierColors

export const loadColor = (category: string) => brand.categoryColors[category] ?? palette.load

export const truckStatusColor: Record<TruckStatus, string> = {
  away: '#9aa3b2',
  'to-terminal': '#5b6b8c',
  queued: '#d98a00',
  docking: '#2f5bea',
  waiting: '#7a8499',
  loading: '#1f9d55',
  unloading: '#1f9d55',
  departing: '#7a8499',
  'to-customer': '#2f5bea',
  'at-customer': '#8e5bd8',
}

export const forkliftStatusColor: Record<ForkliftStatus, string> = {
  idle: '#7a8499',
  moving: '#2f5bea',
  lifting: '#1f9d55',
  charging: '#d98a00',
}

export const dockStatusColor: Record<DockStatus, string> = {
  free: '#1f9d55',
  occupied: '#2f5bea',
  maintenance: '#d64545',
}
