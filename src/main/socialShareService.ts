/**
 * SocialShareService — OAuth 2.0 (PKCE) authorization and social post dispatch (Requirement 35)
 *
 * Handles OAuth 2.0 authorization-code + PKCE flows and post dispatch for
 * Twitter/X and Facebook. OAuth tokens are stored encrypted via Electron's
 * `safeStorage` API (AES-256, backed by the OS credential store on Windows).
 * Token refresh is attempted silently using the stored refresh token before
 * any share action; if refresh fails the caller is told to re-authorize
 * (SHARE_OAUTH_FAILED event / thrown re-auth error).
 *
 * The OAuth callback arrives via the custom URL scheme
 * `ligacontrol://oauth-callback` (registered at app startup). When the OS opens
 * the app with this scheme after browser authorization, the main process
 * forwards the URL to handleOAuthCallback() to complete the PKCE code exchange.
 *
 * Screenshots are produced by the scoreboard BrowserWindow's `capturePage()`
 * (works whether or not the Display Monitor is connected). Attaching an image
 * on a platform that lacks image support falls back to a text-only post plus a
 * non-blocking notification (Req 35.8).
 *
 * Every completed share attempt writes an Audit Log entry with the UTC
 * timestamp, platform, and success/failure reason (Req 35.9).
 *
 * All external dependencies (HTTP client, browser opener, safeStorage, token
 * persistence, audit logging, screenshot capture) are injectable so the service
 * is fully testable without Electron or network access — mirroring the DI
 * factory style of offlineSyncService.ts / cloudSyncService.ts.
 */

import crypto from 'crypto';
import { SCOREBOARD_EVENT } from '../shared/types';
import type {
  BrowserWindow,
} from 'electron';
import type {
  GameState,
  SocialPlatform,
  SocialTokenStatus,
  AuditEntry,
} from '../shared/types';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SocialShareService {
  /**
   * Begin the OAuth 2.0 authorization-code + PKCE flow: builds the authorization
   * URL (with a fresh PKCE verifier/challenge and CSRF state) and opens it in the
   * system default browser. Does not block; completion happens via
   * handleOAuthCallback().
   */
  initiateOAuth(platform: SocialPlatform): void;

  /**
   * Complete the OAuth code exchange from a `ligacontrol://oauth-callback` URL.
   * Validates the CSRF state, exchanges the authorization code for tokens using
   * the stored PKCE verifier, and persists the tokens encrypted. Emits
   * SHARE_OAUTH_COMPLETE on success or SHARE_OAUTH_FAILED on failure.
   */
  handleOAuthCallback(url: string): Promise<void>;

  /**
   * Format a share text summary from the current game state (Req 35.2 / Property 38).
   * Always contains the Liga name, both team names, both integer scores, and either
   * the current period label or "Final" when the game is in the post-game phase.
   */
  generateShareText(state: GameState): string;

  /**
   * Capture a PNG screenshot of the scoreboard BrowserWindow. Works even when no
   * Display Monitor is connected because the window exists in memory (Req 35.7).
   */
  captureScreenshot(): Promise<Buffer>;

  /**
   * Post text (and, optionally, a PNG screenshot) to the given platform. Attempts
   * a silent token refresh first when the stored token is expired; if refresh
   * fails the caller must re-authorize. Falls back to text-only when the platform
   * lacks image support (Req 35.8). Always writes an audit entry (Req 35.9) and
   * emits SHARE_POST_COMPLETE.
   */
  sharePost(platform: SocialPlatform, text: string, imagePng?: Buffer): Promise<void>;

  /** Current token status for a platform. */
  getTokenStatus(platform: SocialPlatform): SocialTokenStatus;

  /** Remove the stored token for a platform (e.g. operator disconnects). */
  revokeToken(platform: SocialPlatform): void;

  /** Dispose of any in-flight OAuth sessions. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Injectable collaborators
// ---------------------------------------------------------------------------

/** OAuth token set persisted per platform. */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** ms-since-epoch expiry time; undefined means no known expiry. */
  expiresAt?: number;
}

/** Response returned by an OAuth token endpoint. */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  /** lifetime in seconds */
  expires_in?: number;
}

/**
 * Persists encrypted tokens. In production this is backed by `safeStorage` +
 * an on-disk encrypted blob; in tests it can be an in-memory implementation.
 */
export interface TokenStore {
  get(platform: SocialPlatform): StoredToken | null;
  set(platform: SocialPlatform, token: StoredToken): void;
  delete(platform: SocialPlatform): void;
}

