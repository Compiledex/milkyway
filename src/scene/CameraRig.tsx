import { MapControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import { DirectionalLight, Object3D, Spherical, Vector3 } from 'three'
import { dockPosition, rackPosition } from '../data/layout'
import { parseRackId, useWarehouse, type Selection } from '../store/warehouseStore'
import { livePositions } from './registry'

// Strategy-game camera: drag to pan, right-drag or buttons to rotate, wheel to
// zoom, clamped to the map. Every programmatic move is a smooth glide.

const HOME_TARGET = new Vector3(2, 0, 12)
const HOME_RADIUS = 112
const HOME_RADIUS_MOBILE = 170
const HOME_POLAR = 0.88 // from straight down
const HOME_AZIMUTH = 0.72 // looking from the south-east
const FOCUS_RADIUS = 52
const XRAY_IN = 42
const XRAY_OUT = 50
const MOBILE_BREAKPOINT = 760

type Controls = ComponentRef<typeof MapControls>

export function CameraRig() {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const mobile = useThree((s) => s.size.width < MOBILE_BREAKPOINT)
  const sites = useWarehouse((s) => s.sites)
  const activeSiteId = useWarehouse((s) => s.activeSiteId)
  const command = useWarehouse((s) => s.cameraCommand)
  const focusNonce = useWarehouse((s) => s.focusNonce)
  const setZoomedIn = useWarehouse((s) => s.setZoomedIn)

  const goal = useRef<{ target: Vector3; radius: number; theta: number; phi: number } | null>(null)
  const placed = useRef(false)
  const followed = useRef<{ key: string; x: number; z: number } | null>(null)
  const tmp = useRef({ sph: new Spherical(), off: new Vector3(), v: new Vector3() })

  const minX = Math.min(...sites.map((s) => s.origin.x)) - 230
  const maxX = Math.max(...sites.map((s) => s.origin.x)) + 250

  const current = () => {
    const c = controls.current!
    const { sph, off } = tmp.current
    off.copy(camera.position).sub(c.target)
    sph.setFromVector3(off)
    return { target: c.target.clone(), radius: sph.radius, theta: sph.theta, phi: sph.phi }
  }

  const homeFor = (siteId: string | null) => {
    const site = sites.find((s) => s.id === siteId)
    const target = site ? new Vector3(site.origin.x, 0, site.origin.z).add(HOME_TARGET) : HOME_TARGET.clone()
    return { target, radius: mobile ? HOME_RADIUS_MOBILE : HOME_RADIUS, theta: HOME_AZIMUTH, phi: HOME_POLAR }
  }

  // Site changes: glide home (or jump there on first load).
  useEffect(() => {
    const c = controls.current
    if (!c || !activeSiteId) return
    const home = homeFor(activeSiteId)
    if (!placed.current) {
      placed.current = true
      c.target.copy(home.target)
      camera.position.copy(home.target).add(new Vector3().setFromSphericalCoords(home.radius, home.phi, home.theta))
      c.update()
      return
    }
    goal.current = { ...current(), target: home.target }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, mobile])

  // Map control buttons.
  useEffect(() => {
    if (!command || !controls.current) return
    const base = goal.current ?? current()
    switch (command.command) {
      case 'zoomIn':
        goal.current = { ...base, radius: Math.max(28, base.radius * 0.72) }
        break
      case 'zoomOut':
        goal.current = { ...base, radius: Math.min(320, base.radius / 0.72) }
        break
      case 'rotateLeft':
        goal.current = { ...base, theta: base.theta - Math.PI / 4 }
        break
      case 'rotateRight':
        goal.current = { ...base, theta: base.theta + Math.PI / 4 }
        break
      case 'home':
        goal.current = homeFor(useWarehouse.getState().activeSiteId)
        break
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command])

  // Fly to a selection picked from a list or search.
  useEffect(() => {
    if (!focusNonce || !controls.current) return
    const sel = useWarehouse.getState().selection
    const at = sel ? worldPosition(sel) : null
    if (!at) return
    const base = current()
    goal.current = { ...base, target: new Vector3(at.x, 0, at.z), radius: Math.min(base.radius, FOCUS_RADIUS) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce])

  // Dragging the map hands control back to the user (zooming with the wheel keeps following).
  useEffect(() => {
    let start: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => (start = { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      if (!start || e.buttons === 0) return
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6 && useWarehouse.getState().follow) {
        useWarehouse.getState().setFollow(false)
        goal.current = null
      }
    }
    const up = () => (start = null)
    // Wheel zoom wins over any glide in progress; following picks up from the new distance.
    const wheel = () => (goal.current = null)
    dom.addEventListener('wheel', wheel, { passive: true })
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      dom.removeEventListener('wheel', wheel)
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dom])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return
    // Follow the selected vehicle: keep gliding the target to where it is now.
    const st = useWarehouse.getState()
    const at = st.follow && st.selection ? worldPosition(st.selection) : null
    if (st.follow && st.selection && at) {
      // Carry the camera along with the vehicle so it never trails behind, even at 8×.
      // The glide below only closes the gap left when following started.
      const key = `${st.selection.kind}:${st.selection.id}`
      const prev = followed.current
      if (prev && prev.key === key) {
        const dx = at.x - prev.x
        const dz = at.z - prev.z
        if (Math.hypot(dx, dz) < 40) {
          c.target.x += dx
          c.target.z += dz
          camera.position.x += dx
          camera.position.z += dz
        }
      }
      followed.current = { key, x: at.x, z: at.z }
      const base = goal.current ?? current()
      goal.current = { ...base, target: new Vector3(at.x, 0, at.z) }
    } else followed.current = null
    const g = goal.current
    if (g) {
      const k = 1 - Math.exp(-Math.min(delta, 0.05) * 4)
      const cur = current()
      const dTheta = Math.atan2(Math.sin(g.theta - cur.theta), Math.cos(g.theta - cur.theta))
      c.target.lerp(g.target, k)
      const radius = cur.radius + (g.radius - cur.radius) * k
      const phi = cur.phi + (g.phi - cur.phi) * k
      const theta = cur.theta + dTheta * k
      camera.position.copy(c.target).add(tmp.current.v.setFromSphericalCoords(radius, phi, theta))
      c.update()
      if (c.target.distanceTo(g.target) < 0.05 && Math.abs(radius - g.radius) < 0.1 && Math.abs(dTheta) < 0.002) goal.current = null
    }
    const dist = camera.position.distanceTo(c.target)
    const zoomed = useWarehouse.getState().zoomedIn
    if (!zoomed && dist < XRAY_IN) setZoomedIn(true)
    else if (zoomed && dist > XRAY_OUT) setZoomedIn(false)
  })

  const clamp = () => {
    const c = controls.current
    if (!c) return
    const t = c.target
    const cx = Math.min(maxX, Math.max(minX, t.x)) - t.x
    const cz = Math.min(230, Math.max(-60, t.z)) - t.z
    if (cx !== 0 || cz !== 0 || t.y !== 0) {
      const fix = tmp.current.v.set(cx, -t.y, cz)
      t.add(fix)
      camera.position.add(fix)
    }
  }

  return (
    <>
      <MapControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.09}
        screenSpacePanning={false}
        minDistance={24}
        maxDistance={mobile ? 380 : 320}
        minPolarAngle={0.45}
        maxPolarAngle={1.1}
        rotateSpeed={0.6}
        zoomSpeed={0.9}
        onStart={() => {
          if (!useWarehouse.getState().follow) goal.current = null
        }}
        onChange={clamp}
      />
      <SunLight controls={controls} />
    </>
  )
}

