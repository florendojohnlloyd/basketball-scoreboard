/**
 * UserManagementView — Requirement 28, Task 60
 *
 * Admin-only user management screen. Allows creating, editing, and deleting
 * user accounts. Only rendered when session.role === 'Admin'.
 *
 * Features:
 * - List all accounts: username, role, created date; Admin accounts marked with a badge
 * - Create user: username + password (with strength indicator) + role selector; inline validation
 * - Edit user: change username and/or role (opens an edit modal)
 * - Change password via a separate password-change modal
 * - Delete user: confirm dialog; disabled when account is the sole Admin (tooltip explains why)
 * - Inline error messages for validation and permission failures
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useControlPanelStore } from '../store'
import type { Role } from '@shared/types'
import { SCOREBOARD_QUERY } from '@shared/types'
import './UserManagementView.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRow {
  id: string
  username: string
  role: Role
  createdAt: string
  failedAttempts?: number
  lockedUntil?: string
}

// ---------------------------------------------------------------------------
// Password strength (mirrors roleStore.validatePassword rules)
// ---------------------------------------------------------------------------

interface StrengthResult {
  score: number // 0–4
  label: string
  color: string
  error?: string
}

function getPasswordStrength(p: string): StrengthResult {
  if (!p) return { score: 0, label: '', color: '#333', error: undefined }
  const hasLen = p.length >= 8
  const hasUpper = /[A-Z]/.test(p)
  const hasDigit = /[0-9]/.test(p)
  const hasSpecial = /[^A-Za-z0-9]/.test(p)

  if (!hasLen) return { score: 1, label: 'Too short', color: '#d44', error: 'Password must be at least 8 characters.' }
  if (!hasUpper) return { score: 2, label: 'Weak', color: '#e07020', error: 'Password must contain at least one uppercase letter.' }
  if (!hasDigit) return { score: 2, label: 'Weak', color: '#e07020', error: 'Password must contain at least one digit.' }
  if (!hasSpecial) return { score: 3, label: 'Fair', color: '#c0aa00', error: 'Password must contain at least one special character.' }
  if (p.length >= 12) return { score: 4, label: 'Strong', color: '#3c8' }
  return { score: 3, label: 'Good', color: '#6ab' }
}

const ROLES: Role[] = ['Admin', 'Scorekeeper', 'Coach', 'Viewer']
const SOLE_ADMIN_TOOLTIP = 'Cannot delete the sole Admin account.'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Password strength meter (shared between create form + password modal)
// ---------------------------------------------------------------------------

function StrengthMeter({ password }: { password: string }): React.ReactElement | null {
  if (!password) return null
  const strength = getPasswordStrength(password)
  return (
    <div className="user-mgmt__strength" aria-live="polite">
      <div className="user-mgmt__pw-bar">
        <div
          className="user-mgmt__pw-fill"
          style={{ width: `${(strength.score / 4) * 100}%`, background: strength.color }}
        />
      </div>
      <span className="user-mgmt__strength-label" style={{ color: strength.color }}>
        {strength.label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Role guard wrapper
// ---------------------------------------------------------------------------

interface UserManagementViewProps {
  onClose?: () => void
}

export function UserManagementView({ onClose }: UserManagementViewProps): React.ReactElement {
  const session = useControlPanelStore(s => s.session)
  const handleClose = onClose ?? (() => {})

  if (!session || session.role !== 'Admin') {
    return (
      <div className="user-mgmt" role="region" aria-label="User Management">
        <div className="user-mgmt__header">
          <h2 className="user-mgmt__title">User Management</h2>
          <button className="user-mgmt__close-btn" onClick={handleClose} aria-label="Close user management">
            ✕
          </button>
        </div>
        <p className="user-mgmt__denied" role="alert">
          Access denied. Only Admin users can manage accounts.
        </p>
      </div>
    )
  }

  return <UserManagementContent onClose={handleClose} />
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

interface ContentProps {
  onClose: () => void
}

function UserManagementContent({ onClose }: ContentProps): React.ReactElement {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Create-user form state
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<Role>('Scorekeeper')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Edit-user modal state
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editRole, setEditRole] = useState<Role>('Scorekeeper')
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Change-password modal state
  const [pwUser, setPwUser] = useState<UserRow | null>(null)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)

  // Delete confirm modal state
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setGlobalError(null)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'USER_LIST',
      })) as { success: boolean; users?: UserRow[]; error?: string }
      if (result.success && result.users) {
        setUsers(result.users)
      } else {
        setGlobalError(result.error ?? 'Failed to load users.')
      }
    } catch {
      setGlobalError('Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // Count admins for the sole-admin guard
  const adminCount = users.filter(u => u.role === 'Admin').length

  // ── Create user ──
  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (creating) return
    setCreateError(null)

    const trimmedUsername = newUsername.trim()
    if (!trimmedUsername) {
      setCreateError('Username is required.')
      return
    }

    const strength = getPasswordStrength(newPassword)
    if (strength.error) {
      setCreateError(strength.error)
      return
    }

    setCreating(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'USER_CREATE',
        username: trimmedUsername,
        password: newPassword,
        role: newRole,
      })) as { success: boolean; user?: UserRow; error?: string }

      if (result.success) {
        setNewUsername('')
        setNewPassword('')
        setNewRole('Scorekeeper')
        await loadUsers()
      } else {
        setCreateError(result.error ?? 'Failed to create user.')
      }
    } catch {
      setCreateError('Failed to create user.')
    } finally {
      setCreating(false)
    }
  }

  // ── Edit user ──
  function openEditModal(user: UserRow): void {
    setEditUser(user)
    setEditUsername(user.username)
    setEditRole(user.role)
    setEditError(null)
  }

  function closeEditModal(): void {
    setEditUser(null)
    setEditError(null)
  }

  async function handleSaveEdit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (saving || !editUser) return
    setEditError(null)

    const trimmedUsername = editUsername.trim()
    if (!trimmedUsername) {
      setEditError('Username cannot be empty.')
      return
    }

    setSaving(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'USER_UPDATE',
        id: editUser.id,
        updates: { username: trimmedUsername, role: editRole },
      })) as { success: boolean; user?: UserRow; error?: string }

      if (result.success) {
        closeEditModal()
        await loadUsers()
      } else {
        setEditError(result.error ?? 'Failed to update user.')
      }
    } catch {
      setEditError('Failed to update user.')
    } finally {
      setSaving(false)
    }
  }

  // ── Change password ──
  function openPasswordModal(user: UserRow): void {
    setPwUser(user)
    setNewPw('')
    setConfirmPw('')
    setPwError(null)
    setPwSuccess(false)
  }

  function closePasswordModal(): void {
    setPwUser(null)
    setNewPw('')
    setConfirmPw('')
    setPwError(null)
    setPwSuccess(false)
  }

  async function handleChangePassword(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (pwSaving || !pwUser) return
    setPwError(null)

    const strength = getPasswordStrength(newPw)
    if (strength.error) {
      setPwError(strength.error)
      return
    }

    if (newPw !== confirmPw) {
      setPwError('Passwords do not match.')
      return
    }

    setPwSaving(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'USER_CHANGE_PASSWORD',
        id: pwUser.id,
        newPassword: newPw,
      })) as { success: boolean; error?: string }

      if (result.success) {
        setPwSuccess(true)
        setTimeout(closePasswordModal, 1200)
      } else {
        setPwError(result.error ?? 'Failed to change password.')
      }
    } catch {
      setPwError('Failed to change password.')
    } finally {
      setPwSaving(false)
    }
  }

  // ── Delete user ──
  function openDeleteModal(user: UserRow): void {
    setDeleteUser(user)
    setDeleteError(null)
  }

  function closeDeleteModal(): void {
    setDeleteUser(null)
    setDeleteError(null)
  }

  async function handleConfirmDelete(): Promise<void> {
    if (deleting || !deleteUser) return
    setDeleteError(null)
    setDeleting(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'USER_DELETE',
        id: deleteUser.id,
      })) as { success: boolean; error?: string }

      if (result.success) {
        closeDeleteModal()
        await loadUsers()
      } else {
        setDeleteError(result.error ?? 'Failed to delete user.')
      }
    } catch {
      setDeleteError('Failed to delete user.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="user-mgmt" role="region" aria-label="User Management">
      {/* ── Header ── */}
      <div className="user-mgmt__header">
        <h2 className="user-mgmt__title">User Management</h2>
        <button className="user-mgmt__close-btn" onClick={onClose} aria-label="Close user management">
          ✕ Close
        </button>
      </div>

      {/* ── Global error ── */}
      {globalError && (
        <div className="user-mgmt__alert user-mgmt__alert--error" role="alert">
          {globalError}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && <p className="user-mgmt__loading">Loading users…</p>}

      {/* ── User list ── */}
      {!loading && (
        <div className="user-mgmt__list" role="list" aria-label="User accounts">
          {users.length === 0 && <p className="user-mgmt__empty">No user accounts found.</p>}
          {users.map(user => {
            const isOnlyAdmin = user.role === 'Admin' && adminCount <= 1
            const isLocked = user.lockedUntil ? new Date(user.lockedUntil) > new Date() : false

            return (
              <div key={user.id} className="user-mgmt__row" role="listitem">
                <div className="user-mgmt__row-info">
                  <span className="user-mgmt__username">
                    {user.username}
                    {user.role === 'Admin' && (
                      <span className="user-mgmt__badge" aria-label="Admin account">
                        Admin
                      </span>
                    )}
                  </span>
                  <span className="user-mgmt__role-pill" data-role={user.role.toLowerCase()}>
                    {user.role}
                  </span>
                  <span className="user-mgmt__created">Created {formatDate(user.createdAt)}</span>
                  {isLocked && (
                    <span className="user-mgmt__locked-badge" aria-label="Account locked">
                      🔒 Locked
                    </span>
                  )}
                </div>
                <div className="user-mgmt__row-actions">
                  <button
                    className="user-mgmt__btn user-mgmt__btn--edit"
                    onClick={() => openEditModal(user)}
                    aria-label={`Edit ${user.username}`}
                  >
                    Edit
                  </button>
                  <button
                    className="user-mgmt__btn user-mgmt__btn--pw"
                    onClick={() => openPasswordModal(user)}
                    aria-label={`Change password for ${user.username}`}
                  >
                    Password
                  </button>
                  <span className="user-mgmt__tooltip-wrapper">
                    <button
                      className="user-mgmt__btn user-mgmt__btn--delete"
                      onClick={() => openDeleteModal(user)}
                      disabled={isOnlyAdmin}
                      title={isOnlyAdmin ? SOLE_ADMIN_TOOLTIP : undefined}
                      aria-disabled={isOnlyAdmin}
                      aria-label={`Delete ${user.username}`}
                    >
                      Delete
                    </button>
                    {isOnlyAdmin && (
                      <span className="user-mgmt__tooltip" role="tooltip">
                        {SOLE_ADMIN_TOOLTIP}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create user form (always visible) ── */}
      <form className="user-mgmt__create-form" onSubmit={handleCreate} aria-label="Create new user">
        <h3 className="user-mgmt__create-title">Create New User</h3>

        <div className="user-mgmt__create-fields">
          <div className="user-mgmt__field">
            <label htmlFor="create-username" className="user-mgmt__label">
              Username
            </label>
            <input
              id="create-username"
              className="user-mgmt__input"
              type="text"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              placeholder="Username"
              disabled={creating}
              autoComplete="off"
            />
          </div>

          <div className="user-mgmt__field">
            <label htmlFor="create-password" className="user-mgmt__label">
              Password
            </label>
            <input
              id="create-password"
              className="user-mgmt__input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, uppercase, digit, special"
              disabled={creating}
              autoComplete="new-password"
            />
            <StrengthMeter password={newPassword} />
          </div>

          <div className="user-mgmt__field">
            <label htmlFor="create-role" className="user-mgmt__label">
              Role
            </label>
            <select
              id="create-role"
              className="user-mgmt__select"
              value={newRole}
              onChange={e => setNewRole(e.target.value as Role)}
              disabled={creating}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {createError && (
          <div className="user-mgmt__inline-error" role="alert">
            {createError}
          </div>
        )}

        <div className="user-mgmt__create-actions">
          <button type="submit" className="user-mgmt__btn user-mgmt__btn--save" disabled={creating}>
            {creating ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div
          className="user-mgmt__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Edit User"
          onClick={e => {
            if (e.target === e.currentTarget) closeEditModal()
          }}
        >
          <div className="user-mgmt__modal">
            <div className="user-mgmt__pw-header">
              <h3 className="user-mgmt__pw-title">Edit User</h3>
              <button className="user-mgmt__close-btn" onClick={closeEditModal} aria-label="Close edit modal">
                ✕
              </button>
            </div>

            <form className="user-mgmt__pw-form" onSubmit={handleSaveEdit}>
              <div className="user-mgmt__field">
                <label htmlFor="edit-username" className="user-mgmt__label">
                  Username
                </label>
                <input
                  id="edit-username"
                  className="user-mgmt__input"
                  type="text"
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  disabled={saving}
                  autoFocus
                />
              </div>

              <div className="user-mgmt__field">
                <label htmlFor="edit-role" className="user-mgmt__label">
                  Role
                </label>
                <select
                  id="edit-role"
                  className="user-mgmt__select"
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as Role)}
                  disabled={saving}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {editError && (
                <div className="user-mgmt__inline-error" role="alert">
                  {editError}
                </div>
              )}

              <div className="user-mgmt__create-actions">
                <button type="submit" className="user-mgmt__btn user-mgmt__btn--save" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="user-mgmt__btn user-mgmt__btn--cancel"
                  onClick={closeEditModal}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {pwUser && (
        <div
          className="user-mgmt__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Change Password"
          onClick={e => {
            if (e.target === e.currentTarget) closePasswordModal()
          }}
        >
          <div className="user-mgmt__modal">
            <div className="user-mgmt__pw-header">
              <h3 className="user-mgmt__pw-title">Change Password</h3>
              <button className="user-mgmt__close-btn" onClick={closePasswordModal} aria-label="Close password modal">
                ✕
              </button>
            </div>

            <p className="user-mgmt__pw-subtitle">
              Setting new password for <strong>{pwUser.username}</strong>
            </p>

            {pwSuccess ? (
              <div className="user-mgmt__alert user-mgmt__alert--success" role="status">
                Password changed successfully.
              </div>
            ) : (
              <form className="user-mgmt__pw-form" onSubmit={handleChangePassword}>
                <div className="user-mgmt__field">
                  <label htmlFor="pw-new" className="user-mgmt__label">
                    New Password
                  </label>
                  <input
                    id="pw-new"
                    className="user-mgmt__input"
                    type="password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="Min 8 chars, uppercase, digit, special"
                    disabled={pwSaving}
                    autoFocus
                    autoComplete="new-password"
                  />
                  <StrengthMeter password={newPw} />
                </div>

                <div className="user-mgmt__field">
                  <label htmlFor="pw-confirm" className="user-mgmt__label">
                    Confirm New Password
                  </label>
                  <input
                    id="pw-confirm"
                    className="user-mgmt__input"
                    type="password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Re-enter new password"
                    disabled={pwSaving}
                    autoComplete="new-password"
                  />
                </div>

                {pwError && (
                  <div className="user-mgmt__inline-error" role="alert">
                    {pwError}
                  </div>
                )}

                <div className="user-mgmt__create-actions">
                  <button type="submit" className="user-mgmt__btn user-mgmt__btn--save" disabled={pwSaving}>
                    {pwSaving ? 'Saving…' : 'Change Password'}
                  </button>
                  <button
                    type="button"
                    className="user-mgmt__btn user-mgmt__btn--cancel"
                    onClick={closePasswordModal}
                    disabled={pwSaving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteUser && (
        <div
          className="user-mgmt__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Delete User"
          onClick={e => {
            if (e.target === e.currentTarget) closeDeleteModal()
          }}
        >
          <div className="user-mgmt__modal">
            <div className="user-mgmt__pw-header">
              <h3 className="user-mgmt__pw-title">Confirm Delete User</h3>
              <button className="user-mgmt__close-btn" onClick={closeDeleteModal} aria-label="Close delete modal">
                ✕
              </button>
            </div>

            <p className="user-mgmt__delete-question">
              Are you sure you want to delete <strong>{deleteUser.username}</strong>? This cannot be undone.
            </p>

            {deleteError && (
              <div className="user-mgmt__inline-error" role="alert">
                {deleteError}
              </div>
            )}

            <div className="user-mgmt__create-actions">
              <button
                type="button"
                className="user-mgmt__btn user-mgmt__btn--delete-confirm"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete User'}
              </button>
              <button
                type="button"
                className="user-mgmt__btn user-mgmt__btn--cancel"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagementView
