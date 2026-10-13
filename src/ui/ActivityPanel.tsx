import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { isClosed, isDelayed } from '../data/rules'
import type { TruckStatus } from '../data/types'
import { useLang, useT } from '../i18n'
import { truckMatches } from '../store/selectors'
import { useWarehouse, type Selection } from '../store/warehouseStore'
import { ShopLogo } from './Badges'
import { Bar, Pill } from './Bits'
import { TRUCK_STATUSES, dockStatusLabel, fmtRelative, fmtTime, forkliftStatusLabel, shipmentStatusLabel, truckStatusLabel } from './format'
import { Icon } from './icons'
import { dockTone, forkliftTone, shipmentTone, truckTone, type Tone } from './tones'

type Tab = 'orders' | 'docks' | 'forklifts' | 'trucks'

interface RowData {
  key: string
  target: Selection
  lead?: ReactNode
  title: string
  sub: string
  text: string
  textDot?: string
  pill: { tone: Tone; label: string }
  meta?: string
  progress?: { value: number; tone?: Tone }
}

/** Bottom-right card with live lists of orders, docks, forklifts and trucks at the active site. */
export function ActivityPanel() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [tab, setTab] = useState<Tab>('orders')
  const [showFilters, setShowFilters] = useState(false)
  const siteId = useWarehouse((s) => s.activeSiteId)
  const site = useWarehouse((s) => s.sites.find((x) => x.id === siteId))
  const docks = useWarehouse((s) => s.docks)
  const trucks = useWarehouse((s) => s.trucks)
  const forklifts = useWarehouse((s) => s.forklifts)
  const shipments = useWarehouse((s) => s.shipments)
  const customers = useWarehouse((s) => s.customers)
  const inventory = useWarehouse((s) => s.inventory)
  const time = useWarehouse((s) => s.time)
  const filters = useWarehouse((s) => s.filters)
  const setFilters = useWarehouse((s) => s.setFilters)
  const selection = useWarehouse((s) => s.selection)
  const focus = useWarehouse((s) => s.focus)

  const data = useMemo(() => {
    const code = site?.code ?? ''
    const siteDocks = Object.values(docks)
      .filter((d) => d.siteId === siteId)
      .sort((a, b) => a.number - b.number)
    const siteTrucks = Object.values(trucks).filter((tr) => tr.siteId === siteId)
    const siteForklifts = Object.values(forklifts).filter((f) => f.siteId === siteId)
    const siteShipments = Object.values(shipments).filter((sh) => sh.siteId === siteId)

    // Orders: open ones by progress, then the latest delivered.
    const order = ['loading', 'picked', 'picking', 'received', 'in-transit', 'at-customer', 'arrived', 'unloading', 'delivered', 'stored']
    const openFirst = [...siteShipments].sort((a, b) => {
      const ca = isClosed(a) ? 1 : 0
      const cb = isClosed(b) ? 1 : 0
      if (ca !== cb) return ca - cb
      if (ca) return (b.events.delivered ?? b.events.stored ?? 0) - (a.events.delivered ?? a.events.stored ?? 0)
      return order.indexOf(a.status) - order.indexOf(b.status) || a.scheduledAt - b.scheduledAt
    })
    const orderRows: RowData[] = openFirst.slice(0, 24).map((sh) => {
      const c = sh.customerId ? customers[sh.customerId] : undefined
      const late = isDelayed(sh, time)
      const out = sh.direction === 'outbound'
      const progress = sh.status === 'picking' || sh.status === 'received' ? sh.palletsStaged : sh.palletsDone
      return {
        key: sh.id,
        target: { kind: 'shipment', id: sh.id },
        lead: c ? <ShopLogo customer={c} size={26} /> : <span className="shop-logo" style={{ width: 26, height: 26, background: '#7a8299', color: '#fff' }}><Icon name="arrowIn" size={15} /></span>,
        title: sh.reference,
        sub: c?.name ?? sh.supplier ?? '',
        text: sh.status === 'in-transit' && sh.eta ? fmtRelative(sh.eta, time) : isClosed(sh) ? fmtTime(sh.events.delivered ?? sh.events.stored ?? sh.lastUpdate) : `${out ? '↑' : '↓'} ${fmtTime(sh.scheduledAt)}`,
        textDot: late ? 'var(--bad)' : undefined,
        pill: late && !isClosed(sh) ? { tone: 'warn', label: t('tr.delayed') } : { tone: shipmentTone[sh.status], label: shipmentStatusLabel[sh.status] },
        meta: `${progress}/${sh.pallets}`,
        progress: { value: progress / sh.pallets, tone: sh.status === 'picking' ? 'info' : 'good' },
      }
    })

    const dockRows: RowData[] = siteDocks.map((d) => {
      const tr = d.truckId ? trucks[d.truckId] : undefined
      const sh = siteShipments.find((s) => s.dockId === d.id && ['picking', 'picked', 'loading', 'arrived', 'unloading'].includes(s.status))
      return {
        key: d.id,
        target: { kind: 'dock', id: d.id },
        title: t('act.dock', { n: d.number }),
        sub: code,
        text: tr ? `${tr.plate} · ${tr.carrier}` : d.status === 'maintenance' ? t('act.closed') : sh ? `${sh.reference} · ${t('ord.waitingTruck')}` : t('act.noTruck'),
        textDot: tr ? 'var(--accent)' : undefined,
        pill: tr ? { tone: truckTone[tr.status], label: truckStatusLabel[tr.status] } : { tone: dockTone[d.status], label: dockStatusLabel[d.status] },
        meta: sh ? `${sh.palletsDone}/${sh.pallets}` : '—',
        progress: sh ? { value: sh.palletsDone / sh.pallets, tone: 'good' } : undefined,
      }
    })

    const forkliftRows: RowData[] = siteForklifts.map((f) => {
      const job = f.task ? shipments[f.task.shipmentId] : undefined
      const item = f.task ? inventory[f.task.itemId]?.name : undefined
      const task =
        f.status === 'charging'
          ? t('act.charging')
          : !f.task
            ? t('task.waiting')
            : f.task.kind === 'pick'
              ? f.carrying
                ? t('task.toDoor', { item: item ?? '', n: f.task.dockNumber })
                : t('task.fetch', { item: item ?? '', ref: job?.reference ?? '' })
              : f.carrying
                ? t('task.store', { item: item ?? '' })
                : t('task.fetchDoor', { n: f.task.dockNumber })
      return {
        key: f.id,
        target: { kind: 'forklift', id: f.id },
        title: f.name.split(' ').pop() ?? f.name,
        sub: code,
        text: task,
        pill: { tone: forkliftTone[f.status], label: forkliftStatusLabel[f.status] },
        meta: `${Math.round(f.battery)} %`,
        progress: { value: f.battery / 100, tone: f.battery < 20 ? 'bad' : f.battery < 40 ? 'warn' : 'good' },
      }
    })

    const filtering = filters.truckStatus !== 'all' || filters.delayedOnly
    const truckRows: RowData[] = siteTrucks
      .filter((tr) => !filtering || truckMatches(tr, { filters, shipments, time }))
      .sort((a, b) => TRUCK_STATUSES.indexOf(a.status) - TRUCK_STATUSES.indexOf(b.status))
      .map((tr) => {
        const sh = tr.shipmentId ? shipments[tr.shipmentId] : undefined
        const c = tr.customerId ? customers[tr.customerId] : undefined
        const d = tr.dockId ? docks[tr.dockId] : undefined
        const late = sh ? isDelayed(sh, time) : false
        const where = d
          ? `${code} · ${t('act.dock', { n: d.number })}`
          : tr.status === 'to-customer' || tr.status === 'at-customer'
            ? c?.name ?? ''
            : tr.status === 'to-terminal'
              ? t('act.toSite', { site: code })
              : tr.status === 'queued'
                ? t('act.atGate', { site: code })
                : tr.status === 'away'
                  ? '—'
                  : t('act.fromSite', { site: code })
        return {
          key: tr.id,
          target: { kind: 'truck', id: tr.id },
          lead: c && (tr.status === 'to-customer' || tr.status === 'at-customer') ? <ShopLogo customer={c} size={22} /> : undefined,
          title: tr.plate,
          sub: tr.carrier,
          text: where,
          textDot: late ? 'var(--bad)' : 'var(--accent)',
          pill: late && tr.status === 'to-customer' ? { tone: 'warn', label: t('tr.delayed') } : { tone: truckTone[tr.status], label: truckStatusLabel[tr.status] },
          meta: sh && d ? `${sh.palletsDone}/${sh.pallets}` : tr.eta ? fmtRelative(tr.eta, time) : '—',
          progress: sh && d ? { value: sh.palletsDone / sh.pallets, tone: 'good' } : undefined,
        }
      })

    const statusCounts = new Map<TruckStatus, number>()
    for (const tr of siteTrucks) statusCounts.set(tr.status, (statusCounts.get(tr.status) ?? 0) + 1)
    return {
      orderRows,
      dockRows,
      forkliftRows,
      truckRows,
      openOrders: siteShipments.filter((sh) => sh.direction === 'outbound' && !isClosed(sh)).length,
      docksBusy: siteDocks.filter((d) => d.status === 'occupied').length,
      docksTotal: siteDocks.length,
      forkliftsBusy: siteForklifts.filter((f) => f.task).length,
      forkliftsTotal: siteForklifts.length,
      trucksTotal: siteTrucks.length,
      statusCounts,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docks, trucks, forklifts, shipments, customers, inventory, time, filters, siteId, site, lang])

  const rows = tab === 'orders' ? data.orderRows : tab === 'docks' ? data.dockRows : tab === 'forklifts' ? data.forkliftRows : data.truckRows
  const activeFilters = (filters.truckStatus !== 'all' ? 1 : 0) + (filters.delayedOnly ? 1 : 0)
  const tabs: [Tab, string, string][] = [
    ['orders', t('act.orders'), String(data.openOrders)],
    ['docks', t('act.docks'), `${data.docksBusy}/${data.docksTotal}`],
    ['forklifts', t('act.forklifts'), `${data.forkliftsBusy}/${data.forkliftsTotal}`],
    ['trucks', t('act.trucks'), String(data.trucksTotal)],
  ]

  return (
    <section className={`float card activity${selection ? ' is-covered' : ''}`} aria-label={t('act.aria')}>
      <div className="tabs-row">
        <div className="tabs" role="tablist">
          {tabs.map(([key, label, count]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' is-active' : ''}`} onClick={() => setTab(key)}>
              {label} <small>{count}</small>
            </button>
          ))}
        </div>
        <span className="site-name">{site?.name ?? ''}</span>
        <button
          className={`filter-toggle${showFilters || activeFilters ? ' is-on' : ''}`}
          onClick={() => {
            setShowFilters((v) => !v)
            setTab('trucks')
          }}
          aria-label={t('act.filterAria')}
          aria-expanded={showFilters}
          title={t('act.filter')}
        >
          <Icon name="filter" size={16} />
          {activeFilters > 0 && <span className="badge">{activeFilters}</span>}
        </button>
      </div>

      {showFilters && tab === 'trucks' && (
        <div className="filters">
          <button className={`chip${filters.delayedOnly ? ' is-active' : ''}`} onClick={() => setFilters({ delayedOnly: !filters.delayedOnly })} aria-pressed={filters.delayedOnly}>
            {t('act.delayedOnly')}
          </button>
          {TRUCK_STATUSES.filter((s) => data.statusCounts.has(s) || filters.truckStatus === s).map((status) => (
            <button
              key={status}
              className={`chip${filters.truckStatus === status ? ' is-active' : ''}`}
              onClick={() => setFilters({ truckStatus: filters.truckStatus === status ? 'all' : status })}
              aria-pressed={filters.truckStatus === status}
            >
              {truckStatusLabel[status]} <small>{data.statusCounts.get(status) ?? 0}</small>
            </button>
          ))}
        </div>
      )}

      <ul className="list" role="tabpanel">
        {rows.length === 0 && <li className="empty">{tab === 'orders' ? t('ord.none') : t('act.noMatch')}</li>}
        {rows.map((r) => {
          const selected = selection?.kind === r.target.kind && selection.id === r.target.id
          return (
            <li key={r.key}>
              <button className={`list-row${selected ? ' is-selected' : ''}${r.lead ? ' has-lead' : ''}`} onClick={() => focus(r.target)}>
                <span className="list-id order-row-main">
                  {r.lead}
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <b>{r.title}</b>
                    <span>{r.sub}</span>
                  </span>
                </span>
                <span className="list-text">
                  {r.textDot && <span className="dot" style={{ background: r.textDot }} />}
                  <span>{r.text}</span>
                </span>
                <Pill tone={r.pill.tone}>{r.pill.label}</Pill>
                <span className="list-meta">
                  <span>{r.meta}</span>
                  {r.progress && <Bar value={r.progress.value} tone={r.progress.tone} />}
                </span>
                <Icon name="chevronRight" size={14} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
