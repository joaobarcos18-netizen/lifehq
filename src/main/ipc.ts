import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { cpSync, rmSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import type {
  Achievement,
  DashboardStats,
  Expense,
  ExpenseCategory,
  ExpenseFilter,
  ExpenseImportPreviewRow,
  ExpenseSummary,
  FileCategory,
  FileFilter,
  FitnessLog,
  Goal,
  ImportResult,
  JournalEntry,
  Photo,
  PhotoBlock,
  RecurringItem,
  SortedFile,
  WorldRegion
} from '@shared/types'
import { db, newId, persist, save } from './store/db'
import {
  clearApiKey,
  getConfig,
  getVaultPath,
  saveApiKey,
  setVaultPath,
  toSettings,
  updateConfig
} from './store/config'
import { initDb } from './store/db'
import {
  absPath,
  deleteVaultFile,
  ensureVaultDirs,
  moveFileToCategory,
  storeFile,
  storePhoto
} from './services/vault'
import {
  classifyExpenseByRules,
  classifyFile
} from './services/classifier'
import { testConnection } from './services/ai'
import { parseTransactions } from './services/expense-import'
import { readImageSize } from './services/image'
import { buildCvHtml } from './services/cv'

const DEFAULT_CURRENCY = 'EUR'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/** Normalise a transaction description into a merchant-ish key for grouping. */
function normalizeDesc(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-zà-ÿ ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ')
}

export function registerIpc(win: BrowserWindow): void {
  const handle = (channel: string, fn: (...a: any[]) => unknown): void => {
    ipcMain.handle(channel, (_e, ...args: unknown[]) => fn(...args))
  }

  /* ----------------------------- Settings ----------------------------- */
  handle('getSettings', () => toSettings())

  handle('updateSettings', (patch: { displayName?: string; onboardingComplete?: boolean; ai?: { enabled?: boolean; model?: string } }) => {
    const update: Record<string, unknown> = {}
    if (patch.displayName !== undefined) update.displayName = patch.displayName
    if (patch.onboardingComplete !== undefined) update.onboardingComplete = patch.onboardingComplete
    if (patch.ai?.enabled !== undefined) update.aiEnabled = patch.ai.enabled
    if (patch.ai?.model !== undefined) update.aiModel = patch.ai.model
    return updateConfig(update)
  })

  handle('setApiKey', (key: string) => saveApiKey(key))
  handle('clearApiKey', () => clearApiKey())
  handle('testAi', () => testConnection())

  handle('chooseVaultFolder', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose your LifeHQ vault folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const settings = setVaultPath(res.filePaths[0])
    initDb(getVaultPath())
    ensureVaultDirs()
    return settings
  })

  handle('openVaultFolder', () => {
    shell.openPath(getVaultPath())
  })

  handle('backupVault', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose where to save your LifeHQ backup',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    persist() // flush latest data to disk first
    const stamp = new Date().toISOString().replace(/:/g, '-').replace('T', '_').slice(0, 16)
    const dest = join(res.filePaths[0], `LifeHQ-Backup-${stamp}`)
    cpSync(getVaultPath(), dest, { recursive: true })
    return { path: dest }
  })

  /* ----------------------------- Files / Sorter ----------------------------- */
  handle('listFiles', (filter?: FileFilter) => {
    let files = [...db().files]
    if (filter?.categoryId) files = files.filter((f) => f.categoryId === filter.categoryId)
    if (filter?.search) {
      const q = filter.search.toLowerCase()
      files = files.filter(
        (f) => f.originalName.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return files.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
  })

  async function importPaths(paths: string[]): Promise<ImportResult> {
    ensureVaultDirs()
    const imported: SortedFile[] = []
    const failed: { name: string; error: string }[] = []
    for (const p of paths) {
      const name = basename(p)
      try {
        const ext = extname(name).replace('.', '').toLowerCase()
        const result = await classifyFile(name, ext, db().fileCategories)
        const stored = storeFile(p, result.categoryId, name)
        const record: SortedFile = {
          id: newId(),
          originalName: name,
          storedName: stored.storedName,
          vaultRelPath: stored.vaultRelPath,
          categoryId: result.categoryId,
          ext: stored.ext,
          size: stored.size,
          tags: result.suggestedTags ?? [],
          confidence: result.confidence,
          method: result.method,
          reason: result.reason,
          importedAt: new Date().toISOString(),
          sourcePath: p
        }
        db().files.push(record)
        imported.push(record)
      } catch (e) {
        failed.push({ name, error: e instanceof Error ? e.message : 'Failed to import' })
      }
    }
    save()
    return { imported, failed }
  }

  handle('importFilePaths', (paths: string[]) => importPaths(paths))

  handle('importFilesDialog', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Drop files into the sorter',
      properties: ['openFile', 'multiSelections']
    })
    if (res.canceled) return { imported: [], failed: [] } as ImportResult
    return importPaths(res.filePaths)
  })

  handle('reclassifyFile', async (id: string) => {
    const f = db().files.find((x) => x.id === id)
    if (!f) throw new Error('File not found')
    const result = await classifyFile(f.originalName, f.ext, db().fileCategories)
    if (result.categoryId !== f.categoryId) {
      f.vaultRelPath = moveFileToCategory(f.vaultRelPath, result.categoryId, f.storedName)
      f.categoryId = result.categoryId
    }
    f.confidence = result.confidence
    f.method = result.method
    f.reason = result.reason
    save()
    return f
  })

  handle('updateFile', (id: string, patch: Partial<Pick<SortedFile, 'categoryId' | 'tags' | 'note'>>) => {
    const f = db().files.find((x) => x.id === id)
    if (!f) throw new Error('File not found')
    if (patch.categoryId && patch.categoryId !== f.categoryId) {
      f.vaultRelPath = moveFileToCategory(f.vaultRelPath, patch.categoryId, f.storedName)
      f.categoryId = patch.categoryId
      f.method = 'manual'
      f.confidence = 1
      f.reason = 'Sorted manually'
    }
    if (patch.tags) f.tags = patch.tags
    if (patch.note !== undefined) f.note = patch.note
    save()
    return f
  })

  handle('deleteFile', (id: string) => {
    const f = db().files.find((x) => x.id === id)
    if (f) {
      deleteVaultFile(f.vaultRelPath)
      db().files = db().files.filter((x) => x.id !== id)
      save()
    }
  })

  handle('openFile', (id: string) => {
    const f = db().files.find((x) => x.id === id)
    if (f) shell.openPath(absPath(f.vaultRelPath))
  })

  handle('revealFile', (id: string) => {
    const f = db().files.find((x) => x.id === id)
    if (f) shell.showItemInFolder(absPath(f.vaultRelPath))
  })

  handle('listFileCategories', () => db().fileCategories)

  handle('saveFileCategory', (cat: Partial<FileCategory> & { name: string }) => {
    if (cat.id) {
      const existing = db().fileCategories.find((c) => c.id === cat.id)
      if (existing) {
        Object.assign(existing, cat)
        save()
        return existing
      }
    }
    const created: FileCategory = {
      id: newId(),
      name: cat.name,
      color: cat.color ?? '#64748b',
      icon: cat.icon ?? 'Box',
      description: cat.description,
      keywords: cat.keywords ?? [],
      extensions: cat.extensions ?? []
    }
    db().fileCategories.push(created)
    save()
    return created
  })

  handle('deleteFileCategory', (id: string) => {
    const cat = db().fileCategories.find((c) => c.id === id)
    if (!cat || cat.builtin) throw new Error('Built-in categories cannot be deleted')
    db().files.forEach((f) => {
      if (f.categoryId === id) {
        f.vaultRelPath = moveFileToCategory(f.vaultRelPath, 'other', f.storedName)
        f.categoryId = 'other'
      }
    })
    db().fileCategories = db().fileCategories.filter((c) => c.id !== id)
    save()
  })

  /* ----------------------------- Achievements ----------------------------- */
  handle('listAchievements', () =>
    [...db().achievements].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  )

  handle('saveAchievement', (a: Partial<Achievement> & { title: string }) => {
    if (a.id) {
      const ex = db().achievements.find((x) => x.id === a.id)
      if (ex) {
        Object.assign(ex, a)
        save()
        return ex
      }
    }
    const created: Achievement = {
      id: newId(),
      title: a.title,
      type: a.type ?? 'other',
      organization: a.organization,
      date: a.date ?? new Date().toISOString().slice(0, 10),
      endDate: a.endDate,
      description: a.description,
      skills: a.skills ?? [],
      link: a.link,
      attachmentFileId: a.attachmentFileId,
      createdAt: new Date().toISOString()
    }
    db().achievements.push(created)
    save()
    return created
  })

  handle('deleteAchievement', (id: string) => {
    db().achievements = db().achievements.filter((x) => x.id !== id)
    save()
  })

  /* ----------------------------- Goals ----------------------------- */
  handle('listGoals', () =>
    [...db().goals].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  )

  handle('saveGoal', (g: Partial<Goal> & { title: string }) => {
    if (g.id) {
      const ex = db().goals.find((x) => x.id === g.id)
      if (ex) {
        Object.assign(ex, g)
        save()
        return ex
      }
    }
    const created: Goal = {
      id: newId(),
      title: g.title,
      category: g.category ?? 'personal',
      description: g.description,
      unit: g.unit,
      currentValue: g.currentValue ?? 0,
      targetValue: g.targetValue,
      status: g.status ?? 'active',
      dueDate: g.dueDate,
      milestones: g.milestones ?? [],
      createdAt: new Date().toISOString()
    }
    db().goals.push(created)
    save()
    return created
  })

  handle('deleteGoal', (id: string) => {
    db().goals = db().goals.filter((x) => x.id !== id)
    save()
  })

  /* ----------------------------- Fitness ----------------------------- */
  handle('listFitnessLogs', () =>
    [...db().fitnessLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  )

  handle('saveFitnessLog', (l: Partial<FitnessLog> & { activity: string; value: number }) => {
    if (l.id) {
      const ex = db().fitnessLogs.find((x) => x.id === l.id)
      if (ex) {
        Object.assign(ex, l)
        save()
        return ex
      }
    }
    const created: FitnessLog = {
      id: newId(),
      date: l.date ?? new Date().toISOString().slice(0, 10),
      activity: l.activity,
      metricLabel: l.metricLabel ?? 'value',
      value: l.value,
      unit: l.unit ?? '',
      note: l.note,
      goalId: l.goalId
    }
    db().fitnessLogs.push(created)
    save()
    return created
  })

  handle('deleteFitnessLog', (id: string) => {
    db().fitnessLogs = db().fitnessLogs.filter((x) => x.id !== id)
    save()
  })

  /* ----------------------------- Expenses ----------------------------- */
  handle('listExpenses', (filter?: ExpenseFilter) => {
    let xs = [...db().expenses]
    if (filter?.categoryId) xs = xs.filter((e) => e.categoryId === filter.categoryId)
    if (filter?.month) xs = xs.filter((e) => e.date.startsWith(filter.month!))
    if (filter?.search) {
      const q = filter.search.toLowerCase()
      xs = xs.filter((e) => e.description.toLowerCase().includes(q))
    }
    return xs.sort((a, b) => b.date.localeCompare(a.date))
  })

  handle('saveExpense', (e: Partial<Expense> & { description: string; amount: number; date: string }) => {
    if (e.id) {
      const ex = db().expenses.find((x) => x.id === e.id)
      if (ex) {
        Object.assign(ex, e)
        save()
        return ex
      }
    }
    let categoryId = e.categoryId
    let method = e.method ?? 'manual'
    if (!categoryId) {
      const r = classifyExpenseByRules(e.description, e.amount, db().expenseCategories)
      categoryId = r.categoryId
      method = r.method
    }
    const created: Expense = {
      id: newId(),
      date: e.date,
      description: e.description,
      merchant: e.merchant,
      amount: e.amount,
      currency: e.currency ?? DEFAULT_CURRENCY,
      categoryId,
      method,
      account: e.account,
      note: e.note,
      source: e.source ?? 'manual',
      importedAt: new Date().toISOString()
    }
    db().expenses.push(created)
    save()
    return created
  })

  handle('deleteExpense', (id: string) => {
    db().expenses = db().expenses.filter((x) => x.id !== id)
    save()
  })

  function buildPreview(text: string): ExpenseImportPreviewRow[] {
    const txns = parseTransactions(text)
    return txns.map((t) => {
      const r = classifyExpenseByRules(t.description, t.amount, db().expenseCategories)
      return {
        date: t.date,
        description: t.description,
        amount: t.amount,
        categoryId: r.categoryId,
        confidence: r.confidence,
        method: r.method
      }
    })
  }

  handle('parseExpensesText', (text: string) => buildPreview(text))

  handle('importExpensesDialog', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Import bank statement (CSV)',
      properties: ['openFile'],
      filters: [{ name: 'CSV / Text', extensions: ['csv', 'tsv', 'txt'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { preview: [], raw: '' }
    const fs = await import('fs')
    const raw = fs.readFileSync(res.filePaths[0], 'utf-8')
    return { preview: buildPreview(raw), raw }
  })

  handle('commitExpenseImport', (rows: ExpenseImportPreviewRow[]) => {
    const created: Expense[] = rows.map((r) => ({
      id: newId(),
      date: r.date,
      description: r.description,
      amount: r.amount,
      currency: DEFAULT_CURRENCY,
      categoryId: r.categoryId,
      method: r.method,
      source: 'import' as const,
      importedAt: new Date().toISOString()
    }))
    db().expenses.push(...created)
    save()
    return created
  })

  handle('listExpenseCategories', () => db().expenseCategories)

  handle('saveExpenseCategory', (c: Partial<ExpenseCategory> & { name: string }) => {
    if (c.id) {
      const ex = db().expenseCategories.find((x) => x.id === c.id)
      if (ex) {
        Object.assign(ex, c)
        save()
        return ex
      }
    }
    const created: ExpenseCategory = {
      id: newId(),
      name: c.name,
      color: c.color ?? '#64748b',
      icon: c.icon ?? 'CircleDollarSign',
      keywords: c.keywords ?? [],
      budgetMonthly: c.budgetMonthly
    }
    db().expenseCategories.push(created)
    save()
    return created
  })

  handle('deleteExpenseCategory', (id: string) => {
    const cat = db().expenseCategories.find((c) => c.id === id)
    if (!cat || cat.builtin) throw new Error('Built-in categories cannot be deleted')
    db().expenses.forEach((e) => {
      if (e.categoryId === id) e.categoryId = 'other-exp'
    })
    db().expenseCategories = db().expenseCategories.filter((c) => c.id !== id)
    save()
  })

  handle('expenseSummary', (month?: string): ExpenseSummary => {
    let xs = db().expenses
    if (month) xs = xs.filter((e) => e.date.startsWith(month))
    const byCatMap = new Map<string, { total: number; count: number }>()
    const byMonthMap = new Map<string, number>()
    let total = 0
    for (const e of xs) {
      const spend = e.categoryId === 'income' ? 0 : Math.abs(e.amount)
      const cur = byCatMap.get(e.categoryId) ?? { total: 0, count: 0 }
      cur.total += Math.abs(e.amount)
      cur.count += 1
      byCatMap.set(e.categoryId, cur)
      if (spend > 0) {
        const m = e.date.slice(0, 7)
        byMonthMap.set(m, (byMonthMap.get(m) ?? 0) + spend)
        total += spend
      }
    }
    return {
      total,
      currency: DEFAULT_CURRENCY,
      count: xs.length,
      byCategory: [...byCatMap.entries()]
        .map(([categoryId, v]) => ({ categoryId, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total),
      byMonth: [...byMonthMap.entries()]
        .map(([m, t]) => ({ month: m, total: t }))
        .sort((a, b) => a.month.localeCompare(b.month))
    }
  })

  handle('detectRecurring', (): RecurringItem[] => {
    const groups = new Map<string, { items: Expense[]; sample: string }>()
    for (const e of db().expenses) {
      if (e.categoryId === 'income') continue
      const key = normalizeDesc(e.description)
      if (key.length < 3) continue
      const g = groups.get(key) ?? { items: [], sample: e.description }
      g.items.push(e)
      groups.set(key, g)
    }
    const out: RecurringItem[] = []
    for (const [key, g] of groups) {
      const months = new Set(g.items.map((i) => i.date.slice(0, 7)))
      if (g.items.length < 3 || months.size < 3) continue
      const amounts = g.items.map((i) => Math.abs(i.amount))
      const monthly = amounts.reduce((s, a) => s + a, 0) / amounts.length
      // most common category in the group
      const catCount = new Map<string, number>()
      g.items.forEach((i) => catCount.set(i.categoryId, (catCount.get(i.categoryId) ?? 0) + 1))
      const categoryId = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const lastDate = g.items.map((i) => i.date).sort().at(-1) ?? ''
      out.push({ key, description: g.sample, categoryId, monthly, count: g.items.length, months: months.size, lastDate })
    }
    return out.sort((a, b) => b.monthly - a.monthly)
  })

  /* ----------------------------- Photos / World ----------------------------- */
  handle('listPhotos', () =>
    [...db().photos].sort((a, b) => b.importedAt.localeCompare(a.importedAt))
  )

  async function importPhotoPaths(paths: string[]): Promise<Photo[]> {
    ensureVaultDirs()
    const created: Photo[] = []
    for (const p of paths) {
      const name = basename(p)
      try {
        const stored = storePhoto(p, name)
        const dims = readImageSize(absPath(stored.vaultRelPath))
        const photo: Photo = {
          id: newId(),
          fileName: stored.storedName,
          vaultRelPath: stored.vaultRelPath,
          importedAt: new Date().toISOString(),
          tags: [],
          width: dims?.width,
          height: dims?.height
        }
        db().photos.push(photo)
        created.push(photo)
      } catch {
        // skip unreadable files
      }
    }
    save()
    return created
  }

  handle('importPhotoPaths', (paths: string[]) => importPhotoPaths(paths))

  handle('importPhotosDialog', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Import photos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
    })
    if (res.canceled) return []
    return importPhotoPaths(res.filePaths)
  })

  handle('updatePhoto', (id: string, patch: Partial<Pick<Photo, 'caption' | 'tags' | 'takenAt'>>) => {
    const p = db().photos.find((x) => x.id === id)
    if (!p) throw new Error('Photo not found')
    Object.assign(p, patch)
    save()
    return p
  })

  handle('deletePhoto', (id: string) => {
    const p = db().photos.find((x) => x.id === id)
    if (p) {
      deleteVaultFile(p.vaultRelPath)
      db().photos = db().photos.filter((x) => x.id !== id)
      db().photoBlocks = db().photoBlocks.filter((b) => b.photoId !== id)
      save()
    }
  })

  handle('listPhotoBlocks', () => db().photoBlocks)

  handle('placePhotoBlock', (b: { photoId: string; x: number; y: number; z: number; regionLabel?: string }) => {
    const block: PhotoBlock = {
      id: newId(),
      photoId: b.photoId,
      x: b.x,
      y: b.y,
      z: b.z,
      regionLabel: b.regionLabel,
      createdAt: new Date().toISOString()
    }
    db().photoBlocks.push(block)
    save()
    return block
  })

  handle('removePhotoBlock', (id: string) => {
    db().photoBlocks = db().photoBlocks.filter((b) => b.id !== id)
    save()
  })

  handle('listRegions', () => db().regions)

  handle('saveRegion', (r: Partial<WorldRegion> & { name: string }) => {
    if (r.id) {
      const ex = db().regions.find((x) => x.id === r.id)
      if (ex) {
        Object.assign(ex, r)
        save()
        return ex
      }
    }
    const created: WorldRegion = {
      id: newId(),
      name: r.name,
      color: r.color ?? '#7cc576',
      description: r.description,
      centerX: r.centerX ?? 0,
      centerZ: r.centerZ ?? 0
    }
    db().regions.push(created)
    save()
    return created
  })

  handle('deleteRegion', (id: string) => {
    db().regions = db().regions.filter((r) => r.id !== id)
    save()
  })

  /* ----------------------------- Journal ----------------------------- */
  handle('listJournal', () =>
    [...db().journal].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  )

  handle('saveJournal', (e: Partial<JournalEntry> & { body: string }) => {
    if (e.id) {
      const ex = db().journal.find((x) => x.id === e.id)
      if (ex) {
        Object.assign(ex, e, { updatedAt: new Date().toISOString() })
        save()
        return ex
      }
    }
    const now = new Date().toISOString()
    const created: JournalEntry = {
      id: newId(),
      date: e.date ?? now.slice(0, 10),
      title: e.title,
      body: e.body,
      mood: e.mood,
      tags: e.tags ?? [],
      createdAt: now,
      updatedAt: now
    }
    db().journal.push(created)
    save()
    return created
  })

  handle('deleteJournal', (id: string) => {
    db().journal = db().journal.filter((x) => x.id !== id)
    save()
  })

  /* ----------------------------- Dashboard ----------------------------- */
  handle('getDashboardStats', (): DashboardStats => {
    const d = db()
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const month = currentMonth()
    const expensesThisMonth = d.expenses
      .filter((e) => e.date.startsWith(month) && e.categoryId !== 'income')
      .reduce((s, e) => s + Math.abs(e.amount), 0)
    const monthlyBudget = d.expenseCategories.reduce((s, c) => s + (c.budgetMonthly ?? 0), 0)
    const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const goalsDueSoon = d.goals
      .filter((g) => g.status === 'active' && g.dueDate && g.dueDate >= today && g.dueDate <= in14)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    const recentJournal = [...d.journal].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] ?? null
    return {
      filesCount: d.files.length,
      achievementsCount: d.achievements.length,
      activeGoals: d.goals.filter((g) => g.status === 'active').length,
      goalsDone: d.goals.filter((g) => g.status === 'done').length,
      fitnessLogsThisWeek: d.fitnessLogs.filter((l) => l.date >= weekAgo).length,
      photosCount: d.photos.length,
      expensesThisMonth,
      expensesCurrency: DEFAULT_CURRENCY,
      monthlyBudget,
      filesToReview: d.files.filter((f) => f.confidence < 0.55).length,
      journalCount: d.journal.length,
      recentFiles: [...d.files].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 5),
      recentAchievements: [...d.achievements].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5),
      topGoals: d.goals.filter((g) => g.status === 'active').slice(0, 4),
      goalsDueSoon,
      recentJournal
    }
  })

  /* ----------------------------- Export ----------------------------- */
  handle('exportCv', async () => {
    const html = buildCvHtml(getConfig().displayName, db().achievements)
    const tmp = join(app.getPath('temp'), `lifehq-cv-${Date.now()}.html`)
    writeFileSync(tmp, html, 'utf-8')
    const win = new BrowserWindow({ show: false })
    try {
      await win.loadFile(tmp)
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
      })
      const outPath = join(getVaultPath(), 'LifeHQ-CV.pdf')
      writeFileSync(outPath, pdf)
      shell.openPath(outPath)
      return { path: outPath }
    } finally {
      win.destroy()
      rmSync(tmp, { force: true })
    }
  })
}

export function flushOnQuit(): void {
  persist()
}
