/**
 * Integration tests — live server instances + WebSocket push (Task 88)
 *
 * These tests exercise real network I/O against live server instances rather
 * than pure logic in isolation:
 *
 *  - OverlayServer WebSocket push arrives within 500 ms of broadcast()
 *  - MobileViewerServer WebSocket push arrives within 500 ms of broadcast()
 *  - CloudSyncService.testConnection() maps HTTP status → { ok } / { ok:false, error }
 *    (uses the injectable httpsTransmitter — simpler and more deterministic than
 *    spinning a real TLS server)
 *  - ApiServer pagination via supertest: page=1 → 20 records + correct totalPages;
 *    page=999 → empty data + correct pagination metadata
 *  - AuditStore + IpcRouter: a scoreboard:command dispatched through the full
 *    router stack writes an AuditEntry (in-memory SQLite) with the correct
 *    actionType and entityId
 *
 * Servers are bound to unique ports per test to avoid EADDRINUSE flakiness and
 * are torn down in afterEach.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { join } from 'path';

import { createOverlayServer, type OverlayServer } from '../overlayServer';
import { createMobileViewerServer, type MobileViewerServer } from '../mobileViewerServer';
import {
  createCloudSyncService,
  type HttpsTransmitter,
} from '../cloudSyncService';
import {
  createApiServer,
  hashApiKey,
  GAMELOGS_PAGE_SIZE,
  type ApiServer,
} from '../apiServer';
import {
  DEFAULT_GAME_STATE,
  type GameState,
  type GameLogRecord,
  type ApiKey,
  type CloudSyncConfig,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const OVERLAY_DIR = join(process.cwd(), 'resources', 'overlay');

// Unique port per test across the whole file to avoid cross-test EADDRINUSE.
let portCounter = 23400;
function nextPort(): number {
  return portCounter++;
}

/** Wait for the first WebSocket message, rejecting after `timeoutMs`. */
function waitForMessage(ws: WebSocket, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`No WebSocket message within ${timeoutMs}ms`));
    }, timeoutMs);
    ws.once('message', (data: WebSocket.RawData) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
  });
}

/** Resolve once the WebSocket connection is open. */
function waitForOpen(ws: WebSocket, timeoutMs = 2000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS did not open in time')), timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ===========================================================================
// OverlayServer — WebSocket push within 500 ms
// ===========================================================================

describe('Integration: OverlayServer WebSocket push', () => {
  const servers: OverlayServer[] = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    sockets.length = 0;
    for (const s of servers) {
      await s.stop();
    }
    servers.length = 0;
  });

  it('delivers a broadcast(state) to a connected ws client within 500 ms', async () => {
    const port = nextPort();
    const server = createOverlayServer({ overlayDir: OVERLAY_DIR });
    servers.push(server);
    await server.start(port);

    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    sockets.push(ws);
    await waitForOpen(ws);

    const state: GameState = DEFAULT_GAME_STATE();
    state.home.score = 42;

    const messagePromise = waitForMessage(ws, 500);
    const startedAt = Date.now();
    server.broadcast(state);

    const raw = await messagePromise;
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThanOrEqual(500);
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe('state');
    expect(parsed.data.home.score).toBe(42);
  });
});

// ===========================================================================
// MobileViewerServer — WebSocket push within 500 ms
// ===========================================================================

describe('Integration: MobileViewerServer WebSocket push', () => {
  const servers: MobileViewerServer[] = [];
  const sockets: WebSocket[] = [];

  // The mobile viewer serves its SPA shell from a viewer dir. For this test we
  // only care about the /ws push path, so any directory is fine.
  const VIEWER_DIR = join(process.cwd(), 'resources', 'overlay');

  afterEach(async () => {
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    sockets.length = 0;
    for (const s of servers) {
      await s.stop();
    }
    servers.length = 0;
  });

  it('delivers a broadcast(state) to a connected ws client within 500 ms', async () => {
    const port = nextPort();
    const server = createMobileViewerServer({
      viewerDir: VIEWER_DIR,
      localIPv4Resolver: () => '127.0.0.1',
    });
    servers.push(server);
    await server.start(port);

    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    sockets.push(ws);
    await waitForOpen(ws);

    const state: GameState = DEFAULT_GAME_STATE();
    state.away.score = 17;

    const messagePromise = waitForMessage(ws, 500);
    const startedAt = Date.now();
    server.broadcast(state);

    const raw = await messagePromise;
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThanOrEqual(500);
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe('state');
    expect(parsed.data.away.score).toBe(17);
  });
});

