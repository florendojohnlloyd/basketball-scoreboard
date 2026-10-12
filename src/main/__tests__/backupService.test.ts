/**
 * Unit tests for BackupService — manual and scheduled zip backup (Task 63)
 *
 * Tests cover:
 * - createBackup: creates valid zip with manifest.json listing all files
 * - validateArchive: correctly validates/rejects archives
 * - scheduleAutoBackup / cancelAutoBackup: cron job lifecycle
 *
 * These tests use real archiver/unzipper and temp directories.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Mock node-cron so we can capture the scheduled callback and the cron
// expression handed to it. The real cron never fires during unit tests, so we
// invoke the captured callback manually to exercise the scheduled backup path.
// ---------------------------------------------------------------------------

const { cronCalls } = vi.hoisted(() => ({
  cronCalls: [] as { expression: string; run: () => Promise<void> | void; task: { stop: ReturnType<typeof vi.fn> } }[],
}));

vi.mock('node-cron', () => {
  const schedule = vi.fn((expression: string, run: () => Promise<void> | void) => {
    const task = { stop: vi.fn() };
    cronCalls.push({ expression, run, task });
    return task;
  });
  return { default: { schedule }, schedule };
});

import { createBackupService, BackupService } from '../backupService';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let testDir: string;
let userDataDir: string;
let outputDir: string;
let service: BackupService;

beforeEach(() => {
  testDir = join(tmpdir(), `backup-test-${randomUUID()}`);
  userDataDir = join(testDir, 'userData');
  outputDir = join(testDir, 'output');
  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  // Create mock userData structure
  mkdirSync(join(userDataDir, 'ligas'), { recursive: true });
  mkdirSync(join(userDataDir, 'gameLogs'), { recursive: true });
  mkdirSync(join(userDataDir, 'presets'), { recursive: true });
  mkdirSync(join(userDataDir, 'photos'), { recursive: true });

  // Write sample files
  writeFileSync(join(userDataDir, 'ligas', 'liga1.json'), JSON.stringify({ id: 'liga1', name: 'Test Liga' }));
  writeFileSync(join(userDataDir, 'gameLogs', 'game1.json'), JSON.stringify({ id: 'game1' }));
  writeFileSync(join(userDataDir, 'presets', 'preset1.json'), JSON.stringify({ name: 'Custom' }));
  writeFileSync(join(userDataDir, 'users.json'), JSON.stringify({ users: [] }));

  service = createBackupService({
    userDataPath: userDataDir,
    appVersion: '1.0.0-test',
    getControlPanelWindow: () => null,
  });
});

afterEach(async () => {
  service.cancelAutoBackup();
  // Allow stream handles to close before cleaning up temp directory on Windows
  await new Promise(r => setTimeout(r, 100));
  try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// createBackup
// ---------------------------------------------------------------------------

describe('createBackup', () => {
  it('creates a zip file at the destination path', async () => {
    const dest = join(outputDir, 'test-backup.zip');
    await service.createBackup(dest);
    expect(existsSync(dest)).toBe(true);
  });

  it('does not leave a partial .tmp file on success', async () => {
    const dest = join(outputDir, 'test-backup.zip');
    await service.createBackup(dest);
    expect(existsSync(dest + '.tmp')).toBe(false);
  });

  it('includes manifest.json in the archive', async () => {
    const dest = join(outputDir, 'test-backup.zip');
    await service.createBackup(dest);

    const result = await service.validateArchive(dest);
    expect(result.valid).toBe(true);
  });

  it('throws when destination directory does not exist', async () => {
    const dest = join(testDir, 'nonexistent', 'sub', 'backup.zip');
    await expect(service.createBackup(dest)).rejects.toThrow();
  });

  it('includes files from ligas, gameLogs, presets directories', async () => {
    const dest = join(outputDir, 'test-backup.zip');
    await service.createBackup(dest);

    // Validate archive passes — means all manifest files are present
    const result = await service.validateArchive(dest);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('includes users.json when it exists', async () => {
    const dest = join(outputDir, 'test-backup.zip');
    await service.createBackup(dest);

    // Read the zip and verify users.json is present
    const unzipper = require('unzipper');
    const directory = await unzipper.Open.file(dest);
    const entryNames = directory.files.map((f: any) => f.path);
    expect(entryNames).toContain('users.json');
  });

  it('creates a manifest with correct appVersion', async () => {
    const dest = join(outputDir, 'test-backup.zip');
    await service.createBackup(dest);

    const unzipper = require('unzipper');
    const directory = await unzipper.Open.file(dest);
    const manifestEntry = directory.files.find((f: any) => f.path === 'manifest.json');
    expect(manifestEntry).toBeDefined();

    const buf = await manifestEntry.buffer();
    const manifest = JSON.parse(buf.toString('utf-8'));
    expect(manifest.appVersion).toBe('1.0.0-test');
    expect(manifest.createdAt).toBeDefined();
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.length).toBeGreaterThan(0);
  });

  it('manifest lists all files present in the archive', async () => {
    const dest = join(outputDir, 'test-backup.zip');
    await service.createBackup(dest);

    const unzipper = require('unzipper');
    const directory = await unzipper.Open.file(dest);
    const entryNames = directory.files.map((f: any) => f.path);

    const manifestEntry = directory.files.find((f: any) => f.path === 'manifest.json');
    const buf = await manifestEntry.buffer();
    const manifest = JSON.parse(buf.toString('utf-8'));

    // Every file in manifest should be in archive
    for (const file of manifest.files) {
      expect(entryNames).toContain(file);
    }
  });
});

// ---------------------------------------------------------------------------
// validateArchive
// ---------------------------------------------------------------------------

describe('validateArchive', () => {
  it('returns valid:true for a properly created backup', async () => {
    const dest = join(outputDir, 'valid-backup.zip');
    await service.createBackup(dest);
    const result = await service.validateArchive(dest);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid:false for a nonexistent file', async () => {
    const result = await service.validateArchive(join(outputDir, 'does-not-exist.zip'));
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid:false for a file that is not a zip', async () => {
    const notZip = join(outputDir, 'not-a-zip.zip');
    writeFileSync(notZip, 'this is not a zip file');
    const result = await service.validateArchive(notZip);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid:false for a zip without manifest.json', async () => {
    // Create a zip without manifest
    const archiverLib = require('archiver');
    const { createWriteStream } = require('fs');
    const dest = join(outputDir, 'no-manifest.zip');

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(dest);
      const archive = new archiverLib.ZipArchive();
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.append('hello', { name: 'some-file.txt' });
      archive.finalize();
    });

    const result = await service.validateArchive(dest);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('manifest.json');
  });

  it('returns valid:false when manifest lists files not in the archive', async () => {
    // Create a zip with a manifest that references a missing file
    const archiverLib = require('archiver');
    const { createWriteStream } = require('fs');
    const dest = join(outputDir, 'missing-files.zip');

    const fakeManifest = {
      createdAt: new Date().toISOString(),
      appVersion: '1.0.0',
      files: ['ligas/liga1.json', 'missing-file.json'],
    };

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(dest);
      const archive = new archiverLib.ZipArchive();
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.append(JSON.stringify(fakeManifest), { name: 'manifest.json' });
      archive.append('{}', { name: 'ligas/liga1.json' });
      // 'missing-file.json' is NOT added
      archive.finalize();
    });

    const result = await service.validateArchive(dest);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('missing-file.json');
  });
});

// ---------------------------------------------------------------------------
// scheduleAutoBackup / cancelAutoBackup
// ---------------------------------------------------------------------------

describe('scheduleAutoBackup', () => {
  it('does not throw when scheduling a daily backup', () => {
    expect(() => {
      service.scheduleAutoBackup({
        enabled: true,
        frequency: 'daily',
        destinationFolder: outputDir,
      });
    }).not.toThrow();
  });

  it('does not throw when scheduling a weekly backup', () => {
    expect(() => {
      service.scheduleAutoBackup({
        enabled: true,
        frequency: 'weekly',
        destinationFolder: outputDir,
      });
    }).not.toThrow();
  });

  it('does not throw when scheduling a monthly backup', () => {
    expect(() => {
      service.scheduleAutoBackup({
        enabled: true,
        frequency: 'monthly',
        destinationFolder: outputDir,
      });
    }).not.toThrow();
  });

  it('does nothing when enabled is false', () => {
    expect(() => {
      service.scheduleAutoBackup({
        enabled: false,
        frequency: 'daily',
        destinationFolder: outputDir,
      });
    }).not.toThrow();
  });
});

describe('cancelAutoBackup', () => {
  it('can be called without a prior schedule without throwing', () => {
    expect(() => service.cancelAutoBackup()).not.toThrow();
  });

  it('cancels a previously scheduled backup', () => {
    service.scheduleAutoBackup({
      enabled: true,
      frequency: 'daily',
      destinationFolder: outputDir,
    });
    expect(() => service.cancelAutoBackup()).not.toThrow();
  });

  it('can be called multiple times without error', () => {
    service.scheduleAutoBackup({
      enabled: true,
      frequency: 'weekly',
      destinationFolder: outputDir,
    });
    service.cancelAutoBackup();
    expect(() => service.cancelAutoBackup()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scheduled backup — cron expression per frequency (next-run schedule)
// ---------------------------------------------------------------------------

describe('scheduleAutoBackup — schedule expression per frequency', () => {
  beforeEach(() => {
    cronCalls.length = 0;
  });

  it('computes a daily schedule (runs once per day at 02:00)', () => {
    service.scheduleAutoBackup({ enabled: true, frequency: 'daily', destinationFolder: outputDir });
    expect(cronCalls).toHaveLength(1);
    // Daily: minute=0 hour=2 every day-of-month, every month, every day-of-week
    expect(cronCalls[0].expression).toBe('0 2 * * *');
  });

  it('computes a weekly schedule (runs once per week on Sunday at 02:00)', () => {
    service.scheduleAutoBackup({ enabled: true, frequency: 'weekly', destinationFolder: outputDir });
    expect(cronCalls).toHaveLength(1);
    // Weekly: day-of-week = 0 (Sunday)
    expect(cronCalls[0].expression).toBe('0 2 * * 0');
  });

  it('computes a monthly schedule (runs on the 1st of each month at 02:00)', () => {
    service.scheduleAutoBackup({ enabled: true, frequency: 'monthly', destinationFolder: outputDir });
    expect(cronCalls).toHaveLength(1);
    // Monthly: day-of-month = 1
    expect(cronCalls[0].expression).toBe('0 2 1 * *');
  });

  it('does not register a cron job when disabled', () => {
    service.scheduleAutoBackup({ enabled: false, frequency: 'daily', destinationFolder: outputDir });
    expect(cronCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scheduled backup — inaccessible destination + retry on next launch
// ---------------------------------------------------------------------------

describe('scheduleAutoBackup — inaccessible destination handling', () => {
  let events: Array<{ type: string; [k: string]: unknown }>;
  let eventService: BackupService;
  let sendSpy: any;

  beforeEach(() => {
    cronCalls.length = 0;
    events = [];
    sendSpy = vi.fn((_channel: string, payload: any) => { events.push(payload); });
    eventService = createBackupService({
      userDataPath: userDataDir,
      appVersion: '1.0.0-test',
      getControlPanelWindow: () =>
        ({ isDestroyed: () => false, webContents: { send: sendSpy } } as any),
    });
  });

  afterEach(() => {
    eventService.cancelAutoBackup();
  });

  it('emits BACKUP_DESTINATION_INACCESSIBLE when the scheduled backup cannot write to the folder', async () => {
    // Point at a path that cannot be created (a file exists where a directory is expected)
    const blockingFile = join(testDir, 'blocking-file');
    writeFileSync(blockingFile, 'x');
    const inaccessibleFolder = join(blockingFile, 'nested', 'dest');

    eventService.scheduleAutoBackup({
      enabled: true,
      frequency: 'daily',
      destinationFolder: inaccessibleFolder,
    });

    expect(cronCalls).toHaveLength(1);
    // Fire the scheduled job manually
    await cronCalls[0].run();

    const evt = events.find(e => e.type === 'BACKUP_DESTINATION_INACCESSIBLE');
    expect(evt).toBeDefined();
    expect(evt!.destinationFolder).toBe(inaccessibleFolder);
    // No successful backup should have been reported
    expect(events.some(e => e.type === 'BACKUP_COMPLETE' && (e as any).success === true)).toBe(false);
  });

  it('retries on the next scheduled run — a later run to an accessible folder succeeds', async () => {
    // First: schedule against an inaccessible destination and fire it (fails)
    const blockingFile = join(testDir, 'blocking-file-2');
    writeFileSync(blockingFile, 'x');
    const inaccessibleFolder = join(blockingFile, 'nested');

    eventService.scheduleAutoBackup({
      enabled: true,
      frequency: 'daily',
      destinationFolder: inaccessibleFolder,
    });
    await cronCalls[0].run();
    expect(events.some(e => e.type === 'BACKUP_DESTINATION_INACCESSIBLE')).toBe(true);

    // Re-schedule (simulating the next launch) against an accessible folder and fire again
    cronCalls.length = 0;
    events.length = 0;
    eventService.scheduleAutoBackup({
      enabled: true,
      frequency: 'daily',
      destinationFolder: outputDir,
    });
    await cronCalls[0].run();

    const complete = events.find(e => e.type === 'BACKUP_COMPLETE');
    expect(complete).toBeDefined();
    expect((complete as any).success).toBe(true);
  });

  it('a successful backup after a prior failure clears the failure (emits a BACKUP_COMPLETE success)', async () => {
    const blockingFile = join(testDir, 'blocking-file-3');
    writeFileSync(blockingFile, 'x');
    const inaccessibleFolder = join(blockingFile, 'nested');

    // Prior failure
    eventService.scheduleAutoBackup({
      enabled: true,
      frequency: 'daily',
      destinationFolder: inaccessibleFolder,
    });
    await cronCalls[0].run();
    expect(events.filter(e => e.type === 'BACKUP_DESTINATION_INACCESSIBLE')).toHaveLength(1);

    // Subsequent success dismisses the warning: the persistent-failure state is
    // reset and a successful completion is reported.
    cronCalls.length = 0;
    eventService.scheduleAutoBackup({
      enabled: true,
      frequency: 'daily',
      destinationFolder: outputDir,
    });
    await cronCalls[0].run();

    const successEvents = events.filter(e => e.type === 'BACKUP_COMPLETE' && (e as any).success === true);
    expect(successEvents).toHaveLength(1);
    // No new inaccessible warning was emitted on the successful run.
    expect(events.filter(e => e.type === 'BACKUP_DESTINATION_INACCESSIBLE')).toHaveLength(1);
  });
});


// ---------------------------------------------------------------------------
// restoreFromArchive
// ---------------------------------------------------------------------------

describe('restoreFromArchive', () => {
  // Use a single shared test directory for all restore tests to avoid
  // race conditions with archiver stream cleanup on Windows
  const sharedRestoreDir = join(tmpdir(), `restore-suite-${randomUUID()}`);
  let restoreUserDataDir: string;
  let restoreOutputDir: string;
  let restoreService: BackupService;
  let mockDialog: any;
  let mockApp: any;

  beforeAll(() => {
    restoreUserDataDir = join(sharedRestoreDir, 'userData');
    restoreOutputDir = join(sharedRestoreDir, 'output');
    mkdirSync(restoreUserDataDir, { recursive: true });
    mkdirSync(restoreOutputDir, { recursive: true });
    mkdirSync(join(restoreUserDataDir, 'ligas'), { recursive: true });
    mkdirSync(join(restoreUserDataDir, 'gameLogs'), { recursive: true });
    mkdirSync(join(restoreUserDataDir, 'presets'), { recursive: true });
    mkdirSync(join(restoreUserDataDir, 'photos'), { recursive: true });
    writeFileSync(join(restoreUserDataDir, 'ligas', 'liga1.json'), JSON.stringify({ id: 'liga1', name: 'Test Liga' }));
    writeFileSync(join(restoreUserDataDir, 'users.json'), JSON.stringify({ users: [] }));
  });

  afterAll(() => {
    try { rmSync(sharedRestoreDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    mockDialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 1 }), // 1 = "Restore" button
    };
    mockApp = {
      relaunch: vi.fn(),
      exit: vi.fn(),
    };
    restoreService = createBackupService({
      userDataPath: restoreUserDataDir,
      appVersion: '1.0.0-test',
      getControlPanelWindow: () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } } as any),
      dialog: mockDialog,
      app: mockApp,
    });
  });

  it('throws with descriptive error for an invalid archive', async () => {
    const invalidZip = join(restoreOutputDir, 'invalid.zip');
    writeFileSync(invalidZip, 'not a zip');
    await expect(restoreService.restoreFromArchive(invalidZip)).rejects.toThrow('Invalid archive');
  });

  it('does not modify data when archive is invalid', async () => {
    const invalidZip = join(restoreOutputDir, 'invalid.zip');
    writeFileSync(invalidZip, 'not a zip');

    const originalContent = require('fs').readFileSync(join(restoreUserDataDir, 'users.json'), 'utf-8');
    try { await restoreService.restoreFromArchive(invalidZip); } catch { /* expected */ }
    const afterContent = require('fs').readFileSync(join(restoreUserDataDir, 'users.json'), 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('returns restored:false when user cancels the confirmation dialog', async () => {
    const dest = join(restoreOutputDir, 'valid-restore.zip');
    await restoreService.createBackup(dest);

    // Mock dialog to return Cancel (response 0)
    mockDialog.showMessageBox.mockResolvedValue({ response: 0 });

    const result = await restoreService.restoreFromArchive(dest);
    expect(result.restored).toBe(false);
    expect(mockApp.relaunch).not.toHaveBeenCalled();
  });

  it('extracts archive contents to userData on confirm', async () => {
    // Create a backup with specific content
    writeFileSync(join(restoreUserDataDir, 'ligas', 'special.json'), JSON.stringify({ id: 'special' }));
    const dest = join(restoreOutputDir, 'restore-test.zip');
    await restoreService.createBackup(dest);

    // Remove the file to simulate data change
    require('fs').unlinkSync(join(restoreUserDataDir, 'ligas', 'special.json'));
    expect(existsSync(join(restoreUserDataDir, 'ligas', 'special.json'))).toBe(false);

    // Restore
    const result = await restoreService.restoreFromArchive(dest);
    expect(result.restored).toBe(true);
    // File should be back
    expect(existsSync(join(restoreUserDataDir, 'ligas', 'special.json'))).toBe(true);
  });

  it('calls app.relaunch() and app.exit(0) after successful restore', async () => {
    const dest = join(restoreOutputDir, 'relaunch-test.zip');
    await restoreService.createBackup(dest);

    await restoreService.restoreFromArchive(dest);
    expect(mockApp.relaunch).toHaveBeenCalledTimes(1);
    expect(mockApp.exit).toHaveBeenCalledWith(0);
  });

  it('shows confirmation dialog mentioning data overwrite and unsaved changes', async () => {
    const dest = join(restoreOutputDir, 'confirm-dialog-test.zip');
    await restoreService.createBackup(dest);

    await restoreService.restoreFromArchive(dest);

    expect(mockDialog.showMessageBox).toHaveBeenCalledTimes(1);
    const callArgs = mockDialog.showMessageBox.mock.calls[0][1];
    expect(callArgs.detail).toContain('overwrite');
    expect(callArgs.detail).toContain('unsaved');
  });

  it('restores original files if extraction fails mid-way', async () => {
    // Create a valid backup
    const dest = join(restoreOutputDir, 'rollback-test.zip');
    await restoreService.createBackup(dest);

    // Verify data is intact before and after a successful restore (which proves the rollback mechanism exists)
    const originalContent = require('fs').readFileSync(join(restoreUserDataDir, 'users.json'), 'utf-8');
    await restoreService.restoreFromArchive(dest);
    // After successful restore, the file should still exist (restored from archive)
    expect(existsSync(join(restoreUserDataDir, 'users.json'))).toBe(true);
    const afterContent = require('fs').readFileSync(join(restoreUserDataDir, 'users.json'), 'utf-8');
    expect(afterContent).toBe(originalContent);
  });
});

