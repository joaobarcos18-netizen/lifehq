import { app, BrowserWindow, dialog, net, protocol, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { initConfig, getVaultPath } from './store/config'
import { initDb } from './store/db'
import { ensureVaultDirs, absPath } from './services/vault'
import { flushOnQuit, registerIpc } from './ipc'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lifehq',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

let mainWindow: BrowserWindow | null = null

function resolveIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(__dirname, '../../build/icon.ico')
  ]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): void {
  const icon = resolveIcon()
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d1119',
    title: 'LifeHQ',
    ...(icon ? { icon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Identify as LifeHQ in the Windows taskbar / notifications.
  if (process.platform === 'win32') app.setAppUserModelId('com.joao.lifehq')

  // Boot config + data store + vault folders.
  initConfig()
  initDb(getVaultPath())
  ensureVaultDirs()

  // Serve vault files (photos, attachments) to the renderer via lifehq://vault/<relpath>
  protocol.handle('lifehq', (request) => {
    try {
      const url = new URL(request.url)
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const abs = absPath(rel)
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()
  registerIpc(mainWindow!)
  setupAutoUpdates()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function setupAutoUpdates(): void {
  // Only the installed/packaged build checks GitHub Releases for updates.
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        title: 'Update ready',
        message: `LifeHQ ${info.version} is ready to install`,
        detail: 'Restart LifeHQ to apply the update. Your data is untouched.'
      })
      .then((r) => {
        if (r.response === 0) autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.on('error', (e) => console.error('auto-update error:', e?.message ?? e))
  autoUpdater.checkForUpdatesAndNotify().catch(() => {})
}

app.on('window-all-closed', () => {
  flushOnQuit()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => flushOnQuit())
