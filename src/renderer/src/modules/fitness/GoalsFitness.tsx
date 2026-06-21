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
  PageHeader,
  ProgressBar
} from '@/components/ui'
import { Modal } from '@/components/Modal'
import { formatDate } from '@/lib/format'
import type { Goal, GoalCategory, GoalStatus, Milestone, FitnessLog } from '@shared/types'
import {
  Dumbbell,
  Plus,
  Trash2,
  Pencil,
  Target,
  HeartPulse,
  Briefcase,
  GraduationCap,
  Wallet,
  Sparkles,
  Activity,
  CheckCircle2,
  Circle,
  Flag,
  X,
  CalendarDays,
  TrendingUp
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'

type Tab = 'goals' | 'fitness'

const CATEGORY_META: Record<GoalCategory, { label: string; color: string; icon: typeof Target }> = {
  fitness: { label: 'Fitness', color: '#22c55e', icon: Dumbbell },
  health: { label: 'Health', color: '#f43f5e', icon: HeartPulse },
  career: { label: 'Career', color: '#38bdf8', icon: Briefcase },
  learning: { label: 'Learning', color: '#a855f7', icon: GraduationCap },
  finance: { label: 'Finance', color: '#f59e0b', icon: Wallet },
  personal: { label: 'Personal', color: '#fb923c', icon: Sparkles }
}

const CATEGORY_ORDER: GoalCategory[] = [
  'fitness',
  'health',
  'career',
  'learning',
  'finance',
  'personal'
]

const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: '#22c55e' },
  done: { label: 'Done', color: '#38bdf8' },
  paused: { label: 'Paused', color: '#f59e0b' },
  archived: { label: 'Archived', color: '#64748b' }
}

const STATUS_ORDER: GoalStatus[] = ['active', 'done', 'paused', 'archived']

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

// ---------------------------------------------------------------------------
// Goal form modal
// ---------------------------------------------------------------------------

interface GoalFormState {
  title: string
  category: GoalCategory
  description: string
  unit: string
  currentValue: string
  targetValue: string
  status: GoalStatus
  dueDate: string
  milestones: Milestone[]
}

function emptyGoalForm(): GoalFormState {
  return {
    title: '',
    category: 'fitness',
    description: '',
    unit: '',
    currentValue: '0',
    targetValue: '',
    status: 'active',
    dueDate: '',
    milestones: []
  }
}

function goalToForm(goal: Goal): GoalFormState {
  return {
    title: goal.title,
    category: goal.category,
    description: goal.description ?? '',
    unit: goal.unit ?? '',
    currentValue: String(goal.currentValue ?? 0),
    targetValue: goal.targetValue != null ? String(goal.targetValue) : '',
    status: goal.status,
    dueDate: goal.dueDate ?? '',
    milestones: goal.milestones?.map((m) => ({ ...m })) ?? []
  }
}