/** World position for any selection: live for vehicles, from the layout for fixed things. */
function worldPosition(sel: Selection): { x: number; z: number } | null {
  if (sel.kind === 'truck' || sel.kind === 'forklift') return livePositions.get(sel.id) ?? null
  const s = useWarehouse.getState()
  if (sel.kind === 'shipment') {
    const sh = s.shipments[sel.id]
    if (!sh) return null
    // Follow the truck while it is driving, else look at the door the pallets are at.
    if (sh.truckId && ['in-transit', 'at-customer', 'loading'].includes(sh.status)) return livePositions.get(sh.truckId) ?? null
    if (sh.dockId) return worldPosition({ kind: 'dock', id: sh.dockId })
    const site = s.sites.find((x) => x.id === sh.siteId)
    return site ? { x: site.origin.x, z: site.origin.z } : null
  }
  if (sel.kind === 'dock') {
    const dock = s.docks[sel.id]
    const site = s.sites.find((x) => x.id === dock?.siteId)
    if (!dock || !site) return null
    const p = dockPosition(dock.number)
    return { x: site.origin.x + p.x, z: site.origin.z + p.z + 5 }
  }
  const { siteId, aisle, bay } = parseRackId(sel.id)
  const site = s.sites.find((x) => x.id === siteId)
  if (!site) return null
  const p = rackPosition(aisle, bay)
  return { x: site.origin.x + p.x, z: site.origin.z + p.z }
}

/** Soft sun that follows the camera target so shadows stay crisp wherever you look. */
function SunLight({ controls }: { controls: { current: Controls | null } }) {
  const light = useRef<DirectionalLight>(null)
  const anchor = useRef(new Object3D())
  useFrame(() => {
    const c = controls.current
    const l = light.current
    if (!c || !l) return
    anchor.current.position.copy(c.target)
    anchor.current.updateMatrixWorld()
    l.position.set(c.target.x + 38, 85, c.target.z + 62)
    l.target = anchor.current
  })
  return (
    <directionalLight
      ref={light}
      color="#fff6ea"
      intensity={2.5}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-75}
      shadow-camera-right={75}
      shadow-camera-top={75}
      shadow-camera-bottom={-75}
      shadow-camera-near={10}
      shadow-camera-far={240}
      shadow-bias={-0.0003}
      shadow-normalBias={0.05}
    />
  )
}
