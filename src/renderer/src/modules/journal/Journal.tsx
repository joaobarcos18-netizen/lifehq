import { useMemo, useState } from 'react'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/ipc'
import { useAsync } from '@/lib/useAsync'
import { Button, EmptyState, Field, IconButton, Input, PageHeader, Spinner, Textarea } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { formatDate } from '@/lib/format'
import type { JournalEntry, Mood } from '@shared/types'

const MOODS: { id: Mood; label: string; emoji: string; color: string }[] = [
  { id: 'great', label: 'Great', emoji: '😄', color: '#34d399' },
  { id: 'good', label: 'Good', emoji: '🙂', color: '#7cc576' },
  { id: 'ok', label: 'Okay', emoji: '😐', color: '#fbbf24' },
  { id: 'low', label: 'Low', emoji: '😔', color: '#fb923c' },
  { id: 'bad', label: 'Rough', emoji: '😣', color: '#f87171' }
]
const moodOf = (m?: Mood) => MOODS.find((x) => x.id === m)

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

interface Form {
  id?: string
  date: string
  title: string
  body: string
  mood?: Mood
  tags: string
}
const emptyForm = (): Form => ({ date: todayISO(), title: '', body: '', mood: 'good', tags: '' })

export default function Journal() {
  const entries = useAsync<JournalEntry[]>(() => api.listJournal(), [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, JournalEntry[]>()
    for (const e of entries.data ?? []) {
      const key = (e.date || '').slice(0, 7) || 'Undated'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return [...map.entries()]
  }, [entries.data])

  function openNew() {
    setForm(emptyForm())
    setErr(null)
    setOpen(true)
  }
  function openEdit(e: JournalEntry) {
    setForm({
      id: e.id,
      date: e.date?.slice(0, 10) || todayISO(),
      title: e.title ?? '',
      body: e.body,
      mood: e.mood,
      tags: (e.tags ?? []).join(', ')
    })
    setErr(null)
    setOpen(true)
  }

  async function saveEntry() {
    if (!form.body.trim()) {
      setErr('Write something first.')
      return
    }
    setSaving(true)
    try {
      await api.saveJournal({
        ...(form.id ? { id: form.id } : {}),
        date: form.date,
        title: form.title.trim() || undefined,
        body: form.body.trim(),
        mood: form.mood,
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean)
      })
      setOpen(false)
      entries.reload()
    } finally {
      setSaving(false)
    }
  }

  async function remove(e: JournalEntry) {
    if (!window.confirm('Delete this entry?')) return
    await api.deleteJournal(e.id)
    entries.reload()
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Journal"
        subtitle="A line a day — capture how things are going."
        icon={BookOpen}
        actions={
          <Button variant="primary" icon={Plus} onClick={openNew}>
            New entry
          </Button>
        }
      />

      {entries.loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (entries.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Your journal is empty"
          description="Jot down a thought, a win, or how today felt. Tip: press Ctrl+K anywhere for a quick note."
          action={
            <Button variant="primary" icon={Plus} onClick={openNew}>
              Write your first entry
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([month, items]) => (
            <section key={month}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  {month === 'Undated' ? 'Undated' : new Date(month + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="h-px flex-1 bg-ink-700" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((e) => {
                  const m = moodOf(e.mood)
                  return (
                    <div key={e.id} className="panel panel-hover group relative overflow-hidden p-4">
                      {m && (
                        <div
                          className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full opacity-20 blur-2xl"
                          style={{ backgroundColor: m.color }}
                        />
                      )}
                      <div className="relative flex items-start gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                          style={{ backgroundColor: `${m?.color ?? '#64748b'}22` }}
                        >
                          {m?.emoji ?? '📝'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">{formatDate(e.date)}</span>
                            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                              <IconButton icon={Pencil} onClick={() => openEdit(e)} />
                              <IconButton icon={Trash2} className="hover:text-rose-400" onClick={() => remove(e)} />
                            </div>
                          </div>
                          {e.title && <div className="mt-0.5 font-semibold text-slate-100">{e.title}</div>}
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{e.body}</p>
                          {e.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {e.tags.map((t, i) => (
                                <span key={`${t}-${i}`} className="rounded-md border border-ink-700 bg-ink-800 px-2 py-0.5 text-xs text-slate-400">
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title={form.id ? 'Edit entry' : 'New journal entry'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEntry} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</div>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Mood">
              <div className="flex gap-1.5 pt-1">
                {MOODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setForm({ ...form, mood: m.id })}
                    title={m.label}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition ${
                      form.mood === m.id ? 'ring-2' : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: `${m.color}22`, boxShadow: form.mood === m.id ? `0 0 0 2px ${m.color}` : undefined }}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Title" hint="Optional">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="A headline for the day" />
          </Field>
          <Field label="Entry">
            <Textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              autoFocus
              placeholder="What happened, how you felt, what you're grateful for..."
            />
          </Field>
          <Field label="Tags" hint="Comma-separated">
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="work, family, health" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
