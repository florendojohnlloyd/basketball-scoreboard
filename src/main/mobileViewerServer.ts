/**
 * MobileViewerServer — mobile-friendly live-scores web page (Requirement 36)
 *
 * Serves a responsive, self-contained HTML page on the local network so that
 * coaches and players can view live scores and stats on their own devices.
 * Pushes the full GameState to all connected WebSocket clients so browsers can
 * update within 500 ms of a state change.
 *
 * Reuses the same `express` + `ws` combination as OverlayServer, but as a
 * separate server instance on a separate port (default 8081).
 *
 * States:
 *  - running   — Express serves the viewer page and the /ws endpoint pushes state.
 *  - disabled  — Admin turned the server off; the port is bound by a lightweight
 *                responder that returns an HTTP 503 "Server disabled" page.
 *  - stopped   — nothing bound; any browser hitting the port sees its own
 *                connection error. The viewer page itself renders a
 *                "Scoreboard Offline" message when its WebSocket disconnects.
 */

import { createServer, type Server as HttpServer } from 'http';
import { createServer as createNetServer, type Server as NetServer } from 'net';
import { networkInterfaces } from 'os';
import { join } from 'path';
import express from 'express';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';
import type { GameState, MobileViewerStatus } from '../shared/types';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface MobileViewerServer {
  /** Start the HTTP + WebSocket viewer server on the given port. */
  start(port: number): Promise<void>;
  /** Stop the server and close all connections. */
  stop(): Promise<void>;
  /**
   * Disable the viewer: stop the full server and bind a lightweight responder
   * on the port that returns a "Server disabled" 503 page to any browser.
   */
  disable(port: number): Promise<void>;
  /** Push the full game state to all connected WS clients. */
  broadcast(state: GameState): void;
  /** Resolve the local network URL: `http://<localIPv4>:<port>` (null if not running). */
  getLocalUrl(): string | null;
  /** Generate a base64 PNG data URI QR code encoding the current local URL. */
  generateQrCode(): Promise<string | null>;
  /** Current status snapshot (running/port/localUrl/qrCodeDataUri). */
  getStatus(): Promise<MobileViewerStatus>;
  /** Whether the full viewer server is currently listening. */
  isRunning(): boolean;
  /** The port the server is bound to (0 if not running). */
  getPort(): number;
}

// ---------------------------------------------------------------------------
// Port validation
// ---------------------------------------------------------------------------

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

// ---------------------------------------------------------------------------
// State serialisation — extract the fields the viewer renders
// ---------------------------------------------------------------------------

interface ViewerPlayerStat {
  id: string;
  number: string;
  name: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fouls: number;
}

interface ViewerTeamState {
  name: string;
  score: number;
  fouls: number;
  timeouts: { fullRemaining: number; twentyRemaining: number };
  players: ViewerPlayerStat[];
}

interface ViewerState {
  home: ViewerTeamState;
  away: ViewerTeamState;
  gameClock: { displayMs: number };
  shotClock: { displayMs: number; enabled: boolean };
  period: { current: number; format: string; isOvertime: boolean; overtimeNumber: number };
}

function extractPlayers(players: GameState['home']['players']): ViewerPlayerStat[] {
  return players.map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    points: p.points,
    rebounds: p.rebounds,
    assists: p.assists,
    steals: p.steals,
    blocks: p.blocks,
    fouls: p.fouls,
  }));
}

function extractTeam(team: GameState['home']): ViewerTeamState {
  return {
    name: team.config.name,
    score: team.score,
    fouls: team.fouls,
    timeouts: {
      fullRemaining: team.timeouts.fullRemaining,
      twentyRemaining: team.timeouts.twentyRemaining,
    },
    players: extractPlayers(team.players),
  };
}

