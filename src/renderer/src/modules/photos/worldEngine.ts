import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'

export interface BlockData {
  id: string
  photoId: string
  x: number
  y: number
  z: number
}

export interface RegionData {
  id: string
  name: string
  color: string
  centerX: number
  centerZ: number
}

export type WorldMode = 'orbit' | 'walk'

const GROUND = 64
const HALF = GROUND / 2
const REGION_SIZE = 12
const PAN_SPEED = 0.4

const EYE = 1.7
const WALK_SPEED = 6
const SPRINT_MULT = 1.8
const GRAVITY = 22
const JUMP_V = 8
const BOB_AMP = 0.06
const BOB_FREQ = 9

interface EngineCallbacks {
  onPlace: (x: number, z: number) => void
  onPickBlock: (blockId: string) => void
  onRemoveBlock: (blockId: string) => void
  onHoverCell: (cell: { x: number; z: number } | null) => void
  onLockChange: (locked: boolean) => void
}

export class WorldEngine {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private orbit: OrbitControls
  private walk: PointerLockControls
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private center = new THREE.Vector2(0, 0)
  private clock = new THREE.Clock()
  private ground: THREE.Mesh
  private ghost: THREE.Mesh
  private held: THREE.Mesh
  private blocksGroup = new THREE.Group()
  private regionsGroup = new THREE.Group()
  private blockMeshes = new Map<string, THREE.Mesh>()
  private regionObjs = new Map<string, THREE.Group>()
  private heights = new Map<string, number>()
  private textureCache = new Map<string, THREE.Texture>()
  private cb: EngineCallbacks
  private resolveUrl: (photoId: string) => string | null = () => null
  private placementUrl: string | null = null
  private downPos = { x: 0, y: 0 }
  private rightDownPos = { x: 0, y: 0 }
  private lastGroundCell: { x: number; z: number } | null = null
  private keys = new Set<string>()
  private ro: ResizeObserver
  private mode: WorldMode = 'orbit'
  private locked = false
  private vy = 0
  private onGround = false
  private bobPhase = 0

  constructor(container: HTMLElement, cb: EngineCallbacks) {
    this.container = container
    this.cb = cb

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(new THREE.Color(0xb8d4ea), GROUND * 1.1, GROUND * 2.6)

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000)
    this.camera.position.set(20, 24, 26)
    this.scene.add(this.camera)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.55
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.cursor = 'grab'
    this.renderer.domElement.tabIndex = 0

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.08
    this.orbit.target.set(0, 1, 0)
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.04
    this.orbit.minDistance = 4
    this.orbit.maxDistance = GROUND * 1.2

    this.walk = new PointerLockControls(this.camera, this.renderer.domElement)
    this.walk.addEventListener('lock', () => {
      this.locked = true
      this.cb.onLockChange(true)
    })
    this.walk.addEventListener('unlock', () => {
      this.locked = false
      this.cb.onLockChange(false)
    })

    // ----- Sky + sun -----
    const sky = new Sky()
    sky.scale.setScalar(GROUND * 60)
    this.scene.add(sky)
    const sun = new THREE.Vector3()
    const elevation = 24
    const azimuth = 135
    const phi = THREE.MathUtils.degToRad(90 - elevation)
    const theta = THREE.MathUtils.degToRad(azimuth)
    sun.setFromSphericalCoords(1, phi, theta)
    const u = sky.material.uniforms
    u['turbidity'].value = 8
    u['rayleigh'].value = 1.6
    u['mieCoefficient'].value = 0.005
    u['mieDirectionalG'].value = 0.8
    u['sunPosition'].value.copy(sun)

    // ----- Lights -----
    this.scene.add(new THREE.HemisphereLight(0xbcd9ff, 0x4a5a3a, 0.55))
    const dir = new THREE.DirectionalLight(0xfff2d8, 2.4)
    dir.position.copy(sun).multiplyScalar(80)
    dir.castShadow = true
    dir.shadow.mapSize.set(2048, 2048)
    dir.shadow.camera.near = 1
    dir.shadow.camera.far = 260
    const s = HALF * 0.8
    dir.shadow.camera.left = -s
    dir.shadow.camera.right = s
    dir.shadow.camera.top = s
    dir.shadow.camera.bottom = -s
    dir.shadow.bias = -0.0004
    this.scene.add(dir)
    this.scene.add(dir.target)

