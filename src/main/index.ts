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
 *  9. AutoUpdater (checks for updates from GitHub)
 */

import { app, protocol, net, dialog } from 'electron';
import { pathToFileURL } from 'url';
import { randomUUID } from 'crypto';
import { createGameStore } from './gameStore';
import { createClockEngine } from './clockEngine';
import { createWindowManager } from './windowManager';
import { createPresetStore } from './presetStore';
import { createLigaStore } from './ligaStore';
import { createAutosaveStore } from './autosaveStore';
import { createIpcRouter } from './ipcRouter';
import { createAuditStore } from './auditStore';
import { createRoleStore } from './roleStore';
import { createBackupService } from './backupService';
import { createOverlayServer } from './overlayServer';
import { createBracketEngine } from './bracketEngine';
import { createOfflineSyncService } from './offlineSyncService';
import { createMobileViewerServer } from './mobileViewerServer';
import { createApiKeyStore } from './apiKeyStore';
import { createApiServer } from './apiServer';
import { createSocialShareService } from './socialShareService';
import { initAutoUpdater } from './autoUpdater';
import { SCOREBOARD_EVENT } from '../shared/types';
import type { GameState, GameLogRecord } from '../shared/types';

protocol.registerSchemesAsPrivileged([{
  scheme: 'local-file',
  privileges: { secure: true, supportFetchAPI: true, corsEnabled: false },
}]);

let clockEngineInstance:  ReturnType<typeof createClockEngine>  | null = null;
let windowManagerInstance: ReturnType<typeof createWindowManager> | null = null;
let autosaveInstance:      ReturnType<typeof createAutosaveStore> | null = null;
let offlineSyncInstance:   ReturnType<typeof createOfflineSyncService> | null = null;
let socialShareInstance:   ReturnType<typeof createSocialShareService> | null = null;

// Custom URL scheme used for the OAuth authorization-code callback (Requirement 35).
const OAUTH_SCHEME = 'ligacontrol';

