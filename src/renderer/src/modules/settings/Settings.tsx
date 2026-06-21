import { useEffect, useState } from 'react'
import {
  Check,
  DatabaseBackup,
  FolderCog,
  KeyRound,
  Lock,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Wand2,
  X
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { useAsync } from '@/lib/useAsync'
import { Button, Field, Input, Panel, PageHeader, Select, Spinner } from '@/components/ui'
import type { Settings as SettingsType } from '@shared/types'

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast & cheap (recommended)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable' }
]

export default function Settings() {
  const { data, loading, reload } = useAsync(() => api.getSettings(), [])
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setSettings(data)
      setName(data.displayName)
    }
  }, [data])

  if (loading || !settings) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Spinner className="h-7 w-7" />
        <p className="text-sm text-slate-500">Loading your settings…</p>
      </div>
    )
  }

  async function saveName() {
    setSavingName(true)
    try {
      const s = await api.updateSettings({ displayName: name })
      setSettings(s)
    } finally {
      setSavingName(false)
    }
  }

  async function chooseFolder() {
    const s = await api.chooseVaultFolder()
    if (s) {
      setSettings(s)
      reload()
    }
  }

  async function saveKey() {
    if (!apiKey.trim()) return
    const s = await api.setApiKey(apiKey.trim())
    setSettings(s)
    setApiKey('')
    setTestResult(null)
  }

  async function removeKey() {
    const s = await api.clearApiKey()
    setSettings(s)
    setTestResult(null)
  }

  async function toggleAi(enabled: boolean) {
    const s = await api.updateSettings({ ai: { enabled } })
    setSettings(s)
  }

  async function changeModel(model: string) {
    const s = await api.updateSettings({ ai: { model } })
    setSettings(s)
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.testAi())
    } finally {
      setTesting(false)
    }
  }

  async function backup() {
    setBackingUp(true)
    setBackupMsg(null)
    try {
      const res = await api.backupVault()
      if (res) setBackupMsg(`Backed up to ${res.path}`)
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Settings" subtitle="Make LifeHQ your own." icon={FolderCog} />

      {/* Profile */}
      <Panel className="panel-hover relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-grass-500/10 blur-3xl" />
        <div className="relative mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-grass-500/25 to-grass-600/10 ring-1 ring-grass-500/30">
            <User className="h-5 w-5 text-grass-400" />
          </div>
          <div>
            <h2 className="font-bold tracking-tight text-slate-100">Profile</h2>
            <p className="text-xs text-slate-500">How LifeHQ greets you.</p>
          </div>
        </div>
        <div className="relative flex items-end gap-3">
          <div className="flex-1">
            <Field label="Display name" hint="Shown on your dashboard greeting.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </Field>
          </div>
          <Button variant="primary" icon={Save} onClick={saveName} loading={savingName}>
            Save
          </Button>
        </div>
      </Panel>

      {/* Vault */}
      <Panel className="panel-hover relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/25 to-sky-400/10 ring-1 ring-sky-500/30">
            <FolderCog className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h2 className="font-bold tracking-tight text-slate-100">Your vault</h2>
            <p className="text-xs text-slate-500">One folder, fully yours.</p>
          </div>
        </div>
        <p className="relative mb-4 text-sm leading-relaxed text-slate-400">
          Everything — your files, photos and data — lives in one folder on your PC. It never leaves your machine
          unless you enable AI assist.
        </p>
        <div className="relative flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-900/60 px-3.5 py-2.5 transition-colors duration-200 hover:border-sky-500/40">
          <FolderCog className="h-4 w-4 shrink-0 text-slate-500" />
          <code className="flex-1 truncate text-xs text-slate-300">{settings.vaultPath}</code>
          <Button variant="outline" onClick={() => api.openVaultFolder()}>
            Open
          </Button>
          <Button variant="subtle" onClick={chooseFolder}>
            Change…
          </Button>
        </div>
      </Panel>

      {/* Backup */}
      <Panel className="panel-hover relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-grass-500/10 blur-3xl" />
        <div className="relative mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-grass-500/25 to-grass-600/10 ring-1 ring-grass-500/30">
            <DatabaseBackup className="h-5 w-5 text-grass-400" />
          </div>
          <div>
            <h2 className="font-bold tracking-tight text-slate-100">Backup</h2>
            <p className="text-xs text-slate-500">Keep a safe copy of everything.</p>
          </div>
        </div>
        <p className="relative mb-4 text-sm leading-relaxed text-slate-400">
          Make a dated copy of your entire vault (data, files and photos) to another folder or drive. To restore, just
          point your vault at a backup folder above.
        </p>
        <div className="relative flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={DatabaseBackup} onClick={backup} loading={backingUp}>
            Back up vault now
          </Button>
          {backupMsg && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-grass-500/30 bg-grass-600/10 px-3 py-1 text-sm text-grass-300 animate-drop-in">
              <Check className="h-3.5 w-3.5" />
              <span className="truncate">{backupMsg}</span>
            </span>
          )}
        </div>
      </Panel>

      {/* AI */}
      <Panel className="panel-hover relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-ember-500/10 blur-3xl" />
        <div className="relative mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-ember-500/25 to-ember-600/10 ring-1 ring-ember-500/30 shadow-glow">
              <Sparkles className="h-5 w-5 text-ember-400" />
            </div>
            <div>
              <h2 className="font-bold tracking-tight text-slate-100">AI assist</h2>
              <p className="text-xs text-slate-500">Optional · powered by Claude</p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <span className={`font-medium transition-colors ${settings.ai.enabled ? 'text-grass-400' : 'text-slate-500'}`}>
              {settings.ai.enabled ? 'On' : 'Off'}
            </span>
            <button
              onClick={() => toggleAi(!settings.ai.enabled)}
              disabled={!settings.ai.hasKey}
              className={`relative h-6 w-11 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                settings.ai.enabled ? 'bg-grass-500 shadow-glow' : 'bg-ink-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                  settings.ai.enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </label>
        </div>

        <p className="relative mb-5 text-sm leading-relaxed text-slate-400">
          By default LifeHQ sorts everything locally with fast rules — free, private and offline. Connect an Anthropic
          API key to let Claude handle the tricky, ambiguous cases (messy file names, unusual transactions). Your key
          is stored encrypted on this device.
        </p>

        {settings.ai.hasKey ? (
          <div className="relative space-y-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-grass-500/30 bg-gradient-to-r from-grass-600/15 to-grass-600/5 px-3.5 py-3 text-sm text-grass-300">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-grass-500/20">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium">API key connected</span>
              <Button variant="ghost" icon={Trash2} className="ml-auto !py-1 text-rose-400" onClick={removeKey}>
                Remove
              </Button>
            </div>
            <Field label="Model">
              <Select value={settings.ai.model} onChange={(e) => changeModel(e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="subtle" icon={Wand2} onClick={test} loading={testing}>
                Test connection
              </Button>
              {testResult && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm animate-drop-in ${
                    testResult.ok
                      ? 'border-grass-500/30 bg-grass-600/10 text-grass-400'
                      : 'border-rose-500/30 bg-rose-600/10 text-rose-400'
                  }`}
                >
                  {testResult.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="relative flex items-end gap-3">
            <div className="flex-1">
              <Field label="Anthropic API key" hint="Get one at console.anthropic.com — starts with sk-ant-">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="pl-9"
                  />
                </div>
              </Field>
            </div>
            <Button variant="primary" icon={Save} onClick={saveKey}>
              Connect
            </Button>
          </div>
        )}

        <div className="relative mt-4 flex items-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3 w-3" />
          <span>Encrypted on this device · never shared without your key.</span>
        </div>
      </Panel>

      <div className="flex items-center justify-center gap-1.5 px-1 pt-1 text-center text-xs text-slate-600">
        <ShieldCheck className="h-3.5 w-3.5 text-slate-600" />
        <span>LifeHQ · your personal operating system · v0.1.0</span>
      </div>
    </div>
  )
}
