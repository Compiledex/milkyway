import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { cone, sphere } from './geometry'
import { Label } from './Label'
import { mat } from './materials'
import { palette } from './palette'
import type { LabelStyle } from './textures'

const BRACKET = 0.16
const ARM = 1.1

/**
 * Selection look from the video: blue corner brackets on the ground, a soft
 * blue footprint and a white pill label floating above the object.
 */
export function SelectionMarker({
  width,
  depth,
  offsetZ = 0,
  labelHeight,
  label,
}: {
  width: number
  depth: number
  offsetZ?: number
  labelHeight: number
  label?: LabelStyle
}) {
  const ring = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!ring.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.025
    ring.current.scale.set(s, 1, s)
  })
  const w = width / 2 + 0.6
  const d = depth / 2 + 0.6
  const accent = mat(palette.accent, { roughness: 0.4, emissive: palette.accent, emissiveIntensity: 0.35 })
  const fill = mat(palette.accent, { opacity: 0.12, roughness: 1 })

  return (
    <group position={[0, 0, offsetZ]}>
      <group ref={ring}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={fill} raycast={() => null}>
          <planeGeometry args={[w * 2, d * 2]} />
        </mesh>
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <group key={`${sx}${sz}`} position={[sx * w, 0.06, sz * d]}>
              <mesh position={[(-sx * ARM) / 2, 0, 0]} material={accent} raycast={() => null}>
                <boxGeometry args={[ARM, 0.06, BRACKET]} />
              </mesh>
              <mesh position={[0, 0, (-sz * ARM) / 2]} material={accent} raycast={() => null}>
                <boxGeometry args={[BRACKET, 0.06, ARM]} />
              </mesh>
            </group>
          )),
        )}
      </group>
      {label && <Label {...label} pixels={34} position={[0, labelHeight, 0]} color={palette.accent} />}
    </group>
  )
}

/** Blue map pin that bobs gently. */
export function Pin({ position, color = palette.accent, scale = 1 }: { position: [number, number, number]; color?: string; scale?: number }) {
  const ref = useRef<Group>(null)
  const phase = position[0] * 0.7 + position[2] * 0.3
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 2 + phase) * 0.15
  })
  const m = mat(color, { roughness: 0.35, emissive: color, emissiveIntensity: 0.15 })
  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh geometry={sphere(0.42)} material={m} position={[0, 0.95, 0]} castShadow raycast={() => null} />
      <mesh geometry={cone(0.3, 0.75)} material={m} position={[0, 0.42, 0]} rotation={[Math.PI, 0, 0]} castShadow raycast={() => null} />
      <mesh geometry={sphere(0.16)} material={mat('#ffffff', { roughness: 0.4 })} position={[0, 0.98, 0.32]} raycast={() => null} />
    </group>
  )
}
