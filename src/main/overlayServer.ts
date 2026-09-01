/**
 * OverlayServer — HTTP + WebSocket browser-source overlay (Requirement 33)
 *
 * Serves an OBS-compatible browser-source overlay page and pushes
 * live game state updates to all connected WebSocket clients.
 */

import { createServer, type Server as HttpServer } from 'http';
import { join } from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  GameState,
  OverlayConfig,
  BracketPayload,
  BracketUpdatePayload,
  RtmpConfig,
  RtmpStatus,
} from '../shared/types';

// ---------------------------------------------------------------------------
// RTMP streaming — injectable ffmpeg abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal handle representing a running ffmpeg RTMP process. This is the
 * surface the OverlayServer needs; the concrete implementation wraps a
 * `fluent-ffmpeg` command. Kept small so tests can inject a fake without a
 * real ffmpeg binary.
 */
export interface FfmpegProcess {
  /** Terminate the underlying ffmpeg child process. */
  kill(): void;
}

/**
 * Factory that spawns an ffmpeg RTMP process. Receives the resolved output URL
 * (destination + stream key) and callbacks fired on stream error/end. The
 * default implementation uses `fluent-ffmpeg`; tests inject a fake.
 */
export type FfmpegSpawner = (params: {
  outputUrl: string;
  onError: (err: Error) => void;
  onEnd: () => void;
}) => FfmpegProcess;

/** Maximum automatic reconnect attempts after a connection loss (Requirement 33.6). */
export const RTMP_MAX_RECONNECT_ATTEMPTS = 3;
/** Delay between reconnect attempts, in milliseconds (Requirement 33.6). */
export const RTMP_RECONNECT_DELAY_MS = 10_000;

/** Events emitted by the RTMP subsystem toward the Control Panel. */
export interface RtmpEventHandlers {
  onStatusUpdate?: (status: RtmpStatus) => void;
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
  onFailed?: () => void;
  onError?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface OverlayServer {
  /** Start the HTTP + WebSocket server on the given port. */
  start(port: number): Promise<void>;
  /** Stop the server and close all connections. */
  stop(): Promise<void>;
  /** Push game state to all connected WS clients. */
  broadcast(state: GameState): void;
  /** Push overlay config update to all connected WS clients. */
  updateConfig(config: OverlayConfig): void;
  /**
   * Push a full bracket state or incremental bracket update to all connected WS clients.
   * Serializes with type 'bracket' for full payloads or 'bracket-update' for incremental ones.
   * A failed send to any individual client is silently skipped.
   */
  broadcastBracket(payload: BracketPayload | BracketUpdatePayload): void;
  /**
   * Register (or replace) the getter used to retrieve the current in-progress bracket state.
   * Called on each new client connection; if it returns non-null the payload is sent immediately.
   */
  setBracketStateGetter(getter: () => BracketPayload | null): void;
  /** Whether the server is currently listening. */
  isRunning(): boolean;
  /** The port the server is bound to (0 if not running). */
  getPort(): number;
  /**
   * Start an RTMP stream to the configured destination.
   * Validates that `config.destinationUrl` starts with `rtmp://` or `rtmps://`;
   * on an invalid URL it emits an error event and does not start streaming.
   * Emits RTMP_STATUS_UPDATE every second while active. On connection loss it
   * auto-reconnects up to 3 times at 10-second intervals, emitting
   * RTMP_RECONNECT_ATTEMPT after each failure and RTMP_FAILED once exhausted.
   */
  startRtmp(config: RtmpConfig): void;
  /** Stop the RTMP stream, kill the ffmpeg process, and clear the status timer. */
  stopRtmp(): void;
  /** Current RTMP status snapshot. */
  getRtmpStatus(): RtmpStatus;
}

// ---------------------------------------------------------------------------
// Port validation
// ---------------------------------------------------------------------------

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

// ---------------------------------------------------------------------------
// RTMP URL validation and destination assembly
// ---------------------------------------------------------------------------

/** True when the destination URL uses the rtmp:// or rtmps:// scheme. */
export function isValidRtmpUrl(url: string): boolean {
  return typeof url === 'string' && (url.startsWith('rtmp://') || url.startsWith('rtmps://'));
}

/**
 * Join the destination URL and stream key into a single ffmpeg output URL,
 * inserting a single `/` separator regardless of trailing/leading slashes.
 */
export function buildRtmpOutputUrl(config: RtmpConfig): string {
  const base = config.destinationUrl.replace(/\/+$/, '');
  const key = (config.streamKey ?? '').replace(/^\/+/, '');
  return key ? `${base}/${key}` : base;
}

// ---------------------------------------------------------------------------
// Default ffmpeg spawner (fluent-ffmpeg). Lazily required so environments
// without ffmpeg installed (e.g. tests that inject a fake) never load it.
// ---------------------------------------------------------------------------

/**
 * Resolve the path to an `ffmpeg` executable.
 *
 * Resolution order:
 *   1. `FFMPEG_PATH` environment variable (explicit override).
 *   2. A binary bundled with the packaged app under
 *      `<resourcesPath>/resources/ffmpeg/ffmpeg(.exe)`.
 *   3. `null` — fall back to `fluent-ffmpeg`'s default lookup, which finds
 *      `ffmpeg` on the system `PATH`.
 *
 * Returns the resolved absolute path, or `null` to defer to the PATH lookup.
 */
export function resolveFfmpegPath(): string | null {
  // 1. Explicit override.
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  // 2. Binary bundled with the packaged app via electron-builder extraResources.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { existsSync } = require('fs') as typeof import('fs');
    const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron');
    const isPackaged = app?.isPackaged ?? false;
    const baseDir = isPackaged
      ? join(process.resourcesPath!, 'resources', 'ffmpeg')
      : join(app.getAppPath(), 'resources', 'ffmpeg');
    const bundled = join(baseDir, binName);
    if (existsSync(bundled)) {
      return bundled;
    }
  } catch {
    /* Not running under Electron (e.g. tests) — fall through to PATH lookup. */
  }

