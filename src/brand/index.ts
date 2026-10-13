import { tineBrand } from './tine'
import type { BrandConfig } from './types'
import { wareTrackBrand } from './waretrack'

export type { BrandConfig } from './types'

const brands: Record<string, BrandConfig> = {
  tine: tineBrand,
  waretrack: wareTrackBrand,
}

/** Active brand, chosen with VITE_BRAND (default: tine). */
export const brand: BrandConfig = brands[import.meta.env.VITE_BRAND ?? 'tine'] ?? tineBrand

/** Push the brand's CSS variables, title and favicon into the document. */
export function applyBrand() {
  const root = document.documentElement
  for (const [key, value] of Object.entries(brand.css)) root.style.setProperty(key, value)
  root.dataset.brand = brand.id
  document.title = brand.documentTitle
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(brand.favicon)}`
}
