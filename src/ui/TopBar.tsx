import { useMemo, useState } from 'react'
import { brand } from '../brand'
import { MilkywayMark } from '../brand/logos'
import { isDelayed, isLowStock } from '../data/rules'
import { LANGUAGES, useLang, useT, type StringKey } from '../i18n'
import { computeKpis } from '../store/selectors'
import { rackId, useWarehouse, type Selection } from '../store/warehouseStore'
import { fmtPercent, fmtTime, rackLabel } from './format'
import { Icon, type IconName } from './icons'
import { Search } from './Search'
import { useDismiss } from './useDismiss'

export function TopBar() {
  const t = useT()
  return (
    <header className="topbar">
      <div className="brand">
        <brand.Logo />
        <div className="brand-text">
          {brand.appMark && <MilkywayMark size={30} />}
          <div>
            <div className="brand-name">{t(`brand.${brand.id}.appName` as StringKey)}</div>
            <div className="brand-tagline">{t(`brand.${brand.id}.tagline` as StringKey)}</div>
          </div>
        </div>
      </div>
      <Search />
      <div className="topbar-right">
        <SitePicker />
        <Live />
        <TimeControl />
        <Alerts />
        <LanguageSwitch />
        <div className="user">
          <div className="avatar">KN</div>
          <div className="user-text">
            <b>Kari Nordmann</b>
            <span>{t('top.role')}</span>
          </div>
        </div>
      </div>
    </header>
  )
}

