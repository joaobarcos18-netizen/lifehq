import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { Settings } from '@shared/types'

interface StoredConfig {
  vaultPath: string
  displayName: string
  onboardingComplete: boolean
  aiEnabled: boolean
  aiModel: string
  encryptedKey?: string
  plainKey?: string
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

let configPath = ''
let cfg: StoredConfig

function defaultConfig(): StoredConfig {
  return {
    vaultPath: join(app.getPath('documents'), 'LifeHQ Vault'),
    displayName: '',
    onboardingComplete: false,
    aiEnabled: false,
    aiModel: DEFAULT_MODEL
  }
}

export function initConfig(): StoredConfig {
  configPath = join(app.getPath('userData'), 'config.json')
  if (existsSync(configPath)) {
    try {
      cfg = { ...defaultConfig(), ...JSON.parse(readFileSync(configPath, 'utf-8')) }
    } catch {
      cfg = defaultConfig()
    }
  } else {
    cfg = defaultConfig()
    writeConfig()
  }
  return cfg
}

function writeConfig(): void {
  if (!existsSync(dirname(configPath))) mkdirSync(dirname(configPath), { recursive: true })
  const tmp = configPath + '.tmp'
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8')
  renameSync(tmp, configPath)
}

export function getConfig(): StoredConfig {
  return cfg
}

export function getVaultPath(): string {
  return cfg.vaultPath
}

/** Public settings shape — never exposes the raw key. */
export function toSettings(): Settings {
  return {
    vaultPath: cfg.vaultPath,
    theme: 'dark',
    onboardingComplete: cfg.onboardingComplete,
    displayName: cfg.displayName,
    ai: {
      enabled: cfg.aiEnabled,
      hasKey: !!(cfg.encryptedKey || cfg.plainKey),
      model: cfg.aiModel
    }
  }
}

export function updateConfig(patch: Partial<StoredConfig>): Settings {
  cfg = { ...cfg, ...patch }
  writeConfig()
  return toSettings()
}

export function setVaultPath(p: string): Settings {
  cfg.vaultPath = p
  cfg.onboardingComplete = true
  writeConfig()
  return toSettings()
}

export function saveApiKey(key: string): Settings {
  const trimmed = key.trim()
  if (!trimmed) return clearApiKey()
  if (safeStorage.isEncryptionAvailable()) {
    cfg.encryptedKey = safeStorage.encryptString(trimmed).toString('base64')
    delete cfg.plainKey
  } else {
    cfg.plainKey = trimmed
    delete cfg.encryptedKey
  }
  cfg.aiEnabled = true
  writeConfig()
  return toSettings()
}

export function clearApiKey(): Settings {
  delete cfg.encryptedKey
  delete cfg.plainKey
  cfg.aiEnabled = false
  writeConfig()
  return toSettings()
}

/** Decrypt and return the raw key for outbound API calls (main process only). */
export function getApiKey(): string | null {
  if (cfg.encryptedKey && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(cfg.encryptedKey, 'base64'))
    } catch {
      return null
    }
  }
  return cfg.plainKey ?? null
}
