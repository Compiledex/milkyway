import type { Customer, InventoryItem } from '../data/types'
import { loadColor } from '../scene/palette'
import { Icon } from './icons'
import { productIcon } from './productIcon'
import { brandOf } from './shopBrands'

/** Shop chain logo: white mark on the brand colour. */
export function ShopLogo({ customer, size = 28 }: { customer?: Customer; size?: number }) {
  const brand = brandOf(customer?.brand)
  return (
    <span className="shop-logo" style={{ width: size, height: size, background: brand.color }} title={customer?.name}>
      <svg viewBox="0 0 24 24" width={size * 0.66} height={size * 0.66} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={brand.logo} />
      </svg>
    </span>
  )
}

/** Product category icon on a tile tinted like the goods on the shelves. */
export function ProductBadge({ item, size = 28 }: { item?: Pick<InventoryItem, 'category'>; size?: number }) {
  return (
    <span className="product-badge" style={{ width: size, height: size, background: loadColor(item?.category ?? '') }}>
      <Icon name={productIcon(item?.category)} size={size * 0.6} />
    </span>
  )
}
