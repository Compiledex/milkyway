import { useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Color, ExtrudeGeometry, Object3D, RepeatWrapping, SRGBColorSpace, Shape, type InstancedMesh, type Texture } from 'three'
import { createRng } from '../data/rng'
import type { Customer, Site } from '../data/types'
import { WORLD_EAST, WORLD_WEST } from '../data/world'
import { useWarehouse } from '../store/warehouseStore'
import { brandOf } from '../ui/shopBrands'
import { CAR_PARTS } from './carParts'
import { box, cylinder, roundedBox, sphere, unitRoundedBox } from './geometry'
import { glass, mat, rubber } from './materials'
import { palette } from './palette'
import { StaticInstances } from './StaticInstances'
import { shopSignTexture } from './textures'
import { getTraffic } from './traffic'
import type { ShopGeo } from './traffic/network'
import { makeClearance } from './worldMask'

const HOUSE_COLORS = ['#b8443a', '#d9a441', '#f1efe8', '#9fb8cf', '#7f9c78', '#e8dcc6', '#c96f4a', '#f4f1ea', '#5d7fa3']
const ROOF_COLORS = ['#3a3d44', '#4a4f57', '#7c3a30', '#5b4a42']
const BLOCK_COLORS = ['#e9e4dc', '#d8dde6', '#efe9df', '#c9d3df']
const CAR_COLORS = ['#e5484d', '#f2f4f8', '#2f5bea', '#1f2430', '#9aa3b2', '#f5a524', '#3fae6a', '#d9dde6']

/** Gable roof prism: ridge along x, 1×1×1, sitting on y = 0. */
const roofGeometry = (() => {
  const s = new Shape()
  s.moveTo(-0.5, 0)
  s.lineTo(0.5, 0)
  s.lineTo(0, 1)
  s.closePath()
  return new ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5).rotateY(Math.PI / 2)
})()

function windows(cols: number, rows: number, w: number, h: number): Texture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  const cw = w / cols
  const rh = h / rows
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      ctx.fillStyle = '#f7f7f7'
      ctx.fillRect(i * cw + cw * 0.22, j * rh + rh * 0.22, cw * 0.56, rh * 0.56)
      ctx.fillStyle = '#3b4658'
      ctx.fillRect(i * cw + cw * 0.28, j * rh + rh * 0.28, cw * 0.44, rh * 0.44)
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  return t
}
const houseTexture = windows(3, 1, 128, 64)
const blockTexture = windows(6, 5, 256, 256)

interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
  rot: number
  color: string
  roof: string
}

/** Pseudo-noise for clustering houses into neighbourhoods with fields between. */
const density = (x: number, z: number) =>
  0.5 + 0.35 * Math.sin(x * 0.021 + z * 0.013) * Math.cos(x * 0.009 - z * 0.024) + 0.15 * Math.sin(x * 0.05 + 1.3) * Math.sin(z * 0.043)

