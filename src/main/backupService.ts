/**
 * BackupService — manual and scheduled zip backup (Requirement 29)
 *
 * Builds and validates .zip archives using archiver/unzipper.
 * Automatic scheduling uses node-cron with a configurable expression.
 */

import { join, relative } from 'path';
import { existsSync, readdirSync, statSync, unlinkSync, mkdirSync, cpSync, rmSync, createReadStream } from 'fs';
import { createWriteStream } from 'fs';
import type { BrowserWindow } from 'electron';
import type { BackupManifest, BackupScheduleConfig } from '../shared/types';
import { SCOREBOARD_EVENT } from '../shared/types';
// node-cron is a plain-JS dependency (always present); imported statically so
// it can be mocked in tests. Scheduling is guarded by a null-check below.
import nodeCron from 'node-cron';

// Lazy-load dependencies to avoid crashes if native modules unavailable
let archiver: any = null;
try {
  archiver = require('archiver');
} catch {
  archiver = null;
}

let unzipper: any = null;
try {
  unzipper = require('unzipper');
} catch {
  unzipper = null;
}

const cron: any = nodeCron ?? null;

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface BackupService {
  /** Create a backup archive at the given destination path. */
  createBackup(destinationPath: string): Promise<void>;

  /** Validate an archive: check manifest presence and that all listed files exist. */
  validateArchive(archivePath: string): Promise<{ valid: boolean; error?: string }>;

  /**
   * Restore from a validated backup archive.
   * Shows a confirmation dialog, extracts files to userData,
   * then relaunches the app. On extraction failure, rolls back to
   * a temporary copy of original files.
   */
  restoreFromArchive(archivePath: string): Promise<{ restored: boolean; error?: string }>;

  /** Register a cron job for auto-backup with the configured schedule. */
  scheduleAutoBackup(config: BackupScheduleConfig): void;

  /** Stop any running cron job. */
  cancelAutoBackup(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all files under a directory, returning paths relative to baseDir.
 */
function collectFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const rel = relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push(rel);
    }
  }
  return results;
}

/**
 * Convert BackupScheduleConfig.frequency to a cron expression.
 * daily   → every day at 02:00
 * weekly  → every Sunday at 02:00
 * monthly → 1st of every month at 02:00
 */
function frequencyToCron(frequency: BackupScheduleConfig['frequency']): string {
  switch (frequency) {
    case 'daily':   return '0 2 * * *';
    case 'weekly':  return '0 2 * * 0';
    case 'monthly': return '0 2 1 * *';
    default:        return '0 2 * * *';
  }
}

/**
 * Generate a timestamped filename for auto-backups.
 */
