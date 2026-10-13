import { useT, type StringKey } from '../i18n'
import { useWarehouse, type CameraCommand } from '../store/warehouseStore'
import { Icon, type IconName } from './icons'

const BUTTONS: [CameraCommand, IconName, StringKey][] = [
  ['zoomIn', 'plus', 'map.zoomIn'],
  ['zoomOut', 'minus', 'map.zoomOut'],
  ['rotateLeft', 'rotateLeft', 'map.rotateLeft'],
  ['rotateRight', 'rotateRight', 'map.rotateRight'],
  ['home', 'home', 'map.home'],
]

export function MapControls() {
  const t = useT()
  const issue = useWarehouse((s) => s.issueCamera)
  const xray = useWarehouse((s) => s.xrayLocked)
  const toggleXray = useWarehouse((s) => s.toggleXray)
  return (
    <div className="float card map-controls" role="toolbar" aria-label={t('map.toolbar')}>
      {BUTTONS.map(([command, icon, label], i) => (
        <span key={command} style={{ display: 'contents' }}>
          {i === 2 && <hr />}
          <button onClick={() => issue(command)} aria-label={t(label)} title={t(label)}>
            <Icon name={icon} />
          </button>
        </span>
      ))}
      <hr />
      <button className={xray ? 'is-on' : ''} onClick={toggleXray} aria-pressed={xray} aria-label={t('map.xray')} title={t('map.xray')}>
        <Icon name="layers" />
      </button>
    </div>
  )
}
