import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload script — exposes safe IPC methods to renderer via contextBridge.
 * Full implementation in task 8 (Control Panel renderer shell).
 */
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => listener(...args))
    },
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
  }
})