    // ----- Ground -----
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND, GROUND),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 })
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.ground.name = 'ground'
    this.scene.add(this.ground)

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(GROUND, 0.02, GROUND)),
      new THREE.LineBasicMaterial({ color: 0x6f8f63 })
    )
    edge.position.y = 0.02
    this.scene.add(edge)

    this.scene.add(this.regionsGroup)
    this.scene.add(this.blocksGroup)

    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.96, 0.96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })
    )
    this.ghost.visible = false
    this.scene.add(this.ghost)

    // held photo (walk mode "in hand")
    this.held = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ transparent: true })
    )
    this.held.position.set(0.46, -0.34, -1)
    this.held.rotation.set(0.1, -0.25, 0.06)
    this.held.visible = false
    this.held.renderOrder = 999
    this.camera.add(this.held)

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()

    this.renderer.setAnimationLoop(this.animate)
  }

  setUrlResolver(fn: (photoId: string) => string | null) {
    this.resolveUrl = fn
  }

  getLastGroundCell() {
    return this.lastGroundCell
  }

  getMode() {
    return this.mode
  }

  setMode(mode: WorldMode) {
    if (mode === this.mode) return
    this.mode = mode
    if (mode === 'walk') {
      this.orbit.enabled = false
      const tx = clamp(this.orbit.target.x, -HALF + 1, HALF - 1)
      const tz = clamp(this.orbit.target.z, -HALF + 1, HALF - 1)
      const floor = this.floorAt(tx, tz)
      this.camera.position.set(tx, floor + EYE, tz + 0.001)
      this.camera.lookAt(tx, floor + EYE, tz - 5)
      this.vy = 0
      this.held.visible = !!this.placementUrl
      this.renderer.domElement.style.cursor = 'default'
    } else {
      if (this.locked) this.walk.unlock()
      this.orbit.enabled = true
      this.held.visible = false
      const fwd = new THREE.Vector3()
      this.camera.getWorldDirection(fwd)
      const t = this.camera.position.clone().add(fwd.multiplyScalar(8))
      this.orbit.target.set(t.x, 1, t.z)
      this.renderer.domElement.style.cursor = this.placementUrl ? 'copy' : 'grab'
    }
  }

  requestLock() {
    if (this.mode === 'walk' && !this.locked) this.walk.lock()
  }

  setPlacement(url: string | null) {
    this.placementUrl = url
    if (this.mode === 'orbit') this.renderer.domElement.style.cursor = url ? 'copy' : 'grab'
    if (!url) {
      this.ghost.visible = false
      this.held.visible = false
    } else {
      const tex = this.getTexture(url)
      const gmat = this.ghost.material as THREE.MeshBasicMaterial
      gmat.map = tex
      gmat.color.set(0xffffff)
      gmat.opacity = 0.6
      gmat.needsUpdate = true
      const hmat = this.held.material as THREE.MeshBasicMaterial
      hmat.map = tex
      hmat.needsUpdate = true
      this.held.visible = this.mode === 'walk'
    }
  }

  /** Framed, aspect-correct photo texture (cached). */
  private getTexture(url: string): THREE.Texture {
    const cached = this.textureCache.get(url)
    if (cached) return cached
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#f6f3ec'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#11151d'
    const pad = size * 0.06
    ctx.fillRect(pad, pad, size - 2 * pad, size - 2 * pad)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    this.textureCache.set(url, tex)

    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#f6f3ec'
      ctx.fillRect(0, 0, size, size)
      const inner = size - 2 * pad
      ctx.fillStyle = '#11151d'
      ctx.fillRect(pad, pad, inner, inner)
      const ar = img.width / img.height || 1
      let w = inner
      let h = inner
      if (ar > 1) h = inner / ar
      else w = inner * ar
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      ctx.strokeStyle = '#d8d2c4'
      ctx.lineWidth = 3
      ctx.strokeRect(2, 2, size - 4, size - 4)
      tex.needsUpdate = true
    }
    img.onerror = () => {}
    img.src = url
    return tex
  }

  private key(x: number, z: number) {
    return `${x},${z}`
  }

  private floorAt(x: number, z: number): number {
    return this.heights.get(this.key(Math.round(x), Math.round(z))) ?? 0
  }

  syncBlocks(blocks: BlockData[]) {
    const incoming = new Set(blocks.map((b) => b.id))
    for (const [id, mesh] of this.blockMeshes) {
      if (!incoming.has(id)) {
        this.blocksGroup.remove(mesh)
        disposeMesh(mesh)
        this.blockMeshes.delete(id)
      }
    }
    for (const b of blocks) {
      let mesh = this.blockMeshes.get(b.id)
      if (!mesh) {
        mesh = this.makeBlock(b)
        this.blockMeshes.set(b.id, mesh)
        this.blocksGroup.add(mesh)
      }
      mesh.position.set(b.x, b.y + 0.5, b.z)
    }
    this.heights.clear()
    for (const b of blocks) {
      const k = this.key(b.x, b.z)
      this.heights.set(k, Math.max(this.heights.get(k) ?? 0, b.y + 1))
    }
  }

  setRegions(regions: RegionData[]) {
    const incoming = new Set(regions.map((r) => r.id))
    for (const [id, obj] of this.regionObjs) {
      if (!incoming.has(id)) {
        this.regionsGroup.remove(obj)
        obj.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
            o.geometry?.dispose?.()
            const m = o.material as THREE.Material | THREE.Material[]
            ;(Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
          }
        })
        this.regionObjs.delete(id)
      }
    }
    for (const r of regions) {
      let obj = this.regionObjs.get(r.id)
      if (!obj) {
        obj = this.makeRegion(r)
        this.regionObjs.set(r.id, obj)
        this.regionsGroup.add(obj)
      }
      obj.position.set(r.centerX, 0, r.centerZ)
    }
  }

  private makeRegion(r: RegionData): THREE.Group {
    const group = new THREE.Group()
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(REGION_SIZE, REGION_SIZE),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color), transparent: true, opacity: 0.16, depthWrite: false })
    )
    patch.rotation.x = -Math.PI / 2
    patch.position.y = 0.04
    group.add(patch)

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(REGION_SIZE, REGION_SIZE)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(r.color), transparent: true, opacity: 0.7 })
    )
    border.rotation.x = -Math.PI / 2
    border.position.y = 0.05
    group.add(border)

    const label = makeLabelSprite(r.name, r.color)
    label.position.set(0, 3.2, 0)
    group.add(label)
    return group
  }

  private makeBlock(b: BlockData): THREE.Mesh {
    const url = this.resolveUrl(b.photoId)
    const photoMat = url
      ? new THREE.MeshStandardMaterial({ map: this.getTexture(url), roughness: 0.85 })
      : new THREE.MeshStandardMaterial({ color: 0x445066 })
    const frame = new THREE.MeshStandardMaterial({ color: 0xece7db, roughness: 0.9 })
    const materials = [photoMat, photoMat, frame, frame, photoMat, photoMat]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.94, 0.94), materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.blockId = b.id
    return mesh
  }

  /* ----------------------------- Input ----------------------------- */

  private onPointerDown = (e: PointerEvent) => {
    if (this.mode === 'walk') {
      if (!this.locked) {
        this.walk.lock()
        return
      }
      if (e.button === 0) this.walkAction('place')
      else if (e.button === 2) this.walkAction('remove')
      return
    }
    if (e.button === 2) {
      this.rightDownPos = { x: e.clientX, y: e.clientY }
      return
    }
    this.downPos = { x: e.clientX, y: e.clientY }
    this.renderer.domElement.style.cursor = this.placementUrl ? 'copy' : 'grabbing'
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this.mode !== 'orbit' || e.button === 2) return
    this.renderer.domElement.style.cursor = this.placementUrl ? 'copy' : 'grab'
    const moved = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y)
    if (moved > 5) return
    this.updatePointer(e)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    if (this.placementUrl) {
      const hit = this.raycaster.intersectObject(this.ground)[0]
      if (hit) this.cb.onPlace(Math.round(hit.point.x), Math.round(hit.point.z))
      return
    }
    const blockHit = this.raycaster.intersectObjects(this.blocksGroup.children)[0]
    if (blockHit) {
      const id = blockHit.object.userData.blockId as string
      if (id) this.cb.onPickBlock(id)
    }
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    if (this.mode !== 'orbit') return
    const moved = Math.hypot(e.clientX - this.rightDownPos.x, e.clientY - this.rightDownPos.y)
    if (moved > 5) return
    this.updatePointer(e)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const blockHit = this.raycaster.intersectObjects(this.blocksGroup.children)[0]
    if (blockHit) {
      const id = blockHit.object.userData.blockId as string
      if (id) this.cb.onRemoveBlock(id)
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.mode !== 'orbit') return
    this.updatePointer(e)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObject(this.ground)[0]
    if (hit) {
      const x = Math.round(hit.point.x)
      const z = Math.round(hit.point.z)
      this.lastGroundCell = { x, z }
      if (this.placementUrl) {
        this.ghost.position.set(x, this.floorAt(x, z) + 0.5, z)
        this.ghost.visible = true
        this.cb.onHoverCell({ x, z })
      }
    } else {
      this.lastGroundCell = null
      if (this.placementUrl) {
        this.ghost.visible = false
        this.cb.onHoverCell(null)
      }
    }
  }

  private walkAction(type: 'place' | 'remove') {
    this.raycaster.setFromCamera(this.center, this.camera)
    if (type === 'remove') {
      const hit = this.raycaster.intersectObjects(this.blocksGroup.children)[0]
      if (hit) {
        const id = hit.object.userData.blockId as string
        if (id) this.cb.onRemoveBlock(id)
      }
      return
    }
    if (this.placementUrl) {
      const hits = this.raycaster.intersectObjects([this.ground, ...this.blocksGroup.children])
      const hit = hits[0]
      if (hit && hit.distance < 18) this.cb.onPlace(Math.round(hit.point.x), Math.round(hit.point.z))
    } else {
      const hit = this.raycaster.intersectObjects(this.blocksGroup.children)[0]
      if (hit) {
        const id = hit.object.userData.blockId as string
        if (id) this.cb.onPickBlock(id)
      }
    }
  }

  private updatePointer(e: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping()) return
    const k = e.key.toLowerCase()
    if (['w', 'a', 's', 'd', 'shift'].includes(k)) this.keys.add(k)
    if (k === ' ') {
      this.keys.add(' ')
      if (this.mode === 'walk') {
        e.preventDefault()
        if (this.onGround) {
          this.vy = JUMP_V
          this.onGround = false
        }
      }
    }
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase())
    if (e.key === ' ') this.keys.delete(' ')
  }

  private animate = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.mode === 'orbit') {
      if (this.keys.size) this.applyPan()
      this.orbit.update()
    } else {
      this.updateWalk(dt)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private applyPan() {
    const forward = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) return
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
    const move = new THREE.Vector3()
    if (this.keys.has('w')) move.add(forward)
    if (this.keys.has('s')) move.sub(forward)
    if (this.keys.has('d')) move.add(right)
    if (this.keys.has('a')) move.sub(right)
    if (move.lengthSq() === 0) return
    move.normalize().multiplyScalar(PAN_SPEED)
    this.camera.position.add(move)
    this.orbit.target.add(move)
  }

  private updateWalk(dt: number) {
    let moving = false
    if (this.locked) {
      const speed = WALK_SPEED * (this.keys.has('shift') ? SPRINT_MULT : 1) * dt
      let f = 0
      let r = 0
      if (this.keys.has('w')) f += 1
      if (this.keys.has('s')) f -= 1
      if (this.keys.has('d')) r += 1
      if (this.keys.has('a')) r -= 1
      if (f !== 0) this.walk.moveForward(f * speed)
      if (r !== 0) this.walk.moveRight(r * speed)
      moving = f !== 0 || r !== 0
      this.camera.position.x = clamp(this.camera.position.x, -HALF + 0.5, HALF - 0.5)
      this.camera.position.z = clamp(this.camera.position.z, -HALF + 0.5, HALF - 0.5)
    }
    let feet = this.camera.position.y - EYE
    this.vy -= GRAVITY * dt
    feet += this.vy * dt
    const floor = this.floorAt(this.camera.position.x, this.camera.position.z)
    if (feet <= floor) {
      feet = floor
      this.vy = 0
      this.onGround = true
    } else {
      this.onGround = false
    }
    // head-bob while walking on ground
    let bob = 0
    if (moving && this.onGround) {
      this.bobPhase += dt * BOB_FREQ
      bob = Math.sin(this.bobPhase) * BOB_AMP
    } else {
      this.bobPhase = 0
    }
    this.camera.position.y = feet + EYE + bob
  }

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  resetCamera() {
    if (this.mode === 'walk') this.setMode('orbit')
    this.camera.position.set(20, 24, 26)
    this.orbit.target.set(0, 1, 0)
  }

  flyTo(x: number, z: number) {
    if (this.mode === 'walk') {
      this.camera.position.set(x, this.floorAt(x, z) + EYE, z + 0.001)
    } else {
      this.orbit.target.set(x, 1, z)
      this.camera.position.set(x + 10, 14, z + 12)
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    if (this.locked) this.walk.unlock()
    this.walk.dispose()
    this.orbit.dispose()
    this.blockMeshes.forEach((m) => disposeMesh(m))
    this.textureCache.forEach((t) => t.dispose())
    this.renderer.dispose()
    if (el.parentElement) el.parentElement.removeChild(el)
  }

  static get size() {
    return { GROUND, HALF }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function isTyping(): boolean {
  const ae = document.activeElement as HTMLElement | null
  if (!ae) return false
  const tag = ae.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable
}

function disposeMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose()
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  mats.forEach((m) => m.dispose())
}

function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = 'bold 44px Segoe UI, sans-serif'
  ctx.font = font
  const padding = 24
  const textW = ctx.measureText(text).width
  canvas.width = Math.ceil(textW + padding * 2)
  canvas.height = 80
  ctx.fillStyle = 'rgba(10,14,22,0.78)'
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 18)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  roundRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 16)
  ctx.stroke()
  ctx.font = font
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padding, canvas.height / 2 + 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  const scale = 0.035
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function makeGroundTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#4f8a43'
  ctx.fillRect(0, 0, 32, 32)
  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#57964a' : '#447a3a'
    ctx.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), 2, 2)
  }
  ctx.strokeStyle = '#3c6e34'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, 32, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.NearestFilter
  tex.repeat.set(GROUND, GROUND)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