export function extractViewerState(state: GameState): ViewerState {
  return {
    home: extractTeam(state.home),
    away: extractTeam(state.away),
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
// Local IPv4 resolution
// ---------------------------------------------------------------------------

/**
 * Return the first non-internal IPv4 address of the machine, or 'localhost' if
 * none can be determined (e.g. no active network interface).
 */
export function getLocalIPv4(): string {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    const addrs = ifaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      // Node <18 uses the string 'IPv4'; Node >=18 may use the number 4.
      const isV4 = addr.family === 'IPv4' || (addr.family as unknown) === 4;
      if (isV4 && !addr.internal) {
        return addr.address;
      }
    }
  }
  return 'localhost';
}

/** Build the mobile viewer URL for a given IPv4 address and port. */
export function buildLocalUrl(ipv4: string, port: number): string {
  return `http://${ipv4}:${port}`;
}

// ---------------------------------------------------------------------------
// Resolve viewer static directory
// ---------------------------------------------------------------------------

export function getDefaultViewerDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    const isDev = !app.isPackaged;
    if (isDev) {
      return join(app.getAppPath(), 'resources', 'viewer');
    }
    return join(process.resourcesPath!, 'resources', 'viewer');
  } catch {
    // Fallback for non-Electron environments (e.g. tests)
    return join(process.cwd(), 'resources', 'viewer');
  }
}

// ---------------------------------------------------------------------------
// "Server disabled" static HTML (served with HTTP 503 when disabled)
// ---------------------------------------------------------------------------