  // 3. Defer to fluent-ffmpeg's default (system PATH) lookup.
  return null;
}

function defaultFfmpegSpawner(params: {
  outputUrl: string;
  onError: (err: Error) => void;
  onEnd: () => void;
}): FfmpegProcess {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffmpeg = require('fluent-ffmpeg');

  // Point fluent-ffmpeg at a bundled/overridden ffmpeg binary when available;
  // otherwise it falls back to locating `ffmpeg` on the system PATH.
  const ffmpegPath = resolveFfmpegPath();
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }

  // Capture the desktop screen and push to the RTMP endpoint. The exact input
  // source is platform-dependent (gdigrab on Windows); this configuration
  // targets Windows screen capture as the app ships for Windows.
  const command = ffmpeg()
    .input('desktop')
    .inputFormat('gdigrab')
    .inputOptions(['-framerate', '30'])
    .outputOptions([
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-f', 'flv',
    ])
    .output(params.outputUrl)
    .on('error', (err: Error) => params.onError(err))
    .on('end', () => params.onEnd());

  command.run();

  return {
    kill: () => {
      try {
        command.kill('SIGKILL');
      } catch {
        /* ignore kill failures */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// State serialisation — extract only the fields relevant to the overlay
// ---------------------------------------------------------------------------

interface OverlayState {
  home: {
    name: string;
    score: number;
    fouls: number;
    timeouts: { fullRemaining: number; twentyRemaining: number };
  };
  away: {
    name: string;
    score: number;
    fouls: number;
    timeouts: { fullRemaining: number; twentyRemaining: number };
  };
  gameClock: { displayMs: number };
  shotClock: { displayMs: number; enabled: boolean };
  period: { current: number; format: string; isOvertime: boolean; overtimeNumber: number };
}

function extractOverlayState(state: GameState): OverlayState {
  return {
    home: {
      name: state.home.config.name,
      score: state.home.score,
      fouls: state.home.fouls,
      timeouts: {
        fullRemaining: state.home.timeouts.fullRemaining,
        twentyRemaining: state.home.timeouts.twentyRemaining,
      },
    },
    away: {
      name: state.away.config.name,
      score: state.away.score,
      fouls: state.away.fouls,
      timeouts: {
        fullRemaining: state.away.timeouts.fullRemaining,
        twentyRemaining: state.away.timeouts.twentyRemaining,
      },
    },
    gameClock: { displayMs: state.gameClock.displayMs },
    shotClock: { displayMs: state.shotClock.displayMs, enabled: state.shotClock.enabled },
    period: {
      current: state.period.current,
      format: state.period.format,
      isOvertime: state.period.isOvertime,
      overtimeNumber: state.period.overtimeNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// Resolve overlay static directory
// ---------------------------------------------------------------------------

export function getDefaultOverlayDir(): string {
  try {
    const { app } = require('electron');
    const isDev = !app.isPackaged;
    if (isDev) {
      return join(app.getAppPath(), 'resources', 'overlay');
    }
    return join(process.resourcesPath!, 'resources', 'overlay');
  } catch {
    // Fallback for non-Electron environments (e.g. tests)
    return join(process.cwd(), 'resources', 'overlay');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface OverlayServerOptions {
  onPortConflict?: (port: number) => void;
  overlayDir?: string;
  /** Returns the current in-progress bracket payload, or null if no tournament is active. */
  getBracketState?: () => BracketPayload | null;
  /** RTMP event callbacks pushed to the Control Panel. */
  rtmpEvents?: RtmpEventHandlers;
  /** Injectable ffmpeg spawner; defaults to a fluent-ffmpeg implementation. */
  ffmpegSpawner?: FfmpegSpawner;
}

export function createOverlayServer(
  onPortConflictOrOptions?: ((port: number) => void) | OverlayServerOptions,
): OverlayServer {
  let httpServer: HttpServer | null = null;
  let wss: WebSocketServer | null = null;
  let currentPort = 0;
  let running = false;

  // Parse options
  let onPortConflict: ((port: number) => void) | undefined;
  let overlayDir: string;
  let getBracketState: (() => BracketPayload | null) | undefined;
  let rtmpEvents: RtmpEventHandlers = {};
  let ffmpegSpawner: FfmpegSpawner = defaultFfmpegSpawner;

  if (typeof onPortConflictOrOptions === 'function') {
    onPortConflict = onPortConflictOrOptions;
    overlayDir = getDefaultOverlayDir();
  } else if (onPortConflictOrOptions) {
    onPortConflict = onPortConflictOrOptions.onPortConflict;
    overlayDir = onPortConflictOrOptions.overlayDir ?? getDefaultOverlayDir();
    getBracketState = onPortConflictOrOptions.getBracketState;
    rtmpEvents = onPortConflictOrOptions.rtmpEvents ?? {};
    ffmpegSpawner = onPortConflictOrOptions.ffmpegSpawner ?? defaultFfmpegSpawner;
  } else {
    overlayDir = getDefaultOverlayDir();
  }

  // ── RTMP streaming state ──
  let rtmpConfig: RtmpConfig | null = null;
  let rtmpProcess: FfmpegProcess | null = null;
  let rtmpActive = false;
  let rtmpElapsedSeconds = 0;
  let rtmpError: string | null = null;
  let rtmpTickTimer: ReturnType<typeof setInterval> | null = null;
  let rtmpReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let rtmpReconnectAttempts = 0;

  function broadcastMessage(message: string): void {
    if (!wss) return;
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  async function start(port: number): Promise<void> {
    if (running) {
      await stop();
    }

    if (!isValidPort(port)) {
      throw new Error(`Invalid port: ${port}. Must be in range 1024–65535.`);
    }

    const app = express();

    // Serve overlay static files
    app.use(express.static(overlayDir));

    httpServer = createServer(app);

    // WebSocket server on the /ws path
    wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    // Send initial bracket state to newly connected clients (Requirements 9.3, 9.4)
    wss.on('connection', (client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN && getBracketState) {
        try {
          const bracketPayload = getBracketState();
          if (bracketPayload !== null) {
            client.send(JSON.stringify({ type: 'bracket', data: bracketPayload }));
          }
          // If null: no in-progress tournament — skip bracket payload (Requirement 9.4)
        } catch {
          /* skip if send fails */
        }
      }
    });

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      // Tear down the half-created HTTP + WS server after a failed bind so the
      // instance does not leak sockets or hold a partial reference.
      const cleanupFailedBind = (): void => {
        running = false;
        currentPort = 0;
        if (wss) {
          try {
            wss.close();
          } catch {
            /* ignore */
          }
          wss = null;
        }
        if (httpServer) {
          try {
            httpServer.close();
          } catch {
            /* ignore */
          }
          httpServer = null;
        }
      };

      const handleError = (err: NodeJS.ErrnoException): void => {
        if (settled) return;
        settled = true;
        cleanupFailedBind();
        if (err.code === 'EADDRINUSE') {
          if (onPortConflict) onPortConflict(port);
          reject(new Error(`OVERLAY_PORT_CONFLICT: Port ${port} is already in use.`));
        } else {
          reject(err);
        }
      };

      httpServer!.on('error', handleError);

      // The WebSocketServer re-emits the underlying HTTP server's 'error' event
      // on itself. Without a listener here, an EADDRINUSE bind failure would
      // surface as an uncaught 'error' event and crash the process, so we handle
      // it as well (the `settled` guard ensures the promise settles only once).
      wss!.on('error', handleError);

      httpServer!.listen(port, () => {
        if (settled) return;
        settled = true;
        running = true;
        currentPort = port;
        resolve();
      });
    });
  }

  async function stop(): Promise<void> {
    if (!running) return;

    // Close all WebSocket connections
    if (wss) {
      for (const client of wss.clients) {
        client.close();
      }
      wss.close();
      wss = null;
    }

    return new Promise<void>((resolve) => {
      if (httpServer) {
        httpServer.close(() => {
          httpServer = null;
          running = false;
          currentPort = 0;
          resolve();
        });
      } else {
        running = false;
        currentPort = 0;
        resolve();
      }
    });
  }

  function broadcast(state: GameState): void {
    if (!running || !wss) return;
    const payload = JSON.stringify({
      type: 'state',
      data: extractOverlayState(state),
    });
    broadcastMessage(payload);
  }

  function updateConfig(config: OverlayConfig): void {
    if (!running || !wss) return;
    const payload = JSON.stringify({
      type: 'config',
      data: config,
    });
    broadcastMessage(payload);
  }

  function setBracketStateGetter(getter: () => BracketPayload | null): void {
    getBracketState = getter;
  }

  function broadcastBracket(payload: BracketPayload | BracketUpdatePayload): void {
    if (!running || !wss) return;
    const type = Object.prototype.hasOwnProperty.call(payload, 'updatedMatchNodes')
      ? 'bracket-update'
      : 'bracket';
    const message = JSON.stringify({ type, data: payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch {
          /* skip failed client without interrupting others */
        }
      }
    }
  }

  function isRunning(): boolean {
    return running;
  }

  function getPort(): number {
    return currentPort;
  }

  // ── RTMP streaming ──

  function currentRtmpStatus(): RtmpStatus {
    return { active: rtmpActive, elapsedSeconds: rtmpElapsedSeconds, error: rtmpError };
  }

  function clearRtmpTimers(): void {
    if (rtmpTickTimer) {
      clearInterval(rtmpTickTimer);
      rtmpTickTimer = null;
    }
    if (rtmpReconnectTimer) {
      clearTimeout(rtmpReconnectTimer);
      rtmpReconnectTimer = null;
    }
  }

  /** Spawn a fresh ffmpeg process for the current rtmpConfig. */
  function spawnRtmpProcess(): void {
    if (!rtmpConfig) return;
    const outputUrl = buildRtmpOutputUrl(rtmpConfig);
    rtmpProcess = ffmpegSpawner({
      outputUrl,
      onError: (err) => handleRtmpConnectionLoss(err),
      onEnd: () => handleRtmpConnectionLoss(new Error('RTMP stream ended')),
    });
  }

  /** Begin the per-second status tick emitting RTMP_STATUS_UPDATE. */
  function startRtmpTick(): void {
    if (rtmpTickTimer) return;
    rtmpTickTimer = setInterval(() => {
      rtmpElapsedSeconds += 1;
      rtmpEvents.onStatusUpdate?.(currentRtmpStatus());
    }, 1000);
  }

  /**
   * Handle a dropped connection: kill any lingering process and schedule a
   * reconnect. After RTMP_MAX_RECONNECT_ATTEMPTS failures, emit RTMP_FAILED and
   * mark the stream stopped.
   */
  function handleRtmpConnectionLoss(err: Error): void {
    if (!rtmpActive) return; // ignore events after an explicit stop

    rtmpError = err.message;

    // Kill the failed process handle.
    if (rtmpProcess) {
      rtmpProcess.kill();
      rtmpProcess = null;
    }

    if (rtmpReconnectAttempts >= RTMP_MAX_RECONNECT_ATTEMPTS) {
      // All retries exhausted — give up.
      rtmpActive = false;
      clearRtmpTimers();
      rtmpEvents.onFailed?.();
      rtmpEvents.onStatusUpdate?.(currentRtmpStatus());
      return;
    }

    // Schedule the next reconnect attempt.
    if (rtmpReconnectTimer) return; // a reconnect is already pending
    rtmpReconnectTimer = setTimeout(() => {
      rtmpReconnectTimer = null;
      if (!rtmpActive) return;
      rtmpReconnectAttempts += 1;
      rtmpEvents.onReconnectAttempt?.(rtmpReconnectAttempts, RTMP_MAX_RECONNECT_ATTEMPTS);
      spawnRtmpProcess();
    }, RTMP_RECONNECT_DELAY_MS);
  }

  function startRtmp(config: RtmpConfig): void {
    // Validate destination URL scheme (Requirement 33.4).
    if (!isValidRtmpUrl(config.destinationUrl)) {
      rtmpError = `Invalid RTMP URL: must start with rtmp:// or rtmps://`;
      rtmpEvents.onError?.(rtmpError);
      return;
    }

    // If already streaming, restart cleanly.
    if (rtmpActive) {
      stopRtmp();
    }

    rtmpConfig = config;
    rtmpActive = true;
    rtmpElapsedSeconds = 0;
    rtmpError = null;
    rtmpReconnectAttempts = 0;

    spawnRtmpProcess();
    startRtmpTick();
    rtmpEvents.onStatusUpdate?.(currentRtmpStatus());
  }

  function stopRtmp(): void {
    rtmpActive = false;
    clearRtmpTimers();
    if (rtmpProcess) {
      rtmpProcess.kill();
      rtmpProcess = null;
    }
    rtmpConfig = null;
    rtmpElapsedSeconds = 0;
    rtmpReconnectAttempts = 0;
    rtmpEvents.onStatusUpdate?.(currentRtmpStatus());
  }

  function getRtmpStatus(): RtmpStatus {
    return currentRtmpStatus();
  }

  return {
    start,
    stop,
    broadcast,
    updateConfig,
    broadcastBracket,
    setBracketStateGetter,
    isRunning,
    getPort,
    startRtmp,
    stopRtmp,
    getRtmpStatus,
  };
}
