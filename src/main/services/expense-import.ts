import Papa from 'papaparse'

export interface RawTxn {
  date: string
  description: string
  amount: number
}

const DATE_KEYS = ['date', 'data', 'transaction date', 'posted', 'value date', 'data valor', 'data mov']
const DESC_KEYS = ['description', 'desc', 'details', 'memo', 'concept', 'descricao', 'descrição', 'movimento', 'narrative', 'payee', 'merchant']
const AMOUNT_KEYS = ['amount', 'value', 'valor', 'montante', 'total']
const DEBIT_KEYS = ['debit', 'debito', 'débito', 'withdrawal', 'saida', 'saída']
const CREDIT_KEYS = ['credit', 'credito', 'crédito', 'deposit', 'entrada']

function findKey(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h === cand)
    if (idx >= 0) return headers[idx]
  }
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h.includes(cand))
    if (idx >= 0) return headers[idx]
  }
  return null
}

export function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (raw == null) return 0
  let s = String(raw).trim().replace(/[€$£\s]/g, '')
  if (!s) return 0
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[()]/g, '').replace(/^-/, '')
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  if (Number.isNaN(n)) return 0
  return neg ? -n : n
}

export function normalizeDate(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return s
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = '20' + y
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // yyyy/mm/dd
  const m2 = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/)
  if (m2) {
    const [, y, mo, d] = m2
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s
}

/** Parse a CSV/TSV blob from a bank export into normalized transactions. */
export function parseTransactions(text: string): RawTxn[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [',', ';', '\t', '|']
  })
  const rows = parsed.data
  if (!rows.length) return []
  const headers = parsed.meta.fields ?? Object.keys(rows[0])

  const dateKey = findKey(headers, DATE_KEYS) ?? headers[0]
  const descKey = findKey(headers, DESC_KEYS) ?? headers[1] ?? headers[0]
  const amountKey = findKey(headers, AMOUNT_KEYS)
  const debitKey = findKey(headers, DEBIT_KEYS)
  const creditKey = findKey(headers, CREDIT_KEYS)

  const out: RawTxn[] = []
  for (const row of rows) {
    const date = normalizeDate(row[dateKey] ?? '')
    const description = (row[descKey] ?? '').toString().trim()
    let amount = 0
    if (amountKey) {
      amount = parseAmount(row[amountKey])
    } else if (debitKey || creditKey) {
      const debit = debitKey ? Math.abs(parseAmount(row[debitKey])) : 0
      const credit = creditKey ? Math.abs(parseAmount(row[creditKey])) : 0
      amount = credit - debit
    }
    if (!description && !amount) continue
    out.push({ date, description, amount })
  }
  return out
}
