import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { Shape, ShapeGeometry, type Group, type MeshStandardMaterial } from 'three'
import { brand } from '../brand'
import { FLOOR, WALL_HEIGHT, dockPosition } from '../data/layout'
import type { Site } from '../data/types'
import { useWarehouse } from '../store/warehouseStore'
import { box, cylinder, roundedBox } from './geometry'
import { mat } from './materials'
import { palette } from './palette'
import { claddingTexture, decalTexture } from './textures'

const W = FLOOR.maxX - FLOOR.minX
const D = FLOOR.maxZ - FLOOR.minZ
const CX = (FLOOR.minX + FLOOR.maxX) / 2
const CZ = (FLOOR.minZ + FLOOR.maxZ) / 2
const PITCH = (8 * Math.PI) / 180
const RISE = (D / 2) * Math.tan(PITCH)
export const DOOR_W = 4.2
export const DOOR_H = 4.6
const DOOR_COUNT = 6

const wallMats = new Map<number, MeshStandardMaterial>()
/** Cladding material with ribs every 0.9 m, cached per wall length. */
function wallMaterial(length: number) {
  let m = wallMats.get(length)
  if (!m) {
    const t = claddingTexture(palette.wall, palette.wallRib).clone()
    t.repeat.set(length / 0.9, 1)
    t.needsUpdate = true
    m = mat('#ffffff', { map: t, roughness: 0.6 })
    wallMats.set(length, m)
  }
  return m
}

/** Front wall pieces between the door openings. */
function frontSegments() {
  const xs: [number, number][] = []
  let start = FLOOR.minX
  for (let n = 1; n <= DOOR_COUNT; n++) {
    const x = dockPosition(n).x
    xs.push([start, x - DOOR_W / 2])
    start = x + DOOR_W / 2
  }
  xs.push([start, FLOOR.maxX])
  return xs
}

const roofMatCache = new Map<string, MeshStandardMaterial[]>()
/** Per-site roof materials (they fade independently in x-ray mode). */
function roofMaterials(siteId: string) {
  let list = roofMatCache.get(siteId)
  if (!list) {
    list = [
      mat(palette.roof, { roughness: 0.5 }).clone(),
      mat(palette.roofEdge, { roughness: 0.5 }).clone(),
      mat('#f1f3f8', { roughness: 0.6 }).clone(),
      mat(palette.wall, { roughness: 0.6, doubleSided: true }).clone(),
    ]
    roofMatCache.set(siteId, list)
  }
  return list
}

const gableGeometry = (() => {
  const s = new Shape()
  s.moveTo(-D / 2, 0)
  s.lineTo(D / 2, 0)
  s.lineTo(0, RISE)
  s.closePath()
  return new ShapeGeometry(s).rotateY(-Math.PI / 2)
})()

