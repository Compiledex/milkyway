import { memo, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, Shape, ShapeGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { APPROACH_Z, EXIT_Z, GATE_IN_X, GATE_OUT_X, HOLD_Z, YARD } from '../data/layout'
import type { Site } from '../data/types'
import { RA_ARM_LENGTH } from '../data/world'
import { box, cylinder, sphere } from './geometry'
import { mat } from './materials'
import { palette } from './palette'
import { StaticInstances, type Transform } from './StaticInstances'
import { getTraffic } from './traffic'
import { headingOf, type Pt } from './traffic/geometry'
import { LANE_OFFSET, RA_RADIUS } from './traffic/network'

const ROAD_HALF = 5
const RING_IN = RA_RADIUS - 3.4
const RING_OUT = RA_RADIUS + 3.6

/** Flat arrow pointing along +z, 1 m long. Scaled per instance. */
const arrowGeometry = (() => {
  const s = new Shape()
  s.moveTo(-0.16, -0.5)
  s.lineTo(0.16, -0.5)
  s.lineTo(0.16, 0.05)
  s.lineTo(0.42, 0.05)
  s.lineTo(0, 0.5)
  s.lineTo(-0.42, 0.05)
  s.lineTo(-0.16, 0.05)
  s.closePath()
  return new ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(Math.PI)
})()

/** Give-way triangle (haitann), tip towards the approaching driver. */
const toothGeometry = (() => {
  const s = new Shape()
  s.moveTo(-0.3, 0.3)
  s.lineTo(0.3, 0.3)
  s.lineTo(0, -0.35)
  s.closePath()
  return new ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(Math.PI)
})()

const flat = (x: number, z: number, heading: number, y = 0.075, scale: [number, number, number] = [1, 1, 1]): Transform => ({
  position: [x, y, z],
  rotationY: heading,
  scale,
})

/** Flat band along a polyline, from `left` to `right` metres off the centre line. */
function ribbon(pts: Pt[], left: number, right: number, y: number): BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const rx = -(b.z - a.z) / len
    const rz = (b.x - a.x) / len
    pos.push(p.x + rx * left, y, p.z + rz * left, p.x + rx * right, y, p.z + rz * right)
    if (i > 0) {
      const k = i * 2
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k)
    }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setIndex(idx)
  return g
}

/** Points every `step` metres along a polyline, with the local heading. */
function along(pts: Pt[], step: number, start: number, end: number): { x: number; z: number; heading: number; dx: number; dz: number }[] {
  const out: { x: number; z: number; heading: number; dx: number; dz: number }[] = []
  let travelled = 0
  let next = start
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    while (len > 0 && next <= travelled + len) {
      const t = (next - travelled) / len
      const dx = (b.x - a.x) / len
      const dz = (b.z - a.z) / len
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: headingOf(dx, dz), dx, dz })
      next += step
    }
    travelled += len
  }
  return out.filter((p, i, arr) => {
    void p
    return i < arr.length && travelled - (start + i * step) > end
  })
}