/** Injectable HTTP client (abstracts Node's https for testability). */
export type HttpPostFn = (
  url: string,
  headers: Record<string, string>,
  body: string | Buffer,
) => Promise<{ status: number; body: string }>;

/** Injectable browser opener (abstracts Electron's shell.openExternal). */
export type BrowserOpenFn = (url: string) => void;

/** Injectable screenshot capturer (abstracts BrowserWindow.capturePage()). */
export type ScreenshotFn = () => Promise<Buffer>;

// ---------------------------------------------------------------------------
// Per-platform OAuth endpoint configuration
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  clientId: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** Endpoint for posting a text status. */
  postUrl: string;
  /** Endpoint for uploading an image; when absent the platform is text-only. */
  imageUploadUrl?: string;
  scopes: string[];
  /** Whether this platform supports image attachments (Req 35.8). */
  supportsImages: boolean;
}

export const DEFAULT_PLATFORM_CONFIG: Record<SocialPlatform, PlatformConfig> = {
  twitter: {
    clientId: '',
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    postUrl: 'https://api.twitter.com/2/tweets',
    imageUploadUrl: 'https://upload.twitter.com/1.1/media/upload.json',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    supportsImages: true,
  },
  facebook: {
    clientId: '',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    postUrl: 'https://graph.facebook.com/v19.0/me/feed',
    imageUploadUrl: 'https://graph.facebook.com/v19.0/me/photos',
    scopes: ['public_profile', 'pages_manage_posts'],
    supportsImages: true,
  },
};

const OAUTH_REDIRECT_URI = 'ligacontrol://oauth-callback';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SocialShareConfig {
  /** Per-platform OAuth endpoints/credentials. Defaults to DEFAULT_PLATFORM_CONFIG. */
  platformConfig?: Record<SocialPlatform, PlatformConfig>;

  /** Token persistence (defaults to a safeStorage-backed store). */
  tokenStore?: TokenStore;

  /** HTTP POST client (defaults to a Node https implementation). */
  httpPost?: HttpPostFn;

  /** Browser opener (defaults to Electron shell.openExternal). */
  openBrowser?: BrowserOpenFn;

  /** Screenshot capturer (defaults to scoreboard BrowserWindow.capturePage()). */
  captureScreenshot?: ScreenshotFn;

  /** Factory returning a snapshot of the current game state (for generateShareText). */
  getGameState?: () => GameState;

  /** Factory returning the scoreboard BrowserWindow (used by default screenshot fn). */
  getScoreboardWindow?: () => BrowserWindow | null;

  /** Factory returning the Control Panel BrowserWindow for IPC events. */
  getControlPanelWindow?: () => BrowserWindow | null;

  /** Audit-log sink (Req 35.9). */
  appendAudit?: (entry: AuditEntry) => void;

  /** Current operator identity for audit entries. */
  getCurrentUser?: () => { username: string; role: AuditEntry['role'] };

  /** Skew (ms) subtracted from expiry when deciding if a token is expired. Default 60000. */
  expirySkewMs?: number;
}

// ---------------------------------------------------------------------------
// safeStorage-backed token store (default)
// ---------------------------------------------------------------------------

/**
 * Builds the default TokenStore backed by Electron's `safeStorage` encryption
 * and an on-disk encrypted blob under {userData}/social-tokens.enc. Tokens are
 * NEVER written in plain text (Req 35.5). If Electron/safeStorage is unavailable
 * (e.g. test runtime), returns an in-memory store so the service still works.
 */
export function createSafeStorageTokenStore(filePath?: string): TokenStore {
  let safeStorage: Electron.SafeStorage | null = null;
  let resolvedPath = filePath ?? '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    safeStorage = electron.safeStorage as Electron.SafeStorage;
    if (!resolvedPath) {
      const { join } = require('path') as typeof import('path');
      const userDataDir = (electron.app as Electron.App).getPath('userData');
      resolvedPath = join(userDataDir, 'social-tokens.enc');
    }
  } catch {
    safeStorage = null;
  }

  // Fallback: pure in-memory store when safeStorage is not available.
  if (!safeStorage || !safeStorage.isEncryptionAvailable() || !resolvedPath) {
    const mem = new Map<SocialPlatform, StoredToken>();
    return {
      get: (p) => mem.get(p) ?? null,
      set: (p, t) => { mem.set(p, t); },
      delete: (p) => { mem.delete(p); },
    };
  }

  const fs = require('fs') as typeof import('fs');
  const enc = safeStorage;

  function readAll(): Partial<Record<SocialPlatform, StoredToken>> {
    try {
      if (!fs.existsSync(resolvedPath)) return {};
      const blob = fs.readFileSync(resolvedPath);
      const json = enc.decryptString(blob);
      return JSON.parse(json) as Partial<Record<SocialPlatform, StoredToken>>;
    } catch {
      return {};
    }
  }

  function writeAll(map: Partial<Record<SocialPlatform, StoredToken>>): void {
    try {
      const blob = enc.encryptString(JSON.stringify(map));
      fs.writeFileSync(resolvedPath, blob);
    } catch (err) {
      console.error('[SocialShareService] Failed to persist encrypted tokens:', err);
    }
  }

  return {
    get: (platform) => readAll()[platform] ?? null,
    set: (platform, token) => {
      const all = readAll();
      all[platform] = token;
      writeAll(all);
    },
    delete: (platform) => {
      const all = readAll();
      delete all[platform];
      writeAll(all);
    },
  };
}

