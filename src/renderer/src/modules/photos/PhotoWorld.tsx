import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, Footprints, ImagePlus, Info, MapPin, MousePointerClick, Orbit, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { api } from '@/lib/ipc'
import { useAsync } from '@/lib/useAsync'
import { Button, Field, Input } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { vaultUrl } from '@/lib/format'
import type { Photo, PhotoBlock, WorldRegion } from '@shared/types'
import { WorldEngine, type BlockData, type WorldMode } from './worldEngine'

const REGION_COLORS = ['#7cc576', '#f4a64b', '#5bb8e6', '#f472b6', '#a78bfa', '#fb7185', '#fbbf24', '#34d399']

export default function PhotoWorld() {
  const photos = useAsync(() => api.listPhotos(), [])
  const blocks = useAsync(() => api.listPhotoBlocks(), [])
  const regions = useAsync(() => api.listRegions(), [])

  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<WorldEngine | null>(null)
  const [ready, setReady] = useState(false)

  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; z: number } | null>(null)
  const [viewer, setViewer] = useState<{ block: PhotoBlock; photo?: Photo } | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<WorldMode>('orbit')
  const [locked, setLocked] = useState(false)

  // Region creation modal
  const [regionModalOpen, setRegionModalOpen] = useState(false)
  const [regionName, setRegionName] = useState('')
  const [regionColor, setRegionColor] = useState(REGION_COLORS[0])

  // Latest data for engine callbacks
  const photosRef = useRef<Photo[]>([])
  const blocksRef = useRef<PhotoBlock[]>([])
  const selectedRef = useRef<string | null>(null)
  const selectedRegionRef = useRef<string | null>(null)
  photosRef.current = photos.data ?? []
  blocksRef.current = blocks.data ?? []
  selectedRef.current = selectedPhotoId
  selectedRegionRef.current = selectedRegionId

  const photoMap = useMemo(() => {
    const m = new Map<string, Photo>()
    ;(photos.data ?? []).forEach((p) => m.set(p.id, p))
    return m
  }, [photos.data])
  const photoMapRef = useRef(photoMap)
  photoMapRef.current = photoMap

  const regionMap = useMemo(() => {
    const m = new Map<string, WorldRegion>()
    ;(regions.data ?? []).forEach((r) => m.set(r.id, r))
    return m
  }, [regions.data])

  // Create engine once.
  useEffect(() => {
    if (!containerRef.current) return
    const engine = new WorldEngine(containerRef.current, {
      onHoverCell: (c) => setHoverCell(c),
      onPlace: async (x, z) => {
        const photoId = selectedRef.current
        if (!photoId) return
        const y = blocksRef.current.filter((b) => b.x === x && b.z === z).length
        await api.placePhotoBlock({ photoId, x, y, z, regionLabel: selectedRegionRef.current ?? undefined })
        blocks.reload()
      },
      onPickBlock: (id) => {
        const block = blocksRef.current.find((b) => b.id === id)
        if (block) setViewer({ block, photo: photoMapRef.current.get(block.photoId) })
      },
      onRemoveBlock: async (id) => {
        await api.removePhotoBlock(id)
        setViewer((v) => (v?.block.id === id ? null : v))
        blocks.reload()
      },
      onLockChange: (l) => setLocked(l)
    })
    engineRef.current = engine
    setReady(true)
    return () => {
      engine.dispose()
      engineRef.current = null
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync blocks + textures.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !ready) return
    engine.setUrlResolver((photoId) => {
      const p = photoMapRef.current.get(photoId)
      return p ? vaultUrl(p.vaultRelPath) : null
    })
    const data: BlockData[] = (blocks.data ?? []).map((b) => ({ id: b.id, photoId: b.photoId, x: b.x, y: b.y, z: b.z }))
    engine.syncBlocks(data)
  }, [ready, blocks.data, photos.data])

  // Sync regions.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !ready) return
    engine.setRegions(
      (regions.data ?? []).map((r) => ({ id: r.id, name: r.name, color: r.color, centerX: r.centerX, centerZ: r.centerZ }))
    )
  }, [ready, regions.data])

  // Placement ghost.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !ready) return
    const p = selectedPhotoId ? photoMap.get(selectedPhotoId) : null
    engine.setPlacement(p ? vaultUrl(p.vaultRelPath) : null)
  }, [ready, selectedPhotoId, photoMap])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedPhotoId(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Apply camera mode (orbit vs first-person walk).
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !ready) return
    engine.setMode(mode)
  }, [ready, mode])

  function toggleMode() {
    setMode((m) => (m === 'orbit' ? 'walk' : 'orbit'))
  }

  async function importPhotos() {
    setBusy(true)
    try {
      const created = await api.importPhotosDialog()
      photos.reload()
      if (created.length === 1) setSelectedPhotoId(created[0].id)
    } finally {
      setBusy(false)
    }
  }

  async function onDropPhotos(e: React.DragEvent) {
    e.preventDefault()
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => !!p)
    if (!paths.length) return
    setBusy(true)
    try {
      await api.importPhotoPaths(paths)
      photos.reload()
    } finally {
      setBusy(false)
    }
  }

  async function deletePhoto(p: Photo) {
    if (!window.confirm(`Delete "${p.fileName}"? It will also be removed from the world.`)) return
    await api.deletePhoto(p.id)
    if (selectedPhotoId === p.id) setSelectedPhotoId(null)
    photos.reload()
    blocks.reload()
  }

  async function createRegion() {
    if (!regionName.trim()) return
    const cell = engineRef.current?.getLastGroundCell()
    const count = regions.data?.length ?? 0
    const centerX = cell?.x ?? (count % 4) * 14 - 21
    const centerZ = cell?.z ?? Math.floor(count / 4) * 14 - 21
    const created = await api.saveRegion({ name: regionName.trim(), color: regionColor, centerX, centerZ })
    setRegionName('')
    setRegionModalOpen(false)
    regions.reload()
    setSelectedRegionId(created.id)
    engineRef.current?.flyTo(centerX, centerZ)
  }

  async function deleteRegion(r: WorldRegion) {
    if (!window.confirm(`Delete region "${r.name}"? Photos placed there stay, but lose the label.`)) return
    await api.deleteRegion(r.id)
    if (selectedRegionId === r.id) setSelectedRegionId(null)
    regions.reload()
  }

  const placedCount = useMemo(() => {
    const m = new Map<string, number>()
    ;(blocks.data ?? []).forEach((b) => m.set(b.photoId, (m.get(b.photoId) ?? 0) + 1))
    return m
  }, [blocks.data])

  const selectedPhoto = selectedPhotoId ? photoMap.get(selectedPhotoId) : null
  const selectedRegion = selectedRegionId ? regionMap.get(selectedRegionId) : null

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-700/70 text-grass-400">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Photo World</h1>
            <p className="text-sm text-slate-400">
              Pick a photo, then click the ground to place it. Stack them to build temples; group them into regions.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={mode === 'walk' ? 'primary' : 'outline'}
            icon={mode === 'walk' ? Orbit : Footprints}
            onClick={toggleMode}
          >
            {mode === 'walk' ? 'Orbit view' : 'Walk around'}
          </Button>
          <Button variant="ghost" icon={RotateCcw} onClick={() => engineRef.current?.resetCamera()}>
            Reset view
          </Button>
          <Button variant="primary" icon={ImagePlus} onClick={importPhotos} loading={busy}>
            Import photos
          </Button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 270px' }}>
        {/* 3D canvas */}
        <div
          className="relative overflow-hidden rounded-2xl border border-ink-600 bg-ink-950"
          style={{ height: 'calc(100vh - 210px)', minHeight: 460 }}
        >
          <div ref={containerRef} className="h-full w-full" onDragOver={(e) => e.preventDefault()} onDrop={onDropPhotos} />

          {/* HUD */}
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-ink-900/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
            {mode === 'walk' ? <Footprints className="h-3.5 w-3.5" /> : <MousePointerClick className="h-3.5 w-3.5" />}
            {mode === 'walk' ? (
              <span>
                {selectedPhoto ? (
                  <>
                    Walking · <span className="text-grass-400">{selectedPhoto.fileName}</span> · left-click place
                  </>
                ) : (
                  <>Walking · WASD move · mouse look · Space jump · left-click view</>
                )}{' '}
                · right-click dig · Esc release
              </span>
            ) : selectedPhoto ? (
              <span>
                Placing <span className="text-grass-400">{selectedPhoto.fileName}</span>
                {selectedRegion ? <> in <span style={{ color: selectedRegion.color }}>{selectedRegion.name}</span></> : ''}
                {hoverCell ? ` · (${hoverCell.x}, ${hoverCell.z})` : ''} · Esc to stop
              </span>
            ) : (
              <span>Drag to orbit · WASD to walk · scroll to zoom · right-click a block to remove it</span>
            )}
          </div>

          {/* Crosshair (walk mode) */}
          {mode === 'walk' && locked && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative h-5 w-5">
                <span className="absolute left-1/2 top-0 h-5 w-0.5 -translate-x-1/2 bg-white/70" />
                <span className="absolute top-1/2 left-0 h-0.5 w-5 -translate-y-1/2 bg-white/70" />
              </div>
            </div>
          )}

          {/* Click-to-look prompt (walk mode, not locked) */}
          {mode === 'walk' && !locked && (photos.data?.length ?? 0) > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => engineRef.current?.requestLock()}
                className="pointer-events-auto rounded-2xl border border-grass-500/40 bg-ink-900/85 px-6 py-5 text-center backdrop-blur transition hover:border-grass-400"
              >
                <Footprints className="mx-auto mb-2 h-8 w-8 text-grass-400" />
                <div className="font-semibold text-white">Click to look around</div>
                <div className="mt-1 text-xs text-slate-400">
                  WASD to move · mouse to look · Space to jump · Esc to release
                </div>
              </button>
            </div>
          )}

          {(photos.data?.length ?? 0) === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="pointer-events-auto max-w-sm rounded-2xl border border-dashed border-ink-500 bg-ink-900/80 p-6 text-center backdrop-blur">
                <Boxes className="mx-auto mb-3 h-9 w-9 text-grass-400" />
                <h3 className="font-semibold text-white">Your world is empty</h3>
                <p className="mt-1 text-sm text-slate-400">Import a few photos, then place them in the world.</p>
                <Button variant="primary" icon={ImagePlus} className="mt-4" onClick={importPhotos} loading={busy}>
                  Import photos
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 210px)', minHeight: 460 }}>
          {/* Regions */}
          <div className="rounded-2xl border border-ink-600 bg-ink-800/50">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <MapPin className="h-4 w-4 text-ember-400" /> Regions
              </h2>
              <button
                onClick={() => setRegionModalOpen(true)}
                className="rounded-md p-1 text-slate-400 hover:bg-ink-700 hover:text-white"
                title="New region"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto p-2">
              <button
                onClick={() => setSelectedRegionId(null)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  selectedRegionId === null ? 'bg-ink-700 text-white' : 'text-slate-400 hover:bg-ink-700/50'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> No region
              </button>
              {(regions.data ?? []).map((r) => (
                <div
                  key={r.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                    selectedRegionId === r.id ? 'bg-ink-700 text-white' : 'text-slate-300 hover:bg-ink-700/50'
                  }`}
                >
                  <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setSelectedRegionId(r.id)}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </button>
                  <button
                    onClick={() => engineRef.current?.flyTo(r.centerX, r.centerZ)}
                    className="hidden text-slate-500 hover:text-sky-400 group-hover:block"
                    title="Fly to region"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteRegion(r)}
                    className="hidden text-slate-500 hover:text-rose-400 group-hover:block"
                    title="Delete region"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-ink-600 bg-ink-800/50">
            <div className="border-b border-ink-700 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-white">Photo inventory</h2>
              <p className="text-[11px] text-slate-500">Click to select, then place in the world</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {(photos.data?.length ?? 0) === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-slate-500">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(photos.data ?? []).map((p) => {
                    const count = placedCount.get(p.id) ?? 0
                    const active = selectedPhotoId === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPhotoId(active ? null : p.id)}
                        className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                          active ? 'border-grass-400 shadow-glow' : 'border-transparent hover:border-ink-500'
                        }`}
                        title={p.fileName}
                      >
                        <img src={vaultUrl(p.vaultRelPath)} alt={p.fileName} className="h-full w-full object-cover" />
                        {count > 0 && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 text-[10px] text-white">
                            ×{count}
                          </span>
                        )}
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            deletePhoto(p)
                          }}
                          className="absolute right-1 top-1 hidden rounded bg-black/70 p-1 text-rose-300 group-hover:block"
                        >
                          <Trash2 className="h-3 w-3" />
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-ink-700 px-4 py-2.5 text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <Info className="h-3 w-3" /> {blocks.data?.length ?? 0} blocks placed
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New region modal */}
      <Modal
        open={regionModalOpen}
        onClose={() => setRegionModalOpen(false)}
        title="New region"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegionModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Plus} onClick={createRegion}>
              Create region
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            A region is a themed zone in your world — like a “Family temple” or an “Adventures cave”. It appears as a
            coloured patch where you last hovered (or near the centre).
          </p>
          <Field label="Name">
            <Input value={regionName} onChange={(e) => setRegionName(e.target.value)} placeholder="e.g. Summer 2026" autoFocus />
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {REGION_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setRegionColor(c)}
                  className={`h-8 w-8 rounded-lg border-2 transition ${regionColor === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      {/* Block viewer */}
      <Modal open={!!viewer} onClose={() => setViewer(null)} title={viewer?.photo?.fileName ?? 'Photo'} wide>
        {viewer && (
          <div className="space-y-4">
            {viewer.photo ? (
              <img
                src={vaultUrl(viewer.photo.vaultRelPath)}
                alt={viewer.photo.fileName}
                className="max-h-[55vh] w-full rounded-xl object-contain"
              />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-ink-600 py-12 text-slate-500">
                <X className="mr-2 h-5 w-5" /> The source photo was deleted.
              </div>
            )}
            {viewer.photo && <CaptionEditor photo={viewer.photo} onSaved={() => photos.reload()} />}
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Position: ({viewer.block.x}, {viewer.block.y}, {viewer.block.z})
                {viewer.block.regionLabel && regionMap.get(viewer.block.regionLabel)
                  ? ` · ${regionMap.get(viewer.block.regionLabel)!.name}`
                  : ''}
              </span>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={async () => {
                  await api.removePhotoBlock(viewer.block.id)
                  setViewer(null)
                  blocks.reload()
                }}
              >
                Remove from world
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function CaptionEditor({ photo, onSaved }: { photo: Photo; onSaved: () => void }) {
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => setCaption(photo.caption ?? ''), [photo.id, photo.caption])
  async function save() {
    setSaving(true)
    try {
      await api.updatePhoto(photo.id, { caption })
      onSaved()
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Field label="Caption">
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="A memory worth keeping..." />
        </Field>
      </div>
      <Button variant="subtle" onClick={save} loading={saving}>
        Save
      </Button>
    </div>
  )
}
