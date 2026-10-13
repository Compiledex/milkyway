import type { ComponentType } from 'react'
import type { SeedProfile } from '../data/profiles/profile'

export interface ScenePalette {
  background: string
  ground: string
  yard: string
  road: string
  roadLine: string
  curb: string
  floor: string
  wall: string
  wallRib: string
  wallTrim: string
  roof: string
  roofEdge: string
  door: string
  accent: string
  marking: string
  rackPost: string
  rackBeam: string
  pallet: string
  load: string
  loadLow: string
  truckBody: string
  forklift: string
  forkliftDark: string
  tree: string
  treeDark: string
  trunk: string
  fence: string
  neighbour: string
}

export interface BrandConfig {
  id: string
  appName: string
  tagline: string
  documentTitle: string
  /** Show the Milkyway app mark next to the customer logo. */
  appMark?: boolean
  /** Inline SVG favicon. */
  favicon: string
  Logo: ComponentType<{ height?: number }>
  /** CSS custom properties applied to :root (see index.css for the full list). */
  css: Record<`--${string}`, string>
  scene: Partial<ScenePalette>
  carrierColors: Record<string, string>
  /** Colour of goods on the shelves, by inventory category. */
  categoryColors: Record<string, string>
  /** Wordmark painted on the cargo box sides of this carrier's trucks. */
  trailerDecal?: { carrier: string; text: string; color: string; background: string }
  /** Sign on the warehouse wall. */
  buildingSign: { text: string; color: string; background: string }
  /** Decorative extras: milk silos for dairies. */
  silos?: boolean
  /** Test-data set used when no API is configured. */
  profile: SeedProfile
}
