import { useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { memo, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { dockPosition, stagedPalletPosition } from '../data/layout'
import type { Id } from '../data/types'
import { useWarehouse } from '../store/warehouseStore'
import { t, useLang } from '../i18n'
import { dockStatusLabel } from '../ui/format'
import { DOOR_H, DOOR_W } from './Building'
import { PalletLoad } from './ForkliftModel'
import { box, roundedBox } from './geometry'
import { Label } from './Label'
import { Pin, SelectionMarker } from './Markers'
import { darkSteel, mat } from './materials'
import { dockStatusColor, loadColor, palette } from './palette'
import { decalTexture, slatTexture } from './textures'

const MAX_STAGED = 6

export const DockModel = memo(function DockModel({ id }: { id: Id }) {
  const dock = useWarehouse((s) => s.docks[id])
  const site = useWarehouse((s) => s.sites.find((x) => x.id === dock.siteId)!)
  const selected = useWarehouse((s) => s.selection?.kind === 'dock' && s.selection.id === id)
  const select = useWarehouse((s) => s.select)
  const active = useWarehouse((s) => s.activeSiteId === dock.siteId)
  useLang((s) => s.lang)
  // Pallets waiting in the yard: unloaded so far, or still to be loaded.
  // Pallets waiting at the door: picked but not yet loaded, or unloaded but not yet put away.
  const staged = useWarehouse(
    useShallow((s) => {
      for (const sh of Object.values(s.shipments)) {
        if (sh.dockId !== id) continue
        const n = sh.palletsStaged - sh.palletsDone
        const open = sh.direction === 'outbound' ? ['picking', 'picked', 'loading'].includes(sh.status) : sh.status !== 'in-transit'
        if (open && n > 0) return { count: Math.min(MAX_STAGED, n), category: s.inventory[sh.lines[0]?.itemId]?.category ?? null }
      }
      return { count: 0, category: null as string | null }
    }),
  )
  const stagedCount = staged.count
  const stagedCategory = staged.category
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  const door = useRef<Group>(null)
  const open = dock.status === 'occupied'
  useFrame((_, delta) => {
    const g = door.current
    if (!g) return
    const k = Math.min(1, delta * 1.8)
    const target = open ? 0.12 : 1
    g.scale.y += (target - g.scale.y) * k
    g.position.y = DOOR_H - (DOOR_H * g.scale.y) / 2
  })

  const pos = dockPosition(dock.number)
  const color = dockStatusColor[dock.status]
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select({ kind: 'dock', id })
  }

  const frame = mat(palette.wallTrim, { roughness: 0.45 })
  const doorMat = useMemo(() => {
    const t = slatTexture(palette.door, '#cfd5e2').clone()
    t.repeat.set(1, DOOR_H / 0.55)
    t.needsUpdate = true
    return mat('#ffffff', { map: t, roughness: 0.5, metalness: 0.1 })
  }, [])
  const numberMat = useMemo(() => mat('#ffffff', { map: decalTexture(String(dock.number), '#ffffff', palette.wallTrim, true) }), [dock.number])
  const cargo = loadColor(stagedCategory ?? '')

  return (
    <group position={[site.origin.x + pos.x, 0, site.origin.z + pos.z]}>
      <group
        onClick={onClick}
        onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
        onPointerOut={() => setHovered(false)}
      >
        {/* Blue frame */}
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={box(0.35, DOOR_H + 0.35, 0.6)} material={frame} position={[(side * (DOOR_W + 0.35)) / 2, (DOOR_H + 0.35) / 2, 0.1]} castShadow />
        ))}
        <mesh geometry={box(DOOR_W + 0.7, 0.4, 0.6)} material={frame} position={[0, DOOR_H + 0.18, 0.1]} castShadow />
        {/* Roller door */}
        <group ref={door} position={[0, DOOR_H / 2, 0]}>
          <mesh geometry={box(DOOR_W, DOOR_H, 0.1)} material={doorMat} castShadow />
        </group>
        <mesh geometry={box(DOOR_W - 0.2, 0.7, 0.5)} material={mat('#e4e8f1', { roughness: 0.5 })} position={[0, DOOR_H - 0.1, -0.1]} />
        {/* Dock seal, bumpers and leveller */}
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={roundedBox(0.28, 0.5, 0.3, 0.06)} material={mat('#2b2f38', { roughness: 0.8 })} position={[side * 1.35, 1.05, 0.45]} />
        ))}
        <mesh geometry={box(3.0, 0.1, 1.2)} material={darkSteel()} position={[0, 0.06, 0.95]} receiveShadow />
        {/* Status lamp and number sign */}
        <mesh geometry={roundedBox(0.34, 0.34, 0.16, 0.08)} material={mat(color, { emissive: color, emissiveIntensity: 1.1 })} position={[DOOR_W / 2 + 0.75, DOOR_H - 0.3, 0.25]} />
        <mesh material={numberMat} position={[0, DOOR_H + 0.9, 0.42]}>
          <planeGeometry args={[1.6, 0.4]} />
        </mesh>
      </group>
      {/* Yard bay markings */}
      {[-1.7, 1.7].map((x) =>
        Array.from({ length: 5 }, (_, i) => (
          <mesh key={`${x}${i}`} geometry={box(0.14, 0.02, 1.1)} material={mat(palette.marking, { roughness: 0.8 })} position={[x, 0.025, 1.6 + i * 1.9]} receiveShadow />
        )),
      )}
      {/* Staged pallets */}
      {Array.from({ length: stagedCount }, (_, i) => {
        const p = stagedPalletPosition(dock.number, i)
        return <PalletLoad key={i} color={cargo} position={[p.x - pos.x, 0, p.z - pos.z]} layers={i % 3 === 2 ? 1 : 2} />
      })}
      {stagedCount > 0 && <Pin position={[4.2, 2.1, 2.2]} />}
      {active && !selected && (
        <Label text={t('insp.port', { n: dock.number })} sub={dockStatusLabel[dock.status]} dot={color} pixels={24} position={[0, DOOR_H + 1.4, 0.6]} />
      )}
      {selected && <SelectionMarker width={DOOR_W} depth={2.5} offsetZ={1} labelHeight={DOOR_H + 1.6} label={{ text: t('insp.port', { n: dock.number }), sub: dockStatusLabel[dock.status], dot: color }} />}
    </group>
  )
})
