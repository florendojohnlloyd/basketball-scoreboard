/**
 * ApiServer — local read-only REST API with Bearer-token authentication (Requirement 34)
 *
 * An Express application that exposes live and historical game data to external
 * integrations. It is strictly read-only — no endpoint mutates game state.
 *
 * Features:
 *  - Starts on a configurable port in range 1024–65535 (default 3000). If the
 *    port is already in use at startup, emits API_PORT_CONFLICT to the Control
 *    Panel via the onPortConflict callback and does not bind.
 *  - Bearer-token middleware: extracts `Authorization: Bearer <key>`, SHA-256
 *    hashes the presented key, and compares it to the active key hashes loaded
 *    from electron-store. Missing/invalid keys receive HTTP 401 { success: false }.
 *  - Rate limiting: 60 requests/minute per API key; 429 with Retry-After header.
 *  - OpenAPI 3.0 docs served at /docs via swagger-ui-express.
 *  - Every request produces an Audit Log entry (UTC timestamp, path, status,
 *    API key label) via the onRequest callback.
 */

import { createServer, type Server as HttpServer } from 'http';
import { createHash } from 'crypto';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import type { GameState, GameLogRecord, ApiKey } from '../shared/types';
import { computeSeasonAverages } from './analytics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_API_PORT = 3000;
export const GAMELOGS_PAGE_SIZE = 20;
export const RATE_LIMIT_MAX = 60;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Response envelope (Requirement 34.6 — camelCase, application/json)
// ---------------------------------------------------------------------------

export interface ApiPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: ApiPagination;
}

// ---------------------------------------------------------------------------
// Audit record for each request (Requirement 34.7)
// ---------------------------------------------------------------------------