/** Roads, roundabouts and lane markings for the whole map, drawn from the traffic network. */
export const Roads = memo(function Roads({ sites }: { sites: Site[] }) {
  const network = getTraffic(sites).network

  const data = useMemo(() => {
    const asphalt: BufferGeometry[] = []
    const lines: BufferGeometry[] = []
    const dashes: Transform[] = []
    const arrows: Transform[] = []
    const teeth: Transform[] = []
    const yellow: Transform[] = []
    const stopLines: Transform[] = []

    for (const { pts } of network.strips) {
      if (pts.length < 2) continue
      asphalt.push(ribbon(pts, -ROAD_HALF, ROAD_HALF, 0.05))
      if (pts.length > 2) {
        lines.push(ribbon(pts, -ROAD_HALF + 0.35, -ROAD_HALF + 0.5, 0.07), ribbon(pts, ROAD_HALF - 0.5, ROAD_HALF - 0.35, 0.07))
        for (const p of along(pts, 6, 4, 4)) dashes.push({ position: [p.x, 0.075, p.z], scale: [1, 1, 2.6], rotationY: p.heading })
        // Arrows in each lane, pointing the way traffic flows (right-hand traffic).
        for (const p of along(pts, 38, 16, 14)) {
          arrows.push(flat(p.x - p.dz * LANE_OFFSET, p.z + p.dx * LANE_OFFSET, p.heading, 0.08, [1.6, 1, 3.4]))
          arrows.push(flat(p.x + p.dz * LANE_OFFSET, p.z - p.dx * LANE_OFFSET, p.heading + Math.PI, 0.08, [1.6, 1, 3.4]))
        }
      }
    }

    // Roundabouts: a pad for each arm, give-way teeth at each entry, arrows on the ring.
    for (const r of network.roundabouts) {
      for (const arm of r.arms) {
        const u = { x: Math.cos(arm.angle), z: -Math.sin(arm.angle) }
        asphalt.push(ribbon([{ x: r.cx, z: r.cz }, { x: r.cx + u.x * (RA_ARM_LENGTH + 0.5), z: r.cz + u.z * (RA_ARM_LENGTH + 0.5) }], -ROAD_HALF, ROAD_HALF, 0.05))
        const node = network.nodes.get(`${r.id}:${arm.name}:in`)!
        const fx = Math.sin(node.heading)
        const fz = Math.cos(node.heading)
        const ahead = RA_ARM_LENGTH - RING_OUT - 0.6
        for (let k = -1; k <= 1; k++) teeth.push(flat(node.x + fx * ahead + fz * k * 0.85, node.z + fz * ahead - fx * k * 0.85, node.heading, 0.085, [1.3, 1, 1.3]))
      }
      for (let i = 0; i < 4; i++) {
        const t = Math.PI / 4 + (i * Math.PI) / 2
        arrows.push(flat(r.cx + RA_RADIUS * Math.cos(t), r.cz - RA_RADIUS * Math.sin(t), headingOf(-Math.sin(t), -Math.cos(t)), 0.09, [1.3, 1, 2.6]))
      }
    }

    // Yard lanes per site: arrows, lane edges and a hold line at the gate.
    for (const s of sites) {
      const ox = s.origin.x
      const oz = s.origin.z
      for (const z of [HOLD_Z - 9, APPROACH_Z + 8]) arrows.push(flat(ox + GATE_IN_X, oz + z, Math.PI, 0.08, [1.5, 1, 3]))
      for (const z of [EXIT_Z + 3, YARD.maxZ - 1]) arrows.push(flat(ox + GATE_OUT_X, oz + z, 0, 0.08, [1.5, 1, 3]))
      for (let x = ox + 26; x > ox + YARD.minX + 6; x -= 16) arrows.push(flat(x, oz + APPROACH_Z, -Math.PI / 2, 0.08, [1.5, 1, 3]))
      for (let x = ox - 28; x < ox + GATE_OUT_X - 8; x += 16) arrows.push(flat(x, oz + EXIT_Z, Math.PI / 2, 0.08, [1.5, 1, 3]))
      stopLines.push({ position: [ox + GATE_IN_X, 0.075, oz + HOLD_Z - 7], scale: [3, 1, 3.4], rotationY: Math.PI / 2 })
      for (let x = ox + YARD.minX + 3; x < ox + GATE_IN_X - 4; x += 3) {
        yellow.push({ position: [x, 0.07, oz + APPROACH_Z - 2.6], scale: [1, 1, 1.4], rotationY: Math.PI / 2 })
        yellow.push({ position: [x, 0.07, oz + (APPROACH_Z + EXIT_Z) / 2], scale: [1, 1, 1.4], rotationY: Math.PI / 2 })
      }
      for (let z = oz + EXIT_Z + 2; z < oz + YARD.maxZ; z += 3) yellow.push({ position: [ox + (GATE_IN_X + GATE_OUT_X) / 2, 0.07, z], scale: [1, 1, 1.4] })
    }
    return {
      asphalt: mergeGeometries(asphalt),
      lines: lines.length ? mergeGeometries(lines) : null,
      dashes,
      arrows,
      teeth,
      yellow,
      stopLines,
    }
  }, [network, sites])

  const white = mat('#ffffff', { roughness: 0.6 })

  return (
    <group>
      <mesh geometry={data.asphalt} material={mat(palette.road, { roughness: 0.95 })} receiveShadow raycast={() => null} />
      {data.lines && <mesh geometry={data.lines} material={white} raycast={() => null} />}
      <StaticInstances geometry={box(0.18, 0.02, 1)} material={white} transforms={data.dashes} />
      <StaticInstances geometry={box(0.16, 0.02, 1)} material={white} transforms={data.stopLines} />
      <StaticInstances geometry={arrowGeometry} material={white} transforms={data.arrows} />
      <StaticInstances geometry={toothGeometry} material={white} transforms={data.teeth} />
      <StaticInstances geometry={box(0.14, 0.02, 1)} material={mat(palette.marking, { roughness: 0.7 })} transforms={data.yellow} />
      {network.roundabouts.map((r) => (
        <group key={r.id} position={[r.cx, 0, r.cz]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} receiveShadow raycast={() => null}>
            <circleGeometry args={[RING_OUT, 48]} />
            <meshStandardMaterial color={palette.road} roughness={0.95} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]} raycast={() => null}>
            <ringGeometry args={[RING_IN, RING_IN + 0.18, 48]} />
            <meshStandardMaterial color="#ffffff" roughness={0.6} />
          </mesh>
          <mesh geometry={cylinder(RING_IN, RING_IN + 0.1, 0.35, 40)} material={mat('#e7eaf2', { roughness: 0.8 })} position={[0, 0.17, 0]} receiveShadow />
          <mesh geometry={cylinder(RING_IN - 0.5, RING_IN - 0.5, 0.4, 40)} material={mat('#a9d8b2', { roughness: 1 })} position={[0, 0.2, 0]} receiveShadow />
          <mesh geometry={cylinder(0.25, 0.3, 2.4, 8)} material={mat(palette.trunk)} position={[0, 1.4, 0]} castShadow />
          <mesh geometry={sphere(1.9, 16, 12)} material={mat(palette.tree, { roughness: 0.75 })} position={[0, 3.6, 0]} castShadow />
        </group>
      ))}
    </group>
  )
})