function GoalModal({
  open,
  editing,
  onClose,
  onSaved
}: {
  open: boolean
  editing: Goal | null
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<GoalFormState>(emptyGoalForm())
  const [milestoneDraft, setMilestoneDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [initFor, setInitFor] = useState<string | null>(null)

  // Re-seed the form whenever the modal opens for a different target.
  const seedKey = open ? (editing?.id ?? '__new__') : null
  if (seedKey !== initFor) {
    setInitFor(seedKey)
    setForm(editing ? goalToForm(editing) : emptyGoalForm())
    setMilestoneDraft('')
    setError(null)
  }

  function patch<K extends keyof GoalFormState>(key: K, value: GoalFormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addMilestone(): void {
    const title = milestoneDraft.trim()
    if (!title) return
    patch('milestones', [
      ...form.milestones,
      { id: crypto.randomUUID(), title, done: false }
    ])
    setMilestoneDraft('')
  }

  function removeMilestone(id: string): void {
    patch(
      'milestones',
      form.milestones.filter((m) => m.id !== id)
    )
  }

  function updateMilestoneTitle(id: string, title: string): void {
    patch(
      'milestones',
      form.milestones.map((m) => (m.id === id ? { ...m, title } : m))
    )
  }

  async function handleSave(): Promise<void> {
    const title = form.title.trim()
    if (!title) {
      setError('Title is required.')
      return
    }
    const currentValue = Number(form.currentValue)
    if (form.currentValue !== '' && Number.isNaN(currentValue)) {
      setError('Current value must be a number.')
      return
    }
    let targetValue: number | undefined
    if (form.targetValue.trim() !== '') {
      const parsed = Number(form.targetValue)
      if (Number.isNaN(parsed)) {
        setError('Target value must be a number.')
        return
      }
      targetValue = parsed
    }

    setSaving(true)
    setError(null)
    try {
      await api.saveGoal({
        ...(editing ? { id: editing.id } : {}),
        title,
        category: form.category,
        description: form.description.trim() || undefined,
        unit: form.unit.trim() || undefined,
        currentValue: Number.isNaN(currentValue) ? 0 : currentValue,
        targetValue,
        status: form.status,
        dueDate: form.dueDate || undefined,
        milestones: form.milestones.map((m) => ({
          id: m.id,
          title: m.title.trim(),
          done: m.done,
          date: m.date
        }))
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save goal.')
    } finally {
      setSaving(false)
    }
  }

  const catMeta = CATEGORY_META[form.category]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit goal' : 'Add goal'}
      wide
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Target} loading={saving} onClick={handleSave}>
            {editing ? 'Save changes' : 'Create goal'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title">
            <Input
              value={form.title}
              autoFocus
              placeholder="Run a half marathon"
              onChange={(e) => patch('title', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Category">
          <Select
            value={form.category}
            onChange={(e) => patch('category', e.target.value as GoalCategory)}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => patch('status', e.target.value as GoalStatus)}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Description" hint="Optional context for this goal">
            <Textarea
              value={form.description}
              rows={2}
              placeholder="Why does this matter?"
              onChange={(e) => patch('description', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Current value">
          <Input
            type="number"
            value={form.currentValue}
            onChange={(e) => patch('currentValue', e.target.value)}
          />
        </Field>

        <Field label="Target value" hint="Leave blank for a milestone-only goal">
          <Input
            type="number"
            value={form.targetValue}
            placeholder="e.g. 21"
            onChange={(e) => patch('targetValue', e.target.value)}
          />
        </Field>

        <Field label="Unit" hint="e.g. km, kg, books">
          <Input
            value={form.unit}
            placeholder="km"
            onChange={(e) => patch('unit', e.target.value)}
          />
        </Field>

        <Field label="Due date">
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => patch('dueDate', e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset transition-colors"
              style={{
                backgroundColor: `${catMeta.color}1f`,
                color: catMeta.color,
                borderColor: `${catMeta.color}33`
              }}
            >
              <Flag size={14} />
            </span>
            <span className="label !mb-0">Milestones</span>
          </div>
          <div className="space-y-2 rounded-2xl border border-ink-700/70 bg-ink-900/40 p-3">
            {form.milestones.length === 0 && (
              <p className="px-1 py-2 text-sm text-slate-500">
                No milestones yet — break the goal into smaller wins below.
              </p>
            )}
            {form.milestones.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-xl border border-transparent bg-ink-800/50 px-2 py-1.5 transition-colors hover:border-ink-700"
              >
                <Flag
                  size={15}
                  className={m.done ? 'text-grass-400' : 'text-slate-500'}
                />
                <Input
                  value={m.title}
                  className="flex-1"
                  placeholder="Milestone"
                  onChange={(e) => updateMilestoneTitle(m.id, e.target.value)}
                />
                <IconButton
                  icon={X}
                  aria-label="Remove milestone"
                  onClick={() => removeMilestone(m.id)}
                />
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={milestoneDraft}
                className="flex-1"
                placeholder="Add a milestone…"
                onChange={(e) => setMilestoneDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMilestone()
                  }
                }}
              />
              <Button variant="subtle" icon={Plus} onClick={addMilestone}>
                Add
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <X size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Goal card
// ---------------------------------------------------------------------------

function GoalCard({
  goal,
  onEdit,
  onChanged
}: {
  goal: Goal
  onEdit: (g: Goal) => void
  onChanged: () => void
}): JSX.Element {
  const meta = CATEGORY_META[goal.category]
  const status = STATUS_META[goal.status]
  const Icon = meta.icon
  const [progressDraft, setProgressDraft] = useState('1')
  const [busy, setBusy] = useState(false)

  const hasTarget = goal.targetValue != null && goal.targetValue > 0
  const pct = hasTarget ? clampPct((goal.currentValue / (goal.targetValue as number)) * 100) : 0
  const doneMilestones = goal.milestones?.filter((m) => m.done).length ?? 0
  const totalMilestones = goal.milestones?.length ?? 0
  const isComplete = hasTarget && pct >= 100

  async function persist(partial: Partial<Goal>): Promise<void> {
    setBusy(true)
    try {
      await api.saveGoal({
        id: goal.id,
        title: goal.title,
        category: goal.category,
        description: goal.description,
        unit: goal.unit,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        status: goal.status,
        dueDate: goal.dueDate,
        milestones: goal.milestones,
        ...partial
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function toggleMilestone(id: string): Promise<void> {
    const milestones = (goal.milestones ?? []).map((m) =>
      m.id === id
        ? { ...m, done: !m.done, date: !m.done ? todayISO() : undefined }
        : m
    )
    await persist({ milestones })
  }

  async function addProgress(): Promise<void> {
    const delta = Number(progressDraft)
    if (Number.isNaN(delta) || delta === 0) return
    let next = goal.currentValue + delta
    if (hasTarget) next = Math.min(next, goal.targetValue as number)
    if (next < 0) next = 0
    await persist({ currentValue: next })
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(`Delete goal "${goal.title}"? This cannot be undone.`)) return
    setBusy(true)
    try {
      await api.deleteGoal(goal.id)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="panel-hover group relative flex flex-col gap-3 overflow-hidden">
      {/* Accent glow strip tinted by category */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
        style={{ background: meta.color }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105"
            style={{
              backgroundColor: `${meta.color}1f`,
              color: meta.color,
              borderColor: `${meta.color}33`
            }}
          >
            <Icon size={17} />
          </span>
          <Chip color={meta.color}>{meta.label}</Chip>
        </div>
        <div className="flex items-center gap-1 opacity-60 transition-opacity duration-200 group-hover:opacity-100">
          <IconButton icon={Pencil} aria-label="Edit goal" onClick={() => onEdit(goal)} />
          <IconButton
            icon={Trash2}
            aria-label="Delete goal"
            disabled={busy}
            onClick={handleDelete}
          />
        </div>
      </div>

      <div>
        <h3 className="flex items-center gap-1.5 text-base font-bold leading-tight tracking-tight text-slate-100">
          {goal.title}
          {isComplete && <CheckCircle2 size={16} className="shrink-0 text-grass-400" />}
        </h3>
        {goal.description && (
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{goal.description}</p>
        )}
      </div>

      {hasTarget && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium uppercase tracking-wide text-slate-500">Progress</span>
            <span className="font-semibold text-slate-200">
              {goal.currentValue} / {goal.targetValue}
              {goal.unit ? ` ${goal.unit}` : ''}
              <span className="ml-1.5 text-slate-500">· {Math.round(pct)}%</span>
            </span>
          </div>
          <ProgressBar value={pct} color={meta.color} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ring-1 ring-inset"
          style={{
            backgroundColor: `${status.color}1f`,
            color: status.color,
            borderColor: `${status.color}33`
          }}
        >
          <Circle size={8} fill={status.color} stroke="none" />
          {status.label}
        </span>
        {goal.dueDate && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-900/50 px-2.5 py-0.5 text-slate-400">
            <CalendarDays size={13} /> Due {formatDate(goal.dueDate)}
          </span>
        )}
        {totalMilestones > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-900/50 px-2.5 py-0.5 text-slate-400">
            <CheckCircle2 size={13} /> {doneMilestones}/{totalMilestones}
          </span>
        )}
      </div>

      {totalMilestones > 0 && (
        <ul className="space-y-0.5 border-t border-ink-700/70 pt-3">
          {goal.milestones.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggleMilestone(m.id)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm text-slate-300 transition-colors hover:bg-ink-700/60"
              >
                {m.done ? (
                  <CheckCircle2 size={16} className="shrink-0 text-grass-400" />
                ) : (
                  <Circle size={16} className="shrink-0 text-slate-500 transition-colors group-hover:text-slate-400" />
                )}
                <span className={m.done ? 'text-slate-500 line-through' : ''}>{m.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-ink-700/70 pt-3">
        <Input
          type="number"
          value={progressDraft}
          aria-label="Progress amount"
          className="w-20"
          onChange={(e) => setProgressDraft(e.target.value)}
        />
        <Button variant="subtle" icon={Plus} disabled={busy} onClick={addProgress}>
          progress
        </Button>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Goals tab
// ---------------------------------------------------------------------------

function GoalsTab(): JSX.Element {
  const { data, loading, error, reload } = useAsync<Goal[]>(() => api.listGoals(), [])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)

  const goals = data ?? []

  const sorted = useMemo(() => {
    return [...goals].sort((a, b) => {
      const sa = STATUS_ORDER.indexOf(a.status)
      const sb = STATUS_ORDER.indexOf(b.status)
      if (sa !== sb) return sa - sb
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })
  }, [goals])

  const activeCount = useMemo(
    () => goals.filter((g) => g.status === 'active').length,
    [goals]
  )

  function openNew(): void {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(g: Goal): void {
    setEditing(g)
    setModalOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800/70 px-3 py-1 ring-1 ring-inset ring-ink-700">
            <Target size={13} className="text-grass-400" />
            <span className="font-semibold text-slate-200">{goals.length}</span>
            {goals.length === 1 ? 'goal' : 'goals'}
          </span>
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-grass-500/10 px-3 py-1 text-grass-400 ring-1 ring-inset ring-grass-500/20">
              {activeCount} active
            </span>
          )}
        </div>
        <Button variant="primary" icon={Plus} onClick={openNew}>
          Add goal
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <Panel className="border-rose-500/40 bg-rose-500/5 text-sm text-rose-300">
          Failed to load goals: {String(error)}
        </Panel>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Set a goal with a target and milestones to start tracking your progress."
          action={
            <Button variant="primary" icon={Plus} onClick={openNew}>
              Add your first goal
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={openEdit} onChanged={reload} />
          ))}
        </div>
      )}

      <GoalModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fitness log modal
// ---------------------------------------------------------------------------

interface LogFormState {
  date: string
  activity: string
  metricLabel: string
  value: string
  unit: string
  note: string
}

function emptyLogForm(): LogFormState {
  return {
    date: todayISO(),
    activity: '',
    metricLabel: '',
    value: '',
    unit: '',
    note: ''
  }
}

function FitnessLogModal({
  open,
  onClose,
  onSaved
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<LogFormState>(emptyLogForm())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)

  if (open && !wasOpen) {
    setWasOpen(true)
    setForm(emptyLogForm())
    setError(null)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  function patch<K extends keyof LogFormState>(key: K, value: LogFormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(): Promise<void> {
    const activity = form.activity.trim()
    if (!activity) {
      setError('Activity is required.')
      return
    }
    if (form.value.trim() === '') {
      setError('Value is required.')
      return
    }
    const value = Number(form.value)
    if (Number.isNaN(value)) {
      setError('Value must be a number.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await api.saveFitnessLog({
        date: form.date || todayISO(),
        activity,
        metricLabel: form.metricLabel.trim() || 'Value',
        value,
        unit: form.unit.trim() || '',
        note: form.note.trim() || undefined
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add fitness entry"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Activity} loading={saving} onClick={handleSave}>
            Save entry
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input
            type="date"
            value={form.date}
            onChange={(e) => patch('date', e.target.value)}
          />
        </Field>
        <Field label="Activity">
          <Input
            value={form.activity}
            autoFocus
            placeholder="Run, Gym, Swim…"
            onChange={(e) => patch('activity', e.target.value)}
          />
        </Field>
        <Field label="Metric">
          <Input
            value={form.metricLabel}
            placeholder="Distance, Weight, Duration…"
            onChange={(e) => patch('metricLabel', e.target.value)}
          />
        </Field>
        <Field label="Unit">
          <Input
            value={form.unit}
            placeholder="km, kg, min…"
            onChange={(e) => patch('unit', e.target.value)}
          />
        </Field>
        <Field label="Value">
          <Input
            type="number"
            value={form.value}
            placeholder="0"
            onChange={(e) => patch('value', e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Note" hint="Optional">
            <Textarea
              value={form.note}
              rows={2}
              placeholder="How did it feel?"
              onChange={(e) => patch('note', e.target.value)}
            />
          </Field>
        </div>

        {error && (
          <div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <X size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Fitness tab
// ---------------------------------------------------------------------------

function FitnessTab(): JSX.Element {
  const { data, loading, error, reload } = useAsync<FitnessLog[]>(
    () => api.listFitnessLogs(),
    []
  )
  const [modalOpen, setModalOpen] = useState(false)

  const logs = data ?? []

  const sortedDesc = useMemo(
    () => [...logs].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [logs]
  )

  const chartData = useMemo(() => {
    const asc = [...logs].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    return asc.slice(-20).map((l) => ({
      date: formatDate(l.date),
      value: l.value,
      activity: l.activity,
      unit: l.unit
    }))
  }, [logs])

  async function handleDelete(log: FitnessLog): Promise<void> {
    if (!window.confirm(`Delete this ${log.activity} entry?`)) return
    await api.deleteFitnessLog(log.id)
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800/70 px-3 py-1 ring-1 ring-inset ring-ink-700">
            <Activity size={13} className="text-grass-400" />
            <span className="font-semibold text-slate-200">{logs.length}</span>
            {logs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>
          Add entry
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <Panel className="border-rose-500/40 bg-rose-500/5 text-sm text-rose-300">
          Failed to load logs: {String(error)}
        </Panel>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity logged"
          description="Log your workouts to see your progress over time."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>
              Add your first entry
            </Button>
          }
        />
      ) : (
        <>
          <Panel className="relative overflow-hidden">
            <span
              aria-hidden
              className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full bg-grass-500/10 blur-3xl"
            />
            <div className="relative mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-grass-500/15 text-grass-400 ring-1 ring-inset ring-grass-500/25">
                  <TrendingUp size={17} />
                </span>
                <div>
                  <div className="text-sm font-bold tracking-tight text-slate-100">
                    Recent activity
                  </div>
                  <div className="text-xs text-slate-500">Last {chartData.length} entries</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <defs>
                    <linearGradient id="fitnessLineStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset="100%" stopColor="#4ade80" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ stroke: '#22c55e', strokeWidth: 1, strokeDasharray: '4 4' }}
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: 12,
                      color: '#e2e8f0',
                      fontSize: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value: number, _name, item) => {
                      const unit = item?.payload?.unit ? ` ${item.payload.unit}` : ''
                      const activity = item?.payload?.activity ?? 'Value'
                      return [`${value}${unit}`, activity]
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="url(#fitnessLineStroke)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#22c55e', stroke: '#0f172a', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 bg-ink-900/40 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Activity</th>
                  <th className="px-4 py-3 font-semibold">Metric</th>
                  <th className="px-4 py-3 font-semibold text-right">Value</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Note</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedDesc.map((log) => (
                  <tr
                    key={log.id}
                    className="group/row border-b border-ink-800 transition-colors last:border-0 hover:bg-ink-700/40"
                  >
                    <td className="px-4 py-3 font-medium text-slate-200">{log.activity}</td>
                    <td className="px-4 py-3 text-slate-400">{log.metricLabel}</td>
                    <td className="px-4 py-3 text-right font-semibold text-grass-400">
                      {log.value}
                      {log.unit ? ` ${log.unit}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatDate(log.date)}</td>
                    <td className="max-w-[18rem] truncate px-4 py-3 text-slate-500">
                      {log.note ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
                        <IconButton
                          icon={Trash2}
                          aria-label="Delete entry"
                          onClick={() => handleDelete(log)}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      <FitnessLogModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function GoalsFitness(): JSX.Element {
  const [tab, setTab] = useState<Tab>('goals')

  const tabs: { id: Tab; label: string; icon: typeof Target }[] = [
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'fitness', label: 'Fitness Log', icon: Activity }
  ]

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        icon={Dumbbell}
        title="Goals & Fitness"
        subtitle="Track your life goals and log your activity over time."
      />

      <div className="inline-flex gap-1 rounded-xl border border-ink-700 bg-ink-800/70 p-1 shadow-panel">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all duration-200',
                active
                  ? 'bg-gradient-to-br from-grass-400 to-grass-600 text-ink-900 shadow-glow'
                  : 'text-slate-400 hover:bg-ink-700/50 hover:text-slate-100'
              ].join(' ')}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'goals' ? <GoalsTab /> : <FitnessTab />}
    </div>
  )
}
