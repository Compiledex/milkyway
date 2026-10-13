import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

// Canvas-drawn textures: labels, decals and wall cladding. Cached by content.

const cache = new Map<string, { texture: CanvasTexture; aspect: number }>()
const FONT = '"Inter", system-ui, sans-serif'

function finish(canvas: HTMLCanvasElement, key: string) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  const entry = { texture, aspect: canvas.width / canvas.height }
  cache.set(key, entry)
  return entry
}

export interface LabelStyle {
  text: string
  /** Secondary text after the main text, e.g. a status. */
  sub?: string
  /** Status dot colour. */
  dot?: string
  color?: string
  subColor?: string
  background?: string
  border?: string
}

/** White rounded pill label like a map tag. */
export function labelTexture({
  text,
  sub,
  dot,
  color = '#1b2440',
  subColor = '#5b6478',
  background = '#ffffff',
  border = 'rgba(30, 45, 90, 0.12)',
}: LabelStyle) {
  const key = JSON.stringify(['pill', text, sub, dot, color, subColor, background, border])
  const hit = cache.get(key)
  if (hit) return hit

  const scale = 2
  const h = 44 * scale
  const pad = 16 * scale
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const mainFont = `700 ${19 * scale}px ${FONT}`
  const subFont = `500 ${17 * scale}px ${FONT}`
  ctx.font = mainFont
  const mainW = ctx.measureText(text).width
  ctx.font = subFont
  const subW = sub ? ctx.measureText(sub).width + 10 * scale : 0
  const dotW = dot ? 18 * scale : 0
  canvas.width = Math.ceil(pad * 2 + dotW + mainW + subW)
  canvas.height = h + 8 * scale

  ctx.shadowColor = 'rgba(30, 45, 90, 0.18)'
  ctx.shadowBlur = 8 * scale
  ctx.shadowOffsetY = 2 * scale
  ctx.fillStyle = background
  ctx.beginPath()
  ctx.roundRect(2, 2, canvas.width - 4, h - 4, (h - 4) / 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = border
  ctx.lineWidth = 2
  ctx.stroke()

  let x = pad
  const y = h / 2 + scale
  if (dot) {
    ctx.fillStyle = dot
    ctx.beginPath()
    ctx.arc(x + 5 * scale, y - scale, 5 * scale, 0, Math.PI * 2)
    ctx.fill()
    x += dotW
  }
  ctx.textBaseline = 'middle'
  ctx.font = mainFont
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  if (sub) {
    ctx.font = subFont
    ctx.fillStyle = subColor
    ctx.fillText(sub, x + mainW + 10 * scale, y)
  }
  return finish(canvas, key)
}

/** Flat wordmark for truck sides and wall signs. */
export function decalTexture(text: string, color: string, background: string, rounded = false) {
  const key = `decal:${text}:${color}:${background}:${rounded}`
  const hit = cache.get(key)
  if (hit) return hit.texture
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = background
  if (rounded) {
    ctx.beginPath()
    ctx.roundRect(0, 0, canvas.width, canvas.height, 128)
    ctx.fill()
  } else {
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.fillStyle = color
  let size = 150
  ctx.font = `800 ${size}px ${FONT}`
  while (ctx.measureText(text).width > canvas.width * 0.82 && size > 40) {
    size -= 6
    ctx.font = `800 ${size}px ${FONT}`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6)
  return finish(canvas, key).texture
}

/** Vertical corrugated cladding for warehouse walls. Repeat along u. */
export function claddingTexture(base: string, rib: string) {
  const key = `clad:${base}:${rib}`
  const hit = cache.get(key)
  if (hit) return hit.texture
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 8
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, base)
  g.addColorStop(0.42, base)
  g.addColorStop(0.5, rib)
  g.addColorStop(0.62, base)
  g.addColorStop(1, base)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 8)
  const entry = finish(canvas, key)
  entry.texture.wrapS = RepeatWrapping
  entry.texture.wrapT = RepeatWrapping
  return entry.texture
}

/** Horizontal slats for roller doors. */
export function slatTexture(base: string, line: string) {
  const key = `slat:${base}:${line}`
  const hit = cache.get(key)
  if (hit) return hit.texture
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 8, 64)
  ctx.fillStyle = line
  for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 8, 3)
  const entry = finish(canvas, key)
  entry.texture.wrapS = RepeatWrapping
  entry.texture.wrapT = RepeatWrapping
  return entry.texture
}

/** Shop sign: brand colour, white logo badge and the shop name. */
export function shopSignTexture(name: string, color: string, logoPath: string) {
  const key = `shop:${name}:${color}:${logoPath}`
  const hit = cache.get(key)
  if (hit) return hit.texture
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 220
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(0, 0, canvas.width, canvas.height, 40)
  ctx.fill()
  // Logo badge
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(120, 110, 78, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(120 - 60, 110 - 60)
  ctx.scale(5, 5)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(logoPath))
  ctx.restore()
  // Name
  ctx.fillStyle = '#ffffff'
  let size = 96
  ctx.font = `800 ${size}px ${FONT}`
  const text = name.toUpperCase()
  while (ctx.measureText(text).width > canvas.width - 260 && size > 40) {
    size -= 4
    ctx.font = `800 ${size}px ${FONT}`
  }
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 228, 116)
  return finish(canvas, key).texture
}
