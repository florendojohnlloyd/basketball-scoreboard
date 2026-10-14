/**
 * IpcRouter — wires main-process modules together via IPC.
 * V17.11: Added Liga, Autosave, Undo queries.
 * V17.12: Added AuditStore wiring (Requirement 31).
 * V17.13: Added RBAC middleware + session map + user management IPC (Requirement 28, Task 59).
 */

import { ipcMain, dialog, app } from 'electron';
import { statSync } from 'fs';
import { relative } from 'path';
import { exportPdf, exportExcel } from './exportService';
import type { ExportData } from './exportService';
import type { GameStore } from './gameStore';
import type { CommandType, GameState, Role, ActionCategory } from '../shared/types';
import type { ExtendedClockEngine } from './clockEngine';
import {
  SCOREBOARD_COMMAND, SCOREBOARD_STATE, SCOREBOARD_EVENT, SCOREBOARD_QUERY,
} from '../shared/types';
import type { WindowManager } from './windowManager';
import type { PresetStore } from './presetStore';
import type { LigaStore } from './ligaStore';
import type { AutosaveStore } from './autosaveStore';
import type { AuditStore } from './auditStore';
import type { BackupService } from './backupService';
import type { RoleStore } from './roleStore';
import type { BracketEngine } from './bracketEngine';
import type { OfflineSyncService } from './offlineSyncService';
import type { MobileViewerServer } from './mobileViewerServer';
import type { OverlayServer } from './overlayServer';
import type { ApiKeyStore } from './apiKeyStore';
import type { ApiServer } from './apiServer';
import type { SocialShareService } from './socialShareService';
import { ReauthorizationRequiredError } from './socialShareService';
import type { SocialPlatform } from '../shared/types';
import { randomUUID } from 'crypto';
import { computeSeasonAverages, computeLeaderboards } from './analytics';

// ---------------------------------------------------------------------------
// In-memory session map: webContentsId → { userId, username, role }
// ---------------------------------------------------------------------------

export interface Session {
  userId: string;
  username: string;
  role: Role;
}

/** Exported for testing purposes */
export const sessionMap: Map<number, Session> = new Map();

// ---------------------------------------------------------------------------
// requiredCategory — maps every command type to its action category
// ---------------------------------------------------------------------------

export function requiredCategory(commandType: string): ActionCategory {
  switch (commandType) {
    // Scoring
    case 'ADD_SCORE':
    case 'SUBTRACT_SCORE':
    case 'ADD_PLAYER_POINTS':
      return 'SCORING';

    // Clock
    case 'START_GAME_CLOCK':
    case 'STOP_GAME_CLOCK':
    case 'RESET_GAME_CLOCK':
    case 'SET_GAME_CLOCK':
    case 'START_SHOT_CLOCK':
    case 'STOP_SHOT_CLOCK':
    case 'RESET_SHOT_CLOCK':
    case 'SET_SHOT_CLOCK_ENABLED':
    case 'SET_SHOT_CLOCK_DURATION':
    case 'CLOCK_TICK':
    case 'START_TIMEOUT':
    case 'END_TIMEOUT':
    case 'TIMEOUT_TICK':
      return 'CLOCK';

    // Fouls
    case 'ADD_FOUL':
    case 'SUBTRACT_FOUL':
    case 'ADD_PLAYER_FOUL':
    case 'SUBTRACT_PLAYER_FOUL':
      return 'FOULS';

    // Timeouts
    case 'USE_TIMEOUT':
    case 'RESTORE_TIMEOUT':
      return 'TIMEOUTS';

    // Player stats
    case 'ADD_PLAYER_STAT':
    case 'SUBTRACT_PLAYER_STAT':
    case 'ADD_PLAYER_REBOUND':
    case 'ADD_PLAYER_ASSIST':
    case 'ADD_PLAYER':
    case 'REMOVE_PLAYER':
    case 'UPDATE_PLAYER_NAME':
    case 'UPDATE_PLAYER_NUMBER':
    case 'TOGGLE_PLAYER_ACTIVE':
    case 'ASSIGN_PLAYER_PHOTO':
    case 'TOGGLE_SHOW_PHOTOS_ON_SCOREBOARD':
    case 'ADD_TURNOVER':
    case 'SUBTRACT_TURNOVER':
    case 'CAPTURE_PERIOD_SNAPSHOT':
      return 'PLAYER_STATS';

    // Liga / config
    case 'LOAD_LIGA_TEAMS':
    case 'SET_TEAM_CONFIG':
    case 'LOAD_PRESET':
    case 'ADVANCE_PERIOD':
    case 'NEW_GAME':
    case 'SET_SPONSOR_LOGOS':
    case 'LAYOUT_SAVE_FILE':
    case 'LAYOUT_LOAD_FILE':
    case 'BACKUP_CREATE':
    case 'BACKUP_RESTORE':
    case 'BACKUP_SCHEDULE_SET':
    case 'CLOUD_SYNC_CONFIGURE':
    case 'CLOUD_SYNC_NOW':
    case 'CLOUD_SYNC_GET_CONFIG':
    case 'CLOUD_SYNC_SET_CONFIG':
    case 'CLOUD_SYNC_TEST_CONNECTION':
    case 'CLOUD_SYNC_TRIGGER_NOW':
      return 'LIGA_CONFIG';

    // User management
    case 'AUTH_LOGIN':
    case 'AUTH_LOGOUT':
    case 'USER_LIST':
    case 'USER_CREATE':
    case 'USER_UPDATE':
    case 'USER_DELETE':
    case 'USER_CHANGE_PASSWORD':
      return 'USER_MGMT';

    // System
    case 'SET_VOLUME':
    case 'SET_POSSESSION':
    case 'SWITCH_SIDES':
    case 'UNDO':
    case 'API_KEY_CREATE':
    case 'API_KEY_REVOKE':
    case 'API_KEY_LIST':
    case 'API_START':
    case 'API_STOP':
    case 'API_GET_STATUS':
      return 'SYSTEM';

    // Streaming
    case 'OVERLAY_CONFIG_SET':
    case 'RTMP_CONFIG_SET':
    case 'RTMP_START':
    case 'RTMP_STOP':
    // Live streaming overlay + RTMP control queries (Requirement 33, Task 72)
    case 'OVERLAY_START':
    case 'OVERLAY_STOP':
    case 'OVERLAY_GET_CONFIG':
    case 'OVERLAY_SET_CONFIG':
    case 'RTMP_GET_STATUS':
    // Mobile viewer server (Requirement 36) — Admin-controlled network server
    case 'MOBILE_VIEWER_START':
    case 'MOBILE_VIEWER_STOP':
      return 'STREAMING';

    // Tournament — write operations (Admin + Scorekeeper only)
    case 'TOURNAMENT_CREATE':
    case 'TOURNAMENT_DELETE':
    case 'TOURNAMENT_RESET':
    case 'TOURNAMENT_AUTO_SEED':
    case 'TOURNAMENT_MANUAL_SEED':
    case 'TOURNAMENT_GENERATE_BRACKET':
    case 'TOURNAMENT_RECORD_RESULT':
    case 'TOURNAMENT_REVERT_RESULT':
    case 'TOURNAMENT_EXPORT_PDF':
      return 'TOURNAMENT';

    // Tournament — read-only queries (all roles)
    case 'TOURNAMENT_LIST':
    case 'TOURNAMENT_LOAD':
    case 'TOURNAMENT_PRINT':
      return 'VIEWER';

    // Social Media Sharing (Requirement 35) — Admin + Scorekeeper only
    case 'SHARE_GENERATE_TEXT':
    case 'SHARE_CAPTURE_SCREENSHOT':
    case 'SHARE_POST':
    case 'SHARE_OAUTH_INITIATE':
    case 'SHARE_TOKEN_STATUS':
    case 'SHARE_TOKEN_REVOKE':
      return 'SHARE';

    // Viewer (read-only) — default for unknown
    default:
      return 'VIEWER';
  }
}

// ---------------------------------------------------------------------------
// Photo validation helpers (Requirement 16)
// ---------------------------------------------------------------------------

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

