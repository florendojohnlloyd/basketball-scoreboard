import * as fc from 'fast-check'

if (process.env.CI) {
  fc.configureGlobal({ seed: 42 })
}

if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  }
  if (!(window as any).electron) {
    (window as any).electron = {
      ipcRenderer: {
        on: () => {},
        send: () => {},
        invoke: async () => ({}),
        removeListener: () => {},
        removeAllListeners: () => {},
      },
    }
  } else if (!(window as any).electron.ipcRenderer?.removeAllListeners) {
    (window as any).electron.ipcRenderer.removeAllListeners = () => {}
  }
}
