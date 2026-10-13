import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Shared, cached geometries. Every truck wheel or pallet box reuses the same
// GPU buffers instead of allocating its own.

const cache = new Map<string, BufferGeometry>()

function cached<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key) as T | undefined
  if (!g) {
    g = make()
    cache.set(key, g)
  }
  return g
}

export const roundedBox = (w: number, h: number, d: number, r = 0.08, segments = 3) =>
  cached(`rb:${w}:${h}:${d}:${r}:${segments}`, () => new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2, h / 2, d / 2)))

export const box = (w: number, h: number, d: number) => cached(`b:${w}:${h}:${d}`, () => new BoxGeometry(w, h, d))

/** Cylinder lying along the x axis (wheels, axles). */
export const wheel = (radius: number, width: number, segments = 20) =>
  cached(`w:${radius}:${width}:${segments}`, () => new CylinderGeometry(radius, radius, width, segments).rotateZ(Math.PI / 2))

export const cylinder = (rTop: number, rBottom: number, h: number, segments = 24) =>
  cached(`c:${rTop}:${rBottom}:${h}:${segments}`, () => new CylinderGeometry(rTop, rBottom, h, segments))

export const sphere = (r: number, w = 20, h = 14) => cached(`s:${r}:${w}:${h}`, () => new SphereGeometry(r, w, h))

export const cone = (r: number, h: number, segments = 20) => cached(`co:${r}:${h}:${segments}`, () => new ConeGeometry(r, h, segments))

export const unitRoundedBox = roundedBox(1, 1, 1, 0.12, 2)
export const unitBox = box(1, 1, 1)
