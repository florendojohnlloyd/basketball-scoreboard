// @vitest-environment jsdom
/**
 * Example-based tests for RosterManagementView (Requirement 23).
 *
 * Tests covered:
 *  - Duplicate jersey number is blocked with a validation error (Req 23.2)
 *  - Valid player add persists via IPC LIGA_ADD_PLAYER (Req 23.2)
 *  - Player delete removes the record via IPC LIGA_REMOVE_PLAYER after confirm (Req 23.4)
 *  - Edit with a duplicate jersey number is blocked (Req 23.3)
 *  - Valid edit persists via IPC LIGA_UPDATE_PLAYER (Req 23.3)
 *  - Display renders existing player names and numbers (Req 23.1)
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LigaTeam, LigaPlayer } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer without replacing the whole window object
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
const mockConfirm = vi.fn(() => true)
const mockAlert = vi.fn()

// Attach to globalThis.window (jsdom) WITHOUT replacing the object to avoid
// breaking React DOM's internal Document/Element instanceof checks.
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

function makePlayer(overrides: Partial<LigaPlayer> = {}): LigaPlayer {
  return {
    id: `player-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Player',
    number: '10',
    photoPath: null,
    ...overrides,
  }
}

function makeTeam(players: LigaPlayer[] = []): LigaTeam {
  return {
    id: 'team-abc',
    name: 'Test Team',
    color: '#FF0000',
    logoPath: null,
    playerImagePath: null,
    players,
    createdAt: new Date().toISOString(),
  }
}

/** Build a mock LIGA_LOAD response (used as reload after mutations). */
function mockLigaLoad(team: LigaTeam) {
  return { success: true, liga: { id: 'liga-1', name: 'Test Liga', teams: [team] } }
}

// ---------------------------------------------------------------------------
// Import component after mocks are wired
// ---------------------------------------------------------------------------

import RosterManagementView from '../components/RosterManagementView'

const LIGA_ID = 'liga-1'

beforeEach(() => {
  mockInvoke.mockReset()
  mockConfirm.mockReturnValue(true)
  mockAlert.mockReset()
})

// ---------------------------------------------------------------------------
// 1. Requirement 23.2 — Duplicate jersey number blocked on Add
// ---------------------------------------------------------------------------

