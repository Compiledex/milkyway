import { useMemo } from 'react'
import { isClosed, isDelayed } from '../data/rules'
import type { Shipment } from '../data/types'
import { useLang, useT } from '../i18n'
import { useWarehouse } from '../store/warehouseStore'
import { ShopLogo } from './Badges'
import { Pill } from './Bits'
import { fmtRelative, fmtTime, minutesLeft, shipmentStatusLabel } from './format'
import { Icon, type IconName } from './icons'
import { shipmentTone } from './tones'

interface Step {
  label: string
  at: number | null | undefined
  /** Expected time when the step hasn't happened yet. */
  expected?: number | null
  icon: IconName
  done: boolean
  current: boolean
}

type T = ReturnType<typeof useT>

/** Steps built only from events the data actually reports. */
function stepsFor(sh: Shipment, t: T): Step[] {
  const e = sh.events
  const n = `${sh.palletsStaged}/${sh.pallets}`
  const d = `${sh.palletsDone}/${sh.pallets}`
  if (sh.direction === 'outbound') {
    return [
      { label: t('tl.received'), at: e.created, icon: 'receipt', done: true, current: false },
      { label: t('tl.picking', { p: n }), at: e.picked ?? e.pickingStarted, icon: 'forklift', done: !!(e.picked ?? e.loaded), current: sh.status === 'picking' },
      { label: t('tl.loading', { p: d }), at: e.loaded ?? e.loadingStarted, icon: 'pallet', done: !!e.loaded, current: sh.status === 'loading' || (sh.status === 'picked' && !!sh.truckId) },
      { label: t('tl.transit'), at: e.departed, icon: 'truck', done: !!e.arrived, current: sh.status === 'in-transit' },
      { label: t('tl.delivered'), at: e.delivered ?? e.arrived, expected: sh.eta ?? sh.scheduledAt, icon: 'store', done: !!e.delivered, current: sh.status === 'at-customer' },
    ]
  }
  return [
    { label: t('tl.booked'), at: e.created, icon: 'receipt', done: true, current: false },
    { label: t('tl.transit'), at: e.departed, icon: 'truck', done: !!e.arrived, current: sh.status === 'in-transit' },
    { label: t('tl.arrived'), at: e.arrived, expected: sh.eta ?? sh.scheduledAt, icon: 'door', done: !!e.unloadingStarted, current: sh.status === 'arrived' },
    { label: t('tl.unloading', { p: n }), at: e.unloaded ?? e.unloadingStarted, icon: 'pallet', done: !!e.unloaded, current: sh.status === 'unloading' && !e.unloaded },
    { label: t('tl.stored', { p: d }), at: e.stored, icon: 'box', done: !!e.stored, current: !!e.unloaded && !e.stored },
  ]
}

/** Timeline for the selected order, or the busiest open order at the active site. */
export function ShipmentTracker() {
  const t = useT()
  useLang((s) => s.lang)
  const selection = useWarehouse((s) => s.selection)
  const siteId = useWarehouse((s) => s.activeSiteId)
  const shipments = useWarehouse((s) => s.shipments)
  const trucks = useWarehouse((s) => s.trucks)
  const docks = useWarehouse((s) => s.docks)
  const customers = useWarehouse((s) => s.customers)
  const now = useWarehouse((s) => s.time)
  const focus = useWarehouse((s) => s.focus)

  const shipment = useMemo(() => {
    if (selection?.kind === 'shipment') return shipments[selection.id] ?? null
    const truckId = selection?.kind === 'truck' ? selection.id : selection?.kind === 'dock' ? docks[selection.id]?.truckId : null
    const own = truckId ? trucks[truckId]?.shipmentId : null
    if (own && shipments[own]) return shipments[own]
    if (selection?.kind === 'dock') {
      const atDoor = Object.values(shipments).find((sh) => sh.dockId === selection.id && !isClosed(sh) && sh.status !== 'in-transit')
      if (atDoor) return atDoor
    }
    const rank: Record<string, number> = { loading: 0, picking: 1, 'in-transit': 2, picked: 3, 'at-customer': 4, unloading: 5, received: 6 }
    return (
      Object.values(shipments)
        .filter((sh) => sh.siteId === siteId && sh.direction === 'outbound' && !isClosed(sh))
        .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))[0] ?? null
    )
  }, [selection, siteId, shipments, trucks, docks])

  if (!shipment) return null
  const customer = shipment.customerId ? customers[shipment.customerId] : undefined
  const truck = shipment.truckId ? trucks[shipment.truckId] : undefined
  const dock = shipment.dockId ? docks[shipment.dockId] : undefined
  const steps = stepsFor(shipment, t)
  const delayed = isDelayed(shipment, now)

  let detail = ''
  if (shipment.status === 'in-transit' && shipment.eta) detail = t('tr.etaRel', { time: fmtTime(shipment.eta), rel: fmtRelative(shipment.eta, now) })
  else if (dock && !isClosed(shipment)) detail = t('tr.dockLeft', { n: dock.number, m: minutesLeft(shipment.pallets, shipment.palletsDone) })
  else if (shipment.events.delivered) detail = t('ord.deliveredAt', { time: fmtTime(shipment.events.delivered) })

  return (
    <section className="float card tracker" aria-label={t('tl.title')}>
      <div className="tracker-head">
        <b>
          <Icon name="route" /> {t('tl.title')}
        </b>
        <span>{truck ? `${truck.plate} · ${truck.carrier}` : t('ord.waitingTruck')}</span>
      </div>
      <div className="steps">
        {steps.map((step) => (
          <div key={step.icon + step.label} className={`step${step.done ? ' done' : step.current ? ' current' : ''}`}>
            <span className="step-dot">
              <Icon name={step.done ? 'check' : step.icon} size={14} />
            </span>
            <span className="step-label">{step.label}</span>
            <span className="step-time num">
              {step.at ? fmtTime(step.at) : step.expected ? `${t('tr.eta')} ${fmtTime(step.expected)}` : '–'}
            </span>
          </div>
        ))}
      </div>
      <button className="ship-card" onClick={() => focus({ kind: 'shipment', id: shipment.id })}>
        {customer ? (
          <ShopLogo customer={customer} size={46} />
        ) : (
          <span className="truck-thumb">
            <Icon name="arrowIn" size={24} />
          </span>
        )}
        <span>
          <b>{shipment.reference}</b>
          <span className="muted">{customer ? t('tr.to', { site: customer.name }) : t('tr.from', { site: shipment.supplier ?? '' })}</span>
          <Pill tone={delayed ? 'warn' : shipmentTone[shipment.status]}>{delayed ? t('tr.delayed') : shipmentStatusLabel[shipment.status]}</Pill>
          <span className="muted">{detail}</span>
        </span>
      </button>
    </section>
  )
}
