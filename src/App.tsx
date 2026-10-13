import { Suspense, lazy, useEffect, useState } from 'react'
import { createDataSource } from './api'
import { useT } from './i18n'
import { connectDataSource, useWarehouse } from './store/warehouseStore'
import { ActivityPanel } from './ui/ActivityPanel'
import { InspectorPanel } from './ui/InspectorPanel'
import { KpiCards } from './ui/KpiCards'
import { MapControls } from './ui/MapControls'
import { ShipmentTracker } from './ui/ShipmentTracker'
import { TopBar } from './ui/TopBar'

const WarehouseScene = lazy(() => import('./scene/WarehouseScene').then((m) => ({ default: m.WarehouseScene })))

export default function App() {
  const t = useT()
  const connection = useWarehouse((s) => s.connection)
  const error = useWarehouse((s) => s.error)
  const hasData = useWarehouse((s) => s.sites.length > 0)
  const fontsReady = useFontsReady()

  useEffect(() => connectDataSource(createDataSource()), [])

  return (
    <div className="app">
      {hasData && <TopBar />}
      <main className="stage">
        {hasData && fontsReady && (
          <Suspense fallback={<div className="overlay-msg">{t('app.loadingScene')}</div>}>
            <WarehouseScene />
          </Suspense>
        )}
        {!hasData && connection === 'loading' && <div className="overlay-msg">{t('app.loadingData')}</div>}
        {connection === 'error' && <div className="overlay-msg error">{t('app.connectionLost', { error: error ?? '' })}</div>}
        {hasData && (
          <>
            <KpiCards />
            <MapControls />
            <InspectorPanel />
            <ShipmentTracker />
            <ActivityPanel />
          </>
        )}
      </main>
    </div>
  )
}

/** 3D labels are drawn to canvas, so wait for web fonts (max 1.5 s) before mounting the scene. */
function useFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const done = () => setReady(true)
    const timer = setTimeout(done, 1500)
    document.fonts?.ready.then(done)
    return () => clearTimeout(timer)
  }, [])
  return ready
}
