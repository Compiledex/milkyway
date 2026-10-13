import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { brand } from '../brand'
import { isDelayed, isLowStock } from '../data/rules'
import type { Customer, Forklift, Id, InventoryItem, Shipment, Truck } from '../data/types'
import { useLang, useT, type StringKey } from '../i18n'
import { useSiteKpis } from '../store/selectors'
import { parseRackId, rackId, useWarehouse, type Selection } from '../store/warehouseStore'
import { ProductBadge, ShopLogo } from './Badges'
import { Bar, Pill } from './Bits'
import { dockStatusLabel, fmtNumber, fmtPercent, fmtRelative, fmtTime, forkliftStatusLabel, minutesLeft, rackLabel, shipmentStatusLabel, truckStatusLabel } from './format'
import { Icon, type IconName } from './icons'
import { dockTone, forkliftTone, shipmentTone, truckTone } from './tones'

type T = ReturnType<typeof useT>

export function InspectorPanel() {
  const selection = useWarehouse((s) => s.selection)
  useLang((s) => s.lang)
  return (
    <aside className={`float card inspector${selection ? '' : ' is-overview'}`} aria-live="polite" key={selection ? `${selection.kind}:${selection.id}` : 'overview'}>
      {selection ? <Detail selection={selection} /> : <SiteOverview />}
    </aside>
  )
}

function Detail({ selection }: { selection: Selection }) {
  switch (selection.kind) {
    case 'truck':
      return <TruckInfo id={selection.id} />
    case 'forklift':
      return <ForkliftInfo id={selection.id} />
    case 'dock':
      return <DockInfo id={selection.id} />
    case 'rack':
      return <RackInfo id={selection.id} />
    case 'shipment':
      return <ShipmentInfo id={selection.id} />
  }
}