function detectImageType(filePath: string): 'jpeg' | 'png' | null {
  try {
    const fd = require('fs').openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    require('fs').readSync(fd, buf, 0, 4, 0);
    require('fs').closeSync(fd);
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query shape
// ---------------------------------------------------------------------------

type QueryMessage =
  | { type: 'GET_STATE' }
  | { type: 'CAN_UNDO' }
  | { type: 'GET_MONITORS' }
  | { type: 'GET_PRESETS' }
  | { type: 'SAVE_PRESET'; name: string; config: import('../shared/types').GameConfig }
  | { type: 'DELETE_PRESET'; name: string }
  | { type: 'ASSIGN_DISPLAY'; displayId: number }
  | { type: 'OPEN_SCOREBOARD' }
  // Liga
  | { type: 'LIGA_LIST' }
  | { type: 'LIGA_LOAD'; id: string }
  | { type: 'LIGA_CREATE'; name: string; year: number }
  | { type: 'LIGA_ADD_TEAM'; ligaId: string; team: import('../shared/types').LigaTeam }
  | { type: 'LIGA_UPDATE_TEAM'; ligaId: string; teamId: string; updates: Partial<import('../shared/types').LigaTeam> }
  | { type: 'LIGA_REMOVE_TEAM'; ligaId: string; teamId: string }
  | { type: 'LIGA_ADD_PLAYER'; ligaId: string; teamId: string; player: import('../shared/types').LigaPlayer }
  | { type: 'LIGA_UPDATE_PLAYER'; ligaId: string; teamId: string; playerId: string; updates: Partial<import('../shared/types').LigaPlayer> }
  | { type: 'LIGA_REMOVE_PLAYER'; ligaId: string; teamId: string; playerId: string }
  | { type: 'LIGA_ASSIGN_PLAYER_PHOTO'; ligaId: string; teamId: string; playerId: string; filePath: string }
  | { type: 'LIGA_EXPORT_BACKUP'; ligaId: string }
  // Autosave
  | { type: 'AUTOSAVE_READ' }
  | { type: 'AUTOSAVE_CLEAR' }
  | { type: 'GET_APP_PATH' }
  // Game Logs (Requirement 18)
  | { type: 'GAME_LOG_LIST'; ligaId: string }
  | { type: 'GAME_LOG_LOAD'; ligaId: string; logId: string }
  | { type: 'GAME_LOG_DELETE'; ligaId: string; logId: string }
  | { type: 'GAME_LOG_SAVE'; record: import('../shared/types').GameLogRecord }
  // Force NEW_GAME (after save prompt resolved)
  | { type: 'NEW_GAME_CONFIRMED'; clearTeams: boolean }
  // Season stats (Requirement 19)
  | { type: 'SEASON_STATS_LOAD'; ligaId: string }
  // Leaderboards (Requirement 20)
  | { type: 'LEADERBOARDS_LOAD'; ligaId: string }
  // Export (Requirement 22)
  | { type: 'EXPORT_PDF';   data: ExportData }
  | { type: 'EXPORT_EXCEL'; data: ExportData }
  // Schedule (Requirement 24)
  | { type: 'SCHEDULE_LIST';   ligaId: string }
  | { type: 'SCHEDULE_ADD';    ligaId: string; entry: import('../shared/types').ScheduledGame }
  | { type: 'SCHEDULE_UPDATE'; ligaId: string; gameId: string; updates: Partial<import('../shared/types').ScheduledGame> }
  | { type: 'SCHEDULE_REMOVE'; ligaId: string; gameId: string }
  | { type: 'SCHEDULE_LINK_LOG'; ligaId: string; gameId: string; gameLogId: string }
  // Venues (Requirement 25)
  | { type: 'VENUE_LIST';   ligaId: string }
  | { type: 'VENUE_ADD';    ligaId: string; venue: Omit<import('../shared/types').Venue, 'id'> }
  | { type: 'VENUE_UPDATE'; ligaId: string; venueId: string; updates: Partial<Omit<import('../shared/types').Venue, 'id'>> }
  | { type: 'VENUE_REMOVE'; ligaId: string; venueId: string }
  // Staff (Requirement 26)
  | { type: 'STAFF_LIST';   ligaId: string }
  | { type: 'STAFF_ADD';    ligaId: string; staff: Omit<import('../shared/types').StaffMember, 'id'> }
  | { type: 'STAFF_UPDATE'; ligaId: string; staffId: string; updates: Partial<Omit<import('../shared/types').StaffMember, 'id'>> }
  | { type: 'STAFF_REMOVE'; ligaId: string; staffId: string }
  | { type: 'STAFF_ASSIGN_TO_GAME';   ligaId: string; gameId: string; staffId: string }
  | { type: 'STAFF_UNASSIGN_FROM_GAME'; ligaId: string; gameId: string; staffId: string }
  // Authentication (Requirement 28)
  | { type: 'AUTH_LOGIN';  username: string; password: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_HAS_ACCOUNTS' }
  | { type: 'AUTH_SETUP';  username: string; password: string }
  // User management (Requirement 28)
  | { type: 'USER_LIST' }
  | { type: 'USER_CREATE'; username: string; password: string; role: Role }
  | { type: 'USER_UPDATE'; id: string; updates: Partial<Pick<import('../shared/types').UserAccount, 'username' | 'role'>> }
  | { type: 'USER_DELETE'; id: string }
  | { type: 'USER_CHANGE_PASSWORD'; id: string; newPassword: string }
  // Audit Log (Requirement 31)
  | { type: 'AUDIT_QUERY'; filter: import('../shared/types').AuditFilter }
  | { type: 'AUDIT_EXPORT_CSV'; filter: import('../shared/types').AuditFilter }
  // Backup (Requirement 29)
  | { type: 'BACKUP_CREATE' }
  | { type: 'BACKUP_RESTORE' }
  | { type: 'BACKUP_SCHEDULE_SET'; config: import('../shared/types').BackupScheduleConfig }
  | { type: 'BACKUP_SCHEDULE_GET' }
  // Cloud Sync (Requirement 32)
  | { type: 'CLOUD_SYNC_GET_CONFIG' }
  | { type: 'CLOUD_SYNC_SET_CONFIG'; config: import('../shared/types').CloudSyncConfig }
  | { type: 'CLOUD_SYNC_TEST_CONNECTION' }
  | { type: 'CLOUD_SYNC_TRIGGER_NOW' }
  // External REST API (Requirement 34)
  | { type: 'API_KEY_LIST' }
  | { type: 'API_KEY_CREATE'; label: string }
  | { type: 'API_KEY_REVOKE'; id: string }
  | { type: 'API_START'; port?: number }
  | { type: 'API_STOP' }
  | { type: 'API_GET_STATUS' }
  // Mobile Viewer (Requirement 36)
  | { type: 'MOBILE_VIEWER_START'; port: number }
  | { type: 'MOBILE_VIEWER_STOP' }
  | { type: 'MOBILE_VIEWER_GET_STATUS' }
  | { type: 'MOBILE_VIEWER_GET_QR' }
  // Live Streaming — overlay server + RTMP control (Requirement 33, Task 72)
  | { type: 'OVERLAY_START'; port: number }
  | { type: 'OVERLAY_STOP' }
  | { type: 'OVERLAY_GET_CONFIG' }
  | { type: 'OVERLAY_SET_CONFIG'; config: import('../shared/types').OverlayConfig }
  | { type: 'RTMP_START'; config: import('../shared/types').RtmpConfig }
  | { type: 'RTMP_STOP' }
  | { type: 'RTMP_GET_STATUS' }
  // Social Media Sharing (Requirement 35)
  | { type: 'SHARE_GENERATE_TEXT' }
  | { type: 'SHARE_CAPTURE_SCREENSHOT' }
  | { type: 'SHARE_POST'; platform: SocialPlatform; text: string; attachScreenshot: boolean }
  | { type: 'SHARE_OAUTH_INITIATE'; platform: SocialPlatform }
  | { type: 'SHARE_TOKEN_STATUS'; platform: SocialPlatform }
  | { type: 'SHARE_TOKEN_REVOKE'; platform: SocialPlatform }
  // Tournament (Requirements 1–10)
  | { type: 'TOURNAMENT_CREATE'; ligaId: string; name: string; format: import('../shared/types').BracketFormat }
  | { type: 'TOURNAMENT_DELETE'; tournamentId: string }
  | { type: 'TOURNAMENT_RESET'; tournamentId: string }
  | { type: 'TOURNAMENT_LIST'; ligaId: string }
  | { type: 'TOURNAMENT_LOAD'; tournamentId: string }
  | { type: 'TOURNAMENT_AUTO_SEED'; tournamentId: string }
  | { type: 'TOURNAMENT_MANUAL_SEED'; tournamentId: string; teamIds: string[] }
  | { type: 'TOURNAMENT_GENERATE_BRACKET'; tournamentId: string; options?: import('../shared/types').BracketOptions }
  | { type: 'TOURNAMENT_RECORD_RESULT'; tournamentId: string; matchNodeId: string; homeScore: number; awayScore: number }
  | { type: 'TOURNAMENT_REVERT_RESULT'; tournamentId: string; matchNodeId: string }
  | { type: 'TOURNAMENT_EXPORT_PDF'; tournamentId: string }
  | { type: 'TOURNAMENT_PRINT'; tournamentId: string };

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface IpcRouter {
  dispose(): void;
  broadcastState(state: GameState): void;
  broadcastWithBuzzerCheck(prevState: GameState, nextState: GameState): void;
}

// ---------------------------------------------------------------------------
// Buzzer helper
// ---------------------------------------------------------------------------

function clockJustExpired(pRun: boolean, pMs: number, nRun: boolean, nMs: number): boolean {
  return pRun && pMs > 0 && !nRun && nMs === 0;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIpcRouter(
  gameStore: GameStore,
  clockEngine: ExtendedClockEngine,
  windowManager: WindowManager,
  presetStore: PresetStore,
  ligaStore: LigaStore,
  autosaveStore: AutosaveStore,
  auditStore?: AuditStore,
  getSession?: () => { username: string; role: import('../shared/types').Role } | null,
  roleStore?: RoleStore,
  backupService?: BackupService,
  bracketEngine?: BracketEngine,
  offlineSyncService?: OfflineSyncService,
  mobileViewerServer?: MobileViewerServer,
  apiKeyStore?: ApiKeyStore,
  apiServer?: ApiServer,
  socialShareService?: SocialShareService,
  overlayServer?: OverlayServer,
): IpcRouter {

  // ── Live Streaming overlay config (Requirement 33, Task 72) ──
  // The OverlayServer pushes config to connected WS clients but does not persist
  // it; the router holds the current OverlayConfig so OVERLAY_GET_CONFIG can
  // return it and OVERLAY_SET_CONFIG can broadcast + retain the latest values.
  let overlayConfig: import('../shared/types').OverlayConfig = {
    visibleElements: ['score', 'clock', 'period', 'fouls', 'timeouts'],
    fontScaleFactor: 1.0,
    backgroundAlpha: 0.0,
  };

  function broadcastState(state: GameState): void {
    const cpWin = windowManager.getControlPanelWindow();
    const sbWin = windowManager.getScoreboardWindow();
    const scWin = windowManager.getShotClockWindow();
    if (cpWin && !cpWin.isDestroyed()) cpWin.webContents.send(SCOREBOARD_STATE, state);
    if (sbWin && !sbWin.isDestroyed()) sbWin.webContents.send(SCOREBOARD_STATE, state);
    if (scWin && !scWin.isDestroyed()) scWin.webContents.send(SCOREBOARD_STATE, state);
    // Push to any connected mobile viewer clients (Requirement 36.2 — within 500ms).
    if (mobileViewerServer && mobileViewerServer.isRunning()) {
      try {
        mobileViewerServer.broadcast(state);
      } catch {
        // mobile viewer broadcast failure must never affect game flow
      }
    }
    // Push to any connected streaming overlay browser sources (Requirement 33.2 — within 500ms).
    if (overlayServer && overlayServer.isRunning()) {
      try {
        overlayServer.broadcast(state);
      } catch {
        // overlay broadcast failure must never affect game flow
      }
    }
  }

  function sendEventToControlPanel(event: { type: string; [k: string]: unknown }): void {
    const cpWin = windowManager.getControlPanelWindow();
    if (cpWin && !cpWin.isDestroyed()) cpWin.webContents.send(SCOREBOARD_EVENT, event);
  }

  function checkFoulOutAlerts(prevState: GameState, nextState: GameState): void {
    for (const team of ['home', 'away'] as const) {
      for (const p of nextState[team].players) {
        const prev = prevState[team].players.find(x => x.id === p.id);
        if (p.fouledOut && (!prev || !prev.fouledOut)) {
          sendEventToControlPanel({ type: 'PLAYER_FOULED_OUT', team, playerId: p.id, name: p.name });
        }
      }
    }
  }

  function checkAndSendBuzzerEvents(prevState: GameState, nextState: GameState): void {
    if (clockJustExpired(prevState.gameClock.running, prevState.gameClock.displayMs, nextState.gameClock.running, nextState.gameClock.displayMs)) {
      sendEventToControlPanel({ type: 'BUZZER_END_PERIOD' });
    }
    if (clockJustExpired(prevState.shotClock.running, prevState.shotClock.displayMs, nextState.shotClock.running, nextState.shotClock.displayMs)) {
      sendEventToControlPanel({ type: 'BUZZER_SHOT_CLOCK' });
    }
  }

  // ── Audit helper ──
  function auditCommand(command: CommandType, prevState: GameState, newState: GameState): void {
    if (!auditStore) return;
    // Skip non-state-changing commands (clock ticks are high-frequency internal commands)
    if (command.type === 'CLOCK_TICK' || command.type === 'TIMEOUT_TICK') return;
    try {
      // Prefer the injected getSession for test compatibility; otherwise use sessionMap
      const session = getSession?.() ?? null;
      auditStore.append({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        username: session?.username ?? 'system',
        role: session?.role ?? 'Admin',
        actionType: command.type,
        entityId: extractEntityId(command),
        previousValue: prevState,
        newValue: newState,
      });
    } catch {
      // audit failures must never affect game flow
    }
  }

  /** Best-effort extraction of a relevant entity ID from a command. */
  function extractEntityId(command: CommandType): string {
    if ('playerId' in command && typeof (command as any).playerId === 'string') {
      return (command as any).playerId as string;
    }
    if ('team' in command && typeof (command as any).team === 'string') {
      return (command as any).team as string;
    }
    if ('ligaId' in command && typeof (command as any).ligaId === 'string') {
      return (command as any).ligaId as string;
    }
    return '';
  }

  // ── Command handler ──
  const commandHandler = (_event: Electron.IpcMainEvent, command: CommandType): void => {
    // ── RBAC enforcement (Task 59 — Requirement 28) ──
    // Internal tick commands bypass RBAC (generated by ClockEngine, not by user)
    const isInternalTick = command.type === 'CLOCK_TICK' || command.type === 'TIMEOUT_TICK';
    if (!isInternalTick && roleStore) {
      const senderId = _event.sender.id;
      // Auto-trust the scoreboard display window — it is a local privileged
      // window (same machine, same app), not an external user.  Register it
      // as Admin the first time it sends a command so logo uploads and other
      // SET_TEAM_CONFIG calls are not silently blocked by RBAC.
      if (!sessionMap.has(senderId)) {
        const sbWin = windowManager.getScoreboardWindow();
        if (sbWin && !sbWin.isDestroyed() && sbWin.webContents.id === senderId) {
          sessionMap.set(senderId, { userId: 'scoreboard-internal', username: 'scoreboard', role: 'Admin' });
        }
      }
      const session = sessionMap.get(senderId);
      const role: Role = session?.role ?? 'Viewer';
      const category = requiredCategory(command.type);
      if (!roleStore.canPerform(role, category)) {
        _event.sender.send(SCOREBOARD_EVENT, { type: 'ACCESS_DENIED', required: category });
        return; // Do NOT dispatch, do NOT audit
      }
    }

    const prevState = gameStore.getState();

    // ── SYNC_CONFLICT_RESOLVED — handled separately, not dispatched to GameStore ──
    // The renderer sends this command after the operator resolves a sync conflict.
    // Forward the decision to the OfflineSyncService and return early.
    if (command.type === 'SYNC_CONFLICT_RESOLVED') {
      if (offlineSyncService && typeof (offlineSyncService as any).resolveConflict === 'function') {
        try {
          (offlineSyncService as any).resolveConflict(command.conflictId, command.choice);
        } catch {
          // Non-blocking — conflict resolution failure must not affect game ops
        }
      }
      // No state change, no broadcast, no audit needed for conflict resolution
      return;
    }

    // ── Save prompt before NEW_GAME when game is active (Requirement 18) ──
    if (command.type === 'NEW_GAME') {
      const phase = prevState.gamePhase;
      if (phase === 'in-game' || phase === 'post-game') {
        // Notify Control Panel to show save/discard/cancel dialog
        sendEventToControlPanel({
          type: 'SAVE_GAME_LOG_PROMPT',
          gamePhase: phase,
          homeTeam: prevState.home.config.name,
          awayTeam: prevState.away.config.name,
          homeScore: prevState.home.score,
          awayScore: prevState.away.score,
          ligaId: prevState.ligaId,
        });
        // The actual NEW_GAME dispatch will be re-sent by the renderer after the dialog resolves
        return;
      }
    }

    // ── Photo assignment — validate before dispatching (Requirement 16) ──
    if (command.type === 'ASSIGN_PLAYER_PHOTO' && command.photoPath) {
      const filePath = command.photoPath;
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      try {
        const size = statSync(filePath).size;
        if (size > MAX_PHOTO_BYTES) {
          sendEventToControlPanel({
            type: 'PLAYER_PHOTO_ERROR',
            fileName,
            reason: `File exceeds 5 MB limit (${(size / 1024 / 1024).toFixed(1)} MB).`,
          });
          return;
        }
      } catch {
        sendEventToControlPanel({ type: 'PLAYER_PHOTO_ERROR', fileName, reason: 'File not found or unreadable.' });
        return;
      }
      const imgType = detectImageType(filePath);
      if (!imgType) {
        sendEventToControlPanel({ type: 'PLAYER_PHOTO_ERROR', fileName, reason: 'File is not a JPEG or PNG.' });
        return;
      }
      // Store path relative to userData if possible — fall through to dispatch
    }

    switch (command.type) {
      case 'START_GAME_CLOCK':  clockEngine.startGameClock(); clockEngine.startShotClock(); break;
      case 'STOP_GAME_CLOCK':   clockEngine.stopGameClock(); clockEngine.stopShotClock(); break;
      case 'START_SHOT_CLOCK':  clockEngine.startShotClock(); break;
      case 'STOP_SHOT_CLOCK':   clockEngine.stopShotClock();  break;
      case 'START_TIMEOUT':
      case 'USE_VB_TIMEOUT':
        clockEngine.stopGameClock();
        clockEngine.stopShotClock();
        clockEngine.startTimeoutClock();
        break;

      case 'END_TIMEOUT':
        clockEngine.stopTimeoutClock();
        break;
    }

    const newState = gameStore.dispatch(command);

    // Shot clock violation detection:
    // The tickShotClock reducer auto-resets displayMs to configuredDurationSeconds*1000 when it crosses 0.
    // Detect this by checking if prevState was counting down (< configMs) and newState jumped back to configMs.
    if (command.type === 'CLOCK_TICK' && prevState.shotClock.running && prevState.gameClock.running) {
      const configMs = newState.shotClock.configuredDurationSeconds * 1000;
      const prevMs = prevState.shotClock.displayMs;
      const newMs = newState.shotClock.displayMs;
      // Shot clock was below full duration (counting down) and jumped back to full = it crossed 0
      if (prevMs < configMs && prevMs <= 200 && newMs === configMs) {
        // Shot clock violation! Stop everything.
        // 1. Stop both clock engines
        clockEngine.stopGameClock();
        clockEngine.stopShotClock();
        // 2. Stop game clock in state (this also resets shot clock to 24s stopped)
        gameStore.dispatch({ type: 'STOP_GAME_CLOCK' });
        // 3. Fire buzzer sound
        sendEventToControlPanel({ type: 'BUZZER_SHOT_CLOCK' });
        // 4. Broadcast the stopped state
        const stoppedState = gameStore.getState();
        broadcastState(stoppedState);
        autosaveStore.schedule(stoppedState);
        return;
      }
    }

    // Detect timeout expired (hit 0)
    if (command.type === 'TIMEOUT_TICK' && prevState.timeout?.running && newState.timeout && !newState.timeout.running) {
      clockEngine.stopTimeoutClock();
      sendEventToControlPanel({ type: 'BUZZER_TIMEOUT_END' });
      // Auto-clear timeout state
      const clearedState = gameStore.dispatch({ type: 'END_TIMEOUT' });
      broadcastState(clearedState);
      autosaveStore.schedule(clearedState);
      return;
    }

    broadcastWithBuzzerCheck(prevState, newState);
    autosaveStore.schedule(newState);
    sendEventToControlPanel({ type: 'UNDO_STATE', canUndo: gameStore.canUndo(), description: gameStore.getUndoDescription() });
    auditCommand(command, prevState, newState);

    // ── Offline sync: enqueue this change when Cloud Sync is enabled (Req 30) ──
    if (offlineSyncService && offlineSyncService.isCloudSyncEnabled()) {
      // Skip high-frequency internal ticks and read-only queries
      const isTickCommand = command.type === 'CLOCK_TICK' || command.type === 'TIMEOUT_TICK';
      if (!isTickCommand) {
        try {
          const session = getSession?.() ?? sessionMap.get(_event.sender.id) ?? null;
          offlineSyncService.enqueueChange({
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            entityType: 'gameState',
            entityId: (session as any)?.userId ?? 'game',
            changeType: 'UPDATE',
            payload: {
              commandType: command.type,
              previousScore: { home: prevState.home.score, away: prevState.away.score },
              newScore: { home: newState.home.score, away: newState.away.score },
            },
          });
        } catch {
          // enqueue failure must never affect game flow
        }
      }
    }
  };

  ipcMain.on(SCOREBOARD_COMMAND, commandHandler);

  // ── Query handler ──
  const queryHandler = async (_event: Electron.IpcMainInvokeEvent, query: QueryMessage): Promise<unknown> => {
    switch (query.type) {

      case 'GET_STATE':  return gameStore.getState();
      case 'CAN_UNDO':   return { canUndo: gameStore.canUndo(), description: gameStore.getUndoDescription() };
      case 'GET_MONITORS': return windowManager.getAvailableDisplays();
      case 'GET_PRESETS':  return presetStore.list();

      case 'SAVE_PRESET': {
        presetStore.save(query.name, query.config);
        return { success: true };
      }
      case 'DELETE_PRESET': {
        presetStore.delete(query.name);
        return { success: true };
      }
      case 'ASSIGN_DISPLAY': {
        windowManager.assignScoreboardToDisplay(query.displayId);
        return { success: true };
      }
      case 'OPEN_SCOREBOARD': {
        windowManager.openScoreboard();
        // After opening, send current state to scoreboard
        const state = gameStore.getState();
        setTimeout(() => {
          broadcastState(state);
          // Auto-trust the scoreboard window — it is a local privileged window,
          // not an external user, so grant it Admin access so commands like
          // SET_TEAM_CONFIG (logo upload) are not blocked by RBAC.
          const sbWin = windowManager.getScoreboardWindow();
          if (sbWin && !sbWin.isDestroyed()) {
            sessionMap.set(sbWin.webContents.id, {
              userId: 'scoreboard-internal',
              username: 'scoreboard',
              role: 'Admin',
            });
          }
        }, 500);
        return { success: true };
      }

      case 'OPEN_SHOTCLOCK': {
        windowManager.openShotClock();
        return { success: true };
      }

      // ── Scoreboard window fullscreen / windowed ──
      case 'GET_WINDOW_STATE': {
        const win = windowManager.getScoreboardWindow()
        if (!win || win.isDestroyed()) return { isFullscreen: true }
        return { isFullscreen: win.isFullScreen() }
      }

      case 'SET_WINDOW_FULLSCREEN': {
        const win = windowManager.getScoreboardWindow()
        if (win && !win.isDestroyed()) {
          win.setAlwaysOnTop(false)
          win.setSkipTaskbar(false)
          win.setMovable(false)
          win.setResizable(false)
          // Exit any windowed state cleanly before going fullscreen
          const { screen: electronScreen } = require('electron')
          const winBounds = win.getBounds()
          const targetDisplay = electronScreen.getDisplayNearestPoint({ x: winBounds.x + winBounds.width / 2, y: winBounds.y + winBounds.height / 2 })
          // First snap to display bounds so fullscreen lands on the right screen
          win.setFullScreen(false)
          win.setBounds(targetDisplay.bounds, false)
          setTimeout(() => {
            if (!win.isDestroyed()) win.setFullScreen(true)
          }, 200)
        }
        return { success: true }
      }

      case 'SET_WINDOW_WINDOWED': {
        const win = windowManager.getScoreboardWindow()
        if (win && !win.isDestroyed()) {
          // Always clear fullscreen first
          win.setFullScreen(false)
          win.setAlwaysOnTop(false)
          // Wait for fullscreen exit to complete, then set windowed state
          const doWindowed = (): void => {
            if (win.isDestroyed()) return
            win.setMovable(true)
            win.setResizable(true)
            win.setSize(960, 540)
            win.center()
            win.setAlwaysOnTop(true, 'floating')
          }
          // Use longer delay on first call, win.once catches the OS event
          win.once('leave-full-screen', () => {
            setTimeout(doWindowed, 100)
          })
          // Fallback: if event doesn't fire (already windowed), run directly
          setTimeout(() => {
            if (!win.isDestroyed() && !win.isFullScreen()) doWindowed()
          }, 500)
        }
        return { success: true }
      }

      // ── Layout file save/load ──
      case 'LAYOUT_SAVE_FILE': {
        const { layoutData, defaultName } = query as { layoutData: string; defaultName: string }
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Save Scoreboard Layout',
          defaultPath: defaultName ?? 'scoreboard-layout.json',
          filters: [{ name: 'Layout File', extensions: ['json'] }],
        })
        if (canceled || !filePath) return { success: false, canceled: true }
        const { writeFile } = await import('fs/promises')
        await writeFile(filePath, layoutData, 'utf-8')
        return { success: true, filePath }
      }

      case 'LAYOUT_LOAD_FILE': {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          title: 'Load Scoreboard Layout',
          filters: [{ name: 'Layout File', extensions: ['json'] }],
          properties: ['openFile'],
        })
        if (canceled || !filePaths[0]) return { success: false, canceled: true }
        const { readFile } = await import('fs/promises')
        const raw = await readFile(filePaths[0], 'utf-8')
        return { success: true, layoutData: raw, filePath: filePaths[0] }
      }

      // ── Liga queries ──
      case 'LIGA_LIST': return ligaStore.listLigas();

      case 'LIGA_DELETE': {
        try { ligaStore.deleteLiga(query.id); return { success: true }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_LOAD': {
        try { return { success: true, liga: ligaStore.loadLiga(query.id) }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_CREATE': {
        try { return { success: true, liga: ligaStore.createLiga(query.name, query.year) }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_ADD_TEAM': {
        try { return { success: true, team: ligaStore.addTeam(query.ligaId, query.team) }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_UPDATE_TEAM': {
        try { ligaStore.updateTeam(query.ligaId, query.teamId, query.updates); return { success: true }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_REMOVE_TEAM': {
        try { ligaStore.removeTeam(query.ligaId, query.teamId); return { success: true }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_ADD_PLAYER': {
        try { return { success: true, player: ligaStore.addPlayer(query.ligaId, query.teamId, query.player) }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_UPDATE_PLAYER': {
        try { ligaStore.updatePlayer(query.ligaId, query.teamId, query.playerId, query.updates); return { success: true }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_REMOVE_PLAYER': {
        try { ligaStore.removePlayer(query.ligaId, query.teamId, query.playerId); return { success: true }; }
        catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'LIGA_ASSIGN_PLAYER_PHOTO': {
        const { ligaId, teamId, playerId, filePath } = query;
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        try {
          const size = statSync(filePath).size;
          if (size > MAX_PHOTO_BYTES) {
            return {
              success: false,
              error: `File exceeds 5 MB limit (${(size / 1024 / 1024).toFixed(1)} MB).`,
              fileName,
            };
          }
        } catch {
          return { success: false, error: 'File not found or unreadable.', fileName };
        }
        const imgType = detectImageType(filePath);
        if (!imgType) {
          return { success: false, error: 'File is not a JPEG or PNG.', fileName };
        }
        // Store path relative to userData when possible
        let storedPath = filePath;
        try {
          const { app } = require('electron') as typeof import('electron');
          const userData = app.getPath('userData');
          const rel = relative(userData, filePath);
          // only use relative path if it doesn't start with '..' (i.e. inside userData)
          if (!rel.startsWith('..')) storedPath = rel;
        } catch { /* keep absolute path */ }
        try {
          ligaStore.updatePlayer(ligaId, teamId, playerId, { photoPath: storedPath });
          return { success: true, photoPath: storedPath };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'LIGA_EXPORT_BACKUP': {
        const cpWin = windowManager.getControlPanelWindow();
        const result = await dialog.showSaveDialog(cpWin!, {
          defaultPath: `liga_backup_${query.ligaId}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (!result.canceled && result.filePath) {
          try { ligaStore.exportBackup(query.ligaId, result.filePath); return { success: true }; }
          catch (e) { return { success: false, error: (e as Error).message }; }
        }
        return { success: false, error: 'Cancelled' };
      }

      // ── Autosave queries ──
      case 'AUTOSAVE_READ':  return autosaveStore.read();
      case 'AUTOSAVE_CLEAR': { autosaveStore.clear(); return { success: true }; }
      case 'GET_APP_PATH': { return { appPath: app.getAppPath() }; }

      // ── Game Log queries (Requirement 18) ──
      case 'GAME_LOG_LIST': {
        try {
          const logs = ligaStore.listGameLogs(query.ligaId);
          return { logs, warnings: [] };
        } catch (e) { return { logs: [], warnings: [(e as Error).message] }; }
      }
      case 'GAME_LOG_LOAD': {
        try {
          const record = ligaStore.loadGameLog(query.ligaId, query.logId);
          return { success: true, record };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }
      case 'GAME_LOG_DELETE': {
        try {
          ligaStore.deleteGameLog(query.ligaId, query.logId);
          // Notify bracketEngine so it can revert downstream bracket state (Requirement 4.5)
          if (bracketEngine) {
            try {
              bracketEngine.onGameLogDeleted(query.ligaId, query.logId);
            } catch {
              // Bracket revert failure is non-blocking
            }
          }
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }
      case 'GAME_LOG_SAVE': {
        try {
          ligaStore.saveGameLog(query.record);

          // Auto-associate game log with scheduled game (Requirement 27.6)
          if (query.record.ligaId) {
            try {
              const scheduled = ligaStore.listScheduledGames(query.record.ligaId);
              const logDate = query.record.date.split('T')[0]; // Extract YYYY-MM-DD
              const match = scheduled.find(entry => {
                if (entry.gameLogId) return false; // already linked
                // Match by date
                const entryDate = entry.date.split('T')[0];
                if (entryDate !== logDate) return false;
                // Match by team names — resolve team IDs to names
                try {
                  const liga = ligaStore.loadLiga(query.record.ligaId);
                  const homeTeam = liga.teams.find(t => t.id === entry.homeTeamId);
                  const awayTeam = liga.teams.find(t => t.id === entry.awayTeamId);
                  if (!homeTeam || !awayTeam) return false;
                  return (
                    homeTeam.name === query.record.homeTeam &&
                    awayTeam.name === query.record.awayTeam
                  );
                } catch {
                  return false;
                }
              });

              if (match) {
                // Link both records
                ligaStore.updateScheduledGame(query.record.ligaId, match.id, {
                  status: 'Completed',
                  gameLogId: query.record.id,
                });
                // Update game log with scheduled game reference
                const updatedRecord = { ...query.record, scheduledGameId: match.id };
                ligaStore.saveGameLog(updatedRecord);
              }
            } catch {
              // Auto-association failure is non-blocking
            }
          }

          // Notify bracketEngine so it can auto-advance the bracket (Requirement 4.1, 4.7)
          if (bracketEngine && query.record.ligaId) {
            try {
              bracketEngine.onGameLogSaved(query.record);
            } catch {
              // Bracket advancement failure is non-blocking
            }
          }

          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      // Force NEW_GAME after save prompt (Requirement 18)
      case 'NEW_GAME_CONFIRMED': {
        const prev = gameStore.getState();
        const next = gameStore.dispatch({ type: 'NEW_GAME', clearTeams: query.clearTeams });
        broadcastWithBuzzerCheck(prev, next);
        autosaveStore.schedule(next);
        auditCommand({ type: 'NEW_GAME', clearTeams: query.clearTeams }, prev, next);
        return { success: true };
      }

      // ── Season stats (Requirement 19) ──
      case 'SEASON_STATS_LOAD': {
        try {
          // Load all game logs for the liga — recomputed each call (Req 19.5)
          const logSummaries = ligaStore.listGameLogs(query.ligaId);
          const gameLogs = logSummaries.map(s => ligaStore.loadGameLog(query.ligaId, s.id));
          const stats = computeSeasonAverages(gameLogs);
          return { success: true, stats };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      // ── Leaderboards (Requirement 20) ──
      case 'LEADERBOARDS_LOAD': {
        try {
          const logSummaries = ligaStore.listGameLogs(query.ligaId);
          const gameLogs = logSummaries.map(s => ligaStore.loadGameLog(query.ligaId, s.id));
          const leaderboards = computeLeaderboards(gameLogs);
          return { success: true, leaderboards };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      // ── Export (Requirement 22) ──
      case 'EXPORT_PDF': {
        const cpWin = windowManager.getControlPanelWindow();
        const defaultName = query.data.kind === 'box-score'
          ? `box_score_${(query.data as import('./exportService').BoxScoreExportData).gameDate.replace(/[/\\: ]/g, '-')}.pdf`
          : 'season_stats.pdf';
        const result = await dialog.showSaveDialog(cpWin!, {
          defaultPath: defaultName,
          filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        });
        if (result.canceled || !result.filePath) {
          return { success: false, cancelled: true };
        }
        try {
          await exportPdf(query.data, result.filePath);
          return { success: true, filePath: result.filePath };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'EXPORT_EXCEL': {
        const cpWin = windowManager.getControlPanelWindow();
        const defaultName = query.data.kind === 'box-score'
          ? `box_score_${(query.data as import('./exportService').BoxScoreExportData).gameDate.replace(/[/\\: ]/g, '-')}.xlsx`
          : 'season_stats.xlsx';
        const result = await dialog.showSaveDialog(cpWin!, {
          defaultPath: defaultName,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
        });
        if (result.canceled || !result.filePath) {
          return { success: false, cancelled: true };
        }
        try {
          await exportExcel(query.data, result.filePath);
          return { success: true, filePath: result.filePath };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      // ── Schedule queries (Requirement 24) ──
      case 'SCHEDULE_LIST': {
        try {
          const entries = ligaStore.listScheduledGames(query.ligaId);
          return { success: true, entries };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'SCHEDULE_ADD': {
        try {
          const newEntry = ligaStore.addScheduledGame(query.ligaId, query.entry);
          return { success: true, entry: newEntry };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'SCHEDULE_UPDATE': {
        try {
          ligaStore.updateScheduledGame(query.ligaId, query.gameId, query.updates);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'SCHEDULE_REMOVE': {
        try {
          ligaStore.removeScheduledGame(query.ligaId, query.gameId);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'SCHEDULE_LINK_LOG': {
        try {
          // Link game log to scheduled game: update both records
          ligaStore.updateScheduledGame(query.ligaId, query.gameId, {
            status: 'Completed',
            gameLogId: query.gameLogId,
          });
          // Also store scheduledGameId in the game log record
          const record = ligaStore.loadGameLog(query.ligaId, query.gameLogId);
          record.scheduledGameId = query.gameId;
          ligaStore.saveGameLog(record);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      // ── Venue queries (Requirement 25) ──
      case 'VENUE_LIST': {
        try {
          const venues = ligaStore.listVenues(query.ligaId);
          return { success: true, venues };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'VENUE_ADD': {
        try {
          const newVenue = ligaStore.addVenue(query.ligaId, query.venue);
          return { success: true, venue: newVenue };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'VENUE_UPDATE': {
        try {
          ligaStore.updateVenue(query.ligaId, query.venueId, query.updates);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'VENUE_REMOVE': {
        try {
          const { affectedGameIds } = ligaStore.removeVenue(query.ligaId, query.venueId);
          return { success: true, affectedGameIds };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      // ── Staff queries (Requirement 26) ──
      case 'STAFF_LIST': {
        try {
          const staff = ligaStore.listStaff(query.ligaId);
          return { success: true, staff };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'STAFF_ADD': {
        try {
          const newStaff = ligaStore.addStaff(query.ligaId, query.staff);
          return { success: true, staff: newStaff };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'STAFF_UPDATE': {
        try {
          ligaStore.updateStaff(query.ligaId, query.staffId, query.updates);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'STAFF_REMOVE': {
        try {
          const { affectedGameIds } = ligaStore.removeStaff(query.ligaId, query.staffId);
          return { success: true, affectedGameIds };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'STAFF_ASSIGN_TO_GAME': {
        try {
          ligaStore.assignStaffToGame(query.ligaId, query.gameId, query.staffId);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'STAFF_UNASSIGN_FROM_GAME': {
        try {
          ligaStore.unassignStaffFromGame(query.ligaId, query.gameId, query.staffId);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      // ── Audit Log queries (Requirement 31) ──
      case 'AUDIT_QUERY': {
        if (!auditStore) return { success: false, error: 'AuditStore not available.' };
        // RBAC: only Admin and Scorekeeper can view the audit log
        const senderSessionAudit = sessionMap.get(_event.sender.id);
        if (!senderSessionAudit || (senderSessionAudit.role !== 'Admin' && senderSessionAudit.role !== 'Scorekeeper')) {
          return { success: false, error: 'Access denied. Admin or Scorekeeper role required.' };
        }
        try {
          const entries = auditStore.query(query.filter);
          return { success: true, entries };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'AUDIT_EXPORT_CSV': {
        if (!auditStore) return { success: false, error: 'AuditStore not available.' };
        // RBAC: only Admin and Scorekeeper can export
        const senderSessionCsv = sessionMap.get(_event.sender.id);
        if (!senderSessionCsv || (senderSessionCsv.role !== 'Admin' && senderSessionCsv.role !== 'Scorekeeper')) {
          return { success: false, error: 'Access denied. Admin or Scorekeeper role required.' };
        }
        const cpWin = windowManager.getControlPanelWindow();
        const result = await dialog.showSaveDialog(cpWin!, {
          defaultPath: `audit_log_${new Date().toISOString().slice(0, 10)}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (result.canceled || !result.filePath) {
          return { success: false, cancelled: true };
        }
        try {
          auditStore.exportCsv(query.filter, result.filePath);
          return { success: true, filePath: result.filePath };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      // ── Authentication queries (Requirement 28) ──
      case 'AUTH_HAS_ACCOUNTS': {
        if (!roleStore) return { hasAccounts: false };
        const users = roleStore.listUsers();
        return { hasAccounts: users.length > 0 };
      }

      case 'AUTH_SETUP': {
        if (!roleStore) return { success: false, error: 'RoleStore not available.' };
        try {
          const account = await roleStore.createUser(query.username, query.password, 'Admin');
          const session: Session = { userId: account.id, username: account.username, role: account.role };
          // Store session in session map
          sessionMap.set(_event.sender.id, session);
          // Send AUTH_STATE event to control panel
          sendEventToControlPanel({ type: 'AUTH_STATE', user: { id: account.id, username: account.username, role: account.role } });
          return { success: true, user: { id: account.id, username: account.username, role: account.role } };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'AUTH_LOGIN': {
        if (!roleStore) return { success: false, error: 'RoleStore not available.' };
        try {
          const account = await roleStore.authenticate(query.username, query.password);
          const session: Session = { userId: account.id, username: account.username, role: account.role };
          // Store session in session map
          sessionMap.set(_event.sender.id, session);
          // Send AUTH_STATE event to control panel
          sendEventToControlPanel({ type: 'AUTH_STATE', user: { id: account.id, username: account.username, role: account.role } });
          return { success: true, user: { id: account.id, username: account.username, role: account.role } };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'AUTH_LOGOUT': {
        // Remove session from map
        sessionMap.delete(_event.sender.id);
        // Send AUTH_STATE event with null user
        sendEventToControlPanel({ type: 'AUTH_STATE', user: null });
        return { success: true };
      }

      // ── User management queries (Requirement 28, Task 59) ──
      case 'USER_LIST': {
        if (!roleStore) return { success: false, error: 'RoleStore not available.' };
        // RBAC: only Admin and Scorekeeper can list users
        const senderSession = sessionMap.get(_event.sender.id);
        if (!senderSession || !roleStore.canPerform(senderSession.role, 'USER_MGMT')) {
          return { success: false, error: 'Access denied. USER_MGMT permission required.' };
        }
        return { success: true, users: roleStore.listUsers() };
      }

      case 'USER_CREATE': {
        if (!roleStore) return { success: false, error: 'RoleStore not available.' };
        const senderSessionCreate = sessionMap.get(_event.sender.id);
        if (!senderSessionCreate || !roleStore.canPerform(senderSessionCreate.role, 'USER_MGMT')) {
          return { success: false, error: 'Access denied. USER_MGMT permission required.' };
        }
        try {
          const newAccount = await roleStore.createUser(query.username, query.password, query.role);
          return { success: true, user: { id: newAccount.id, username: newAccount.username, role: newAccount.role } };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'USER_UPDATE': {
        if (!roleStore) return { success: false, error: 'RoleStore not available.' };
        const senderSessionUpdate = sessionMap.get(_event.sender.id);
        if (!senderSessionUpdate || !roleStore.canPerform(senderSessionUpdate.role, 'USER_MGMT')) {
          return { success: false, error: 'Access denied. USER_MGMT permission required.' };
        }
        try {
          const updatedAccount = roleStore.updateUser(query.id, query.updates);
          return { success: true, user: { id: updatedAccount.id, username: updatedAccount.username, role: updatedAccount.role } };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'USER_DELETE': {
        if (!roleStore) return { success: false, error: 'RoleStore not available.' };
        const senderSessionDelete = sessionMap.get(_event.sender.id);
        if (!senderSessionDelete || !roleStore.canPerform(senderSessionDelete.role, 'USER_MGMT')) {
          return { success: false, error: 'Access denied. USER_MGMT permission required.' };
        }
        try {
          roleStore.deleteUser(query.id);
          return { success: true };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'USER_CHANGE_PASSWORD': {
        if (!roleStore) return { success: false, error: 'RoleStore not available.' };
        const senderSessionPw = sessionMap.get(_event.sender.id);
        if (!senderSessionPw || !roleStore.canPerform(senderSessionPw.role, 'USER_MGMT')) {
          return { success: false, error: 'Access denied. USER_MGMT permission required.' };
        }
        try {
          await roleStore.changePassword(query.id, query.newPassword);
          return { success: true };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      // ── Backup queries (Requirement 29) ──
      case 'BACKUP_CREATE': {
        if (!backupService) return { success: false, error: 'BackupService not available.' };
        const cpWinBackup = windowManager.getControlPanelWindow();
        const saveResult = await dialog.showSaveDialog(cpWinBackup!, {
          defaultPath: `backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.zip`,
          filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
        });
        if (saveResult.canceled || !saveResult.filePath) {
          return { success: false, cancelled: true };
        }
        try {
          await backupService.createBackup(saveResult.filePath);
          // Log backup event to audit store
          if (auditStore) {
            const session = getSession?.() ?? sessionMap.get(_event.sender.id) ?? null;
            try {
              auditStore.append({
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                username: (session as any)?.username ?? 'system',
                role: (session as any)?.role ?? 'Admin',
                actionType: 'BACKUP_CREATED',
                entityId: saveResult.filePath,
                previousValue: '',
                newValue: saveResult.filePath,
              });
            } catch { /* audit failure is non-blocking */ }
          }
          return { success: true, filePath: saveResult.filePath };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'BACKUP_SCHEDULE_SET': {
        if (!backupService) return { success: false, error: 'BackupService not available.' };
        try {
          if (query.config.enabled) {
            backupService.scheduleAutoBackup(query.config);
          } else {
            backupService.cancelAutoBackup();
          }
          return { success: true };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'BACKUP_SCHEDULE_GET': {
        // Schedule config is managed by the renderer/settings UI — return acknowledgment
        return { success: true };
      }

      case 'BACKUP_RESTORE': {
        if (!backupService) return { success: false, error: 'BackupService not available.' };
        const cpWinRestore = windowManager.getControlPanelWindow();
        // Open file picker for .zip archive
        const openResult = await dialog.showOpenDialog(cpWinRestore!, {
          title: 'Select Backup Archive to Restore',
          filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
          properties: ['openFile'],
        });
        if (openResult.canceled || !openResult.filePaths.length) {
          return { success: false, cancelled: true };
        }
        const archivePath = openResult.filePaths[0];
        try {
          const result = await backupService.restoreFromArchive(archivePath);
          if (!result.restored) {
            return { success: false, cancelled: !result.error, error: result.error };
          }
          // If we get here, app.relaunch() + app.exit(0) should have been called
          // but in case dialog/app modules weren't injected, return success
          return { success: true };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      // ── Tournament queries (Requirements 1–10) ──────────────────────────

      case 'TOURNAMENT_CREATE': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const tournament = bracketEngine.createTournament(query.ligaId, query.name, query.format);
          return { success: true, tournament };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_DELETE': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          bracketEngine.deleteTournament(query.tournamentId);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_RESET': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const tournament = bracketEngine.resetTournament(query.tournamentId);
          return { success: true, tournament };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_LIST': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const tournaments = bracketEngine.listTournaments(query.ligaId);
          return { success: true, tournaments };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_LOAD': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const tournament = bracketEngine.getTournament(query.tournamentId);
          return { success: true, tournament };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_AUTO_SEED': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const result = bracketEngine.autoSeed(query.tournamentId);
          return { success: true, seeds: result.tournament.seeds, tournament: result.tournament };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_MANUAL_SEED': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const result = bracketEngine.manualSeed(query.tournamentId, query.teamIds);
          return { success: true, seeds: result.tournament.seeds, tournament: result.tournament };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_GENERATE_BRACKET': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const tournament = bracketEngine.generateBracket(query.tournamentId, query.options);
          return { success: true, tournament };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_RECORD_RESULT': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const result = bracketEngine.recordResult(
            query.tournamentId,
            query.matchNodeId,
            query.homeScore,
            query.awayScore,
          );
          return { success: true, ...result };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_REVERT_RESULT': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        try {
          const result = bracketEngine.revertResult(query.tournamentId, query.matchNodeId);
          return { success: true, ...result };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }

      case 'TOURNAMENT_EXPORT_PDF': {
        if (!bracketEngine) return { success: false, error: 'BracketEngine not available.' };
        const cpWinBracket = windowManager.getControlPanelWindow();
        // Load tournament to build a sensible default filename
        let defaultName = 'tournament_bracket.pdf';
        try {
          const t = bracketEngine.getTournament(query.tournamentId);
          defaultName = `${t.name.replace(/[^a-z0-9_\- ]/gi, '_')}_bracket.pdf`;
        } catch { /* use default */ }
        const saveResult = await dialog.showSaveDialog(cpWinBracket!, {
          defaultPath: defaultName,
          filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        });
        if (saveResult.canceled || !saveResult.filePath) {
          return { success: false, cancelled: true };
        }
        try {
          await bracketEngine.exportBracketPdf(query.tournamentId, saveResult.filePath);
          return { success: true, filePath: saveResult.filePath };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'TOURNAMENT_PRINT': {
        // Print is handled renderer-side via window.print(); this handler just
        // acknowledges the request so the renderer can trigger the print dialog.
        return { success: true };
      }

      // ── External REST API queries (Requirement 34) ─────────────────────

      case 'API_KEY_LIST': {
        if (!apiKeyStore) return { success: false, error: 'ApiKeyStore not available.' };
        try {
          return { success: true, keys: apiKeyStore.listKeys() };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'API_KEY_CREATE': {
        if (!apiKeyStore) return { success: false, error: 'ApiKeyStore not available.' };
        try {
          const { key, rawKey } = apiKeyStore.createKey(query.label);
          // Audit the creation (raw key is never persisted or logged).
          if (auditStore) {
            const session = getSession?.() ?? sessionMap.get(_event.sender.id) ?? null;
            try {
              auditStore.append({
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                username: (session as any)?.username ?? 'system',
                role: (session as any)?.role ?? 'Admin',
                actionType: 'API_KEY_CREATE',
                entityId: key.id,
                previousValue: '',
                newValue: key.label,
              });
            } catch { /* audit failure is non-blocking */ }
          }
          // rawKey is returned exactly once — the UI must surface it immediately.
          return { success: true, key, rawKey };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'API_KEY_REVOKE': {
        if (!apiKeyStore) return { success: false, error: 'ApiKeyStore not available.' };
        try {
          apiKeyStore.revokeKey(query.id);
          // The ApiServer reloads active keys on every request, so revocation
          // takes effect immediately (Requirement 34.5).
          if (auditStore) {
            const session = getSession?.() ?? sessionMap.get(_event.sender.id) ?? null;
            try {
              auditStore.append({
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                username: (session as any)?.username ?? 'system',
                role: (session as any)?.role ?? 'Admin',
                actionType: 'API_KEY_REVOKE',
                entityId: query.id,
                previousValue: '',
                newValue: '',
              });
            } catch { /* audit failure is non-blocking */ }
          }
          return { success: true, keys: apiKeyStore.listKeys() };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'API_START': {
        if (!apiServer || !apiKeyStore) return { success: false, error: 'API server not available.' };
        const cfg = apiKeyStore.getConfig();
        const port = query.port ?? cfg.port;
        try {
          apiKeyStore.setConfig({ enabled: true, port });
          await apiServer.start(port);
          return { success: true, status: { running: true, port, enabled: true, portConflict: false } };
        } catch (e) {
          const message = (e as Error).message ?? 'Failed to start API server.';
          const portConflict = /API_PORT_CONFLICT/.test(message);
          if (portConflict) {
            sendEventToControlPanel({ type: 'API_PORT_CONFLICT', port });
          }
          return {
            success: false,
            error: portConflict ? `API_PORT_CONFLICT: Port ${port} is already in use.` : message,
            status: { running: false, port, enabled: true, portConflict },
          };
        }
      }

      case 'API_STOP': {
        if (!apiServer || !apiKeyStore) return { success: false, error: 'API server not available.' };
        try {
          await apiServer.stop();
          const cfg = apiKeyStore.getConfig();
          apiKeyStore.setConfig({ enabled: false, port: cfg.port });
          return { success: true, status: { running: false, port: cfg.port, enabled: false, portConflict: false } };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'API_GET_STATUS': {
        const cfg = apiKeyStore?.getConfig() ?? { enabled: false, port: 3000 };
        const running = apiServer?.isRunning() ?? false;
        const port = apiServer?.getPort() || cfg.port;
        return { running, port, enabled: cfg.enabled, portConflict: false };
      }

      // ── Mobile Viewer queries (Requirement 36) ──────────────────────────

      case 'MOBILE_VIEWER_START': {
        if (!mobileViewerServer) return { success: false, error: 'MobileViewerServer not available.' };
        try {
          await mobileViewerServer.start(query.port);
          const status = await mobileViewerServer.getStatus();
          // Push the current game state so freshly-connected browsers render immediately.
          try {
            mobileViewerServer.broadcast(gameStore.getState());
          } catch { /* broadcast failure is non-blocking */ }
          sendEventToControlPanel({ type: 'MOBILE_VIEWER_STATUS_CHANGED', status });
          return { success: true, status };
        } catch (e) {
          // Port conflicts are surfaced via the onPortConflict callback wired at
          // construction (MOBILE_VIEWER_PORT_CONFLICT). Still return the error here.
          return { success: false, error: (e as Error).message };
        }
      }

      case 'MOBILE_VIEWER_STOP': {
        if (!mobileViewerServer) return { success: false, error: 'MobileViewerServer not available.' };
        try {
          await mobileViewerServer.stop();
          const status = await mobileViewerServer.getStatus();
          sendEventToControlPanel({ type: 'MOBILE_VIEWER_STATUS_CHANGED', status });
          return { success: true, status };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'MOBILE_VIEWER_GET_STATUS': {
        if (!mobileViewerServer) {
          return { running: false, port: 0, localUrl: null, qrCodeDataUri: null };
        }
        try {
          return await mobileViewerServer.getStatus();
        } catch {
          return { running: false, port: 0, localUrl: null, qrCodeDataUri: null };
        }
      }

      case 'MOBILE_VIEWER_GET_QR': {
        if (!mobileViewerServer) return { qrDataUri: null, url: null };
        try {
          const qrDataUri = await mobileViewerServer.generateQrCode();
          const url = mobileViewerServer.getLocalUrl();
          return { qrDataUri, url };
        } catch (e) {
          return { qrDataUri: null, url: null, error: (e as Error).message };
        }
      }

      // ── Live Streaming: overlay server (Requirement 33, Task 72) ─────────

      case 'OVERLAY_START': {
        if (!overlayServer) return { success: false, error: 'Overlay server not available.' };
        try {
          await overlayServer.start(query.port);
          // Push the current config + game state so freshly-connected browser
          // sources render immediately (Requirement 33.2).
          try {
            overlayServer.updateConfig(overlayConfig);
            overlayServer.broadcast(gameStore.getState());
          } catch { /* broadcast failure is non-blocking */ }
          return {
            success: true,
            status: { running: true, port: overlayServer.getPort(), portConflict: false },
          };
        } catch (e) {
          const message = (e as Error).message ?? 'Failed to start the overlay server.';
          const portConflict = /OVERLAY_PORT_CONFLICT/.test(message);
          // Port conflicts are also surfaced via the onPortConflict callback wired
          // at construction (OVERLAY_PORT_CONFLICT event).
          return {
            success: false,
            error: portConflict
              ? `OVERLAY_PORT_CONFLICT: Port ${query.port} is already in use.`
              : message,
            status: { running: false, port: query.port, portConflict },
          };
        }
      }

      case 'OVERLAY_STOP': {
        if (!overlayServer) return { success: false, error: 'Overlay server not available.' };
        try {
          await overlayServer.stop();
          return { success: true, status: { running: false, port: 0, portConflict: false } };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'OVERLAY_GET_CONFIG': {
        return {
          config: overlayConfig,
          running: overlayServer?.isRunning() ?? false,
          port: overlayServer?.getPort() ?? 0,
        };
      }

      case 'OVERLAY_SET_CONFIG': {
        overlayConfig = query.config;
        // Push to connected browser sources within 1s (Requirement 33.3).
        try {
          overlayServer?.updateConfig(overlayConfig);
        } catch { /* broadcast failure is non-blocking */ }
        return { success: true, config: overlayConfig };
      }

      // ── Live Streaming: RTMP control (Requirement 33, Task 72) ───────────

      case 'RTMP_START': {
        if (!overlayServer) return { success: false, error: 'Overlay server not available.' };
        // Validate the destination URL before invoking the streamer so the UI
        // gets an immediate, actionable error (Requirement 33.4).
        const url = query.config.destinationUrl ?? '';
        if (!(url.startsWith('rtmp://') || url.startsWith('rtmps://'))) {
          return {
            success: false,
            error: 'Invalid RTMP URL: must start with rtmp:// or rtmps://',
          };
        }
        try {
          overlayServer.startRtmp(query.config);
          return { success: true, status: overlayServer.getRtmpStatus() };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'RTMP_STOP': {
        if (!overlayServer) return { success: false, error: 'Overlay server not available.' };
        try {
          overlayServer.stopRtmp();
          return { success: true, status: overlayServer.getRtmpStatus() };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      case 'RTMP_GET_STATUS': {
        if (!overlayServer) {
          return { active: false, elapsedSeconds: 0, error: null };
        }
        return overlayServer.getRtmpStatus();
      }

      // ── Social Media Sharing queries (Requirement 35) ───────────────────
      // Admin + Scorekeeper only (SHARE capability). Enforced here because query
      // messages bypass the command-handler RBAC middleware.
      case 'SHARE_GENERATE_TEXT':
      case 'SHARE_CAPTURE_SCREENSHOT':
      case 'SHARE_POST':
      case 'SHARE_OAUTH_INITIATE':
      case 'SHARE_TOKEN_STATUS':
      case 'SHARE_TOKEN_REVOKE': {
        if (!socialShareService) {
          return { success: false, error: 'SocialShareService not available.' };
        }
        // RBAC guard — reject roles lacking the SHARE capability.
        if (roleStore) {
          const shareSession = sessionMap.get(_event.sender.id);
          const shareRole: Role = shareSession?.role ?? 'Viewer';
          if (!roleStore.canPerform(shareRole, 'SHARE')) {
            return { success: false, error: 'Access denied. SHARE permission required.' };
          }
        }

        switch (query.type) {
          case 'SHARE_GENERATE_TEXT': {
            try {
              const text = socialShareService.generateShareText(gameStore.getState());
              return { success: true, text };
            } catch (e) {
              return { success: false, error: (e as Error).message };
            }
          }

          case 'SHARE_CAPTURE_SCREENSHOT': {
            try {
              const png = await socialShareService.captureScreenshot();
              return { success: true, png: png.toString('base64') };
            } catch (e) {
              return { success: false, error: (e as Error).message };
            }
          }

          case 'SHARE_OAUTH_INITIATE': {
            try {
              socialShareService.initiateOAuth(query.platform);
              return { success: true };
            } catch (e) {
              return { success: false, error: (e as Error).message };
            }
          }

          case 'SHARE_TOKEN_STATUS': {
            try {
              return { success: true, status: socialShareService.getTokenStatus(query.platform) };
            } catch (e) {
              return { success: false, error: (e as Error).message };
            }
          }

          case 'SHARE_TOKEN_REVOKE': {
            try {
              socialShareService.revokeToken(query.platform);
              return { success: true };
            } catch (e) {
              return { success: false, error: (e as Error).message };
            }
          }

          case 'SHARE_POST': {
            try {
              let imagePng: Buffer | undefined;
              if (query.attachScreenshot) {
                imagePng = await socialShareService.captureScreenshot();
              }
              await socialShareService.sharePost(query.platform, query.text, imagePng);
              return { success: true };
            } catch (e) {
              // sharePost already emits SHARE_POST_COMPLETE / SHARE_OAUTH_FAILED events.
              const reauth = e instanceof ReauthorizationRequiredError;
              return { success: false, reauthRequired: reauth, error: (e as Error).message };
            }
          }
        }
        return { success: false, error: 'Unknown share query.' };
      }

      default: {
        const _exhaustive: never = query as never;
        void _exhaustive;
        return { error: 'Unknown query type' };
      }
    }
  };

  ipcMain.handle(SCOREBOARD_QUERY, queryHandler);

  // ── Display events ──
  windowManager.onDisplayRemoved(() => sendEventToControlPanel({ type: 'DISPLAY_REMOVED' }));
  windowManager.onDisplayAdded(()  => sendEventToControlPanel({ type: 'DISPLAY_ADDED' }));

  // ── Forward replay trigger from control panel to scoreboard ──
  ipcMain.on(SCOREBOARD_EVENT, (_event: Electron.IpcMainEvent, payload: { type: string }) => {
    if (payload.type === 'REPLAY_TRIGGER') {
      const sbWin = windowManager.getScoreboardWindow();
      if (sbWin && !sbWin.isDestroyed()) {
        sbWin.webContents.send(SCOREBOARD_EVENT, { type: 'REPLAY_TRIGGER' });
      }
    }
  });

  function broadcastWithBuzzerCheck(prevState: GameState, nextState: GameState): void {
    broadcastState(nextState);
    checkAndSendBuzzerEvents(prevState, nextState);
    checkFoulOutAlerts(prevState, nextState);
  }

  function dispose(): void {
    ipcMain.removeListener(SCOREBOARD_COMMAND, commandHandler);
    ipcMain.removeHandler(SCOREBOARD_QUERY);
  }

  return { dispose, broadcastState, broadcastWithBuzzerCheck };
}
