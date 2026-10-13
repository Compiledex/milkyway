import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useState } from 'react'
import { PCFSoftShadowMap } from 'three'
import { useWarehouse } from '../store/warehouseStore'
import { Building } from './Building'
import { CameraRig } from './CameraRig'
import { DockModel } from './DockModel'
import { ForkliftModel } from './ForkliftModel'
import { palette } from './palette'
import { PerfProbe } from './PerfProbe'
import { Racks } from './Racks'
import { SiteGrounds } from './SiteGrounds'
import { TruckModel } from './TruckModel'
import { Cars } from './Cars'
import { Roads } from './Roads'
import { Town } from './Town'
import { TrafficDriver } from './TrafficDriver'
import { World } from './World'

export function WarehouseScene() {
  const sites = useWarehouse((s) => s.sites)
  const dockIds = useWarehouse((s) => s.dockIds)
  const truckIds = useWarehouse((s) => s.truckIds)
  const forkliftIds = useWarehouse((s) => s.forkliftIds)
  const select = useWarehouse((s) => s.select)
  const perf = import.meta.env.DEV && location.search.includes('perf')
  // Start sharp, drop resolution if the machine cannot keep up.
  const [dpr, setDpr] = useState(1.5)

  return (
    <Canvas
      shadows={{ type: PCFSoftShadowMap }}
      dpr={dpr}
      camera={{ fov: 30, near: 2, far: 1400, position: [80, 90, 110] }}
      onPointerMissed={() => select(null)}
      onCreated={(state) => {
        if (import.meta.env.DEV) (window as unknown as { __r3f: unknown }).__r3f = state
      }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, 260, 620]} />

      {/* Soft studio light: a bright sky dome from light panels, no external HDR files */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={0.7} color="#ffffff" scale={[60, 60, 1]} position={[0, 40, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="rect" intensity={0.35} color="#e4e9ff" scale={[80, 20, 1]} position={[-40, 15, 30]} rotation={[0, Math.PI / 4, 0]} />
        <Lightformer form="rect" intensity={0.3} color="#fff1e2" scale={[80, 20, 1]} position={[40, 15, -30]} rotation={[0, -Math.PI / 1.4, 0]} />
        <Lightformer form="ring" intensity={0.2} color="#dfe6ff" scale={30} position={[0, -20, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      </Environment>
      <hemisphereLight args={['#f4f6ff', '#c9d0e4', 0.3]} />

      <TrafficDriver />
      <World sites={sites} />
      <Roads sites={sites} />
      <Town sites={sites} />
      <Cars />
      {sites.map((site) => (
        <group key={site.id}>
          <SiteGrounds site={site} />
          <Building site={site} />
        </group>
      ))}
      <Racks />
      {dockIds.map((id) => (
        <DockModel key={id} id={id} />
      ))}
      {truckIds.map((id) => (
        <TruckModel key={id} id={id} />
      ))}
      {forkliftIds.map((id) => (
        <ForkliftModel key={id} id={id} />
      ))}

      <CameraRig />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO halfRes aoRadius={3.5} distanceFalloff={1.2} intensity={3.2} color="#27305a" quality="medium" />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <SMAA />
      </EffectComposer>
      {perf && <PerfProbe />}
    </Canvas>
  )
}
