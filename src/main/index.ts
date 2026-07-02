/**
 * Main process entry point.
 *
 * Instantiation order:
 *  1. GameStore        — authoritative game state
 *  2. ClockEngine      — dispatches CLOCK_TICK commands into GameStore
 *  3. WindowManager    — creates and manages BrowserWindow instances
 *  4. PresetStore      — preset CRUD backed by electron-store
 *  5. IpcRouter        — wires all modules together via IPC
 */

import { app, protocol, net } from 'electron';
import { pathToFileURL } from 'url';
import { createGameStore } from './gameStore';
import { createClockEngine } from './clockEngine';
import { createWindowManager } from './windowManager';
import { createPresetStore } from './presetStore';
import { createIpcRouter } from './ipcRouter';

// ---------------------------------------------------------------------------
// Custom protocol: local-file://
// Allows the renderer to load arbitrary local image files without hitting
// Electron's default Content-Security-Policy restrictions on file:// URLs.
// Must be registered before app.whenReady().
// ---------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

// Module-level references so they can be disposed on quit
let clockEngineInstance: ReturnType<typeof createClockEngine> | null = null;
let windowManagerInstance: ReturnType<typeof createWindowManager> | null = null;

function bootstrap(): void {
  // 1. GameStore
  const gameStore = createGameStore();

  // 2. ClockEngine — uses gameStore.dispatch as its tick sink
  const clockEngine = createClockEngine((cmd) => gameStore.dispatch(cmd));
  clockEngineInstance = clockEngine;

  // 3. WindowManager
  const windowManager = createWindowManager();
  windowManagerInstance = windowManager;
  windowManager.createWindows();

  // 4. PresetStore — needs a getter for the Control Panel window so it can
  //    send PRESET_CORRUPTED events during list()
  const presetStore = createPresetStore(() => windowManager.getControlPanelWindow());

  // 5. IpcRouter — connects everything
  createIpcRouter(gameStore, clockEngine, windowManager, presetStore);
}

app.whenReady().then(() => {
  // Register the local-file:// protocol handler so the renderer can load
  // team logo images from the local filesystem.
  protocol.handle('local-file', (request) => {
    // Strip the scheme: "local-file:///C:/path/to/file.png" → "C:/path/to/file.png"
    const filePath = decodeURIComponent(request.url.replace(/^local-file:\/\/\//, ''));
    return net.fetch(pathToFileURL(filePath).toString());
  });

  bootstrap();

  // macOS: re-create windows when the dock icon is clicked and no windows exist
  app.on('activate', () => {
    if (windowManagerInstance) {
      const cp = windowManagerInstance.getControlPanelWindow();
      if (!cp || cp.isDestroyed()) {
        windowManagerInstance.createWindows();
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  clockEngineInstance?.dispose();
  windowManagerInstance?.dispose();
});
