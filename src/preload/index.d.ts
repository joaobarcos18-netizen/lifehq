import type { LifeHqApi } from '@shared/types'

declare global {
  interface Window {
    api: LifeHqApi
  }
}

export {}
