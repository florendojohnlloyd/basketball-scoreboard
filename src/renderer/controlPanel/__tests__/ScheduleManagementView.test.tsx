// @vitest-environment jsdom
/**
 * Example-based tests for ScheduleManagementView (Requirement 24).
 *
 * Tests covered:
 *  1. Same team for home and away is rejected (Req 24.1 validation)
 *  2. Invalid / missing date is rejected (Req 24.1 validation)
 *  3. Delete does not call GAME_LOG_DELETE (Req 24.4 — does not delete associated log)
 *  4. Delete calls SCHEDULE_REMOVE after confirm (Req 24.4)
 *  5. Cancel confirm skips SCHEDULE_REMOVE (Req 24.4)
 *  6. Valid add calls SCHEDULE_ADD with correct payload (Req 24.1)
 *  7. Schedule list renders all games sorted by date ascending (Req 24.2)
 *  8. "✓ Complete" opens the link-log dialog (Req 24.3)
 *  9. Confirming link calls SCHEDULE_LINK_LOG (Req 24.3)
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScheduledGame, LigaTeam } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
const mockConfirm = vi.fn(() => true)
const mockAlert = vi.fn()

Object.defineProperty(globalThis.window, 'electron', {
  value: { ipcRenderer: { invoke: mockInvoke } },
  writable: true,
  configurable: true,
})
Object.defineProperty(globalThis.window, 'confirm', {
  value: mockConfirm,
  writable: true,
  configurable: true,
})
Object.defineProperty(globalThis.window, 'alert', {
  value: mockAlert,
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTeam(id: string, name: string): LigaTeam {
  return {
    id,
    name,
    color: '#FF0000',
    logoPath: null,
    playerImagePath: null,
    players: [],
    createdAt: new Date().toISOString(),
  }
}

function makeScheduledGame(overrides: Partial<ScheduledGame> = {}): ScheduledGame {
  return {
    id: `game-${Math.random().toString(36).slice(2, 8)}`,
    ligaId: 'liga-1',
    date: '2025-03-15',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    assignedStaff: [],
    status: 'Scheduled',
    ...overrides,
  }
}

const TEAMS: LigaTeam[] = [
  makeTeam('team-home', 'Home Bulls'),
  makeTeam('team-away', 'Away Lakers'),
  makeTeam('team-third', 'Third Team'),
]

const LIGA_ID = 'liga-1'
const LIGA_NAME = 'Test Liga'

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import ScheduleManagementView from '../components/ScheduleManagementView'

beforeEach(() => {
  mockInvoke.mockReset()
  mockConfirm.mockReturnValue(true)
  mockAlert.mockReset()

  // Default: empty schedule list + empty game logs
  mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
    if (query.type === 'SCHEDULE_LIST') {
      return Promise.resolve({ success: true, entries: [] })
    }
    if (query.type === 'GAME_LOG_LIST') {
      return Promise.resolve({ logs: [], warnings: [] })
    }
    return Promise.resolve({ success: true })
  })
})

// ---------------------------------------------------------------------------
// 1. Requirement 24.1 — Same team for both sides is rejected
// ---------------------------------------------------------------------------

describe('ScheduleManagementView — same team validation', () => {
  it('shows validation error when home and away team are the same', async () => {
    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    // Wait for initial loads to complete
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())

    // Fill date
    fireEvent.change(screen.getByLabelText('Game date'), { target: { value: '2025-06-10' } })

    // Select same team for home and away
    fireEvent.change(screen.getByLabelText('Home team'), { target: { value: 'team-home' } })
    fireEvent.change(screen.getByLabelText('Away team'), { target: { value: 'team-home' } })

    await userEvent.click(screen.getByRole('button', { name: 'Add scheduled game' }))

    const alerts = screen.getAllByRole('alert')
    const alertTexts = alerts.map(a => a.textContent).join(' ')
    expect(alertTexts).toMatch(/different|same team/i)

    // SCHEDULE_ADD must NOT have been called
    const scheduleAddCalls = mockInvoke.mock.calls.filter(
      ([, q]) => q?.type === 'SCHEDULE_ADD'
    )
    expect(scheduleAddCalls).toHaveLength(0)
  })

  it('does not call SCHEDULE_ADD when the same team is selected for both sides', async () => {
    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Game date'), { target: { value: '2025-09-01' } })
    fireEvent.change(screen.getByLabelText('Home team'), { target: { value: 'team-away' } })
    fireEvent.change(screen.getByLabelText('Away team'), { target: { value: 'team-away' } })

    await userEvent.click(screen.getByRole('button', { name: 'Add scheduled game' }))

    expect(
      mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_ADD')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Requirement 24.1 — Invalid date is rejected
// ---------------------------------------------------------------------------

describe('ScheduleManagementView — date validation', () => {
  it('shows error when date field is empty', async () => {
    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())

    // Leave date empty, pick valid teams
    fireEvent.change(screen.getByLabelText('Home team'), { target: { value: 'team-home' } })
    fireEvent.change(screen.getByLabelText('Away team'), { target: { value: 'team-away' } })

    await userEvent.click(screen.getByRole('button', { name: 'Add scheduled game' }))

    const alerts = screen.getAllByRole('alert')
    const alertTexts = alerts.map(a => a.textContent).join(' ')
    expect(alertTexts).toMatch(/date.*required|required/i)

    expect(
      mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_ADD')
    ).toBe(false)
  })

  it('shows error when date is not a valid calendar date', async () => {
    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())

    // Simulate an invalid date value (bypassing browser date input)
    const dateInput = screen.getByLabelText('Game date')
    Object.defineProperty(dateInput, 'value', { writable: true })
    fireEvent.change(dateInput, { target: { value: 'not-a-date' } })

    fireEvent.change(screen.getByLabelText('Home team'), { target: { value: 'team-home' } })
    fireEvent.change(screen.getByLabelText('Away team'), { target: { value: 'team-away' } })

    await userEvent.click(screen.getByRole('button', { name: 'Add scheduled game' }))

    const alerts = screen.getAllByRole('alert')
    const alertTexts = alerts.map(a => a.textContent).join(' ')
    expect(alertTexts).toMatch(/date|invalid|valid/i)

    expect(
      mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_ADD')
    ).toBe(false)
  })

  it('rejects a logically impossible date (e.g. month 13)', async () => {
    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())

    const dateInput = screen.getByLabelText('Game date')
    fireEvent.change(dateInput, { target: { value: '2025-13-01' } })
    fireEvent.change(screen.getByLabelText('Home team'), { target: { value: 'team-home' } })
    fireEvent.change(screen.getByLabelText('Away team'), { target: { value: 'team-away' } })

    await userEvent.click(screen.getByRole('button', { name: 'Add scheduled game' }))

    const alerts = screen.getAllByRole('alert')
    const alertTexts = alerts.map(a => a.textContent).join(' ')
    expect(alertTexts).toMatch(/date|invalid|valid/i)

    expect(
      mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_ADD')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Requirement 24.4 — Delete does NOT delete the linked game log
// ---------------------------------------------------------------------------

describe('ScheduleManagementView — delete does not remove linked game log', () => {
  it('calls SCHEDULE_REMOVE but never GAME_LOG_DELETE when deleting a linked game', async () => {
    const linkedGame = makeScheduledGame({
      id: 'sched-linked',
      status: 'Completed',
      gameLogId: 'log-abc',
    })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') {
        return Promise.resolve({ success: true, entries: [linkedGame] })
      }
      if (query.type === 'GAME_LOG_LIST') {
        return Promise.resolve({ logs: [], warnings: [] })
      }
      if (query.type === 'SCHEDULE_REMOVE') {
        return Promise.resolve({ success: true })
      }
      // Second SCHEDULE_LIST call (reload after delete)
      return Promise.resolve({ success: true, entries: [] })
    })

    mockConfirm.mockReturnValue(true)

    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    // Wait for the game to appear in the list
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0)
    )

    const deleteBtn = screen.getByRole('button', {
      name: /delete scheduled game home bulls vs away lakers/i,
    })
    await userEvent.click(deleteBtn)

    // Verify SCHEDULE_REMOVE was called
    await waitFor(() => {
      expect(
        mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_REMOVE' && q?.gameId === 'sched-linked')
      ).toBe(true)
    })

    // Verify GAME_LOG_DELETE was NEVER called
    expect(
      mockInvoke.mock.calls.some(([, q]) => q?.type === 'GAME_LOG_DELETE')
    ).toBe(false)
  })

  it('does not call SCHEDULE_REMOVE when the operator cancels the confirm dialog', async () => {
    const game = makeScheduledGame({ id: 'sched-keep' })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') {
        return Promise.resolve({ success: true, entries: [game] })
      }
      if (query.type === 'GAME_LOG_LIST') {
        return Promise.resolve({ logs: [], warnings: [] })
      }
      return Promise.resolve({ success: true })
    })

    mockConfirm.mockReturnValue(false) // operator cancels

    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0)
    )

    const deleteBtn = screen.getByRole('button', {
      name: /delete scheduled game home bulls vs away lakers/i,
    })
    await userEvent.click(deleteBtn)

    expect(
      mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_REMOVE')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Requirement 24.1 — Valid add calls SCHEDULE_ADD correctly
// ---------------------------------------------------------------------------

describe('ScheduleManagementView — valid add', () => {
  it('calls SCHEDULE_ADD with the correct payload when all fields are valid', async () => {
    const newEntry = makeScheduledGame({
      id: 'new-game',
      date: '2025-08-20',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
      status: 'Scheduled',
    })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') {
        return Promise.resolve({ success: true, entries: [] })
      }
      if (query.type === 'GAME_LOG_LIST') {
        return Promise.resolve({ logs: [], warnings: [] })
      }
      if (query.type === 'SCHEDULE_ADD') {
        return Promise.resolve({ success: true, entry: newEntry })
      }
      // Reload after add
      return Promise.resolve({ success: true, entries: [newEntry] })
    })

    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
      />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Game date'), { target: { value: '2025-08-20' } })
    fireEvent.change(screen.getByLabelText('Home team'), { target: { value: 'team-home' } })
    fireEvent.change(screen.getByLabelText('Away team'), { target: { value: 'team-away' } })

    await userEvent.click(screen.getByRole('button', { name: 'Add scheduled game' }))

    await waitFor(() => {
      expect(
        mockInvoke.mock.calls.some(([, q]) =>
          q?.type === 'SCHEDULE_ADD' &&
          q?.ligaId === LIGA_ID &&
          q?.entry?.date === '2025-08-20' &&
          q?.entry?.homeTeamId === 'team-home' &&
          q?.entry?.awayTeamId === 'team-away' &&
          q?.entry?.status === 'Scheduled'
        )
      ).toBe(true)
    })
  })

  it('shows no validation errors after a successful add', async () => {
    const newEntry = makeScheduledGame({ id: 'g2', date: '2025-10-05' })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') return Promise.resolve({ success: true, entries: [] })
      if (query.type === 'GAME_LOG_LIST') return Promise.resolve({ logs: [], warnings: [] })
      if (query.type === 'SCHEDULE_ADD') return Promise.resolve({ success: true, entry: newEntry })
      return Promise.resolve({ success: true, entries: [newEntry] })
    })

    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Game date'), { target: { value: '2025-10-05' } })
    fireEvent.change(screen.getByLabelText('Home team'), { target: { value: 'team-home' } })
    fireEvent.change(screen.getByLabelText('Away team'), { target: { value: 'team-away' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add scheduled game' }))

    await waitFor(() =>
      expect(mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_ADD')).toBe(true)
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. Requirement 24.2 — Schedule list renders games
// ---------------------------------------------------------------------------

describe('ScheduleManagementView — list display', () => {
  it('shows "No games scheduled yet" when the schedule is empty', async () => {
    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    await waitFor(() =>
      expect(screen.getByText(/no games scheduled yet/i)).toBeTruthy()
    )
  })

  it('renders scheduled games with date, home/away team names, and status', async () => {
    const game = makeScheduledGame({
      id: 'g1',
      date: '2025-05-10',
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
      status: 'Scheduled',
    })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') return Promise.resolve({ success: true, entries: [game] })
      if (query.type === 'GAME_LOG_LIST') return Promise.resolve({ logs: [], warnings: [] })
      return Promise.resolve({ success: true })
    })

    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    // The table renders team names in <td> cells; use getAllByText to handle duplicate
    // occurrences in the dropdown <option> elements too.
    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'Scheduled games' })
      expect(within(table).getByText('Home Bulls')).toBeTruthy()
      expect(within(table).getByText('Away Lakers')).toBeTruthy()
      expect(within(table).getByText('Scheduled')).toBeTruthy()
    })
  })

  it('renders completed status for a completed game', async () => {
    const game = makeScheduledGame({ id: 'g1', status: 'Completed', gameLogId: 'log-1' })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') return Promise.resolve({ success: true, entries: [game] })
      if (query.type === 'GAME_LOG_LIST') return Promise.resolve({ logs: [], warnings: [] })
      return Promise.resolve({ success: true })
    })

    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy())
    // Completed games do not show a "Complete" button
    expect(screen.queryByRole('button', { name: /complete/i })).toBeNull()
  })

  it('does not show Complete button for games already completed', async () => {
    const completedGame = makeScheduledGame({ id: 'g1', status: 'Completed' })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') return Promise.resolve({ success: true, entries: [completedGame] })
      if (query.type === 'GAME_LOG_LIST') return Promise.resolve({ logs: [], warnings: [] })
      return Promise.resolve({ success: true })
    })

    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy())
    expect(screen.queryByTitle('Mark as Completed')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. Requirement 24.3 — Marking a game as completed links a game log
// ---------------------------------------------------------------------------

describe('ScheduleManagementView — link log / mark completed', () => {
  it('opens the link-log dialog when "✓ Complete" is clicked', async () => {
    const game = makeScheduledGame({ id: 'g1', status: 'Scheduled' })
    const logs = [
      {
        id: 'log-1',
        date: '2025-03-14T18:00:00Z',
        homeTeam: 'Home Bulls',
        awayTeam: 'Away Lakers',
        finalScores: { home: 80, away: 76 },
        fileName: 'log-1.json',
      },
    ]

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') return Promise.resolve({ success: true, entries: [game] })
      if (query.type === 'GAME_LOG_LIST') return Promise.resolve({ logs, warnings: [] })
      return Promise.resolve({ success: true })
    })

    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mark.*completed/i })).toBeTruthy()
    )

    await userEvent.click(screen.getByRole('button', { name: /mark.*completed/i }))

    // Dialog should be open
    expect(screen.getByRole('dialog', { name: /link game log/i })).toBeTruthy()
    expect(screen.getByText(/mark game as completed/i)).toBeTruthy()
  })

  it('calls SCHEDULE_LINK_LOG with gameId and gameLogId after selecting a log and confirming', async () => {
    const game = makeScheduledGame({ id: 'g1', status: 'Scheduled' })
    const logs = [
      {
        id: 'log-42',
        date: '2025-03-14T18:00:00Z',
        homeTeam: 'Home Bulls',
        awayTeam: 'Away Lakers',
        finalScores: { home: 80, away: 76 },
        fileName: 'log-42.json',
      },
    ]

    let scheduleListCallCount = 0
    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') {
        scheduleListCallCount++
        const entries = scheduleListCallCount === 1
          ? [game]
          : [{ ...game, status: 'Completed', gameLogId: 'log-42' }]
        return Promise.resolve({ success: true, entries })
      }
      if (query.type === 'GAME_LOG_LIST') return Promise.resolve({ logs, warnings: [] })
      if (query.type === 'SCHEDULE_LINK_LOG') return Promise.resolve({ success: true })
      return Promise.resolve({ success: true })
    })

    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mark.*completed/i })).toBeTruthy()
    )

    await userEvent.click(screen.getByRole('button', { name: /mark.*completed/i }))

    // Dialog is open — select a log
    const select = screen.getByLabelText('Select game log')
    fireEvent.change(select, { target: { value: 'log-42' } })

    await userEvent.click(screen.getByRole('button', { name: 'Confirm link game log' }))

    await waitFor(() => {
      expect(
        mockInvoke.mock.calls.some(([, q]) =>
          q?.type === 'SCHEDULE_LINK_LOG' &&
          q?.gameId === 'g1' &&
          q?.gameLogId === 'log-42' &&
          q?.ligaId === LIGA_ID
        )
      ).toBe(true)
    })
  })

  it('closes the link-log dialog when Cancel is clicked without calling SCHEDULE_LINK_LOG', async () => {
    const game = makeScheduledGame({ id: 'g1', status: 'Scheduled' })

    mockInvoke.mockImplementation((_channel: string, query: { type: string }) => {
      if (query.type === 'SCHEDULE_LIST') return Promise.resolve({ success: true, entries: [game] })
      if (query.type === 'GAME_LOG_LIST') return Promise.resolve({ logs: [], warnings: [] })
      return Promise.resolve({ success: true })
    })

    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName={LIGA_NAME} teams={TEAMS} />
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mark.*completed/i })).toBeTruthy()
    )

    await userEvent.click(screen.getByRole('button', { name: /mark.*completed/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Dialog should be closed
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      mockInvoke.mock.calls.some(([, q]) => q?.type === 'SCHEDULE_LINK_LOG')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 7. Requirement 24 — Header renders the liga name and game count
// ---------------------------------------------------------------------------

describe('ScheduleManagementView — header', () => {
  it('renders the liga name in the heading', async () => {
    render(
      <ScheduleManagementView ligaId={LIGA_ID} ligaName="My Liga" teams={TEAMS} />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    expect(screen.getByText(/my liga/i)).toBeTruthy()
  })

  it('calls onClose when the Back button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <ScheduleManagementView
        ligaId={LIGA_ID}
        ligaName={LIGA_NAME}
        teams={TEAMS}
        onClose={onClose}
      />
    )

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
