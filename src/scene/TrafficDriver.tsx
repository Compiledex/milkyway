import { useFrame } from '@react-three/fiber'
import { useWarehouse } from '../store/warehouseStore'
import { getTraffic } from './traffic'

/** Advances the traffic simulation once per frame, before the vehicles draw. */
export function TrafficDriver() {
  const sites = useWarehouse((s) => s.sites)
  useFrame((_, delta) => {
    const s = useWarehouse.getState()
    const traffic = getTraffic(sites)
    traffic.setSpeed(s.speed)
    traffic.setTime(s.time)
    traffic.update(Math.min(delta, 0.1) * s.speed, { sites: s.sites, customers: s.customers, trucks: s.trucks, docks: s.docks, shipments: s.shipments, time: s.time })
    if (import.meta.env.DEV) {
      const w = window as unknown as { __traffic?: unknown; __store?: unknown; __collisions?: number; __collisionLog?: string[] }
      w.__traffic = traffic
      w.__store = useWarehouse
      const hits = traffic.overlaps()
      if (hits.length) {
        w.__collisions = (w.__collisions ?? 0) + 1
        w.__collisionLog = [...(w.__collisionLog ?? []).slice(-20), ...hits]
      }
    }
  }, -1)
  return null
}