/** Forward a `ligacontrol://oauth-callback` URL (from argv or open-url) to the service. */
function handleOAuthCallbackUrl(url: string | undefined): void {
  if (!url || !url.startsWith(`${OAUTH_SCHEME}://`)) return;
  try {
    void socialShareInstance?.handleOAuthCallback(url);
  } catch (err) {
    console.warn('[LigaControl] OAuth callback handling failed:', (err as Error).message);
  }
}

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

  // 9. Auto-Updater (checks for updates from GitHub)
  const controlPanel = windowManager.getControlPanelWindow();
  if (controlPanel) {
    initAutoUpdater(controlPanel);
  }

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

  // 6b. RoleStore (Requirement 28)
  let roleStore: ReturnType<typeof createRoleStore> | undefined;
  try {
    roleStore = createRoleStore();
  } catch (err) {
    console.warn('[LigaControl] RoleStore creation failed:', (err as Error).message);
  }

  // 6c. BackupService (Requirement 29)
  let backupServiceInstance: ReturnType<typeof createBackupService> | undefined;
  try {
    backupServiceInstance = createBackupService({
      userDataPath: app.getPath('userData'),
      appVersion: app.getVersion(),
      getControlPanelWindow: () => windowManager.getControlPanelWindow(),
      dialog,
      app,
    });
  } catch (err) {
    console.warn('[LigaControl] BackupService creation failed:', (err as Error).message);
  }

  // 6d. OverlayServer (Requirement 33 / 9.x)
  // Wire RTMP + port-conflict events to the Control Panel so the Live Streaming
  // panel and status bar can react (Requirement 33.5, 33.6, 33.7, Task 72).
  const sendOverlayEvent = (event: { type: string; [k: string]: unknown }): void => {
    const cpWin = windowManager.getControlPanelWindow();
    if (cpWin && !cpWin.isDestroyed()) {
      cpWin.webContents.send(SCOREBOARD_EVENT, event);
    }
  };
  const overlayServer = createOverlayServer({
    onPortConflict: (port: number) => {
      sendOverlayEvent({ type: 'OVERLAY_PORT_CONFLICT', port });
    },
    rtmpEvents: {
      onStatusUpdate: (status) => sendOverlayEvent({ type: 'RTMP_STATUS_UPDATE', status }),
      onReconnectAttempt: (attempt, maxAttempts) =>
        sendOverlayEvent({ type: 'RTMP_RECONNECT_ATTEMPT', attempt, maxAttempts }),
      onFailed: () => sendOverlayEvent({ type: 'RTMP_FAILED' }),
      onError: (message) => sendOverlayEvent({ type: 'RTMP_ERROR', message }),
    },
  });

  // 6d-2. OfflineSyncService (Requirement 30)
  let offlineSyncServiceInstance: ReturnType<typeof createOfflineSyncService> | undefined;
  try {
    offlineSyncServiceInstance = createOfflineSyncService({
      getControlPanelWindow: () => windowManager.getControlPanelWindow(),
      pollIntervalMs: 10_000,
      replayDelayMs: 30_000,
      retryIntervalMs: 60_000,
      maxRetries: 3,
      cloudSyncEnabled: false, // disabled by default; toggled when CloudSyncService configures it
    });
    offlineSyncInstance = offlineSyncServiceInstance;
  } catch (err) {
    console.warn('[LigaControl] OfflineSyncService creation failed:', (err as Error).message);
  }

  // 6e. BracketEngine (Requirements 1–10)
  let bracketEngineInstance: ReturnType<typeof createBracketEngine> | undefined;
  try {
    bracketEngineInstance = createBracketEngine({ ligaStore, overlayServer });
    // Wire the overlay server's bracket-state getter so new WS clients receive
    // the current in-progress bracket immediately upon connection (Requirement 9.3).
    // Scans all ligas to find the first in-progress tournament.
    overlayServer.setBracketStateGetter(() => {
      if (!bracketEngineInstance) return null;
      try {
        const ligas = ligaStore.listLigas();
        for (const liga of ligas) {
          const active = bracketEngineInstance.getActiveTournament(liga.id);
          if (active) {
            return bracketEngineInstance.getFullBracketPayload(active.id);
          }
        }
      } catch {
        // Bracket state getter failure must never crash the overlay server
      }
      return null;
    });
  } catch (err) {
    console.warn('[LigaControl] BracketEngine creation failed:', (err as Error).message);
  }

  // 6f. MobileViewerServer (Requirement 36) — live mobile scores page + QR code.
  // Port conflicts are surfaced to the Control Panel via MOBILE_VIEWER_PORT_CONFLICT.
  let mobileViewerServerInstance: ReturnType<typeof createMobileViewerServer> | undefined;
  try {
    mobileViewerServerInstance = createMobileViewerServer({
      onPortConflict: (port: number) => {
        const cpWin = windowManager.getControlPanelWindow();
        if (cpWin && !cpWin.isDestroyed()) {
          cpWin.webContents.send(SCOREBOARD_EVENT, { type: 'MOBILE_VIEWER_PORT_CONFLICT', port });
        }
      },
    });
  } catch (err) {
    console.warn('[LigaControl] MobileViewerServer creation failed:', (err as Error).message);
  }

  // 6g. ApiKeyStore + ApiServer (Requirement 34) — local read-only REST API.
  let apiKeyStoreInstance: ReturnType<typeof createApiKeyStore> | undefined;
  let apiServerInstance: ReturnType<typeof createApiServer> | undefined;
  try {
    apiKeyStoreInstance = createApiKeyStore();

    // Aggregate all saved game logs for the current Liga (unpaginated).
    const getGameLogs = (): GameLogRecord[] => {
      try {
        const ligaId = gameStore.getState().ligaId;
        if (!ligaId) return [];
        const summaries = ligaStore.listGameLogs(ligaId);
        const records: GameLogRecord[] = [];
        for (const s of summaries) {
          try {
            records.push(ligaStore.loadGameLog(ligaId, s.id));
          } catch {
            // Skip corrupted logs rather than fail the whole request.
          }
        }
        return records;
      } catch {
        return [];
      }
    };

    apiServerInstance = createApiServer({
      getState: () => gameStore.getState(),
      getGameLogs,
      getApiKeys: () => apiKeyStoreInstance!.listActiveKeys(),
      onRequest: (audit) => {
        if (!auditStore) return;
        try {
          auditStore.append({
            id: randomUUID(),
            timestamp: audit.timestamp,
            username: audit.keyLabel || 'api',
            role: 'Viewer',
            actionType: `API_REQUEST ${audit.status}`,
            entityId: audit.path,
            previousValue: '',
            newValue: String(audit.status),
          });
        } catch { /* audit failure is non-blocking */ }
      },
      onPortConflict: (port: number) => {
        const cpWin = windowManager.getControlPanelWindow();
        if (cpWin && !cpWin.isDestroyed()) {
          cpWin.webContents.send(SCOREBOARD_EVENT, { type: 'API_PORT_CONFLICT', port });
        }
      },
    });

    // Auto-start the API server when it was previously enabled (Requirement 34.1).
    const apiCfg = apiKeyStoreInstance.getConfig();
    if (apiCfg.enabled) {
      apiServerInstance.start(apiCfg.port).catch((err) => {
        const message = (err as Error).message ?? '';
        if (/API_PORT_CONFLICT/.test(message)) {
          // onPortConflict already notified the Control Panel.
          console.warn('[LigaControl] API server port conflict on launch:', apiCfg.port);
        } else {
          console.warn('[LigaControl] API server auto-start failed:', message);
        }
      });
    }
  } catch (err) {
    console.warn('[LigaControl] ApiServer creation failed:', (err as Error).message);
  }

  // 6g. SocialShareService (Requirement 35) — OAuth 2.0 (PKCE) + social post dispatch.
  let socialShareServiceInstance: ReturnType<typeof createSocialShareService> | undefined;
  try {
    socialShareServiceInstance = createSocialShareService({
      getGameState: () => gameStore.getState(),
      getScoreboardWindow: () => windowManager.getScoreboardWindow(),
      getControlPanelWindow: () => windowManager.getControlPanelWindow(),
      appendAudit: (entry) => {
        try {
          // Real AuditStore exposes append(); the degraded fallback exposes log().
          if (typeof auditStore.append === 'function') auditStore.append(entry);
          else if (typeof auditStore.log === 'function') auditStore.log(entry);
        } catch { /* audit failure is non-blocking */ }
      },
    });
    socialShareInstance = socialShareServiceInstance;
  } catch (err) {
    console.warn('[LigaControl] SocialShareService creation failed:', (err as Error).message);
  }

  // 7. IpcRouter
  const ipcRouter = createIpcRouter(gameStore, clockEngine, windowManager, presetStore, ligaStore, autosaveStore, auditStore, undefined, roleStore, backupServiceInstance, bracketEngineInstance, offlineSyncServiceInstance, mobileViewerServerInstance, apiKeyStoreInstance, apiServerInstance, socialShareServiceInstance, overlayServer);
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