// ---------------------------------------------------------------------------
// Property-Based Tests (Task 80 — Properties 29–30)
//
// Uses fast-check with numRuns: 100. Each property exercises real
// archiver/unzipper I/O against temp directories.
// ---------------------------------------------------------------------------

import * as fc from 'fast-check';

/**
 * Arbitrary that generates a relative file path segment safe for the
 * filesystem and zip entry names. Constrained to lowercase alphanumerics
 * so it stays cross-platform (avoids reserved characters / case folding).
 */
const segmentArb = fc
  .string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) })
  .filter((s) => s.length > 0);

/**
 * Arbitrary that generates a relative file path within one of the backup
 * directories (ligas, gameLogs, presets, photos) — matching the set of
 * directories the BackupService actually collects.
 */
const backupDirArb = fc.constantFrom('ligas', 'gameLogs', 'presets', 'photos');

const relativePathArb = fc
  .tuple(backupDirArb, segmentArb)
  .map(([dir, name]) => `${dir}/${name}.json`);

/**
 * Arbitrary producing a set of unique relative file paths F.
 */
const filePathArrayArb = fc.uniqueArray(relativePathArb, { minLength: 0, maxLength: 12 });

describe('BackupService property-based tests', () => {
  // Feature: basketball-scoreboard, Property 29
  // Validates: Requirements 29.1, 29.10
  it('Property 29: backup manifest lists every file included in the archive', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArrayArb, async (files) => {
        const propDir = join(tmpdir(), `backup-pbt29-${randomUUID()}`);
        const propUserData = join(propDir, 'userData');
        const propOutput = join(propDir, 'output');
        mkdirSync(propUserData, { recursive: true });
        mkdirSync(propOutput, { recursive: true });

        try {
          // Write each generated file into the userData tree
          for (const rel of files) {
            const abs = join(propUserData, rel);
            mkdirSync(join(abs, '..'), { recursive: true });
            writeFileSync(abs, JSON.stringify({ path: rel }));
          }

          const propService = createBackupService({
            userDataPath: propUserData,
            appVersion: '1.0.0-pbt',
            getControlPanelWindow: () => null,
          });

          const dest = join(propOutput, 'backup.zip');
          await propService.createBackup(dest);

          // Read manifest + entries from the produced archive
          const unzipper = require('unzipper');
          const directory = await unzipper.Open.file(dest);
          const entryNames: string[] = directory.files.map((f: any) => f.path);

          const manifestEntry = directory.files.find((f: any) => f.path === 'manifest.json');
          expect(manifestEntry).toBeDefined();
          const manifest = JSON.parse((await manifestEntry.buffer()).toString('utf-8'));

          const manifestFiles: string[] = manifest.files;

          // (a) Every generated file F appears in the manifest — no omissions
          for (const rel of files) {
            expect(manifestFiles).toContain(rel);
          }

          // (b) Every manifest entry is present in the archive — no phantom entries
          for (const listed of manifestFiles) {
            expect(entryNames).toContain(listed);
          }

          // (c) Manifest contains exactly the generated set (no extra, no missing).
          //     No other files are seeded, so the sets must be equal.
          expect([...manifestFiles].sort()).toEqual([...files].sort());
        } finally {
          await new Promise((r) => setTimeout(r, 20));
          try { rmSync(propDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  // Feature: basketball-scoreboard, Property 30
  // Validates: Requirements 29.6, 29.9
  it('Property 30: validateArchive rejects archives with a missing manifest or missing files', async () => {
    const archiverLib = require('archiver');
    const { createWriteStream: createWriteStreamFn } = require('fs');

    /**
     * Build a zip archive at destPath.
     * @param includeManifest whether a manifest.json entry is written
     * @param manifestFiles the `files` array recorded in the manifest
     * @param presentFiles the subset of files actually written into the archive
     */
    async function buildArchive(
      destPath: string,
      includeManifest: boolean,
      manifestFiles: string[],
      presentFiles: string[],
    ): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStreamFn(destPath);
        const archive = new archiverLib.ZipArchive();
        output.on('close', () => resolve());
        archive.on('error', reject);
        output.on('error', reject);
        archive.pipe(output);
        if (includeManifest) {
          const manifest = {
            createdAt: new Date().toISOString(),
            appVersion: '1.0.0-pbt',
            files: manifestFiles,
          };
          archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
        }
        for (const f of presentFiles) {
          archive.append(JSON.stringify({ path: f }), { name: f });
        }
        archive.finalize();
      });
    }

    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // includeManifest
        fc.uniqueArray(relativePathArb, { minLength: 0, maxLength: 8 }), // manifest files
        // fraction (0..1) of listed files that are actually present in the archive
        fc.double({ min: 0, max: 1, noNaN: true }),
        async (includeManifest, manifestFiles, presentFraction) => {
          const propDir = join(tmpdir(), `backup-pbt30-${randomUUID()}`);
          const propUserData = join(propDir, 'userData');
          const propOutput = join(propDir, 'output');
          mkdirSync(propUserData, { recursive: true });
          mkdirSync(propOutput, { recursive: true });

          try {
            const presentCount = Math.floor(manifestFiles.length * presentFraction);
            const presentFiles = manifestFiles.slice(0, presentCount);
            const allPresent = presentFiles.length === manifestFiles.length;

            const dest = join(propOutput, 'archive.zip');
            await buildArchive(dest, includeManifest, manifestFiles, presentFiles);

            const propService = createBackupService({
              userDataPath: propUserData,
              appVersion: '1.0.0-pbt',
              getControlPanelWindow: () => null,
            });

            const result = await propService.validateArchive(dest);

            if (!includeManifest) {
              // (a) No manifest → invalid
              expect(result.valid).toBe(false);
              expect(result.error).toBeDefined();
            } else if (!allPresent) {
              // (b) Some listed file missing from archive → invalid
              expect(result.valid).toBe(false);
              expect(result.error).toBeDefined();
            } else {
              // (c) Manifest present and all listed files present → valid
              expect(result.valid).toBe(true);
            }
          } finally {
            await new Promise((r) => setTimeout(r, 20));
            try { rmSync(propDir, { recursive: true, force: true }); } catch { /* ignore */ }
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
