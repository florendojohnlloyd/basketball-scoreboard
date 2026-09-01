/**
 * CloudSyncService — unit + property-based tests (Task 68, Requirement 32)
 *
 * Uses an injected HttpsTransmitter, RecordSource, AuditStore sink, and
 * checkpoint store so no real network or native module is required.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  createCloudSyncService,
  type CloudSyncService,
  type HttpsTransmitter,
  type SyncCheckpointStore,
  type AuditLogSink,
} from '../cloudSyncService';
import type { CloudSyncConfig, SyncEnvelope, AuditEntry } from '../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<CloudSyncConfig> = {}): CloudSyncConfig {
  return {
    enabled: true,
    endpointUrl: 'https://sync.example.com/api',
    apiKey: 'secret-token',
    ...overrides,
  };
}

function makeEnvelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
  return {
    entityType: 'liga',
    entityId: `id-${Math.random().toString(36).slice(2)}`,
    lastModified: new Date().toISOString(),
    operation: 'upsert',
    data: { foo: 'bar' },
    ...overrides,
  };
}

/** An in-memory checkpoint store. */
function makeCheckpointStore(initial: string | null = null): SyncCheckpointStore & { value: string | null } {
  return {
    value: initial,
    getLastSyncAt() {
      return this.value;
    },
    setLastSyncAt(iso: string) {
      this.value = iso;
    },
  };
}

/** An audit sink that records appended entries. */
function makeAuditSink(): AuditLogSink & { entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  return {
    entries,
    append(entry: AuditEntry) {
      entries.push(entry);
    },
  };
}

