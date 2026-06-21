import {
  ArrowRight,
  Boxes,
  Dumbbell,
  FileText,
  FolderTree,
  Sparkles,
  Target,
  Trophy,
  Wallet
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/ipc'
import { useAsync } from '@/lib/useAsync'
import { Panel, ProgressBar, Spinner } from '@/components/ui'
import { formatCurrency, formatDate, relativeTime } from '@/lib/format'
import { categoryIcon } from '@/lib/icons'
import type { LucideIcon } from 'lucide-react'

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  onClick
}: {
  icon: LucideIcon
  label: string
  value: string | number
  accent: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="panel panel-hover group relative flex items-center gap-4 overflow-hidden p-4 text-left"
    >
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50"
        style={{ backgroundColor: accent }}
      />
      <div
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${accent}1f`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="relative min-w-0">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="truncate text-xs text-slate-400">{label}</div>
      </div>
      <ArrowRight className="relative ml-auto h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
    </button>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const { data: stats, loading } = useAsync(() => api.getDashboardStats(), [])
  const { data: settings } = useAsync(() => api.getSettings(), [])

  if (loading || !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-7 w-7" />
      </div>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const name = settings?.displayName || 'explorer'

  return (
    <div className="animate-fade-in space-y-7">
      <div className="relative overflow-hidden rounded-2xl border border-ink-600/60 bg-gradient-to-br from-ink-800/80 via-ink-800/50 to-ink-900/30 p-6">
        <div className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full bg-grass-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-ember-500/5 blur-3xl" />
        <div className="relative">
          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            {greeting}, <span className="bg-gradient-to-r from-grass-400 to-grass-500 bg-clip-text text-transparent">{name}</span>
          </h1>
          <p className="mt-1 text-slate-400">Here&apos;s how your life HQ is looking today.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={FileText} label="Files sorted" value={stats.filesCount} accent="#5bb8e6" onClick={() => nav('/sorter')} />
        <StatCard icon={Trophy} label="Achievements" value={stats.achievementsCount} accent="#f4a64b" onClick={() => nav('/achievements')} />
        <StatCard icon={Target} label="Active goals" value={stats.activeGoals} accent="#a78bfa" onClick={() => nav('/goals')} />
        <StatCard icon={Dumbbell} label="Workouts this week" value={stats.fitnessLogsThisWeek} accent="#7cc576" onClick={() => nav('/goals')} />
        <StatCard icon={Boxes} label="Photos in world" value={stats.photosCount} accent="#fb7185" onClick={() => nav('/world')} />
        <StatCard
          icon={Wallet}
          label="Spent this month"
          value={formatCurrency(stats.expensesThisMonth, stats.expensesCurrency)}
          accent="#34d399"
          onClick={() => nav('/expenses')}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Recent files */}
        <Panel className="lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Recently sorted</h2>
            <FolderTree className="h-4 w-4 text-slate-500" />
          </div>
          {stats.recentFiles.length === 0 ? (
            <p className="text-sm text-slate-500">Drop files into the sorter to get started.</p>
          ) : (
            <ul className="space-y-2.5">
              {stats.recentFiles.map((f) => {
                const Icon = categoryIcon()
                return (
                  <li key={f.id} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate text-sm text-slate-200" title={f.originalName}>
                      {f.originalName}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500">{relativeTime(f.importedAt)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* Top goals */}
        <Panel className="lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Goals in progress</h2>
            <Target className="h-4 w-4 text-slate-500" />
          </div>
          {stats.topGoals.length === 0 ? (
            <p className="text-sm text-slate-500">Set a goal to start tracking your progress.</p>
          ) : (
            <ul className="space-y-3.5">
              {stats.topGoals.map((g) => {
                const pct = g.targetValue ? Math.round((g.currentValue / g.targetValue) * 100) : 0
                return (
                  <li key={g.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate text-slate-200">{g.title}</span>
                      {g.targetValue ? <span className="text-xs text-slate-500">{pct}%</span> : null}
                    </div>
                    {g.targetValue ? <ProgressBar value={pct} /> : <p className="text-xs text-slate-500">No target set</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* Recent achievements */}
        <Panel className="lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Latest wins</h2>
            <Trophy className="h-4 w-4 text-slate-500" />
          </div>
          {stats.recentAchievements.length === 0 ? (
            <p className="text-sm text-slate-500">Log your first achievement — big or small.</p>
          ) : (
            <ul className="space-y-3">
              {stats.recentAchievements.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ember-400" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-200">{a.title}</div>
                    <div className="text-xs text-slate-500">
                      {a.organization ? `${a.organization} · ` : ''}
                      {formatDate(a.date)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {!settings?.onboardingComplete && (
        <Panel className="flex items-center gap-4 border-grass-500/30 bg-grass-600/10">
          <Sparkles className="h-6 w-6 shrink-0 text-grass-400" />
          <div className="flex-1">
            <div className="font-medium text-white">Make LifeHQ yours</div>
            <div className="text-sm text-slate-400">
              Set your name, choose where your vault lives, and optionally connect an AI key in Settings.
            </div>
          </div>
          <button
            onClick={() => nav('/settings')}
            className="rounded-lg bg-grass-600 px-4 py-2 text-sm font-medium text-white hover:bg-grass-500"
          >
            Open settings
          </button>
        </Panel>
      )}
    </div>
  )
}
