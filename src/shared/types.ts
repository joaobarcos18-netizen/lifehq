/**
 * Shared domain + IPC contract for LifeHQ.
 * This is the single source of truth used by main, preload and renderer.
 */

/* ----------------------------- Settings ----------------------------- */

export interface AiSettings {
  enabled: boolean
  hasKey: boolean
  model: string
}

export interface Settings {
  vaultPath: string
  theme: 'dark'
  onboardingComplete: boolean
  ai: AiSettings
  displayName: string
}

/* ----------------------------- Files / Sorter ----------------------------- */

export type ClassifyMethod = 'rule' | 'ai' | 'manual'

export interface FileCategory {
  id: string
  name: string
  color: string
  icon: string
  description?: string
  keywords: string[]
  extensions: string[]
  builtin?: boolean
}

export interface SortedFile {
  id: string
  originalName: string
  storedName: string
  vaultRelPath: string
  categoryId: string
  ext: string
  size: number
  tags: string[]
  note?: string
  confidence: number
  method: ClassifyMethod
  reason?: string
  importedAt: string
  sourcePath?: string
}

export interface ImportResult {
  imported: SortedFile[]
  failed: { name: string; error: string }[]
}

export interface ClassificationResult {
  categoryId: string
  confidence: number
  method: ClassifyMethod
  reason?: string
  suggestedTags?: string[]
}

/* ----------------------------- Achievements ----------------------------- */

export type AchievementType =
  | 'academic'
  | 'professional'
  | 'training'
  | 'certification'
  | 'award'
  | 'project'
  | 'other'

export interface Achievement {
  id: string
  title: string
  type: AchievementType
  organization?: string
  date: string
  endDate?: string
  description?: string
  skills: string[]
  link?: string
  attachmentFileId?: string
  createdAt: string
}

/* ----------------------------- Goals ----------------------------- */

export type GoalCategory =
  | 'fitness'
  | 'health'
  | 'career'
  | 'learning'
  | 'finance'
  | 'personal'

export type GoalStatus = 'active' | 'done' | 'paused' | 'archived'

export interface Milestone {
  id: string
  title: string
  done: boolean
  date?: string
}

export interface Goal {
  id: string
  title: string
  category: GoalCategory
  description?: string
  unit?: string
  currentValue: number
  targetValue?: number
  status: GoalStatus
  dueDate?: string
  milestones: Milestone[]
  createdAt: string
}

/* ----------------------------- Fitness ----------------------------- */

export interface FitnessLog {
  id: string
  date: string
  activity: string
  metricLabel: string
  value: number
  unit: string
  note?: string
  goalId?: string
}

/* ----------------------------- Expenses ----------------------------- */

export interface ExpenseCategory {
  id: string
  name: string
  color: string
  icon: string
  keywords: string[]
  budgetMonthly?: number
  builtin?: boolean
}

export interface Expense {
  id: string
  date: string
  description: string
  merchant?: string
  amount: number
  currency: string
  categoryId: string
  method: ClassifyMethod
  account?: string
  note?: string
  source: 'manual' | 'import'
  importedAt: string
}

export interface ExpenseImportPreviewRow {
  date: string
  description: string
  amount: number
  merchant?: string
  categoryId: string
  confidence: number
  method: ClassifyMethod
}

export interface ExpenseSummary {
  total: number
  currency: string
  byCategory: { categoryId: string; total: number; count: number }[]
  byMonth: { month: string; total: number }[]
  count: number
}

export interface RecurringItem {
  key: string
  description: string
  categoryId: string
  monthly: number
  count: number
  months: number
  lastDate: string
}

/* ----------------------------- Photos / 3D World ----------------------------- */

export interface Photo {
  id: string
  fileName: string
  vaultRelPath: string
  caption?: string
  takenAt?: string
  importedAt: string
  tags: string[]
  width?: number
  height?: number
}

export interface PhotoBlock {
  id: string
  photoId: string
  x: number
  y: number
  z: number
  regionLabel?: string
  note?: string
  createdAt: string
}

export interface WorldRegion {
  id: string
  name: string
  color: string
  description?: string
  centerX: number
  centerZ: number
}

/* ----------------------------- Dashboard ----------------------------- */