// Register the app as the handler for the ligacontrol:// OAuth callback scheme
// (Requirement 35). On Windows/Linux the callback arrives as an argv on a second
// launch; on macOS via the open-url event.
try {
  app.setAsDefaultProtocolClient(OAUTH_SCHEME);
} catch { /* protocol registration is best-effort */ }

// macOS delivers the callback via open-url.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleOAuthCallbackUrl(url);
});

// Windows/Linux deliver the callback as argv on a second launch. Ensure a single
// instance so the running app receives it.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const callbackArg = argv.find((a) => a.startsWith(`${OAUTH_SCHEME}://`));
    handleOAuthCallbackUrl(callbackArg);
    // Focus the Control Panel if present.
    const cp = windowManagerInstance?.getControlPanelWindow();
    if (cp && !cp.isDestroyed()) {
      if (cp.isMinimized()) cp.restore();
      cp.focus();
    }
  });
}

app.whenReady().then(() => {
  protocol.handle('local-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace(/^local-file:\/\/\//, ''));
    // Convert to file:// URL and use net.fetch which handles range requests properly
    const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
    return net.fetch(fileUrl, {
      headers: request.headers,
    });
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
  offlineSyncInstance?.dispose();
  socialShareInstance?.dispose();
  if (autosaveInstance) {
    const state = (clockEngineInstance as any)?._gameStore?.getState?.();
    // Flush autosave on quit if possible — best-effort
    try { autosaveInstance.dispose(); } catch { /* ignore */ }
  }
  windowManagerInstance?.dispose();
});
