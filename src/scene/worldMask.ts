import { FLOOR, YARD } from '../data/layout'
import type { Site } from '../data/types'
import { WORLD_EAST, WORLD_WEST } from '../data/world'
import type { Pt } from './traffic/geometry'
import { RA_RADIUS, type RoadNetwork } from './traffic/network'

/**
 * Where decorations (houses, trees) may go: not on roads, roundabouts,
 * yards, silos or shop lots. Returns a test for a point with a radius.
 */
export function makeClearance(network: RoadNetwork, sites: Site[]) {
  // Sample road centre lines every few metres into a coarse grid for fast lookups.
  const CELL = 8
  const grid = new Map<number, Pt[]>()
  const key = (x: number, z: number) => Math.floor(x / CELL) * 100000 + Math.floor(z / CELL)
  for (const { pts } of network.strips) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2))
      for (let k = 0; k <= n; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }
        const kk = key(p.x, p.z)
        const list = grid.get(kk) ?? []
        list.push(p)
        grid.set(kk, list)
      }
    }
  }
  const nearRoad = (x: number, z: number, r: number) => {
    const reach = 5.5 + r
    const span = Math.ceil(reach / CELL)
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        for (const p of grid.get((cx + i) * 100000 + (cz + j)) ?? []) if (Math.hypot(p.x - x, p.z - z) < reach) return true
      }
    }
    return false
  }

  return (x: number, z: number, r: number) => {
    if (x < WORLD_WEST + 10 || x > WORLD_EAST - 10) return false
    if (nearRoad(x, z, r)) return false
    if (network.roundabouts.some((ra) => Math.hypot(ra.cx - x, ra.cz - z) < RA_RADIUS + 6 + r)) return false
    for (const s of sites) {
      const lx = x - s.origin.x
      const lz = z - s.origin.z
      // Yard, building, silos and containers.
      if (lx > YARD.minX - 16 - r && lx < YARD.maxX + 24 + r && lz > FLOOR.minZ - 8 - r && lz < YARD.maxZ + 4 + r) return false
    }
    for (const shop of network.shops) {
      const d = shop.dims
      // Into the shop's own frame.
      const dx = x - shop.x
      const dz = z - shop.z
      const lx = dx * Math.cos(shop.rotation) - dz * Math.sin(shop.rotation)
      const lz = dx * Math.sin(shop.rotation) + dz * Math.cos(shop.rotation)
      if (Math.abs(lx) < d.lotW + 2 + r && lz > d.mouth - 2 - r && lz < d.back + 6 + r) return false
    }
    return true
  }
}
