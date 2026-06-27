import { BookOpen, Boxes, Command, Dumbbell, FolderTree, LayoutDashboard, Settings as SettingsIcon, Trophy, Wallet } from 'lucide-react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAsync } from './lib/useAsync'
import { api } from './lib/ipc'
import Dashboard from './modules/dashboard/Dashboard'
import Sorter from './modules/sorter/Sorter'
import Achievements from './modules/achievements/Achievements'
import GoalsFitness from './modules/fitness/GoalsFitness'
import Expenses from './modules/expenses/Expenses'
import Journal from './modules/journal/Journal'
import PhotoWorld from './modules/photos/PhotoWorld'
import Settings from './modules/settings/Settings'
import Onboarding from './modules/onboarding/Onboarding'
import CommandPalette from './components/CommandPalette'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sorter', label: 'File Sorter', icon: FolderTree },
  { to: '/achievements', label: 'Achievements', icon: Trophy },
  { to: '/goals', label: 'Goals & Fitness', icon: Dumbbell },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/world', label: 'Photo World', icon: Boxes },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
]

export default function App() {
  const { data: settings, reload: reloadSettings } = useAsync(() => api.getSettings(), [])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {settings && !settings.onboardingComplete && (
        <Onboarding settings={settings} onDone={reloadSettings} />
      )}
      <CommandPalette />
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-ink-700/80 bg-ink-900/80 px-3 py-5">
        <div className="mb-7 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-grass-500 to-grass-600 shadow-glow">
            <Boxes className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold leading-none text-white">LifeHQ</div>
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Personal OS</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
          className="mt-4 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5 text-sm text-slate-400 transition hover:border-ink-600 hover:text-white"
        >
          <Command className="h-4 w-4" /> Quick actions
          <span className="ml-auto rounded border border-ink-600 px-1.5 py-0.5 text-[10px]">Ctrl K</span>
        </button>

        <div className="mt-2 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-3">
          <div className="text-sm font-medium text-slate-200">
            {settings?.displayName ? settings.displayName : 'Welcome'}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span
              className={clsx('h-2 w-2 rounded-full', settings?.ai.enabled ? 'bg-grass-400' : 'bg-slate-600')}
            />
            {settings?.ai.enabled ? 'AI assist on' : 'Local rules mode'}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sorter" element={<Sorter />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/goals" element={<GoalsFitness />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/world" element={<PhotoWorld />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
