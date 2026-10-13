import type { Site } from '../../data/types'
import { TrafficController } from './controller'

export { TrafficController } from './controller'
export type { Agent } from './controller'

let current: { sites: Site[]; controller: TrafficController } | null = null

/** One traffic simulation per set of sites, shared by every component in the scene. */
export function getTraffic(sites: Site[]) {
  if (!current || current.sites !== sites) current = { sites, controller: new TrafficController(sites) }
  return current.controller
}
