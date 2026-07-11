/**
 * Main process entry point — LigaControl V17.11
 *
 * Bootstrap order:
 *  1. GameStore        (with undo stack + event log)
 *  2. ClockEngine
 *  3. WindowManager
 *  4. PresetStore
 *  5. LigaStore
 *  6. AutosaveStore
 *  7. AuditStore
 *  8. IpcRouter
 */

import { app, protocol, net } from 'electron';
import { pathToFileURL } from 'url';
import { createGameStore } from './gameStore';
import { createClockEngine } from './clockEngine';
import { createWindowManager } from './windowManager';
import { createPresetStore } from './presetStore';
import { createLigaStore } from './ligaStore';
import { createAutosaveStore } from './autosaveStore';
import { createIpcRouter } from './ipcRouter';
import { createAuditStore } from './auditStore';
import { SCOREBOARD_EVENT } from '../shared/types';
import type { GameState } from '../shared/types';

protocol.registerSchemesAsPrivileged([{
  scheme: 'local-file',
  privileges: { secure: true, supportFetchAPI: true, corsEnabled: false },
}]);

let clockEngineInstance:  ReturnType<typeof createClockEngine>  | null = null;
let windowManagerInstance: ReturnType<typeof createWindowManager> | null = null;
let autosaveInstance:      ReturnType<typeof createAutosaveStore> | null = null;

function bootstrap(): void {
  // ── Check for autosave / crash recovery ──
  const autosaveStore = createAutosaveStore();
  autosaveInstance = autosaveStore;
  const savedState = autosaveStore.read();

  // 1. GameStore — restore from autosave if found
  let initialState = savedState ?? undefined;
  // Always clear timeout from autosave — timeouts are live-only, don't persist
  if (initialState?.timeout) {
    initialState = { ...initialState, timeout: null };
  }
  // Ensure new fields exist in restored state
  if (initialState && !initialState.sponsorLogos) {
    initialState = { ...initialState, sponsorLogos: [] };
  }
  if (initialState && !initialState.periodSnapshots) {
    initialState = { ...initialState, periodSnapshots: [] };
  }
  if (initialState && initialState.showPhotosOnScoreboard === undefined) {
    initialState = { ...initialState, showPhotosOnScoreboard: false };
  }
  // Patch missing timeout half-tracking fields from old saves
  if (initialState) {
    const patchTeam = (team: typeof initialState.home) => ({
      ...team,
      timeouts: {
        firstHalfUsed: 0,
        secondHalfUsed: 0,
        overtimeUsed: 0,
        ...team.timeouts,
      },
    });
    initialState = { ...initialState, home: patchTeam(initialState.home), away: patchTeam(initialState.away) };
  }
  const gameStore = createGameStore(initialState);

  // 2. ClockEngine
  let broadcastFn: ((prev: GameState, next: GameState) => void) = () => { /* noop */ };
  let clockEngineRef: ReturnType<typeof createClockEngine> | null = null;

  const clockEngine = createClockEngine((cmd) => {
    const prev = gameStore.getState();
    const next = gameStore.dispatch(cmd);
    broadcastFn(prev, next);
    autosaveStore.schedule(next);

    // Detect timeout expired — timeout was running, now stopped
    if (cmd.type === 'TIMEOUT_TICK' && prev.timeout?.running && next.timeout && !next.timeout.running) {
      // Stop the timeout timer
      clockEngineRef?.stopTimeoutClock();
      // Clear timeout state
      const cleared = gameStore.dispatch({ type: 'END_TIMEOUT' });
      broadcastFn(next, cleared);
    }
  });
  clockEngineRef = clockEngine;
  clockEngineInstance = clockEngine;

  // 3. WindowManager
  const windowManager = createWindowManager();
  windowManagerInstance = windowManager;
  windowManager.createWindows();

  // 4. PresetStore
  const presetStore = createPresetStore(() => windowManager.getControlPanelWindow());

  // 5. LigaStore
  const ligaStore = createLigaStore();

  // 6. AuditStore (gracefully handles missing native modules)
  let auditStore: any;
  try {
    auditStore = createAuditStore(
      undefined,
      () => windowManager.getControlPanelWindow(),
    );
  } catch (err) {
    console.warn('[LigaControl] AuditStore creation failed:', (err as Error).message);
    auditStore = { log() {}, query() { return [] }, purgeOldEntries() { return 0 }, getRecentEntries() { return [] }, close() {} };
  }

  // 7. IpcRouter
  const ipcRouter = createIpcRouter(gameStore, clockEngine, windowManager, presetStore, ligaStore, autosaveStore, auditStore);
  broadcastFn = ipcRouter.broadcastWithBuzzerCheck.bind(ipcRouter);

  // If autosave was found, notify the control panel after it opens
  if (savedState) {
    const cpWin = windowManager.getControlPanelWindow();
    if (cpWin) {
      cpWin.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          cpWin.webContents.send(SCOREBOARD_EVENT, {
            type: 'AUTOSAVE_FOUND',
            ligaName: savedState.ligaName ?? 'Unknown Liga',
          });
        }, 1000);
      });
    }
  }
}

app.whenReady().then(() => {
  protocol.handle('local-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace(/^local-file:\/\/\//, ''));
    return net.fetch(pathToFileURL(filePath).toString());
  });

  try {
    bootstrap();
  } catch (err) {
    console.error('[LigaControl] FATAL: bootstrap() crashed:', err);
  }

  app.on('activate', () => {
    if (windowManagerInstance) {
      const cp = windowManagerInstance.getControlPanelWindow();
      if (!cp || cp.isDestroyed()) windowManagerInstance.createWindows();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  clockEngineInstance?.dispose();
  if (autosaveInstance) {
    const state = (clockEngineInstance as any)?._gameStore?.getState?.();
    // Flush autosave on quit if possible — best-effort
    try { autosaveInstance.dispose(); } catch { /* ignore */ }
  }
  windowManagerInstance?.dispose();
});
