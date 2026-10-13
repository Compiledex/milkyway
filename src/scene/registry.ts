import type { Id } from '../data/types'

// Live world positions of moving objects, written by the models every frame
// and read by the camera when it needs to fly to a selection.

export const livePositions = new Map<Id, { x: number; z: number }>()