export function Town({ sites }: { sites: Site[] }) {
  const network = getTraffic(sites).network
  const customers = useWarehouse((s) => s.customers)

  const { houses, blocks, trees, parked } = useMemo(() => {
    const rng = createRng(2026)
    const clear = makeClearance(network, sites)
    const roadPts = network.strips.flatMap((s) => s.pts.filter((_, i) => i % 3 === 0))
    const nearestRoad = (x: number, z: number) => {
      let best = roadPts[0]
      let d = Infinity
      for (const p of roadPts) {
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2
        if (dd < d) {
          d = dd
          best = p
        }
      }
      return { p: best, d: Math.sqrt(d) }
    }
    const placed: Building[] = []
    const free = (x: number, z: number, r: number) => placed.every((b) => Math.hypot(b.x - x, b.z - z) > r + Math.max(b.w, b.d) * 0.55)

    // Apartment blocks near the high street roundabouts.
    const blocks: Building[] = []
    for (const r of network.roundabouts.filter((ra) => ra.id.startsWith('RB'))) {
      for (let k = 0; k < 6; k++) {
        const ang = rng.next() * Math.PI * 2
        const dist = 32 + rng.next() * 40
        const x = r.cx + Math.cos(ang) * dist
        const z = r.cz + Math.sin(ang) * dist
        const w = 16 + rng.next() * 10
        const d = 11 + rng.next() * 4
        if (!clear(x, z, Math.max(w, d) * 0.6) || !free(x, z, Math.max(w, d) * 0.6)) continue
        const road = nearestRoad(x, z)
        const b = { x, z, w, d, h: 9 + rng.int(0, 3) * 3, rot: Math.atan2(road.p.x - x, road.p.z - z) + (rng.next() - 0.5) * 0.2, color: rng.pick(BLOCK_COLORS), roof: '#8a919e' }
        blocks.push(b)
        placed.push(b)
      }
    }

    // Detached houses: scattered with jitter, denser in neighbourhoods, facing the nearest road.
    const houses: Building[] = []
    for (let gx = WORLD_WEST + 20; gx < WORLD_EAST - 20; gx += 13) {
      for (let gz = -110; gz < 280; gz += 13) {
        const x = gx + (rng.next() - 0.5) * 9
        const z = gz + (rng.next() - 0.5) * 9
        if (rng.next() > density(x, z) * 0.95) continue
        const road = nearestRoad(x, z)
        if (road.d > 70 && rng.chance(0.7)) continue // mostly near roads
        const w = 7 + rng.next() * 5
        const d = 6 + rng.next() * 2.5
        if (!clear(x, z, Math.max(w, d) * 0.6) || !free(x, z, Math.max(w, d) * 0.55)) continue
        const facing = Math.atan2(road.p.x - x, road.p.z - z)
        const rot = road.d < 30 ? facing + (rng.next() - 0.5) * 0.25 : rng.next() * Math.PI
        const b = { x, z, w, d, h: 3.8 + rng.next() * 2.4, rot, color: rng.pick(HOUSE_COLORS), roof: rng.pick(ROOF_COLORS) }
        houses.push(b)
        placed.push(b)
      }
    }

    // Trees: small woods in the gaps and a few along the roads.
    const trees: { x: number; z: number; s: number; dark: boolean }[] = []
    for (let i = 0; i < 2600 && trees.length < 520; i++) {
      const x = WORLD_WEST + rng.next() * (WORLD_EAST - WORLD_WEST)
      const z = -120 + rng.next() * 410
      const wood = density(x + 400, z - 300) > 0.72
      if (!wood && rng.chance(0.8)) continue
      if (!clear(x, z, 2) || !free(x, z, 2.5)) continue
      trees.push({ x, z, s: 0.75 + rng.next() * 0.7, dark: rng.chance(0.5) })
    }

    // Parked cars in front of the shops.
    const parked: { x: number; z: number; rot: number; color: string }[] = []
    for (const shop of network.shops) {
      const n = Math.floor((shop.dims.carSide - 5) * 2 / 2.8)
      for (let i = 0; i <= n; i++) {
        if (rng.chance(0.35)) continue
        const p = shop.toWorld(-(shop.dims.carSide - 5) + i * 2.8, shop.dims.parkingZ)
        parked.push({ x: p.x, z: p.z, rot: shop.rotation + (rng.chance(0.5) ? 0 : Math.PI), color: rng.pick(CAR_COLORS) })
      }
    }
    return { houses, blocks, trees, parked }
  }, [network, sites])

  const customerAt = (shop: ShopGeo): Customer | undefined => {
    let best: Customer | undefined
    let d = 40
    for (const c of Object.values(customers)) {
      const dd = Math.hypot(c.location.x - shop.x, c.location.z - shop.z)
      if (dd < d) {
        d = dd
        best = c
      }
    }
    return best
  }

  return (
    <group>
      <Buildings items={houses} texture={houseTexture} gable />
      <Buildings items={blocks} texture={blockTexture} />
      <StaticInstances
        geometry={cylinder(0.16, 0.22, 1, 8)}
        material={mat(palette.trunk, { roughness: 0.8 })}
        transforms={trees.map((t) => ({ position: [t.x, 1.1 * t.s, t.z], scale: [t.s, 2.2 * t.s, t.s] }))}
        castShadow
      />
      {[false, true].map((dark) => (
        <StaticInstances
          key={String(dark)}
          geometry={sphere(1, 14, 10)}
          material={mat(dark ? palette.treeDark : palette.tree, { roughness: 0.75 })}
          transforms={trees.filter((t) => t.dark === dark).map((t) => ({ position: [t.x, 3 * t.s, t.z], scale: [1.6 * t.s, 1.75 * t.s, 1.6 * t.s] }))}
          castShadow
        />
      ))}
      {network.shops.map((shop) => (
        <ShopModel key={shop.id} shop={shop} customer={customerAt(shop)} />
      ))}
      <ParkedCars cars={parked} />
    </group>
  )
}

