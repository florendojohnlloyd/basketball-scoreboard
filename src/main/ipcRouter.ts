/**
 * IpcRouter — wires main-process modules together via IPC.
 * V17.11: Added Liga, Autosave, Undo queries.
 * V17.12: Added AuditStore wiring (Requirement 31).
 */

import { ipcMain, dialog } from 'electron';
import { readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { exportPdf, exportExcel } from './exportService';
import type { ExportData } from './exportService';
import type { GameStore } from './gameStore';
import type { CommandType, GameState } from '../shared/types';
import type { ExtendedClockEngine } from './clockEngine';
import {
  SCOREBOARD_COMMAND, SCOREBOARD_STATE, SCOREBOARD_EVENT, SCOREBOARD_QUERY,
} from '../shared/types';
import type { WindowManager } from './windowManager';
import type { PresetStore } from './presetStore';
import type { LigaStore } from './ligaStore';
import type { AutosaveStore } from './autosaveStore';
import type { AuditStore } from './auditStore';
import { randomUUID } from 'crypto';
import { computeSeasonAverages, computeLeaderboards } from './analytics';

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
  | { type: 'VENUE_REMOVE'; ligaId: string; venueId: string };

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
): IpcRouter {

  function broadcastState(state: GameState): void {
    const cpWin = windowManager.getControlPanelWindow();
    const sbWin = windowManager.getScoreboardWindow();
    if (cpWin && !cpWin.isDestroyed()) cpWin.webContents.send(SCOREBOARD_STATE, state);
    if (sbWin && !sbWin.isDestroyed()) sbWin.webContents.send(SCOREBOARD_STATE, state);
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
      const session = getSession?.();
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
    const prevState = gameStore.getState();

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
      case 'START_GAME_CLOCK':  clockEngine.startGameClock(); break;
      case 'STOP_GAME_CLOCK':   clockEngine.stopGameClock();  break;
      case 'START_SHOT_CLOCK':  clockEngine.startShotClock(); break;
      case 'STOP_SHOT_CLOCK':   clockEngine.stopShotClock();  break;
      case 'START_TIMEOUT':
        clockEngine.stopGameClock();
        clockEngine.stopShotClock();
        clockEngine.startTimeoutClock();
        break;
      case 'END_TIMEOUT':
        clockEngine.stopTimeoutClock();
        break;
    }

    const newState = gameStore.dispatch(command);

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
        setTimeout(() => broadcastState(state), 500);
        return { success: true };
      }

      // ── Liga queries ──
      case 'LIGA_LIST': return ligaStore.listLigas();

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
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
      }
      case 'GAME_LOG_SAVE': {
        try {
          ligaStore.saveGameLog(query.record);
          return { success: true };
        } catch (e) { return { success: false, error: (e as Error).message }; }
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

      default: {
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
