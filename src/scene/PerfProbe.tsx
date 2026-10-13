import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

declare global {
  interface Window {
    __waretrackPerf?: { frameMs: number; fps: number; calls: number; triangles: number; geometries: number; textures: number }
  }
}

/** Dev-only: open the app with `?perf` to expose frame stats on `window.__waretrackPerf`. */
export function PerfProbe() {
  const samples = useRef<number[]>([])
  useFrame(({ gl }, delta) => {
    samples.current.push(delta * 1000)
    if (samples.current.length >= 120) {
      const sorted = [...samples.current].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      window.__waretrackPerf = {
        frameMs: Number(median.toFixed(2)),
        fps: Math.round(1000 / median),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      }
      samples.current = []
    }
  })
  return null
}
