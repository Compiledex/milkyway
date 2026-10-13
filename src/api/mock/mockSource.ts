import { createRng } from '../../data/rng'
import type { SeedProfile } from '../../data/profiles/profile'
import { createSeed } from '../../data/seed'
import type { WarehouseSnapshot } from '../../data/types'
import type { WarehouseDataSource } from '../dataSource'
import { simulate } from './simulation'

/** Test-data source: seed data plus a live simulation tick every `tickMs`. */
export class MockDataSource implements WarehouseDataSource {
  readonly name = 'Testdata'
  private snapshot: WarehouseSnapshot
  private readonly rng = createRng(42)
  private readonly tickMs: number
  private readonly profile: SeedProfile

  constructor(profile: SeedProfile, options: { tickMs?: number; now?: number } = {}) {
    this.tickMs = options.tickMs ?? 2000
    this.profile = profile
    this.snapshot = createSeed(options.now ?? roundToMinute(Date.now()), profile)
  }

  async load() {
    return this.snapshot
  }

  private speed = 1
  private timer: ReturnType<typeof setInterval> | undefined
  private listener: ((snapshot: WarehouseSnapshot) => void) | undefined

  subscribe(onUpdate: (snapshot: WarehouseSnapshot) => void) {
    this.listener = onUpdate
    this.restart()
    return () => {
      this.listener = undefined
      clearInterval(this.timer)
    }
  }

  /** 0 pauses, 1 is normal (one 2-minute step every `tickMs`), 8 runs eight times faster. */
  setSpeed(speed: number) {
    this.speed = speed
    this.restart()
  }

  private restart() {
    clearInterval(this.timer)
    if (!this.listener || this.speed <= 0) return
    this.timer = setInterval(() => {
      this.snapshot = simulate(this.snapshot, this.rng, this.profile)
      this.listener?.(this.snapshot)
    }, this.tickMs / this.speed)
  }
}

function roundToMinute(ms: number) {
  return Math.floor(ms / 60_000) * 60_000
}
