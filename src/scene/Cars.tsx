import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Color, Matrix4, Object3D, Quaternion, Vector3, type InstancedMesh } from 'three'
import { useWarehouse } from '../store/warehouseStore'
import { CAR_PARTS } from './carParts'
import { glass, mat, rubber } from './materials'
import { getTraffic } from './traffic'

const dummy = new Object3D()
const local = new Object3D()
const m = new Matrix4()
const hidden = new Matrix4().makeScale(0, 0, 0)
const q = new Quaternion()
const p = new Vector3()
const one = new Vector3(1, 1, 1)
const color = new Color()

/** Everyday cars driven by the traffic simulation, drawn as instanced meshes. */
export function Cars() {
  const sites = useWarehouse((s) => s.sites)
  const cars = getTraffic(sites).cars
  const body = useRef<InstancedMesh>(null)
  const cabin = useRef<InstancedMesh>(null)
  const wheels = useRef<InstancedMesh>(null)
  const spin = useRef(new Float32Array(cars.length))

  useLayoutEffect(() => {
    cars.forEach((c, i) => body.current?.setColorAt(i, color.set(c.color)))
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true
  }, [cars])

  useFrame(() => {
    if (!body.current || !cabin.current || !wheels.current) return
    cars.forEach((c, i) => {
      if (!c.visible) {
        body.current!.setMatrixAt(i, hidden)
        cabin.current!.setMatrixAt(i, hidden)
        for (let w = 0; w < 4; w++) wheels.current!.setMatrixAt(i * 4 + w, hidden)
        return
      }
      dummy.position.set(c.pose.x, 0, c.pose.z)
      dummy.rotation.set(0, c.pose.heading, 0)
      dummy.updateMatrix()
      for (const [mesh, part] of [
        [body.current!, CAR_PARTS.body],
        [cabin.current!, CAR_PARTS.cabin],
      ] as const) {
        p.set(...part.offset)
        m.compose(p, q.identity(), one).premultiply(dummy.matrix)
        mesh.setMatrixAt(i, m)
      }
      spin.current[i] += c.moved / 0.34
      CAR_PARTS.wheels.offsets.forEach((o, w) => {
        local.position.set(...o)
        local.rotation.set(spin.current[i], 0, 0)
        local.updateMatrix()
        m.multiplyMatrices(dummy.matrix, local.matrix)
        wheels.current!.setMatrixAt(i * 4 + w, m)
      })
    })
    body.current.instanceMatrix.needsUpdate = true
    cabin.current.instanceMatrix.needsUpdate = true
    wheels.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={body} args={[CAR_PARTS.body.geometry, mat('#ffffff', { roughness: 0.35, metalness: 0.1 }), cars.length]} castShadow receiveShadow frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={cabin} args={[CAR_PARTS.cabin.geometry, glass(), cars.length]} castShadow frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={wheels} args={[CAR_PARTS.wheels.geometry, rubber(), cars.length * 4]} frustumCulled={false} raycast={() => null} />
    </group>
  )
}
