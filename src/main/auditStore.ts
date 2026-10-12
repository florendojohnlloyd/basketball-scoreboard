/**
 * AuditStore — append-only SQLite audit log (Requirement 31)
 *
 * Opens/creates {userData}/audit.db with an audit_log table.
 * All writes are synchronous (better-sqlite3). On INSERT failure,
 * the error is swallowed and an AUDIT_WRITE_FAILED event is emitted
 * to the Control Panel — the store never throws to callers.
 *
 * purgeOldEntries() removes records older than 12 months and is called
 * automatically at module initialization.
 */

// Conditionally import app — not available in test environments
let _appGetPath: ((name: any) => string) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  _appGetPath = (name: any) => (electron.app as Electron.App).getPath(name);
} catch {
  _appGetPath = null;
}

// Lazy-load better-sqlite3 to avoid crash if native module is incompatible
let Database: any;
try {
  Database = require('better-sqlite3');
} catch {
  Database = null;
}
import { join } from 'path';
import { mkdirSync, existsSync, renameSync } from 'fs';
import type { BrowserWindow } from 'electron';
import { SCOREBOARD_EVENT } from '../shared/types';
import type { AuditEntry, AuditFilter } from '../shared/types';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AuditStore {
  /**
   * Synchronous INSERT. On failure, emits AUDIT_WRITE_FAILED to Control Panel
   * and returns without throwing.
   */
  append(entry: AuditEntry): void;

  /** SELECT with optional filter — returns matching entries ordered by timestamp ASC. */
  query(filter: AuditFilter): AuditEntry[];

  /**
   * Write filtered results to a CSV file at destinationPath.
   * Headers match AuditEntry field names.
   */
  exportCsv(filter: AuditFilter, destinationPath: string): void;

  /**
   * DELETE WHERE timestamp < 12 months ago.
   * Called automatically at initialization.
   */
  purgeOldEntries(): void;

  /** Release the database handle. */
  close(): void;
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function escapeCsvField(value: unknown): string {
  const str = value == null ? '' : String(value);
  // Fields containing commas, newlines, or quotes must be quoted
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS: Array<keyof AuditEntry> = [
  'id', 'timestamp', 'username', 'role', 'actionType',
  'entityId', 'previousValue', 'newValue',
];

// ---------------------------------------------------------------------------
// Row ↔ AuditEntry conversion
// ---------------------------------------------------------------------------

interface AuditRow {
  id: string;
  timestamp: string;
  username: string;
  role: string;
  action_type: string;
  entity_id: string;
  previous_value: string;
  new_value: string;
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    username: row.username,
    role: row.role as AuditEntry['role'],
    actionType: row.action_type,
    entityId: row.entity_id,
    previousValue: tryParse(row.previous_value),
    newValue: tryParse(row.new_value),
  };
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createInMemoryAuditStore(): AuditStore {
  let rows: AuditRow[] = [];
  return {
    append(entry: AuditEntry): void {
      rows.push({
        id: entry.id,
        timestamp: entry.timestamp,
        username: entry.username,
        role: entry.role,
        action_type: entry.actionType,
        entity_id: entry.entityId ?? '',
        previous_value: JSON.stringify(entry.previousValue ?? null),
        new_value: JSON.stringify(entry.newValue ?? null),
      });
    },
    query(filter: AuditFilter): AuditEntry[] {
      return rows
        .filter(r => {
          if (filter.fromDate && r.timestamp < filter.fromDate) return false;
          if (filter.toDate && r.timestamp > filter.toDate) return false;
          if (filter.username && r.username !== filter.username) return false;
          if (filter.actionType && r.action_type !== filter.actionType) return false;
          return true;
        })
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map(rowToEntry);
    },
    exportCsv(filter: AuditFilter, destinationPath: string): void {
      const entries = this.query(filter);
      const lines: string[] = [CSV_HEADERS.join(',')];
      for (const entry of entries) {
        const row = CSV_HEADERS.map(key => {
          const value = entry[key];
          const formatted = typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : value;
          return escapeCsvField(formatted);
        });
        lines.push(row.join(','));
      }
      const { writeFileSync } = require('fs') as typeof import('fs');
      writeFileSync(destinationPath, lines.join('\n'), 'utf-8');
    },
    purgeOldEntries(): void {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const cutoffIso = cutoff.toISOString();
      rows = rows.filter(r => r.timestamp >= cutoffIso);
    },
    close(): void {},
  };
}

/**
 * Creates (or opens) the audit database.
 *
 * @param dbPath   - absolute path to audit.db; when omitted the default
 *                   {userData}/audit.db is used.
 * @param getControlPanelWindow - optional factory that returns the Control Panel
 *                   BrowserWindow for emitting warning events.
 */
export function createAuditStore(
  dbPath?: string,
  getControlPanelWindow?: () => BrowserWindow | null,
): AuditStore {

  // If better-sqlite3 failed to load, return an in-memory store fallback
  if (!Database) {
    console.warn('[LigaControl] AuditStore: better-sqlite3 not available — using in-memory store');
    return createInMemoryAuditStore();
  }

  // ── Resolve DB path ──
  let resolvedPath: string;
  if (dbPath) {
    resolvedPath = dbPath;
  } else if (_appGetPath) {
    const userDataDir = _appGetPath('userData');
    resolvedPath = join(userDataDir, 'audit.db');
  } else {
    // Fallback for test environments without Electron
    resolvedPath = join(process.cwd(), 'audit.db');
  }

  // ── Ensure parent directory exists ──
  // ':memory:' is an in-memory SQLite sentinel, not a filesystem path — skip mkdir.
  if (resolvedPath !== ':memory:') {
    const parentDir = resolvedPath.replace(/[/\\][^/\\]+$/, '');
    if (parentDir && !existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
  }

  // ── Send event to Control Panel helper ──
  function sendEvent(payload: { type: string; [k: string]: unknown }): void {
    const win = getControlPanelWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(SCOREBOARD_EVENT, payload);
    }
  }

  // ── Open database, handling unreadable file or native module load errors ──
  let db: any;
  try {
    db = new Database(resolvedPath);
  } catch (err: any) {
    if (err?.code === 'ERR_DLOPEN_FAILED' || (err?.message && String(err.message).includes('NODE_MODULE_VERSION'))) {
      console.warn('[AuditStore] SQLite native addon ABI mismatch — using in-memory store');
      return createInMemoryAuditStore();
    }
    console.error('[AuditStore] Failed to open audit.db, resetting:', err);
    const backupPath = `${resolvedPath}.bak.${Date.now()}`;
    try {
      if (existsSync(resolvedPath)) renameSync(resolvedPath, backupPath);
    } catch {
      // best-effort rename
    }
    try {
      db = new Database(resolvedPath);
      sendEvent({ type: 'AUDIT_DB_RESET', message: 'audit.db was unreadable and has been reset.' });
    } catch (retryErr) {
      console.warn('[AuditStore] SQLite native addon failed to instantiate, falling back to in-memory store:', retryErr);
      return createInMemoryAuditStore();
    }
  }

  // ── Schema ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id             TEXT NOT NULL PRIMARY KEY,
      timestamp      TEXT NOT NULL,
      username       TEXT NOT NULL,
      role           TEXT NOT NULL,
      action_type    TEXT NOT NULL,
      entity_id      TEXT NOT NULL DEFAULT '',
      previous_value TEXT NOT NULL DEFAULT '""',
      new_value      TEXT NOT NULL DEFAULT '""'
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp   ON audit_log (timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_username    ON audit_log (username);
    CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit_log (action_type);
  `);

  // ── Prepared statements ──
  const insertStmt = db.prepare<[
    string, string, string, string, string, string, string, string
  ]>(`
    INSERT INTO audit_log (id, timestamp, username, role, action_type, entity_id, previous_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const store: AuditStore = {

    append(entry: AuditEntry): void {
      try {
        insertStmt.run(
          entry.id,
          entry.timestamp,
          entry.username,
          entry.role,
          entry.actionType,
          entry.entityId ?? '',
          JSON.stringify(entry.previousValue ?? null),
          JSON.stringify(entry.newValue ?? null),
        );
      } catch (err) {
        console.error('[AuditStore] INSERT failed:', err);
        sendEvent({ type: 'AUDIT_WRITE_FAILED', error: String(err) });
        // Do NOT rethrow — audit failures must not affect the game flow
      }
    },

    query(filter: AuditFilter): AuditEntry[] {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter.fromDate) {
        conditions.push('timestamp >= ?');
        params.push(filter.fromDate);
      }
      if (filter.toDate) {
        conditions.push('timestamp <= ?');
        params.push(filter.toDate);
      }
      if (filter.username) {
        conditions.push('username = ?');
        params.push(filter.username);
      }
      if (filter.actionType) {
        conditions.push('action_type = ?');
        params.push(filter.actionType);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT * FROM audit_log ${where} ORDER BY timestamp ASC`;
      const rows = db.prepare(sql).all(...params) as AuditRow[];
      return rows.map(rowToEntry);
    },

    exportCsv(filter: AuditFilter, destinationPath: string): void {
      const entries = store.query(filter);
      const lines: string[] = [CSV_HEADERS.join(',')];

      for (const entry of entries) {
        const row = CSV_HEADERS.map(key => {
          const value = entry[key];
          // For complex values, serialize to JSON first
          const formatted = typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : value;
          return escapeCsvField(formatted);
        });
        lines.push(row.join(','));
      }

      const { writeFileSync } = require('fs') as typeof import('fs');
      writeFileSync(destinationPath, lines.join('\n'), 'utf-8');
    },

    purgeOldEntries(): void {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const cutoffIso = cutoff.toISOString();
      db.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(cutoffIso);
    },

    close(): void {
      db.close();
    },
  };

  // Purge old entries at initialization
  store.purgeOldEntries();

  return store;
}
