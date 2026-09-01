// @vitest-environment jsdom
/**
 * Example-based tests for AuditLogView (Requirement 31 — Task 62).
 *
 * Tests covered:
 *  - Role guard: only Admin and Scorekeeper can view the audit log (Req 31.3)
 *  - Entries displayed in timestamp descending order with correct columns (Req 31.3)
 *  - Filter controls update the list within 500 ms of change (Req 31.4)
 *  - Export CSV button opens save dialog and shows confirmation (Req 31.7)
 *  - Read-only: no edit or delete controls present (Req 31.6)
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditEntry } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockSend = vi.fn()

Object.defineProperty(globalThis.window, 'electron', {
  value: {
    ipcRenderer: {
      invoke: mockInvoke,
      on: mockOn,
      send: mockSend,
    },
  },
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// Mock the Zustand store for session control
// ---------------------------------------------------------------------------

let mockSession: { id: string; username: string; role: string } | null = null

vi.mock('../store', () => ({
  useControlPanelStore: (selector: (state: any) => any) => {
    return selector({ session: mockSession })
  },
}))

// ---------------------------------------------------------------------------
// Import component after mocks are wired
// ---------------------------------------------------------------------------

import AuditLogView from '../components/AuditLogView'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: '2024-06-15T10:00:00.000Z',
    username: 'admin1',
    role: 'Admin' as const,
    actionType: 'ADD_SCORE',
    entityId: 'GAME',
    previousValue: '10',
    newValue: '13',
    ...overrides,
  }
}

function makeAuditQueryResponse(entries: AuditEntry[]) {
  return { success: true, entries }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockInvoke.mockReset()
  mockSession = { id: 'user-1', username: 'admin1', role: 'Admin' }
})

// ---------------------------------------------------------------------------
// 1. Requirement 31.3 — Role guard: only Admin/Scorekeeper can view
// ---------------------------------------------------------------------------

describe('AuditLogView — role access guard', () => {
  it('shows access denied for Viewer role', () => {
    mockSession = { id: 'user-v', username: 'viewer1', role: 'Viewer' }
    render(<AuditLogView />)
    expect(screen.getByText(/access denied/i)).toBeTruthy()
    expect(screen.queryByText('Audit Log')).toBeNull()
  })

  it('shows access denied for Coach role', () => {
    mockSession = { id: 'user-c', username: 'coach1', role: 'Coach' }
    render(<AuditLogView />)
    expect(screen.getByText(/access denied/i)).toBeTruthy()
  })

  it('shows access denied when no session exists', () => {
    mockSession = null
    render(<AuditLogView />)
    expect(screen.getByText(/access denied/i)).toBeTruthy()
  })

  it('renders the audit log view for Admin role', () => {
    mockSession = { id: 'user-a', username: 'admin1', role: 'Admin' }
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([]))
    render(<AuditLogView />)
    expect(screen.getByText('Audit Log')).toBeTruthy()
  })

  it('renders the audit log view for Scorekeeper role', () => {
    mockSession = { id: 'user-s', username: 'score1', role: 'Scorekeeper' }
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([]))
    render(<AuditLogView />)
    expect(screen.getByText('Audit Log')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 2. Requirement 31.3 — Entries sorted by timestamp descending with columns
// ---------------------------------------------------------------------------

describe('AuditLogView — entry display', () => {
  it('displays entries sorted by timestamp descending', async () => {
    const entries = [
      makeEntry({ id: 'e1', timestamp: '2024-06-10T08:00:00.000Z', username: 'user-a', actionType: 'ADD_SCORE' }),
      makeEntry({ id: 'e2', timestamp: '2024-06-15T12:00:00.000Z', username: 'user-b', actionType: 'STOP_GAME_CLOCK' }),
      makeEntry({ id: 'e3', timestamp: '2024-06-12T09:30:00.000Z', username: 'user-c', actionType: 'ADD_FOUL' }),
    ]
    mockInvoke.mockResolvedValue(makeAuditQueryResponse(entries))

    render(<AuditLogView />)

    // Wait for entries to appear (after initial fetch + 500ms debounce)
    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    // The table body rows should be in descending timestamp order
    const rows = screen.getAllByRole('row')
    const dataRows = rows.slice(1)
    expect(dataRows[0].textContent).toContain('user-b')
    expect(dataRows[1].textContent).toContain('user-c')
    expect(dataRows[2].textContent).toContain('user-a')
  })

  it('renders all required columns: timestamp, user, role, action, entity, change', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([
      makeEntry({
        id: 'e-cols',
        timestamp: '2024-06-15T10:00:00.000Z',
        username: 'admin1',
        role: 'Admin' as const,
        actionType: 'ADD_SCORE',
        entityId: 'GAME',
        previousValue: '10',
        newValue: '13',
      }),
    ]))

    render(<AuditLogView />)

    // Target the table column headers specifically. Plain getByText('User')
    // / getByText('Action') would be ambiguous because the filter controls also
    // render "User" and "Action" labels; scoping to the columnheader role
    // disambiguates.
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Timestamp' })).toBeTruthy()
      expect(screen.getByRole('columnheader', { name: 'User' })).toBeTruthy()
      expect(screen.getByRole('columnheader', { name: 'Role' })).toBeTruthy()
      expect(screen.getByRole('columnheader', { name: 'Action' })).toBeTruthy()
      expect(screen.getByRole('columnheader', { name: 'Entity' })).toBeTruthy()
      expect(screen.getByRole('columnheader', { name: 'Change' })).toBeTruthy()
    }, { timeout: 2000 })

    // Check that entry data is displayed. Scope to the entries table because
    // the filter dropdowns also render the username/action as <option> values.
    await waitFor(() => {
      const table = screen.getByRole('table', { name: /audit log entries/i })
      expect(within(table).getByText('admin1')).toBeTruthy()
      expect(within(table).getByText('ADD_SCORE')).toBeTruthy()
      expect(within(table).getByText('GAME')).toBeTruthy()
    }, { timeout: 2000 })
  })

  it('shows empty state message when no entries exist', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([]))

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getByText(/no audit log entries found/i)).toBeTruthy()
    }, { timeout: 2000 })
  })
})

// ---------------------------------------------------------------------------
// 3. Requirement 31.4 — Filter controls with 500ms debounce
// ---------------------------------------------------------------------------

describe('AuditLogView — filter controls', () => {
  it('sends AUDIT_QUERY with username filter after debounce', async () => {
    const entries = [
      makeEntry({ id: 'e1', username: 'admin1' }),
      makeEntry({ id: 'e2', username: 'score1' }),
    ]
    mockInvoke.mockResolvedValue(makeAuditQueryResponse(entries))

    render(<AuditLogView />)

    // Wait for initial load to complete
    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    mockInvoke.mockClear()
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([entries[0]]))

    // Select a username in the filter dropdown
    const userSelect = screen.getByLabelText('Filter by username')
    fireEvent.change(userSelect, { target: { value: 'admin1' } })

    // Wait for the debounced query to be called
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({
          type: 'AUDIT_QUERY',
          filter: expect.objectContaining({ username: 'admin1' }),
        })
      )
    }, { timeout: 2000 })
  })

  it('sends AUDIT_QUERY with action type filter after debounce', async () => {
    const entries = [
      makeEntry({ id: 'e1', actionType: 'ADD_SCORE' }),
      makeEntry({ id: 'e2', actionType: 'ADD_FOUL' }),
    ]
    mockInvoke.mockResolvedValue(makeAuditQueryResponse(entries))

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    mockInvoke.mockClear()
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([entries[0]]))

    const actionSelect = screen.getByLabelText('Filter by action type')
    fireEvent.change(actionSelect, { target: { value: 'ADD_SCORE' } })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({
          type: 'AUDIT_QUERY',
          filter: expect.objectContaining({ actionType: 'ADD_SCORE' }),
        })
      )
    }, { timeout: 2000 })
  })

  it('sends AUDIT_QUERY with date range filter after debounce', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([]))

    render(<AuditLogView />)

    // Wait for initial load
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled()
    }, { timeout: 2000 })

    mockInvoke.mockClear()
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([]))

    const fromInput = screen.getByLabelText('Filter from date')
    const toInput = screen.getByLabelText('Filter to date')

    fireEvent.change(fromInput, { target: { value: '2024-06-01' } })
    fireEvent.change(toInput, { target: { value: '2024-06-30' } })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({
          type: 'AUDIT_QUERY',
          filter: expect.objectContaining({
            fromDate: expect.stringContaining('2024-06-01'),
            toDate: expect.stringContaining('2024-06-30'),
          }),
        })
      )
    }, { timeout: 2000 })
  })
})

// ---------------------------------------------------------------------------
// 4. Requirement 31.7 — Export CSV button
// ---------------------------------------------------------------------------

describe('AuditLogView — CSV export', () => {
  it('calls AUDIT_EXPORT_CSV via IPC and shows confirmation with file path', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([makeEntry()]))

    render(<AuditLogView />)

    // Wait for content to load
    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    // Mock the export response on next call
    mockInvoke.mockResolvedValueOnce({
      success: true,
      filePath: 'C:\\Users\\test\\Desktop\\audit.csv',
    })

    const exportBtn = screen.getByRole('button', { name: /export.*csv/i })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({ type: 'AUDIT_EXPORT_CSV' })
      )
    }, { timeout: 2000 })

    // Confirmation message shown
    await waitFor(() => {
      expect(screen.getByText(/exported to.*audit\.csv/i)).toBeTruthy()
    }, { timeout: 2000 })
  })

  it('shows error message when export fails', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([makeEntry()]))

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    mockInvoke.mockResolvedValueOnce({
      success: false,
      error: 'Destination not writable',
    })

    const exportBtn = screen.getByRole('button', { name: /export.*csv/i })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(screen.getByText(/export failed.*destination not writable/i)).toBeTruthy()
    }, { timeout: 2000 })
  })

  it('shows no message when export is cancelled by user', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([makeEntry()]))

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    mockInvoke.mockResolvedValueOnce({ success: false, cancelled: true })

    const exportBtn = screen.getByRole('button', { name: /export.*csv/i })
    fireEvent.click(exportBtn)

    // Give time for the handler to complete
    await new Promise(r => setTimeout(r, 200))

    expect(screen.queryByText(/exported to/i)).toBeNull()
    expect(screen.queryByText(/export failed/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. Requirement 31.6 — Read-only: no edit or delete controls
// ---------------------------------------------------------------------------

describe('AuditLogView — read-only', () => {
  it('does not render any edit or delete buttons for entries', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2' }),
    ]))

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    // No edit or delete buttons should exist
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('does not render any input fields within the table entries', async () => {
    mockInvoke.mockResolvedValue(makeAuditQueryResponse([makeEntry()]))

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    }, { timeout: 2000 })

    // No editable inputs inside the table itself (filters are outside)
    const table = screen.getByRole('table')
    const inputsInTable = table.querySelectorAll('input, textarea, [contenteditable="true"]')
    expect(inputsInTable.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 6. Error handling
// ---------------------------------------------------------------------------

describe('AuditLogView — error handling', () => {
  it('shows an error message when AUDIT_QUERY fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'Database corrupted' })

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
      expect(screen.getByText(/database corrupted/i)).toBeTruthy()
    }, { timeout: 2000 })
  })

  it('shows generic error when IPC throws', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC channel lost'))

    render(<AuditLogView />)

    await waitFor(() => {
      expect(screen.getByText(/failed to load audit log/i)).toBeTruthy()
    }, { timeout: 2000 })
  })
})
