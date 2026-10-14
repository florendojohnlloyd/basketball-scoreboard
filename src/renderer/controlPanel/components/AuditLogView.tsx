/**
 * AuditLogView — Requirement 31
 *
 * Displays audit log entries sorted by timestamp descending.
 * Provides filter controls (date range, username, action type) that update
 * the displayed list within 500 ms of filter change.
 * "Export CSV" button opens a native save-file dialog via IPC.
 * Only visible when session.role === 'Admin' || session.role === 'Scorekeeper'.
 * Entries are read-only — no edit or delete controls.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useControlPanelStore } from '../store'
import type { AuditEntry, AuditFilter } from '@shared/types'
import './AuditLogView.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a human-readable change description from previous and new values. */
function deriveChangeDescription(prev: unknown, next: unknown): string {
  if (prev == null && next == null) return '—'
  const prevStr = typeof prev === 'object' ? JSON.stringify(prev) : String(prev ?? '')
  const nextStr = typeof next === 'object' ? JSON.stringify(next) : String(next ?? '')
  if (!prevStr && nextStr) return `Set to: ${truncate(nextStr, 80)}`
  if (prevStr && !nextStr) return `Cleared (was: ${truncate(prevStr, 60)})`
  if (prevStr === nextStr) return '(no change)'
  return `${truncate(prevStr, 40)} → ${truncate(nextStr, 40)}`
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AuditLogView(): React.ReactElement {
  const session = useControlPanelStore(s => s.session)

  // Role guard — only Admin and Scorekeeper may view
  if (!session || (session.role !== 'Admin' && session.role !== 'Scorekeeper')) {
    return (
      <div className="audit-log" role="region" aria-label="Audit Log">
        <p className="audit-log__denied">Access denied. Admin or Scorekeeper role required.</p>
      </div>
    )
  }

  return <AuditLogContent />
}

function AuditLogContent(): React.ReactElement {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  // Filter state
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [username, setUsername] = useState('')
  const [actionType, setActionType] = useState('')

  // Unique usernames and action types for dropdowns (derived from results)
  const [knownUsers, setKnownUsers] = useState<string[]>([])
  const [knownActions, setKnownActions] = useState<string[]>([])

  // Single fetch function that builds filter inline
  async function fetchEntries(customFilter?: AuditFilter): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const filter: AuditFilter = customFilter || {}
      
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'AUDIT_QUERY',
        filter,
      }) as { success: boolean; entries?: AuditEntry[]; error?: string }
      
      if (result.success && result.entries) {
        const sorted = [...result.entries].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        setEntries(sorted)
        const users = [...new Set(sorted.map(e => e.username))].sort()
        const actions = [...new Set(sorted.map(e => e.actionType))].sort()
        setKnownUsers(users)
        setKnownActions(actions)
      } else {
        setError(result.error ?? 'Failed to load audit log.')
        setEntries([])
      }
    } catch (err) {
      setError('Failed to load audit log: ' + String(err))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  // Initial load - only once
  useEffect(() => {
    fetchEntries({})
  }, []) // ONLY runs once on mount

  // Manual refresh when filters change - with simple debounce
  const timeoutRef = useRef<NodeJS.Timeout>()
  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Only fetch if at least one filter is set (avoid re-fetching on initial render)
    if (!fromDate && !toDate && !username && !actionType) {
      return
    }

    // Debounce filter changes
    timeoutRef.current = setTimeout(() => {
      const filter: AuditFilter = {}
      if (fromDate) filter.fromDate = new Date(fromDate).toISOString()
      if (toDate) {
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        filter.toDate = end.toISOString()
      }
      if (username) filter.username = username
      if (actionType) filter.actionType = actionType
      fetchEntries(filter)
    }, 500)
  }, [fromDate, toDate, username, actionType])

  // Export CSV handler
  async function handleExportCsv(): Promise<void> {
    setExportMessage(null)
    try {
      const filter: AuditFilter = {}
      if (fromDate) filter.fromDate = new Date(fromDate).toISOString()
      if (toDate) {
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        filter.toDate = end.toISOString()
      }
      if (username) filter.username = username
      if (actionType) filter.actionType = actionType

      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'AUDIT_EXPORT_CSV',
        filter,
      }) as { success: boolean; filePath?: string; cancelled?: boolean; error?: string }
      if (result.success && result.filePath) {
        setExportMessage(`Exported to: ${result.filePath}`)
      } else if (result.cancelled) {
        // User cancelled — no message
      } else {
        setExportMessage(`Export failed: ${result.error ?? 'Unknown error'}`)
      }
    } catch {
      setExportMessage('Export failed.')
    }
  }

  return (
    <div className="audit-log" role="region" aria-label="Audit Log">
      <div className="audit-log__header">
        <h2 className="audit-log__title">Audit Log</h2>
        <button
          className="audit-log__export-btn"
          onClick={handleExportCsv}
          aria-label="Export audit log to CSV"
        >
          Export CSV
        </button>
      </div>

      {exportMessage && (
        <div className="audit-log__export-msg" role="status">{exportMessage}</div>
      )}

      {/* Filter controls */}
      <div className="audit-log__filters" role="group" aria-label="Audit log filters">
        <label className="audit-log__filter">
          <span className="audit-log__filter-label">From</span>
          <input
            type="date"
            className="audit-log__filter-input"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            aria-label="Filter from date"
          />
        </label>
        <label className="audit-log__filter">
          <span className="audit-log__filter-label">To</span>
          <input
            type="date"
            className="audit-log__filter-input"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            aria-label="Filter to date"
          />
        </label>
        <label className="audit-log__filter">
          <span className="audit-log__filter-label">User</span>
          <select
            className="audit-log__filter-input"
            value={username}
            onChange={e => setUsername(e.target.value)}
            aria-label="Filter by username"
          >
            <option value="">All Users</option>
            {knownUsers.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="audit-log__filter">
          <span className="audit-log__filter-label">Action</span>
          <select
            className="audit-log__filter-input"
            value={actionType}
            onChange={e => setActionType(e.target.value)}
            aria-label="Filter by action type"
          >
            <option value="">All Actions</option>
            {knownActions.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Error */}
      {error && <div className="audit-log__error" role="alert">{error}</div>}

      {/* Loading */}
      {loading && <p className="audit-log__loading">Loading…</p>}

      {/* No entries */}
      {!loading && !error && entries.length === 0 && (
        <p className="audit-log__empty">No audit log entries found.</p>
      )}

      {/* Entries table */}
      {!loading && entries.length > 0 && (
        <div className="audit-log__table-wrap">
          <table className="audit-log__table" aria-label="Audit log entries">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td className="audit-log__cell--ts">{formatTimestamp(entry.timestamp)}</td>
                  <td>{entry.username}</td>
                  <td>{entry.role}</td>
                  <td className="audit-log__cell--action">{entry.actionType}</td>
                  <td className="audit-log__cell--entity">{entry.entityId || '—'}</td>
                  <td className="audit-log__cell--change">
                    {deriveChangeDescription(entry.previousValue, entry.newValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AuditLogView
