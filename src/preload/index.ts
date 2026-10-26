import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload script — exposes safe IPC methods to renderer via contextBridge.
 * Full implementation in task 8 (Control Panel renderer shell).
 */
const listenerMap = new Map<Function, (_event: any, ...args: any[]) => void>()

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      const wrapper = (_event: any, ...args: any[]) => listener(...args)
      listenerMap.set(listener, wrapper)
      ipcRenderer.on(channel, wrapper)
      return () => {
        ipcRenderer.removeListener(channel, wrapper)
        listenerMap.delete(listener)
      }
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => {
      const wrapper = listenerMap.get(listener)
      if (wrapper) {
        ipcRenderer.removeListener(channel, wrapper)
        listenerMap.delete(listener)
      }
    },
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    removeAllListeners: (_channel: string) => {
      // Intentionally guarded: do NOT indiscriminately destroy listeners registered across components.
    }
  },
  openExternal: (url: string) => ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_EXTERNAL_URL', url })
})
