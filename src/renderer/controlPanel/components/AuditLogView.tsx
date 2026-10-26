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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // TEMPORARILY DISABLED - Component causing memory leak
  useEffect(() => {
    setLoading(false)
    setError('Audit log temporarily disabled for maintenance.')
  }, [])

  return (
    <div className="audit-log" role="region" aria-label="Audit Log">
      <div className="audit-log__header">
        <h2 className="audit-log__title">Audit Log</h2>
      </div>

      {error && <div className="audit-log__error" role="alert">{error}</div>}
      {loading && <p className="audit-log__loading">Loading…</p>}

      {!loading && entries.length === 0 && !error && (
        <p className="audit-log__empty">No audit log entries found.</p>
      )}
    </div>
  )
}

export default AuditLogView