export interface DashboardStats {
  filesCount: number
  achievementsCount: number
  activeGoals: number
  goalsDone: number
  fitnessLogsThisWeek: number
  photosCount: number
  expensesThisMonth: number
  expensesCurrency: string
  recentFiles: SortedFile[]
  recentAchievements: Achievement[]
  topGoals: Goal[]
}

/* ----------------------------- Filters ----------------------------- */

export interface FileFilter {
  categoryId?: string
  search?: string
}

export interface ExpenseFilter {
  categoryId?: string
  month?: string
  search?: string
}

/* ----------------------------- IPC API ----------------------------- */

export interface LifeHqApi {
  // settings
  getSettings(): Promise<Settings>
  updateSettings(patch: { displayName?: string; onboardingComplete?: boolean; ai?: Partial<AiSettings> }): Promise<Settings>
  setApiKey(key: string): Promise<Settings>
  clearApiKey(): Promise<Settings>
  testAi(): Promise<{ ok: boolean; message: string }>
  chooseVaultFolder(): Promise<Settings | null>
  openVaultFolder(): Promise<void>
  backupVault(): Promise<{ path: string } | null>

  // files / sorter
  listFiles(filter?: FileFilter): Promise<SortedFile[]>
  importFilesDialog(): Promise<ImportResult>
  importFilePaths(paths: string[]): Promise<ImportResult>
  reclassifyFile(id: string): Promise<SortedFile>
  updateFile(id: string, patch: Partial<Pick<SortedFile, 'categoryId' | 'tags' | 'note'>>): Promise<SortedFile>
  deleteFile(id: string): Promise<void>
  openFile(id: string): Promise<void>
  revealFile(id: string): Promise<void>
  listFileCategories(): Promise<FileCategory[]>
  saveFileCategory(cat: Partial<FileCategory> & { name: string }): Promise<FileCategory>
  deleteFileCategory(id: string): Promise<void>

  // achievements
  listAchievements(): Promise<Achievement[]>
  saveAchievement(a: Partial<Achievement> & { title: string; type: AchievementType; date: string }): Promise<Achievement>
  deleteAchievement(id: string): Promise<void>

  // goals
  listGoals(): Promise<Goal[]>
  saveGoal(g: Partial<Goal> & { title: string; category: GoalCategory }): Promise<Goal>
  deleteGoal(id: string): Promise<void>

  // fitness
  listFitnessLogs(): Promise<FitnessLog[]>
  saveFitnessLog(l: Partial<FitnessLog> & { activity: string; value: number }): Promise<FitnessLog>
  deleteFitnessLog(id: string): Promise<void>

  // expenses
  listExpenses(filter?: ExpenseFilter): Promise<Expense[]>
  saveExpense(e: Partial<Expense> & { description: string; amount: number; date: string }): Promise<Expense>
  deleteExpense(id: string): Promise<void>
  importExpensesDialog(): Promise<{ preview: ExpenseImportPreviewRow[]; raw: string }>
  parseExpensesText(text: string): Promise<ExpenseImportPreviewRow[]>
  commitExpenseImport(rows: ExpenseImportPreviewRow[]): Promise<Expense[]>
  listExpenseCategories(): Promise<ExpenseCategory[]>
  saveExpenseCategory(c: Partial<ExpenseCategory> & { name: string }): Promise<ExpenseCategory>
  deleteExpenseCategory(id: string): Promise<void>
  expenseSummary(month?: string): Promise<ExpenseSummary>
  detectRecurring(): Promise<RecurringItem[]>

  // photos / world
  listPhotos(): Promise<Photo[]>
  importPhotosDialog(): Promise<Photo[]>
  importPhotoPaths(paths: string[]): Promise<Photo[]>
  updatePhoto(id: string, patch: Partial<Pick<Photo, 'caption' | 'tags' | 'takenAt'>>): Promise<Photo>
  deletePhoto(id: string): Promise<void>
  listPhotoBlocks(): Promise<PhotoBlock[]>
  placePhotoBlock(b: { photoId: string; x: number; y: number; z: number; regionLabel?: string }): Promise<PhotoBlock>
  removePhotoBlock(id: string): Promise<void>
  listRegions(): Promise<WorldRegion[]>
  saveRegion(r: Partial<WorldRegion> & { name: string }): Promise<WorldRegion>
  deleteRegion(id: string): Promise<void>

  // dashboard
  getDashboardStats(): Promise<DashboardStats>

  // export
  exportCv(): Promise<{ path: string }>
}