const SERVER_DISABLED_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Server disabled</title>
<style>
  html,body{margin:0;height:100%;font-family:'Segoe UI',Arial,sans-serif;background:#0d1117;color:#f0f6fc;display:flex;align-items:center;justify-content:center;}
  .box{text-align:center;padding:24px;}
  h1{font-size:24px;margin:0 0 8px;}
  p{opacity:0.75;font-size:16px;margin:0;}
</style></head>
<body><div class="box"><h1>Server disabled</h1><p>The mobile viewer has been turned off by the administrator.</p></div></body></html>`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface MobileViewerServerOptions {
  onPortConflict?: (port: number) => void;
  viewerDir?: string;
  /** Override local IPv4 resolution (used in tests). */
  localIPv4Resolver?: () => string;
}

export function createMobileViewerServer(
  onPortConflictOrOptions?: ((port: number) => void) | MobileViewerServerOptions,
): MobileViewerServer {
  let httpServer: HttpServer | null = null;
  let wss: WebSocketServer | null = null;
  let disabledResponder: NetServer | null = null;
  const disabledSockets = new Set<import('net').Socket>();
  let currentPort = 0;
  let running = false;

  // Parse options
  let onPortConflict: ((port: number) => void) | undefined;
  let viewerDir: string;
  let resolveIPv4: () => string;

  if (typeof onPortConflictOrOptions === 'function') {
    onPortConflict = onPortConflictOrOptions;
    viewerDir = getDefaultViewerDir();
    resolveIPv4 = getLocalIPv4;
  } else if (onPortConflictOrOptions) {
    onPortConflict = onPortConflictOrOptions.onPortConflict;
    viewerDir = onPortConflictOrOptions.viewerDir ?? getDefaultViewerDir();
    resolveIPv4 = onPortConflictOrOptions.localIPv4Resolver ?? getLocalIPv4;
  } else {
    viewerDir = getDefaultViewerDir();
    resolveIPv4 = getLocalIPv4;
  }

  function broadcastMessage(message: string): void {
    if (!wss) return;
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

  /** Tear down the lightweight "disabled" responder if it is bound. */
  async function closeDisabledResponder(): Promise<void> {
    if (!disabledResponder) return;
    const responder = disabledResponder;
    disabledResponder = null;
    // Destroy any lingering sockets so close() resolves promptly.
    for (const socket of disabledSockets) {
      socket.destroy();
    }
    disabledSockets.clear();
    await new Promise<void>((resolve) => {
      responder.close(() => resolve());
    });
  }

  async function start(port: number): Promise<void> {
    // Tear down any prior state (running server or disabled responder).
    if (running) {
      await stop();
    }
    await closeDisabledResponder();

    if (!isValidPort(port)) {
      throw new Error(`Invalid port: ${port}. Must be in range 1024–65535.`);
    }

    const app = express();

    // Serve the viewer static files.
    app.use(express.static(viewerDir));

    // Catch-all: return the viewer page for any unmatched GET so that the SPA
    // shell always loads (and shows "Scoreboard Offline" if the WS drops).
    app.get(/.*/, (_req, res) => {
      res.sendFile(join(viewerDir, 'index.html'));
    });

    const server = createServer(app);
    httpServer = server;

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        // Tear down the failed server so no dangling handle is left behind.
        const failed = httpServer;
        httpServer = null;
        wss = null;
        running = false;
        currentPort = 0;
        if (failed) {
          try {
            failed.close();
          } catch {
            /* ignore */
          }
        }
        if (err.code === 'EADDRINUSE') {
          if (onPortConflict) onPortConflict(port);
          reject(new Error(`MOBILE_VIEWER_PORT_CONFLICT: Port ${port} is already in use.`));
        } else {
          reject(err);
        }
      });

      server.listen(port, () => {
        if (settled) return;
        settled = true;
        // Only attach the WebSocket server once the port is successfully bound,
        // so a failed listen never leaves a ws handler on a broken http server.
        wss = new WebSocketServer({ server, path: '/ws' });
        running = true;
        currentPort = port;
        resolve();
      });
    });
  }

  async function stop(): Promise<void> {
    // Also tear down the disabled responder if present.
    await closeDisabledResponder();

    if (!running) {
      currentPort = 0;
      return;
    }

    // Close all WebSocket connections.
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

  async function disable(port: number): Promise<void> {
    if (running) {
      await stop();
    }
    await closeDisabledResponder();

    if (!isValidPort(port)) {
      throw new Error(`Invalid port: ${port}. Must be in range 1024–65535.`);
    }

    // A minimal TCP server that answers every connection with a 503 page and
    // closes. This keeps the "Server disabled" UX without a full Express stack.
    const responder = createNetServer((socket) => {
      disabledSockets.add(socket);
      const body = SERVER_DISABLED_HTML;
      const bodyBytes = Buffer.byteLength(body, 'utf8');
      const response =
        'HTTP/1.1 503 Service Unavailable\r\n' +
        'Content-Type: text/html; charset=utf-8\r\n' +
        `Content-Length: ${bodyBytes}\r\n` +
        'Connection: close\r\n' +
        '\r\n' +
        body;
      socket.on('error', () => socket.destroy());
      socket.on('close', () => disabledSockets.delete(socket));
      // Send the response then fully close the socket.
      socket.end(response, () => socket.destroy());
    });

    return new Promise<void>((resolve, reject) => {
      responder.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          if (onPortConflict) onPortConflict(port);
          reject(new Error(`MOBILE_VIEWER_PORT_CONFLICT: Port ${port} is already in use.`));
        } else {
          reject(err);
        }
      });
      responder.listen(port, () => {
        disabledResponder = responder;
        resolve();
      });
    });
  }

  function broadcast(state: GameState): void {
    if (!running || !wss) return;
    const payload = JSON.stringify({
      type: 'state',
      data: extractViewerState(state),
    });
    broadcastMessage(payload);
  }

  function getLocalUrl(): string | null {
    if (!running) return null;
    return buildLocalUrl(resolveIPv4(), currentPort);
  }

  async function generateQrCode(): Promise<string | null> {
    const url = getLocalUrl();
    if (!url) return null;
    return QRCode.toDataURL(url, { margin: 1, width: 256 });
  }

  async function getStatus(): Promise<MobileViewerStatus> {
    const localUrl = getLocalUrl();
    const qrCodeDataUri = running ? await generateQrCode() : null;
    return {
      running,
      port: currentPort,
      localUrl,
      qrCodeDataUri,
    };
  }

  function isRunning(): boolean {
    return running;
  }

  function getPort(): number {
    return currentPort;
  }

  return {
    start,
    stop,
    disable,
    broadcast,
    getLocalUrl,
    generateQrCode,
    getStatus,
    isRunning,
    getPort,
  };
}
