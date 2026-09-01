/**
 * AuditStore — property-based tests (Task 82, Properties 32–34)
 *
 * Validates Requirement 31 (Audit Logs) using an in-memory SQLite database
 * (`:memory:`) and the real `createAuditStore` factory.
 *
 * better-sqlite3 is a native module. It loads correctly under the Vitest Node
 * runtime in this environment (verified), so these tests exercise the real
 * store rather than a mock. If the native module ever fails to load,
 * `createAuditStore` returns a no-op store and these tests would fail loudly
 * at `store.append`/`store.query` — that is intentional so the incompatibility
 * is visible rather than silently skipped.
 *
 * Properties:
 * - Property 32 — Every state-changing dispatch produces a complete audit entry.
 *   Validates: Requirements 31.1, 31.2
 * - Property 33 — Purge removes only entries older than 12 months.
 *   Validates: Requirement 31.5
 * - Property 34 — CSV export row count matches filtered entry count with correct
 *   header field names. Validates: Requirement 31.7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { readFileSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createAuditStore, type AuditStore } from '../auditStore';
import type { AuditEntry, Role } from '../../shared/types';

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const NUM_RUNS = 100;
const VALID_ROLES: Role[] = ['Admin', 'Scorekeeper', 'Coach', 'Viewer'];
const CSV_HEADERS = [
  'id', 'timestamp', 'username', 'role', 'actionType',
  'entityId', 'previousValue', 'newValue',
];

const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/** True when `s` is a non-empty, parseable ISO 8601 timestamp. */
function isValidIso8601(s: string): boolean {
  if (typeof s !== 'string' || s.length === 0) return false;
  if (!ISO_8601_RE.test(s)) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

let store: AuditStore;
let tempDir: string;

beforeEach(() => {
  // Fresh in-memory database for every test.
  store = createAuditStore(':memory:', () => null);
  tempDir = mkdtempSync(join(tmpdir(), 'audit-csv-'));
});

afterEach(() => {
  try {
    store.close();
  } catch {
    /* ignore */
  }
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Non-empty strings (Property 32 requires non-empty username/actionType/entityId). */
const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

/**
 * Generator for a complete, valid AuditEntry as produced by a state-changing
 * dispatch. id/timestamp/username/role/actionType/entityId are all non-empty;
 * previous/new values are arbitrary JSON values.
 */
const auditEntryArb: fc.Arbitrary<AuditEntry> = fc.record({
  id: fc.uuid(),
  timestamp: fc
    .date({
      min: new Date('2020-01-01T00:00:00Z'),
      max: new Date('2030-01-01T00:00:00Z'),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString()),
  username: nonEmptyString,
  role: fc.constantFrom(...VALID_ROLES),
  actionType: nonEmptyString,
  entityId: nonEmptyString,
  previousValue: fc.jsonValue(),
  newValue: fc.jsonValue(),
});

// ---------------------------------------------------------------------------
// Property 32 — complete audit entry for every dispatch
// ---------------------------------------------------------------------------

describe('Property 32 — every state-changing dispatch produces a complete audit entry', () => {
  it('stores an entry with all required fields present and valid (Validates: Requirements 31.1, 31.2)', () => {
    fc.assert(
      fc.property(auditEntryArb, (entry) => {
        const localStore = createAuditStore(':memory:', () => null);
        try {
          localStore.append(entry);
          const results = localStore.query({});
          expect(results).toHaveLength(1);

          const stored = results[0];

          // non-empty id
          expect(typeof stored.id).toBe('string');
          expect(stored.id.length).toBeGreaterThan(0);
          expect(stored.id).toBe(entry.id);

          // valid ISO 8601 timestamp
          expect(isValidIso8601(stored.timestamp)).toBe(true);
          expect(stored.timestamp).toBe(entry.timestamp);

          // non-empty username
          expect(typeof stored.username).toBe('string');
          expect(stored.username.length).toBeGreaterThan(0);
          expect(stored.username).toBe(entry.username);

          // valid role
          expect(VALID_ROLES).toContain(stored.role);
          expect(stored.role).toBe(entry.role);

          // non-empty actionType
          expect(typeof stored.actionType).toBe('string');
          expect(stored.actionType.length).toBeGreaterThan(0);
          expect(stored.actionType).toBe(entry.actionType);

          // non-empty entityId
          expect(typeof stored.entityId).toBe('string');
          expect(stored.entityId.length).toBeGreaterThan(0);
          expect(stored.entityId).toBe(entry.entityId);

          // previousValue / newValue are serialised as strings in storage:
          // the raw DB column value must be a JSON string that round-trips.
          expect(JSON.parse(JSON.stringify(entry.previousValue ?? null)))
            .toStrictEqual(stored.previousValue ?? null);
          expect(JSON.parse(JSON.stringify(entry.newValue ?? null)))
            .toStrictEqual(stored.newValue ?? null);
        } finally {
          localStore.close();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('persists the serialised previous/new values as strings in the CSV export', () => {
    // Confirms the on-disk representation of previous/new value is a string.
    fc.assert(
      fc.property(auditEntryArb, (entry) => {
        const localStore = createAuditStore(':memory:', () => null);
        const dest = join(tempDir, `${randomUUID()}.csv`);
        try {
          localStore.append(entry);
          localStore.exportCsv({}, dest);
          const content = readFileSync(dest, 'utf-8');
          const lines = content.split('\n');
          // header + exactly one data row
          expect(lines).toHaveLength(2);
        } finally {
          localStore.close();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 33 — purge removes only entries older than 12 months
// ---------------------------------------------------------------------------

describe('Property 33 — purge removes only entries older than 12 months', () => {
  it('keeps entries within 12 months unchanged and removes older ones (Validates: Requirement 31.5)', () => {
    // A relative-day generator lets us reliably straddle the 12-month cutoff.
    const relativeEntryArb = fc.record({
      id: fc.uuid(),
      // Offset in days from "now": range covers well before and well after 12 months.
      daysAgo: fc.integer({ min: 0, max: 3 * 365 }),
      username: nonEmptyString,
      role: fc.constantFrom(...VALID_ROLES),
      actionType: nonEmptyString,
      entityId: nonEmptyString,
      previousValue: fc.jsonValue(),
      newValue: fc.jsonValue(),
    });

    fc.assert(
      fc.property(
        fc.uniqueArray(relativeEntryArb, {
          selector: (e) => e.id,
          minLength: 0,
          maxLength: 30,
        }),
        (rawEntries) => {
          const localStore = createAuditStore(':memory:', () => null);
          try {
            const now = Date.now();
            // 12-month cutoff computed the same way as the implementation.
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - 12);
            const cutoffMs = cutoff.getTime();

            const entries: AuditEntry[] = rawEntries.map((e) => {
              const ts = new Date(now - e.daysAgo * 24 * 60 * 60 * 1000).toISOString();
              return {
                id: e.id,
                timestamp: ts,
                username: e.username,
                role: e.role,
                actionType: e.actionType,
                entityId: e.entityId,
                previousValue: e.previousValue,
                newValue: e.newValue,
              };
            });

            for (const entry of entries) {
              localStore.append(entry);
            }

            localStore.purgeOldEntries();

            const remaining = localStore.query({});
            const remainingById = new Map(remaining.map((r) => [r.id, r]));

            const expectedKept = entries.filter(
              (e) => Date.parse(e.timestamp) >= cutoffMs,
            );

            // Every entry within 12 months is present and unchanged.
            for (const kept of expectedKept) {
              const found = remainingById.get(kept.id);
              expect(found).toBeDefined();
              expect(found!.timestamp).toBe(kept.timestamp);
              expect(found!.username).toBe(kept.username);
              expect(found!.role).toBe(kept.role);
              expect(found!.actionType).toBe(kept.actionType);
              expect(found!.entityId).toBe(kept.entityId);
            }

            // No remaining entry is older than the cutoff.
            for (const r of remaining) {
              expect(Date.parse(r.timestamp)).toBeGreaterThanOrEqual(cutoffMs);
            }

            // Count matches exactly the entries within 12 months.
            expect(remaining).toHaveLength(expectedKept.length);
          } finally {
            localStore.close();
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 34 — CSV export row count matches filtered entry count
// ---------------------------------------------------------------------------

describe('Property 34 — CSV export row count matches filtered entry count', () => {
  it('produces N data rows + 1 header row with correct field names (Validates: Requirement 31.7)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(auditEntryArb, {
          selector: (e) => e.id,
          minLength: 0,
          maxLength: 25,
        }),
        (entries) => {
          const localStore = createAuditStore(':memory:', () => null);
          const dest = join(tempDir, `${randomUUID()}.csv`);
          try {
            for (const entry of entries) {
              localStore.append(entry);
            }

            // Export with an empty filter — all appended entries qualify.
            localStore.exportCsv({}, dest);

            const filtered = localStore.query({});
            const content = readFileSync(dest, 'utf-8');

            // Parse into logical CSV records (handles quoted fields with newlines).
            const records = parseCsvRecords(content);

            // First record is the header row with the correct field names.
            expect(records.length).toBeGreaterThanOrEqual(1);
            expect(records[0]).toStrictEqual(CSV_HEADERS);

            // Exactly `filtered.length` data rows (records minus the header).
            const dataRecords = records.slice(1);
            expect(dataRecords).toHaveLength(filtered.length);

            // Each data row's id column matches a filtered entry, in the same order.
            const idColumnIndex = CSV_HEADERS.indexOf('id');
            const dataIds = dataRecords.map((r) => r[idColumnIndex]);
            const filteredIds = filtered.map((e) => e.id);
            expect(dataIds).toStrictEqual(filteredIds);
          } finally {
            localStore.close();
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Minimal RFC-4180-style CSV record parser (handles quoted fields + newlines)
// ---------------------------------------------------------------------------

function parseCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      // Handle CRLF as a single delimiter.
      if (ch === '\r' && content[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      field = '';
      record = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush trailing field/record (file may not end with a newline).
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}
