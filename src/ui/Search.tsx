import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang, useT } from '../i18n'
import { rackId, useWarehouse, type Selection } from '../store/warehouseStore'
import { ShopLogo, ProductBadge } from './Badges'
import { forkliftStatusLabel, rackLabel, shipmentStatusLabel, truckStatusLabel } from './format'
import { Icon, type IconName } from './icons'
import { useDismiss } from './useDismiss'

interface Hit {
  key: string
  group: string
  icon: React.ReactNode
  title: string
  sub: string
  target: Selection
}

const norm = (s: string) => s.toLocaleLowerCase()

/** Search across orders, shops, trucks, forklifts and products in all sites. Press / to focus. */
export function Search() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const close = useMemo(() => () => setOpen(false), [])
  const ref = useDismiss(open, close)
  const focus = useWarehouse((s) => s.focus)
  const trucks = useWarehouse((s) => s.trucks)
  const forklifts = useWarehouse((s) => s.forklifts)
  const shipments = useWarehouse((s) => s.shipments)
  const inventory = useWarehouse((s) => s.inventory)
  const customers = useWarehouse((s) => s.customers)
  const sites = useWarehouse((s) => s.sites)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const term = norm(q.trim())
    if (!term) return []
    const code = (siteId: string) => sites.find((s) => s.id === siteId)?.code ?? ''
    const icon = (name: IconName) => <Icon name={name} />
    const out: Hit[] = []
    for (const sh of Object.values(shipments)) {
      const c = sh.customerId ? customers[sh.customerId] : undefined
      if (norm(`${sh.reference} ${c?.name ?? ''} ${sh.supplier ?? ''}`).includes(term))
        out.push({
          key: sh.id,
          group: t('search.orders'),
          icon: c ? <ShopLogo customer={c} size={24} /> : icon('arrowIn'),
          title: `${sh.reference} · ${c?.name ?? sh.supplier ?? ''}`,
          sub: `${code(sh.siteId)} · ${shipmentStatusLabel[sh.status]}`,
          target: { kind: 'shipment', id: sh.id },
        })
    }
    for (const tr of Object.values(trucks)) {
      if (norm(`${tr.plate} ${tr.carrier}`).includes(term))
        out.push({ key: tr.id, group: t('search.trucks'), icon: icon('truck'), title: tr.plate, sub: `${tr.carrier} · ${code(tr.siteId)} · ${truckStatusLabel[tr.status]}`, target: { kind: 'truck', id: tr.id } })
    }
    for (const f of Object.values(forklifts)) {
      if (norm(f.name).includes(term))
        out.push({ key: f.id, group: t('search.forklifts'), icon: icon('forklift'), title: f.name, sub: `${code(f.siteId)} · ${forkliftStatusLabel[f.status]}`, target: { kind: 'forklift', id: f.id } })
    }
    for (const it of Object.values(inventory)) {
      if (norm(`${it.name} ${it.sku}`).includes(term))
        out.push({
          key: it.id,
          group: t('search.items'),
          icon: <ProductBadge item={it} size={24} />,
          title: it.name,
          sub: `${code(it.siteId)} · ${t('search.rack', { rack: rackLabel(it.location.aisle, it.location.bay) })} · ${it.quantity} ${it.unit}`,
          target: { kind: 'rack', id: rackId(it.siteId, it.location.aisle, it.location.bay) },
        })
    }
    return out.slice(0, 14)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, trucks, forklifts, shipments, inventory, customers, sites, lang])

  const choose = (hit: Hit) => {
    focus(hit.target)
    setOpen(false)
    setQ('')
    input.current?.blur()
  }

  return (
    <div className="search" ref={ref}>
      <label className="search-field">
        <Icon name="search" size={17} />
        <input
          ref={input}
          value={q}
          placeholder={t('search.placeholder')}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(hits.length - 1, a + 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
            else if (e.key === 'Enter' && hits[active]) choose(hits[active])
          }}
          aria-label={t('search.label')}
        />
        <kbd>/</kbd>
      </label>
      {open && q.trim() && (
        <div className="dropdown" role="listbox">
          {hits.length === 0 && <div className="dropdown-empty">{t('search.none', { q })}</div>}
          {hits.map((h, i) => (
            <div key={h.key}>
              {(i === 0 || hits[i - 1].group !== h.group) && <div className="dropdown-label">{h.group}</div>}
              <button className={`dropdown-row${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(h)}>
                {h.icon}
                <span className="row-main">
                  <span>{h.title}</span>
                  <span>{h.sub}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
