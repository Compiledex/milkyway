import type { WarehouseSnapshot } from '../data/types'

/**
 * Where WareTrack gets its data from. The app only talks to this interface,
 * so swapping the mock simulation for a real WMS/API is a one-line change in
 * `api/index.ts` (or just setting VITE_WARETRACK_API_URL).
 */
export interface WarehouseDataSource {
  readonly name: string
  /** Initial full snapshot. */
  load(): Promise<WarehouseSnapshot>
  /** Live updates. Each call delivers a full snapshot. Returns an unsubscribe function. */
  subscribe(onUpdate: (snapshot: WarehouseSnapshot) => void, onError?: (error: Error) => void): () => void
  /**
   * Optional: run time faster (2, 4, 8…) or pause it (0). Only simulated
   * sources can do this; a real API always runs in real time.
   */
  setSpeed?(speed: number): void
}
