/**
 * WindowManager — creates and positions the Control Panel and Scoreboard Display
 * BrowserWindow instances, handles multi-monitor management, display change events,
 * heartbeat monitoring, and persists window bounds via electron-store.
 */

import { BrowserWindow, screen, app } from 'electron';
import { join } from 'path';
import Store from 'electron-store';
import { SCOREBOARD_EVENT } from '@shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PersistedBounds {
  controlPanel?: WindowBounds;
  scoreboard?: WindowBounds;
}

interface WindowManagerState {
  controlPanelWindow: BrowserWindow | null;
  scoreboardWindow: BrowserWindow | null;
  isSingleMonitor: boolean;
}

// The WindowManager interface as defined in design.md / types
export interface WindowManager {
  createWindows(): void;
  openScoreboard(): void;
  getAvailableDisplays(): Electron.Display[];
  assignScoreboardToDisplay(displayId: number): void;
  onDisplayAdded(handler: (display: Electron.Display) => void): void;
  onDisplayRemoved(handler: (display: Electron.Display) => void): void;
  getControlPanelWindow(): BrowserWindow | null;
  getScoreboardWindow(): BrowserWindow | null;
  isSingleMonitor: boolean;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Renderer URL helpers (electron-vite pattern)
// ---------------------------------------------------------------------------

/**
 * Resolve the URL for a named renderer entry in dev or production.
 *
 * electron-vite dev server exposes a single dev server URL, and each renderer
 * entry is served at `<devServerUrl>/<entryName>.html`.
 *
 * In production the built files are in `out/renderer/<entryName>.html`.
 */
function getRendererUrl(
  entryName: 'controlPanel' | 'scoreboard'
): { type: 'url'; value: string } | { type: 'file'; value: string } {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode
  if (devServerUrl) {
    // With root='src/renderer', Vite serves entries at /<entryDir>/index.html
    const url = `${devServerUrl}/${entryName}/index.html`;
    console.log(`[WindowManager] loadURL: ${url}`);
    return { type: 'url', value: url };
  }

  // Production / preview: load from built output directory
  const filePath = join(__dirname, `../renderer/${entryName}/index.html`);
  console.log(`[WindowManager] loadFile: ${filePath}`);
  return { type: 'file', value: filePath };
}

function loadRenderer(
  win: BrowserWindow,
  entryName: 'controlPanel' | 'scoreboard'
): void {
  const resolved = getRendererUrl(entryName);
  if (resolved.type === 'url') {
    win.loadURL(resolved.value);
  } else {
    win.loadFile(resolved.value);
  }
}

// ---------------------------------------------------------------------------
// electron-store schema for persisted bounds
// ---------------------------------------------------------------------------

const boundsStore = new Store<PersistedBounds>({
  name: 'window-bounds',
  defaults: {}
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWindowManager(): WindowManager {
  const state: WindowManagerState = {
    controlPanelWindow: null,
    scoreboardWindow: null,
    isSingleMonitor: false
  };

  // Heartbeat timer reference
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Display event handlers registered by consumers
  const displayAddedHandlers: Array<(display: Electron.Display) => void> = [];
  const displayRemovedHandlers: Array<(display: Electron.Display) => void> = [];

  // Track if screen event listeners have been registered to avoid duplicates
  let listenersRegistered = false;

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Return all displays, primary first. */
  function getSortedDisplays(): Electron.Display[] {
    const primary = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays();
    return [primary, ...all.filter((d) => d.id !== primary.id)];
  }

  /** Find which display contains (or is closest to) the given window bounds. */
  function getDisplayForBounds(bounds: WindowBounds): Electron.Display | null {
    const displays = screen.getAllDisplays();
    // Find first display whose bounds fully contain the window origin
    const match = displays.find((d) => {
      const { x, y, width, height } = d.bounds;
      return (
        bounds.x >= x &&
        bounds.x < x + width &&
        bounds.y >= y &&
        bounds.y < y + height
      );
    });
    return match ?? null;
  }

  /** Persist the current bounds of both windows to electron-store. */
  function persistBounds(): void {
    if (state.controlPanelWindow && !state.controlPanelWindow.isDestroyed()) {
      boundsStore.set('controlPanel', state.controlPanelWindow.getBounds());
    }
    if (state.scoreboardWindow && !state.scoreboardWindow.isDestroyed()) {
      boundsStore.set('scoreboard', state.scoreboardWindow.getBounds());
    }
  }

  /** Emit DISPLAY_DISCONNECTED to the Control Panel renderer. */
  function emitDisplayDisconnected(): void {
    if (
      state.controlPanelWindow &&
      !state.controlPanelWindow.isDestroyed() &&
      state.controlPanelWindow.webContents
    ) {
      state.controlPanelWindow.webContents.send(SCOREBOARD_EVENT, {
        type: 'DISPLAY_DISCONNECTED'
      });
    }
  }

  /** Start the 1-second heartbeat that watches the scoreboard's current display. */
  function startHeartbeat(): void {
    if (heartbeatTimer) return;

    heartbeatTimer = setInterval(() => {
      if (!state.scoreboardWindow || state.scoreboardWindow.isDestroyed()) {
        return;
      }

      const sbBounds = state.scoreboardWindow.getBounds();
      const currentDisplay = getDisplayForBounds(sbBounds);

      if (!currentDisplay) {
        // The display the scoreboard was on has disappeared
        emitDisplayDisconnected();
      }
    }, 1000);
  }

  /** Stop the heartbeat timer. */
  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  /** Register screen event listeners (once). */
  function ensureScreenListeners(): void {
    if (listenersRegistered) return;
    listenersRegistered = true;

    screen.on('display-added', (_event, display) => {
      // Notify consumer handlers
      for (const handler of displayAddedHandlers) {
        try {
          handler(display);
        } catch {
          // ignore handler errors
        }
      }
    });

    screen.on('display-removed', (_event, display) => {
      // Notify consumer handlers
      for (const handler of displayRemovedHandlers) {
        try {
          handler(display);
        } catch {
          // ignore handler errors
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Public interface implementation
  // -------------------------------------------------------------------------

  function createWindows(): void {
    const preloadPath = join(__dirname, '../preload/index.js');
    const displays = getSortedDisplays();
    const primaryDisplay = displays[0];
    const hasSecondaryDisplay = displays.length > 1;
    state.isSingleMonitor = !hasSecondaryDisplay;

    // ------------------------------------------------------------------
    // Control Panel window — always maximize for best experience
    // ------------------------------------------------------------------
    const controlPanelOptions: Electron.BrowserWindowConstructorOptions = {
      width: primaryDisplay.workArea.width,
      height: primaryDisplay.workArea.height,
      x: primaryDisplay.workArea.x,
      y: primaryDisplay.workArea.y,
      minWidth: 1024,
      minHeight: 700,
      webPreferences: {
        preload: preloadPath,
        sandbox: false
      }
    };

    state.controlPanelWindow = new BrowserWindow(controlPanelOptions);
    state.controlPanelWindow.maximize();

    // ------------------------------------------------------------------
    // Scoreboard Display window — created on demand
    // ------------------------------------------------------------------

    // Scoreboard window is NOT created automatically.
    // It will be created when the user clicks "Open Scoreboard" in the control panel.

    // ------------------------------------------------------------------
    // Load renderer content
    // ------------------------------------------------------------------
    loadRenderer(state.controlPanelWindow, 'controlPanel');

    // Scoreboard window is NOT created automatically.
    // It will be created when the user clicks "Open Scoreboard" in the control panel.

    // ------------------------------------------------------------------
    // Start heartbeat & screen listeners
    // ------------------------------------------------------------------
    ensureScreenListeners();
    startHeartbeat();
  }

  function openScoreboard(): void {
    if (state.scoreboardWindow && !state.scoreboardWindow.isDestroyed()) {
      state.scoreboardWindow.focus();
      return;
    }

    const preloadPath = join(__dirname, '../preload/index.js');
    const displays = getSortedDisplays();
    const primaryDisplay = displays[0];
    const hasSecondaryDisplay = displays.length > 1;

    let scoreboardX: number;
    let scoreboardY: number;
    let scoreboardWidth: number;
    let scoreboardHeight: number;
    let startFullscreen: boolean;

    if (hasSecondaryDisplay) {
      const secondaryDisplay = displays[1];
      const savedScoreboardBounds = boundsStore.get('scoreboard');
      const boundsToUse =
        savedScoreboardBounds &&
        getDisplayForBounds(savedScoreboardBounds)?.id === secondaryDisplay.id
          ? savedScoreboardBounds
          : secondaryDisplay.bounds;

      scoreboardX = boundsToUse.x;
      scoreboardY = boundsToUse.y;
      scoreboardWidth = boundsToUse.width;
      scoreboardHeight = boundsToUse.height;
      startFullscreen = true;
    } else {
      scoreboardX = primaryDisplay.bounds.x;
      scoreboardY = primaryDisplay.bounds.y;
      scoreboardWidth = primaryDisplay.bounds.width;
      scoreboardHeight = primaryDisplay.bounds.height;
      startFullscreen = true;
    }

    state.scoreboardWindow = new BrowserWindow({
      x: scoreboardX,
      y: scoreboardY,
      width: scoreboardWidth,
      height: scoreboardHeight,
      frame: false,
      fullscreen: startFullscreen,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        webSecurity: false,
      }
    });

    state.scoreboardWindow.on('moved', persistBounds);
    state.scoreboardWindow.on('resized', persistBounds);
    loadRenderer(state.scoreboardWindow, 'scoreboard');
    state.isSingleMonitor = !hasSecondaryDisplay;
  }

  function getAvailableDisplays(): Electron.Display[] {
    return getSortedDisplays();
  }

  function assignScoreboardToDisplay(displayId: number): void {
    if (!state.scoreboardWindow || state.scoreboardWindow.isDestroyed()) {
      return;
    }

    const displays = screen.getAllDisplays();
    const target = displays.find((d) => d.id === displayId);
    if (!target) {
      console.warn(`[WindowManager] Display ${displayId} not found`);
      return;
    }

    // Exit fullscreen first so setBounds takes effect, then re-enter
    state.scoreboardWindow.setFullScreen(false);
    state.scoreboardWindow.setBounds({
      x: target.bounds.x,
      y: target.bounds.y,
      width: target.bounds.width,
      height: target.bounds.height
    });
    state.scoreboardWindow.setFullScreen(true);

    // Update single-monitor state
    state.isSingleMonitor = false;

    // Persist the new assignment
    persistBounds();
  }

  function onDisplayAdded(handler: (display: Electron.Display) => void): void {
    displayAddedHandlers.push(handler);
    ensureScreenListeners();
  }

  function onDisplayRemoved(
    handler: (display: Electron.Display) => void
  ): void {
    displayRemovedHandlers.push(handler);
    ensureScreenListeners();
  }

  function getControlPanelWindow(): BrowserWindow | null {
    return state.controlPanelWindow;
  }

  function getScoreboardWindow(): BrowserWindow | null {
    return state.scoreboardWindow;
  }

  function dispose(): void {
    stopHeartbeat();
    persistBounds();
  }

  // Return the public interface with a getter for isSingleMonitor so it
  // reflects the live state rather than a snapshot
  const manager: WindowManager = {
    createWindows,
    openScoreboard,
    getAvailableDisplays,
    assignScoreboardToDisplay,
    onDisplayAdded,
    onDisplayRemoved,
    getControlPanelWindow,
    getScoreboardWindow,
    get isSingleMonitor() {
      return state.isSingleMonitor;
    },
    dispose
  };

  return manager;
}
