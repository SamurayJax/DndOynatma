/// <reference types="vite/client" />
import type { DndApi } from '@shared/ipc'

declare global {
  interface Window {
    dnd: DndApi
  }
}

export {}
