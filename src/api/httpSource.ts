import type { WarehouseSnapshot } from '../data/types'
import type { WarehouseDataSource } from './dataSource'

/**
 * Real backend adapter.
 *
 * Expected endpoints (JSON, shapes from `data/types.ts`):
 *   GET  {baseUrl}/snapshot  -> WarehouseSnapshot
 *   GET  {baseUrl}/events    -> Server-Sent Events, each `data:` is a WarehouseSnapshot (optional)
 *
 * If the server has no /events stream, the adapter falls back to polling /snapshot.
 */
export class HttpDataSource implements WarehouseDataSource {
  readonly name = 'API'
  private readonly baseUrl: string
  private readonly pollMs: number
  private readonly token?: string

  constructor(baseUrl: string, options: { pollMs?: number; token?: string } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.pollMs = options.pollMs ?? 2000
    this.token = options.token
  }

  async load(): Promise<WarehouseSnapshot> {
    const res = await fetch(`${this.baseUrl}/snapshot`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
    })
    if (!res.ok) throw new Error(`GET /snapshot failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as WarehouseSnapshot
  }

  subscribe(onUpdate: (snapshot: WarehouseSnapshot) => void, onError?: (error: Error) => void) {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let events: EventSource | undefined

    const poll = async () => {
      if (stopped) return
      try {
        onUpdate(await this.load())
      } catch (e) {
        onError?.(e as Error)
      }
      timer = setTimeout(poll, this.pollMs)
    }

    // EventSource cannot send headers, so token-protected APIs use polling.
    if (typeof EventSource !== 'undefined' && !this.token) {
      events = new EventSource(`${this.baseUrl}/events`)
      events.onmessage = (msg) => onUpdate(JSON.parse(msg.data) as WarehouseSnapshot)
      events.onerror = () => {
        events?.close()
        events = undefined
        if (!stopped) timer = setTimeout(poll, this.pollMs)
      }
    } else {
      timer = setTimeout(poll, this.pollMs)
    }

    return () => {
      stopped = true
      events?.close()
      clearTimeout(timer)
    }
  }
}
