import { brand } from '../brand'
import type { WarehouseDataSource } from './dataSource'
import { HttpDataSource } from './httpSource'
import { MockDataSource } from './mock/mockSource'

export type { WarehouseDataSource } from './dataSource'

/**
 * Picks the data source from env (see `.env.example`):
 *   VITE_WARETRACK_API_URL unset  -> the brand's test data with live simulation
 *   VITE_WARETRACK_API_URL set    -> real backend
 */
export function createDataSource(): WarehouseDataSource {
  const url = import.meta.env.VITE_WARETRACK_API_URL
  if (url) {
    return new HttpDataSource(url, {
      token: import.meta.env.VITE_WARETRACK_API_TOKEN || undefined,
      pollMs: Number(import.meta.env.VITE_WARETRACK_POLL_MS) || 2000,
    })
  }
  return new MockDataSource(brand.profile, { tickMs: 2000 })
}
