import { memo, useMemo } from 'react'
import { GATE_WIDTH, GATE_X, ROAD, YARD, chargerPosition } from '../data/layout'
import type { Site } from '../data/types'
import { box, cylinder, roundedBox } from './geometry'
import { glass, mat } from './materials'
import { palette } from './palette'
import { StaticInstances, type Transform } from './StaticInstances'

const YW = YARD.maxX - YARD.minX
const YD = YARD.maxZ - YARD.minZ
const GATE_L = GATE_X - GATE_WIDTH / 2
const GATE_R = GATE_X + GATE_WIDTH / 2
/** The driveway flares out so turning trucks stay on tarmac. */
const DRIVE_L = GATE_X - 9
const DRIVE_R = GATE_X + 12

/** Yard, markings, fence, gate and charging bays for one site. Static and not clickable. */
export const SiteGrounds = memo(function SiteGrounds({ site }: { site: Site }) {
  const { x: ox, z: oz } = site.origin

  const fence = useMemo(() => {
    const posts: Transform[] = []
    const panels: Transform[] = []
    const rails: Transform[] = []
    const run = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1)
      const n = Math.max(1, Math.round(len / 3))
      for (let i = 0; i <= n; i++) {
        posts.push({ position: [ox + x1 + ((x2 - x1) * i) / n, 0.9, oz + z1 + ((z2 - z1) * i) / n] })
      }
      const rotationY = -Math.atan2(z2 - z1, x2 - x1)
      const cx = ox + (x1 + x2) / 2
      const cz = oz + (z1 + z2) / 2
      panels.push({ position: [cx, 0.85, cz], scale: [len, 1, 1], rotationY })
      rails.push({ position: [cx, 1.75, cz], scale: [len, 1, 1], rotationY })
    }
    run(YARD.minX, -24, YARD.minX, YARD.maxZ)
    run(YARD.minX, YARD.maxZ, GATE_L, YARD.maxZ)
    run(GATE_R, YARD.maxZ, YARD.maxX, YARD.maxZ)
    run(YARD.maxX, YARD.maxZ, YARD.maxX, -24)
    run(YARD.maxX, -24, YARD.minX, -24)
    return { posts, panels, rails }
  }, [ox, oz])

  const fenceMetal = mat(palette.fence, { roughness: 0.4, metalness: 0.3 })

  return (
    <group>
      {/* Yard and driveway */}
      <mesh
        geometry={box(YW, 0.06, YD + 4)}
        material={mat(palette.yard, { roughness: 0.95 })}
        position={[ox + (YARD.minX + YARD.maxX) / 2, 0.03, oz + YARD.minZ + YD / 2 - 2]}
        receiveShadow
      />
      <mesh
        geometry={box(DRIVE_R - DRIVE_L, 0.05, ROAD.minZ - YARD.maxZ + 0.5)}
        material={mat(palette.yard, { roughness: 0.95 })}
        position={[ox + (DRIVE_L + DRIVE_R) / 2, 0.025, oz + (ROAD.minZ + YARD.maxZ) / 2]}
        receiveShadow
      />
      {/* Grass verge between fence and road */}
      {[
        [YARD.minX - 6, DRIVE_L],
        [DRIVE_R, YARD.maxX + 6],
      ].map(([a, b]) => (
        <mesh
          key={a}
          geometry={box(b - a, 0.08, ROAD.minZ - YARD.maxZ - 1.4)}
          material={mat('#b9dcc1', { roughness: 1 })}
          position={[ox + (a + b) / 2, 0.04, oz + (YARD.maxZ + ROAD.minZ - 1.4) / 2 + 0.7]}
          receiveShadow
        />
      ))}

      {/* Fence */}
      <StaticInstances geometry={cylinder(0.06, 0.06, 1.8, 8)} material={fenceMetal} transforms={fence.posts} castShadow />
      <StaticInstances geometry={box(1, 1.5, 0.04)} material={mat('#dde4f4', { opacity: 0.4, roughness: 0.3 })} transforms={fence.panels} />
      <StaticInstances geometry={box(1, 0.07, 0.07)} material={fenceMetal} transforms={fence.rails} />

      {/* Gate posts and raised barrier */}
      {[GATE_L, GATE_R].map((x) => (
        <mesh key={x} geometry={roundedBox(0.5, 1.4, 0.5, 0.1)} material={mat(palette.wallTrim)} position={[ox + x, 0.7, oz + YARD.maxZ]} castShadow />
      ))}
      <mesh
        geometry={roundedBox(0.16, 4.6, 0.16, 0.06)}
        material={mat('#ffffff')}
        position={[ox + GATE_L + 0.25, 3.5, oz + YARD.maxZ + 0.3]}
        rotation={[0, 0, -0.18]}
        castShadow
      />

      {/* Guard booth */}
      <group position={[ox + GATE_R + 3.5, 0, oz + YARD.maxZ - 4.5]}>
        <mesh geometry={roundedBox(3.2, 2.7, 2.6, 0.25)} material={mat(palette.wall, { roughness: 0.55 })} position={[0, 1.35, 0]} castShadow receiveShadow />
        <mesh geometry={roundedBox(3.6, 0.3, 3.0, 0.12)} material={mat(palette.wallTrim)} position={[0, 2.85, 0]} castShadow />
        <mesh geometry={roundedBox(2.4, 0.9, 0.06, 0.04)} material={glass()} position={[0, 1.7, 1.31]} />
        <mesh geometry={roundedBox(0.06, 0.9, 1.6, 0.04)} material={glass()} position={[-1.61, 1.7, 0]} />
      </group>

      {/* Charging bays inside the building */}
      {[0, 1, 2].map((slot) => {
        const c = chargerPosition(slot)
        return (
          <group key={slot} position={[ox + c.x, 0, oz + c.z]}>
            <mesh geometry={box(2.4, 0.03, 3)} material={mat('#cdeedd', { roughness: 0.9 })} position={[0, 0.13, 0.7]} receiveShadow />
            <mesh geometry={roundedBox(0.7, 1.5, 0.45, 0.1)} material={mat('#ffffff', { roughness: 0.5 })} position={[0, 0.85, -1.1]} castShadow />
            <mesh
              geometry={roundedBox(0.4, 0.12, 0.05, 0.03)}
              material={mat('#2fbf71', { emissive: '#2fbf71', emissiveIntensity: 1.4 })}
              position={[0, 1.25, -0.86]}
            />
          </group>
        )
      })}
    </group>
  )
})
