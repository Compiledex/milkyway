import { genericProfile } from '../data/profiles/generic'
import { WareTrackLogo } from './logos'
import type { BrandConfig } from './types'

export const wareTrackBrand: BrandConfig = {
  id: 'waretrack',
  appName: 'WareTrack',
  tagline: 'Lagerkontroll i sanntid',
  documentTitle: 'WareTrack',
  favicon:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2f5bea"/><path d="M16 6 25 11v10l-9 5-9-5V11z" fill="#fff" opacity=".95"/></svg>',
  Logo: WareTrackLogo,
  css: {},
  scene: {},
  carrierColors: {
    'Nordlys Frakt': '#2f5bea',
    Fjordlast: '#1f9e8a',
    'Polar Logistikk': '#e0742c',
    'Vidde Transport': '#6c58c9',
  },
  categoryColors: {},
  trailerDecal: { carrier: 'Nordlys Frakt', text: 'WareTrack', color: '#2f5bea', background: '#f8f9fc' },
  buildingSign: { text: 'WareTrack', color: '#2f5bea', background: '#ffffff' },
  profile: genericProfile,
}
