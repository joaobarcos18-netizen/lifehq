export function formatCurrency(amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatMonth(month: string): string {
  const d = new Date(month + '-01T00:00:00')
  if (Number.isNaN(d.getTime())) return month
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function relativeTime(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/** Build a renderer URL that serves a file from the vault. */
export function vaultUrl(relPath: string): string {
  return `lifehq://vault/${relPath.split('/').map(encodeURIComponent).join('/')}`
}
