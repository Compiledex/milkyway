import type { BufferGeometry } from 'three'
import { roundedBox, wheel } from './geometry'

// A small hatchback, origin at the rear axle, facing +z. Shared by moving and parked cars.

type V3 = [number, number, number]

export const CAR_PARTS: {
  body: { geometry: BufferGeometry; offset: V3 }
  cabin: { geometry: BufferGeometry; offset: V3 }
  wheels: { geometry: BufferGeometry; offsets: V3[] }
} = {
  body: { geometry: roundedBox(1.84, 0.72, 4.2, 0.28), offset: [0, 0.68, 1.25] },
  cabin: { geometry: roundedBox(1.62, 0.62, 2.25, 0.26), offset: [0, 1.28, 1.0] },
  wheels: {
    geometry: wheel(0.34, 0.26, 14),
    offsets: [
      [-0.82, 0.34, 0],
      [0.82, 0.34, 0],
      [-0.82, 0.34, 2.55],
      [0.82, 0.34, 2.55],
    ],
  },
}