const dummy = new Object3D()
const tint = new Color()

function Buildings({ items, texture, gable = false }: { items: Building[]; texture: Texture; gable?: boolean }) {
  const bodies = useRef<InstancedMesh>(null)
  const roofs = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    items.forEach((h, i) => {
      dummy.position.set(h.x, h.h / 2, h.z)
      dummy.rotation.set(0, h.rot, 0)
      dummy.scale.set(h.w, h.h, h.d)
      dummy.updateMatrix()
      bodies.current!.setMatrixAt(i, dummy.matrix)
      bodies.current!.setColorAt(i, tint.set(h.color))
      if (gable && roofs.current) {
        dummy.position.set(h.x, h.h, h.z)
        dummy.scale.set(h.w + 0.7, h.d * 0.45, h.d + 0.9)
        dummy.updateMatrix()
        roofs.current.setMatrixAt(i, dummy.matrix)
        roofs.current.setColorAt(i, tint.set(h.roof))
      }
    })
    for (const m of [bodies.current, roofs.current]) {
      if (!m) continue
      m.count = items.length
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
  }, [items, gable])
  const wall = useMemo(() => mat('#ffffff', { map: texture, roughness: 0.8 }), [texture])
  const n = Math.max(1, items.length)
  return (
    <group>
      <instancedMesh ref={bodies} args={[unitRoundedBox, wall, n]} castShadow receiveShadow raycast={() => null} />
      {gable && <instancedMesh ref={roofs} args={[roofGeometry, mat('#ffffff', { roughness: 0.7 }), n]} castShadow receiveShadow raycast={() => null} />}
    </group>
  )
}

