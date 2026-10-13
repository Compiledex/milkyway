import { useSiteKpis } from '../store/selectors'
import { currentLocale, useT } from '../i18n'
import { useWarehouse } from '../store/warehouseStore'
import { fmtNumber, fmtPercent, fmtSigned } from './format'
import { Icon, type IconName } from './icons'

function Kpi({
  icon,
  label,
  value,
  unit,
  delta,
  deltaDown,
  sub,
  tone,
}: {
  icon: IconName
  label: string
  value: string
  unit?: string
  delta?: string
  deltaDown?: boolean
  sub: string
  tone?: 'warn' | 'bad'
}) {
  return (
    <div className={`card kpi${tone ? ` is-${tone}` : ''}`}>
      <div className="kpi-icon">
        <Icon name={icon} size={19} />
      </div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value num">
          {value}
          {unit && <small>{unit}</small>}
          {delta && <span className={`delta${deltaDown ? ' down' : ''}`}>{delta}</span>}
        </div>
        <div className="kpi-sub">{sub}</div>
      </div>
    </div>
  )
}

export function KpiCards() {
  const t = useT()
  const siteId = useWarehouse((s) => s.activeSiteId)
  const code = useWarehouse((s) => s.sites.find((x) => x.id === siteId)?.code ?? '')
  const deliveredToday = useWarehouse((s) => Object.values(s.shipments).filter((sh) => sh.siteId === siteId && sh.status === 'delivered').length)
  const k = useSiteKpis(siteId)
  if (!k) return null
  const onTimeTone = k.onTimeRate === null || k.onTimeRate >= 0.9 ? undefined : k.onTimeRate >= 0.75 ? 'warn' : 'bad'
  const cold = k.coldRoom
  const coldTone = !cold || cold.coldRoomTempC <= cold.targetTempC ? undefined : cold.coldRoomTempC <= cold.targetTempC + 2 ? 'warn' : 'bad'

  return (
    <div className="float kpis">
      <Kpi
        icon="box"
        label={t('kpi.stock')}
        value={fmtNumber(k.stock)}
        delta={k.stockDelta ? fmtSigned(k.stockDelta) : undefined}
        deltaDown={k.stockDelta < 0}
        sub={t('kpi.units', { site: code })}
      />
      <Kpi icon="receipt" label={t('kpi.orders')} value={String(k.openOrders)} sub={t('kpi.ordersSub', { n: deliveredToday })} />
      <Kpi icon="truck" label={t('kpi.trucks')} value={String(k.activeTrucks)} sub={t('kpi.inbound', { n: k.inboundTrucks, site: code })} />
      <Kpi icon="clock" label={t('kpi.onTime')} value={fmtPercent(k.onTimeRate, 1)} sub={t('kpi.onTimeSub', { n: k.deliveredCount, d: k.delayed })} tone={onTimeTone} />
      {cold && (
        <Kpi
          icon="thermometer"
          label={t('kpi.cold')}
          value={cold.coldRoomTempC.toLocaleString(currentLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          unit="°C"
          sub={t('kpi.target', { t: cold.targetTempC })}
          tone={coldTone}
        />
      )}
    </div>
  )
}
