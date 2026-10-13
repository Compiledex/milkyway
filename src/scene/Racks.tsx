import { Edges, useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { BAY_WIDTH, LEVEL_HEIGHT, RACK_DEPTH, rackPosition } from '../data/layout'
import { isLowStock } from '../data/rules'
import type { InventoryItem, Site } from '../data/types'
import { parseRackId, rackId, useWarehouse } from '../store/warehouseStore'
import { unitBox, unitRoundedBox } from './geometry'
import { loadColor, palette } from './palette'

// All racks, pallets and goods for every site are drawn with a handful of
// InstancedMeshes: a few draw calls instead of ~2000 meshes.

const dummy = new Object3D()
const color = new Color()

interface Bay {
  site: Site
  aisle: number
  bay: number
}

export function Racks() {
  const sites = useWarehouse((s) => s.sites)
  const inventory = useWarehouse((s) => s.inventory)
  const inventoryIds = useWarehouse((s) => s.inventoryIds)
  const select = useWarehouse((s) => s.select)
  const selection = useWarehouse((s) => s.selection)

  const bays = useMemo<Bay[]>(
    () =>
      sites.flatMap((site) =>
        Array.from({ length: site.aisles * site.baysPerAisle }, (_, i) => ({
          site,
          aisle: Math.floor(i / site.baysPerAisle),
          bay: i % site.baysPerAisle,
        })),
      ),
    [sites],
  )
  const levels = sites[0]?.levelsPerBay ?? 3
  const items = useMemo(() => inventoryIds.map((id) => inventory[id]), [inventory, inventoryIds])

  const posts = useRef<InstancedMesh>(null)
  const beams = useRef<InstancedMesh>(null)
  const pallets = useRef<InstancedMesh>(null)
  const loads = useRef<InstancedMesh>(null)

  // Static rack structure: depends only on the site layout.
  useLayoutEffect(() => {
    if (!posts.current || !beams.current) return
    let p = 0
    let b = 0
    for (const { site, aisle, bay } of bays) {
      const r = rackPosition(aisle, bay)
      const x = site.origin.x + r.x
      const z = site.origin.z + r.z
      const height = levels * LEVEL_HEIGHT + 0.3
      for (const dx of [-BAY_WIDTH / 2, BAY_WIDTH / 2]) {
        for (const dz of [-RACK_DEPTH / 2, RACK_DEPTH / 2]) {
          dummy.position.set(x + dx, height / 2, z + dz)
          dummy.scale.set(0.09, height, 0.09)
          dummy.updateMatrix()
          posts.current.setMatrixAt(p++, dummy.matrix)
        }
      }
      for (let level = 0; level <= levels; level++) {
        for (const dz of [-RACK_DEPTH / 2, RACK_DEPTH / 2]) {
          dummy.position.set(x, 0.15 + level * LEVEL_HEIGHT, z + dz)
          dummy.scale.set(BAY_WIDTH, 0.1, 0.08)
          dummy.updateMatrix()
          beams.current.setMatrixAt(b++, dummy.matrix)
        }
      }
    }
    posts.current.count = p
    beams.current.count = b
    posts.current.instanceMatrix.needsUpdate = true
    beams.current.instanceMatrix.needsUpdate = true
    posts.current.computeBoundingSphere()
    beams.current.computeBoundingSphere()
  }, [bays, levels])

  // Pallets and goods: re-laid out when stock changes.
  useLayoutEffect(() => {
    if (!pallets.current || !loads.current) return
    const siteById = new Map(sites.map((s) => [s.id, s]))
    items.forEach((item, i) => {
      const site = siteById.get(item.siteId)!
      const r = rackPosition(item.location.aisle, item.location.bay)
      const x = site.origin.x + r.x
      const z = site.origin.z + r.z
      const y = 0.2 + item.location.level * LEVEL_HEIGHT
      dummy.position.set(x, y + 0.07, z)
      dummy.scale.set(1.15, 0.14, 1.0)
      dummy.updateMatrix()
      pallets.current!.setMatrixAt(i, dummy.matrix)

      // Four cartons per pallet; their height shows how full the slot is.
      const fill = Math.max(0.08, item.quantity / item.capacity)
      const h = 0.15 + fill * 0.95
      const c = color.set(isLowStock(item) ? palette.loadLow : loadColor(item.category))
      for (let k = 0; k < 4; k++) {
        dummy.position.set(x + (k % 2 ? 0.27 : -0.27), y + 0.15 + h / 2, z + (k < 2 ? 0.23 : -0.23))
        dummy.scale.set(0.5, h, 0.42)
        dummy.updateMatrix()
        loads.current!.setMatrixAt(i * 4 + k, dummy.matrix)
        loads.current!.setColorAt(i * 4 + k, c)
      }
    })
    pallets.current.count = items.length
    loads.current.count = items.length * 4
    pallets.current.instanceMatrix.needsUpdate = true
    loads.current.instanceMatrix.needsUpdate = true
    if (loads.current.instanceColor) loads.current.instanceColor.needsUpdate = true
    pallets.current.computeBoundingSphere()
    loads.current.computeBoundingSphere()
  }, [items, sites])

  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  const selectBay = (e: ThreeEvent<MouseEvent>, toRack: (i: number) => string) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    select({ kind: 'rack', id: toRack(e.instanceId) })
  }
  const pointer = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), setHovered(true)),
    onPointerOut: () => setHovered(false),
  }
  const beamsPerBay = (levels + 1) * 2
  const bayRack = (b: Bay) => rackId(b.site.id, b.aisle, b.bay)
  const itemRack = (it: InventoryItem) => rackId(it.siteId, it.location.aisle, it.location.bay)
  const maxBays = bays.length

  return (
    <group>
      <instancedMesh
        ref={posts}
        args={[unitBox, undefined, maxBays * 4]}
        castShadow
        receiveShadow
        onClick={(e) => selectBay(e, (i) => bayRack(bays[Math.floor(i / 4)]))}
        {...pointer}
      >
        <meshStandardMaterial color={palette.rackPost} roughness={0.45} metalness={0.25} />
      </instancedMesh>
      <instancedMesh
        ref={beams}
        args={[unitBox, undefined, maxBays * beamsPerBay]}
        castShadow
        receiveShadow
        onClick={(e) => selectBay(e, (i) => bayRack(bays[Math.floor(i / beamsPerBay)]))}
        {...pointer}
      >
        <meshStandardMaterial color={palette.rackBeam} roughness={0.45} metalness={0.15} />
      </instancedMesh>
      <instancedMesh
        ref={pallets}
        args={[unitBox, undefined, 200]}
        castShadow
        receiveShadow
        onClick={(e) => selectBay(e, (i) => itemRack(items[i]))}
        {...pointer}
      >
        <meshStandardMaterial color={palette.pallet} roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={loads}
        args={[unitRoundedBox, undefined, 800]}
        castShadow
        receiveShadow
        onClick={(e) => selectBay(e, (i) => itemRack(items[Math.floor(i / 4)]))}
        {...pointer}
      >
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      {selection?.kind === 'rack' && <RackHighlight id={selection.id} levels={levels} />}
    </group>
  )
}

function RackHighlight({ id, levels }: { id: string; levels: number }) {
  const { siteId, aisle, bay } = parseRackId(id)
  const site = useWarehouse((s) => s.sites.find((x) => x.id === siteId))
  if (!site) return null
  const r = rackPosition(aisle, bay)
  const h = levels * LEVEL_HEIGHT + 0.5
  return (
    <mesh position={[site.origin.x + r.x, h / 2, site.origin.z + r.z]} raycast={() => null}>
      <boxGeometry args={[BAY_WIDTH + 0.2, h, RACK_DEPTH + 0.3]} />
      <meshBasicMaterial color={palette.accent} transparent opacity={0.12} depthWrite={false} />
      <Edges color={palette.accent} lineWidth={2} />
    </mesh>
  )
}
