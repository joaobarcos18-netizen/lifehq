import { useMemo, useState } from 'react'
import { api } from '@/lib/ipc'
import { useAsync } from '@/lib/useAsync'
import {
  Button,
  IconButton,
  Panel,
  Chip,
  Field,
  Input,
  Textarea,
  Select,
  Spinner,
  EmptyState,
  PageHeader
} from '@/components/ui'
import { Modal } from '@/components/Modal'
import { formatDate } from '@/lib/format'
import type { Achievement, AchievementType, SortedFile } from '@shared/types'
import {
  Trophy,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  GraduationCap,
  Briefcase,
  Dumbbell,
  Award,
  Medal,
  FolderGit2,
  Star,
  FileDown,
  Paperclip,
  Upload,
  X,
  CalendarDays,
  Building2,
  Sparkles,
  CheckCircle2,
  type LucideIcon
} from 'lucide-react'

type TypeMeta = { label: string; color: string; icon: LucideIcon }

const TYPE_META: Record<AchievementType, TypeMeta> = {
  academic: { label: 'Academic', color: '#38bdf8', icon: GraduationCap },
  professional: { label: 'Professional', color: '#34d399', icon: Briefcase },
  training: { label: 'Training', color: '#a78bfa', icon: Dumbbell },
  certification: { label: 'Certification', color: '#fbbf24', icon: Award },
  award: { label: 'Award', color: '#fb923c', icon: Medal },
  project: { label: 'Project', color: '#f472b6', icon: FolderGit2 },
  other: { label: 'Other', color: '#94a3b8', icon: Star }
}

const TYPE_ORDER: AchievementType[] = [
  'academic',
  'professional',
  'training',
  'certification',
  'award',
  'project',
  'other'
]

type FormState = {
  id?: string
  title: string
  type: AchievementType
  organization: string
  date: string
  endDate: string
  description: string
  skills: string
  link: string
  attachmentFileId?: string
}

const emptyForm = (): FormState => ({
  title: '',
  type: 'professional',
  organization: '',
  date: '',
  endDate: '',
  description: '',
  skills: '',
  link: ''
})

function toForm(a: Achievement): FormState {
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    organization: a.organization ?? '',
    date: a.date ? a.date.slice(0, 10) : '',
    endDate: a.endDate ? a.endDate.slice(0, 10) : '',
    description: a.description ?? '',
    skills: (a.skills ?? []).join(', '),
    link: a.link ?? '',
    attachmentFileId: a.attachmentFileId
  }
}

function yearOf(dateStr: string): string {
  if (!dateStr) return 'Undated'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) {
    const m = dateStr.match(/^(\d{4})/)
    return m ? m[1] : 'Undated'
  }
  return String(d.getFullYear())
}