function Head({ icon, kind, title, sub, selection }: { icon: IconName | ReactNode; kind: string; title: string; sub?: string; selection?: Selection }) {
  const t = useT()
  const select = useWarehouse((s) => s.select)
  const focus = useWarehouse((s) => s.focus)
  const follow = useWarehouse((s) => s.follow)
  const setFollow = useWarehouse((s) => s.setFollow)
  const canFollow = selection?.kind === 'truck' || selection?.kind === 'forklift' || selection?.kind === 'shipment'
  return (
    <header className="insp-head">
      {typeof icon === 'string' ? (
        <div className="insp-icon">
          <Icon name={icon as IconName} size={22} />
        </div>
      ) : (
        icon
      )}
      <div className="insp-title">
        <div className="insp-kind">{kind}</div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {selection && (
        <div className="insp-actions">
          {canFollow ? (
            <button
              className={follow ? 'is-on' : ''}
              onClick={() => (follow ? setFollow(false) : focus(selection))}
              aria-pressed={follow}
              aria-label={follow ? t('insp.unfollow') : t('insp.follow')}
              title={follow ? t('insp.unfollow') : t('insp.follow')}
            >
              <Icon name="follow" />
            </button>
          ) : (
            <button onClick={() => focus(selection)} aria-label={t('insp.showOnMap')} title={t('insp.showOnMap')}>
              <Icon name="focus" />
            </button>
          )}
          <button onClick={() => select(null)} aria-label={t('insp.close')} title={t('insp.close')}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </header>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function useSiteCode(siteId: Id | undefined) {
  return useWarehouse((s) => s.sites.find((x) => x.id === siteId)?.code ?? '')
}

/** Picked/loaded (orders) or unloaded/stored (supplier deliveries) side by side. */
function ShipmentProgress({ sh }: { sh: Shipment }) {
  const t = useT()
  const out = sh.direction === 'outbound'
  return (
    <div className="progress-pair">
      <div>
        {out ? t('ord.picked', { n: sh.palletsStaged, p: sh.pallets }) : t('ord.unloaded', { n: sh.palletsStaged, p: sh.pallets })}
        <Bar value={sh.palletsStaged / sh.pallets} tone="info" />
      </div>
      <div>
        {out ? t('ord.loaded', { n: sh.palletsDone, p: sh.pallets }) : t('ord.stored', { n: sh.palletsDone, p: sh.pallets })}
        <Bar value={sh.palletsDone / sh.pallets} tone="good" />
      </div>
    </div>
  )
}

/** Compact order card, used inside truck, forklift and door details. */
function ShipmentCard({ sh }: { sh: Shipment }) {
  const t = useT()
  const focus = useWarehouse((s) => s.focus)
  const customer = useWarehouse((s) => (sh.customerId ? s.customers[sh.customerId] : undefined))
  return (
    <button className="ship-card" style={{ width: '100%', marginTop: 10 }} onClick={() => focus({ kind: 'shipment', id: sh.id })}>
      {customer ? (
        <ShopLogo customer={customer} size={40} />
      ) : (
        <span className="truck-thumb">
          <Icon name="arrowIn" size={22} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{sh.reference}</b>
        <span className="muted">{customer?.name ?? t('insp.inboundFrom', { supplier: sh.supplier ?? '' })}</span>
        <Pill tone={shipmentTone[sh.status]}>{shipmentStatusLabel[sh.status]}</Pill>
      </span>
      <Icon name="chevronRight" size={16} />
    </button>
  )
}

// --- Truck --------------------------------------------------------------------

function truckWhere(truck: Truck, ctx: { now: number; code: string; customer?: Customer; dock?: number; shipment?: Shipment }, t: T) {
  const rel = truck.eta ? fmtRelative(truck.eta, ctx.now) : ''
  switch (truck.status) {
    case 'to-terminal':
      return truck.role === 'supplier' && ctx.shipment?.supplier
        ? `${t('insp.inboundFrom', { supplier: ctx.shipment.supplier })} · ${rel}`
        : t('insp.fromShop', { site: ctx.code, rel })
    case 'to-customer':
      return t('insp.toShop', { shop: ctx.customer?.name ?? '', rel })
    case 'at-customer':
      return t('insp.atShop', { shop: ctx.customer?.name ?? '' })
    case 'away':
      return t('insp.away', { rel })
    case 'queued':
      return t('insp.waitingDock', { site: ctx.code })
    case 'waiting':
      return ctx.shipment ? t('insp.atDock', { site: ctx.code, n: ctx.dock ?? '' }) : t('insp.waitingOrder')
    default:
      return ctx.dock ? t('insp.atDock', { site: ctx.code, n: ctx.dock }) : ctx.code
  }
}

function TruckInfo({ id }: { id: Id }) {
  const t = useT()
  const truck = useWarehouse((s) => s.trucks[id])
  const shipment = useWarehouse((s) => (truck?.shipmentId ? s.shipments[truck.shipmentId] : undefined))
  const customer = useWarehouse((s) => (truck?.customerId ? s.customers[truck.customerId] : undefined))
  const dock = useWarehouse((s) => (truck?.dockId ? s.docks[truck.dockId] : undefined))
  const now = useWarehouse((s) => s.time)
  const code = useSiteCode(truck?.siteId)
  if (!truck) return null
  const loading = shipment && (truck.status === 'loading' || truck.status === 'waiting')
  return (
    <>
      <Head icon="truck" kind={`${t(`insp.role.${truck.role}` as StringKey)} · ${truck.carrier}`} title={truck.plate} sub={`${t('insp.truck')} · ${code}`} selection={{ kind: 'truck', id }} />
      <div className="insp-status">
        <Pill tone={truckTone[truck.status]}>{truckStatusLabel[truck.status]}</Pill>
        <span>{truckWhere(truck, { now, code, customer, dock: dock?.number, shipment }, t)}</span>
      </div>
      {shipment && <ShipmentCard sh={shipment} />}
      <dl>
        {shipment && <ShipmentProgress sh={shipment} />}
        {loading && shipment && <Row label={t('insp.done')}>{t('insp.doneIn', { n: minutesLeft(shipment.pallets, shipment.palletsDone) })}</Row>}
        {truck.eta && <Row label={t('ord.eta')}>{`${fmtTime(truck.eta)} (${fmtRelative(truck.eta, now)})`}</Row>}
        {customer && (
          <Row label={t('insp.customerLabel')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShopLogo customer={customer} size={18} />
              {customer.name}
            </span>
          </Row>
        )}
        <Row label={t('insp.site')}>{code}</Row>
      </dl>
    </>
  )
}

// --- Forklift -------------------------------------------------------------------

function forkliftTask(fl: Forklift, s: { shipments: Record<Id, Shipment>; inventory: Record<Id, InventoryItem> }, t: T) {
  if (fl.status === 'charging') return t('task.charging')
  const task = fl.task
  if (!task) return fl.status === 'moving' ? t('task.toCharger') : t('task.waiting')
  const item = s.inventory[task.itemId]?.name ?? ''
  const ref = s.shipments[task.shipmentId]?.reference ?? ''
  const fetching = task.phase === 'to-pickup' || task.phase === 'lift'
  if (task.kind === 'pick') return fetching ? t('task.fetch', { item, ref }) : t('task.toDoor', { item, n: task.dockNumber })
  return fetching ? t('task.fetchDoor', { n: task.dockNumber }) : t('task.store', { item })
}

function ForkliftInfo({ id }: { id: Id }) {
  const t = useT()
  const fl = useWarehouse((s) => s.forklifts[id])
  const shipments = useWarehouse((s) => s.shipments)
  const inventory = useWarehouse((s) => s.inventory)
  const code = useSiteCode(fl?.siteId)
  if (!fl) return null
  const job = fl.task ? shipments[fl.task.shipmentId] : undefined
  const cargo = fl.carrying && fl.task ? inventory[fl.task.itemId] : undefined
  const batteryTone = fl.battery < 20 ? 'bad' : fl.battery < 40 ? 'warn' : 'good'
  return (
    <>
      <Head icon="forklift" kind={`${t('insp.forklift')} · ${code}`} title={fl.name} sub={fl.id.toUpperCase()} selection={{ kind: 'forklift', id }} />
      <div className="insp-status">
        <Pill tone={forkliftTone[fl.status]}>{forkliftStatusLabel[fl.status]}</Pill>
        <span>{forkliftTask(fl, { shipments, inventory }, t)}</span>
      </div>
      <div className="insp-progress">
        <Bar value={fl.battery / 100} tone={batteryTone} />
        <span className="num">{t('insp.battery', { n: Math.round(fl.battery) })}</span>
      </div>
      {job && <ShipmentCard sh={job} />}
      <dl>
        <Row label={t('insp.carrying')}>
          {cargo ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ProductBadge item={cargo} size={18} />
              {cargo.name}
            </span>
          ) : (
            t('insp.empty')
          )}
        </Row>
        <Row label={t('insp.moves')}>
          <span className="num">{fl.movesToday}</span>
        </Row>
        <Row label={t('insp.charging')}>{fl.status === 'charging' ? t('insp.chargingStation') : fl.battery < 20 ? t('insp.needsCharge') : t('insp.noCharge')}</Row>
      </dl>
    </>
  )
}

// --- Dock ---------------------------------------------------------------------------

function DockInfo({ id }: { id: Id }) {
  const t = useT()
  const dock = useWarehouse((s) => s.docks[id])
  const truck = useWarehouse((s) => (dock?.truckId ? s.trucks[dock.truckId] : undefined))
  const shipments = useWarehouse((s) => s.shipments)
  const focus = useWarehouse((s) => s.focus)
  const code = useSiteCode(dock?.siteId)
  const atDoor = useMemo(
    () => Object.values(shipments).find((sh) => sh.dockId === id && ['picking', 'picked', 'loading', 'arrived', 'unloading'].includes(sh.status)),
    [shipments, id],
  )
  const handledToday = useMemo(() => Object.values(shipments).filter((sh) => sh.dockId === id && (sh.events.departed || sh.events.unloaded)).length, [shipments, id])
  if (!dock) return null
  return (
    <>
      <Head icon="door" kind={`${t('insp.dock')} · ${code}`} title={t('insp.port', { n: dock.number })} sub={dock.id.toUpperCase()} selection={{ kind: 'dock', id }} />
      <div className="insp-status">
        {truck ? <Pill tone={truckTone[truck.status]}>{truckStatusLabel[truck.status]}</Pill> : <Pill tone={dockTone[dock.status]}>{dockStatusLabel[dock.status]}</Pill>}
        <span>{truck ? `${truck.plate} · ${truck.carrier}` : dock.status === 'maintenance' ? t('insp.closedService') : t('insp.readyNext')}</span>
      </div>
      {atDoor && <ShipmentCard sh={atDoor} />}
      <dl>
        {atDoor && <ShipmentProgress sh={atDoor} />}
        <Row label={t('insp.truckLabel')}>
          {truck ? (
            <button className="link" onClick={() => focus({ kind: 'truck', id: truck.id })}>
              {truck.plate}
            </button>
          ) : (
            '–'
          )}
        </Row>
        <Row label={t('insp.trucksToday')}>
          <span className="num">{handledToday}</span>
        </Row>
      </dl>
    </>
  )
}

// --- Rack -------------------------------------------------------------------------

function RackInfo({ id }: { id: Id }) {
  const t = useT()
  const { siteId, aisle, bay } = parseRackId(id)
  const inventory = useWarehouse((s) => s.inventory)
  const code = useSiteCode(siteId)
  const items = Object.values(inventory)
    .filter((it) => it.siteId === siteId && it.location.aisle === aisle && it.location.bay === bay)
    .sort((a, b) => b.location.level - a.location.level)
  const low = items.filter(isLowStock).length
  return (
    <>
      <Head
        icon="pallet"
        kind={`${t('insp.rack')} · ${code}`}
        title={t('insp.rackTitle', { rack: rackLabel(aisle, bay) })}
        sub={t('insp.rackSub', { aisle: rackLabel(aisle, bay)[0], n: items.length })}
        selection={{ kind: 'rack', id }}
      />
      <div className="insp-status">
        {items.length === 0 ? <Pill>{t('insp.rackEmpty')}</Pill> : low ? <Pill tone="warn">{t('insp.belowReorder', { n: low })}</Pill> : <Pill tone="good">{t('insp.stockOk')}</Pill>}
      </div>
      {items.length === 0 && <p className="muted">{t('insp.noItems')}</p>}
      {items.map((it) => (
        <InventoryRow key={it.id} item={it} detail={t('insp.level', { n: it.location.level + 1, sku: it.sku })} />
      ))}
    </>
  )
}

function InventoryRow({ item, detail, onClick }: { item: InventoryItem; detail?: string; onClick?: () => void }) {
  const t = useT()
  const low = isLowStock(item)
  return (
    <button className="inv-row" onClick={onClick} disabled={!onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <ProductBadge item={item} size={28} />
      <span className="inv-name">
        {item.name}
        {detail && (
          <>
            <br />
            <small className="muted">{detail}</small>
          </>
        )}
      </span>
      <span className="inv-qty">{fmtNumber(item.quantity)}</span>
      <Pill tone={low ? 'warn' : 'good'} dot={false}>
        {low ? t('insp.low') : t('insp.inStock')}
      </Pill>
    </button>
  )
}

// --- Order / supplier delivery --------------------------------------------------------

function ShipmentInfo({ id }: { id: Id }) {
  const t = useT()
  const sh = useWarehouse((s) => s.shipments[id])
  const customer = useWarehouse((s) => (sh?.customerId ? s.customers[sh.customerId] : undefined))
  const truck = useWarehouse((s) => (sh?.truckId ? s.trucks[sh.truckId] : undefined))
  const dock = useWarehouse((s) => (sh?.dockId ? s.docks[sh.dockId] : undefined))
  const inventory = useWarehouse((s) => s.inventory)
  const now = useWarehouse((s) => s.time)
  const focus = useWarehouse((s) => s.focus)
  const code = useSiteCode(sh?.siteId)
  if (!sh) return null
  const out = sh.direction === 'outbound'
  const delayed = isDelayed(sh, now)
  let where = ''
  if (!out) where = t('insp.inboundFrom', { supplier: sh.supplier ?? '' })
  else if (sh.status === 'in-transit' && sh.eta) where = t('insp.toShop', { shop: customer?.name ?? '', rel: fmtRelative(sh.eta, now) })
  else if (sh.status === 'at-customer') where = t('insp.atShop', { shop: customer?.name ?? '' })
  else if (sh.status === 'delivered' && sh.events.delivered) where = t('ord.deliveredAt', { time: fmtTime(sh.events.delivered) })
  else if (dock) where = t('insp.atDock', { site: code, n: dock.number })
  else if (sh.status === 'received') where = t('ord.waitingDoor')
  return (
    <>
      <Head
        icon={customer ? <ShopLogo customer={customer} size={44} /> : 'arrowIn'}
        kind={`${out ? t('ord.kind') : t('ord.inbound')} · ${code}`}
        title={sh.reference}
        sub={out ? `${customer?.name ?? ''} · ${customer?.address ?? ''}` : (sh.supplier ?? '')}
        selection={{ kind: 'shipment', id }}
      />
      <div className="insp-status">
        <Pill tone={delayed ? 'warn' : shipmentTone[sh.status]}>{shipmentStatusLabel[sh.status]}</Pill>
        <span>{where}</span>
      </div>
      <ShipmentProgress sh={sh} />
      <dl>
        <Row label={t('ord.created')}>{fmtTime(sh.events.created)}</Row>
        <Row label={out ? t('ord.requested') : t('insp.slot')}>
          <span style={{ color: delayed ? 'var(--bad)' : undefined }}>{fmtTime(sh.scheduledAt)}</span>
        </Row>
        {sh.eta && <Row label={t('ord.eta')}>{`${fmtTime(sh.eta)} (${fmtRelative(sh.eta, now)})`}</Row>}
        <Row label={t('ord.door')}>{dock ? t('insp.port', { n: dock.number }) : '–'}</Row>
        <Row label={t('ord.truck')}>
          {truck ? (
            <button className="link" onClick={() => focus({ kind: 'truck', id: truck.id })}>
              {truck.plate}
            </button>
          ) : (
            t('ord.waitingTruck')
          )}
        </Row>
        <Row label={t('ord.pallets')}>{sh.pallets}</Row>
      </dl>
      <div className="section-head">{t('ord.lines')}</div>
      <ul className="order-lines">
        {sh.lines.map((l) => {
          const it = inventory[l.itemId]
          return (
            <li key={l.itemId}>
              <ProductBadge item={it} size={26} />
              <span>{it?.name ?? l.itemId}</span>
              <span>
                {l.quantity} {it?.unit}
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// --- Site overview (nothing selected) -------------------------------------------

function SiteOverview() {
  const t = useT()
  const siteId = useWarehouse((s) => s.activeSiteId)
  const site = useWarehouse((s) => s.sites.find((x) => x.id === siteId))
  const shipments = useWarehouse((s) => s.shipments)
  const inventory = useWarehouse((s) => s.inventory)
  const forklifts = useWarehouse((s) => s.forklifts)
  const trucks = useWarehouse((s) => s.trucks)
  const focus = useWarehouse((s) => s.focus)
  const k = useSiteKpis(siteId)

  const stats = useMemo(() => {
    const own = Object.values(shipments).filter((sh) => sh.siteId === siteId)
    const items = Object.values(inventory)
      .filter((i) => i.siteId === siteId)
      .sort((a, b) => a.quantity / a.capacity - b.quantity / b.capacity)
    const fl = Object.values(forklifts).filter((f) => f.siteId === siteId)
    return {
      outbound: own.filter((sh) => sh.direction === 'outbound' && sh.events.departed).length,
      inbound: own.filter((sh) => sh.direction === 'inbound' && sh.events.arrived).length,
      items: items.slice(0, 5),
      working: fl.filter((f) => f.task).length,
      fleet: fl.length,
      queued: Object.values(trucks).filter((tr) => tr.siteId === siteId && tr.status === 'queued').length,
    }
  }, [shipments, inventory, forklifts, trucks, siteId])

  if (!site || !k) return null
  return (
    <>
      <Head icon="store" kind={`${t(`ov.kind.${brand.id}` as StringKey)} · ${site.code}`} title={site.name} sub={site.city} />
      <div className="insp-status">
        <Pill tone="good">{t('ov.operational')}</Pill>
        <span>{t('ov.summary', { d: k.docksInUse, r: k.inboundTrucks, q: stats.queued })}</span>
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="tile-label">{t('ov.stock')}</div>
          <div className="tile-value num">
            {fmtNumber(k.stock)} <small>/ {fmtNumber(k.capacity)}</small>
          </div>
          <Bar value={k.capacity ? k.stock / k.capacity : 0} />
        </div>
        <div className="tile">
          <div className="tile-label">{t('ov.docks')}</div>
          <div className="tile-value num">
            {k.docksInUse} <small>{t('ov.openDocks', { n: k.docksAvailable })}</small>
          </div>
          <Bar value={k.docksAvailable ? k.docksInUse / k.docksAvailable : 0} tone="good" />
        </div>
        <div className="tile">
          <div className="tile-label">{t('ov.outToday')}</div>
          <div className="tile-value num">
            {stats.outbound} <small>{t('ov.trucksUnit', { n: stats.outbound })}</small>
          </div>
        </div>
        <div className="tile">
          <div className="tile-label">{t('ov.inToday')}</div>
          <div className="tile-value num">
            {stats.inbound} <small>{t('ov.trucksUnit', { n: stats.inbound })}</small>
          </div>
        </div>
      </div>
      <div className="section-head">
        {t('ov.items')} <span>{t('ov.itemsHint')}</span>
      </div>
      {stats.items.map((it) => (
        <InventoryRow key={it.id} item={it} onClick={() => focus({ kind: 'rack', id: rackId(it.siteId, it.location.aisle, it.location.bay) })} />
      ))}
      <div className="section-head">
        {t('ov.forklifts')} <span>{t('ov.working', { w: stats.working, t: stats.fleet })}</span>
      </div>
      <Bar value={stats.fleet ? stats.working / stats.fleet : 0} tone="good" />
      <dl>
        <Row label={t('ov.onTime')}>{fmtPercent(k.onTimeRate, 1)}</Row>
        <Row label={t('ov.delays')}>{k.delayed ? t('ov.delaysValue', { n: k.delayed }) : t('ov.none')}</Row>
      </dl>
    </>
  )
}
