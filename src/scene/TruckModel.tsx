import { useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { memo, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { brand } from '../brand'
import type { Id } from '../data/types'
import { useTruckDimmed } from '../store/selectors'
import { useWarehouse } from '../store/warehouseStore'
import { truckStatusLabel } from '../ui/format'
import { roundedBox, wheel as wheelGeo } from './geometry'
import { SelectionMarker } from './Markers'
import { livePositions } from './registry'
import { getTraffic } from './traffic'
import { useLang } from '../i18n'
import { darkSteel, glass, mat, rubber, steel } from './materials'
import { carrierColors, palette, truckStatusColor } from './palette'
import { decalTexture } from './textures'

const WHEEL_R = 0.5
/** Distance from the rear bumper to the rear axle, which is the pivot the traffic sim steers. */
const REAR_AXLE = 2.2

export const TruckModel = memo(function TruckModel({ id }: { id: Id }) {
  const truck = useWarehouse((s) => s.trucks[id])
  const sites = useWarehouse((s) => s.sites)
  const selected = useWarehouse((s) => s.selection?.kind === 'truck' && s.selection.id === id)
  const select = useWarehouse((s) => s.select)
  const filteredOut = useTruckDimmed(id)
  useLang((s) => s.lang)

  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  const group = useRef<Group>(null)
  const wheels = useRef<(Group | null)[]>([])
  const scale = useRef(0)

  // Position comes from the traffic simulation, which follows the data.
  useFrame((_, delta) => {
    const g = group.current
    const agent = getTraffic(sites).truck(id)
    if (!g || !agent) return
    const { pose } = agent
    g.position.set(pose.x, 0, pose.z)
    g.rotation.y = pose.heading
    for (const w of wheels.current) if (w) w.rotation.x += agent.moved / WHEEL_R
    livePositions.set(id, { x: pose.x + Math.sin(pose.heading) * 2, z: pose.z + Math.cos(pose.heading) * 2 })

    const target = agent.visible && !filteredOut ? 1 : 0
    scale.current += (target - scale.current) * Math.min(1, Math.min(delta, 0.05) * 6)
    const sc = scale.current < 0.01 ? 0 : scale.current
    g.scale.setScalar(Math.max(sc, 0.0001))
    g.visible = sc > 0
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select({ kind: 'truck', id })
  }

  const cabColor = carrierColors[truck.carrier] ?? palette.accent
  const decal = brand.trailerDecal?.carrier === truck.carrier ? brand.trailerDecal : undefined
  const sideText = decal?.text ?? truck.carrier
  const decalColor = decal?.color ?? cabColor
  const decalBg = decal?.background ?? palette.truckBody
  const decalMat = useMemo(
    () => mat('#ffffff', { map: decalTexture(sideText, decalColor, decalBg), roughness: 0.5 }),
    [sideText, decalColor, decalBg],
  )
  const cab = mat(cabColor, { roughness: 0.4 })
  const body = mat(palette.truckBody, { roughness: 0.5 })

  return (
    <group
      ref={group}
      onClick={onClick}
      onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
      onPointerOut={() => setHovered(false)}
    >
      <group position={[0, 0, -REAR_AXLE]}>
      {/* Cargo box */}
      <mesh geometry={roundedBox(2.5, 2.8, 5.9, 0.12)} material={body} position={[0, 2.45, 3.1]} castShadow receiveShadow />
      <mesh geometry={roundedBox(2.54, 0.26, 5.7, 0.06)} material={cab} position={[0, 1.2, 3.1]} castShadow />
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.262, 2.55, 3.1]} rotation={[0, side * (Math.PI / 2), 0]} material={decalMat} raycast={() => null}>
          <planeGeometry args={[4.9, 1.22]} />
        </mesh>
      ))}
      {/* Rear door seam and lights */}
      <mesh geometry={roundedBox(0.04, 2.5, 0.04, 0.01)} material={darkSteel()} position={[0, 2.45, 0.14]} />
      {[-1.02, 1.02].map((x) => (
        <mesh
          key={x}
          geometry={roundedBox(0.26, 0.14, 0.06, 0.03)}
          material={mat('#e5484d', { emissive: '#e5484d', emissiveIntensity: 0.6 })}
          position={[x, 1.12, 0.1]}
        />
      ))}
      {/* Chassis */}
      <mesh geometry={roundedBox(1.9, 0.35, 8.0, 0.08)} material={darkSteel()} position={[0, 0.72, 4.1]} castShadow />
      {/* Cab */}
      <mesh geometry={roundedBox(2.45, 2.3, 2.1, 0.32)} material={cab} position={[0, 1.95, 7.3]} castShadow receiveShadow />
      <mesh geometry={roundedBox(2.25, 0.55, 1.3, 0.22)} material={cab} position={[0, 3.25, 6.95]} castShadow />
      <mesh geometry={roundedBox(2.12, 0.92, 0.08, 0.06)} material={glass()} position={[0, 2.42, 8.33]} />
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={roundedBox(0.06, 0.72, 0.95, 0.05)} material={glass()} position={[side * 1.215, 2.42, 7.6]} />
      ))}
      <mesh geometry={roundedBox(1.55, 0.5, 0.06, 0.04)} material={darkSteel()} position={[0, 1.38, 8.35]} />
      {[-0.9, 0.9].map((x) => (
        <mesh
          key={x}
          geometry={roundedBox(0.36, 0.18, 0.06, 0.04)}
          material={mat('#fffbe8', { emissive: '#fff4c2', emissiveIntensity: 0.9 })}
          position={[x, 1.3, 8.36]}
        />
      ))}
      <mesh geometry={roundedBox(2.45, 0.3, 0.26, 0.1)} material={mat('#3a3f4a', { roughness: 0.6 })} position={[0, 0.74, 8.3]} castShadow />
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={roundedBox(0.1, 0.42, 0.22, 0.04)} material={darkSteel()} position={[side * 1.42, 2.55, 8.05]} />
      ))}
      {/* Wheels */}
      {[2.2, 7.45].map((z, axle) =>
        [-1.04, 1.04].map((x, i) => (
          <group
            key={`${z}${x}`}
            position={[x, WHEEL_R, z]}
            ref={(el) => {
              wheels.current[axle * 2 + i] = el
            }}
          >
            <mesh geometry={wheelGeo(WHEEL_R, 0.4)} material={rubber()} castShadow />
            <mesh geometry={wheelGeo(0.27, 0.42, 12)} material={steel()} />
          </group>
        )),
      )}
      </group>
      {selected && (
        <SelectionMarker
          width={2.6}
          depth={8.6}
          offsetZ={4.2 - REAR_AXLE}
          labelHeight={4.4}
          label={{ text: truck.plate, sub: truckStatusLabel[truck.status], dot: truckStatusColor[truck.status] }}
        />
      )}
    </group>
  )
})
