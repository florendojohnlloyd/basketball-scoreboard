/**
 * OfflineSyncService — unit tests (Task 66)
 *
 * Tests connectivity monitoring, pending-changes queue, and replay logic.
 *
 * Since better-sqlite3 native module is compiled for Electron's Node version
 * and not compatible with Vitest's Node runtime, we inject an in-memory mock
 * database via the _testDb config option.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PendingChange } from '../../shared/types';

// ---------------------------------------------------------------------------
// In-memory SQLite mock
// ---------------------------------------------------------------------------

class MockStatement {
  private db: MockDatabase;
  private sql: string;

  constructor(db: MockDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  run(...params: any[]): any {
    const sql = this.sql.trim();

    if (sql.startsWith('INSERT') || sql.startsWith('INSERT OR REPLACE')) {
      const row = {
        id: params[0],
        timestamp: params[1],
        entity_type: params[2],
        entity_id: params[3],
        change_type: params[4],
        payload: params[5],
      };
      // Check if entry with same ID exists
      const idx = this.db._rows.findIndex(r => r.id === row.id);
      if (idx >= 0) {
        this.db._rows[idx] = row;
      } else {
        this.db._rows.push(row);
      }
      return { changes: 1 };
    }

    if (sql.startsWith('DELETE')) {
      // DELETE FROM pending_changes WHERE id IN (...)
      const idsToDelete = new Set(params);
      const before = this.db._rows.length;
      this.db._rows = this.db._rows.filter(r => !idsToDelete.has(r.id));
      return { changes: before - this.db._rows.length };
    }

    return { changes: 0 };
  }

  all(..._params: any[]): any[] {
    // SELECT * FROM pending_changes ORDER BY timestamp ASC
    return [...this.db._rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  get(..._params: any[]): any {
    const sql = this.sql.trim();
    if (sql.includes('COUNT')) {
      return { count: this.db._rows.length };
    }
    return this.db._rows[0] || null;
  }
}

class MockDatabase {
  _rows: any[] = [];
  _closed = false;

  exec(_sql: string): void {
    // Schema creation — no-op in mock
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  close(): void {
    this._closed = true;
  }
}

// Mock dns module
const mockDnsResolve = vi.fn<[string, (err: Error | null) => void]>((_host, cb) => {
  cb(null); // online by default
});

vi.mock('dns', () => ({
  default: { resolve: (...args: any[]) => mockDnsResolve(...args) },
  resolve: (...args: any[]) => mockDnsResolve(...args),
}));

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userData' },
}));

// Mock fs (for existsSync/mkdirSync)
vi.mock('fs', () => ({
  existsSync: () => true,
  mkdirSync: () => {},
  rmSync: () => {},
}));

// Now import the service
import { createOfflineSyncService, type OfflineSyncService, type CloudSyncTransmitter } from '../offlineSyncService';

function makePendingChange(overrides: Partial<PendingChange> = {}): PendingChange {
  return {
    id: `change-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    entityType: 'gameState',
    entityId: 'game-1',
    changeType: 'UPDATE',
    payload: { score: 42 },
    ...overrides,
  };
}

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let mockDb: MockDatabase;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDnsResolve.mockImplementation((_host, cb) => cb(null)); // online by default
    mockDb = new MockDatabase();
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('creation and disposal', () => {
    it('should create service with default configuration', () => {
      service = createOfflineSyncService({ dbPath: '/tmp/test.db', pollIntervalMs: 100_000, _testDb: mockDb });
      expect(service).toBeDefined();
      expect(service.isOnline()).toBe(true);
    });

    it('should dispose cleanly without errors', () => {
      service = createOfflineSyncService({ dbPath: '/tmp/test.db', pollIntervalMs: 100_000, _testDb: mockDb });
      expect(() => service.dispose()).not.toThrow();
    });
  });

  describe('connectivity monitoring', () => {
    it('should start as online by default', () => {
      service = createOfflineSyncService({ dbPath: '/tmp/test.db', pollIntervalMs: 100_000, _testDb: mockDb });
      expect(service.isOnline()).toBe(true);
    });

    it('should emit CONNECTIVITY_CHANGED event when going offline', async () => {
      const events: any[] = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: (_channel: string, payload: any) => events.push(payload) },
      } as any;

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 10_000,
        getControlPanelWindow: () => mockWindow,
        _testDb: mockDb,
      });

      // Simulate going offline
      mockDnsResolve.mockImplementation((_host, cb) => cb(new Error('ENOTFOUND')));

      // Advance timer to trigger poll
      await vi.advanceTimersByTimeAsync(10_000);

      const connectivityEvent = events.find(e => e.type === 'CONNECTIVITY_CHANGED');
      expect(connectivityEvent).toBeDefined();
      expect(connectivityEvent.online).toBe(false);
      expect(service.isOnline()).toBe(false);
    });

    it('should emit CONNECTIVITY_CHANGED event when coming back online', async () => {
      const events: any[] = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: (_channel: string, payload: any) => events.push(payload) },
      } as any;

      // Start offline
      mockDnsResolve.mockImplementation((_host, cb) => cb(new Error('ENOTFOUND')));

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 10_000,
        getControlPanelWindow: () => mockWindow,
        _testDb: mockDb,
      });

      // Wait for initial poll to detect offline
      await vi.advanceTimersByTimeAsync(10_000);
      expect(service.isOnline()).toBe(false);

      // Go back online
      mockDnsResolve.mockImplementation((_host, cb) => cb(null));

      events.length = 0; // clear previous events

      await vi.advanceTimersByTimeAsync(10_000);
      expect(service.isOnline()).toBe(true);

      const connectivityEvent = events.find(e => e.type === 'CONNECTIVITY_CHANGED');
      expect(connectivityEvent).toBeDefined();
      expect(connectivityEvent.online).toBe(true);
    });

    it('should not emit event when connectivity status does not change', async () => {
      const events: any[] = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: (_channel: string, payload: any) => events.push(payload) },
      } as any;

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 10_000,
        getControlPanelWindow: () => mockWindow,
        _testDb: mockDb,
      });

      // Stay online (default)
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(10_000);

      // After initial check (which may not emit since we started online), there should be no events
      const connectivityEvents = events.filter(e => e.type === 'CONNECTIVITY_CHANGED');
      expect(connectivityEvents).toHaveLength(0);
    });
  });

  describe('enqueueChange', () => {
    it('should not enqueue when Cloud Sync is disabled', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: false,
        _testDb: mockDb,
      });

      const entry = makePendingChange();
      service.enqueueChange(entry);

      expect(service.getPendingCount()).toBe(0);
    });

    it('should enqueue when Cloud Sync is enabled', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
      });

      const entry = makePendingChange();
      service.enqueueChange(entry);

      expect(service.getPendingCount()).toBe(1);
    });

    it('should store entries with correct data', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
      });

      const entry = makePendingChange({
        id: 'test-id-1',
        timestamp: '2024-01-15T10:30:00.000Z',
        entityType: 'liga',
        entityId: 'liga-123',
        changeType: 'CREATE',
        payload: { name: 'Test Liga' },
      });
      service.enqueueChange(entry);

      const pending = service.getPendingChanges();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('test-id-1');
      expect(pending[0].timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(pending[0].entityType).toBe('liga');
      expect(pending[0].entityId).toBe('liga-123');
      expect(pending[0].changeType).toBe('CREATE');
      expect(pending[0].payload).toEqual({ name: 'Test Liga' });
    });

    it('should enqueue multiple entries in order', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
      });

      const entries = [
        makePendingChange({ id: 'a', timestamp: '2024-01-15T10:00:00.000Z' }),
        makePendingChange({ id: 'b', timestamp: '2024-01-15T10:01:00.000Z' }),
        makePendingChange({ id: 'c', timestamp: '2024-01-15T10:02:00.000Z' }),
      ];

      for (const entry of entries) {
        service.enqueueChange(entry);
      }

      const pending = service.getPendingChanges();
      expect(pending).toHaveLength(3);
      // Should be ordered by timestamp ASC
      expect(pending[0].id).toBe('a');
      expect(pending[1].id).toBe('b');
      expect(pending[2].id).toBe('c');
    });

    it('should respect setCloudSyncEnabled toggle', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: false,
        _testDb: mockDb,
      });

      service.enqueueChange(makePendingChange({ id: 'before-enable' }));
      expect(service.getPendingCount()).toBe(0);

      service.setCloudSyncEnabled(true);
      service.enqueueChange(makePendingChange({ id: 'after-enable' }));
      expect(service.getPendingCount()).toBe(1);

      service.setCloudSyncEnabled(false);
      service.enqueueChange(makePendingChange({ id: 'after-disable' }));
      expect(service.getPendingCount()).toBe(1); // still 1, not 2
    });
  });

  describe('replayPending', () => {
    it('should do nothing when no pending changes exist', async () => {
      const transmitter = vi.fn<CloudSyncTransmitter>().mockResolvedValue(true);

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        transmitter,
      });

      await service.replayPending();
      expect(transmitter).not.toHaveBeenCalled();
    });

    it('should transmit pending changes and delete on success', async () => {
      const transmitter = vi.fn<CloudSyncTransmitter>().mockResolvedValue(true);

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        transmitter,
        _testDb: mockDb,
      });

      service.enqueueChange(makePendingChange({ id: 'x1' }));
      service.enqueueChange(makePendingChange({ id: 'x2' }));

      expect(service.getPendingCount()).toBe(2);

      await service.replayPending();

      expect(transmitter).toHaveBeenCalledTimes(1);
      expect(transmitter).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: 'x1' }),
        expect.objectContaining({ id: 'x2' }),
      ]));
      expect(service.getPendingCount()).toBe(0);
    });

    it('should emit SYNC_STARTED and SYNC_COMPLETE events on success', async () => {
      const events: any[] = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: (_channel: string, payload: any) => events.push(payload) },
      } as any;

      const transmitter = vi.fn<CloudSyncTransmitter>().mockResolvedValue(true);

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        transmitter,
        getControlPanelWindow: () => mockWindow,
        _testDb: mockDb,
      });

      service.enqueueChange(makePendingChange({ id: 'e1' }));
      await service.replayPending();

      expect(events).toContainEqual({ type: 'SYNC_STARTED' });
      expect(events).toContainEqual({ type: 'SYNC_COMPLETE', recordsTransmitted: 1 });
    });

    it('should retry up to 3 times on failure with 60-second intervals', async () => {
      const events: any[] = [];
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: (_channel: string, payload: any) => events.push(payload) },
      } as any;

      const transmitter = vi.fn<CloudSyncTransmitter>().mockResolvedValue(false);

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        transmitter,
        retryIntervalMs: 60_000,
        maxRetries: 3,
        getControlPanelWindow: () => mockWindow,
        _testDb: mockDb,
      });

      service.enqueueChange(makePendingChange({ id: 'fail1' }));

      // Start replay (will fail, wait 60s, retry, wait 60s, retry)
      const replayPromise = service.replayPending();

      // First attempt fails — advance past first retry interval
      await vi.advanceTimersByTimeAsync(60_000);

      // Second attempt fails — advance past second retry interval
      await vi.advanceTimersByTimeAsync(60_000);

      await replayPromise;

      expect(transmitter).toHaveBeenCalledTimes(3);
      // Should emit SYNC_FAILED after all retries exhausted
      const finalFailEvent = events.filter(e => e.type === 'SYNC_FAILED').pop();
      expect(finalFailEvent).toBeDefined();
      expect(finalFailEvent.attempt).toBe(3);
      expect(finalFailEvent.maxAttempts).toBe(3);
      // Entries should still be in the queue (not deleted on failure)
      expect(service.getPendingCount()).toBe(1);
    });

    it('should not transmit if no transmitter is configured', async () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
        // No transmitter provided
      });

      service.enqueueChange(makePendingChange({ id: 'no-tx' }));
      await service.replayPending();

      // Entry should remain (nothing to transmit to)
      expect(service.getPendingCount()).toBe(1);
    });

    it('should delete entries after successful transmission', async () => {
      const transmitter = vi.fn<CloudSyncTransmitter>().mockResolvedValue(true);

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        transmitter,
        _testDb: mockDb,
      });

      service.enqueueChange(makePendingChange({ id: 'd1' }));
      service.enqueueChange(makePendingChange({ id: 'd2' }));
      service.enqueueChange(makePendingChange({ id: 'd3' }));

      await service.replayPending();

      expect(service.getPendingCount()).toBe(0);
      expect(service.getPendingChanges()).toHaveLength(0);
    });

    it('should succeed on retry after initial failure', async () => {
      let callCount = 0;
      const transmitter = vi.fn<CloudSyncTransmitter>().mockImplementation(async () => {
        callCount++;
        return callCount >= 2; // fail first, succeed on second
      });

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        transmitter,
        retryIntervalMs: 60_000,
        maxRetries: 3,
        _testDb: mockDb,
      });

      service.enqueueChange(makePendingChange({ id: 'retry-success' }));

      const replayPromise = service.replayPending();

      // First attempt fails — advance past retry interval
      await vi.advanceTimersByTimeAsync(60_000);

      await replayPromise;

      expect(transmitter).toHaveBeenCalledTimes(2);
      expect(service.getPendingCount()).toBe(0);
    });
  });

  describe('connectivity restored triggers replay', () => {
    it('should schedule replayPending within 30 seconds when going online', async () => {
      const transmitter = vi.fn<CloudSyncTransmitter>().mockResolvedValue(true);

      // Start offline
      mockDnsResolve.mockImplementation((_host, cb) => cb(new Error('ENOTFOUND')));

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 10_000,
        replayDelayMs: 30_000,
        cloudSyncEnabled: true,
        transmitter,
        _testDb: mockDb,
      });

      // Wait for initial poll to detect offline
      await vi.advanceTimersByTimeAsync(10_000);
      expect(service.isOnline()).toBe(false);

      // Enqueue a change while offline
      service.enqueueChange(makePendingChange({ id: 'offline-change' }));
      expect(service.getPendingCount()).toBe(1);

      // Go back online
      mockDnsResolve.mockImplementation((_host, cb) => cb(null));

      // Advance to next poll — detect online
      await vi.advanceTimersByTimeAsync(10_000);
      expect(service.isOnline()).toBe(true);

      // Replay should not have happened yet
      expect(transmitter).not.toHaveBeenCalled();

      // Advance 30 seconds — replay delay
      await vi.advanceTimersByTimeAsync(30_000);

      // Now the replay should have been triggered
      expect(transmitter).toHaveBeenCalledTimes(1);
      expect(service.getPendingCount()).toBe(0);
    });
  });

  describe('isCloudSyncEnabled', () => {
    it('should reflect initial config', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
      });
      expect(service.isCloudSyncEnabled()).toBe(true);
    });

    it('should reflect toggle', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: false,
        _testDb: mockDb,
      });
      expect(service.isCloudSyncEnabled()).toBe(false);
      service.setCloudSyncEnabled(true);
      expect(service.isCloudSyncEnabled()).toBe(true);
    });
  });

  describe('getPendingCount', () => {
    it('should return 0 when no entries', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
      });
      expect(service.getPendingCount()).toBe(0);
    });

    it('should return accurate count', () => {
      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 100_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
      });

      service.enqueueChange(makePendingChange({ id: 'c1' }));
      service.enqueueChange(makePendingChange({ id: 'c2' }));
      service.enqueueChange(makePendingChange({ id: 'c3' }));

      expect(service.getPendingCount()).toBe(3);
    });
  });

  describe('local features remain functional', () => {
    it('all local operations work when offline', async () => {
      // Start offline
      mockDnsResolve.mockImplementation((_host, cb) => cb(new Error('ENOTFOUND')));

      service = createOfflineSyncService({
        dbPath: '/tmp/test.db',
        pollIntervalMs: 10_000,
        cloudSyncEnabled: true,
        _testDb: mockDb,
      });

      // Wait for offline detection
      await vi.advanceTimersByTimeAsync(10_000);
      expect(service.isOnline()).toBe(false);

      // Enqueue should still work (queue locally)
      service.enqueueChange(makePendingChange({ id: 'offline-1' }));
      service.enqueueChange(makePendingChange({ id: 'offline-2' }));
      expect(service.getPendingCount()).toBe(2);
      expect(service.getPendingChanges()).toHaveLength(2);

      // Toggle cloud sync still works
      service.setCloudSyncEnabled(false);
      expect(service.isCloudSyncEnabled()).toBe(false);
      service.setCloudSyncEnabled(true);
      expect(service.isCloudSyncEnabled()).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Sync conflict resolution (Task 67, Requirement 30)
// ---------------------------------------------------------------------------

describe('handleConflict / resolveConflict', () => {
  let service: OfflineSyncService;
  let mockDb: MockDatabase;

  // Helper to build a minimal SyncRecord
  function makeSyncRecord(overrides: Partial<import('../../shared/types').SyncRecord> = {}): import('../../shared/types').SyncRecord {
    return {
      entityType: 'gameState',
      entityId: 'game-1',
      lastModifiedAt: new Date().toISOString(),
      fields: [{ field: 'score', value: 42 }],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockDnsResolve.mockImplementation((_host, cb) => cb(null));
    mockDb = new MockDatabase();
  });

  afterEach(() => {
    if (service) service.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cancel (no resolveConflict call, timeout) defaults to keeping local version', async () => {
    const events: any[] = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: (_channel: string, payload: any) => events.push(payload) },
    } as any;

    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      getControlPanelWindow: () => mockWindow,
      _testDb: mockDb,
    });

    const local = makeSyncRecord({ lastModifiedAt: '2024-01-15T10:00:00.000Z', fields: [{ field: 'score', value: 10 }] });
    const remote = makeSyncRecord({ lastModifiedAt: '2024-01-15T11:00:00.000Z', fields: [{ field: 'score', value: 20 }] });

    // Start the conflict but never call resolveConflict (simulating cancel / timeout)
    const conflictPromise = service.handleConflict(local, remote);

    // Verify SYNC_CONFLICT event was emitted with both versions
    const conflictEvent = events.find(e => e.type === 'SYNC_CONFLICT');
    expect(conflictEvent).toBeDefined();
    expect(conflictEvent.local).toEqual(local);
    expect(conflictEvent.remote).toEqual(remote);
    expect(conflictEvent.conflictId).toBeDefined();
    expect(typeof conflictEvent.conflictId).toBe('string');

    // Advance 5 minutes to trigger the timeout (defaults to 'local')
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    const choice = await conflictPromise;
    // Without explicit resolution, should default to 'local' (keep local version)
    expect(choice).toBe('local');
  });

  it('resolveConflict with "local" returns local choice', async () => {
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} },
    } as any;

    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      getControlPanelWindow: () => mockWindow,
      _testDb: mockDb,
    });

    const local = makeSyncRecord({ fields: [{ field: 'homeScore', value: 55 }] });
    const remote = makeSyncRecord({ fields: [{ field: 'homeScore', value: 60 }] });

    const conflictPromise = service.handleConflict(local, remote);

    // Capture the conflictId from the emitted event
    const events: any[] = [];
    // Re-set up mock to capture events (service already called sendEvent, capture via spy)
    // We need to grab the conflictId from the service's internal state by intercepting the event
    // For this test, we'll resolve immediately using resolveConflict directly

    // The service's handleConflict stores the pending conflict by conflictId.
    // Since we need the conflictId, we track it from the IPC event in a real scenario.
    // In a unit test, we call resolveConflict on all known conflict IDs by inspecting
    // the pending map via the public interface.

    // Alternative: listen to the window mock for the conflictId
    const capturingWindow = {
      isDestroyed: () => false,
      webContents: { send: (_channel: string, payload: any) => events.push(payload) },
    } as any;

    service.dispose();
    mockDb = new MockDatabase();
    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      getControlPanelWindow: () => capturingWindow,
      _testDb: mockDb,
    });

    const conflictPromise2 = service.handleConflict(local, remote);
    const conflictId = events.find(e => e.type === 'SYNC_CONFLICT')?.conflictId as string;

    service.resolveConflict(conflictId, 'local');
    const choice = await conflictPromise2;
    expect(choice).toBe('local');
  });

  it('resolveConflict with "remote" returns remote choice', async () => {
    const events: any[] = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: (_channel: string, payload: any) => events.push(payload) },
    } as any;

    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      getControlPanelWindow: () => mockWindow,
      _testDb: mockDb,
    });

    const local = makeSyncRecord({ fields: [{ field: 'period', value: 2 }] });
    const remote = makeSyncRecord({ fields: [{ field: 'period', value: 3 }] });

    const conflictPromise = service.handleConflict(local, remote);
    const conflictId = events.find(e => e.type === 'SYNC_CONFLICT')?.conflictId as string;

    service.resolveConflict(conflictId, 'remote');
    const choice = await conflictPromise;
    expect(choice).toBe('remote');
  });

  it('emits SYNC_CONFLICT event containing conflictId, local, and remote fields', async () => {
    const events: any[] = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: (_channel: string, payload: any) => events.push(payload) },
    } as any;

    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      getControlPanelWindow: () => mockWindow,
      _testDb: mockDb,
    });

    const local = makeSyncRecord({
      entityType: 'liga',
      entityId: 'liga-abc',
      lastModifiedAt: '2024-06-01T09:00:00.000Z',
      fields: [{ field: 'name', value: 'Local Liga' }],
    });
    const remote = makeSyncRecord({
      entityType: 'liga',
      entityId: 'liga-abc',
      lastModifiedAt: '2024-06-01T10:00:00.000Z',
      fields: [{ field: 'name', value: 'Remote Liga' }],
    });

    // Don't await — just fire it
    const conflictPromise = service.handleConflict(local, remote);

    const event = events.find(e => e.type === 'SYNC_CONFLICT');
    expect(event).toBeDefined();
    expect(event.conflictId).toBeDefined();
    expect(event.local).toEqual(local);
    expect(event.remote).toEqual(remote);

    // Resolve to avoid hanging promise
    service.resolveConflict(event.conflictId, 'local');
    await conflictPromise;
  });

  it('dispose resolves all pending conflicts with "local"', async () => {
    const events: any[] = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: (_channel: string, payload: any) => events.push(payload) },
    } as any;

    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      getControlPanelWindow: () => mockWindow,
      _testDb: mockDb,
    });

    const local = makeSyncRecord();
    const remote = makeSyncRecord();

    // Start two unresolved conflicts
    const p1 = service.handleConflict(local, remote);
    const p2 = service.handleConflict(local, remote);

    // Dispose should resolve both with 'local'
    service.dispose();

    const [c1, c2] = await Promise.all([p1, p2]);
    expect(c1).toBe('local');
    expect(c2).toBe('local');
  });

  it('resolving unknown conflictId is a no-op (does not throw)', () => {
    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      _testDb: mockDb,
    });

    expect(() => service.resolveConflict('unknown-id', 'remote')).not.toThrow();
  });

  it('multiple concurrent conflicts can be resolved independently', async () => {
    const events: any[] = [];
    const mockWindow = {
      isDestroyed: () => false,
      webContents: { send: (_channel: string, payload: any) => events.push(payload) },
    } as any;

    service = createOfflineSyncService({
      dbPath: '/tmp/test.db',
      pollIntervalMs: 100_000,
      getControlPanelWindow: () => mockWindow,
      _testDb: mockDb,
    });

    const local = makeSyncRecord();
    const remote = makeSyncRecord();

    const p1 = service.handleConflict(local, remote);
    const p2 = service.handleConflict(local, remote);

    const conflictEvents = events.filter(e => e.type === 'SYNC_CONFLICT');
    expect(conflictEvents).toHaveLength(2);

    // Resolve them in reverse order
    service.resolveConflict(conflictEvents[1].conflictId, 'remote');
    service.resolveConflict(conflictEvents[0].conflictId, 'local');

    const [c1, c2] = await Promise.all([p1, p2]);
    expect(c1).toBe('local');
    expect(c2).toBe('remote');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests (Task 81)
// ---------------------------------------------------------------------------

// Feature: basketball-scoreboard, Property 31
//
// Property 31 — Pending-changes replay preserves insertion order:
// For any ordered sequence of PendingChange entries E1, E2, ..., En enqueued
// while offline, when the sync service replays them, the outbound HTTP payloads
// SHALL be transmitted in the same chronological order (E1 before E2 before ...
// before En) as determined by their `timestamp` fields.
//
// Validates: Requirements 30.7, 30.8
import fc from 'fast-check';

describe('OfflineSyncService — property-based tests (Property 31)', () => {
  let service: OfflineSyncService;

  beforeEach(() => {
    // Use real timers here — replayPending awaits transmitter (no retry waits
    // occur on success), so fake timers are unnecessary and would complicate
    // the async fast-check runs.
    mockDnsResolve.mockImplementation((_host, cb) => cb(null));
  });

  afterEach(() => {
    if (service) service.dispose();
    vi.restoreAllMocks();
  });

  // Generator for a single PendingChange with an arbitrary (but valid) ISO
  // timestamp. We keep the millisecond epoch within a bounded, sane range so
  // toISOString() never throws, and derive a unique id per entry.
  const pendingChangeArb = (index: number): fc.Arbitrary<PendingChange> =>
    fc.record({
      epochMs: fc.integer({ min: 0, max: 4_102_444_800_000 }), // 1970 .. 2100
      entityType: fc.constantFrom('gameState', 'liga', 'bracket', 'preset'),
      entityId: fc.string({ minLength: 1, maxLength: 12 }),
      changeType: fc.constantFrom<PendingChange['changeType']>('CREATE', 'UPDATE', 'DELETE'),
      payloadValue: fc.integer(),
    }).map(({ epochMs, entityType, entityId, changeType, payloadValue }): PendingChange => ({
      id: `pc-${index}-${epochMs}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(epochMs).toISOString(),
      entityType,
      entityId,
      changeType,
      payload: { value: payloadValue },
    }));

  it('replayPending transmits entries in ascending timestamp / insertion order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary array of 1..25 entries (each with its own arbitrary timestamp)
        fc.integer({ min: 1, max: 25 }).chain((n) =>
          fc.tuple(...Array.from({ length: n }, (_, i) => pendingChangeArb(i))),
        ),
        async (entries) => {
          // Fresh DB + service per run so state does not leak between iterations.
          const mockDb = new MockDatabase();
          let capturedOrder: PendingChange[] | null = null;

          const transmitter: CloudSyncTransmitter = async (transmitted) => {
            capturedOrder = transmitted;
            return true; // success — entries get deleted, one clean transmission
          };

          if (service) service.dispose();
          service = createOfflineSyncService({
            dbPath: '/tmp/test-pbt.db',
            pollIntervalMs: 100_000,
            cloudSyncEnabled: true,
            transmitter,
            _testDb: mockDb,
          });

          // Enqueue every entry in insertion order (E1, E2, ..., En).
          for (const entry of entries) {
            service.enqueueChange(entry);
          }

          await service.replayPending();

          // The transmitter must have been called with the full batch.
          expect(capturedOrder).not.toBeNull();
          const order = capturedOrder as unknown as PendingChange[];
          expect(order).toHaveLength(entries.length);

          // Assert the transmitted timestamps are in non-decreasing (ascending)
          // chronological order: E1 before E2 before ... before En.
          for (let i = 1; i < order.length; i++) {
            const prev = order[i - 1].timestamp;
            const curr = order[i].timestamp;
            expect(prev <= curr).toBe(true);
          }

          // Sanity: the transmitted set is a permutation of the enqueued ids.
          const transmittedIds = [...order.map((e) => e.id)].sort();
          const enqueuedIds = [...entries.map((e) => e.id)].sort();
          expect(transmittedIds).toEqual(enqueuedIds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
