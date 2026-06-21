import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DatabaseShape, defaultData } from './schema'

let dbPath = ''
let data: DatabaseShape = defaultData()
let writeTimer: NodeJS.Timeout | null = null

/** Initialise the JSON store inside the given vault folder. */
export function initDb(vaultPath: string): DatabaseShape {
  if (!existsSync(vaultPath)) mkdirSync(vaultPath, { recursive: true })
  dbPath = join(vaultPath, 'lifehq-db.json')
  if (existsSync(dbPath)) {
    try {
      const parsed = JSON.parse(readFileSync(dbPath, 'utf-8'))
      // Merge so newly added collections / seeded categories appear for old vaults.
      const base = defaultData()
      data = { ...base, ...parsed }
      // Ensure built-in categories always exist (so an empty vault still sorts well).
      mergeBuiltins(data)
    } catch {
      data = defaultData()
    }
  } else {
    data = defaultData()
    persist()
  }
  return data
}

function mergeBuiltins(d: DatabaseShape) {
  const base = defaultData()
  for (const c of base.fileCategories) {
    if (!d.fileCategories.some((x) => x.id === c.id)) d.fileCategories.push(c)
  }
  for (const c of base.expenseCategories) {
    if (!d.expenseCategories.some((x) => x.id === c.id)) d.expenseCategories.push(c)
  }
  if (d.regions.length === 0) d.regions = base.regions
}

export function db(): DatabaseShape {
  return data
}

/** Write immediately (used on shutdown). */
export function persist(): void {
  if (!dbPath) return
  const tmp = dbPath + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, dbPath)
}

/** Debounced save used after every mutation. */
export function save(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(persist, 150)
}

export function newId(): string {
  return globalThis.crypto.randomUUID()
}
