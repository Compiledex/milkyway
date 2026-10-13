import type { Site } from '../types'

/** Everything that makes a test-data set specific to one business. */
export interface SeedProfile {
  /** Exactly 3 sites; the first one is shown on start. */
  sites: Omit<Site, 'aisles' | 'baysPerAisle' | 'levelsPerBay'>[]
  carriers: string[]
  /** At least 40 items: [sku, name, category, unit]. */
  catalog: [sku: string, name: string, category: string, unit: string][]
  forkliftName: string
  /** Shops that order; placed at the shops on the map in order (big shops first). */
  customers: { name: string; brand: string; address: string }[]
  /** Companies delivering goods in. */
  suppliers: string[]
  /** Seed and simulate cold-room temperature sensors. */
  coldChain: boolean
}
