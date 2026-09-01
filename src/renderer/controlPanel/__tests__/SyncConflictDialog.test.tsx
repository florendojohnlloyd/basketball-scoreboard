// @vitest-environment jsdom
/**
 * Example-based tests for SyncConflictDialog (Requirement 30 — Task 67).
 *
 * Tests covered:
 *  - Renders both local and remote versions side-by-side with field names,
 *    values, and timestamps (Req 30.6)
 *  - "Keep Local" sends SYNC_CONFLICT_RESOLVED with choice 'local'
 *  - "Use Remote" sends SYNC_CONFLICT_RESOLVED with choice 'remote'
 *  - Cancel (button, X, Escape, backdrop) defaults to keeping the local
 *    version (Req 30.6: "retain the local version on cancel")
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCOREBOARD_COMMAND } from '@shared/types'
import type { SyncRecord } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer
// ---------------------------------------------------------------------------

const mockSend = vi.fn()
const mockInvoke = vi.fn()
const mockOn = vi.fn()

Object.defineProperty(globalThis.window, 'electron', {
  value: {
    ipcRenderer: {
      send: mockSend,
      invoke: mockInvoke,
      on: mockOn,
    },
  },
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// Import component after mocks are wired
// ---------------------------------------------------------------------------

import SyncConflictDialog from '../components/SyncConflictDialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOCAL: SyncRecord = {
  entityType: 'gameState',
  entityId: 'game-123',
  lastModifiedAt: '2024-01-01T10:00:00.000Z',
  fields: [
    { field: 'homeScore', value: 42 },
    { field: 'awayScore', value: 38 },
  ],
}

const REMOTE: SyncRecord = {
  entityType: 'gameState',
  entityId: 'game-123',
  lastModifiedAt: '2024-01-01T10:05:00.000Z',
  fields: [
    { field: 'homeScore', value: 40 },
    { field: 'awayScore', value: 38 },
  ],
}

const CONFLICT_ID = 'conflict-abc'

function renderDialog(onResolved = vi.fn()) {
  const utils = render(
    <SyncConflictDialog
      conflictId={CONFLICT_ID}
      local={LOCAL}
      remote={REMOTE}
      onResolved={onResolved}
    />,
  )
  return { onResolved, ...utils }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncConflictDialog', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('renders both local and remote versions side-by-side with fields and timestamps', () => {
    renderDialog()

    // Version headers
    expect(screen.getByText('Local')).toBeTruthy()
    expect(screen.getByText('Remote')).toBeTruthy()

    // Field names appear
    expect(screen.getByText('homeScore')).toBeTruthy()
    expect(screen.getByText('awayScore')).toBeTruthy()

    // Both differing values appear
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('40')).toBeTruthy()

    // Timestamps rendered as <time> elements with the raw ISO in dateTime
    const times = screen.getAllByText((_content, el) => el?.tagName.toLowerCase() === 'time')
    const dateTimes = times.map((t) => t.getAttribute('datetime'))
    expect(dateTimes).toContain(LOCAL.lastModifiedAt)
    expect(dateTimes).toContain(REMOTE.lastModifiedAt)
  })

  it('sends SYNC_CONFLICT_RESOLVED with choice "local" when Keep Local is clicked', () => {
    const { onResolved } = renderDialog()

    fireEvent.click(screen.getByText(/keep local/i))

    expect(mockSend).toHaveBeenCalledWith(SCOREBOARD_COMMAND, {
      type: 'SYNC_CONFLICT_RESOLVED',
      conflictId: CONFLICT_ID,
      choice: 'local',
    })
    expect(onResolved).toHaveBeenCalledWith(CONFLICT_ID, 'local')
  })

  it('sends SYNC_CONFLICT_RESOLVED with choice "remote" when Use Remote is clicked', () => {
    const { onResolved } = renderDialog()

    fireEvent.click(screen.getByText(/use remote/i))

    expect(mockSend).toHaveBeenCalledWith(SCOREBOARD_COMMAND, {
      type: 'SYNC_CONFLICT_RESOLVED',
      conflictId: CONFLICT_ID,
      choice: 'remote',
    })
    expect(onResolved).toHaveBeenCalledWith(CONFLICT_ID, 'remote')
  })

  it('cancel defaults to keeping the local version (Req 30.6)', () => {
    const { onResolved } = renderDialog()

    // The explicit "Cancel" button
    fireEvent.click(screen.getByText(/^cancel$/i))

    expect(mockSend).toHaveBeenCalledWith(SCOREBOARD_COMMAND, {
      type: 'SYNC_CONFLICT_RESOLVED',
      conflictId: CONFLICT_ID,
      choice: 'local',
    })
    expect(onResolved).toHaveBeenCalledWith(CONFLICT_ID, 'local')
  })

  it('closing via the X button defaults to keeping local', () => {
    renderDialog()

    fireEvent.click(screen.getByLabelText(/keep local version/i))

    expect(mockSend).toHaveBeenCalledWith(
      SCOREBOARD_COMMAND,
      expect.objectContaining({ type: 'SYNC_CONFLICT_RESOLVED', choice: 'local' }),
    )
  })

  it('pressing Escape defaults to keeping local', () => {
    renderDialog()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(mockSend).toHaveBeenCalledWith(
      SCOREBOARD_COMMAND,
      expect.objectContaining({ type: 'SYNC_CONFLICT_RESOLVED', choice: 'local' }),
    )
  })

  it('clicking the backdrop defaults to keeping local', () => {
    const { container } = renderDialog()

    const backdrop = container.querySelector('.sync-conflict-backdrop') as HTMLElement
    fireEvent.click(backdrop)

    expect(mockSend).toHaveBeenCalledWith(
      SCOREBOARD_COMMAND,
      expect.objectContaining({ type: 'SYNC_CONFLICT_RESOLVED', choice: 'local' }),
    )
  })
})
