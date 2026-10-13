import type { StorageLocation, Vec2 } from './types'

// Physical site plan shared by every site, in metres relative to the site
// origin. +z points from the back wall of the building towards the docks,
// the yard and the public road.

export const FLOOR = { minX: -30, maxX: 30, minZ: -20, maxZ: 14 } as const
export const DOCK_WALL_Z = FLOOR.maxZ
export const RACK_DEPTH = 1.2
export const BAY_WIDTH = 2.8
export const LEVEL_HEIGHT = 1.4
export const WALL_HEIGHT = 9

export function rackPosition(aisle: number, bay: number): Vec2 {
  return { x: -25 + bay * BAY_WIDTH, z: -16 + aisle * 6 }
}

/** Point in the aisle in front of a rack bay where a forklift stops. */
export function pickPoint(loc: Pick<StorageLocation, 'aisle' | 'bay'>): Vec2 {
  const p = rackPosition(loc.aisle, loc.bay)
  return { x: p.x, z: p.z + 2.6 }
}

export function dockPosition(dockNumber: number): Vec2 {
  return { x: -20 + (dockNumber - 1) * 8, z: DOCK_WALL_Z }
}

/** Where forklifts pick up and drop pallets, just inside a door. */
export function dockStagingPoint(dockNumber: number): Vec2 {
  const p = dockPosition(dockNumber)
  return { x: p.x, z: p.z - 3 }
}

/** Staged pallets in the yard beside a door: 2 columns × 3 rows, clear of the truck paths. */
export function stagedPalletPosition(dockNumber: number, index: number): Vec2 {
  const p = dockPosition(dockNumber)
  return { x: p.x + 3.55 + (index % 2) * 1.25, z: p.z + 1.6 + Math.floor(index / 2) * 1.4 }
}

export function chargerPosition(slot: number): Vec2 {
  return { x: 25 - slot * 3.5, z: -17 }
}

// --- Yard, gate, lanes and road --------------------------------------------------
// Right-hand traffic. Trucks enter on the east lane of the gate, wait at the
// hold line, drive west along the approach lane past the doors, reverse in,
// and leave east along the exit lane and out the west lane of the gate.

export const YARD = { minX: -42, maxX: 54, minZ: FLOOR.maxZ, maxZ: 47 } as const
export const GATE_X = 40
export const GATE_WIDTH = 12
/** In and out lanes are well apart so a truck turning out never sweeps the hold line. */
export const GATE_IN_X = GATE_X + 3.2
export const GATE_OUT_X = GATE_X - 3.2

/** The public road runs along x, shared by all sites. Westbound lane is nearest the sites. */
export const ROAD = { minZ: 51, maxZ: 61 } as const
export const ROAD_INBOUND_Z = 53.6
export const ROAD_OUTBOUND_Z = 58.4

/** Lanes inside the yard. */
export const APPROACH_Z = 29
export const EXIT_Z = 40
/** Rear axle of a truck waiting at the hold line inside the gate. */
export const HOLD_Z = 44.2

/** Trucks closer than this (minutes) are drawn on the road; further away they are off the map. */
export const ROAD_VISIBLE_MINUTES = 60
export const ROAD_METRES_PER_MINUTE = 1.6
/** Where trucks appear on and leave the map. */
export const ROAD_EXIT_X = GATE_X + 14 + ROAD_VISIBLE_MINUTES * ROAD_METRES_PER_MINUTE

/** Rear axle position on the approach lane from where a truck reverses into a door. */
export function dockApproachX(dockNumber: number) {
  return dockPosition(dockNumber).x - 12
}

// --- Forklift routing inside the building ---------------------------------------

/** Open lane east of the racks that forklifts use to change aisle. */
export const CROSS_LANE_X = 0

/** Manhattan route that keeps forklifts out of the racks. */
export function planRoute(from: Vec2, to: Vec2): Vec2[] {
  if (Math.abs(from.z - to.z) < 0.5) return [to]
  return [
    { x: CROSS_LANE_X, z: from.z },
    { x: CROSS_LANE_X, z: to.z },
    to,
  ]
}