describe('RosterManagementView — duplicate jersey number blocked', () => {
  it('shows validation error and does not call IPC when jersey number already taken', async () => {
    const existingPlayer = makePlayer({ id: 'p1', number: '7', name: 'Alice' })
    const team = makeTeam([existingPlayer])

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New jersey number'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'Bob' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    expect(screen.getByRole('alert').textContent).toMatch(/already taken|#7/i)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('blocks duplicate number even when player names are completely different', async () => {
    const existingPlayer = makePlayer({ id: 'p1', number: '23', name: 'Jordan' })
    const team = makeTeam([existingPlayer])

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New jersey number'), { target: { value: '23' } })
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'Different Player' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    expect(screen.getByRole('alert').textContent).toMatch(/already taken|#23/i)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('allows adding a player with a unique jersey number (different from existing)', async () => {
    const existingPlayer = makePlayer({ id: 'p1', number: '7', name: 'Alice' })
    const updatedTeam = makeTeam([
      existingPlayer,
      makePlayer({ id: 'p2', number: '8', name: 'Bob' }),
    ])

    mockInvoke
      .mockResolvedValueOnce({ success: true, player: { id: 'p2', number: '8', name: 'Bob', photoPath: null } })
      .mockResolvedValueOnce(mockLigaLoad(updatedTeam))

    render(<RosterManagementView team={makeTeam([existingPlayer])} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New jersey number'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'Bob' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({ type: 'LIGA_ADD_PLAYER' })
      )
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Requirement 23.2 — Valid add persists to Liga JSON via IPC
// ---------------------------------------------------------------------------

describe('RosterManagementView — valid player add persists', () => {
  it('sends LIGA_ADD_PLAYER with correct name and number via IPC on valid input', async () => {
    const team = makeTeam([])
    const updatedTeam = makeTeam([makePlayer({ id: 'new-1', name: 'New Player', number: '42' })])

    mockInvoke
      .mockResolvedValueOnce({ success: true, player: { id: 'new-1', name: 'New Player', number: '42', photoPath: null } })
      .mockResolvedValueOnce(mockLigaLoad(updatedTeam))

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New jersey number'), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'New Player' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({
          type: 'LIGA_ADD_PLAYER',
          ligaId: LIGA_ID,
          teamId: team.id,
          player: expect.objectContaining({ name: 'New Player', number: '42' }),
        })
      )
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears the add form fields after a successful add', async () => {
    const team = makeTeam([])
    const updatedTeam = makeTeam([makePlayer({ id: 'new-1', name: 'Charlie', number: '55' })])

    mockInvoke
      .mockResolvedValueOnce({ success: true, player: { id: 'new-1', name: 'Charlie', number: '55', photoPath: null } })
      .mockResolvedValueOnce(mockLigaLoad(updatedTeam))

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    const numInput = screen.getByLabelText('New jersey number') as HTMLInputElement
    const nameInput = screen.getByLabelText('New player name') as HTMLInputElement

    fireEvent.change(numInput, { target: { value: '55' } })
    fireEvent.change(nameInput, { target: { value: 'Charlie' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    await waitFor(() => {
      expect(numInput.value).toBe('')
      expect(nameInput.value).toBe('')
    })
  })

  it('shows an error message when the IPC add call returns failure', async () => {
    const team = makeTeam([])
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'Database write failed' })

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New jersey number'), { target: { value: '99' } })
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'Failed Player' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/Database write failed|Failed to add/i)
    })
  })

  it('rejects an empty player name with a validation error (no IPC call)', async () => {
    const team = makeTeam([])
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New jersey number'), { target: { value: '11' } })
    // name left empty
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    expect(screen.getByRole('alert').textContent).toMatch(/name is required|required/i)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('rejects jersey number 0 (below minimum 1) with a validation error', async () => {
    const team = makeTeam([])
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New jersey number'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'Valid Name' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add player' }))

    expect(screen.getByRole('alert').textContent).toMatch(/1.*99|between/i)
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. Requirement 23.4 — Delete removes the player record
// ---------------------------------------------------------------------------

describe('RosterManagementView — delete removes record', () => {
  it('calls LIGA_REMOVE_PLAYER via IPC when operator confirms deletion', async () => {
    const player = makePlayer({ id: 'player-del', name: 'To Delete', number: '15' })
    const team = makeTeam([player])
    const teamAfterDelete = makeTeam([])

    mockConfirm.mockReturnValue(true)
    mockInvoke
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(mockLigaLoad(teamAfterDelete))

    const onUpdated = vi.fn()
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={onUpdated} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove To Delete' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({
          type: 'LIGA_REMOVE_PLAYER',
          ligaId: LIGA_ID,
          teamId: team.id,
          playerId: player.id,
        })
      )
    })
  })

  it('does NOT call IPC when user cancels the confirm dialog', async () => {
    const player = makePlayer({ id: 'player-keep', name: 'Keeper', number: '21' })
    const team = makeTeam([player])

    mockConfirm.mockReturnValue(false)

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Keeper' }))

    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('player disappears from the list after successful deletion', async () => {
    const player = makePlayer({ id: 'p-gone', name: 'Gone Player', number: '33' })
    const team = makeTeam([player])
    const teamAfterDelete = makeTeam([])

    mockConfirm.mockReturnValue(true)
    mockInvoke
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(mockLigaLoad(teamAfterDelete))

    const onUpdated = vi.fn()
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={onUpdated} />)

    expect(screen.getByText('Gone Player')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Gone Player' }))

    await waitFor(() => {
      expect(screen.queryByText('Gone Player')).toBeNull()
    })
    expect(onUpdated).toHaveBeenCalledWith(teamAfterDelete)
  })
})

// ---------------------------------------------------------------------------
// 4. Requirement 23.3 — Edit validation: duplicate jersey blocked; valid edit persists
// ---------------------------------------------------------------------------

