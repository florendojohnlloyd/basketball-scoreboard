/**
 * SyncConflictDialog — Sync conflict resolution UI (Task 67, Requirement 30)
 *
 * Displayed when the SYNC_CONFLICT IPC event is received in the Control Panel.
 * Shows both the local and remote versions of a conflicting record side-by-side,
 * and lets the operator choose which version to keep.
 *
 * Design notes from spec (Req 30.6, design section):
 * - Cancel retains the local version.
 * - While this dialog is open, sync continues for non-conflicting records
 *   (handled by the OfflineSyncService which only blocks on the specific conflict).
 * - The resolution is sent back via SCOREBOARD_COMMAND as SYNC_CONFLICT_RESOLVED.
 */

import React from 'react'
import { SCOREBOARD_COMMAND } from '@shared/types'
import type { SyncRecord } from '@shared/types'
import './SyncConflictDialog.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SyncConflictDialogProps {
  /** Unique identifier for this conflict (used to correlate the resolution). */
  conflictId: string
  /** The local version of the conflicting record. */
  local: SyncRecord
  /** The remote version of the conflicting record. */
  remote: SyncRecord
  /**
   * Called after the resolution command has been sent.
   * The parent should unmount / remove this conflict from its queue.
   */
  onResolved: (conflictId: string, choice: 'local' | 'remote') => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2) } catch { return String(value) }
  }
  return String(value)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SyncConflictDialog
 *
 * Renders a modal dialog showing local and remote versions of a sync conflict
 * side by side. The operator picks "Keep Local" or "Use Remote". Dismissing
 * via the X button or pressing Escape defaults to keeping the local version.
 */
function SyncConflictDialog({
  conflictId,
  local,
  remote,
  onResolved,
}: SyncConflictDialogProps): React.ReactElement {

  function resolve(choice: 'local' | 'remote'): void {
    window.electron.ipcRenderer.send(SCOREBOARD_COMMAND, {
      type: 'SYNC_CONFLICT_RESOLVED',
      conflictId,
      choice,
    })
    onResolved(conflictId, choice)
  }

  function handleKeepLocal(): void {
    resolve('local')
  }

  function handleUseRemote(): void {
    resolve('remote')
  }

  // Cancel → keep local (Req 30.6: "retain the local version on cancel")
  function handleCancel(): void {
    resolve('local')
  }

  // Keyboard: Escape = cancel (keep local)
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  // Collect the superset of all field names from both versions
  const localFieldMap = new Map(local.fields.map(f => [f.field, f.value]))
  const remoteFieldMap = new Map(remote.fields.map(f => [f.field, f.value]))
  const allFields = Array.from(new Set([...localFieldMap.keys(), ...remoteFieldMap.keys()]))

  return (
    /* Backdrop */
    <div
      className="sync-conflict-backdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel() }}
    >
      {/* Dialog */}
      <div
        className="sync-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-conflict-title"
        aria-describedby="sync-conflict-desc"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="sync-conflict-dialog__header">
          <h2 id="sync-conflict-title" className="sync-conflict-dialog__title">
            Sync Conflict
          </h2>
          <button
            className="sync-conflict-dialog__close"
            onClick={handleCancel}
            aria-label="Cancel — keep local version"
            title="Cancel — keeps your local version"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <p id="sync-conflict-desc" className="sync-conflict-dialog__desc">
          This record was modified both locally and on the remote server since the last sync.
          Choose which version to keep. Cancelling retains your local copy.
        </p>

        {/* Entity metadata */}
        <div className="sync-conflict-dialog__meta">
          <span className="sync-conflict-dialog__meta-item">
            <span className="sync-conflict-dialog__meta-label">Type:</span>
            {local.entityType}
          </span>
          <span className="sync-conflict-dialog__meta-item">
            <span className="sync-conflict-dialog__meta-label">ID:</span>
            <span className="sync-conflict-dialog__meta-id" title={local.entityId}>
              {local.entityId.length > 24 ? `${local.entityId.slice(0, 24)}…` : local.entityId}
            </span>
          </span>
        </div>

        {/* Side-by-side comparison table */}
        <div className="sync-conflict-dialog__table-wrapper">
          <table className="sync-conflict-dialog__table" aria-label="Conflict comparison">
            <thead>
              <tr>
                <th className="sync-conflict-dialog__th sync-conflict-dialog__th--field">Field</th>
                <th className="sync-conflict-dialog__th sync-conflict-dialog__th--local">
                  <span className="sync-conflict-dialog__version-label">Local</span>
                  <time
                    className="sync-conflict-dialog__timestamp"
                    dateTime={local.lastModifiedAt}
                    title={local.lastModifiedAt}
                  >
                    {formatTimestamp(local.lastModifiedAt)}
                  </time>
                </th>
                <th className="sync-conflict-dialog__th sync-conflict-dialog__th--remote">
                  <span className="sync-conflict-dialog__version-label">Remote</span>
                  <time
                    className="sync-conflict-dialog__timestamp"
                    dateTime={remote.lastModifiedAt}
                    title={remote.lastModifiedAt}
                  >
                    {formatTimestamp(remote.lastModifiedAt)}
                  </time>
                </th>
              </tr>
            </thead>
            <tbody>
              {allFields.map((field) => {
                const lv = localFieldMap.get(field)
                const rv = remoteFieldMap.get(field)
                const differs = JSON.stringify(lv) !== JSON.stringify(rv)
                return (
                  <tr
                    key={field}
                    className={`sync-conflict-dialog__row${differs ? ' sync-conflict-dialog__row--diff' : ''}`}
                  >
                    <td className="sync-conflict-dialog__cell sync-conflict-dialog__cell--field">
                      {field}
                    </td>
                    <td className="sync-conflict-dialog__cell sync-conflict-dialog__cell--local">
                      <pre className="sync-conflict-dialog__value">{formatValue(lv)}</pre>
                    </td>
                    <td className="sync-conflict-dialog__cell sync-conflict-dialog__cell--remote">
                      <pre className="sync-conflict-dialog__value">{formatValue(rv)}</pre>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="sync-conflict-dialog__actions">
          <button
            className="sync-conflict-dialog__btn sync-conflict-dialog__btn--local"
            onClick={handleKeepLocal}
          >
            ✓ Keep Local
          </button>
          <button
            className="sync-conflict-dialog__btn sync-conflict-dialog__btn--remote"
            onClick={handleUseRemote}
          >
            ↓ Use Remote
          </button>
          <button
            className="sync-conflict-dialog__btn sync-conflict-dialog__btn--cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default SyncConflictDialog
