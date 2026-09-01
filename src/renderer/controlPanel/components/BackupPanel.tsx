/**
 * BackupPanel — Admin-only backup and restore UI (Task 65, Requirement 29)
 *
 * Features:
 * - "Backup Now" button → triggers BACKUP_CREATE IPC (opens native save dialog in main)
 * - "Restore" button → triggers BACKUP_RESTORE IPC (opens native open dialog in main)
 * - Auto-backup schedule configuration: frequency selector + destination folder + save/disable
 * - Last backup timestamp and status display
 * - Success confirmation with file path after a completed backup
 */

import React, { useState, useEffect, useCallback } from 'react'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { BackupScheduleConfig } from '@shared/types'
import './BackupPanel.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BackupFrequency = 'daily' | 'weekly' | 'monthly'

interface BackupStatus {
  lastBackupPath: string | null
  lastBackupTime: string | null
  lastBackupSuccess: boolean | null
  inProgress: boolean
  error: string | null
}

// ---------------------------------------------------------------------------
// BackupPanel component
// ---------------------------------------------------------------------------

function BackupPanel(): React.ReactElement {
  // ── Manual backup / restore state ──
  const [status, setStatus] = useState<BackupStatus>({
    lastBackupPath: null,
    lastBackupTime: null,
    lastBackupSuccess: null,
    inProgress: false,
    error: null,
  })

  // ── Auto-backup schedule state ──
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [frequency, setFrequency] = useState<BackupFrequency>('daily')
  const [destinationFolder, setDestinationFolder] = useState('')
  const [scheduleStatus, setScheduleStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // ── Restore state ──
  const [restoreInProgress, setRestoreInProgress] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  // ── Load persisted schedule config from localStorage on mount ──
  useEffect(() => {
    const saved = localStorage.getItem('backup-schedule-config')
    if (saved) {
      try {
        const config: BackupScheduleConfig = JSON.parse(saved)
        setScheduleEnabled(config.enabled)
        setFrequency(config.frequency)
        setDestinationFolder(config.destinationFolder ?? '')
      } catch {
        // ignore malformed data
      }
    }

    // Load last backup info from localStorage
    const lastPath = localStorage.getItem('backup-last-path')
    const lastTime = localStorage.getItem('backup-last-time')
    const lastSuccess = localStorage.getItem('backup-last-success')
    if (lastPath || lastTime) {
      setStatus(prev => ({
        ...prev,
        lastBackupPath: lastPath,
        lastBackupTime: lastTime,
        lastBackupSuccess: lastSuccess === 'true',
      }))
    }
  }, [])

  // ── Listen for BACKUP_COMPLETE and BACKUP_RESTORE_ERROR events ──
  const handleEvent = useCallback((raw: unknown): void => {
    const event = raw as { type: string; [k: string]: unknown }

    if (event.type === 'BACKUP_COMPLETE') {
      const success = event.success as boolean
      const path = (event.path as string | undefined) ?? null
      const error = (event.error as string | undefined) ?? null
      const now = new Date().toISOString()

      setStatus({
        inProgress: false,
        lastBackupPath: success ? path : null,
        lastBackupTime: now,
        lastBackupSuccess: success,
        error: success ? null : (error ?? 'Backup failed'),
      })

      // Persist last backup info
      if (success && path) {
        localStorage.setItem('backup-last-path', path)
        localStorage.setItem('backup-last-time', now)
        localStorage.setItem('backup-last-success', 'true')
      } else {
        localStorage.setItem('backup-last-time', now)
        localStorage.setItem('backup-last-success', 'false')
      }
    }

    if (event.type === 'BACKUP_RESTORE_ERROR') {
      setRestoreInProgress(false)
      setRestoreError((event.error as string) ?? 'Restore failed')
    }
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)
    return () => {
      window.electron.ipcRenderer.removeListener(SCOREBOARD_EVENT, handleEvent)
    }
  }, [handleEvent])

  // ── Handlers ──

  async function handleBackupNow(): Promise<void> {
    setStatus(prev => ({ ...prev, inProgress: true, error: null }))
    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'BACKUP_CREATE',
      }) as { success: boolean; filePath?: string; cancelled?: boolean; error?: string }

      if (result.cancelled) {
        // User cancelled the save dialog — just reset in-progress
        setStatus(prev => ({ ...prev, inProgress: false }))
        return
      }

      if (result.success && result.filePath) {
        const now = new Date().toISOString()
        setStatus({
          inProgress: false,
          lastBackupPath: result.filePath,
          lastBackupTime: now,
          lastBackupSuccess: true,
          error: null,
        })
        localStorage.setItem('backup-last-path', result.filePath)
        localStorage.setItem('backup-last-time', now)
        localStorage.setItem('backup-last-success', 'true')
      } else if (!result.success) {
        const now = new Date().toISOString()
        setStatus({
          inProgress: false,
          lastBackupPath: null,
          lastBackupTime: now,
          lastBackupSuccess: false,
          error: result.error ?? 'Backup failed',
        })
        localStorage.setItem('backup-last-time', now)
        localStorage.setItem('backup-last-success', 'false')
      }
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        inProgress: false,
        error: (err as Error).message ?? 'Backup failed',
      }))
    }
  }

  async function handleRestore(): Promise<void> {
    setRestoreInProgress(true)
    setRestoreError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'BACKUP_RESTORE',
      }) as { success: boolean; cancelled?: boolean; error?: string }

      if (result.cancelled) {
        setRestoreInProgress(false)
        return
      }

      if (!result.success) {
        setRestoreInProgress(false)
        setRestoreError(result.error ?? 'Restore failed')
      }
      // If success = true, the app will relaunch — no further UI updates needed
    } catch (err) {
      setRestoreInProgress(false)
      setRestoreError((err as Error).message ?? 'Restore failed')
    }
  }

  async function handleSaveSchedule(): Promise<void> {
    if (scheduleEnabled && !destinationFolder.trim()) {
      setScheduleError('Destination folder is required when auto-backup is enabled.')
      return
    }

    setScheduleStatus('saving')
    setScheduleError(null)

    const config: BackupScheduleConfig = {
      enabled: scheduleEnabled,
      frequency,
      destinationFolder: destinationFolder.trim(),
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'BACKUP_SCHEDULE_SET',
        config,
      }) as { success: boolean; error?: string }

      if (result.success) {
        // Persist to localStorage so config survives app relaunch
        localStorage.setItem('backup-schedule-config', JSON.stringify(config))
        setScheduleStatus('saved')
        setTimeout(() => setScheduleStatus('idle'), 3000)
      } else {
        setScheduleStatus('error')
        setScheduleError(result.error ?? 'Failed to save schedule')
      }
    } catch (err) {
      setScheduleStatus('error')
      setScheduleError((err as Error).message)
    }
  }

  async function handleDisableAutoBackup(): Promise<void> {
    const config: BackupScheduleConfig = {
      enabled: false,
      frequency,
      destinationFolder: destinationFolder.trim(),
    }
    await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
      type: 'BACKUP_SCHEDULE_SET',
      config,
    })
    setScheduleEnabled(false)
    localStorage.setItem('backup-schedule-config', JSON.stringify(config))
  }

  // ── Format timestamps for display ──
  function formatTimestamp(iso: string | null): string {
    if (!iso) return 'Never'
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  // ── Truncate long file paths for display ──
  function truncatePath(path: string | null, maxLen = 60): string {
    if (!path) return ''
    if (path.length <= maxLen) return path
    return '…' + path.slice(-(maxLen - 3))
  }

  return (
    <div className="backup-panel">

      {/* ── Manual Backup / Restore ── */}
      <fieldset className="backup-panel__fieldset">
        <legend>Manual Backup &amp; Restore</legend>

        <div className="backup-panel__row">
          <button
            className="backup-panel__btn backup-panel__btn--primary"
            onClick={handleBackupNow}
            disabled={status.inProgress || restoreInProgress}
            aria-busy={status.inProgress}
          >
            {status.inProgress ? '⏳ Creating Backup…' : '💾 Backup Now'}
          </button>

          <button
            className="backup-panel__btn backup-panel__btn--secondary"
            onClick={handleRestore}
            disabled={status.inProgress || restoreInProgress}
            aria-busy={restoreInProgress}
          >
            {restoreInProgress ? '⏳ Restoring…' : '📂 Restore from Backup'}
          </button>
        </div>

        {/* Last backup status */}
        <div className="backup-panel__status-block" aria-live="polite">
          {status.lastBackupSuccess === true && status.lastBackupPath && (
            <div className="backup-panel__notice backup-panel__notice--success">
              <span className="backup-panel__notice-icon">✓</span>
              <span>
                Backup saved: <span className="backup-panel__filepath" title={status.lastBackupPath}>{truncatePath(status.lastBackupPath)}</span>
                <br />
                <small>{formatTimestamp(status.lastBackupTime)}</small>
              </span>
            </div>
          )}

          {status.lastBackupSuccess === false && (
            <div className="backup-panel__notice backup-panel__notice--error">
              <span className="backup-panel__notice-icon">⚠</span>
              <span>
                Last backup failed: {status.error}
                <br />
                <small>{formatTimestamp(status.lastBackupTime)}</small>
              </span>
            </div>
          )}

          {status.lastBackupSuccess === null && status.lastBackupTime === null && (
            <div className="backup-panel__notice backup-panel__notice--info">
              <span className="backup-panel__notice-icon">ℹ</span>
              <span>No backup has been created in this session.</span>
            </div>
          )}
        </div>

        {/* Restore error */}
        {restoreError && (
          <div className="backup-panel__notice backup-panel__notice--error" aria-live="assertive">
            <span className="backup-panel__notice-icon">⚠</span>
            <span>Restore failed: {restoreError}</span>
            <button
              className="backup-panel__dismiss"
              onClick={() => setRestoreError(null)}
              aria-label="Dismiss restore error"
            >
              ✕
            </button>
          </div>
        )}
      </fieldset>

      {/* ── Auto-Backup Schedule ── */}
      <fieldset className="backup-panel__fieldset">
        <legend>Automatic Backup Schedule</legend>

        <div className="backup-panel__row backup-panel__row--wrap">
          <label className="backup-panel__label" htmlFor="backup-enabled">
            <input
              id="backup-enabled"
              type="checkbox"
              checked={scheduleEnabled}
              onChange={e => setScheduleEnabled(e.target.checked)}
            />
            {' '}Enable automatic backups
          </label>
        </div>

        {scheduleEnabled && (
          <>
            <div className="backup-panel__row">
              <label className="backup-panel__label" htmlFor="backup-frequency">Frequency</label>
              <select
                id="backup-frequency"
                className="backup-panel__select"
                value={frequency}
                onChange={e => setFrequency(e.target.value as BackupFrequency)}
              >
                <option value="daily">Daily (2:00 AM)</option>
                <option value="weekly">Weekly (Sunday 2:00 AM)</option>
                <option value="monthly">Monthly (1st of month 2:00 AM)</option>
              </select>
            </div>

            <div className="backup-panel__row">
              <label className="backup-panel__label" htmlFor="backup-dest">Destination Folder</label>
              <input
                id="backup-dest"
                className="backup-panel__input"
                type="text"
                placeholder="e.g. C:\Backups\Scoreboard"
                value={destinationFolder}
                onChange={e => setDestinationFolder(e.target.value)}
                aria-describedby="backup-dest-hint"
              />
            </div>
            <small id="backup-dest-hint" className="backup-panel__hint">
              Full path to the folder where automatic backup archives will be saved.
            </small>
          </>
        )}

        {scheduleError && (
          <div className="backup-panel__notice backup-panel__notice--error" aria-live="assertive">
            <span className="backup-panel__notice-icon">⚠</span>
            <span>{scheduleError}</span>
          </div>
        )}

        <div className="backup-panel__row backup-panel__row--actions">
          <button
            className="backup-panel__btn backup-panel__btn--primary"
            onClick={handleSaveSchedule}
            disabled={scheduleStatus === 'saving'}
          >
            {scheduleStatus === 'saving' ? '⏳ Saving…' : scheduleStatus === 'saved' ? '✓ Saved' : '💾 Save Schedule'}
          </button>

          {scheduleEnabled && (
            <button
              className="backup-panel__btn backup-panel__btn--danger"
              onClick={handleDisableAutoBackup}
            >
              ✕ Disable Auto-Backup
            </button>
          )}
        </div>

        {scheduleEnabled && destinationFolder && scheduleStatus === 'idle' && (
          <div className="backup-panel__notice backup-panel__notice--info">
            <span className="backup-panel__notice-icon">ℹ</span>
            <span>
              Auto-backup is <strong>enabled</strong> — {frequency} to&nbsp;
              <span className="backup-panel__filepath" title={destinationFolder}>{truncatePath(destinationFolder, 50)}</span>
            </span>
          </div>
        )}
      </fieldset>

    </div>
  )
}

export default BackupPanel
