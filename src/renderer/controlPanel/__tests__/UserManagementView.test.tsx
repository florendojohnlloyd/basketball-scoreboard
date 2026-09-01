// @vitest-environment jsdom
/**
 * UserManagementView tests — Requirement 28, Task 60
 *
 * Example-based tests:
 * - Admin-only access: shows access denied for non-Admin
 * - Lists user accounts with username, role, created date
 * - Admin badge displayed for Admin users
 * - Create user with valid data succeeds
 * - Create user shows inline validation errors for invalid password
 * - Password strength indicator shown while typing
 * - Delete button disabled for sole Admin with tooltip
 * - Delete user shows confirmation dialog
 * - Shows inline error on permission denied
 * - Back button calls onClose
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()

Object.defineProperty(globalThis.window, 'electron', {
  value: { ipcRenderer: { invoke: mockInvoke, on: vi.fn(), send: vi.fn() } },
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// Test users fixture
// ---------------------------------------------------------------------------

const TEST_USERS = [
  { id: 'u1', username: 'admin', role: 'Admin', createdAt: '2024-01-15T10:00:00.000Z', passwordHash: '[REDACTED]' },
  { id: 'u2', username: 'scorekeeper1', role: 'Scorekeeper', createdAt: '2024-02-20T14:30:00.000Z', passwordHash: '[REDACTED]' },
  { id: 'u3', username: 'coach_jones', role: 'Coach', createdAt: '2024-03-10T09:15:00.000Z', passwordHash: '[REDACTED]' },
  { id: 'u4', username: 'viewer_fan', role: 'Viewer', createdAt: '2024-04-01T12:00:00.000Z', passwordHash: '[REDACTED]' },
]

// ---------------------------------------------------------------------------
// Zustand store mock — control session state per test
// ---------------------------------------------------------------------------

import { useControlPanelStore } from '../store'

describe('UserManagementView', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    // Set Admin session by default
    useControlPanelStore.setState({
      session: { id: 'u1', username: 'admin', role: 'Admin' },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function mountComponent(onClose?: () => void) {
    const { UserManagementView } = await import('../components/UserManagementView')
    return render(<UserManagementView onClose={onClose} />)
  }

  it('shows access denied for non-Admin session', async () => {
    useControlPanelStore.setState({
      session: { id: 'u2', username: 'scorekeeper1', role: 'Scorekeeper' },
    })

    await mountComponent()

    expect(screen.getByText(/access denied/i)).toBeTruthy()
    expect(screen.getByText(/only admin users/i)).toBeTruthy()
  })

  it('lists user accounts with username, role, and created date', async () => {
    mockInvoke.mockResolvedValue({ success: true, users: TEST_USERS })

    await mountComponent()

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeTruthy()
      expect(screen.getByText('scorekeeper1')).toBeTruthy()
      expect(screen.getByText('coach_jones')).toBeTruthy()
      expect(screen.getByText('viewer_fan')).toBeTruthy()
    })

    // Roles are displayed in the list (may appear in both list and role selector)
    const listEl = document.querySelector('.user-mgmt__list')!
    expect(within(listEl as HTMLElement).getByText('Scorekeeper')).toBeTruthy()
    expect(within(listEl as HTMLElement).getByText('Coach')).toBeTruthy()
    expect(within(listEl as HTMLElement).getByText('Viewer')).toBeTruthy()
  })

  it('displays Admin badge for Admin users', async () => {
    mockInvoke.mockResolvedValue({ success: true, users: TEST_USERS })

    await mountComponent()

    await waitFor(() => {
      const badges = document.querySelectorAll('.user-mgmt__badge')
      expect(badges.length).toBe(1)
      expect(badges[0].textContent).toBe('Admin')
    })
  })

  it('creates a user with valid data', async () => {
    mockInvoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'USER_LIST') return Promise.resolve({ success: true, users: TEST_USERS })
      if (q.type === 'USER_CREATE') return Promise.resolve({ success: true, user: { id: 'u5', username: 'newuser', role: 'Coach' } })
      return Promise.resolve({ success: false })
    })

    await mountComponent()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Create New User')).toBeTruthy())

    await user.type(screen.getByLabelText('Username'), 'newuser')
    await user.type(screen.getByLabelText('Password'), 'StrongP@ss1')
    await user.selectOptions(screen.getByLabelText('Role'), 'Coach')
    await user.click(screen.getByRole('button', { name: /create user/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'USER_CREATE',
          username: 'newuser',
          password: 'StrongP@ss1',
          role: 'Coach',
        })
      )
    })
  })

  it('shows inline validation error for weak password on create', async () => {
    mockInvoke.mockResolvedValue({ success: true, users: [] })

    await mountComponent()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Create New User')).toBeTruthy())

    await user.type(screen.getByLabelText('Username'), 'testuser')
    await user.type(screen.getByLabelText('Password'), 'weak')
    await user.click(screen.getByRole('button', { name: /create user/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      const pwError = alerts.find(el => el.textContent?.includes('at least 8 characters'))
      expect(pwError).toBeTruthy()
    })
  })

  it('shows password strength indicator while typing', async () => {
    mockInvoke.mockResolvedValue({ success: true, users: [] })

    await mountComponent()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Create New User')).toBeTruthy())

    await user.type(screen.getByLabelText('Password'), 'Ab1!')

    await waitFor(() => {
      const fill = document.querySelector('.user-mgmt__pw-fill')
      expect(fill).toBeTruthy()
    })
  })

  it('delete button is disabled for sole Admin with tooltip', async () => {
    const soleAdminUsers = [
      { id: 'u1', username: 'admin', role: 'Admin', createdAt: '2024-01-15T10:00:00.000Z', passwordHash: '[REDACTED]' },
      { id: 'u2', username: 'scorekeeper1', role: 'Scorekeeper', createdAt: '2024-02-20T14:30:00.000Z', passwordHash: '[REDACTED]' },
    ]

    mockInvoke.mockResolvedValue({ success: true, users: soleAdminUsers })

    await mountComponent()

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeTruthy()
    })

    // The delete button for the Admin user should be disabled
    const deleteBtn = screen.getByLabelText('Delete admin')
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true)
    expect(deleteBtn.title).toBe('Cannot delete the sole Admin account.')

    // Tooltip element present
    const tooltip = deleteBtn.closest('.user-mgmt__tooltip-wrapper')?.querySelector('.user-mgmt__tooltip')
    expect(tooltip).toBeTruthy()
    expect(tooltip!.textContent).toContain('Cannot delete the sole Admin account')
  })

  it('delete user shows confirmation dialog and completes', async () => {
    mockInvoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'USER_LIST') return Promise.resolve({ success: true, users: TEST_USERS })
      if (q.type === 'USER_DELETE') return Promise.resolve({ success: true })
      return Promise.resolve({ success: false })
    })

    await mountComponent()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('scorekeeper1')).toBeTruthy())

    // Click delete on scorekeeper1
    const deleteBtn = screen.getByLabelText('Delete scorekeeper1')
    await user.click(deleteBtn)

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /confirm delete user/i })).toBeTruthy()
      expect(screen.getByText(/are you sure/i)).toBeTruthy()
    })

    // Confirm deletion — use the button inside the modal dialog
    const dialog = screen.getByRole('dialog', { name: /confirm delete user/i })
    const confirmBtn = within(dialog).getAllByRole('button').find(b => b.textContent === 'Delete User')!
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'USER_DELETE', id: 'u2' })
      )
    })
  })

  it('shows inline error when IPC returns permission denied', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'Access denied. USER_MGMT permission required.' })

    await mountComponent()

    await waitFor(() => {
      const errorEl = screen.getByRole('alert')
      expect(errorEl.textContent).toContain('Access denied')
    })
  })

  it('back button calls onClose callback', async () => {
    mockInvoke.mockResolvedValue({ success: true, users: [] })

    const onClose = vi.fn()
    await mountComponent(onClose)
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByLabelText('Close user management')).toBeTruthy())
    await user.click(screen.getByLabelText('Close user management'))

    expect(onClose).toHaveBeenCalled()
  })

  it('edit user opens modal and saves changes', async () => {
    mockInvoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'USER_LIST') return Promise.resolve({ success: true, users: TEST_USERS })
      if (q.type === 'USER_UPDATE') return Promise.resolve({ success: true, user: { id: 'u2', username: 'sk_updated', role: 'Coach' } })
      return Promise.resolve({ success: false })
    })

    await mountComponent()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('scorekeeper1')).toBeTruthy())

    // Click edit on scorekeeper1
    const editBtn = screen.getByLabelText('Edit scorekeeper1')
    await user.click(editBtn)

    // Modal should appear with edit form
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /edit user/i })).toBeTruthy()
    })

    // Change role inside the edit modal
    const dialog = screen.getByRole('dialog', { name: /edit user/i })
    const roleSelect = within(dialog).getByLabelText('Role')
    await user.selectOptions(roleSelect, 'Coach')

    // Save
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'USER_UPDATE',
          id: 'u2',
          updates: expect.objectContaining({ role: 'Coach' }),
        })
      )
    })
  })

  it('change password modal validates strength', async () => {
    mockInvoke.mockResolvedValue({ success: true, users: TEST_USERS })

    await mountComponent()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('scorekeeper1')).toBeTruthy())

    // Click password button on scorekeeper1
    const pwBtn = screen.getByLabelText('Change password for scorekeeper1')
    await user.click(pwBtn)

    // Password change modal should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /change password/i })).toBeTruthy()
    })

    // Get the modal dialog container
    const dialog = screen.getByRole('dialog', { name: /change password/i })

    // Type weak password and try to submit
    await user.type(within(dialog).getByLabelText('New Password'), 'weak')
    await user.type(within(dialog).getByLabelText('Confirm New Password'), 'weak')
    await user.click(within(dialog).getByRole('button', { name: /change password/i }))

    // Should show error
    await waitFor(() => {
      const alerts = within(dialog).getAllByRole('alert')
      const pwError = alerts.find(el => el.textContent?.includes('at least 8 characters'))
      expect(pwError).toBeTruthy()
    })
  })
})
