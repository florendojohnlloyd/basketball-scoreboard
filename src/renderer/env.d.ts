/// <reference types="vite/client" />

/**
 * Type declarations for the contextBridge API exposed by the preload script.
 * Matches the shape defined in src/preload/index.ts.
 */
interface ElectronIpcRenderer {
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (...args: unknown[]) => void): void
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  removeAllListeners(channel: string): void
}

declare global {
  interface Window {
    electron: {
      ipcRenderer: ElectronIpcRenderer
    }
  }
}

export {}