function generateBackupFilename(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `backup_${ts}.zip`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface BackupServiceOptions {
  /** Absolute path to the userData directory containing ligas/, gameLogs/, etc. */
  userDataPath: string;
  /** Application version string (e.g. from package.json). */
  appVersion: string;
  /** Optional: function returning the Control Panel BrowserWindow for event emission. */
  getControlPanelWindow?: () => BrowserWindow | null;
  /** Optional: Electron dialog module (injected for testability). */
  dialog?: typeof import('electron').dialog;
  /** Optional: Electron app module (injected for testability). */
  app?: typeof import('electron').app;
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  const { userDataPath, appVersion, getControlPanelWindow, dialog: dialogModule, app: appModule } = options;

  let cronTask: { stop: () => void } | null = null;
  let lastBackupFailed = false;

  function sendEvent(payload: { type: string; [k: string]: unknown }): void {
    const win = getControlPanelWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(SCOREBOARD_EVENT, payload);
    }
  }

  // ── Directories to back up (relative to userDataPath) ──
  const BACKUP_DIRS = ['ligas', 'gameLogs', 'presets', 'photos'];
  const BACKUP_FILES = ['users.json', 'audit.db'];

  /**
   * Collect all files that exist in the userData directory for backup.
   * Returns paths relative to userDataPath.
   */
  function collectBackupFiles(): string[] {
    const files: string[] = [];

    // Collect files from directories
    for (const dir of BACKUP_DIRS) {
      const absDir = join(userDataPath, dir);
      if (existsSync(absDir)) {
        const dirFiles = collectFiles(absDir, userDataPath);
        files.push(...dirFiles);
      }
    }

    // Collect individual files
    for (const file of BACKUP_FILES) {
      const absFile = join(userDataPath, file);
      if (existsSync(absFile)) {
        files.push(file);
      }
    }

    return files;
  }

  async function createBackup(destinationPath: string): Promise<void> {
    if (!archiver) {
      throw new Error('archiver library is not available');
    }

    // Validate destination directory exists before attempting to write
    const destDir = require('path').dirname(destinationPath);
    if (!existsSync(destDir)) {
      throw new Error(`Destination directory does not exist: ${destDir}`);
    }

    const files = collectBackupFiles();

    // Build manifest
    const manifest: BackupManifest = {
      createdAt: new Date().toISOString(),
      appVersion,
      files,
    };

    // Write the zip atomically — use a temp path, then rename on success
    const tempPath = destinationPath + '.tmp';

    return new Promise<void>((resolve, reject) => {
      let output: ReturnType<typeof createWriteStream>;
      try {
        output = createWriteStream(tempPath);
      } catch (err) {
        reject(new Error(`Cannot write to destination: ${(err as Error).message}`));
        return;
      }

      const archive = new archiver.ZipArchive({ zlib: { level: 6 } });

      let finished = false;

      output.on('close', () => {
        if (!finished) {
          finished = true;
          // Rename temp file to final destination
          try {
            const fs = require('fs');
            // Remove destination if it already exists
            if (existsSync(destinationPath)) {
              fs.unlinkSync(destinationPath);
            }
            fs.renameSync(tempPath, destinationPath);
            resolve();
          } catch (err) {
            // Clean up temp file on rename failure
            try { unlinkSync(tempPath); } catch { /* ignore */ }
            reject(new Error(`Failed to finalize backup: ${(err as Error).message}`));
          }
        }
      });

      archive.on('error', (err: Error) => {
        if (!finished) {
          finished = true;
          // Clean up partial file
          try { output.close(); } catch { /* ignore */ }
          try { unlinkSync(tempPath); } catch { /* ignore */ }
          reject(err);
        }
      });

      output.on('error', (err: Error) => {
        if (!finished) {
          finished = true;
          try { unlinkSync(tempPath); } catch { /* ignore */ }
          reject(err);
        }
      });

      archive.pipe(output);

      // Add manifest.json first
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

      // Add all collected files
      for (const filePath of files) {
        const absPath = join(userDataPath, filePath);
        if (existsSync(absPath)) {
          archive.file(absPath, { name: filePath });
        }
      }

      archive.finalize();
    });
  }

  async function validateArchive(archivePath: string): Promise<{ valid: boolean; error?: string }> {
    if (!unzipper) {
      return { valid: false, error: 'unzipper library is not available' };
    }

    try {
      const { Open } = unzipper;

      const directory = await Open.file(archivePath);
      const entryNames = directory.files.map((f: any) => f.path);

      // Check manifest.json is present
      if (!entryNames.includes('manifest.json')) {
        return { valid: false, error: 'manifest.json not found in archive' };
      }

      // Read manifest
      const manifestEntry = directory.files.find((f: any) => f.path === 'manifest.json');
      if (!manifestEntry) {
        return { valid: false, error: 'manifest.json not found in archive' };
      }

      const manifestBuffer = await manifestEntry.buffer();
      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(manifestBuffer.toString('utf-8'));
      } catch {
        return { valid: false, error: 'manifest.json is not valid JSON' };
      }

      // Validate manifest structure
      if (!manifest.createdAt || !manifest.appVersion || !Array.isArray(manifest.files)) {
        return { valid: false, error: 'manifest.json is missing required fields' };
      }

      // Verify all listed files exist in the archive
      for (const file of manifest.files) {
        if (!entryNames.includes(file)) {
          return { valid: false, error: `File listed in manifest is missing from archive: ${file}` };
        }
      }

      return { valid: true };
    } catch (err) {
      return { valid: false, error: `Failed to read archive: ${(err as Error).message}` };
    }
  }

  async function restoreFromArchive(archivePath: string): Promise<{ restored: boolean; error?: string }> {
    if (!unzipper) {
      throw new Error('unzipper library is not available');
    }

    // Step 1: Validate the archive
    const validation = await validateArchive(archivePath);
    if (!validation.valid) {
      throw new Error(`Invalid archive: ${validation.error}`);
    }

    // Step 2: Show confirmation dialog
    const win = getControlPanelWindow?.();
    if (dialogModule && win) {
      const confirmResult = await dialogModule.showMessageBox(win, {
        type: 'warning',
        title: 'Restore Backup',
        message: 'Restore from backup?',
        detail:
          'This will overwrite all current data with the contents of the selected backup archive.\n\n' +
          'Any unsaved in-progress game changes will be discarded.\n\n' +
          'The application will restart after the restore completes.',
        buttons: ['Cancel', 'Restore'],
        defaultId: 0,
        cancelId: 0,
      });

      // User cancelled (index 0 = Cancel)
      if (confirmResult.response === 0) {
        return { restored: false };
      }
    }

    // Step 3: Create a temporary backup of current userData for rollback
    const tempBackupDir = join(userDataPath, '..', `_restore_rollback_${Date.now()}`);
    try {
      cpSync(userDataPath, tempBackupDir, { recursive: true });
    } catch (err) {
      throw new Error(`Failed to create temporary rollback copy: ${(err as Error).message}`);
    }

    // Step 4: Extract archive contents to userData
    try {
      const { Open } = unzipper;
      const directory = await Open.file(archivePath);

      for (const entry of directory.files) {
        // Skip directories
        if (entry.type === 'Directory') continue;

        const targetPath = join(userDataPath, entry.path);
        const targetDir = join(targetPath, '..');

        // Ensure target directory exists
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        // Extract file
        const content = await entry.buffer();
        require('fs').writeFileSync(targetPath, content);
      }
    } catch (err) {
      // Step 4b: Extraction failed — rollback from temporary copy
      try {
        // Remove the partially-extracted userData
        rmSync(userDataPath, { recursive: true, force: true });
        // Restore the original files
        cpSync(tempBackupDir, userDataPath, { recursive: true });
      } catch (rollbackErr) {
        // Rollback also failed — show error about both
        const errorMsg = `Extraction failed: ${(err as Error).message}. Rollback also failed: ${(rollbackErr as Error).message}`;
        sendEvent({ type: 'BACKUP_RESTORE_ERROR', error: errorMsg });
        // Clean up temp if possible
        try { rmSync(tempBackupDir, { recursive: true, force: true }); } catch { /* ignore */ }
        throw new Error(errorMsg);
      }

      // Clean up temp backup
      try { rmSync(tempBackupDir, { recursive: true, force: true }); } catch { /* ignore */ }

      // Show error to user
      if (dialogModule && win) {
        await dialogModule.showMessageBox(win, {
          type: 'error',
          title: 'Restore Failed',
          message: 'Backup restoration failed',
          detail: `An error occurred during extraction. Your original data has been restored.\n\nError: ${(err as Error).message}`,
          buttons: ['OK'],
        });
      }
      sendEvent({ type: 'BACKUP_RESTORE_ERROR', error: (err as Error).message });
      return { restored: false, error: (err as Error).message };
    }

    // Step 5: Clean up the temporary rollback directory
    try { rmSync(tempBackupDir, { recursive: true, force: true }); } catch { /* ignore */ }

    // Step 6: Relaunch the app
    if (appModule) {
      appModule.relaunch();
      appModule.exit(0);
    }

    return { restored: true };
  }

  function scheduleAutoBackup(config: BackupScheduleConfig): void {
    // Cancel any existing task first
    cancelAutoBackup();

    if (!config.enabled) return;
    if (!cron) {
      console.warn('[BackupService] node-cron not available — auto-backup disabled');
      return;
    }

    const cronExpr = frequencyToCron(config.frequency);
    const destinationFolder = config.destinationFolder;

    cronTask = cron.schedule(cronExpr, async () => {
      // Check destination folder accessibility
      try {
        if (!existsSync(destinationFolder)) {
          mkdirSync(destinationFolder, { recursive: true });
        }
        // Quick write test
        const testFile = join(destinationFolder, '.backup_test');
        require('fs').writeFileSync(testFile, 'test', 'utf-8');
        require('fs').unlinkSync(testFile);
      } catch {
        lastBackupFailed = true;
        sendEvent({
          type: 'BACKUP_DESTINATION_INACCESSIBLE',
          destinationFolder,
        });
        return;
      }

      const filename = generateBackupFilename();
      const destPath = join(destinationFolder, filename);

      try {
        await createBackup(destPath);
        lastBackupFailed = false;
        sendEvent({
          type: 'BACKUP_COMPLETE',
          success: true,
          path: destPath,
        });
      } catch (err) {
        lastBackupFailed = true;
        sendEvent({
          type: 'BACKUP_COMPLETE',
          success: false,
          error: (err as Error).message,
        });
      }
    });
  }

  function cancelAutoBackup(): void {
    if (cronTask) {
      cronTask.stop();
      cronTask = null;
    }
  }

  return {
    createBackup,
    validateArchive,
    restoreFromArchive,
    scheduleAutoBackup,
    cancelAutoBackup,
  };
}
