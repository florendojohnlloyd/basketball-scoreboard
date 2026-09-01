/**
 * ApiServer tests — Requirement 34 (Task 73)
 *
 * Verifies the read-only REST API: lifecycle, port conflict, Bearer-token
 * authentication (401 on missing/invalid, immediate revocation), read routes,
 * JSON Content-Type, gamelogs pagination, and audit-hook invocation.
 *
 * Uses the built-in fetch client against a real server instance on a unique
 * port per test (same pattern as overlayServer.test.ts).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  createApiServer,
  hashApiKey,
  extractBearerToken,
  isValidApiPort,
  GAMELOGS_PAGE_SIZE,
  RATE_LIMIT_MAX,
  type ApiServer,
  type ApiServerOptions,
  type ApiRequestAudit,
} from '../apiServer';
import { DEFAULT_GAME_STATE, type GameState, type GameLogRecord, type ApiKey } from '../../shared/types';

// Unique port per test to avoid EADDRINUSE flakiness.
let portCounter = 21400;
function nextPort(): number {
  return portCounter++;
}

const RAW_KEY = 'test-key-abc-123';

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key-1',
    label: 'Integration Partner',
    keyHash: hashApiKey(RAW_KEY),
    createdAt: new Date().toISOString(),
    active: true,
    ...overrides,
  };
}

function makeGameLog(id: string): GameLogRecord {
  return {
    id,
    ligaId: 'liga-1',
    date: new Date().toISOString(),
    homeTeam: 'Home',
    awayTeam: 'Away',
    finalScores: { home: 80, away: 75 },
    playerStats: {},
    events: [],
    periodSnapshots: [],
  };
}

describe('ApiServer', () => {
  const servers: ApiServer[] = [];

  function makeServer(opts: Partial<ApiServerOptions> = {}): ApiServer {
    const state: GameState = opts.getState ? opts.getState() : DEFAULT_GAME_STATE();
    const s = createApiServer({
      getState: opts.getState ?? (() => state),
      getGameLogs: opts.getGameLogs ?? (() => []),
      getApiKeys: opts.getApiKeys ?? (() => [makeKey()]),
      onRequest: opts.onRequest,
      onPortConflict: opts.onPortConflict,
    });
    servers.push(s);
    return s;
  }

  afterEach(async () => {
    for (const s of servers) {
      await s.stop();
    }
    servers.length = 0;
  });

  function authGet(port: number, path: string, key = RAW_KEY): Promise<Response> {
    return fetch(`http://localhost:${port}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
  }

  // ── Pure helpers ──

  it('isValidApiPort accepts 1024–65535 and rejects out of range', () => {
    expect(isValidApiPort(3000)).toBe(true);
    expect(isValidApiPort(1024)).toBe(true);
    expect(isValidApiPort(65535)).toBe(true);
    expect(isValidApiPort(1023)).toBe(false);
    expect(isValidApiPort(65536)).toBe(false);
    expect(isValidApiPort(3000.5)).toBe(false);
  });

  it('hashApiKey produces a stable SHA-256 hex digest', () => {
    const h1 = hashApiKey('abc');
    const h2 = hashApiKey('abc');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey('abc')).not.toBe(hashApiKey('abd'));
  });

  it('extractBearerToken parses valid headers and rejects malformed ones', () => {
    expect(extractBearerToken('Bearer xyz')).toBe('xyz');
    expect(extractBearerToken('bearer xyz')).toBe('xyz');
    expect(extractBearerToken('Basic xyz')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
  });

  // ── Lifecycle ──

  it('starts and reports running state and port', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);
    expect(server.isRunning()).toBe(true);
    expect(server.getPort()).toBe(port);
  });

  it('stops and reports not running', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);
    await server.stop();
    expect(server.isRunning()).toBe(false);
    expect(server.getPort()).toBe(0);
  });

  it('rejects invalid ports', async () => {
    const server = makeServer();
    await expect(server.start(80)).rejects.toThrow('Invalid port');
    await expect(server.start(70000)).rejects.toThrow('Invalid port');
  });

  it('emits API_PORT_CONFLICT and does not bind when the port is in use', async () => {
    const port = nextPort();
    const onConflict = vi.fn();
    const server1 = makeServer();
    const server2 = makeServer({ onPortConflict: onConflict });

    await server1.start(port);
    await expect(server2.start(port)).rejects.toThrow('API_PORT_CONFLICT');
    expect(onConflict).toHaveBeenCalledWith(port);
    expect(server2.isRunning()).toBe(false);
  });

  // ── Authentication (Req 34.3) ──

  it('returns 401 { success: false } when the Authorization header is missing', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const res = await fetch(`http://localhost:${port}/api/v1/game/state`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 for an invalid (non-matching) key', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const res = await authGet(port, '/api/v1/game/state', 'wrong-key');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('rejects a revoked key immediately (active flag flipped in-memory)', async () => {
    const port = nextPort();
    let active = true;
    const server = makeServer({
      getApiKeys: () => [makeKey({ active })],
    });
    await server.start(port);

    // Valid while active.
    const ok = await authGet(port, '/api/v1/game/state');
    expect(ok.status).toBe(200);

    // Revoke and retry — must be rejected on the very next request.
    active = false;
    const revoked = await authGet(port, '/api/v1/game/state');
    expect(revoked.status).toBe(401);
  });

  // ── Read routes ──

  it('GET /api/v1/game/state returns current state with JSON Content-Type', async () => {
    const port = nextPort();
    const state = DEFAULT_GAME_STATE();
    state.home.score = 42;
    state.away.score = 37;
    state.home.fouls = 3;
    const server = makeServer({ getState: () => state });
    await server.start(port);

    const res = await authGet(port, '/api/v1/game/state');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.home.score).toBe(42);
    expect(body.data.away.score).toBe(37);
    expect(body.data.home.fouls).toBe(3);
    expect(body.data.period.current).toBe(state.period.current);
    expect(body.data.home.timeouts.fullRemaining).toBe(state.home.timeouts.fullRemaining);
  });

  it('GET /api/v1/game/players returns per-team player stats', async () => {
    const port = nextPort();
    const state = DEFAULT_GAME_STATE();
    state.home.players = [
      {
        id: 'p1', number: '10', name: 'Alice', fouls: 2, points: 14, rebounds: 5,
        assists: 3, active: true, fouledOut: false, steals: 1, blocks: 0,
        fga: 10, fgm: 5, minutesPlayed: 600, substitutions: [], photoPath: null,
      },
    ];
    const server = makeServer({ getState: () => state });
    await server.start(port);

    const res = await authGet(port, '/api/v1/game/players');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.home.players).toHaveLength(1);
    expect(body.data.home.players[0].name).toBe('Alice');
    expect(body.data.home.players[0].points).toBe(14);
  });

  it('GET /api/v1/gamelogs paginates 20 per page with correct metadata', async () => {
    const port = nextPort();
    const logs = Array.from({ length: 45 }, (_, i) => makeGameLog(`log-${i}`));
    const server = makeServer({ getGameLogs: () => logs });
    await server.start(port);

    const page1 = await (await authGet(port, '/api/v1/gamelogs?page=1')).json();
    expect(page1.data).toHaveLength(GAMELOGS_PAGE_SIZE);
    expect(page1.pagination).toEqual({ page: 1, pageSize: 20, total: 45, totalPages: 3 });

    const page3 = await (await authGet(port, '/api/v1/gamelogs?page=3')).json();
    expect(page3.data).toHaveLength(5);
  });

  it('GET /api/v1/gamelogs returns HTTP 200 with empty array beyond the last page (Req 34.2)', async () => {
    const port = nextPort();
    const logs = Array.from({ length: 5 }, (_, i) => makeGameLog(`log-${i}`));
    const server = makeServer({ getGameLogs: () => logs });
    await server.start(port);

    const res = await authGet(port, '/api/v1/gamelogs?page=999');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(5);
  });

  it('GET /api/v1/season/averages returns computed season stats', async () => {
    const port = nextPort();
    const logs = [makeGameLog('log-0')];
    const server = makeServer({ getGameLogs: () => logs });
    await server.start(port);

    const res = await authGet(port, '/api/v1/season/averages');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('playerAverages');
    expect(body.data).toHaveProperty('homeTeamAverages');
  });

  it('serves OpenAPI docs at /docs without authentication', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    // swagger-ui redirects /docs → /docs/ ; follow it.
    const res = await fetch(`http://localhost:${port}/docs/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('swagger');
  });

  // ── Audit hook (Req 34.7) ──

  it('invokes onRequest with path, status, and key label for each request', async () => {
    const port = nextPort();
    const audits: ApiRequestAudit[] = [];
    const server = makeServer({ onRequest: (a) => audits.push(a) });
    await server.start(port);

    await authGet(port, '/api/v1/game/state');
    // Give the 'finish' event a tick to fire.
    await new Promise<void>((r) => setTimeout(r, 20));

    const entry = audits.find((a) => a.path === '/api/v1/game/state');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe(200);
    expect(entry!.keyLabel).toBe('Integration Partner');
    expect(entry!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('audits unauthenticated requests with an empty key label and 401 status', async () => {
    const port = nextPort();
    const audits: ApiRequestAudit[] = [];
    const server = makeServer({ onRequest: (a) => audits.push(a) });
    await server.start(port);

    await fetch(`http://localhost:${port}/api/v1/game/state`);
    await new Promise<void>((r) => setTimeout(r, 20));

    const entry = audits.find((a) => a.path === '/api/v1/game/state');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe(401);
    expect(entry!.keyLabel).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Property-based tests (Requirement 34) — fast-check
// ─────────────────────────────────────────────────────────────────────────

describe('ApiServer — property-based', () => {
  const pbtServers: ApiServer[] = [];
  let pbtPort = 21600;

  function nextPbtPort(): number {
    return pbtPort++;
  }

  function makePbtServer(opts: Partial<ApiServerOptions> = {}): ApiServer {
    const state: GameState = opts.getState ? opts.getState() : DEFAULT_GAME_STATE();
    const s = createApiServer({
      getState: opts.getState ?? (() => state),
      getGameLogs: opts.getGameLogs ?? (() => []),
      getApiKeys: opts.getApiKeys ?? (() => [makeKey()]),
      onRequest: opts.onRequest,
      onPortConflict: opts.onPortConflict,
    });
    pbtServers.push(s);
    return s;
  }

  afterEach(async () => {
    for (const s of pbtServers) {
      await s.stop();
    }
    pbtServers.length = 0;
  });

  // Feature: basketball-scoreboard, Property 36
  // For any endpoint path and any Authorization header value that is absent,
  // not in `Bearer <key>` format, or a key that does not match an active key,
  // the server responds with HTTP 401 and a JSON body { success: false }.
  // Validates: Requirements 34.3
  it('Property 36: returns 401 { success: false } for any missing or invalid API key', async () => {
    const port = nextPbtPort();
    const server = makePbtServer(); // active key is hashApiKey(RAW_KEY)
    await server.start(port);

    // The only string that must NOT appear as a Bearer token is the real raw key.
    const nonMatchingKey = fc
      .string({ minLength: 0, maxLength: 40 })
      .filter((s) => s !== RAW_KEY);

    // Arbitrary Authorization header shapes that should all fail auth:
    //  - no header at all
    //  - a raw (non-Bearer) value
    //  - a malformed scheme (e.g. "Basic ...", "Token ...")
    //  - a valid "Bearer <key>" where <key> does not match any active key
    const badHeader = fc.oneof(
      fc.constant<string | undefined>(undefined),
      nonMatchingKey.map((k) => k), // raw value, no scheme
      fc
        .tuple(
          fc.constantFrom('Basic', 'Token', 'bearer-x', 'Digest'),
          nonMatchingKey,
        )
        .map(([scheme, k]) => `${scheme} ${k}`),
      nonMatchingKey.map((k) => `Bearer ${k}`),
    );

    const endpoint = fc.constantFrom(
      '/api/v1/game/state',
      '/api/v1/game/players',
      '/api/v1/gamelogs',
      '/api/v1/season/averages',
      '/api/v1/unknown',
    );

    await fc.assert(
      fc.asyncProperty(badHeader, endpoint, async (header, path) => {
        const headers: Record<string, string> = {};
        if (header !== undefined) headers.Authorization = header;
        const res = await fetch(`http://localhost:${port}${path}`, { headers });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: basketball-scoreboard, Property 37
  // For a single valid API key and N in [61, 200] requests within the 60s
  // window, the 61st and every subsequent request returns HTTP 429 with a
  // positive-integer Retry-After header. Rate limit is 60/min per key.
  // Validates: Requirements 34.8
  it('Property 37: returns 429 with a positive Retry-After after the rate limit is exceeded', async () => {
    // Each fast-check run starts a fresh server (fresh rate-limit window/counter)
    // and fires N sequential authenticated requests against it.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: RATE_LIMIT_MAX + 1, max: 200 }), async (n) => {
        const port = nextPbtPort();
        const server = makePbtServer();
        await server.start(port);
        try {
          for (let i = 1; i <= n; i++) {
            const res = await authGetPbt(port, '/api/v1/game/state');
            // Drain the body so the socket is released promptly.
            await res.text();
            if (i <= RATE_LIMIT_MAX) {
              expect(res.status).toBe(200);
            } else {
              expect(res.status).toBe(429);
              const retryAfter = res.headers.get('retry-after');
              expect(retryAfter).not.toBeNull();
              const seconds = Number(retryAfter);
              expect(Number.isInteger(seconds)).toBe(true);
              expect(seconds).toBeGreaterThan(0);
            }
          }
        } finally {
          await server.stop();
        }
      }),
      // Real HTTP round-trips: up to 200 requests per run make large numRuns
      // prohibitively slow. A small run count still exercises the full [61,200]
      // range via fast-check's shrinking + boundary sampling.
      { numRuns: 8 },
    );
  }, 60_000);

  function authGetPbt(port: number, path: string, key = RAW_KEY): Promise<Response> {
    return fetch(`http://localhost:${port}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
  }
});