export interface ApiRequestAudit {
  timestamp: string;    // ISO 8601 UTC
  path: string;         // endpoint path
  status: number;       // HTTP status code returned
  keyLabel: string;     // label of the API key used ('' when unauthenticated)
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ApiServer {
  /** Start Express on the given port. Rejects on invalid port or port conflict. */
  start(port: number): Promise<void>;
  /** Stop the server and release the port. */
  stop(): Promise<void>;
  /** Whether the server is currently listening. */
  isRunning(): boolean;
  /** The bound port (0 when not running). */
  getPort(): number;
}

// ---------------------------------------------------------------------------
// Options — dependencies are injected so the module is testable in isolation
// ---------------------------------------------------------------------------

export interface ApiServerOptions {
  /** Returns the current live game state. */
  getState: () => GameState;
  /** Returns all saved game logs for the current Liga (unpaginated). */
  getGameLogs: () => GameLogRecord[];
  /** Returns the active API keys (hashes) loaded from electron-store. */
  getApiKeys: () => ApiKey[];
  /** Called for every completed request to write an Audit Log entry. */
  onRequest?: (audit: ApiRequestAudit) => void;
  /** Called when the configured port is already in use at startup. */
  onPortConflict?: (port: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isValidApiPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/** SHA-256 hash of a raw API key, hex-encoded. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Extract the Bearer token from an Authorization header, or null if absent/malformed. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Project the live game state into the read-only shape exposed by
 * GET /api/v1/game/state (scores, clocks, period, team fouls, timeouts).
 */
function projectGameState(state: GameState): unknown {
  const projectTeam = (team: GameState['home']): unknown => ({
    name: team.config.name,
    score: team.score,
    fouls: team.fouls,
    timeouts: {
      fullRemaining: team.timeouts.fullRemaining,
      twentyRemaining: team.timeouts.twentyRemaining,
    },
  });

  return {
    gamePhase: state.gamePhase,
    ligaId: state.ligaId,
    ligaName: state.ligaName,
    home: projectTeam(state.home),
    away: projectTeam(state.away),
    gameClock: {
      displayMs: state.gameClock.displayMs,
      running: state.gameClock.running,
    },
    shotClock: {
      displayMs: state.shotClock.displayMs,
      running: state.shotClock.running,
      enabled: state.shotClock.enabled,
    },
    period: {
      current: state.period.current,
      format: state.period.format,
      isOvertime: state.period.isOvertime,
      overtimeNumber: state.period.overtimeNumber,
    },
    possession: state.possession,
  };
}

/** Project the active player stats for the current game. */
function projectPlayers(state: GameState): unknown {
  const projectTeam = (team: GameState['home']): unknown => ({
    name: team.config.name,
    players: team.players.map((p) => ({
      id: p.id,
      number: p.number,
      name: p.name,
      points: p.points,
      rebounds: p.rebounds,
      assists: p.assists,
      steals: p.steals,
      blocks: p.blocks,
      fouls: p.fouls,
      fouledOut: p.fouledOut,
      fga: p.fga,
      fgm: p.fgm,
      active: p.active,
    })),
  });

  return {
    home: projectTeam(state.home),
    away: projectTeam(state.away),
  };
}

// ---------------------------------------------------------------------------
// OpenAPI 3.0 specification (served at /docs)
// ---------------------------------------------------------------------------

export function buildOpenApiSpec(): Record<string, unknown> {
  const jsonResponse = (description: string) => ({
    description,
    content: { 'application/json': { schema: { type: 'object' } } },
  });

  const secured = [{ bearerAuth: [] }];

  return {
    openapi: '3.0.0',
    info: {
      title: 'LigaControl REST API',
      version: '1.0.0',
      description: 'Read-only access to live and historical basketball game data.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
    security: secured,
    paths: {
      '/game/state': {
        get: {
          summary: 'Current game state',
          description: 'Scores, clocks, period, team fouls, and timeouts for the active game.',
          security: secured,
          responses: {
            200: jsonResponse('Current game state'),
            401: jsonResponse('Missing or invalid API key'),
            429: jsonResponse('Rate limit exceeded'),
          },
        },
      },
      '/game/players': {
        get: {
          summary: 'Active player stats',
          description: 'Per-player stats for both teams in the current game.',
          security: secured,
          responses: {
            200: jsonResponse('Player stats'),
            401: jsonResponse('Missing or invalid API key'),
            429: jsonResponse('Rate limit exceeded'),
          },
        },
      },
      '/gamelogs': {
        get: {
          summary: 'Saved game logs (paginated)',
          description: 'Paginated saved game logs, 20 records per page.',
          security: secured,
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, default: 1 },
            },
          ],
          responses: {
            200: jsonResponse('Paginated game logs'),
            401: jsonResponse('Missing or invalid API key'),
            429: jsonResponse('Rate limit exceeded'),
          },
        },
      },
      '/season/averages': {
        get: {
          summary: 'Season averages',
          description: 'Season averages for the current Liga.',
          security: secured,
          responses: {
            200: jsonResponse('Season averages'),
            401: jsonResponse('Missing or invalid API key'),
            429: jsonResponse('Rate limit exceeded'),
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApiServer(options: ApiServerOptions): ApiServer {
  const { getState, getGameLogs, getApiKeys, onRequest, onPortConflict } = options;

  let httpServer: HttpServer | null = null;
  let running = false;
  let currentPort = 0;

  // -- Audit hook: records the final status once the response is sent --------
  function attachAudit(req: Request, res: Response): void {
    res.on('finish', () => {
      if (!onRequest) return;
      const keyLabel = (req as Request & { apiKeyLabel?: string }).apiKeyLabel ?? '';
      onRequest({
        timestamp: new Date().toISOString(),
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        keyLabel,
      });
    });
  }

  // -- Bearer-token authentication middleware (Requirement 34.3, 34.5) -------
  function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    attachAudit(req, res);

    const token = extractBearerToken(req.header('authorization'));
    if (!token) {
      res.status(401).json({ success: false, error: 'Missing API key' } as ApiResponse<never>);
      return;
    }

    const presentedHash = hashApiKey(token);
    // Reload keys on every request so revocation takes effect immediately.
    const activeKeys = getApiKeys().filter((k) => k.active);
    const matched = activeKeys.find((k) => timingSafeEqualHex(k.keyHash, presentedHash));

    if (!matched) {
      res.status(401).json({ success: false, error: 'Invalid API key' } as ApiResponse<never>);
      return;
    }

    // Stash the label + key for downstream rate-limiting and auditing.
    (req as Request & { apiKeyLabel?: string; apiKeyId?: string }).apiKeyLabel = matched.label;
    (req as Request & { apiKeyId?: string }).apiKeyId = matched.id;
    next();
  }

  // -- Rate limiter: 60 req/min per API key (Requirement 34.8) ---------------
  const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    // Key by API key id (all requests are local, so IP is not meaningful).
    keyGenerator: (req: Request): string =>
      (req as Request & { apiKeyId?: string }).apiKeyId ?? 'anonymous',
    handler: (req: Request, res: Response): void => {
      const retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
      } as ApiResponse<never>);
    },
  });

  function buildApp(): Express {
    const app = express();
    app.disable('x-powered-by');

    // OpenAPI docs — public (no auth) so integrators can discover the API.
    const spec = buildOpenApiSpec();
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

    // All /api routes require auth, then rate limiting.
    app.use('/api', authMiddleware, limiter);

    const router = express.Router();

    // GET /api/v1/game/state
    router.get('/game/state', (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        data: projectGameState(getState()),
      } as ApiResponse<unknown>);
    });

