import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  FolderTree,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { useAsync } from '@/lib/useAsync'
import { Button, Chip, EmptyState, Field, IconButton, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { Modal as ModalCmp } from '@/components/Modal'
import { categoryIcon } from '@/lib/icons'
import { formatBytes, relativeTime } from '@/lib/format'
import type { FileCategory, SortedFile } from '@shared/types'

export default function Sorter() {
  const files = useAsync(() => api.listFiles(), [])
  const categories = useAsync(() => api.listFileCategories(), [])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const catMap = useMemo(() => {
    const m = new Map<string, FileCategory>()
    ;(categories.data ?? []).forEach((c) => m.set(c.id, c))
    return m
  }, [categories.data])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    ;(files.data ?? []).forEach((f) => m.set(f.categoryId, (m.get(f.categoryId) ?? 0) + 1))
    return m
  }, [files.data])

  const visible = useMemo(() => {
    let list = files.data ?? []
    if (selectedCat) list = list.filter((f) => f.categoryId === selectedCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((f) => f.originalName.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q)))
    }
    return list
  }, [files.data, selectedCat, search])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  async function importPaths(paths: string[]) {
    if (!paths.length) return
    setBusy(true)
    try {
      const res = await api.importFilePaths(paths)
      files.reload()
      const ok = res.imported.length
      const fail = res.failed.length
      flash(`Sorted ${ok} file${ok === 1 ? '' : 's'}${fail ? ` · ${fail} skipped` : ''}.`)
    } finally {
      setBusy(false)
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => !!p)
    await importPaths(paths)
  }

  async function browse() {
    setBusy(true)
    try {
      const res = await api.importFilesDialog()
      files.reload()
      if (res.imported.length) flash(`Sorted ${res.imported.length} file(s).`)
    } finally {
      setBusy(false)
    }
  }

  async function changeCategory(f: SortedFile, categoryId: string) {
    await api.updateFile(f.id, { categoryId })
    files.reload()
  }

  async function reclassify(f: SortedFile) {
    await api.reclassifyFile(f.id)
    files.reload()
    flash('Re-sorted.')
  }

  async function remove(f: SortedFile) {
    if (!window.confirm(`Remove "${f.originalName}" from the vault? The stored copy will be deleted.`)) return
    await api.deleteFile(f.id)
    files.reload()
  }

  const totalFiles = files.data?.length ?? 0

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="File Sorter"
        subtitle="Drop anything in the hopper — it lands in the right chest automatically."
        icon={FolderTree}
        actions={
          <>
            <Button icon={Settings2} variant="ghost" onClick={() => setManageOpen(true)}>
              Categories
            </Button>
            <Button icon={Plus} variant="primary" onClick={browse} loading={busy}>
              Add files
            </Button>
          </>
        }
      />

      {/* Drop hopper */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200 ${
          dragging
            ? 'border-grass-400 bg-grass-500/10 shadow-glow scale-[1.01]'
            : 'border-ink-600 bg-gradient-to-b from-ink-800/60 to-ink-900/40 hover:border-grass-500/50 hover:from-ink-800/80'
        }`}
      >
        <div
          className={`pointer-events-none absolute inset-0 bg-grass-500/5 opacity-0 transition-opacity duration-300 ${
            dragging ? 'opacity-100' : 'group-hover:opacity-100'
          }`}
        />
        <div
          className={`relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-grass-500/20 to-grass-600/10 text-grass-400 ring-1 ring-grass-500/20 transition-all duration-200 ${
            dragging ? 'animate-drop-in scale-110 ring-grass-400/40' : 'group-hover:scale-105'
          }`}
        >
          <UploadCloud className="h-8 w-8" />
        </div>
        <div className="relative text-lg font-bold tracking-tight text-white">
          {dragging ? 'Release to sort' : 'Drop files here'}
        </div>
        <p className="relative mt-1.5 max-w-md text-sm leading-relaxed text-slate-400">
          The sorter reads each file&apos;s type and name and drops it into the matching chest. You can re-sort or move
          anything afterwards.
        </p>
      </div>

      {/* Chests */}
      {categories.loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <ChestCard
            active={selectedCat === null}
            name="All"
            color="#94a3b8"
            count={totalFiles}
            onClick={() => setSelectedCat(null)}
            iconName="Box"
          />
          {(categories.data ?? [])
            .slice()
            .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
            .map((c) => (
              <ChestCard
                key={c.id}
                active={selectedCat === c.id}
                name={c.name}
                color={c.color}
                count={counts.get(c.id) ?? 0}
                iconName={c.icon}
                onClick={() => setSelectedCat(selectedCat === c.id ? null : c.id)}
              />
            ))}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="group relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-grass-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files and tags..."
            className="pl-9"
          />
        </div>
        <span className="chip shrink-0 text-slate-400">
          {visible.length} file{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* File list */}
      {files.loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title={selectedCat || search ? 'Nothing here yet' : 'Your vault is empty'}
          description="Drop files into the hopper above or use “Add files” to start sorting."
          action={
            <Button icon={Plus} variant="primary" onClick={browse} loading={busy}>
              Add files
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((f) => {
            const cat = catMap.get(f.categoryId)
            const Icon = categoryIcon(cat?.icon)
            const color = cat?.color ?? '#64748b'
            return (
              <div
                key={f.id}
                className="panel panel-hover group flex items-center gap-3 px-4 py-3 transition-all duration-150"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-150 group-hover:scale-105"
                  style={{
                    backgroundColor: `${color}1f`,
                    color,
                    boxShadow: `inset 0 0 0 1px ${color}26`
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-100" title={f.originalName}>
                      {f.originalName}
                    </span>
                    {f.method === 'ai' && (
                      <span
                        title="Sorted by AI"
                        className="inline-flex items-center gap-1 rounded-full bg-grass-500/10 px-1.5 py-0.5 text-[10px] font-medium text-grass-400 ring-1 ring-grass-500/20"
                      >
                        <Sparkles className="h-3 w-3" />
                        AI
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium uppercase tracking-wide text-slate-400">{f.ext || 'file'}</span>
                    <span className="text-slate-600">·</span>
                    <span>{formatBytes(f.size)}</span>
                    <span className="text-slate-600">·</span>
                    <span>{relativeTime(f.importedAt)}</span>
                    {f.reason && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="truncate italic text-slate-500" title={f.reason}>
                          {f.reason}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <Chip color={cat?.color}>{cat?.name ?? 'Unknown'}</Chip>

                <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <Select
                    value={f.categoryId}
                    onChange={(e) => changeCategory(f, e.target.value)}
                    className="!w-32 !py-1 text-xs"
                    title="Move to category"
                  >
                    {(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <IconButton icon={ExternalLink} title="Open file" onClick={() => api.openFile(f.id)} />
                  <IconButton icon={FolderOpen} title="Show in folder" onClick={() => api.revealFile(f.id)} />
                  <IconButton icon={RefreshCw} title="Re-sort" onClick={() => reclassify(f)} />
                  <IconButton icon={Trash2} title="Delete" className="hover:text-rose-400" onClick={() => remove(f)} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border border-grass-500/40 bg-ink-800/95 px-5 py-3 text-sm font-medium text-slate-100 shadow-glow backdrop-blur animate-drop-in">
          <CheckCircle2 className="h-4 w-4 text-grass-400" />
          {toast}
        </div>
      )}

      <ManageCategories
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        categories={categories.data ?? []}
        onChanged={() => {
          categories.reload()
          files.reload()
        }}
      />
    </div>
  )
}

function ChestCard({
  name,
  color,
  count,
  active,
  onClick,
  iconName
}: {
  name: string
  color: string
  count: number
  active: boolean
  onClick: () => void
  iconName: string
}) {
  const Icon = categoryIcon(iconName)
  return (
    <button
      onClick={onClick}
      className={`panel group relative flex flex-col items-center gap-2.5 overflow-hidden px-2 py-4 transition-all duration-200 ${
        active
          ? 'border-grass-500/60 bg-ink-700 shadow-glow -translate-y-0.5'
          : 'panel-hover hover:-translate-y-0.5'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-60 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `radial-gradient(circle at 50% 0%, ${color}26, transparent 70%)` }}
      />
      <div
        className="relative flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-110"
        style={{ backgroundColor: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}2e` }}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="relative text-center">
        <div className="truncate text-xs font-semibold text-slate-200" style={{ maxWidth: 80 }}>
          {name}
        </div>
        <div className="text-[11px] font-medium tabular-nums text-slate-500">{count}</div>
      </div>
    </button>
  )
}

function ManageCategories({
  open,
  onClose,
  categories,
  onChanged
}: {
  open: boolean
  onClose: () => void
  categories: FileCategory[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [extensions, setExtensions] = useState('')
  const [color, setColor] = useState('#7cc576')
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.saveFileCategory({
        name: name.trim(),
        color,
        icon: 'Box',
        keywords: keywords.split(',').map((s) => s.trim()).filter(Boolean),
        extensions: extensions.split(',').map((s) => s.trim().replace('.', '').toLowerCase()).filter(Boolean)
      })
      setName('')
      setKeywords('')
      setExtensions('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function removeCat(c: FileCategory) {
    if (c.builtin) return
    if (!window.confirm(`Delete category "${c.name}"? Its files move to "Other".`)) return
    await api.deleteFileCategory(c.id)
    onChanged()
  }

  return (
    <ModalCmp open={open} onClose={onClose} title="Manage chests" wide>
      <div className="space-y-6">
        <div className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800/80 to-ink-900/60 p-5 shadow-panel">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-tight text-slate-100">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-grass-500/15 text-grass-400 ring-1 ring-grass-500/20">
              <Plus className="h-3.5 w-3.5" />
            </span>
            New category
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Travel" />
            </Field>
            <Field label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-ink-600 bg-ink-900 transition hover:border-ink-500"
                />
                <div
                  className="flex h-10 flex-1 items-center justify-center rounded-lg text-xs font-medium ring-1"
                  style={{ backgroundColor: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}33` }}
                >
                  {color.toUpperCase()}
                </div>
              </div>
            </Field>
            <Field label="Keywords (comma separated)">
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="flight, hotel, trip" />
            </Field>
            <Field label="Extensions (comma separated)">
              <Input value={extensions} onChange={(e) => setExtensions(e.target.value)} placeholder="gpx, kml" />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" icon={Plus} onClick={add} loading={saving}>
              Add category
            </Button>
          </div>
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-tight text-slate-100">
            <Tag className="h-4 w-4 text-slate-400" />
            Existing
            <span className="chip ml-1 text-slate-400">{categories.length}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon)
              return (
                <div
                  key={c.id}
                  className="group flex items-center gap-2.5 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5 transition-all duration-150 hover:border-ink-600 hover:bg-ink-800"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1"
                    style={{ backgroundColor: `${c.color}1f`, color: c.color, boxShadow: `inset 0 0 0 1px ${c.color}2e` }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate text-sm font-medium text-slate-200">{c.name}</span>
                  {c.builtin && (
                    <span className="ml-auto rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      built-in
                    </span>
                  )}
                  {!c.builtin && (
                    <IconButton
                      icon={Trash2}
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-400"
                      onClick={() => removeCat(c)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </ModalCmp>
  )
}
