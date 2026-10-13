import { useLayoutEffect, useRef } from 'react'
import { Object3D, type BufferGeometry, type InstancedMesh, type Material } from 'three'

export interface Transform {
  position: [number, number, number]
  scale?: [number, number, number]
  rotationY?: number
}

const dummy = new Object3D()

/** Many copies of one mesh that never move: one draw call. */
export function StaticInstances({
  geometry,
  material,
  transforms,
  castShadow = false,
  receiveShadow = true,
}: {
  geometry: BufferGeometry
  material: Material
  transforms: Transform[]
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    transforms.forEach((t, i) => {
      dummy.position.set(...t.position)
      dummy.scale.set(...(t.scale ?? [1, 1, 1]))
      dummy.rotation.set(0, t.rotationY ?? 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.count = transforms.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [transforms])
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, transforms.length)]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={() => null}
    />
  )
}
