/**
 * OfflineSyncService — connectivity monitoring and pending-changes queue (Requirement 30)
 *
 * Polls connectivity every 10 seconds using dns.resolve('8.8.8.8').
 * On status change, emits CONNECTIVITY_CHANGED IPC event to Control Panel.
 *
 * When Cloud Sync is enabled, every successful gameStore.dispatch() should call
 * enqueueChange(entry) which INSERTs to sync.db (pending_changes table).
 *
 * replayPending(): SELECT all entries ordered by timestamp; transmit to CloudSyncService;
 * on success, DELETE those IDs; on failure, retry up to 3 times at 60-second intervals;
 * after 3 failures, emit SYNC_FAILED with attempt count.
 *
 * When connectivity is restored, replayPending() is called within 30 seconds.
 */

import dns from 'dns';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { BrowserWindow } from 'electron';
import { SCOREBOARD_EVENT } from '../shared/types';
import type { PendingChange, SyncRecord } from '../shared/types';

// Conditionally import app — not available in test environments
let _appGetPath: ((name: string) => string) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  _appGetPath = (name: string) => (electron.app as Electron.App).getPath(name);
} catch {
  _appGetPath = null;
}

// Lazy-load better-sqlite3 to avoid crash if native module is incompatible
let Database: any;
try {
  const mod = require('better-sqlite3');
  // Handle both CJS direct export and ESM interop (where constructor is on .default)
  Database = typeof mod === 'function' ? mod : (mod?.default ?? mod);
} catch {
  Database = null;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface OfflineSyncService {
  /** Current connectivity status. */
  isOnline(): boolean;

  /**
   * Enqueue a pending change for later sync. Only INSERTs when Cloud Sync is enabled.
   */
  enqueueChange(entry: PendingChange): void;

  /**
   * Replay all pending changes in chronological order.
   * Transmits to CloudSyncService; on success, removes synced entries.
   * On failure, retries up to 3 times at 60-second intervals.
   * After 3 failures, emits SYNC_FAILED event.
   */
  replayPending(): Promise<void>;

  /**
   * Get all pending changes (for inspection/testing).
   */
  getPendingChanges(): PendingChange[];

  /**
   * Get the count of pending changes.
   */
  getPendingCount(): number;

  /**
   * Enable or disable Cloud Sync (controls whether enqueueChange writes to DB).
   */
  setCloudSyncEnabled(enabled: boolean): void;

  /**
   * Check if Cloud Sync is enabled.
   */
  isCloudSyncEnabled(): boolean;

  /**
   * Handle a sync conflict by emitting a SYNC_CONFLICT IPC event and waiting for
   * the operator's resolution via resolveConflict().
   * Returns the operator's choice ('local' or 'remote').
   * Defaults to 'local' if the resolution does not arrive within the timeout.
   */
  handleConflict(local: SyncRecord, remote: SyncRecord): Promise<'local' | 'remote'>;

  /**
   * Called by the IPC router when SYNC_CONFLICT_RESOLVED arrives from the renderer.
   * Unblocks the corresponding handleConflict() promise.
   */
  resolveConflict(conflictId: string, choice: 'local' | 'remote'): void;

  /**
   * Dispose of timers and database handle.
   */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// CloudSyncTransmitter interface — abstraction for the cloud sync endpoint
// ---------------------------------------------------------------------------

/**
 * Interface for transmitting pending changes to a remote endpoint.
 * When CloudSyncService (Task 68) is implemented, it will satisfy this interface.
 * For now, the service accepts a transmitter function that can be injected.
 */
export type CloudSyncTransmitter = (entries: PendingChange[]) => Promise<boolean>;

// ---------------------------------------------------------------------------
// SQLite row type
// ---------------------------------------------------------------------------

interface PendingChangeRow {
  id: string;
  timestamp: string;
  entity_type: string;
  entity_id: string;
  change_type: string;
  payload: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OfflineSyncConfig {
  /** Path to the sync.db file. If not provided, defaults to {userData}/sync.db. */
  dbPath?: string;

  /** Factory to get the Control Panel BrowserWindow for sending IPC events. */
  getControlPanelWindow?: () => BrowserWindow | null;

  /** Transmitter function for sending pending changes to the cloud. */
  transmitter?: CloudSyncTransmitter;

  /** Connectivity polling interval in milliseconds. Default: 10000 (10 seconds). */
  pollIntervalMs?: number;

  /** Delay after connectivity restored before replay. Default: 30000 (30 seconds). */
  replayDelayMs?: number;

  /** Retry interval for failed sync in milliseconds. Default: 60000 (60 seconds). */
  retryIntervalMs?: number;

  /** Maximum retry attempts. Default: 3. */
  maxRetries?: number;

  /** Initial Cloud Sync enabled state. Default: false. */
  cloudSyncEnabled?: boolean;

  /**
   * Injected database instance for testing.
   * When provided, the service will use this instead of creating a real SQLite connection.
   */
  _testDb?: any;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOfflineSyncService(config: OfflineSyncConfig = {}): OfflineSyncService {
  const {
    pollIntervalMs = 10_000,
    replayDelayMs = 30_000,
    retryIntervalMs = 60_000,
    maxRetries = 3,
    cloudSyncEnabled: initialCloudSyncEnabled = false,
    getControlPanelWindow,
    transmitter,
  } = config;

  // ── State ──
  let online = true; // assume online until proven otherwise
  let cloudSyncEnabled = initialCloudSyncEnabled;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  // ── Pending conflict resolutions ──
  // Maps conflictId → { resolve: (choice) => void, timeoutHandle }
  const pendingConflicts: Map<string, {
    resolve: (choice: 'local' | 'remote') => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();

  // ── Resolve DB path ──
  let resolvedDbPath: string;
  if (config.dbPath) {
    resolvedDbPath = config.dbPath;
  } else if (_appGetPath) {
    const userDataDir = _appGetPath('userData');
    resolvedDbPath = join(userDataDir, 'sync.db');
  } else {
    // Fallback for test environments without Electron
    resolvedDbPath = join(process.cwd(), 'sync.db');
  }

  // ── Ensure parent directory exists ──
  const parentDir = resolvedDbPath.replace(/[/\\][^/\\]+$/, '');
  if (parentDir && !existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  // ── Send event to Control Panel helper ──
  function sendEvent(payload: { type: string; [k: string]: unknown }): void {
    const win = getControlPanelWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(SCOREBOARD_EVENT, payload);
    }
  }

  // ── Open/create SQLite database ──
  let db: any = null;
  if (config._testDb) {
    // Use injected test database
    db = config._testDb;
  } else if (Database) {
    try {
      db = new Database(resolvedDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS pending_changes (
          id          TEXT NOT NULL PRIMARY KEY,
          timestamp   TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id   TEXT NOT NULL,
          change_type TEXT NOT NULL,
          payload     TEXT NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_pending_timestamp ON pending_changes (timestamp);

        CREATE TABLE IF NOT EXISTS sync_meta (
          key   TEXT NOT NULL PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    } catch (err) {
      console.error('[OfflineSyncService] Failed to open sync.db:', err);
      db = null;
    }
  } else {
    console.warn('[OfflineSyncService] better-sqlite3 not available — pending-changes queue disabled');
  }

  // ── Prepared statements ──
  const insertStmt = db?.prepare(`
    INSERT OR REPLACE INTO pending_changes (id, timestamp, entity_type, entity_id, change_type, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const selectAllStmt = db?.prepare(`
    SELECT * FROM pending_changes ORDER BY timestamp ASC
  `);

  const deleteByIdsStmt = db ? (ids: string[]) => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM pending_changes WHERE id IN (${placeholders})`).run(...ids);
  } : () => {};

  const countStmt = db?.prepare(`SELECT COUNT(*) as count FROM pending_changes`);

  // ── Connectivity check ──
  function checkConnectivity(): Promise<boolean> {
    return new Promise((resolve) => {
      dns.resolve('8.8.8.8', (err) => {
        resolve(!err);
      });
    });
  }

  // ── Connectivity polling loop ──
  async function pollConnectivity(): Promise<void> {
    if (disposed) return;

    const wasOnline = online;
    const nowOnline = await checkConnectivity();
    online = nowOnline;

    if (wasOnline !== nowOnline) {
      // Status changed — emit IPC event
      sendEvent({ type: 'CONNECTIVITY_CHANGED', online: nowOnline });

      if (nowOnline && !wasOnline) {
        // Connectivity restored — schedule replay within replayDelayMs
        scheduleReplay();
      }
    }
  }

  function scheduleReplay(): void {
    // Clear any existing replay timer
    if (replayTimer) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }

    replayTimer = setTimeout(async () => {
      replayTimer = null;
      if (!disposed && online) {
        await service.replayPending();
      }
    }, replayDelayMs);
  }

  // ── Start polling ──
  function startPolling(): void {
    if (pollTimer) return;
    pollTimer = setInterval(pollConnectivity, pollIntervalMs);
    // Do an initial check immediately
    pollConnectivity();
  }

  // ── Row conversion ──
  function rowToEntry(row: PendingChangeRow): PendingChange {
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      payload = row.payload;
    }
    return {
      id: row.id,
      timestamp: row.timestamp,
      entityType: row.entity_type,
      entityId: row.entity_id,
      changeType: row.change_type as PendingChange['changeType'],
      payload,
    };
  }

  // ── The service object ──
  const service: OfflineSyncService = {
    isOnline(): boolean {
      return online;
    },

    enqueueChange(entry: PendingChange): void {
      if (!cloudSyncEnabled) return;
      if (!db || !insertStmt) return;

      try {
        insertStmt.run(
          entry.id,
          entry.timestamp,
          entry.entityType,
          entry.entityId,
          entry.changeType,
          JSON.stringify(entry.payload ?? null),
        );
      } catch (err) {
        console.error('[OfflineSyncService] INSERT failed:', err);
      }
    },

    async replayPending(): Promise<void> {
      if (!db || !selectAllStmt) return;
      if (!transmitter) return; // No transmitter configured — nothing to replay to

      const rows = selectAllStmt.all() as PendingChangeRow[];
      if (rows.length === 0) return;

      const entries = rows.map(rowToEntry);
      const ids = rows.map(r => r.id);

      // Emit sync started
      sendEvent({ type: 'SYNC_STARTED' });

      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success && !disposed) {
        attempt++;
        try {
          success = await transmitter(entries);
        } catch {
          success = false;
        }

        if (success) {
          // Remove synced entries from the queue
          deleteByIdsStmt(ids);
          sendEvent({ type: 'SYNC_COMPLETE', recordsTransmitted: entries.length });
          return;
        }

        // Failed — wait before retrying (unless we've exhausted all attempts)
        if (attempt < maxRetries && !disposed) {
          sendEvent({ type: 'SYNC_FAILED', attempt, maxAttempts: maxRetries, error: 'Transient network error' });
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, retryIntervalMs);
            // If disposed during wait, clear and resolve immediately
            if (disposed) {
              clearTimeout(timer);
              resolve();
            }
          });
        }
      }

      if (!success && !disposed) {
        // All retries exhausted
        sendEvent({ type: 'SYNC_FAILED', attempt, maxAttempts: maxRetries, error: 'All retry attempts exhausted' });
      }
    },

    getPendingChanges(): PendingChange[] {
      if (!db || !selectAllStmt) return [];
      const rows = selectAllStmt.all() as PendingChangeRow[];
      return rows.map(rowToEntry);
    },

    getPendingCount(): number {
      if (!db || !countStmt) return 0;
      const result = countStmt.get() as { count: number };
      return result.count;
    },

    setCloudSyncEnabled(enabled: boolean): void {
      cloudSyncEnabled = enabled;
    },

    isCloudSyncEnabled(): boolean {
      return cloudSyncEnabled;
    },

    async handleConflict(local: SyncRecord, remote: SyncRecord): Promise<'local' | 'remote'> {
      // Generate a unique conflict ID
      const conflictId = `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Emit SYNC_CONFLICT IPC event to the Control Panel
      sendEvent({ type: 'SYNC_CONFLICT', conflictId, local, remote });

      // Wait for the operator's resolution via resolveConflict(), with a 5-minute timeout
      return new Promise<'local' | 'remote'>((resolve) => {
        const timeout = setTimeout(() => {
          // Timed out — default to keeping local (Req 30.6: cancel retains local)
          pendingConflicts.delete(conflictId);
          resolve('local');
        }, 5 * 60 * 1000);

        pendingConflicts.set(conflictId, { resolve, timeout });
      });
    },

    resolveConflict(conflictId: string, choice: 'local' | 'remote'): void {
      const pending = pendingConflicts.get(conflictId);
      if (!pending) return; // Already resolved or unknown ID
      clearTimeout(pending.timeout);
      pendingConflicts.delete(conflictId);
      pending.resolve(choice);
    },

    dispose(): void {
      disposed = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (replayTimer) {
        clearTimeout(replayTimer);
        replayTimer = null;
      }
      // Resolve any pending conflicts with 'local' (keep local) before disposing
      for (const [id, pending] of pendingConflicts) {
        clearTimeout(pending.timeout);
        pending.resolve('local');
        pendingConflicts.delete(id);
      }
      if (db) {
        try { db.close(); } catch { /* ignore */ }
        db = null;
      }
    },
  };

  // Start polling on creation
  startPolling();

  return service;
}