export default function Achievements() {
  const { data, loading, error, reload } = useAsync<Achievement[]>(() => api.listAchievements(), [])
  const filesAsync = useAsync<SortedFile[]>(() => api.listFiles(), [])
  const [filter, setFilter] = useState<'all' | AchievementType>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const achievements = data ?? []
  const files = filesAsync.data ?? []
  const fileMap = useMemo(() => {
    const m = new Map<string, SortedFile>()
    files.forEach((f) => m.set(f.id, f))
    return m
  }, [files])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function exportCv() {
    setExporting(true)
    try {
      const { path } = await api.exportCv()
      flash(`CV exported to ${path}`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function attachExistingFile(fileId: string) {
    setForm((f) => ({ ...f, attachmentFileId: fileId || undefined }))
  }

  async function importAndAttach() {
    const res = await api.importFilesDialog()
    if (res.imported.length) {
      const f = res.imported[0]
      filesAsync.reload()
      setForm((prev) => ({ ...prev, attachmentFileId: f.id }))
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: achievements.length }
    for (const t of TYPE_ORDER) c[t] = 0
    for (const a of achievements) c[a.type] = (c[a.type] ?? 0) + 1
    return c
  }, [achievements])

  const filtered = useMemo(() => {
    const list = filter === 'all' ? achievements : achievements.filter((a) => a.type === filter)
    return [...list].sort((a, b) => {
      const ta = new Date(a.date).getTime()
      const tb = new Date(b.date).getTime()
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return tb - ta
    })
  }, [achievements, filter])

  const grouped = useMemo(() => {
    const map = new Map<string, Achievement[]>()
    for (const a of filtered) {
      const y = yearOf(a.date)
      if (!map.has(y)) map.set(y, [])
      map.get(y)!.push(a)
    }
    return Array.from(map.entries())
  }, [filtered])

  function openAdd() {
    setForm(emptyForm())
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(a: Achievement) {
    setForm(toForm(a))
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    if (!form.date) {
      setFormError('Date is required.')
      return
    }
    if (form.endDate && form.endDate < form.date) {
      setFormError('End date cannot be before the start date.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload: Partial<Achievement> & { title: string; type: AchievementType; date: string } = {
        title: form.title.trim(),
        type: form.type,
        date: form.date,
        organization: form.organization.trim() || undefined,
        endDate: form.endDate || undefined,
        description: form.description.trim() || undefined,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        link: form.link.trim() || undefined,
        attachmentFileId: form.attachmentFileId
      }
      if (form.id) payload.id = form.id
      await api.saveAchievement(payload)
      setModalOpen(false)
      await reload()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save achievement.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(a: Achievement) {
    if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return
    await api.deleteAchievement(a.id)
    await reload()
  }

  const topTypes = useMemo(
    () =>
      TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0)
        .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
        .slice(0, 3),
    [counts]
  )

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Achievements"
        subtitle="Your academic & professional journey"
        icon={Trophy}
        actions={
          <>
            <Button variant="outline" icon={FileDown} onClick={exportCv} loading={exporting} disabled={achievements.length === 0}>
              Export CV
            </Button>
            <Button variant="primary" icon={Plus} onClick={openAdd}>
              Add achievement
            </Button>
          </>
        }
      />

      {!loading && !error && achievements.length > 0 && (
        <Panel className="relative overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-ink-800/70 to-ember-500/5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/25 to-ember-500/15 text-amber-300 shadow-glow">
                <Trophy size={26} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-slate-50">
                    {achievements.length}
                  </span>
                  <span className="text-sm font-medium text-slate-400">
                    {achievements.length === 1 ? 'milestone' : 'milestones'} tracked
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <Sparkles size={12} className="text-amber-300" />
                  Across {grouped.length} {grouped.length === 1 ? 'year' : 'years'} of your story
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {topTypes.map((t) => {
                const meta = TYPE_META[t]
                const Icon = meta.icon
                return (
                  <div
                    key={t}
                    className="flex items-center gap-2 rounded-xl border border-ink-700/80 bg-ink-900/40 px-3 py-2 transition duration-150 hover:border-ink-600"
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                    >
                      <Icon size={14} />
                    </span>
                    <div className="leading-tight">
                      <div className="text-sm font-semibold text-slate-100">{counts[t] ?? 0}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        {meta.label}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === 'all'}
          label="All"
          count={counts.all}
          color="#94a3b8"
          onClick={() => setFilter('all')}
        />
        {TYPE_ORDER.map((t) => (
          <FilterChip
            key={t}
            active={filter === t}
            label={TYPE_META[t].label}
            count={counts[t] ?? 0}
            color={TYPE_META[t].color}
            icon={TYPE_META[t].icon}
            onClick={() => setFilter(t)}
          />
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      ) : error ? (
        <Panel className="border border-rose-500/40 bg-rose-500/5">
          <p className="text-sm text-rose-300">Failed to load achievements: {error}</p>
          <div className="mt-3">
            <Button variant="outline" onClick={() => reload()}>
              Retry
            </Button>
          </div>
        </Panel>
      ) : achievements.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No achievements yet"
          description="Start tracking your degrees, certifications, awards, projects and more."
          action={
            <Button variant="primary" icon={Plus} onClick={openAdd}>
              Add achievement
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No matching achievements"
          description={`No ${filter !== 'all' ? TYPE_META[filter].label.toLowerCase() : ''} achievements found. Try a different filter.`}
          action={
            <Button variant="ghost" onClick={() => setFilter('all')}>
              Clear filter
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {grouped.map(([year, items]) => (
            <section key={year} className="animate-fade-in">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="bg-gradient-to-r from-slate-50 to-slate-300 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                  {year}
                </h2>
                <span className="rounded-full border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-ink-700 to-transparent" />
              </div>

              <ol className="relative ml-2 space-y-4 border-l border-ink-700/80 pl-6">
                {items.map((a) => (
                  <TimelineItem
                    key={a.id}
                    achievement={a}
                    attachmentName={a.attachmentFileId ? fileMap.get(a.attachmentFileId)?.originalName : undefined}
                    onEdit={() => openEdit(a)}
                    onDelete={() => handleDelete(a)}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={form.id ? 'Edit achievement' : 'Add achievement'}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" icon={CheckCircle2} onClick={handleSave} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 animate-drop-in">
              <X size={15} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <Field label="Title">
            <Input
              value={form.title}
              autoFocus
              placeholder="e.g. BSc in Computer Science"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AchievementType })}
              >
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Organization" hint="School, company, or issuer">
              <Input
                value={form.organization}
                placeholder="e.g. NOVA IMS"
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>

            <Field label="End date" hint="Leave empty if single date">
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={form.description}
              rows={3}
              placeholder="What did you accomplish?"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <Field label="Skills" hint="Comma-separated, e.g. Python, SQL, Leadership">
            <Input
              value={form.skills}
              placeholder="Python, SQL, Leadership"
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
            />
          </Field>

          <Field label="Link" hint="Optional URL to certificate, repo, etc.">
            <Input
              value={form.link}
              placeholder="https://..."
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
          </Field>

          <Field label="Attached file" hint="Link the actual diploma / certificate from your vault">
            {form.attachmentFileId && fileMap.get(form.attachmentFileId) ? (
              <div className="flex items-center gap-2 rounded-lg border border-grass-500/30 bg-grass-500/5 px-3 py-2 transition duration-150">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-grass-500/15 text-grass-400">
                  <Paperclip size={14} />
                </span>
                <span className="flex-1 truncate text-sm text-slate-200">
                  {fileMap.get(form.attachmentFileId)!.originalName}
                </span>
                <IconButton
                  icon={X}
                  aria-label="Remove attachment"
                  onClick={() => setForm({ ...form, attachmentFileId: undefined })}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Select value="" onChange={(e) => attachExistingFile(e.target.value)} className="flex-1">
                  <option value="">Pick a sorted file…</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.originalName}
                    </option>
                  ))}
                </Select>
                <Button variant="subtle" icon={Upload} onClick={importAndAttach}>
                  Import
                </Button>
              </div>
            )}
          </Field>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-center gap-2.5 animate-drop-in rounded-xl border border-grass-500/40 bg-ink-800/95 px-5 py-3 text-sm text-slate-100 shadow-panel backdrop-blur">
          <CheckCircle2 size={16} className="shrink-0 text-grass-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  label,
  count,
  color,
  icon: Icon,
  onClick
}: {
  active: boolean
  label: string
  count: number
  color: string
  icon?: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition duration-150 ${
        active
          ? 'border-transparent text-ink-900 shadow-glow'
          : 'border-ink-700 bg-ink-800/70 text-slate-300 hover:-translate-y-0.5 hover:border-ink-600 hover:text-slate-100'
      }`}
      style={active ? { backgroundColor: color } : undefined}
    >
      {Icon && <Icon size={14} className={active ? '' : 'transition-colors duration-150'} style={active ? undefined : { color }} />}
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none transition ${
          active ? 'bg-black/20 text-ink-900' : 'bg-ink-700 text-slate-400 group-hover:bg-ink-600'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function TimelineItem({
  achievement: a,
  attachmentName,
  onEdit,
  onDelete
}: {
  achievement: Achievement
  attachmentName?: string
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = TYPE_META[a.type]
  const Icon = meta.icon

  const dateLabel = a.endDate
    ? `${formatDate(a.date)} – ${formatDate(a.endDate)}`
    : formatDate(a.date)

  return (
    <li className="group relative">
      <span
        className="absolute -left-[33px] top-1 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-ink-900 transition duration-200 group-hover:scale-110"
        style={{ backgroundColor: meta.color, boxShadow: `0 0 0 0 ${meta.color}` }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-ink-900/70" />
      </span>
      <Panel className="panel-hover transition duration-200 group-hover:-translate-y-0.5 group-hover:border-ink-600">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition duration-200 group-hover:scale-105"
                style={{
                  backgroundColor: `${meta.color}1f`,
                  borderColor: `${meta.color}33`,
                  color: meta.color
                }}
              >
                <Icon size={17} />
              </span>
              <h3 className="text-base font-bold tracking-tight text-slate-100">{a.title}</h3>
              <Chip color={meta.color}>
                <span className="flex items-center gap-1">
                  <Icon size={12} />
                  {meta.label}
                </span>
              </Chip>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
              {a.organization && (
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                  <Building2 size={13} className="text-slate-500" />
                  {a.organization}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={13} className="text-slate-500" />
                {dateLabel}
              </span>
            </div>

            {a.description && (
              <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{a.description}</p>
            )}

            {a.skills && a.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.skills.map((s, i) => (
                  <span
                    key={`${s}-${i}`}
                    className="rounded-md border border-ink-700 bg-ink-800/70 px-2 py-0.5 text-xs font-medium text-slate-300 transition duration-150 hover:border-ink-600 hover:text-slate-100"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {(a.link || a.attachmentFileId) && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {a.link && (
                  <Button
                    variant="subtle"
                    icon={ExternalLink}
                    onClick={() => window.open(a.link, '_blank', 'noopener,noreferrer')}
                  >
                    Open link
                  </Button>
                )}
                {a.attachmentFileId && (
                  <Button variant="subtle" icon={Paperclip} onClick={() => api.openFile(a.attachmentFileId!)}>
                    {attachmentName ? attachmentName : 'View file'}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 opacity-0 transition duration-200 group-hover:opacity-100">
            <IconButton icon={Pencil} aria-label="Edit achievement" onClick={onEdit} />
            <IconButton icon={Trash2} aria-label="Delete achievement" onClick={onDelete} />
          </div>
        </div>
      </Panel>
    </li>
  )
}