// ---------------------------------------------------------------------------
// Default Node https POST implementation
// ---------------------------------------------------------------------------

function defaultHttpPost(): HttpPostFn {
  return (url, headers, body) =>
    new Promise((resolve, reject) => {
      let https: typeof import('https');
      try {
        https = require('https') as typeof import('https');
      } catch (err) {
        reject(err);
        return;
      }
      const u = new URL(url);
      const payload = typeof body === 'string' ? Buffer.from(body) : body;
      const req = https.request(
        {
          method: 'POST',
          hostname: u.hostname,
          path: u.pathname + u.search,
          port: u.port || 443,
          headers: {
            'Content-Length': String(payload.length),
            ...headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf-8'),
            });
          });
        },
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
}

// ---------------------------------------------------------------------------
// Period label helper (matches gameStore convention: Q<n> / OT<n>)
// ---------------------------------------------------------------------------

export function periodLabel(state: GameState): string {
  const p = state.period;
  if (p.isOvertime) {
    return p.overtimeNumber > 1 ? `OT${p.overtimeNumber}` : 'OT';
  }
  const unit = p.format === 'halves' ? 'H' : 'Q';
  return `${unit}${p.current}`;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSocialShareService(config: SocialShareConfig = {}): SocialShareService {
  const {
    platformConfig = DEFAULT_PLATFORM_CONFIG,
    getGameState,
    getScoreboardWindow,
    getControlPanelWindow,
    appendAudit,
    getCurrentUser,
    expirySkewMs = 60_000,
  } = config;

  const tokenStore = config.tokenStore ?? createSafeStorageTokenStore();
  const httpPost = config.httpPost ?? defaultHttpPost();
  const openBrowser: BrowserOpenFn =
    config.openBrowser ??
    ((url: string) => {
      try {
        const electron = require('electron');
        void (electron.shell as Electron.Shell).openExternal(url);
      } catch {
        console.warn('[SocialShareService] Cannot open browser — Electron shell unavailable');
      }
    });

  const captureFn: ScreenshotFn =
    config.captureScreenshot ??
    (async () => {
      const win = getScoreboardWindow?.();
      if (!win) {
        throw new Error('Scoreboard window is not available for screenshot capture');
      }
      const image = await win.webContents.capturePage();
      return image.toPNG();
    });

  let disposed = false;

  /** In-flight OAuth sessions keyed by CSRF state. */
  const pendingOAuth = new Map<
    string,
    { platform: SocialPlatform; verifier: string }
  >();

  // ── Helpers ──

  function sendEvent(payload: { type: string; [k: string]: unknown }): void {
    const win = getControlPanelWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(SCOREBOARD_EVENT, payload);
    }
  }

  function writeAudit(platform: SocialPlatform, success: boolean, reason?: string): void {
    if (!appendAudit) return;
    const user = getCurrentUser?.() ?? { username: 'unknown', role: 'Admin' as AuditEntry['role'] };
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      username: user.username,
      role: user.role,
      actionType: 'SHARE_POST',
      entityId: platform,
      previousValue: null,
      newValue: { platform, success, reason: reason ?? null },
    };
    try {
      appendAudit(entry);
    } catch (err) {
      console.error('[SocialShareService] Audit write failed:', err);
    }
  }

  function storeTokenFromResponse(platform: SocialPlatform, resp: OAuthTokenResponse): void {
    const token: StoredToken = {
      accessToken: resp.access_token,
      refreshToken: resp.refresh_token,
      expiresAt:
        typeof resp.expires_in === 'number'
          ? Date.now() + resp.expires_in * 1000
          : undefined,
    };
    tokenStore.set(platform, token);
  }

  function isExpired(token: StoredToken): boolean {
    if (token.expiresAt == null) return false;
    return Date.now() >= token.expiresAt - expirySkewMs;
  }

  /** Attempt a silent refresh. Returns the refreshed token or null on failure. */
  async function tryRefresh(platform: SocialPlatform, token: StoredToken): Promise<StoredToken | null> {
    if (!token.refreshToken) return null;
    const cfg = platformConfig[platform];
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: cfg.clientId,
      ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
    }).toString();

    try {
      const res = await httpPost(
        cfg.tokenUrl,
        { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      );
      if (res.status < 200 || res.status >= 300) return null;
      const parsed = JSON.parse(res.body) as OAuthTokenResponse;
      if (!parsed.access_token) return null;
      // Preserve the old refresh token if the response omits a new one.
      if (!parsed.refresh_token) parsed.refresh_token = token.refreshToken;
      storeTokenFromResponse(platform, parsed);
      return tokenStore.get(platform);
    } catch {
      return null;
    }
  }

  /**
   * Resolve a usable access token: valid → return; expired → refresh; missing or
   * refresh-failed → throw a re-authorization error.
   */
  async function ensureAccessToken(platform: SocialPlatform): Promise<string> {
    const token = tokenStore.get(platform);
    if (!token) {
      throw new ReauthorizationRequiredError(platform, 'No stored token — authorization required');
    }
    if (!isExpired(token)) {
      return token.accessToken;
    }
    const refreshed = await tryRefresh(platform, token);
    if (!refreshed) {
      throw new ReauthorizationRequiredError(platform, 'Token expired and silent refresh failed');
    }
    return refreshed.accessToken;
  }

  // ── Service object ──

  const service: SocialShareService = {
    initiateOAuth(platform: SocialPlatform): void {
      const cfg = platformConfig[platform];
      const { verifier, challenge } = generatePkce();
      const state = base64Url(crypto.randomBytes(16));
      pendingOAuth.set(state, { platform, verifier });

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: cfg.clientId,
        redirect_uri: OAUTH_REDIRECT_URI,
        scope: cfg.scopes.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      openBrowser(`${cfg.authorizeUrl}?${params.toString()}`);
    },

    async handleOAuthCallback(url: string): Promise<void> {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        sendEvent({ type: 'SHARE_OAUTH_FAILED', platform: 'twitter', error: 'Malformed callback URL' });
        return;
      }

      const state = parsed.searchParams.get('state') ?? '';
      const code = parsed.searchParams.get('code');
      const errParam = parsed.searchParams.get('error');
      const session = state ? pendingOAuth.get(state) : undefined;

      if (!session) {
        // CSRF state did not match a pending session — reject.
        sendEvent({
          type: 'SHARE_OAUTH_FAILED',
          platform: 'twitter',
          error: 'Unrecognized or expired authorization state',
        });
        return;
      }

      const { platform, verifier } = session;
      pendingOAuth.delete(state);

      if (errParam || !code) {
        sendEvent({
          type: 'SHARE_OAUTH_FAILED',
          platform,
          error: errParam ?? 'Authorization was cancelled or returned no code',
        });
        return;
      }

      const cfg = platformConfig[platform];
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: OAUTH_REDIRECT_URI,
        client_id: cfg.clientId,
        code_verifier: verifier,
        ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
      }).toString();

      try {
        const res = await httpPost(
          cfg.tokenUrl,
          { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        );
        if (res.status < 200 || res.status >= 300) {
          sendEvent({ type: 'SHARE_OAUTH_FAILED', platform, error: `Token endpoint returned ${res.status}` });
          return;
        }
        const parsedBody = JSON.parse(res.body) as OAuthTokenResponse;
        if (!parsedBody.access_token) {
          sendEvent({ type: 'SHARE_OAUTH_FAILED', platform, error: 'Token endpoint returned no access token' });
          return;
        }
        storeTokenFromResponse(platform, parsedBody);
        sendEvent({ type: 'SHARE_OAUTH_COMPLETE', platform });
      } catch (err) {
        sendEvent({ type: 'SHARE_OAUTH_FAILED', platform, error: String(err) });
      }
    },

    generateShareText(state: GameState): string {
      const ligaName = state.ligaName && state.ligaName.trim().length > 0 ? state.ligaName : 'Liga';
      const date = new Date().toISOString().slice(0, 10);
      const homeName = state.home.config.name || 'Home';
      const awayName = state.away.config.name || 'Away';
      const homeScore = Math.trunc(state.home.score);
      const awayScore = Math.trunc(state.away.score);
      const phaseLabel = state.gamePhase === 'post-game' ? 'Final' : periodLabel(state);

      return [
        `${ligaName} | ${date}`,
        `${homeName} ${homeScore} – ${awayScore} ${awayName}`,
        phaseLabel,
      ].join('\n');
    },

    captureScreenshot(): Promise<Buffer> {
      return captureFn();
    },

    async sharePost(platform: SocialPlatform, text: string, imagePng?: Buffer): Promise<void> {
      const cfg = platformConfig[platform];

      let accessToken: string;
      try {
        accessToken = await ensureAccessToken(platform);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        writeAudit(platform, false, reason);
        sendEvent({ type: 'SHARE_POST_COMPLETE', platform, success: false, error: reason });
        if (err instanceof ReauthorizationRequiredError) {
          sendEvent({ type: 'SHARE_OAUTH_FAILED', platform, error: reason });
        }
        throw err;
      }

      // Image fallback (Req 35.8): if the platform can't attach images, drop the
      // image and notify the operator (non-blocking).
      let effectiveImage = imagePng;
      if (effectiveImage && !cfg.supportsImages) {
        effectiveImage = undefined;
        sendEvent({
          type: 'SHARE_IMAGE_UNSUPPORTED',
          platform,
          message: `Image sharing is unavailable for ${platform}; posting text only.`,
        });
      }

      try {
        let mediaId: string | undefined;
        if (effectiveImage && cfg.imageUploadUrl) {
          mediaId = await uploadImage(cfg, accessToken, effectiveImage);
        }

        const postBody = JSON.stringify(
          mediaId
            ? { text, media: { media_ids: [mediaId] } }
            : { text },
        );
        const res = await httpPost(
          cfg.postUrl,
          {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          postBody,
        );

        if (res.status < 200 || res.status >= 300) {
          const reason = `Post endpoint returned ${res.status}`;
          writeAudit(platform, false, reason);
          sendEvent({ type: 'SHARE_POST_COMPLETE', platform, success: false, error: reason });
          throw new Error(reason);
        }

        writeAudit(platform, true);
        sendEvent({ type: 'SHARE_POST_COMPLETE', platform, success: true });
      } catch (err) {
        // uploadImage / network errors land here.
        const reason = err instanceof Error ? err.message : String(err);
        // Avoid double-auditing when we already audited a non-2xx above.
        if (!(err instanceof Error && err.message.startsWith('Post endpoint returned'))) {
          writeAudit(platform, false, reason);
          sendEvent({ type: 'SHARE_POST_COMPLETE', platform, success: false, error: reason });
        }
        throw err;
      }
    },

    getTokenStatus(platform: SocialPlatform): SocialTokenStatus {
      const token = tokenStore.get(platform);
      if (!token) return 'missing';
      return isExpired(token) ? 'expired' : 'valid';
    },

    revokeToken(platform: SocialPlatform): void {
      tokenStore.delete(platform);
    },

    dispose(): void {
      disposed = true;
      pendingOAuth.clear();
    },
  };

  // ── Multipart image upload helper ──
  async function uploadImage(
    cfg: PlatformConfig,
    accessToken: string,
    imagePng: Buffer,
  ): Promise<string> {
    if (!cfg.imageUploadUrl) {
      throw new Error('Platform has no image upload endpoint');
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FormData = require('form-data');
    const form = new FormData();
    form.append('media', imagePng, { filename: 'scoreboard.png', contentType: 'image/png' });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      ...form.getHeaders(),
    };
    const buffer: Buffer = form.getBuffer();
    const res = await httpPost(cfg.imageUploadUrl, headers, buffer);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Image upload returned ${res.status}`);
    }
    const parsed = JSON.parse(res.body) as { media_id_string?: string; media_id?: string | number; id?: string };
    const id = parsed.media_id_string ?? (parsed.media_id != null ? String(parsed.media_id) : parsed.id);
    if (!id) {
      throw new Error('Image upload returned no media id');
    }
    return id;
  }

  // Reference disposed to satisfy noUnusedLocals while keeping semantics clear.
  void disposed;

  return service;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown by sharePost when the platform must be (re-)authorized before posting. */
export class ReauthorizationRequiredError extends Error {
  readonly platform: SocialPlatform;
  constructor(platform: SocialPlatform, message: string) {
    super(message);
    this.name = 'ReauthorizationRequiredError';
    this.platform = platform;
  }
}
