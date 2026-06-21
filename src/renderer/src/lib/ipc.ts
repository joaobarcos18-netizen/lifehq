import type { LifeHqApi } from '@shared/types'

/** Typed handle to the main-process API exposed by the preload bridge. */
export const api: LifeHqApi = window.api