describe('RosterManagementView — edit validation', () => {
  it('blocks edit save when the new jersey number duplicates another player', async () => {
    const player1 = makePlayer({ id: 'p1', name: 'Alice', number: '7' })
    const player2 = makePlayer({ id: 'p2', name: 'Bob', number: '9' })
    const team = makeTeam([player1, player2])

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    // Enter edit mode for Bob
    await userEvent.click(screen.getByRole('button', { name: 'Edit Bob' }))

    // Multiple elements have aria-label "Jersey number" (the display span + input).
    // Pick specifically the textbox (the input element in edit mode).
    const numInput = screen.getAllByRole('textbox', { name: 'Jersey number' })[0] as HTMLInputElement
    fireEvent.change(numInput, { target: { value: '7' } }) // Alice's number

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // Validation error shown, no IPC
    expect(screen.getByRole('alert').textContent).toMatch(/already taken|#7/i)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('allows a player to keep their own jersey number when only the name changes', async () => {
    const player = makePlayer({ id: 'p1', name: 'Alice', number: '7' })
    const team = makeTeam([player])
    const updatedTeam = makeTeam([{ ...player, name: 'Alice Updated' }])

    mockInvoke
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(mockLigaLoad(updatedTeam))

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit Alice' }))

    // Change only the name, keep jersey number at '7'
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'Alice Updated' } })

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({
          type: 'LIGA_UPDATE_PLAYER',
          ligaId: LIGA_ID,
          playerId: player.id,
          updates: expect.objectContaining({ name: 'Alice Updated', number: '7' }),
        })
      )
    })
  })

  it('sends LIGA_UPDATE_PLAYER with trimmed name and new number on a valid edit', async () => {
    const player = makePlayer({ id: 'p1', name: 'Original', number: '5' })
    const team = makeTeam([player])
    const updatedTeam = makeTeam([{ ...player, name: 'Updated', number: '6' }])

    mockInvoke
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(mockLigaLoad(updatedTeam))

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit Original' }))

    fireEvent.change(screen.getByLabelText('Jersey number'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: '  Updated  ' } })

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'scoreboard:query',
        expect.objectContaining({
          type: 'LIGA_UPDATE_PLAYER',
          updates: expect.objectContaining({ name: 'Updated', number: '6' }),
        })
      )
    })
  })

  it('cancels edit mode without IPC call when cancel button is clicked', async () => {
    const player = makePlayer({ id: 'p1', name: 'Bob', number: '12' })
    const team = makeTeam([player])

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit Bob' }))
    // Cancel returns to display mode
    await userEvent.click(screen.getByRole('button', { name: 'Cancel edit' }))

    // Edit button is visible again (display mode restored)
    expect(screen.getByRole('button', { name: 'Edit Bob' })).toBeTruthy()
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 5. Requirement 23.1 — Display renders existing players correctly
// ---------------------------------------------------------------------------

describe('RosterManagementView — display', () => {
  it('shows the team name in the header', () => {
    const team = makeTeam([])
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)
    // The heading renders as "Test Team — Roster"
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy()
    expect(screen.getByText(/Test Team/)).toBeTruthy()
  })

  it('renders all player rows with their name and jersey number', () => {
    const players = [
      makePlayer({ id: 'p1', name: 'Alice', number: '3' }),
      makePlayer({ id: 'p2', name: 'Bob', number: '17' }),
      makePlayer({ id: 'p3', name: 'Charlie', number: '42' }),
    ]
    const team = makeTeam(players)

    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('#3')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('#17')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()
    expect(screen.getByText('#42')).toBeTruthy()
  })

  it('shows empty state message when there are no players', () => {
    const team = makeTeam([])
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)
    expect(screen.getByText(/no players yet/i)).toBeTruthy()
  })

  it('shows "2 players registered" subtitle for two players', () => {
    const players = [
      makePlayer({ id: 'p1', name: 'A', number: '1' }),
      makePlayer({ id: 'p2', name: 'B', number: '2' }),
    ]
    const team = makeTeam(players)
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)
    expect(screen.getByText(/2 players registered/i)).toBeTruthy()
  })

  it('shows singular "1 player registered" for exactly one player', () => {
    const team = makeTeam([makePlayer({ id: 'p1', name: 'Solo', number: '1' })])
    render(<RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} />)
    expect(screen.getByText(/1 player registered/i)).toBeTruthy()
  })

  it('calls onClose when the Back button is clicked', async () => {
    const team = makeTeam([])
    const onClose = vi.fn()
    render(
      <RosterManagementView team={team} ligaId={LIGA_ID} onUpdated={vi.fn()} onClose={onClose} />
    )
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