function LanguageSwitch() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const [open, setOpen] = useState(false)
  const close = useMemo(() => () => setOpen(false), [])
  const ref = useDismiss(open, close)
  const current = LANGUAGES.find((l) => l.code === lang)!
  return (
    <div className="lang" ref={ref}>
      <button className="lang-button" onClick={() => setOpen((v) => !v)} aria-label={t('lang.label')} aria-expanded={open} title={t('lang.label')}>
        <Icon name="globe" size={16} />
        {current.short}
      </button>
      {open && (
        <div className="dropdown" role="listbox" aria-label={t('lang.label')}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              role="option"
              aria-selected={l.code === lang}
              className={`dropdown-row${l.code === lang ? ' is-active' : ''}`}
              onClick={() => {
                setLang(l.code)
                setOpen(false)
              }}
            >
              <span className="site-code">{l.short}</span>
              <span className="row-main">
                <span>{l.name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SitePicker() {
  const t = useT()
  const sites = useWarehouse((s) => s.sites)
  const activeSiteId = useWarehouse((s) => s.activeSiteId)
  const setActiveSite = useWarehouse((s) => s.setActiveSite)
  const inventory = useWarehouse((s) => s.inventory)
  const docks = useWarehouse((s) => s.docks)
  const lang = useLang((s) => s.lang)
  const [open, setOpen] = useState(false)
  const close = useMemo(() => () => setOpen(false), [])
  const ref = useDismiss(open, close)

  const stats = useMemo(() => {
    const state = useWarehouse.getState()
    return Object.fromEntries(
      sites.map((site) => {
        const k = computeKpis(state, site.id)
        return [site.id, t('top.siteStats', { fill: fmtPercent(k.capacity ? k.stock / k.capacity : 0), docked: k.docksInUse, total: k.docksTotal })]
      }),
    )
    // Recompute when stock, doors or language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, inventory, docks, lang])
  const active = sites.find((s) => s.id === activeSiteId)

  return (
    <div className="site-picker" ref={ref}>
      <button className="site-button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox">
        <span className="site-code">{active?.code}</span>
        <span className="site-meta">
          <b>
            {active?.name} · {active?.city}
          </b>
          <span>{active ? stats[active.id] : ''}</span>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="dropdown" role="listbox">
          <div className="dropdown-label">{t('top.sites')}</div>
          {sites.map((site) => (
            <button
              key={site.id}
              role="option"
              aria-selected={site.id === activeSiteId}
              className={`dropdown-row${site.id === activeSiteId ? ' is-active' : ''}`}
              onClick={() => {
                setActiveSite(site.id)
                setOpen(false)
              }}
            >
              <span className="site-code">{site.code}</span>
              <span className="row-main">
                <span>
                  {site.name} · {site.city}
                </span>
                <span>{stats[site.id]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Live() {
  const t = useT()
  const time = useWarehouse((s) => s.time)
  const connection = useWarehouse((s) => s.connection)
  const sourceName = useWarehouse((s) => s.sourceName)
  const speed = useWarehouse((s) => s.speed)
  return (
    <div className={`live${connection === 'error' ? ' is-error' : ''}${speed === 0 ? ' is-paused' : ''}`} title={t('top.dataSource', { name: sourceName })}>
      <span className="dot" />
      {connection === 'error' ? t('top.offline') : speed === 0 ? t('time.paused') : speed > 1 ? `${speed}×` : t('top.live')}
      <time className="num">{time ? fmtTime(time) : '--:--'}</time>
    </div>
  )
}

const SPEEDS = [1, 2, 4, 8]

/** Pause or fast-forward the simulated data (hidden for real API data). */
function TimeControl() {
  const t = useT()
  const speed = useWarehouse((s) => s.speed)
  const setSpeed = useWarehouse((s) => s.setSpeed)
  const can = useWarehouse((s) => s.canControlTime)
  if (!can) return null
  return (
    <div className="timectl" role="group" aria-label={t('time.label')}>
      <button className={speed === 0 ? 'is-on' : ''} onClick={() => setSpeed(speed === 0 ? 1 : 0)} aria-pressed={speed === 0} title={speed === 0 ? t('time.play') : t('time.pause')} aria-label={speed === 0 ? t('time.play') : t('time.pause')}>
        <Icon name={speed === 0 ? 'play' : 'pause'} size={14} />
      </button>
      {SPEEDS.map((n) => (
        <button key={n} className={speed === n ? 'is-on' : ''} onClick={() => setSpeed(n)} aria-pressed={speed === n} title={n === 1 ? t('time.play') : t('time.speed', { n })}>
          {n === 1 ? <Icon name="play" size={12} /> : n === 8 ? <Icon name="fast" size={14} /> : null}
          {n > 1 && <span className="num">{n}×</span>}
        </button>
      ))}
    </div>
  )
}

interface Alert {
  id: string
  icon: IconName
  title: string
  text: string
  target: Selection
}

function Alerts() {
  const t = useT()
  const sites = useWarehouse((s) => s.sites)
  const shipments = useWarehouse((s) => s.shipments)
  const customers = useWarehouse((s) => s.customers)
  const inventory = useWarehouse((s) => s.inventory)
  const docks = useWarehouse((s) => s.docks)
  const time = useWarehouse((s) => s.time)
  const focus = useWarehouse((s) => s.focus)
  const lang = useLang((s) => s.lang)
  const [open, setOpen] = useState(false)
  const close = useMemo(() => () => setOpen(false), [])
  const ref = useDismiss(open, close)

  const alerts = useMemo<Alert[]>(() => {
    const list: Alert[] = []
    const siteCode = (id: string) => sites.find((x) => x.id === id)?.code ?? ''
    for (const sh of Object.values(shipments)) {
      if (isDelayed(sh, time)) {
        const who = sh.customerId ? customers[sh.customerId]?.name : sh.supplier
        list.push({
          id: sh.id,
          icon: 'clock',
          title: t('top.alertDelayed', { ref: sh.reference }),
          text: `${who ?? ''} · ${t('top.alertDelayedText', { site: siteCode(sh.siteId), time: fmtTime(sh.eta ?? sh.scheduledAt) })}`,
          target: { kind: 'shipment', id: sh.id },
        })
      }
    }
    for (const it of Object.values(inventory)) {
      if (isLowStock(it)) {
        list.push({
          id: it.id,
          icon: 'package',
          title: t('top.alertLow', { name: it.name }),
          text: t('top.alertLowText', { site: siteCode(it.siteId), qty: it.quantity, unit: it.unit, rack: rackLabel(it.location.aisle, it.location.bay) }),
          target: { kind: 'rack', id: rackId(it.siteId, it.location.aisle, it.location.bay) },
        })
      }
    }
    for (const d of Object.values(docks)) {
      if (d.status === 'maintenance') {
        list.push({ id: d.id, icon: 'door', title: t('top.alertDock', { n: d.number }), text: t('top.alertDockText', { site: siteCode(d.siteId) }), target: { kind: 'dock', id: d.id } })
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, shipments, customers, inventory, docks, time, lang])

  return (
    <div className="alerts" ref={ref}>
      <button className="icon-button" onClick={() => setOpen((v) => !v)} aria-label={t('top.alertsCount', { n: alerts.length })} aria-expanded={open}>
        <Icon name="bell" size={19} />
        {alerts.length > 0 && <span className="badge">{alerts.length}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-label">{t('top.alerts')}</div>
          {alerts.length === 0 && <div className="dropdown-empty">{t('top.noAlerts')}</div>}
          {alerts.map((a) => (
            <button
              key={a.id}
              className="dropdown-row"
              onClick={() => {
                focus(a.target)
                setOpen(false)
              }}
            >
              <Icon name={a.icon} />
              <span className="row-main">
                <span>{a.title}</span>
                <span>{a.text}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
