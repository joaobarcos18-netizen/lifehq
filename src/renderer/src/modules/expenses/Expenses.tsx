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
import { formatCurrency, formatDate, formatMonth, currentMonth } from '@/lib/format'
import { categoryIcon } from '@/lib/icons'
import {
  Wallet,
  Plus,
  Upload,
  Trash2,
  Receipt,
  Sparkles,
  TrendingDown,
  PieChart as PieChartIcon,
  FileText,
  Tags,
  Repeat,
  X,
  CalendarDays,
  Layers,
  ArrowUpRight,
  BarChart3,
  AlertTriangle,
  CircleDollarSign
} from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'
import type {
  Expense,
  ExpenseCategory,
  ExpenseSummary,
  ExpenseImportPreviewRow,
  RecurringItem
} from '@shared/types'

const AUTO_ID = '__auto__'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function lastTwelveMonths(): string[] {
  const months: string[] = []
  const base = currentMonth() // 'YYYY-MM'
  const [y, m] = base.split('-').map(Number)
  let year = y
  let month = m
  for (let i = 0; i < 12; i++) {
    const mm = String(month).padStart(2, '0')
    months.push(`${year}-${mm}`)
    month -= 1
    if (month === 0) {
      month = 12
      year -= 1
    }
  }
  return months
}

function methodBadge(method: 'rule' | 'ai' | 'manual', confidence?: number) {
  if (method === 'ai') {
    const pct = confidence != null ? Math.round(confidence * 100) : null
    return (
      <span className="chip inline-flex items-center gap-1 bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <Sparkles size={12} />
        AI{pct != null ? ` ${pct}%` : ''}
      </span>
    )
  }
  if (method === 'rule') {
    return (
      <span className="chip inline-flex items-center gap-1 bg-grass-500/10 text-grass-400 border border-grass-500/20">
        Rule
      </span>
    )
  }
  return (
    <span className="chip inline-flex items-center gap-1 bg-ink-700 text-slate-300 border border-ink-600">
      Manual
    </span>
  )
}