/** Warehouse shell. When x-ray is on, the roof lifts away and the walls facing the camera drop. */
export const Building = memo(function Building({ site }: { site: Site }) {
  const xray = useWarehouse(
    (s) =>
      s.activeSiteId === site.id &&
      (s.zoomedIn || s.xrayLocked || (s.selection?.kind === 'rack' && s.selection.id.startsWith(`${site.id}:`))),
  )

  const roof = useRef<Group>(null)
  const lowWalls = useRef<Group>(null)
  const reveal = useRef(xray ? 1 : 0)
  const roofMats = roofMaterials(site.id)

  useFrame((_, delta) => {
    reveal.current += ((xray ? 1 : 0) - reveal.current) * Math.min(1, delta * 4)
    const r = reveal.current
    if (roof.current) {
      roof.current.position.y = r * 8
      roof.current.visible = r < 0.98
      for (const m of roofMaterials(site.id)) {
        m.transparent = r > 0.01
        m.opacity = 1 - r
        m.depthWrite = r < 0.5
      }
    }
    if (lowWalls.current) {
      lowWalls.current.scale.y = 1 - r * 0.86
    }
  })

  const segments = frontSegments()
  const sign = brand.buildingSign
  const signMat = useMemo(() => mat('#ffffff', { map: decalTexture(sign.text, sign.color, sign.background, true), roughness: 0.5 }), [sign])
  const trim = mat(palette.wallTrim, { roughness: 0.45 })

  return (
    <group position={[site.origin.x, 0, site.origin.z]}>
      {/* Floor */}
      <mesh geometry={box(W, 0.12, D)} material={mat(palette.floor, { roughness: 0.8 })} position={[CX, 0.06, CZ]} receiveShadow />

      {/* Back and west walls stay up */}
      <mesh geometry={box(W, WALL_HEIGHT, 0.4)} material={wallMaterial(W)} position={[CX, WALL_HEIGHT / 2, FLOOR.minZ]} castShadow receiveShadow />
      <mesh geometry={box(0.4, WALL_HEIGHT, D)} material={wallMaterial(D)} position={[FLOOR.minX, WALL_HEIGHT / 2, CZ]} castShadow receiveShadow />
      <mesh geometry={gableGeometry} material={mat(palette.wall, { roughness: 0.6, doubleSided: true })} position={[FLOOR.minX, WALL_HEIGHT, CZ]} />

      {/* Front and east walls drop down in x-ray mode */}
      <group ref={lowWalls}>
        <mesh geometry={box(0.4, WALL_HEIGHT, D)} material={wallMaterial(D)} position={[FLOOR.maxX, WALL_HEIGHT / 2, CZ]} castShadow receiveShadow />
        {segments.map(([a, b]) => (
          <mesh
            key={a}
            geometry={box(b - a, WALL_HEIGHT, 0.4)}
            material={wallMaterial(b - a)}
            position={[(a + b) / 2, WALL_HEIGHT / 2, FLOOR.maxZ]}
            castShadow
            receiveShadow
          />
        ))}
        {segments.slice(0, -1).map(([, b]) => (
          <mesh
            key={b}
            geometry={box(DOOR_W, WALL_HEIGHT - DOOR_H, 0.4)}
            material={wallMaterial(DOOR_W)}
            position={[b + DOOR_W / 2, (WALL_HEIGHT + DOOR_H) / 2, FLOOR.maxZ]}
            castShadow
          />
        ))}
        {/* Blue fascia and corner trims */}
        <mesh geometry={box(W + 0.5, 0.7, 0.5)} material={trim} position={[CX, WALL_HEIGHT - 0.35, FLOOR.maxZ + 0.05]} />
        <mesh geometry={box(0.5, 0.7, D + 0.5)} material={trim} position={[FLOOR.maxX + 0.05, WALL_HEIGHT - 0.35, CZ]} />
        {[FLOOR.minX, FLOOR.maxX].map((x) => (
          <mesh key={x} geometry={box(0.55, WALL_HEIGHT, 0.55)} material={trim} position={[x, WALL_HEIGHT / 2, FLOOR.maxZ]} castShadow />
        ))}
        <mesh geometry={box(0.55, WALL_HEIGHT, 0.55)} material={trim} position={[FLOOR.maxX, WALL_HEIGHT / 2, FLOOR.minZ]} castShadow />
        {/* Wall signs */}
        <mesh material={signMat} position={[26.1, 6.9, FLOOR.maxZ + 0.23]}>
          <planeGeometry args={[6.4, 1.6]} />
        </mesh>
        <mesh material={signMat} position={[FLOOR.maxX + 0.23, 6.4, -12]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[9.6, 2.4]} />
        </mesh>
      </group>
      <mesh geometry={box(W + 0.5, 0.7, 0.5)} material={trim} position={[CX, WALL_HEIGHT - 0.35, FLOOR.minZ - 0.05]} />
      <mesh geometry={box(0.5, 0.7, D + 0.5)} material={trim} position={[FLOOR.minX - 0.05, WALL_HEIGHT - 0.35, CZ]} />
      <mesh geometry={box(0.55, WALL_HEIGHT, 0.55)} material={trim} position={[FLOOR.minX, WALL_HEIGHT / 2, FLOOR.minZ]} castShadow />

      {/* Roof */}
      <group ref={roof}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            geometry={box(W + 1.4, 0.35, D / 2 / Math.cos(PITCH) + 0.5)}
            material={roofMats[0]}
            position={[CX, WALL_HEIGHT + RISE / 2 + 0.1, CZ + (side * D) / 4]}
            rotation={[side * PITCH, 0, 0]}
            castShadow
            receiveShadow
          />
        ))}
        <mesh geometry={box(W + 1.5, 0.45, 0.9)} material={roofMats[1]} position={[CX, WALL_HEIGHT + RISE + 0.18, CZ]} castShadow />
        <mesh geometry={gableGeometry} material={roofMats[3]} position={[FLOOR.maxX, WALL_HEIGHT, CZ]} />
        {/* Rooftop cooling units */}
        {[-20, -8, 4, 16].map((x) =>
          [-1, 1].map((side) => (
            <group key={`${x}${side}`} position={[x, WALL_HEIGHT + RISE * 0.55 + 0.6, CZ + side * 8]}>
              <mesh geometry={roundedBox(3.2, 1.0, 1.8, 0.12)} material={roofMats[2]} castShadow />
              {[-0.8, 0.8].map((fx) => (
                <mesh key={fx} geometry={cylinder(0.55, 0.55, 0.08, 20)} material={mat('#9aa3b6', { roughness: 0.4, metalness: 0.4 })} position={[fx, 0.53, 0]} />
              ))}
            </group>
          )),
        )}
      </group>
      {brand.silos && <Silos />}
    </group>
  )
})

/** Milk silos on the west side of a dairy. */
function Silos() {
  const white = mat('#f6f7fb', { roughness: 0.35, metalness: 0.15 })
  const band = mat(palette.wallTrim, { roughness: 0.45 })
  return (
    <group position={[FLOOR.minX - 18, 0, -6]}>
      {[-7, -1.5, 4].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh geometry={cylinder(2.3, 2.3, 15, 32)} material={white} position={[0, 7.5, 0]} castShadow receiveShadow />
          <mesh geometry={cylinder(0.4, 2.3, 1.4, 32)} material={white} position={[0, 15.7, 0]} castShadow />
          <mesh geometry={cylinder(2.34, 2.34, 0.7, 32)} material={band} position={[0, 11.5, 0]} />
          <mesh geometry={cylinder(0.2, 0.2, 3, 8)} material={mat('#c9cfdc')} position={[1.6, 1.5, 1.6]} />
        </group>
      ))}
      <mesh geometry={box(1.2, 0.5, 14)} material={mat('#c9cfdc', { roughness: 0.4, metalness: 0.3 })} position={[2.2, 14, -1.5]} castShadow />
    </group>
  )
}
