import { contextBridge, ipcRenderer } from 'electron'
import type { LifeHqApi } from '@shared/types'

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
  ipcRenderer.invoke(channel, ...args)

const api: LifeHqApi = {
  // settings
  getSettings: () => invoke('getSettings') as Promise<never>,
  updateSettings: (patch) => invoke('updateSettings', patch) as Promise<never>,
  setApiKey: (key) => invoke('setApiKey', key) as Promise<never>,
  clearApiKey: () => invoke('clearApiKey') as Promise<never>,
  testAi: () => invoke('testAi') as Promise<never>,
  chooseVaultFolder: () => invoke('chooseVaultFolder') as Promise<never>,
  openVaultFolder: () => invoke('openVaultFolder') as Promise<never>,
  backupVault: () => invoke('backupVault') as Promise<never>,

  // files
  listFiles: (filter) => invoke('listFiles', filter) as Promise<never>,
  importFilesDialog: () => invoke('importFilesDialog') as Promise<never>,
  importFilePaths: (paths) => invoke('importFilePaths', paths) as Promise<never>,
  reclassifyFile: (id) => invoke('reclassifyFile', id) as Promise<never>,
  updateFile: (id, patch) => invoke('updateFile', id, patch) as Promise<never>,
  deleteFile: (id) => invoke('deleteFile', id) as Promise<never>,
  openFile: (id) => invoke('openFile', id) as Promise<never>,
  revealFile: (id) => invoke('revealFile', id) as Promise<never>,
  listFileCategories: () => invoke('listFileCategories') as Promise<never>,
  saveFileCategory: (cat) => invoke('saveFileCategory', cat) as Promise<never>,
  deleteFileCategory: (id) => invoke('deleteFileCategory', id) as Promise<never>,

  // achievements
  listAchievements: () => invoke('listAchievements') as Promise<never>,
  saveAchievement: (a) => invoke('saveAchievement', a) as Promise<never>,
  deleteAchievement: (id) => invoke('deleteAchievement', id) as Promise<never>,

  // goals
  listGoals: () => invoke('listGoals') as Promise<never>,
  saveGoal: (g) => invoke('saveGoal', g) as Promise<never>,
  deleteGoal: (id) => invoke('deleteGoal', id) as Promise<never>,

  // fitness
  listFitnessLogs: () => invoke('listFitnessLogs') as Promise<never>,
  saveFitnessLog: (l) => invoke('saveFitnessLog', l) as Promise<never>,
  deleteFitnessLog: (id) => invoke('deleteFitnessLog', id) as Promise<never>,

  // expenses
  listExpenses: (filter) => invoke('listExpenses', filter) as Promise<never>,
  saveExpense: (e) => invoke('saveExpense', e) as Promise<never>,
  deleteExpense: (id) => invoke('deleteExpense', id) as Promise<never>,
  importExpensesDialog: () => invoke('importExpensesDialog') as Promise<never>,
  parseExpensesText: (text) => invoke('parseExpensesText', text) as Promise<never>,
  commitExpenseImport: (rows) => invoke('commitExpenseImport', rows) as Promise<never>,
  listExpenseCategories: () => invoke('listExpenseCategories') as Promise<never>,
  saveExpenseCategory: (c) => invoke('saveExpenseCategory', c) as Promise<never>,
  deleteExpenseCategory: (id) => invoke('deleteExpenseCategory', id) as Promise<never>,
  expenseSummary: (month) => invoke('expenseSummary', month) as Promise<never>,
  detectRecurring: () => invoke('detectRecurring') as Promise<never>,

  // photos / world
  listPhotos: () => invoke('listPhotos') as Promise<never>,
  importPhotosDialog: () => invoke('importPhotosDialog') as Promise<never>,
  importPhotoPaths: (paths) => invoke('importPhotoPaths', paths) as Promise<never>,
  updatePhoto: (id, patch) => invoke('updatePhoto', id, patch) as Promise<never>,
  deletePhoto: (id) => invoke('deletePhoto', id) as Promise<never>,
  listPhotoBlocks: () => invoke('listPhotoBlocks') as Promise<never>,
  placePhotoBlock: (b) => invoke('placePhotoBlock', b) as Promise<never>,
  removePhotoBlock: (id) => invoke('removePhotoBlock', id) as Promise<never>,
  listRegions: () => invoke('listRegions') as Promise<never>,
  saveRegion: (r) => invoke('saveRegion', r) as Promise<never>,
  deleteRegion: (id) => invoke('deleteRegion', id) as Promise<never>,

  // journal
  listJournal: () => invoke('listJournal') as Promise<never>,
  saveJournal: (e) => invoke('saveJournal', e) as Promise<never>,
  deleteJournal: (id) => invoke('deleteJournal', id) as Promise<never>,

  // dashboard
  getDashboardStats: () => invoke('getDashboardStats') as Promise<never>,

  // export
  exportCv: () => invoke('exportCv') as Promise<never>
}

contextBridge.exposeInMainWorld('api', api)
