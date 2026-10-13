import { memo } from 'react'
import { YARD } from '../data/layout'
import type { Site } from '../data/types'
import { WORLD_EAST, WORLD_WEST } from '../data/world'
import { roundedBox } from './geometry'
import { mat } from './materials'
import { palette } from './palette'

/** Ground and a few parked containers by each site. Roads, town and trees are drawn elsewhere. */
export const World = memo(function World({ sites }: { sites: Site[] }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(WORLD_WEST + WORLD_EAST) / 2, 0, 80]} receiveShadow raycast={() => null}>
        <planeGeometry args={[WORLD_EAST - WORLD_WEST + 600, 1100]} />
        <meshStandardMaterial color={palette.ground} roughness={1} />
      </mesh>
      {sites.map((s) => (
        <group key={s.id} position={[s.origin.x + YARD.maxX + 12, 0, s.origin.z + 6]} rotation={[0, 0.08 * (s.origin.z % 3), 0]}>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              geometry={roundedBox(2.5, 2.6, 6.2, 0.06)}
              material={mat(i === 1 ? palette.wallTrim : '#9db1e6', { roughness: 0.5 })}
              position={[i * 2.8, 1.3, 0]}
              castShadow
              receiveShadow
            />
          ))}
        </group>
      ))}
    </group>
  )
})
