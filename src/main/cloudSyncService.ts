/**
 * CloudSyncService — incremental TLS sync to a remote HTTPS endpoint (Requirement 32)
 *
 * Wraps Node's built-in `https` module (TLS 1.2+ enforced by OpenSSL on modern Node).
 * The service is disabled by default and only transmits records whose `lastModified`
 * timestamp is newer than the stored `lastSyncAt` checkpoint (kept in sync.db's
 * sync_meta table).
 *
 * Responsibilities:
 *  - configure(config): validate endpoint URL starts with https://; store API Key
 *    encrypted via Electron safeStorage.
 *  - testConnection(): POST to endpoint with a 10-second timeout.
 *  - syncNow(): collect records newer than lastSyncAt, batch-transmit as
 *    SyncEnvelope[] with an Authorization: Bearer <apiKey> header, update lastSyncAt
 *    on success, and log the result to the AuditStore.
 *  - startPeriodicSync()/stopPeriodicSync(): 5-minute full-poll interval.
 *  - triggerIncrementalSync(): 30-second debounced trigger for individual changes.
 *
 * On auth error (HTTP 401/403): automatic sync stops and CLOUD_SYNC_AUTH_ERROR is
 * emitted to the Control Panel.
 * On disable: all sync operations stop within 5 seconds; local data is untouched.
 * HTTP (non-TLS) endpoints are rejected at configuration time.
 */

import { URL } from 'url';
import type { BrowserWindow } from 'electron';
import { SCOREBOARD_EVENT } from '../shared/types';
import type { CloudSyncConfig, SyncEnvelope, SyncResult, AuditEntry } from '../shared/types';

