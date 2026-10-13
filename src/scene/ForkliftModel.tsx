import { useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { memo, useEffect, useRef, useState } from 'react'
import type { Group } from 'three'
import { DOCK_WALL_Z } from '../data/layout'
import type { Id, Vec2 } from '../data/types'
import { useWarehouse } from '../store/warehouseStore'
import { useLang } from '../i18n'
import { forkliftStatusLabel } from '../ui/format'
import { cylinder, roundedBox, wheel as wheelGeo } from './geometry'
import { SelectionMarker } from './Markers'
import { livePositions } from './registry'
import { darkSteel, mat, rubber, steel } from './materials'
import { angleDiff as shortestAngle } from './traffic/geometry'
import { forkliftStatusColor, loadColor, palette } from './palette'

const TICK_SECONDS = 1.9

export const ForkliftModel = memo(function ForkliftModel({ id }: { id: Id }) {
  const fl = useWarehouse((s) => s.forklifts[id])
  const site = useWarehouse((s) => s.sites.find((x) => x.id === fl.siteId)!)
  const cargoCategory = useWarehouse((s) => (fl.carrying && fl.task ? (s.inventory[fl.task.itemId]?.category ?? null) : null))
  const selected = useWarehouse((s) => s.selection?.kind === 'forklift' && s.selection.id === id)
  const select = useWarehouse((s) => s.select)
  useLang((s) => s.lang)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  const group = useRef<Group>(null)
  const forks = useRef<Group>(null)
  const wheels = useRef<(Group | null)[]>([])
  const pos = useRef<Vec2>({ ...fl.position })
  const heading = useRef(Math.PI)
  const path = useRef<Vec2[]>([])
  const speed = useRef(2.5)
  const prevRoute = useRef<Vec2[]>(fl.route)

  // Each data tick moves the truck a few metres along its route. Replay the
  // corners it passed and spread the move evenly over the next tick.
  useEffect(() => {
    const passed = prevRoute.current.slice(0, Math.max(0, prevRoute.current.length - fl.route.length))
    prevRoute.current = fl.route
    const next = [...path.current, ...passed, fl.position].filter(
      (p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.z - arr[i - 1].z) > 0.01,
    )
    path.current = next
    let length = 0
    let from = pos.current
    for (const p of next) {
      length += Math.hypot(p.x - from.x, p.z - from.z)
      from = p
    }
    const timeSpeed = Math.max(1, useWarehouse.getState().speed)
    speed.current = Math.min(7 * timeSpeed, Math.max(0.8, (length * timeSpeed) / TICK_SECONDS))
  }, [fl.position, fl.route])

  useFrame(({ clock }, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    const paused = useWarehouse.getState().speed === 0
    let budget = paused ? 0 : speed.current * dt
    let moved = 0
    let dirX = 0
    let dirZ = 0
    while (budget > 0 && path.current.length > 0) {
      const target = path.current[0]
      const dx = target.x - pos.current.x
      const dz = target.z - pos.current.z
      const d = Math.hypot(dx, dz)
      if (d < 1e-4) {
        path.current.shift()
        continue
      }
      const step = Math.min(d, budget)
      pos.current = { x: pos.current.x + (dx / d) * step, z: pos.current.z + (dz / d) * step }
      budget -= step
      moved += step
      dirX = dx
      dirZ = dz
      if (step >= d) path.current.shift()
    }

    // Face the direction of travel; when working, face the rack or the door.
    let want: number | null = null
    if (moved > 0.0005) want = Math.atan2(dirX, dirZ)
    else if (fl.status === 'lifting') want = pos.current.z > DOCK_WALL_Z - 10 ? 0 : Math.PI
    else if (fl.status === 'charging') want = Math.PI
    if (want !== null) heading.current += shortestAngle(heading.current, want) * Math.min(1, dt * 6)

    g.position.set(site.origin.x + pos.current.x, 0, site.origin.z + pos.current.z)
    g.rotation.y = heading.current
    livePositions.set(id, { x: g.position.x, z: g.position.z })
    for (const w of wheels.current) if (w) w.rotation.x += moved / 0.3

    if (forks.current) {
      const lift = fl.status === 'lifting' ? 1.3 + Math.sin(clock.elapsedTime * 1.4) * 0.9 : 0.14
      forks.current.position.y += (lift - forks.current.position.y) * Math.min(1, dt * 2.5)
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select({ kind: 'forklift', id })
  }

  const carrying = fl.carrying && cargoCategory !== null
  const statusColor = forkliftStatusColor[fl.status]
  const yellow = mat(palette.forklift, { roughness: 0.42 })
  const dark = mat(palette.forkliftDark, { roughness: 0.6 })

  return (
    <group
      ref={group}
      onClick={onClick}
      onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
      onPointerOut={() => setHovered(false)}
    >
      {/* Body and counterweight */}
      <mesh geometry={roundedBox(1.15, 0.72, 1.75, 0.2)} material={yellow} position={[0, 0.62, -0.05]} castShadow receiveShadow />
      <mesh geometry={roundedBox(1.18, 0.9, 0.6, 0.24)} material={yellow} position={[0, 0.78, -0.95]} castShadow />
      <mesh geometry={roundedBox(0.7, 0.32, 0.26, 0.08)} material={dark} position={[0, 1.12, 0.38]} castShadow />
      {/* Seat */}
      <mesh geometry={roundedBox(0.55, 0.14, 0.5, 0.06)} material={dark} position={[0, 1.06, -0.32]} />
      <mesh geometry={roundedBox(0.55, 0.5, 0.14, 0.06)} material={dark} position={[0, 1.34, -0.6]} castShadow />
      {/* Overhead guard */}
      {[-0.5, 0.5].map((x) =>
        [-0.78, 0.42].map((z) => (
          <mesh key={`${x}${z}`} geometry={roundedBox(0.08, 1.35, 0.08, 0.03)} material={dark} position={[x, 1.65, z]} castShadow />
        )),
      )}
      <mesh geometry={roundedBox(1.1, 0.08, 1.36, 0.04)} material={dark} position={[0, 2.34, -0.18]} castShadow />
      <mesh geometry={cylinder(0.09, 0.11, 0.16, 14)} material={mat(statusColor, { emissive: statusColor, emissiveIntensity: 1.2 })} position={[0, 2.46, -0.5]} />
      {/* Mast */}
      {[-0.38, 0.38].map((x) => (
        <mesh key={x} geometry={roundedBox(0.1, 2.45, 0.14, 0.03)} material={darkSteel()} position={[x, 1.3, 0.93]} castShadow />
      ))}
      <mesh geometry={roundedBox(0.86, 0.1, 0.12, 0.03)} material={darkSteel()} position={[0, 2.5, 0.93]} />
      <group ref={forks} position={[0, 0.14, 0]}>
        <mesh geometry={roundedBox(0.95, 0.5, 0.08, 0.03)} material={dark} position={[0, 0.25, 1.04]} castShadow />
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} geometry={roundedBox(0.12, 0.05, 1.15, 0.02)} material={steel()} position={[x, 0.02, 1.64]} castShadow />
        ))}
        {carrying && <PalletLoad color={loadColor(cargoCategory!)} position={[0, 0.06, 1.66]} />}
      </group>
      {/* Wheels */}
      {[
        [0.56, 0.62, 0.32],
        [-0.56, 0.62, 0.32],
        [0.56, -0.86, 0.27],
        [-0.56, -0.86, 0.27],
      ].map(([x, z, r], i) => (
        <group
          key={i}
          position={[x, r, z]}
          ref={(el) => {
            wheels.current[i] = el
          }}
        >
          <mesh geometry={wheelGeo(r, 0.26)} material={rubber()} castShadow />
          <mesh geometry={wheelGeo(r * 0.5, 0.28, 10)} material={mat(palette.forklift)} />
        </group>
      ))}
      {selected && (
        <SelectionMarker
          width={1.4}
          depth={3}
          offsetZ={0.2}
          labelHeight={3.1}
          label={{ text: fl.name, sub: forkliftStatusLabel[fl.status], dot: statusColor }}
        />
      )}
    </group>
  )
})

/** A pallet with stacked boxes, used on forks and in staging lanes. */
export function PalletLoad({ color, position, layers = 2 }: { color: string; position: [number, number, number]; layers?: number }) {
  const box = mat(color, { roughness: 0.7 })
  const wood = mat(palette.pallet, { roughness: 0.85 })
  return (
    <group position={position}>
      <mesh geometry={roundedBox(1.1, 0.14, 1.0, 0.02)} material={wood} position={[0, 0.07, 0]} castShadow receiveShadow />
      {Array.from({ length: layers * 4 }, (_, i) => {
        const layer = Math.floor(i / 4)
        const cx = i % 2 ? 0.26 : -0.26
        const cz = Math.floor(i / 2) % 2 ? 0.23 : -0.23
        return (
          <mesh
            key={i}
            geometry={roundedBox(0.5, 0.36, 0.44, 0.04)}
            material={box}
            position={[cx, 0.33 + layer * 0.37, cz]}
            castShadow
            receiveShadow
          />
        )
      })}
    </group>
  )
}
