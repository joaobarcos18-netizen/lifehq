import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'

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
const WALK_SPEED = 5.2
const SPRINT_MULT = 1.8
const GRAVITY = 24
const JUMP_V = 8.4
const BOB_AMP = 0.05
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
  private elapsed = 0
  private ground!: THREE.Mesh
  private ghost: THREE.Mesh
  private held: THREE.Mesh
  private outline: THREE.LineSegments
  private clouds: THREE.Mesh[] = []
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
    const horizon = new THREE.Color(0xbfe3ff)
    this.scene.fog = new THREE.Fog(horizon, GROUND * 0.95, GROUND * 1.9)

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1000)
    this.camera.position.set(18, 22, 24)
    this.scene.add(this.camera)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
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
    this.orbit.minDistance = 3
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

    this.buildSky(horizon)
    this.buildLights()
    this.buildGround()

    this.scene.add(this.regionsGroup)
    this.scene.add(this.blocksGroup)

    // placement ghost
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })
    )
    this.ghost.visible = false
    this.scene.add(this.ghost)

    // block-targeting outline (Minecraft selection box)
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })
    )
    this.outline.visible = false
    this.scene.add(this.outline)

    // held photo (walk "in hand")
    this.held = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ transparent: true })
    )
    this.held.position.set(0.5, -0.36, -1)
    this.held.rotation.set(0.12, -0.3, 0.05)
    this.held.visible = false
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

  /* ----------------------------- World build ----------------------------- */

  private buildSky(horizon: THREE.Color) {
    // gradient sky dome
    const skyGeo = new THREE.SphereGeometry(GROUND * 3, 32, 16)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x4f9be8) },
        bottom: { value: horizon }
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        void main(){ float h = clamp((normalize(vP).y + 0.1) / 0.7, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`
    })
    this.scene.add(new THREE.Mesh(skyGeo, skyMat))

    // blocky sun
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ map: sunTexture(), transparent: true, depthWrite: false, fog: false })
    )
    sun.position.set(-60, 70, -90)
    sun.lookAt(0, 0, 0)
    this.scene.add(sun)

    // drifting pixel clouds
    const cloudTex = cloudTexture()
    for (let i = 0; i < 14; i++) {
      const size = 10 + ((i * 7) % 16)
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size * 0.6),
        new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false })
      )
      cloud.rotation.x = -Math.PI / 2
      cloud.position.set(((i * 53) % GROUND) - HALF, 34 + (i % 3) * 4, ((i * 91) % GROUND) - HALF)
      this.scene.add(cloud)
      this.clouds.push(cloud)
    }
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a6a3a, 0.85))
    const dir = new THREE.DirectionalLight(0xffffff, 1.7)
    dir.position.set(-40, 60, -40)
    dir.castShadow = true
    dir.shadow.mapSize.set(2048, 2048)
    dir.shadow.camera.near = 1
    dir.shadow.camera.far = 220
    const s = HALF * 0.85
    dir.shadow.camera.left = -s
    dir.shadow.camera.right = s
    dir.shadow.camera.top = s
    dir.shadow.camera.bottom = -s
    dir.shadow.bias = -0.0005
    this.scene.add(dir)
    this.scene.add(dir.target)
  }

  private buildGround() {
    // invisible plane at the grass surface (y=0) used for raycasting placement cells
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND, GROUND),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.name = 'ground'
    this.scene.add(this.ground)

    // grass blocks (top layer, occupy y[-1,0]) via instancing
    const grassMats = [grassSideTex(), grassSideTex(), grassTopTex(), dirtTex(), grassSideTex(), grassSideTex()].map(
      (t) => new THREE.MeshLambertMaterial({ map: t })
    )
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const n = (GROUND + 1) * (GROUND + 1)
    const grass = new THREE.InstancedMesh(geo, grassMats, n)
    grass.receiveShadow = true
    grass.castShadow = false
    const m = new THREE.Matrix4()
    let i = 0
    for (let x = -HALF; x <= HALF; x++) {
      for (let z = -HALF; z <= HALF; z++) {
        m.setPosition(x, -0.5, z)
        grass.setMatrixAt(i++, m)
      }
    }
    grass.instanceMatrix.needsUpdate = true
    this.scene.add(grass)

    // earth cross-section beneath, so edges look deep
    const dirtT = dirtTex()
    dirtT.repeat.set(GROUND, 5)
    const stoneT = stoneTex()
    stoneT.repeat.set(GROUND, 5)
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(GROUND + 1, 6, GROUND + 1),
      [
        new THREE.MeshLambertMaterial({ map: dirtT }),
        new THREE.MeshLambertMaterial({ map: dirtT }),
        new THREE.MeshLambertMaterial({ map: stoneT }),
        new THREE.MeshLambertMaterial({ map: stoneT }),
        new THREE.MeshLambertMaterial({ map: dirtT }),
        new THREE.MeshLambertMaterial({ map: dirtT })
      ]
    )
    under.position.set(0, -4, 0)
    this.scene.add(under)
  }

  /* ----------------------------- Public API ----------------------------- */

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
      this.outline.visible = false
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
      gmat.opacity = 0.55
      gmat.needsUpdate = true
      const hmat = this.held.material as THREE.MeshBasicMaterial
      hmat.map = tex
      hmat.needsUpdate = true
      this.held.visible = this.mode === 'walk'
    }
  }

  /** Framed, aspect-correct photo texture in a wood frame (cached). */
  private getTexture(url: string): THREE.Texture {
    const cached = this.textureCache.get(url)
    if (cached) return cached
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    drawFrame(ctx, size, null)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.LinearFilter
    tex.anisotropy = 4
    this.textureCache.set(url, tex)
    const img = new Image()
    img.onload = () => {
      drawFrame(ctx, size, img)
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
            const mm = o.material as THREE.Material | THREE.Material[]
            ;(Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose())
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
      new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color), transparent: true, opacity: 0.18, depthWrite: false })
    )
    patch.rotation.x = -Math.PI / 2
    patch.position.y = 0.05
    group.add(patch)
    const label = makeLabelSprite(r.name, r.color)
    label.position.set(0, 3.4, 0)
    group.add(label)
    return group
  }

  private makeBlock(b: BlockData): THREE.Mesh {
    const url = this.resolveUrl(b.photoId)
    const photoMat = url
      ? new THREE.MeshLambertMaterial({ map: this.getTexture(url) })
      : new THREE.MeshLambertMaterial({ color: 0x6b7686 })
    const frame = new THREE.MeshLambertMaterial({ map: woodTex() })
    const materials = [photoMat, photoMat, frame, frame, photoMat, photoMat]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials)
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
    const blockHit = this.raycaster.intersectObjects(this.blocksGroup.children)[0]
    const groundHit = this.raycaster.intersectObject(this.ground)[0]
    if (blockHit && (!groundHit || blockHit.distance <= groundHit.distance)) {
      this.outline.position.copy((blockHit.object as THREE.Mesh).position)
      this.outline.visible = true
    } else if (groundHit) {
      const x = Math.round(groundHit.point.x)
      const z = Math.round(groundHit.point.z)
      this.lastGroundCell = { x, z }
      this.outline.position.set(x, -0.5, z)
      this.outline.visible = true
      if (this.placementUrl) {
        this.ghost.position.set(x, this.floorAt(x, z) + 0.5, z)
        this.ghost.visible = true
        this.cb.onHoverCell({ x, z })
      }
    } else {
      this.outline.visible = false
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
    this.elapsed += dt
    // drift clouds
    for (const c of this.clouds) {
      c.position.x += dt * 0.6
      if (c.position.x > HALF + 12) c.position.x = -HALF - 12
    }
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
      // selection outline from crosshair
      this.raycaster.setFromCamera(this.center, this.camera)
      const bHit = this.raycaster.intersectObjects(this.blocksGroup.children)[0]
      const gHit = this.raycaster.intersectObject(this.ground)[0]
      if (bHit && bHit.distance < 18) {
        this.outline.position.copy((bHit.object as THREE.Mesh).position)
        this.outline.visible = true
      } else if (gHit && gHit.distance < 18) {
        this.outline.position.set(Math.round(gHit.point.x), -0.5, Math.round(gHit.point.z))
        this.outline.visible = true
      } else {
        this.outline.visible = false
      }
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
    this.camera.position.set(18, 22, 24)
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
    this.blockMeshes.forEach((mm) => disposeMesh(mm))
    this.textureCache.forEach((t) => t.dispose())
    this.renderer.dispose()
    if (el.parentElement) el.parentElement.removeChild(el)
  }

  static get size() {
    return { GROUND, HALF }
  }
}

/* ----------------------------- helpers ----------------------------- */

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
  mats.forEach((mm) => mm.dispose())
}

function pixelCanvas(size = 16): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  return { canvas, ctx: canvas.getContext('2d')! }
}

function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function speckle(ctx: CanvasRenderingContext2D, size: number, cols: string[], from = 0, to = size) {
  for (let x = 0; x < size; x++) {
    for (let y = from; y < to; y++) {
      ctx.fillStyle = cols[(x * 7 + y * 13) % cols.length]
      ctx.fillRect(x, y, 1, 1)
    }
  }
}

function grassTopTex(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas()
  speckle(ctx, 16, ['#5fa548', '#69b052', '#578f43', '#62a84d'])
  return pixelTexture(canvas)
}

function grassSideTex(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas()
  speckle(ctx, 16, ['#8a6239', '#7d5832', '#946a3f', '#82613a']) // dirt base
  speckle(ctx, 16, ['#5fa548', '#69b052', '#578f43'], 0, 4) // grass top strip
  // a few grass dribbles
  ctx.fillStyle = '#578f43'
  for (let x = 0; x < 16; x += 3) ctx.fillRect(x, 4, 1, 1)
  return pixelTexture(canvas)
}

function dirtTex(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas()
  speckle(ctx, 16, ['#8a6239', '#7d5832', '#946a3f', '#74522e'])
  return pixelTexture(canvas)
}

function stoneTex(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas()
  speckle(ctx, 16, ['#8b8f96', '#7e828a', '#969aa1', '#787c84'])
  return pixelTexture(canvas)
}

function woodTex(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas()
  speckle(ctx, 16, ['#9a6b3c', '#8a5d33', '#a4743f', '#825634'])
  return pixelTexture(canvas)
}

function sunTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = pixelCanvas(16)
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, 16, 16)
  ctx.fillStyle = '#fff4c2'
  ctx.fillRect(2, 2, 12, 12)
  ctx.fillStyle = '#ffe98a'
  ctx.fillRect(3, 3, 10, 10)
  return pixelTexture(canvas)
}

function cloudTexture(): THREE.CanvasTexture {
  const size = 16
  const { canvas, ctx } = pixelCanvas(size)
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#ffffff'
  const cells = [
    [3, 6],[4, 6],[5, 5],[6, 5],[7, 5],[8, 6],[9, 6],[10, 7],
    [4, 7],[5, 6],[6, 6],[7, 6],[8, 7],[9, 7],[5, 7],[6, 7],[7, 7],[8, 8],[6, 8],[7, 8]
  ]
  for (const [x, y] of cells) ctx.fillRect(x, y, 1, 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function drawFrame(ctx: CanvasRenderingContext2D, size: number, img: HTMLImageElement | null) {
  // wooden frame
  ctx.fillStyle = '#8a5d33'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#6f4a28'
  ctx.fillRect(0, 0, size, size)
  const pad = Math.round(size * 0.09)
  const inner = size - 2 * pad
  ctx.fillStyle = '#11151d'
  ctx.fillRect(pad, pad, inner, inner)
  if (img) {
    const ar = img.width / img.height || 1
    let w = inner
    let h = inner
    if (ar > 1) h = inner / ar
    else w = inner * ar
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  }
  // frame bevel
  ctx.strokeStyle = '#a4743f'
  ctx.lineWidth = Math.max(2, size * 0.012)
  ctx.strokeRect(2, 2, size - 4, size - 4)
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
  sprite.scale.set(canvas.width * 0.035, canvas.height * 0.035, 1)
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
