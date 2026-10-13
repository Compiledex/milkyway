import { Color, DoubleSide, FrontSide, MeshStandardMaterial, type Texture } from 'three'

// Shared materials keyed by look. Soft, slightly satin finish like a product
// render: low metalness, medium roughness.

const cache = new Map<string, MeshStandardMaterial>()

interface MatOptions {
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  map?: Texture
  transparent?: boolean
  opacity?: number
  doubleSided?: boolean
}

export function mat(color: string, o: MatOptions = {}): MeshStandardMaterial {
  const key = `${color}|${o.roughness ?? ''}|${o.metalness ?? ''}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.map?.uuid ?? ''}|${o.opacity ?? ''}|${o.doubleSided ? 2 : 1}`
  let m = cache.get(key)
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color),
      roughness: o.roughness ?? 0.55,
      metalness: o.metalness ?? 0.02,
      emissive: new Color(o.emissive ?? '#000000'),
      emissiveIntensity: o.emissiveIntensity ?? 0,
      map: o.map ?? null,
      transparent: o.transparent ?? (o.opacity !== undefined && o.opacity < 1),
      opacity: o.opacity ?? 1,
      side: o.doubleSided ? DoubleSide : FrontSide,
    })
    cache.set(key, m)
  }
  return m
}

export const glass = () => mat('#26324a', { roughness: 0.15, metalness: 0.4 })
export const rubber = () => mat('#23262d', { roughness: 0.9 })
export const steel = () => mat('#9aa3b2', { roughness: 0.35, metalness: 0.55 })
export const darkSteel = () => mat('#3a3f4a', { roughness: 0.45, metalness: 0.4 })