// ===========================================================================
// CloudSyncService — testConnection() status mapping
// ===========================================================================

describe('Integration: CloudSyncService.testConnection()', () => {
  const ENDPOINT = 'https://sync.example.com/api';

  function configuredService(transmitter: HttpsTransmitter) {
    const service = createCloudSyncService({
      httpsTransmitter: transmitter,
      // base64 fallback storage (no OS keychain in tests)
      _safeStorageOverride: null,
    });
    const config: CloudSyncConfig = {
      enabled: false,
      endpointUrl: ENDPOINT,
      apiKey: 'secret-token',
    };
    service.configure(config);
    return service;
  }

  it('returns { ok: true } when the endpoint responds 200', async () => {
    const transmitter: HttpsTransmitter = vi.fn(async () => ({
      statusCode: 200,
      body: '{"ok":true}',
    }));
    const service = configuredService(transmitter);

    const result = await service.testConnection();

    expect(result).toEqual({ ok: true });
    expect(transmitter).toHaveBeenCalledTimes(1);
    const callArg = (transmitter as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.url).toBe(ENDPOINT);
    expect(callArg.method).toBe('POST');
    expect(callArg.headers.Authorization).toBe('Bearer secret-token');
  });

  it('returns { ok: false, error } when the endpoint responds 401', async () => {
    const transmitter: HttpsTransmitter = vi.fn(async () => ({
      statusCode: 401,
      body: 'Unauthorized',
    }));
    const service = configuredService(transmitter);

    const result = await service.testConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns { ok: false, error } when the request times out', async () => {
    const transmitter: HttpsTransmitter = vi.fn(async (opts) => {
      throw new Error(`Request timed out after ${opts.timeoutMs}ms`);
    });
    const service = configuredService(transmitter);

    const result = await service.testConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('timed out');
  });
});

// ===========================================================================
// ApiServer — gamelogs pagination via supertest
// ===========================================================================

