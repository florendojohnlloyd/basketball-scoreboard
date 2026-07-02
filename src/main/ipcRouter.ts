/**
 * IpcRouter — wires main-process modules together via IPC.
 *
 * Responsibilities:
 *  - Listens on `scoreboard:command` and routes each command through GameStore,
 *    then broadcasts the resulting state to both windows.
 *  - After a CLOCK_TICK that stops a clock at 0, emits a BUZZER_* event to the
 *    Control Panel renderer.
 *  - Handles `scoreboard:query` (invoke) for GET_STATE, GET_MONITORS,
 *    GET_PRESETS, SAVE_PRESET, DELETE_PRESET, and ASSIGN_DISPLAY.
 *  - Connects ClockEngine start/stop calls to the matching clock commands.
 *  - Forwards DISPLAY_DISCONNECTED events from WindowManager to the Control Panel.
 */

import { ipcMain } from 'electron';
import type { GameStore } from './gameStore';
import type { ClockEngine as ClockEngineType, CommandType, GameState } from '../shared/types';
import {
  SCOREBOARD_COMMAND,
  SCOREBOARD_STATE,
  SCOREBOARD_EVENT,
  SCOREBOARD_QUERY,
} from '../shared/types';
import type { WindowManager } from './windowManager';
import type { PresetStore } from './presetStore';

// ---------------------------------------------------------------------------
// Query shape (discriminated union, renderer → main via invoke)
// ---------------------------------------------------------------------------

type QueryMessage =
  | { type: 'GET_STATE' }
  | { type: 'GET_MONITORS' }
  | { type: 'GET_PRESETS' }
  | { type: 'SAVE_PRESET'; name: string; config: import('../shared/types').GameConfig }
  | { type: 'DELETE_PRESET'; name: string }
  | { type: 'ASSIGN_DISPLAY'; displayId: number };

// ---------------------------------------------------------------------------
// IpcRouter public interface
// ---------------------------------------------------------------------------

export interface IpcRouter {
  /** Remove all IPC listeners registered by this router. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Buzzer helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a clock was running with time remaining before the tick
 * and has now stopped at zero after the tick.
 */
function clockJustExpired(
  prevRunning: boolean,
  prevMs: number,
  nextRunning: boolean,
  nextMs: number,
): boolean {
  return prevRunning && prevMs > 0 && !nextRunning && nextMs === 0;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIpcRouter(
  gameStore: GameStore,
  clockEngine: ClockEngineType,
  windowManager: WindowManager,
  presetStore: PresetStore,
): IpcRouter {

  // -------------------------------------------------------------------------
  // State broadcast helpers
  // -------------------------------------------------------------------------

  function broadcastState(state: GameState): void {
    const cpWin = windowManager.getControlPanelWindow();
    const sbWin = windowManager.getScoreboardWindow();

    if (cpWin && !cpWin.isDestroyed()) {
      cpWin.webContents.send(SCOREBOARD_STATE, state);
    }
    if (sbWin && !sbWin.isDestroyed()) {
      sbWin.webContents.send(SCOREBOARD_STATE, state);
    }
  }

  function sendEventToControlPanel(event: { type: string }): void {
    const cpWin = windowManager.getControlPanelWindow();
    if (cpWin && !cpWin.isDestroyed()) {
      cpWin.webContents.send(SCOREBOARD_EVENT, event);
    }
  }

  // -------------------------------------------------------------------------
  // Command handler — `scoreboard:command`
  // -------------------------------------------------------------------------

  const commandHandler = (
    _event: Electron.IpcMainEvent,
    command: CommandType,
  ): void => {
    // Capture pre-tick clock state for buzzer detection
    const prevState = gameStore.getState();
    const prevGameClockRunning = prevState.gameClock.running;
    const prevGameClockMs = prevState.gameClock.displayMs;
    const prevShotClockRunning = prevState.shotClock.running;
    const prevShotClockMs = prevState.shotClock.displayMs;

    // Route to ClockEngine for real-timer start/stop commands
    switch (command.type) {
      case 'START_GAME_CLOCK':
        clockEngine.startGameClock();
        break;
      case 'STOP_GAME_CLOCK':
        clockEngine.stopGameClock();
        break;
      case 'START_SHOT_CLOCK':
        clockEngine.startShotClock();
        break;
      case 'STOP_SHOT_CLOCK':
        clockEngine.stopShotClock();
        break;
      default:
        break;
    }

    // Dispatch to GameStore
    const newState = gameStore.dispatch(command);

    // Broadcast updated state to both windows
    broadcastState(newState);

    // Buzzer detection: only relevant after a CLOCK_TICK
    if (command.type === 'CLOCK_TICK') {
      const gameClockExpired = clockJustExpired(
        prevGameClockRunning,
        prevGameClockMs,
        newState.gameClock.running,
        newState.gameClock.displayMs,
      );
      const shotClockExpired = clockJustExpired(
        prevShotClockRunning,
        prevShotClockMs,
        newState.shotClock.running,
        newState.shotClock.displayMs,
      );

      if (gameClockExpired) {
        sendEventToControlPanel({ type: 'BUZZER_END_PERIOD' });
      }
      if (shotClockExpired) {
        sendEventToControlPanel({ type: 'BUZZER_SHOT_CLOCK' });
      }
    }
  };

  ipcMain.on(SCOREBOARD_COMMAND, commandHandler);

  // -------------------------------------------------------------------------
  // Query handler — `scoreboard:query` (invoke / handle)
  // -------------------------------------------------------------------------

  const queryHandler = async (
    _event: Electron.IpcMainInvokeEvent,
    query: QueryMessage,
  ): Promise<unknown> => {
    switch (query.type) {
      case 'GET_STATE':
        return gameStore.getState();

      case 'GET_MONITORS':
        return windowManager.getAvailableDisplays();

      case 'GET_PRESETS':
        return presetStore.list();

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

      default: {
        const _exhaustive: never = query;
        void _exhaustive;
        return { error: 'Unknown query type' };
      }
    }
  };

  ipcMain.handle(SCOREBOARD_QUERY, queryHandler);

  // -------------------------------------------------------------------------
  // Forward DISPLAY_DISCONNECTED from WindowManager to the Control Panel
  // -------------------------------------------------------------------------

  windowManager.onDisplayRemoved((_display) => {
    // The WindowManager's internal heartbeat already emits DISPLAY_DISCONNECTED
    // directly to the Control Panel when it detects the scoreboard window has
    // lost its display. Here we also forward the display-removed event so the
    // Control Panel can update its monitor list immediately.
    sendEventToControlPanel({ type: 'DISPLAY_REMOVED' });
  });

  windowManager.onDisplayAdded((_display) => {
    sendEventToControlPanel({ type: 'DISPLAY_ADDED' });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  function dispose(): void {
    ipcMain.removeListener(SCOREBOARD_COMMAND, commandHandler);
    ipcMain.removeHandler(SCOREBOARD_QUERY);
  }

  return { dispose };
}
