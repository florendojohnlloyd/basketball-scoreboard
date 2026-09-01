/**
 * StaffManagementView — Requirement 26
 *
 * Manage staff records (referees and support staff) for a Liga:
 *  - Create: name (1–50 chars) and role (Referee, Scorekeeper, Shot Clock Operator, or custom ≤ 30 chars)
 *  - List all staff with name and role
 *  - Delete: removes from all scheduled game entries; shows notification with affected count
 *  - Persisted in Liga JSON under `staff` array
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { StaffMember } from '@shared/types'
import './StaffManagementView.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffManagementViewProps {
  ligaId: string
  ligaName: string
  onClose?: () => void
}

// Predefined roles
const PREDEFINED_ROLES = ['Referee', 'Scorekeeper', 'Shot Clock Operator'] as const

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateStaffName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length < 1) return 'Name is required.'
  if (trimmed.length > 50) return 'Name must be 50 characters or fewer.'
  return ''
}

function validateStaffRole(role: string): string {
  const trimmed = role.trim()
  if (trimmed.length < 1) return 'Role is required.'
  if (trimmed.length > 30) return 'Role must be 30 characters or fewer.'
  return ''
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function StaffManagementView({
  ligaId,
  ligaName,
  onClose,
}: StaffManagementViewProps): React.ReactElement {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [useCustomRole, setUseCustomRole] = useState(false)
  const [customRole, setCustomRole] = useState('')
  const [formErrors, setFormErrors] = useState<{ name?: string; role?: string }>({})
  const [saving, setSaving] = useState(false)

  // Notification state
  const [notification, setNotification] = useState<string | null>(null)

  // ── Load staff ────────────────────────────────────────────────────────────

  const loadStaff = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'STAFF_LIST',
        ligaId,
      }) as { success: boolean; staff?: StaffMember[]; error?: string }
      if (result.success) setStaffList(result.staff ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [ligaId])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  // ── Add staff ─────────────────────────────────────────────────────────────

  async function handleAdd(): Promise<void> {
    const errors: typeof formErrors = {}
    const nameErr = validateStaffName(newName)
    if (nameErr) errors.name = nameErr

    const roleValue = useCustomRole ? customRole : newRole
    const roleErr = validateStaffRole(roleValue)
    if (roleErr) errors.role = roleErr

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setSaving(true)
    setFormErrors({})
    try {
      const staff: Omit<StaffMember, 'id'> = {
        name: newName.trim(),
        role: (useCustomRole ? customRole : newRole).trim(),
      }
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'STAFF_ADD',
        ligaId,
        staff,
      }) as { success: boolean; error?: string }
      if (result.success) {
        setNewName('')
        setNewRole('')
        setCustomRole('')
        setUseCustomRole(false)
        await loadStaff()
      } else {
        setFormErrors({ name: result.error ?? 'Failed to save staff member.' })
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Delete staff ──────────────────────────────────────────────────────────

  async function handleDelete(staff: StaffMember): Promise<void> {
    const confirmed = window.confirm(
      `Delete staff member "${staff.name}" (${staff.role})?\n\nThis will remove them from all scheduled game assignments.`
    )
    if (!confirmed) return

    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'STAFF_REMOVE',
      ligaId,
      staffId: staff.id,
    }) as { success: boolean; affectedGameIds?: string[]; error?: string }

    if (result.success) {
      const count = result.affectedGameIds?.length ?? 0
      if (count > 0) {
        setNotification(`Staff member "${staff.name}" removed from ${count} scheduled game${count > 1 ? 's' : ''}.`)
      }
      await loadStaff()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="staff-mgmt" role="region" aria-label="Staff Management">

      {/* Header */}
      <div className="staff-mgmt__header">
        {onClose && (
          <button className="staff-mgmt__back-btn" onClick={onClose} aria-label="Back">
            ← Back
          </button>
        )}
        <div className="staff-mgmt__header-info">
          <h2 className="staff-mgmt__title">{ligaName} — Staff</h2>
          <span className="staff-mgmt__subtitle">{staffList.length} staff member{staffList.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="staff-mgmt__notification" role="status" aria-live="polite">
          {notification}
          <button className="staff-mgmt__notification-close" onClick={() => setNotification(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Add form */}
      <div className="staff-mgmt__add-section" aria-label="Add a new staff member">
        <h3 className="staff-mgmt__add-title">Add Staff Member</h3>
        <div className="staff-mgmt__add-row">
          <div className="staff-mgmt__field">
            <label className="staff-mgmt__label" htmlFor="staff-name">Name</label>
            <input
              id="staff-name"
              type="text"
              className={`staff-mgmt__input${formErrors.name ? ' staff-mgmt__input--error' : ''}`}
              value={newName}
              onChange={e => { setNewName(e.target.value); setFormErrors(prev => ({ ...prev, name: undefined })) }}
              placeholder="Staff name (1–50 chars)"
              maxLength={50}
              aria-label="Staff name"
            />
            {formErrors.name && (
              <span className="staff-mgmt__field-error" role="alert">{formErrors.name}</span>
            )}
          </div>

          <div className="staff-mgmt__field">
            <label className="staff-mgmt__label" htmlFor="staff-role">Role</label>
            {!useCustomRole ? (
              <select
                id="staff-role"
                className={`staff-mgmt__select${formErrors.role ? ' staff-mgmt__input--error' : ''}`}
                value={newRole}
                onChange={e => { setNewRole(e.target.value); setFormErrors(prev => ({ ...prev, role: undefined })) }}
                aria-label="Staff role"
              >
                <option value="">— Select role —</option>
                {PREDEFINED_ROLES.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            ) : (
              <input
                id="staff-role"
                type="text"
                className={`staff-mgmt__input${formErrors.role ? ' staff-mgmt__input--error' : ''}`}
                value={customRole}
                onChange={e => { setCustomRole(e.target.value); setFormErrors(prev => ({ ...prev, role: undefined })) }}
                placeholder="Custom role (≤ 30 chars)"
                maxLength={30}
                aria-label="Custom staff role"
              />
            )}
            <button
              type="button"
              className="staff-mgmt__toggle-custom"
              onClick={() => {
                setUseCustomRole(!useCustomRole)
                setFormErrors(prev => ({ ...prev, role: undefined }))
              }}
              aria-label={useCustomRole ? 'Switch to predefined roles' : 'Enter custom role'}
            >
              {useCustomRole ? 'Use predefined' : 'Custom role'}
            </button>
            {formErrors.role && (
              <span className="staff-mgmt__field-error" role="alert">{formErrors.role}</span>
            )}
          </div>

          <button
            className="staff-mgmt__btn staff-mgmt__btn--add"
            onClick={handleAdd}
            disabled={saving}
            aria-label="Add staff member"
          >
            {saving ? '…' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Staff list */}
      <div className="staff-mgmt__list-section">
        {loading && <p className="staff-mgmt__empty">Loading…</p>}
        {!loading && staffList.length === 0 && (
          <p className="staff-mgmt__empty">No staff members added yet.</p>
        )}

        {!loading && staffList.length > 0 && (
          <table className="staff-mgmt__table" aria-label="Staff members">
            <thead>
              <tr>
                <th className="staff-mgmt__th">Name</th>
                <th className="staff-mgmt__th">Role</th>
                <th className="staff-mgmt__th staff-mgmt__th--actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map(staff => (
                <tr key={staff.id} className="staff-mgmt__row">
                  <td className="staff-mgmt__td">{staff.name}</td>
                  <td className="staff-mgmt__td staff-mgmt__td--role">{staff.role}</td>
                  <td className="staff-mgmt__td staff-mgmt__td--actions">
                    <button
                      className="staff-mgmt__btn staff-mgmt__btn--delete"
                      onClick={() => handleDelete(staff)}
                      aria-label={`Delete staff member ${staff.name}`}
                      title="Delete (removes from all games)"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default StaffManagementView
