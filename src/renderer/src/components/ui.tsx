import { clsx } from 'clsx'
import { Loader2, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

/* ------------------------------- Button ------------------------------- */
type Variant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'outline'

export function Button({
  variant = 'subtle',
  icon: Icon,
  className,
  children,
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-gradient-to-b from-grass-500 to-grass-600 hover:from-grass-400 hover:to-grass-500 text-white shadow-glow',
    ghost: 'text-slate-300 hover:text-white hover:bg-ink-700/70',
    subtle: 'bg-ink-700/80 hover:bg-ink-600 text-slate-100 border border-ink-600',
    outline: 'border border-ink-500 text-slate-200 hover:bg-ink-700/60',
    danger: 'bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white'
  }
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        styles[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon }) {
  return (
    <button
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-ink-700 transition',
        className
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

/* ------------------------------- Panel ------------------------------- */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('panel p-5', className)}>{children}</div>
}

/* ------------------------------- Badge / Chip ------------------------------- */
export function Chip({ color, children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx('chip', className)}
      style={color ? { backgroundColor: `${color}22`, color, border: `1px solid ${color}55` } : undefined}
    >
      {children}
    </span>
  )
}

/* ------------------------------- Inputs ------------------------------- */
export function Field({ label, children, hint }: { label?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('input', props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('input min-h-[80px] resize-y', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx('input appearance-none cursor-pointer', props.className)}>
      {props.children}
    </select>
  )
}

/* ------------------------------- Misc ------------------------------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-slate-400', className)} />
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 bg-ink-800/30 px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-700/70 text-grass-400">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions
}: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-grass-500/25 to-grass-600/10 text-grass-400 ring-1 ring-grass-500/25">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ProgressBar({ value, color = '#7cc576' }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-900">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
      />
    </div>
  )
}
