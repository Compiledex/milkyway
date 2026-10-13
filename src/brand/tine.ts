import { tineProfile } from '../data/profiles/tine'
import { MILKYWAY_ICON_SVG, TINE_BLUE, TineLogo } from './logos'
import type { BrandConfig } from './types'

// TINE skin for an internal test. Colours are approximations of the TINE
// identity, not official values. The logo is a drawn placeholder; see logos.tsx
// to swap in the official file.

export const tineBrand: BrandConfig = {
  id: 'tine',
  appName: 'Milkyway',
  tagline: 'Meierilogistikk i sanntid',
  documentTitle: 'Milkyway · TINE',
  appMark: true,
  favicon: MILKYWAY_ICON_SVG,
  Logo: TineLogo,
  css: {
    '--accent': '#1556c4',
    '--accent-strong': TINE_BLUE,
    '--accent-soft': '#e8f0fc',
  },
  scene: {
    wallTrim: TINE_BLUE,
    roof: '#3366cc',
    roofEdge: '#1f4fa8',
    accent: '#1556c4',
    rackPost: '#1d5cc4',
  },
  carrierColors: {
    'TINE Distribusjon': '#1556c4',
    Vestlandskjøl: '#1f9e8a',
    'Fjordfrakt Kjøl': '#e0742c',
    'Nordkjøl Transport': '#6c58c9',
  },
  categoryColors: {
    Melk: '#f2f5fb',
    Fløte: '#efe3c4',
    Yoghurt: '#f2c6d6',
    Ost: '#f2c94c',
    Smør: '#f6dc84',
    Juice: '#f7a531',
    Emballasje: '#d6ab72',
    Rengjøring: '#86b7e3',
  },
  trailerDecal: { carrier: 'TINE Distribusjon', text: 'TINE', color: '#ffffff', background: TINE_BLUE },
  buildingSign: { text: 'TINE', color: '#ffffff', background: TINE_BLUE },
  silos: true,
  profile: tineProfile,
}
