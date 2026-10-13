import type { IconName } from './icons'

/** Icon for an inventory category (dairy and the generic demo categories). */
const BY_CATEGORY: Record<string, IconName> = {
  Melk: 'milk',
  Fløte: 'cream',
  Yoghurt: 'yogurt',
  Ost: 'cheese',
  Smør: 'butter',
  Juice: 'juice',
  Emballasje: 'package',
  Rengjøring: 'spray',
  Kontor: 'receipt',
  Kantine: 'cup',
  Renhold: 'spray',
  Verneutstyr: 'shield',
  Jernvare: 'wrench',
  Elektro: 'bolt',
  Verksted: 'wrench',
  Dagligvare: 'basket',
  Hage: 'leaf',
  Bygg: 'box',
}

export const productIcon = (category: string | undefined): IconName => BY_CATEGORY[category ?? ''] ?? 'box'
