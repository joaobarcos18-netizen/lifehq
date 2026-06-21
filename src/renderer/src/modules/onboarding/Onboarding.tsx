import { useState } from 'react'
import { ArrowRight, Boxes, Check, FolderCog, KeyRound, Sparkles } from 'lucide-react'
import { api } from '@/lib/ipc'
import { Button, Field, Input } from '@/components/ui'
import type { Settings } from '@shared/types'

export default function Onboarding({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(settings.displayName)
  const [vaultPath, setVaultPath] = useState(settings.vaultPath)
  const [apiKey, setApiKey] = useState('')
  const [aiConnected, setAiConnected] = useState(settings.ai.hasKey)
  const [finishing, setFinishing] = useState(false)

  async function chooseFolder() {
    const s = await api.chooseVaultFolder()
    if (s) setVaultPath(s.vaultPath)
  }

  async function connectAi() {
    if (!apiKey.trim()) return
    await api.setApiKey(apiKey.trim())
    setAiConnected(true)
    setApiKey('')
  }

  async function finish() {
    setFinishing(true)
    try {
      await api.updateSettings({ displayName: name.trim(), onboardingComplete: true })
      onDone()
    } finally {
      setFinishing(false)
    }
  }

  const steps = [
    {
      title: 'Welcome to LifeHQ',
      body: (
        <div className="space-y-4">
          <p className="text-slate-400">
            This is your personal operating system — a company app, but for your life. It sorts your files, tracks your
            wins and goals, watches your spending, and turns your photos into a world you can explore.
          </p>
          <Field label="What should I call you?">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
          </Field>
        </div>
      )
    },
    {
      title: 'Your private vault',
      body: (
        <div className="space-y-4">
          <p className="text-slate-400">
            Everything lives in one folder on your PC and never leaves your machine. You can keep the default or pick
            your own (great if you sync a folder to a backup drive).
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/50 px-3 py-2.5">
            <FolderCog className="h-4 w-4 shrink-0 text-sky-400" />
            <code className="flex-1 truncate text-xs text-slate-300">{vaultPath}</code>
            <Button variant="subtle" onClick={chooseFolder}>
              Change…
            </Button>
          </div>
        </div>
      )
    },
    {
      title: 'AI assist (optional)',
      body: (
        <div className="space-y-4">
          <p className="text-slate-400">
            LifeHQ sorts everything locally with fast rules — free, private, offline. If you want, connect an Anthropic
            key so Claude can handle the genuinely ambiguous cases. You can always do this later in Settings.
          </p>
          {aiConnected ? (
            <div className="flex items-center gap-2 rounded-lg border border-grass-500/30 bg-grass-600/10 px-3 py-2.5 text-sm text-grass-300">
              <Check className="h-4 w-4" /> AI connected — you&apos;re all set.
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Anthropic API key" hint="Optional · starts with sk-ant-">
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
              <Button variant="primary" onClick={connectAi} disabled={!apiKey.trim()}>
                Connect
              </Button>
            </div>
          )}
        </div>
      )
    }
  ]

  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80 p-6 backdrop-blur-md">
      <div className="w-full max-w-lg animate-drop-in rounded-2xl border border-ink-600 bg-ink-800 shadow-panel">
        <div className="flex items-center gap-3 border-b border-ink-700 px-6 py-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-grass-500 to-grass-600 shadow-glow">
            {step === 2 ? <Sparkles className="h-6 w-6 text-white" /> : <Boxes className="h-6 w-6 text-white" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{steps[step].title}</h2>
            <div className="mt-1 flex gap-1.5">
              {steps.map((_, i) => (
                <span key={i} className={`h-1.5 w-6 rounded-full ${i <= step ? 'bg-grass-500' : 'bg-ink-600'}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-6">{steps[step].body}</div>

        <div className="flex items-center justify-between border-t border-ink-700 px-6 py-4">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {isLast ? (
            <Button variant="primary" icon={ArrowRight} loading={finishing} onClick={finish}>
              Enter LifeHQ
            </Button>
          ) : (
            <Button variant="primary" icon={ArrowRight} onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