/** A transmitter that captures the last request and returns a fixed response. */
function makeTransmitter(statusCode = 200): HttpsTransmitter & { calls: any[] } {
  const calls: any[] = [];
  const fn = ((opts) => {
    calls.push(opts);
    return Promise.resolve({ statusCode, body: '{}' });
  }) as HttpsTransmitter & { calls: any[] };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------

describe('CloudSyncService', () => {
  let service: CloudSyncService;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (service) service.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // configure() — endpoint validation & TLS enforcement (Req 32.8)
  // -------------------------------------------------------------------------
  describe('configure()', () => {
    it('rejects an http:// endpoint at configuration time', () => {
      service = createCloudSyncService();
      expect(() =>
        service.configure(makeConfig({ endpointUrl: 'http://insecure.example.com' })),
      ).toThrow(/https:\/\//);
    });

    it('rejects a non-URL / plain host endpoint', () => {
      service = createCloudSyncService();
      expect(() => service.configure(makeConfig({ endpointUrl: 'sync.example.com' }))).toThrow();
    });

    it('accepts an https:// endpoint and stores the key (never returns plaintext)', () => {
      service = createCloudSyncService();
      service.configure(makeConfig());
      const cfg = service.getConfig();
      expect(cfg.endpointUrl).toBe('https://sync.example.com/api');
      expect(cfg.hasApiKey).toBe(true);
      // getConfig must not expose the raw key
      expect(JSON.stringify(cfg)).not.toContain('secret-token');
    });

    it('starts the periodic poll when enabled', () => {
      service = createCloudSyncService();
      service.configure(makeConfig({ enabled: true }));
      expect(service.isRunning()).toBe(true);
    });

    it('does not run when disabled', () => {
      service = createCloudSyncService();
      service.configure(makeConfig({ enabled: false }));
      expect(service.isRunning()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // testConnection()
  // -------------------------------------------------------------------------
  describe('testConnection()', () => {
    it('returns ok on a 2xx response', async () => {
      const tx = makeTransmitter(200);
      service = createCloudSyncService({ httpsTransmitter: tx });
      service.configure(makeConfig());
      const result = await service.testConnection();
      expect(result.ok).toBe(true);
      expect(tx.calls[0].timeoutMs).toBe(10_000);
    });

    it('returns an error description on a non-2xx response', async () => {
      const tx = makeTransmitter(500);
      service = createCloudSyncService({ httpsTransmitter: tx });
      service.configure(makeConfig());
      const result = await service.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('500');
    });

    it('returns an error description when the request throws', async () => {
      const tx: HttpsTransmitter = () => Promise.reject(new Error('ECONNREFUSED'));
      service = createCloudSyncService({ httpsTransmitter: tx });
      service.configure(makeConfig());
      const result = await service.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  // -------------------------------------------------------------------------
  // syncNow() — transmission, headers, checkpoint, audit
  // -------------------------------------------------------------------------
  describe('syncNow()', () => {
    it('sends an Authorization Bearer header and JSON body of envelopes', async () => {
      const tx = makeTransmitter(200);
      const records = [makeEnvelope(), makeEnvelope()];
      service = createCloudSyncService({
        httpsTransmitter: tx,
        recordSource: () => records,
      });
      service.configure(makeConfig());

      const result = await service.syncNow();

      expect(result.success).toBe(true);
      expect(result.recordsTransmitted).toBe(2);
      expect(tx.calls[0].headers.Authorization).toBe('Bearer secret-token');
      expect(JSON.parse(tx.calls[0].body)).toHaveLength(2);
    });

    it('updates lastSyncAt on success', async () => {
      const tx = makeTransmitter(200);
      const checkpoint = makeCheckpointStore(null);
      service = createCloudSyncService({
        httpsTransmitter: tx,
        recordSource: () => [makeEnvelope()],
        checkpointStore: checkpoint,
      });
      service.configure(makeConfig());

      expect(checkpoint.value).toBeNull();
      await service.syncNow();
      expect(checkpoint.value).not.toBeNull();
    });

    it('logs the result to the AuditStore', async () => {
      const audit = makeAuditSink();
      service = createCloudSyncService({
        httpsTransmitter: makeTransmitter(200),
        recordSource: () => [makeEnvelope()],
        auditStore: audit,
      });
      service.configure(makeConfig());

      await service.syncNow();
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0].actionType).toBe('CLOUD_SYNC');
      expect((audit.entries[0].newValue as any).recordsTransmitted).toBe(1);
    });

    it('does not transmit when there are no newer records', async () => {
      const tx = makeTransmitter(200);
      service = createCloudSyncService({
        httpsTransmitter: tx,
        recordSource: () => [],
      });
      service.configure(makeConfig());

      const result = await service.syncNow();
      expect(result.success).toBe(true);
      expect(result.recordsTransmitted).toBe(0);
      expect(tx.calls).toHaveLength(0);
    });

    it('serialises concurrent syncNow() calls (no parallel transmissions)', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      const tx: HttpsTransmitter = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await Promise.resolve();
        concurrent--;
        return { statusCode: 200, body: '{}' };
      };
      service = createCloudSyncService({
        httpsTransmitter: tx,
        recordSource: () => [makeEnvelope()],
      });
      service.configure(makeConfig());

      await Promise.all([service.syncNow(), service.syncNow(), service.syncNow()]);
      expect(maxConcurrent).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Auth error handling (Req 32.9)
  // -------------------------------------------------------------------------
  describe('authentication errors', () => {
    it.each([401, 403])('stops sync and emits CLOUD_SYNC_AUTH_ERROR on HTTP %i', async (code) => {
      const events: any[] = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: (_ch: string, payload: any) => events.push(payload) },
      } as any;

      service = createCloudSyncService({
        httpsTransmitter: makeTransmitter(code),
        recordSource: () => [makeEnvelope()],
        getControlPanelWindow: () => mockWindow,
      });
      service.configure(makeConfig({ enabled: true }));
      expect(service.isRunning()).toBe(true);

      const result = await service.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain(String(code));
      expect(service.isRunning()).toBe(false); // automatic sync stopped
      expect(events.some((e) => e.type === 'CLOUD_SYNC_AUTH_ERROR')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Disable behaviour (Req 32.7)
  // -------------------------------------------------------------------------
  describe('disable', () => {
    it('stops periodic sync and pending debounce when disabled', () => {
      service = createCloudSyncService({
        httpsTransmitter: makeTransmitter(200),
        recordSource: () => [makeEnvelope()],
      });
      service.configure(makeConfig({ enabled: true }));
      service.triggerIncrementalSync();
      expect(service.isRunning()).toBe(true);

      service.configure(makeConfig({ enabled: false }));
      expect(service.isRunning()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Debounced incremental trigger (Req 32.6)
  // -------------------------------------------------------------------------
  describe('triggerIncrementalSync()', () => {
    it('collapses multiple triggers within 30s into a single sync', async () => {
      const tx = makeTransmitter(200);
      service = createCloudSyncService({
        httpsTransmitter: tx,
        recordSource: () => [makeEnvelope()],
      });
      service.configure(makeConfig({ enabled: true }));
      service.stopPeriodicSync(); // isolate the debounce path

      service.triggerIncrementalSync();
      service.triggerIncrementalSync();
      service.triggerIncrementalSync();

      await vi.advanceTimersByTimeAsync(30_000);
      // Flush the serialised sync chain
      await vi.runOnlyPendingTimersAsync();

      expect(tx.calls.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Property 35: incremental sync transmits only records newer than checkpoint
  // Validates: Requirements 32.6
  // -------------------------------------------------------------------------
  describe('Property 35: incremental delta', () => {
    it('for any records and checkpoint T, transmits exactly those with lastModified > T', async () => {
      // Feature: basketball-scoreboard, Property 35: Incremental sync transmits only records newer than the last sync checkpoint
      //
      // Validates: Requirements 32.6
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              lastModified: fc
                .date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true })
                .map((d) => d.toISOString()),
              entityId: fc.string({ minLength: 1, maxLength: 8 }),
            }),
            { maxLength: 30 },
          ),
          fc
            .date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true })
            .map((d) => d.toISOString()),
          async (recs, checkpoint) => {
            const envelopes: SyncEnvelope[] = recs.map((r) =>
              makeEnvelope({ lastModified: r.lastModified, entityId: r.entityId }),
            );
            const expected = envelopes.filter((e) => e.lastModified > checkpoint);

            const tx = makeTransmitter(200);
            const svc = createCloudSyncService({
              httpsTransmitter: tx,
              recordSource: () => envelopes,
              checkpointStore: makeCheckpointStore(checkpoint),
            });
            svc.configure(makeConfig({ enabled: true }));
            svc.stopPeriodicSync(); // avoid the poll timer firing during the run

            const result = await svc.syncNow();
            svc.dispose();

            // Records transmitted count matches expected delta size.
            expect(result.recordsTransmitted).toBe(expected.length);

            if (expected.length > 0) {
              const sent = JSON.parse(tx.calls[0].body) as SyncEnvelope[];
              // Exactly the newer records, and none older-or-equal.
              expect(sent.length).toBe(expected.length);
              for (const e of sent) {
                expect(e.lastModified > checkpoint).toBe(true);
              }
            } else {
              // Nothing newer — nothing transmitted.
              expect(tx.calls.length).toBe(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