describe('Integration: ApiServer /api/v1/gamelogs pagination (supertest)', () => {
  const servers: ApiServer[] = [];
  const RAW_KEY = 'integration-key-xyz';

  function makeKey(): ApiKey {
    return {
      id: 'key-int-1',
      label: 'Integration',
      keyHash: hashApiKey(RAW_KEY),
      createdAt: new Date().toISOString(),
      active: true,
    };
  }

  function makeGameLog(id: string): GameLogRecord {
    return {
      id,
      ligaId: 'liga-int',
      date: new Date().toISOString(),
      homeTeam: 'Home',
      awayTeam: 'Away',
      finalScores: { home: 80, away: 75 },
      playerStats: {},
      events: [],
      periodSnapshots: [],
    };
  }

  // Seed 45 logs → 3 pages (20, 20, 5).
  const SEED_COUNT = 45;
  const seededLogs: GameLogRecord[] = Array.from({ length: SEED_COUNT }, (_, i) =>
    makeGameLog(`log-${String(i).padStart(3, '0')}`),
  );

  let port = 0;
  let baseUrl = '';

  beforeEach(async () => {
    port = nextPort();
    baseUrl = `http://localhost:${port}`;
    const server = createApiServer({
      getState: () => DEFAULT_GAME_STATE(),
      getGameLogs: () => seededLogs,
      getApiKeys: () => [makeKey()],
    });
    servers.push(server);
    await server.start(port);
  });

  afterEach(async () => {
    for (const s of servers) {
      await s.stop();
    }
    servers.length = 0;
  });

  it('page=1 returns 20 records with correct totalPages', async () => {
    const res = await request(baseUrl)
      .get('/api/v1/gamelogs?page=1')
      .set('Authorization', `Bearer ${RAW_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(GAMELOGS_PAGE_SIZE); // 20
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: GAMELOGS_PAGE_SIZE,
      total: SEED_COUNT,
      totalPages: Math.ceil(SEED_COUNT / GAMELOGS_PAGE_SIZE), // 3
    });
    // First record on page 1 is the first seeded log.
    expect(res.body.data[0].id).toBe('log-000');
  });

  it('page=999 returns empty data with correct pagination metadata', async () => {
    const res = await request(baseUrl)
      .get('/api/v1/gamelogs?page=999')
      .set('Authorization', `Bearer ${RAW_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 999,
      pageSize: GAMELOGS_PAGE_SIZE,
      total: SEED_COUNT,
      totalPages: Math.ceil(SEED_COUNT / GAMELOGS_PAGE_SIZE), // 3
    });
  });

  it('rejects a request with a missing API key (401)', async () => {
    const res = await request(baseUrl).get('/api/v1/gamelogs?page=1');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// AuditStore + IpcRouter — command dispatched through the full router stack
// ===========================================================================

// The IpcRouter registers its command handler via ipcMain.on(). We mock the
// electron module so that (a) ipcMain captures the registered handler for us to
// invoke, and (b) app.getPath is stubbed for any module that needs it. The
// AuditStore is created with an in-memory SQLite DB (':memory:').

const capturedHandlers: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('electron', () => {
  return {
    ipcMain: {
      on: (channel: string, handler: (...args: unknown[]) => unknown) => {
        capturedHandlers[channel] = handler;
      },
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        capturedHandlers[channel] = handler;
      },
      removeHandler: () => {},
      removeListener: () => {},
      removeAllListeners: () => {},
    },
    dialog: {},
    app: {
      getPath: () => process.cwd(),
      getAppPath: () => process.cwd(),
      isPackaged: false,
    },
  };
});

describe('Integration: AuditStore + IpcRouter command dispatch', () => {
  it('writes an AuditEntry with correct actionType and entityId when an ADD_SCORE command is dispatched', async () => {
    // Import lazily so the electron mock is applied before module evaluation.
    const { createIpcRouter } = await import('../ipcRouter');
    const { createGameStore } = await import('../gameStore');
    const { createAuditStore } = await import('../auditStore');
    const { SCOREBOARD_COMMAND } = await import('../../shared/types');

    // In-memory audit DB — never touches disk.
    const auditStore = createAuditStore(':memory:');

    const gameStore = createGameStore();

    // Minimal stubs for the router's other collaborators. ADD_SCORE only needs
    // gameStore.dispatch/getState, autosaveStore.schedule, and windowManager
    // getters (which return null in this headless test).
    const noopWindowManager = {
      getControlPanelWindow: () => null,
      getScoreboardWindow: () => null,
      getShotClockWindow: () => null,
      getAvailableDisplays: () => [],
      assignScoreboardToDisplay: () => {},
      openScoreboard: () => {},
      onDisplayAdded: () => {},
      onDisplayRemoved: () => {},
    } as unknown as Parameters<typeof createIpcRouter>[2];

    const noopClockEngine = {
      startGameClock: () => {},
      stopGameClock: () => {},
      startShotClock: () => {},
      stopShotClock: () => {},
      startTimeoutClock: () => {},
      stopTimeoutClock: () => {},
    } as unknown as Parameters<typeof createIpcRouter>[1];

    const noopPresetStore = {
      list: () => [],
      save: () => {},
      delete: () => {},
    } as unknown as Parameters<typeof createIpcRouter>[3];

    const noopLigaStore = {} as unknown as Parameters<typeof createIpcRouter>[4];

    const noopAutosaveStore = {
      schedule: () => {},
      read: () => null,
      clear: () => {},
    } as unknown as Parameters<typeof createIpcRouter>[5];

    // getSession supplies the acting user for the audit entry. No roleStore is
    // passed, so RBAC is skipped and the command dispatches unconditionally.
    const getSession = () => ({ username: 'scorekeeper1', role: 'Scorekeeper' as const });

    const router = createIpcRouter(
      gameStore,
      noopClockEngine,
      noopWindowManager,
      noopPresetStore,
      noopLigaStore,
      noopAutosaveStore,
      auditStore,
      getSession,
    );

    // The router registered a command handler on SCOREBOARD_COMMAND.
    const handler = capturedHandlers[SCOREBOARD_COMMAND];
    expect(handler).toBeTypeOf('function');

    // Fake IpcMainEvent — sender.id keys the (unused) session map; sender.send
    // is a no-op for events emitted back to the renderer.
    const fakeEvent = {
      sender: { id: 1, send: () => {} },
    };

    // Dispatch a scoreboard:command through the full router stack.
    handler(fakeEvent, { type: 'ADD_SCORE', team: 'home', points: 2 });

    // The audit write is synchronous (better-sqlite3), so we can query at once.
    const entries = auditStore.query({});
    const scoreEntry = entries.find((e) => e.actionType === 'ADD_SCORE');

    expect(scoreEntry).toBeDefined();
    expect(scoreEntry!.actionType).toBe('ADD_SCORE');
    // extractEntityId prefers `team` for ADD_SCORE (no playerId present).
    expect(scoreEntry!.entityId).toBe('home');
    expect(scoreEntry!.username).toBe('scorekeeper1');
    expect(scoreEntry!.role).toBe('Scorekeeper');

    router.dispose();
    auditStore.close();
  });
});
