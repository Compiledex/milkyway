import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import type { PerspectiveCamera } from 'three'
import { labelTexture, type LabelStyle } from './textures'

/**
 * Pill label that keeps the same size on screen at any zoom, so it stays sharp
 * and readable. `pixels` is its height on screen; anchored at its bottom edge.
 */
export function Label({ pixels = 30, position, ...style }: LabelStyle & { pixels?: number; position: [number, number, number] }) {
  const { text, sub, dot, color, subColor, background, border } = style
  const { texture, aspect } = useMemo(
    () => labelTexture({ text, sub, dot, color, subColor, background, border }),
    [text, sub, dot, color, subColor, background, border],
  )
  const height = useThree((s) => s.size.height)
  const fov = useThree((s) => (s.camera as PerspectiveCamera).fov ?? 30)
  // Sprite with sizeAttenuation off: screen fraction = scale / tan(fov / 2) / 2.
  const k = (pixels * 2 * Math.tan((fov * Math.PI) / 360)) / Math.max(1, height)
  return (
    <sprite position={position} scale={[k * aspect, k, 1]} center={[0.5, 0]} raycast={() => null} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} fog={false} sizeAttenuation={false} />
    </sprite>
  )
}