function ShopModel({ shop, customer }: { shop: ShopGeo; customer?: Customer }) {
  const d = shop.dims
  const brand = brandOf(customer?.brand)
  const name = customer?.name ?? 'Butikk'
  const sign = useMemo(() => mat('#ffffff', { map: shopSignTexture(name, brand.color, brand.logo), roughness: 0.5 }), [name, brand])
  const h = shop.size === 'large' ? 7 : 5
  const front = d.buildingZ - d.buildingD / 2
  const lines = Array.from({ length: Math.floor(((d.carSide - 5) * 2) / 2.8) + 2 }, (_, i) => -(d.carSide - 5) - 1.4 + i * 2.8)
  return (
    <group position={[shop.x, 0, shop.z]} rotation={[0, shop.rotation, 0]}>
      {/* Lot */}
      <mesh geometry={box(d.lotW * 2, 0.08, d.back - d.mouth + 6)} material={mat(palette.yard, { roughness: 0.95 })} position={[0, 0.04, (d.back + d.mouth) / 2 + 1]} receiveShadow />
      {lines.map((x) => (
        <mesh key={x} geometry={box(0.12, 0.02, 4.6)} material={mat('#ffffff', { roughness: 0.6 })} position={[x, 0.09, d.parkingZ]} />
      ))}
      {/* Building with brand trim */}
      <mesh geometry={roundedBox(d.buildingW, h, d.buildingD, 0.4)} material={mat('#f3f4f8', { roughness: 0.6 })} position={[0, h / 2, d.buildingZ]} castShadow receiveShadow />
      <mesh geometry={roundedBox(d.buildingW + 1, 0.8, d.buildingD + 1, 0.2)} material={mat(brand.color, { roughness: 0.5 })} position={[0, h + 0.2, d.buildingZ]} castShadow />
      <mesh geometry={roundedBox(d.buildingW * 0.42, h * 0.42, 0.1, 0.05)} material={glass()} position={[-d.buildingW * 0.18, h * 0.24, front - 0.05]} />
      <mesh material={sign} position={[d.buildingW * 0.12, h * 0.72, front - 0.07]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[d.buildingW * 0.62, d.buildingW * 0.62 * 0.215]} />
      </mesh>
      {/* Goods-in door on the east wall, where trucks stop */}
      <mesh geometry={box(0.1, 3.4, 4)} material={mat(palette.door)} position={[d.buildingW / 2 + 0.05, 1.7, d.buildingZ + 2]} />
      <mesh geometry={box(0.2, 0.4, 4.6)} material={mat(brand.color)} position={[d.buildingW / 2 + 0.1, 3.6, d.buildingZ + 2]} />
      {/* Pylon sign by the entrance */}
      <group position={[-d.lotW + 2, 0, d.mouth + 3]}>
        <mesh geometry={box(0.3, 5, 0.3)} material={mat('#c9cfdc')} position={[0, 2.5, 0]} castShadow />
        <mesh geometry={roundedBox(2.6, 2.6, 0.4, 0.3)} material={mat(brand.color)} position={[0, 5.6, 0]} castShadow />
      </group>
    </group>
  )
}

function ParkedCars({ cars }: { cars: { x: number; z: number; rot: number; color: string }[] }) {
  const body = useRef<InstancedMesh>(null)
  const cabin = useRef<InstancedMesh>(null)
  const wheels = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const base = new Object3D()
    cars.forEach((c, i) => {
      // Centre the car in the bay (origin is the rear axle).
      base.position.set(c.x - Math.sin(c.rot) * 1.25, 0, c.z - Math.cos(c.rot) * 1.25)
      base.rotation.set(0, c.rot, 0)
      base.updateMatrix()
      for (const [mesh, part] of [
        [body.current!, CAR_PARTS.body],
        [cabin.current!, CAR_PARTS.cabin],
      ] as const) {
        dummy.position.set(...part.offset)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        dummy.matrix.premultiply(base.matrix)
        mesh.setMatrixAt(i, dummy.matrix)
      }
      body.current!.setColorAt(i, tint.set(c.color))
      CAR_PARTS.wheels.offsets.forEach((o, w) => {
        dummy.position.set(...o)
        dummy.updateMatrix()
        dummy.matrix.premultiply(base.matrix)
        wheels.current!.setMatrixAt(i * 4 + w, dummy.matrix)
      })
    })
    for (const m of [body.current!, cabin.current!, wheels.current!]) {
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
    if (body.current!.instanceColor) body.current!.instanceColor.needsUpdate = true
  }, [cars])
  const n = Math.max(1, cars.length)
  return (
    <group>
      <instancedMesh ref={body} args={[CAR_PARTS.body.geometry, mat('#ffffff', { roughness: 0.35, metalness: 0.1 }), n]} castShadow receiveShadow raycast={() => null} />
      <instancedMesh ref={cabin} args={[CAR_PARTS.cabin.geometry, glass(), n]} raycast={() => null} />
      <instancedMesh ref={wheels} args={[CAR_PARTS.wheels.geometry, rubber(), n * 4]} raycast={() => null} />
    </group>
  )
}