export default function Expenses() {
  const monthOptions = useMemo(() => lastTwelveMonths(), [])
  const [month, setMonth] = useState<string>(() => currentMonth())

  const categoriesAsync = useAsync<ExpenseCategory[]>(() => api.listExpenseCategories(), [])
  const summaryAsync = useAsync<ExpenseSummary>(() => api.expenseSummary(month), [month])
  const yearSummaryAsync = useAsync<ExpenseSummary>(() => api.expenseSummary(), [])
  const expensesAsync = useAsync<Expense[]>(() => api.listExpenses({ month }), [month])
  const recurringAsync = useAsync<RecurringItem[]>(() => api.detectRecurring(), [])
  const [manageOpen, setManageOpen] = useState(false)

  const categories = categoriesAsync.data ?? []
  const summary = summaryAsync.data
  const yearSummary = yearSummaryAsync.data
  const expenses = expensesAsync.data ?? []

  const catMap = useMemo(() => {
    const m = new Map<string, ExpenseCategory>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  const reloadAll = () => {
    summaryAsync.reload()
    yearSummaryAsync.reload()
    expensesAsync.reload()
    recurringAsync.reload()
  }

  // ---- Modal state ----
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ExpenseImportPreviewRow[]>([])
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)

  // ---- Add form state ----
  const [fDate, setFDate] = useState(todayISO())
  const [fDesc, setFDesc] = useState('')
  const [fAmount, setFAmount] = useState('')
  const [fType, setFType] = useState<'Expense' | 'Income'>('Expense')
  const [fCategory, setFCategory] = useState<string>(AUTO_ID)
  const [fNote, setFNote] = useState('')
  const [fError, setFError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const resetAddForm = () => {
    setFDate(todayISO())
    setFDesc('')
    setFAmount('')
    setFType('Expense')
    setFCategory(AUTO_ID)
    setFNote('')
    setFError(null)
  }

  const openAdd = () => {
    resetAddForm()
    setAddOpen(true)
  }

  const handleSaveAdd = async () => {
    setFError(null)
    if (!fDesc.trim()) {
      setFError('Description is required.')
      return
    }
    const val = Number(fAmount)
    if (!fAmount.trim() || Number.isNaN(val) || val <= 0) {
      setFError('Enter a positive amount.')
      return
    }
    const amount = fType === 'Expense' ? -Math.abs(val) : Math.abs(val)
    setSaving(true)
    try {
      await api.saveExpense({
        description: fDesc.trim(),
        amount,
        date: fDate,
        note: fNote.trim() || undefined,
        ...(fCategory !== AUTO_ID ? { categoryId: fCategory } : {})
      })
      setAddOpen(false)
      resetAddForm()
      reloadAll()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await api.deleteExpense(id)
    reloadAll()
  }

  const handleReassign = async (e: Expense, categoryId: string) => {
    if (categoryId === e.categoryId) return
    await api.saveExpense({
      id: e.id,
      description: e.description,
      amount: e.amount,
      date: e.date,
      categoryId
    })
    reloadAll()
  }

  // ---- Import handlers ----
  const openImportDialog = async () => {
    const res = await api.importExpensesDialog()
    if (res) {
      setImportRows(res.preview ?? [])
      setPasteText(res.raw ?? '')
      setImportOpen(true)
    }
  }

  const handleParse = async () => {
    if (!pasteText.trim()) return
    setParsing(true)
    try {
      const rows = await api.parseExpensesText(pasteText)
      setImportRows(rows ?? [])
    } finally {
      setParsing(false)
    }
  }

  const updateImportRowCategory = (idx: number, categoryId: string) => {
    setImportRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, categoryId, method: 'manual' as const } : r))
    )
  }

  const handleCommitImport = async () => {
    if (importRows.length === 0) return
    setCommitting(true)
    try {
      await api.commitExpenseImport(importRows)
      setImportOpen(false)
      setImportRows([])
      setPasteText('')
      reloadAll()
    } finally {
      setCommitting(false)
    }
  }

  const closeImport = () => {
    setImportOpen(false)
  }

  const currency = summary?.currency ?? 'USD'

  // ---- Derived chart / budget data ----
  const pieData = useMemo(() => {
    if (!summary) return []
    return summary.byCategory
      .map((b) => {
        const cat = catMap.get(b.categoryId)
        return {
          categoryId: b.categoryId,
          name: cat?.name ?? 'Uncategorised',
          value: Math.abs(b.total),
          color: cat?.color ?? '#64748b'
        }
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [summary, catMap])

  const barData = useMemo(() => {
    const src = yearSummary?.byMonth ?? summary?.byMonth ?? []
    return [...src]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ month: formatMonth(m.month), total: Math.abs(m.total) }))
  }, [yearSummary, summary])

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>()
    if (summary) {
      for (const b of summary.byCategory) m.set(b.categoryId, Math.abs(b.total))
    }
    return m
  }, [summary])

  const budgets = useMemo(
    () => categories.filter((c) => (c.budgetMonthly ?? 0) > 0),
    [categories]
  )

  const topCategories = useMemo(() => pieData.slice(0, 4), [pieData])

  const totalSpent = summary ? Math.abs(summary.total) : 0

  const loading =
    categoriesAsync.loading && summaryAsync.loading && expensesAsync.loading && !summary

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Track spending, auto-categorise and stay on budget"
        icon={Wallet}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={Tags} onClick={() => setManageOpen(true)}>
              Categories
            </Button>
            <Button variant="outline" icon={Upload} onClick={openImportDialog}>
              Import statement
            </Button>
            <Button variant="primary" icon={Plus} onClick={openAdd}>
              Add expense
            </Button>
          </div>
        }
      />

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-400">
          <CalendarDays size={15} className="text-slate-500" />
          Month
        </span>
        <div className="w-48">
          <Select value={month} onChange={(e) => setMonth(e.target.value)}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <Panel className="lg:col-span-1 relative overflow-hidden flex flex-col justify-between bg-gradient-to-br from-ember-500/10 via-ink-800/70 to-ink-900/60 border-ember-500/20 shadow-glow">
              <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-ember-500/20 blur-3xl" />
              <div className="relative flex items-center gap-2 text-sm font-medium text-slate-300">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember-500/15 text-ember-400 ring-1 ring-inset ring-ember-500/25">
                  <TrendingDown size={16} />
                </span>
                Total spent
              </div>
              <div className="relative mt-4">
                <div className="text-3xl font-bold tracking-tight text-white">
                  {formatCurrency(totalSpent, currency)}
                </div>
                <div className="text-xs text-slate-400 mt-1.5">
                  {summary?.count ?? 0} transaction{(summary?.count ?? 0) === 1 ? '' : 's'} ·{' '}
                  {formatMonth(month)}
                </div>
              </div>
            </Panel>

            <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
              {topCategories.length === 0 ? (
                <Panel className="col-span-2 md:col-span-4 flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-700/60 text-slate-500">
                    <Layers size={18} />
                  </span>
                  <span className="text-sm text-slate-500">No category spending this month.</span>
                </Panel>
              ) : (
                topCategories.map((c) => {
                  const cat = catMap.get(c.categoryId)
                  const Icon = cat ? categoryIcon(cat.icon) : Receipt
                  const share = totalSpent > 0 ? Math.round((c.value / totalSpent) * 100) : 0
                  return (
                    <Panel
                      key={c.categoryId}
                      className="panel-hover group flex flex-col gap-2.5 transition duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105"
                          style={{
                            backgroundColor: `${c.color}22`,
                            color: c.color,
                            boxShadow: `inset 0 0 0 1px ${c.color}33`
                          }}
                        >
                          <Icon size={18} />
                        </div>
                        {share > 0 && (
                          <span className="text-[11px] font-medium text-slate-500">{share}%</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-300 truncate">{c.name}</div>
                      <div className="text-lg font-bold tracking-tight text-white">
                        {formatCurrency(c.value, currency)}
                      </div>
                    </Panel>
                  )
                })
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel className="panel-hover transition duration-200">
              <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-grass-500/15 text-grass-400 ring-1 ring-inset ring-grass-500/25">
                  <PieChartIcon size={15} />
                </span>
                Spend by category
              </div>
              {pieData.length === 0 ? (
                <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
                  <PieChartIcon size={28} className="text-slate-600" />
                  No spending to chart.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {pieData.map((d) => (
                        <Cell key={d.categoryId} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v, currency)}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: 8,
                        color: '#e2e8f0'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {pieData.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-2 mt-4 pt-3 border-t border-ink-700/70">
                  {pieData.slice(0, 6).map((d) => (
                    <div
                      key={d.categoryId}
                      className="flex items-center gap-1.5 text-xs text-slate-400"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full ring-2 ring-inset ring-white/5"
                        style={{ backgroundColor: d.color }}
                      />
                      {d.name}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel className="panel-hover transition duration-200">
              <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/25">
                  <BarChart3 size={15} />
                </span>
                Monthly trend
              </div>
              {barData.length === 0 ? (
                <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
                  <BarChart3 size={28} className="text-slate-600" />
                  No history to chart.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData}>
                    <defs>
                      <linearGradient id="expBarFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={{ stroke: '#1e293b' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      cursor={{ fill: '#1e293b55' }}
                      formatter={(v: number) => formatCurrency(v, currency)}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: 8,
                        color: '#e2e8f0'
                      }}
                    />
                    <Bar dataKey="total" fill="url(#expBarFill)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* Budgets */}
          {budgets.length > 0 && (
            <Panel className="panel-hover transition duration-200">
              <div className="flex items-center gap-2 mb-5 text-sm font-semibold text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember-500/15 text-ember-400 ring-1 ring-inset ring-ember-500/25">
                  <Wallet size={15} />
                </span>
                Budgets
                <span className="text-slate-500 font-normal">· {formatMonth(month)}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                {budgets.map((cat) => {
                  const budget = cat.budgetMonthly ?? 0
                  const spent = spentByCategory.get(cat.id) ?? 0
                  const pct = budget > 0 ? (spent / budget) * 100 : 0
                  const over = spent > budget
                  const Icon = categoryIcon(cat.icon)
                  return (
                    <div key={cat.id} className="group">
                      <div className="flex items-center justify-between mb-2 text-sm">
                        <span className="flex items-center gap-2 font-medium text-slate-200">
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-inset"
                            style={{
                              backgroundColor: `${cat.color}22`,
                              color: cat.color,
                              boxShadow: `inset 0 0 0 1px ${cat.color}33`
                            }}
                          >
                            <Icon size={12} />
                          </span>
                          {cat.name}
                        </span>
                        <span
                          className={`tabular-nums font-medium ${over ? 'text-rose-400' : 'text-slate-400'}`}
                        >
                          {formatCurrency(spent, currency)}{' '}
                          <span className="text-slate-600">/ {formatCurrency(budget, currency)}</span>
                        </span>
                      </div>
                      <ProgressBar value={Math.min(pct, 100)} color={over ? '#f43f5e' : cat.color} />
                      {over && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-rose-400">
                          <AlertTriangle size={12} />
                          Over by {formatCurrency(spent - budget, currency)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          {/* Recurring / subscriptions */}
          <RecurringPanel items={recurringAsync.data ?? []} catMap={catMap} currency={currency} />

          {/* Transactions */}
          <Panel className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-700 bg-ink-900/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-grass-500/15 text-grass-400 ring-1 ring-inset ring-grass-500/25">
                  <Receipt size={15} />
                </span>
                Transactions
                <span className="text-slate-500 font-normal">· {formatMonth(month)}</span>
              </div>
              {expenses.length > 0 && (
                <span className="chip bg-ink-700/70 text-slate-400 border border-ink-600">
                  {expenses.length} item{expenses.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {expenses.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Receipt}
                  title="No transactions yet"
                  description="Add an expense manually or import a statement to get started."
                  action={
                    <div className="flex items-center gap-2">
                      <Button variant="outline" icon={Upload} onClick={openImportDialog}>
                        Import statement
                      </Button>
                      <Button variant="primary" icon={Plus} onClick={openAdd}>
                        Add expense
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-ink-700/70">
                {expenses.map((e) => {
                  const cat = catMap.get(e.categoryId)
                  const Icon = cat ? categoryIcon(cat.icon) : Receipt
                  const isIncome = e.amount > 0
                  const accent = cat?.color ?? '#64748b'
                  return (
                    <div
                      key={e.id}
                      className="group flex items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-ink-800/60"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-150 group-hover:scale-105"
                        style={{
                          backgroundColor: `${accent}1f`,
                          color: accent,
                          boxShadow: `inset 0 0 0 1px ${accent}33`
                        }}
                      >
                        <Icon size={16} />
                      </span>
                      <div className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">
                        {formatDate(e.date)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200 truncate">
                          {e.description}
                        </div>
                        {e.merchant && (
                          <div className="text-xs text-slate-500 truncate">{e.merchant}</div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <Chip color={cat?.color ?? '#64748b'}>
                          <span className="inline-flex items-center gap-1">
                            <Icon size={12} />
                            {cat?.name ?? 'Uncategorised'}
                          </span>
                        </Chip>
                      </div>
                      <div
                        className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${
                          isIncome ? 'text-grass-400' : 'text-rose-400'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(Math.abs(e.amount), e.currency || currency)}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <div className="w-36">
                          <Select
                            value={e.categoryId}
                            onChange={(ev) => handleReassign(e, ev.target.value)}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <IconButton icon={Trash2} title="Delete" onClick={() => handleDelete(e.id)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ---- Add expense modal ---- */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add expense"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Plus} loading={saving} onClick={handleSaveAdd}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {fError && (
            <div className="flex items-center gap-2 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0" />
              {fError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </Field>
            <Field label="Type">
              <Select
                value={fType}
                onChange={(e) => setFType(e.target.value as 'Expense' | 'Income')}
              >
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              placeholder="e.g. Grocery run at Whole Foods"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount" hint="Enter a positive number">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={fAmount}
                onChange={(e) => setFAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Category" hint="Leave on Auto-detect to classify by rules">
              <Select value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
                <option value={AUTO_ID}>Auto-detect</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note" hint="Optional">
            <Textarea
              value={fNote}
              onChange={(e) => setFNote(e.target.value)}
              placeholder="Any extra details"
              rows={2}
            />
          </Field>
        </div>
      </Modal>

      {/* ---- Import modal ---- */}
      <Modal
        open={importOpen}
        onClose={closeImport}
        title="Import transactions"
        wide
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="text-xs text-slate-500">
              {importRows.length} transaction{importRows.length === 1 ? '' : 's'} ·{' '}
              {importRows.length} to import
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={closeImport}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={Upload}
                loading={committing}
                disabled={importRows.length === 0}
                onClick={handleCommitImport}
              >
                Import {importRows.length} transaction{importRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Paste CSV */}
          <div className="space-y-2 rounded-xl border border-ink-700 bg-ink-900/40 p-4">
            <span className="label flex items-center gap-1.5">
              <FileText size={13} className="text-slate-500" />
              Paste CSV / statement text
            </span>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="date,description,amount&#10;2026-06-01,Coffee shop,-4.50"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                variant="subtle"
                icon={FileText}
                loading={parsing}
                disabled={!pasteText.trim()}
                onClick={handleParse}
              >
                Parse
              </Button>
            </div>
          </div>

          {/* Preview */}
          {importRows.length === 0 ? (
            <EmptyState
              icon={Upload}
              title="Nothing to preview"
              description="Pick a file or paste CSV text above, then parse it to preview the rows."
            />
          ) : (
            <div className="border border-ink-700 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 bg-ink-900/60 border-b border-ink-700">
                <div className="col-span-2">Date</div>
                <div className="col-span-4">Description</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1">Type</div>
                <div className="col-span-3">Category</div>
              </div>
              <div className="max-h-[40vh] overflow-y-auto divide-y divide-ink-700/70">
                {importRows.map((row, idx) => {
                  const isIncome = row.amount > 0
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-sm transition-colors duration-150 hover:bg-ink-800/50"
                    >
                      <div className="col-span-2 text-xs text-slate-400 tabular-nums">
                        {formatDate(row.date)}
                      </div>
                      <div className="col-span-4 truncate text-slate-200" title={row.description}>
                        {row.description}
                        {row.merchant && (
                          <span className="block text-xs text-slate-500 truncate">
                            {row.merchant}
                          </span>
                        )}
                      </div>
                      <div
                        className={`col-span-2 text-right font-semibold tabular-nums ${
                          isIncome ? 'text-grass-400' : 'text-rose-400'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(Math.abs(row.amount), currency)}
                      </div>
                      <div className="col-span-1">{methodBadge(row.method, row.confidence)}</div>
                      <div className="col-span-3">
                        <Select
                          value={row.categoryId}
                          onChange={(e) => updateImportRowCategory(idx, e.target.value)}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ---- Manage categories modal ---- */}
      <ManageExpenseCategories
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        categories={categories}
        onChanged={() => {
          categoriesAsync.reload()
          reloadAll()
        }}
      />
    </div>
  )
}

function RecurringPanel({
  items,
  catMap,
  currency
}: {
  items: RecurringItem[]
  catMap: Map<string, ExpenseCategory>
  currency: string
}) {
  if (items.length === 0) return null
  const totalMonthly = items.reduce((s, i) => s + i.monthly, 0)
  return (
    <Panel className="panel-hover transition duration-200">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/25">
            <Repeat size={15} />
          </span>
          Recurring &amp; subscriptions
        </div>
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-right">
          <div className="text-sm font-bold tracking-tight text-white">
            {formatCurrency(totalMonthly, currency)}
            <span className="text-xs font-normal text-slate-400">/mo</span>
          </div>
          <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400">
            <ArrowUpRight size={11} />≈ {formatCurrency(totalMonthly * 12, currency)} / year
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {items.map((r) => {
          const cat = catMap.get(r.categoryId)
          const Icon = cat ? categoryIcon(cat.icon) : Receipt
          const accent = cat?.color ?? '#64748b'
          return (
            <div
              key={r.key}
              className="group flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5 transition duration-200 hover:border-ink-600 hover:bg-ink-800"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105"
                style={{
                  backgroundColor: `${accent}1f`,
                  color: accent,
                  boxShadow: `inset 0 0 0 1px ${accent}33`
                }}
              >
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-200" title={r.description}>
                  {r.description}
                </div>
                <div className="text-[11px] text-slate-500">
                  {r.count}× across {r.months} months · last {formatDate(r.lastDate)}
                </div>
              </div>
              <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-200">
                {formatCurrency(r.monthly, currency)}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

const CAT_COLORS = ['#7cc576', '#f4a64b', '#5bb8e6', '#f472b6', '#a78bfa', '#fb7185', '#fbbf24', '#34d399', '#c084fc', '#2dd4bf']

function ManageExpenseCategories({
  open,
  onClose,
  categories,
  onChanged
}: {
  open: boolean
  onClose: () => void
  categories: ExpenseCategory[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [budget, setBudget] = useState('')
  const [color, setColor] = useState(CAT_COLORS[0])
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.saveExpenseCategory({
        name: name.trim(),
        color,
        icon: 'CircleDollarSign',
        keywords: keywords.split(',').map((s) => s.trim()).filter(Boolean),
        budgetMonthly: budget ? Number(budget) : undefined
      })
      setName('')
      setKeywords('')
      setBudget('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: ExpenseCategory) {
    if (c.builtin) return
    if (!window.confirm(`Delete "${c.name}"? Its transactions move to "Other".`)) return
    await api.deleteExpenseCategory(c.id)
    onChanged()
  }

  return (
    <Modal open={open} onClose={onClose} title="Expense categories" wide>
      <div className="space-y-6">
        <div className="rounded-2xl border border-ink-600 bg-gradient-to-br from-grass-500/5 via-ink-900/50 to-ink-900/50 p-5 shadow-panel">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-grass-500/15 text-grass-400 ring-1 ring-inset ring-grass-500/25">
              <Plus size={13} />
            </span>
            New category
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pets" />
            </Field>
            <Field label="Monthly budget" hint="Optional">
              <Input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Keywords (comma separated)">
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="vet, petshop, kibble" />
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CAT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-lg border-2 transition-transform duration-150 hover:scale-110 ${
                      color === c ? 'border-white ring-2 ring-white/20' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" icon={Plus} onClick={add} loading={saving}>
              Add category
            </Button>
          </div>
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <CircleDollarSign size={14} className="text-slate-500" />
            Existing
            <span className="chip bg-ink-700/70 text-slate-400 border border-ink-600">
              {categories.length}
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon)
              return (
                <div
                  key={c.id}
                  className="group flex items-center gap-2.5 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5 transition duration-150 hover:border-ink-600 hover:bg-ink-800"
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset"
                    style={{
                      backgroundColor: `${c.color}1f`,
                      color: c.color,
                      boxShadow: `inset 0 0 0 1px ${c.color}33`
                    }}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="text-sm font-medium text-slate-200">{c.name}</span>
                  {c.budgetMonthly ? (
                    <span className="text-[10px] font-medium text-slate-500 tabular-nums">
                      €{c.budgetMonthly}/mo
                    </span>
                  ) : null}
                  {c.builtin ? (
                    <span className="ml-auto rounded-md bg-ink-700/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      built-in
                    </span>
                  ) : (
                    <IconButton
                      icon={X}
                      className="ml-auto opacity-60 transition hover:text-rose-400 hover:opacity-100"
                      onClick={() => remove(c)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