    // GET /api/v1/game/players
    router.get('/game/players', (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        data: projectPlayers(getState()),
      } as ApiResponse<unknown>);
    });

    // GET /api/v1/gamelogs?page=1  (20 records/page)
    router.get('/gamelogs', (req: Request, res: Response) => {
      const rawPage = Number(req.query.page ?? 1);
      const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

      const logs = getGameLogs();
      const total = logs.length;
      const totalPages = Math.max(1, Math.ceil(total / GAMELOGS_PAGE_SIZE));
      const start = (page - 1) * GAMELOGS_PAGE_SIZE;
      const pageItems = logs.slice(start, start + GAMELOGS_PAGE_SIZE);

      res.status(200).json({
        success: true,
        data: pageItems,
        pagination: { page, pageSize: GAMELOGS_PAGE_SIZE, total, totalPages },
      } as ApiResponse<GameLogRecord[]>);
    });

    // GET /api/v1/season/averages
    router.get('/season/averages', (_req: Request, res: Response) => {
      const averages = computeSeasonAverages(getGameLogs());
      res.status(200).json({
        success: true,
        data: averages,
      } as ApiResponse<unknown>);
    });

    app.use('/api/v1', router);

    // Any other /api route → 404 (still JSON).
    app.use('/api', (_req: Request, res: Response) => {
      res.status(404).json({ success: false, error: 'Not found' } as ApiResponse<never>);
    });

    return app;
  }

  async function start(port: number): Promise<void> {
    if (running) {
      await stop();
    }

    if (!isValidApiPort(port)) {
      throw new Error(`Invalid port: ${port}. Must be in range 1024–65535.`);
    }

    const app = buildApp();
    httpServer = createServer(app);

    return new Promise<void>((resolve, reject) => {
      httpServer!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          running = false;
          currentPort = 0;
          httpServer = null;
          if (onPortConflict) onPortConflict(port);
          reject(new Error(`API_PORT_CONFLICT: Port ${port} is already in use.`));
        } else {
          reject(err);
        }
      });

      httpServer!.listen(port, () => {
        running = true;
        currentPort = port;
        resolve();
      });
    });
  }

  async function stop(): Promise<void> {
    if (!running || !httpServer) {
      running = false;
      currentPort = 0;
      httpServer = null;
      return;
    }
    return new Promise<void>((resolve) => {
      httpServer!.close(() => {
        httpServer = null;
        running = false;
        currentPort = 0;
        resolve();
      });
    });
  }

  function isRunning(): boolean {
    return running;
  }

  function getPort(): number {
    return currentPort;
  }

  return { start, stop, isRunning, getPort };
}

// ---------------------------------------------------------------------------
// Constant-time hex string comparison (avoids leaking match position via timing)
// ---------------------------------------------------------------------------

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
