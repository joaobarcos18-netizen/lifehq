import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Boxes,
  CornerDownLeft,
  Dumbbell,
  FolderTree,
  LayoutDashboard,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trophy,
  UploadCloud,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import type { AchievementType, GoalCategory } from '@shared/types'

type FormKind = 'expense' | 'goal' | 'achievement' | 'journal'

interface Cmd {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  group: 'Capture' | 'Go to'
  run: () => void | Promise<void>
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const [activeForm, setActiveForm] = useState<FormKind | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSel(0)
    setActiveForm(null)
  }, [])

  // global hotkey + event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open, activeForm])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const commands = useMemo<Cmd[]>(
    () => [
      { id: 'cap-journal', label: 'New journal note', hint: 'Capture a quick thought', icon: BookOpen, group: 'Capture', run: () => setActiveForm('journal') },
      { id: 'cap-expense', label: 'Add expense', hint: 'Log spending or income', icon: Wallet, group: 'Capture', run: () => setActiveForm('expense') },
      { id: 'cap-goal', label: 'Add goal', hint: 'Start tracking something', icon: Dumbbell, group: 'Capture', run: () => setActiveForm('goal') },
      { id: 'cap-ach', label: 'Add achievement', hint: 'Log a win', icon: Trophy, group: 'Capture', run: () => setActiveForm('achievement') },
      { id: 'cap-files', label: 'Import files', hint: 'Sort files into the vault', icon: UploadCloud, group: 'Capture', run: async () => { close(); await api.importFilesDialog(); navigate('/sorter') } },
      { id: 'go-dash', label: 'Dashboard', icon: LayoutDashboard, group: 'Go to', run: () => { close(); navigate('/') } },
      { id: 'go-sorter', label: 'File Sorter', icon: FolderTree, group: 'Go to', run: () => { close(); navigate('/sorter') } },
      { id: 'go-ach', label: 'Achievements', icon: Trophy, group: 'Go to', run: () => { close(); navigate('/achievements') } },
      { id: 'go-goals', label: 'Goals & Fitness', icon: Dumbbell, group: 'Go to', run: () => { close(); navigate('/goals') } },
      { id: 'go-exp', label: 'Expenses', icon: Wallet, group: 'Go to', run: () => { close(); navigate('/expenses') } },
      { id: 'go-journal', label: 'Journal', icon: BookOpen, group: 'Go to', run: () => { close(); navigate('/journal') } },
      { id: 'go-world', label: 'Photo World', icon: Boxes, group: 'Go to', run: () => { close(); navigate('/world') } },
      { id: 'go-settings', label: 'Settings', icon: SettingsIcon, group: 'Go to', run: () => { close(); navigate('/settings') } }
    ],
    [close, navigate]
  )

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => setSel(0), [query])

  if (!open) return null

  function onListKey(e: React.KeyboardEvent) {
    if (activeForm) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(filtered.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[sel]?.run()
    } else if (e.key === 'Escape') {
      close()
    }
  }

  let lastGroup = ''

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-6 pt-[12vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={close} />
      <div className="relative z-10 w-full max-w-xl animate-drop-in overflow-hidden rounded-2xl border border-ink-600 bg-ink-800 shadow-panel">
        {activeForm ? (
          <QuickForm
            kind={activeForm}
            onBack={() => setActiveForm(null)}
            onDone={(msg, path) => {
              close()
              flash(msg)
              if (path) navigate(path)
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-ink-700 px-4">
              <Search className="h-5 w-5 text-slate-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKey}
                placeholder="Type a command or search…  (Ctrl+K)"
                className="w-full bg-transparent py-4 text-base text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-500">No matches.</div>}
              {filtered.map((c, i) => {
                const showGroup = c.group !== lastGroup
                lastGroup = c.group
                return (
                  <div key={c.id}>
                    {showGroup && (
                      <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.group}</div>
                    )}
                    <button
                      onMouseEnter={() => setSel(i)}
                      onClick={() => c.run()}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                        i === sel ? 'bg-ink-700 text-white' : 'text-slate-300 hover:bg-ink-700/50'
                      }`}
                    >
                      <c.icon className="h-4.5 w-4.5 shrink-0 text-grass-400" />
                      <span className="flex-1 text-sm">{c.label}</span>
                      {c.hint && <span className="hidden text-xs text-slate-500 sm:block">{c.hint}</span>}
                      {i === sel && <CornerDownLeft className="h-3.5 w-3.5 text-slate-500" />}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-3 border-t border-ink-700 px-4 py-2 text-[11px] text-slate-500">
              <span>↑↓ navigate</span>
              <span>⏎ select</span>
              <span>esc close</span>
            </div>
          </>
        )}
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[130] -translate-x-1/2 animate-drop-in rounded-xl border border-grass-500/40 bg-ink-800 px-5 py-3 text-sm text-slate-100 shadow-panel">
          {toast}
        </div>
      )}
    </div>
  )
}

const GOAL_CATS: GoalCategory[] = ['fitness', 'health', 'career', 'learning', 'finance', 'personal']
const ACH_TYPES: AchievementType[] = ['academic', 'professional', 'training', 'certification', 'award', 'project', 'other']

function QuickForm({
  kind,
  onBack,
  onDone
}: {
  kind: FormKind
  onBack: () => void
  onDone: (msg: string, path?: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [a, setA] = useState('') // primary text (description/title/body)
  const [b, setB] = useState('') // secondary (amount)
  const [c, setC] = useState(kind === 'goal' ? 'personal' : kind === 'achievement' ? 'professional' : 'Expense')

  const titles: Record<FormKind, string> = {
    expense: 'Add expense',
    goal: 'Add goal',
    achievement: 'Add achievement',
    journal: 'New journal note'
  }

  async function submit() {
    if (!a.trim()) return
    setSaving(true)
    try {
      if (kind === 'expense') {
        const val = Number(b)
        if (!b.trim() || Number.isNaN(val) || val <= 0) {
          setSaving(false)
          return
        }
        await api.saveExpense({ description: a.trim(), amount: c === 'Income' ? Math.abs(val) : -Math.abs(val), date: todayISO() })
        onDone('Expense added', '/expenses')
      } else if (kind === 'goal') {
        await api.saveGoal({ title: a.trim(), category: c as GoalCategory })
        onDone('Goal created', '/goals')
      } else if (kind === 'achievement') {
        await api.saveAchievement({ title: a.trim(), type: c as AchievementType, date: todayISO() })
        onDone('Achievement logged', '/achievements')
      } else {
        await api.saveJournal({ body: a.trim() })
        onDone('Journal entry saved', '/journal')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} className="rounded-md p-1 text-slate-400 hover:bg-ink-700 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold text-white">{titles[kind]}</h3>
      </div>

      <div className="space-y-3" onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}>
        {kind === 'journal' ? (
          <Field label="Note">
            <Textarea autoFocus value={a} onChange={(e) => setA(e.target.value)} rows={4} placeholder="What's on your mind?" />
          </Field>
        ) : (
          <Field label={kind === 'expense' ? 'Description' : 'Title'}>
            <Input autoFocus value={a} onChange={(e) => setA(e.target.value)} placeholder={kind === 'expense' ? 'e.g. Lunch at café' : 'e.g. Run a 10k'} />
          </Field>
        )}

        {kind === 'expense' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <Input type="number" min="0" step="0.01" value={b} onChange={(e) => setB(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Type">
              <Select value={c} onChange={(e) => setC(e.target.value)}>
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
              </Select>
            </Field>
          </div>
        )}
        {kind === 'goal' && (
          <Field label="Category">
            <Select value={c} onChange={(e) => setC(e.target.value)}>
              {GOAL_CATS.map((g) => (
                <option key={g} value={g}>
                  {g[0].toUpperCase() + g.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {kind === 'achievement' && (
          <Field label="Type">
            <Select value={c} onChange={(e) => setC(e.target.value)}>
              {ACH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button variant="primary" icon={Plus} onClick={submit} loading={saving}>
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
