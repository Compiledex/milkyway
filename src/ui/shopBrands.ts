// Fictional shop chains for the test data: colour and a simple logo mark
// (24×24 stroke path). Used in lists, on order cards and on the 3D shop signs.

export interface ShopBrand {
  color: string
  /** SVG path data, 24×24, drawn as a white stroke on the brand colour. */
  logo: string
}

export const SHOP_BRANDS: Record<string, ShopBrand> = {
  stor: { color: '#d64545', logo: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z' },
  mat: { color: '#e07a1f', logo: 'M4 10h16l-1.8 8.5a2 2 0 0 1-2 1.5H7.8a2 2 0 0 1-2-1.5zM8.5 10 12 4.5 15.5 10M10 14v3M14 14v3' },
  dagligvare: { color: '#2f5bea', logo: 'M3 5h2.2l2.3 10h9.6l2.1-7.5H6.4M9.5 19.5h.01M16.5 19.5h.01' },
  naer: { color: '#2e9e5b', logo: 'M5 19c0-8.5 6-14 14.5-14C19.5 13.5 14 19 5.5 19M5.5 19 13 11.5' },
  kiosk: { color: '#8e5bd8', logo: 'M5 9h11v4.5a5.5 5.5 0 0 1-11 0zM16 10.5h1.6a2.4 2.4 0 0 1 0 4.8H16M8 4v2.5M11 4v2.5' },
  fersk: { color: '#1f9e8a', logo: 'M12 3.5c3.8 4.6 5.8 7.8 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-2.8 2-6 5.8-10.6zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5' },
}

export const brandOf = (key: string | undefined): ShopBrand => SHOP_BRANDS[key ?? ''] ?? { color: '#7a8299', logo: 'M4 9h16v11H4zM4 9l2-5h12l2 5M9 20v-6h6v6' }