// Conditionally import Electron safeStorage — not available in test environments.
let _safeStorage: {
  isEncryptionAvailable: () => boolean;
  encryptString: (plain: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  _safeStorage = electron.safeStorage ?? null;
} catch {
  _safeStorage = null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_MS = 30 * 1000; // 30 seconds
const TEST_CONNECTION_TIMEOUT_MS = 10 * 1000; // 10 seconds
const SYNC_REQUEST_TIMEOUT_MS = 60 * 1000; // 60 seconds
const LAST_SYNC_META_KEY = 'lastSyncAt';

// ---------------------------------------------------------------------------
// Injectable collaborators
// ---------------------------------------------------------------------------

/**
 * Supplies the records to be synchronised. Implementations query the local data
 * stores (liga files, game logs, rosters, audit log) and return an envelope per
 * record with its `lastModified` timestamp. CloudSyncService filters this set down
 * to records newer than the checkpoint before transmitting.
 */
export type RecordSource = () => SyncEnvelope[] | Promise<SyncEnvelope[]>;

/**
 * Low-level HTTPS transmitter. Given a fully-formed request, resolves with the
 * response status code and body text. Defaults to a Node `https` implementation
 * but can be injected for testing.
 */
export interface HttpsResponse {
  statusCode: number;
  body: string;
}

export type HttpsTransmitter = (opts: {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}) => Promise<HttpsResponse>;

/** Minimal AuditStore surface needed for logging sync results. */
export interface AuditLogSink {
  append(entry: AuditEntry): void;
}

/** Persists and reads the lastSyncAt checkpoint (backed by sync.db's sync_meta). */
export interface SyncCheckpointStore {
  getLastSyncAt(): string | null;
  setLastSyncAt(iso: string): void;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CloudSyncService {
  /**
   * Apply configuration. Throws if endpointUrl does not start with `https://`.
   * The API key is encrypted at rest via safeStorage. When enabled, starts the
   * periodic poll; when disabled, stops all sync activity.
   */
  configure(config: CloudSyncConfig): void;

  /** Current (sanitised) configuration — the API key is never returned in plaintext. */
  getConfig(): { enabled: boolean; endpointUrl: string; hasApiKey: boolean };

  /** POST to the endpoint with a 10-second timeout. */
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /**
   * Collect records newer than lastSyncAt, transmit them, update the checkpoint on
   * success and log to the audit store. Serialised so two syncs never run at once.
   */
  syncNow(): Promise<SyncResult>;

  /** Start the 5-minute full-poll interval (no-op when disabled). */
  startPeriodicSync(): void;

  /** Stop the periodic poll. */
  stopPeriodicSync(): void;

  /**
   * Schedule an incremental sync debounced by 30 seconds. Repeated calls within the
   * window collapse into a single sync.
   */
  triggerIncrementalSync(): void;

  /** Whether automatic sync is currently active. */
  isRunning(): boolean;

  /** Stop timers and in-flight scheduling. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Default Node https transmitter
// ---------------------------------------------------------------------------

/**
 * Default HTTPS transmitter built on Node's `https` module. Rejects on network
 * errors and on timeout. Uses TLS via OpenSSL (TLS 1.2+ on modern Node).
 */
export const defaultHttpsTransmitter: HttpsTransmitter = (opts) => {
  return new Promise<HttpsResponse>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const https = require('https') as typeof import('https');
    let parsed: URL;
    try {
      parsed = new URL(opts.url);
    } catch {
      reject(new Error(`Invalid endpoint URL: ${opts.url}`));
      return;
    }

    const bodyBuffer = Buffer.from(opts.body, 'utf-8');
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: opts.method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(bodyBuffer.length),
          ...opts.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      },
    );

    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${opts.timeoutMs}ms`));
    });
    req.on('error', (err) => reject(err));
    req.write(bodyBuffer);
    req.end();
  });
};

// ---------------------------------------------------------------------------
// Configuration for the factory
// ---------------------------------------------------------------------------

export interface CloudSyncServiceConfig {
  /** Factory to get the Control Panel BrowserWindow for sending IPC events. */
  getControlPanelWindow?: () => BrowserWindow | null;

  /** Supplies the syncable records. Required for syncNow() to transmit anything. */
  recordSource?: RecordSource;

  /** Low-level HTTPS transmitter. Defaults to Node's https module. */
  httpsTransmitter?: HttpsTransmitter;

  /** Sink for audit log entries describing each sync attempt. */
  auditStore?: AuditLogSink;

  /** Checkpoint store for lastSyncAt (backed by sync.db). */
  checkpointStore?: SyncCheckpointStore;

  /** Poll interval override (ms). Default: 5 minutes. */
  pollIntervalMs?: number;

  /** Debounce window override (ms). Default: 30 seconds. */
  debounceMs?: number;

  /**
   * Optional safeStorage override for testing. When omitted, uses Electron's
   * safeStorage if available, otherwise falls back to base64 (dev/test only).
   */
  _safeStorageOverride?: typeof _safeStorage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encrypt an API key to a storable string via safeStorage, or base64 fallback. */
function encryptApiKey(
  plain: string,
  storage: typeof _safeStorage,
): string {
  if (storage && storage.isEncryptionAvailable()) {
    return `enc:${storage.encryptString(plain).toString('base64')}`;
  }
  // Fallback (test/dev without OS keychain): base64, clearly marked as unencrypted.
  return `b64:${Buffer.from(plain, 'utf-8').toString('base64')}`;
}

/** Decrypt a stored API key produced by encryptApiKey(). */
function decryptApiKey(
  stored: string,
  storage: typeof _safeStorage,
): string {
  if (stored.startsWith('enc:')) {
    if (!storage) return '';
    return storage.decryptString(Buffer.from(stored.slice(4), 'base64'));
  }
  if (stored.startsWith('b64:')) {
    return Buffer.from(stored.slice(4), 'base64').toString('utf-8');
  }
  return stored;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCloudSyncService(config: CloudSyncServiceConfig = {}): CloudSyncService {
  const {
    getControlPanelWindow,
    recordSource,
    httpsTransmitter = defaultHttpsTransmitter,
    auditStore,
    checkpointStore,
    pollIntervalMs = POLL_INTERVAL_MS,
    debounceMs = DEBOUNCE_MS,
    _safeStorageOverride,
  } = config;

  const storage = _safeStorageOverride !== undefined ? _safeStorageOverride : _safeStorage;

  // ── State ──
  let enabled = false;
  let endpointUrl = '';
  let encryptedApiKey = ''; // stored encrypted; decrypted only when transmitting
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  // In-memory checkpoint fallback when no checkpointStore is injected.
  let inMemoryLastSyncAt: string | null = null;

  // Serialise sync operations so two never run in parallel.
  let syncChain: Promise<unknown> = Promise.resolve();

  // ── Send event to Control Panel helper ──
  function sendEvent(payload: { type: string; [k: string]: unknown }): void {
    const win = getControlPanelWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(SCOREBOARD_EVENT, payload);
    }
  }

  function getLastSyncAt(): string | null {
    if (checkpointStore) return checkpointStore.getLastSyncAt();
    return inMemoryLastSyncAt;
  }

  function setLastSyncAt(iso: string): void {
    if (checkpointStore) {
      checkpointStore.setLastSyncAt(iso);
    } else {
      inMemoryLastSyncAt = iso;
    }
  }

  function makeAuditEntry(result: SyncResult): AuditEntry {
    return {
      id: `cloudsync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: result.completedAt,
      username: 'system',
      role: 'Admin',
      actionType: 'CLOUD_SYNC',
      entityId: '',
      previousValue: { startedAt: result.startedAt },
      newValue: {
        success: result.success,
        recordsTransmitted: result.recordsTransmitted,
        completedAt: result.completedAt,
        error: result.error ?? null,
      },
    };
  }

  // ── Handle an authentication failure (401/403). ──
  function handleAuthError(): void {
    // Stop automatic sync and notify the Control Panel so the Admin can re-auth.
    stopPeriodicSync();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    sendEvent({ type: 'CLOUD_SYNC_AUTH_ERROR' });
  }

  function startPeriodicSync(): void {
    if (disposed || !enabled) return;
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      void service.syncNow();
    }, pollIntervalMs);
  }

  function stopPeriodicSync(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ── Core sync implementation (guarded, serialised via syncChain) ──
  async function doSync(): Promise<SyncResult> {
    const startedAt = new Date().toISOString();

    // Guard: nothing to do when disabled or misconfigured.
    if (!enabled || !endpointUrl) {
      const completedAt = new Date().toISOString();
      return {
        success: false,
        recordsTransmitted: 0,
        startedAt,
        completedAt,
        error: 'Cloud Sync is disabled or not configured',
      };
    }

    sendEvent({ type: 'CLOUD_SYNC_STATUS', status: 'syncing' });

    const checkpoint = getLastSyncAt();

    let envelopes: SyncEnvelope[] = [];
    try {
      const all = recordSource ? await recordSource() : [];
      // Incremental: keep only records strictly newer than the checkpoint.
      envelopes = checkpoint
        ? all.filter((e) => e.lastModified > checkpoint)
        : all.slice();
    } catch (err) {
      const completedAt = new Date().toISOString();
      const result: SyncResult = {
        success: false,
        recordsTransmitted: 0,
        startedAt,
        completedAt,
        error: `Failed to collect records: ${String(err)}`,
      };
      auditStore?.append(makeAuditEntry(result));
      sendEvent({ type: 'CLOUD_SYNC_STATUS', status: 'error' });
      return result;
    }

    // Nothing newer to send — still a success; advance the checkpoint.
    if (envelopes.length === 0) {
      const completedAt = new Date().toISOString();
      setLastSyncAt(completedAt);
      const result: SyncResult = {
        success: true,
        recordsTransmitted: 0,
        startedAt,
        completedAt,
      };
      auditStore?.append(makeAuditEntry(result));
      sendEvent({ type: 'CLOUD_SYNC_STATUS', status: 'idle', lastSyncAt: completedAt });
      return result;
    }

    const apiKey = decryptApiKey(encryptedApiKey, storage);

    try {
      const res = await httpsTransmitter({
        url: endpointUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(envelopes),
        timeoutMs: SYNC_REQUEST_TIMEOUT_MS,
      });

      if (res.statusCode === 401 || res.statusCode === 403) {
        handleAuthError();
        const completedAt = new Date().toISOString();
        const result: SyncResult = {
          success: false,
          recordsTransmitted: 0,
          startedAt,
          completedAt,
          error: `Authentication failed (HTTP ${res.statusCode})`,
        };
        auditStore?.append(makeAuditEntry(result));
        return result;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        const completedAt = new Date().toISOString();
        const result: SyncResult = {
          success: false,
          recordsTransmitted: 0,
          startedAt,
          completedAt,
          error: `Endpoint returned HTTP ${res.statusCode}`,
        };
        auditStore?.append(makeAuditEntry(result));
        sendEvent({ type: 'CLOUD_SYNC_STATUS', status: 'error' });
        return result;
      }

      // Success — advance the checkpoint to the sync start so nothing is skipped.
      const completedAt = new Date().toISOString();
      setLastSyncAt(startedAt);
      const result: SyncResult = {
        success: true,
        recordsTransmitted: envelopes.length,
        startedAt,
        completedAt,
      };
      auditStore?.append(makeAuditEntry(result));
      sendEvent({ type: 'CLOUD_SYNC_STATUS', status: 'idle', lastSyncAt: startedAt });
      return result;
    } catch (err) {
      const completedAt = new Date().toISOString();
      const result: SyncResult = {
        success: false,
        recordsTransmitted: 0,
        startedAt,
        completedAt,
        error: `Transmission failed: ${String(err instanceof Error ? err.message : err)}`,
      };
      auditStore?.append(makeAuditEntry(result));
      sendEvent({ type: 'CLOUD_SYNC_STATUS', status: 'error' });
      return result;
    }
  }

  // ── The service object ──
  const service: CloudSyncService = {
    configure(cfg: CloudSyncConfig): void {
      // Reject non-TLS endpoints at configuration time (Req 32.8).
      if (!/^https:\/\//i.test(cfg.endpointUrl)) {
        throw new Error('Cloud Sync endpoint URL must start with https://');
      }

      endpointUrl = cfg.endpointUrl;

      // Only re-encrypt when a new (non-empty) key is provided, so callers can
      // update enabled/endpoint without resubmitting the secret.
      if (cfg.apiKey) {
        encryptedApiKey = encryptApiKey(cfg.apiKey, storage);
      }

      const wasEnabled = enabled;
      enabled = cfg.enabled;

      if (enabled && !wasEnabled) {
        startPeriodicSync();
      } else if (!enabled && wasEnabled) {
        // Disable: stop all sync operations promptly and retain local data.
        stopPeriodicSync();
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      } else if (enabled) {
        // Already enabled — ensure the poll timer is running.
        startPeriodicSync();
      }
    },

    getConfig() {
      return { enabled, endpointUrl, hasApiKey: encryptedApiKey.length > 0 };
    },

    async testConnection(): Promise<{ ok: boolean; error?: string }> {
      if (!/^https:\/\//i.test(endpointUrl)) {
        return { ok: false, error: 'Endpoint URL must start with https://' };
      }

      const apiKey = encryptedApiKey ? decryptApiKey(encryptedApiKey, storage) : '';

      try {
        const res = await httpsTransmitter({
          url: endpointUrl,
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ type: 'CLOUD_SYNC_TEST' }),
          timeoutMs: TEST_CONNECTION_TIMEOUT_MS,
        });

        if (res.statusCode === 401 || res.statusCode === 403) {
          return { ok: false, error: `Authentication failed (HTTP ${res.statusCode})` };
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return { ok: false, error: `Endpoint returned HTTP ${res.statusCode}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err instanceof Error ? err.message : err) };
      }
    },

    syncNow(): Promise<SyncResult> {
      // Serialise: chain after any in-flight sync so two never run in parallel.
      const next = syncChain.then(() => doSync());
      // Keep the chain alive but swallow errors so one failure doesn't poison it.
      syncChain = next.catch(() => undefined);
      return next;
    },

    startPeriodicSync,

    stopPeriodicSync,

    triggerIncrementalSync(): void {
      if (disposed || !enabled) return;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void service.syncNow();
      }, debounceMs);
    },

    isRunning(): boolean {
      return enabled && pollTimer !== null;
    },

    dispose(): void {
      disposed = true;
      stopPeriodicSync();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };

  return service;
}
