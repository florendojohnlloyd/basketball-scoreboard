// @vitest-environment jsdom

/**
 * BracketViewer unit tests
 *
 * Tests the container component's loading, error, and empty states,
 * as well as IPC query invocation and event subscription logic.
 *
 * Task: 8.1
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Tournament } from '@shared/types'
import { SCOREBOARD_EVENT } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer (must be at module level before imports)
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
const mockOn = vi.fn()

Object.defineProperty(globalThis.window, 'electron', {
  value: {
    ipcRenderer: {
      invoke: mockInvoke,
      on: mockOn,
      send: vi.fn(),
    },
  },
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// Import component after mocks are wired
// ---------------------------------------------------------------------------

import BracketViewer from './BracketViewer'

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const mockMatchNode: Tournament['matchNodes'][0] = {
  id: 'm1',
  roundIndex: 0,
  position: 0,
  bracketSection: 'final',
  homeTeamId: 'team1',
  awayTeamId: 'team2',
  homeSeed: 1,
  awaySeed: 2,
  homeSourceMatchId: null,
  awaySourceMatchId: null,
  homeSourceIsLoser: false,
  awaySourceIsLoser: false,
  status: 'pending',
  homeScore: null,
  awayScore: null,
  winnerTeamId: null,
  loserTeamId: null,
  scheduledGameId: null,
  gameLogId: null,
  isBye: false,
}

const mockTournament: Tournament = {
  id: 't1',
  ligaId: 'liga1',
  name: 'Test Tournament',
  format: 'single-elimination',
  status: 'in-progress',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  seeds: [
    { seedNumber: 1, teamId: 'team1', teamName: 'Team A', record: { wins: 10, losses: 2 }, pointDifferential: 50 },
    { seedNumber: 2, teamId: 'team2', teamName: 'Team B', record: { wins: 9, losses: 3 }, pointDifferential: 40 },
  ],
  rounds: [
    { index: 0, name: 'Final', matchNodeIds: ['m1'] },
  ],
  matchNodes: [mockMatchNode],
  options: {
    consolationMatch: false,
  },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BracketViewer', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
  })

  it('renders loading state initially', async () => {
    mockInvoke.mockReturnValue(new Promise(() => {})) // Never resolves
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    expect(screen.getByText('Loading bracket...')).toBeTruthy()
    expect(screen.getByLabelText('Loading bracket')).toBeTruthy()
  })

  it('fetches tournament state via IPC query on mount', async () => {
    mockInvoke.mockResolvedValue({ success: true, tournament: mockTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('scoreboard:query', {
        type: 'TOURNAMENT_LOAD',
        tournamentId: 't1',
      })
    })
  })

  it('renders tournament data after successful load', async () => {
    mockInvoke.mockResolvedValue({ success: true, tournament: mockTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeTruthy()
    })

    expect(screen.getByText('Single Elimination')).toBeTruthy()
    expect(screen.getByText('In Progress')).toBeTruthy()
  })

  it('renders error state when load fails (Requirement 6.8)', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'Network error' })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Bracket')).toBeTruthy()
    })

    expect(screen.getByText('Network error')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('retries loading when retry button is clicked (Requirement 6.8)', async () => {
    mockInvoke
      .mockResolvedValueOnce({ success: false, error: 'Network error' })
      .mockResolvedValueOnce({ success: true, tournament: mockTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Bracket')).toBeTruthy()
    })

    const retryButton = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeTruthy()
    })

    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('renders error state when no tournament ID provided', async () => {
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Bracket')).toBeTruthy()
    })

    expect(screen.getByText('No tournament ID provided.')).toBeTruthy()
  })

  it('subscribes to SCOREBOARD_EVENT for bracket updates (Requirement 6.6)', () => {
    mockInvoke.mockResolvedValue({ success: true, tournament: mockTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    expect(mockOn).toHaveBeenCalledWith(SCOREBOARD_EVENT, expect.any(Function))
  })

  it('refreshes tournament when BRACKET_UPDATE event is received (Requirement 6.6)', async () => {
    let capturedHandler: ((event: unknown) => void) | null = null
    mockOn.mockImplementation((channel: string, handler: (event: unknown) => void) => {
      if (channel === SCOREBOARD_EVENT) {
        capturedHandler = handler
      }
    })

    mockInvoke.mockResolvedValue({ success: true, tournament: mockTournament })
    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeTruthy()
    })

    expect(mockInvoke).toHaveBeenCalledTimes(1)

    // Simulate BRACKET_UPDATE event for this tournament
    const updatedTournament = { ...mockTournament, name: 'Updated Tournament' }
    mockInvoke.mockResolvedValueOnce({ success: true, tournament: updatedTournament })

    if (capturedHandler) {
      capturedHandler({ type: 'BRACKET_UPDATE', tournamentId: 't1' })
    }

    await waitFor(() => {
      expect(screen.getByText('Updated Tournament')).toBeTruthy()
    })

    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('ignores BRACKET_UPDATE events for different tournaments', async () => {
    let capturedHandler: ((event: unknown) => void) | null = null
    mockOn.mockImplementation((channel: string, handler: (event: unknown) => void) => {
      if (channel === SCOREBOARD_EVENT) {
        capturedHandler = handler
      }
    })

    mockInvoke.mockResolvedValue({ success: true, tournament: mockTournament })
    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeTruthy()
    })

    expect(mockInvoke).toHaveBeenCalledTimes(1)

    // Simulate bracket update event for a different tournament
    if (capturedHandler) {
      capturedHandler({ type: 'BRACKET_UPDATE', tournamentId: 'different-tournament' })
    }

    // Wait briefly to ensure no additional IPC call is made
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockInvoke).toHaveBeenCalledTimes(1) // No additional calls
  })

  it('delegates to single-elimination sub-component based on format', async () => {
    mockInvoke.mockResolvedValue({ success: true, tournament: mockTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      // SingleElimTree renders a region with this accessible label
      expect(screen.getByRole('region', { name: /Single-elimination bracket/i })).toBeTruthy()
    })
  })

  it('delegates to double-elimination sub-component based on format', async () => {
    const doubleElimTournament: Tournament = {
      ...mockTournament,
      format: 'double-elimination',
      winnersBracket: [{ index: 0, name: 'Winners Final', matchNodeIds: ['m1'] }],
      losersBracket: [{ index: 0, name: 'Losers Final', matchNodeIds: ['m2'] }],
      grandFinal: mockMatchNode,
    }

    mockInvoke.mockResolvedValue({ success: true, tournament: doubleElimTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Double elimination bracket/i })).toBeTruthy()
    })

    expect(screen.getByText('Winners Bracket')).toBeTruthy()
    expect(screen.getByText('Losers Bracket')).toBeTruthy()
  })

  it('delegates to round-robin sub-component based on format', async () => {
    const roundRobinTournament: Tournament = {
      ...mockTournament,
      format: 'round-robin',
      standings: [
        {
          teamId: 'team1', teamName: 'Team A', played: 1,
          wins: 1, losses: 0, pointsFor: 100, pointsAgainst: 90, pointDifferential: 10,
        },
      ],
    }

    mockInvoke.mockResolvedValue({ success: true, tournament: roundRobinTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Round-robin results grid/i })).toBeTruthy()
    })
  })

  it('renders empty state when tournament is null after successful load', async () => {
    mockInvoke.mockResolvedValue({ success: true, tournament: null })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('No tournament data available.')).toBeTruthy()
    })
  })

  it('handles IPC invoke errors gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC error'))
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Bracket')).toBeTruthy()
    })

    expect(screen.getByText('IPC error')).toBeTruthy()
  })

  it('displays correct status badge for different tournament states', async () => {
    const pendingTournament = { ...mockTournament, status: 'pending' as const }
    mockInvoke.mockResolvedValue({ success: true, tournament: pendingTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeTruthy()
    })
  })

  it('displays champion info for completed tournaments', async () => {
    const completedTournament: Tournament = {
      ...mockTournament,
      status: 'completed',
      championTeamId: 'team1',
    }
    mockInvoke.mockResolvedValue({ success: true, tournament: completedTournament })
    mockOn.mockImplementation(() => {})

    render(<BracketViewer tournamentId="t1" ligaId="liga1" />)

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeTruthy()
    })
  })
})

