// @vitest-environment jsdom
/**
 * Tests for TeamStatsPanel (Requirement 14) and the derived selectors
 * teamFgPct / teamRebounds in store.ts.
 *
 * Example-based tests:
 *  - FGA = 0 shows "—" for FG%
 *  - FGA > 0 shows correct percentage rounded to one decimal place
 *  - Total rebounds are the sum of all player rebound counts
 *  - Turnover +/− buttons dispatch correct commands
 *  - Subtract turnover disabled at 0
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { DEFAULT_GAME_STATE, makeDefaultPlayer } from '@shared/types'
import type { GameState, Player } from '@shared/types'

// ---------------------------------------------------------------------------
// Pure selector tests (import real store module, no mock needed)
// ---------------------------------------------------------------------------
import { teamFgPct, teamRebounds } from '../store'

describe('teamFgPct selector', () => {
  it('returns null when FGA is 0 for all players', () => {
    const state = DEFAULT_GAME_STATE()
    state.home.players = [
      { ...makeDefaultPlayer(), id: 'p1', fga: 0, fgm: 0 },
      { ...makeDefaultPlayer(), id: 'p2', fga: 0, fgm: 0 },
    ]
    expect(teamFgPct(state, 'home')).toBeNull()
  })

  it('returns null when there are no players', () => {
    const state = DEFAULT_GAME_STATE()
    state.home.players = []
    expect(teamFgPct(state, 'home')).toBeNull()
  })

  it('computes FG% as (sum FGM / sum FGA) * 100', () => {
    const state = DEFAULT_GAME_STATE()
    state.home.players = [
      { ...makeDefaultPlayer(), id: 'p1', fga: 10, fgm: 4 },
      { ...makeDefaultPlayer(), id: 'p2', fga: 5, fgm: 3 },
    ]
    // (4 + 3) / (10 + 5) * 100 = 7/15 * 100 ≈ 46.666...
    const pct = teamFgPct(state, 'home')
    expect(pct).not.toBeNull()
    expect(pct!).toBeCloseTo(46.667, 2)
  })

  it('returns 100 when FGM equals FGA', () => {
    const state = DEFAULT_GAME_STATE()
    state.home.players = [
      { ...makeDefaultPlayer(), id: 'p1', fga: 5, fgm: 5 },
    ]
    expect(teamFgPct(state, 'home')).toBe(100)
  })

  it('returns 0 when FGM is 0 and FGA > 0', () => {
    const state = DEFAULT_GAME_STATE()
    state.home.players = [
      { ...makeDefaultPlayer(), id: 'p1', fga: 8, fgm: 0 },
    ]
    expect(teamFgPct(state, 'home')).toBe(0)
  })

  it('works for the away team', () => {
    const state = DEFAULT_GAME_STATE()
    state.away.players = [
      { ...makeDefaultPlayer(), id: 'p1', fga: 4, fgm: 2 },
    ]
    expect(teamFgPct(state, 'away')).toBe(50)
  })
})

describe('teamRebounds selector', () => {
  it('returns 0 when there are no players', () => {
    const state = DEFAULT_GAME_STATE()
    state.home.players = []
    expect(teamRebounds(state, 'home')).toBe(0)
  })

  it('sums all players rebounds', () => {
    const state = DEFAULT_GAME_STATE()
    state.home.players = [
      { ...makeDefaultPlayer(), id: 'p1', rebounds: 4 },
      { ...makeDefaultPlayer(), id: 'p2', rebounds: 6 },
      { ...makeDefaultPlayer(), id: 'p3', rebounds: 0 },
    ]
    expect(teamRebounds(state, 'home')).toBe(10)
  })

  it('works for the away team', () => {
    const state = DEFAULT_GAME_STATE()
    state.away.players = [
      { ...makeDefaultPlayer(), id: 'p1', rebounds: 3 },
      { ...makeDefaultPlayer(), id: 'p2', rebounds: 7 },
    ]
    expect(teamRebounds(state, 'away')).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// TeamStatsPanel component — mock the store for React component tests
// ---------------------------------------------------------------------------
vi.mock('../store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../store')>()
  const { create } = await import('zustand')
  const { DEFAULT_GAME_STATE } = await import('@shared/types')
  type GS = ReturnType<typeof DEFAULT_GAME_STATE>
  const store = create<{ gameState: GS }>(() => ({ gameState: DEFAULT_GAME_STATE() }))
  const send = vi.fn()
  return {
    ...original, // re-export teamFgPct, teamRebounds unchanged
    useControlPanelStore: store,
    sendCommand: (c: unknown) => send('scoreboard:command', c),
    __testStore: store,
    __mockSend: send,
  }
})

import TeamStatsPanel from '../components/TeamStatsPanel'

type Store = {
  setState(u: ((s: { gameState: GameState }) => unknown) | { gameState: GameState }): void
}
let compStore: Store
let send: ReturnType<typeof vi.fn>

beforeAll(async () => {
  const m = await import('../store') as unknown as {
    __testStore: Store
    __mockSend: ReturnType<typeof vi.fn>
  }
  compStore = m.__testStore
  send = m.__mockSend
})

function setPlayers(team: 'home' | 'away', players: Player[]): void {
  compStore.setState((s: { gameState: GameState }) => ({
    gameState: { ...s.gameState, [team]: { ...s.gameState[team], players } },
  }))
}

function setTurnovers(team: 'home' | 'away', turnovers: number): void {
  compStore.setState((s: { gameState: GameState }) => ({
    gameState: { ...s.gameState, [team]: { ...s.gameState[team], turnovers } },
  }))
}

describe('TeamStatsPanel component', () => {
  beforeEach(() => {
    send.mockClear()
    compStore.setState({ gameState: DEFAULT_GAME_STATE() })
  })

  it('shows "—" for FG% when FGA is 0', () => {
    setPlayers('home', [])
    render(<TeamStatsPanel team="home" />)
    expect(screen.getByLabelText(/field goal percentage/i).textContent).toBe('—')
  })

  it('shows correct FG% rounded to one decimal when FGA > 0', () => {
    setPlayers('home', [
      { ...makeDefaultPlayer(), id: 'p1', fga: 10, fgm: 4 },
      { ...makeDefaultPlayer(), id: 'p2', fga: 5, fgm: 3 },
    ])
    render(<TeamStatsPanel team="home" />)
    // 7/15 * 100 = 46.666... → "46.7%"
    expect(screen.getByLabelText(/field goal percentage/i).textContent).toBe('46.7%')
  })

  it('shows 50.0% when FGM/FGA = 2/4', () => {
    setPlayers('home', [
      { ...makeDefaultPlayer(), id: 'p1', fga: 4, fgm: 2 },
    ])
    render(<TeamStatsPanel team="home" />)
    expect(screen.getByLabelText(/field goal percentage/i).textContent).toBe('50.0%')
  })

  it('shows 100.0% when all attempts are makes', () => {
    setPlayers('home', [
      { ...makeDefaultPlayer(), id: 'p1', fga: 6, fgm: 6 },
    ])
    render(<TeamStatsPanel team="home" />)
    expect(screen.getByLabelText(/field goal percentage/i).textContent).toBe('100.0%')
  })

  it('displays total rebounds as sum of all players', () => {
    setPlayers('home', [
      { ...makeDefaultPlayer(), id: 'p1', rebounds: 3 },
      { ...makeDefaultPlayer(), id: 'p2', rebounds: 5 },
    ])
    render(<TeamStatsPanel team="home" />)
    expect(screen.getByLabelText(/total rebounds/i).textContent).toBe('8')
  })

  it('displays turnover count', () => {
    setTurnovers('home', 3)
    render(<TeamStatsPanel team="home" />)
    expect(screen.getByLabelText(/turnovers: 3/i)).toBeTruthy()
  })

  it('subtract turnover button is disabled when turnovers = 0', () => {
    setTurnovers('home', 0)
    render(<TeamStatsPanel team="home" />)
    const btn = screen.getByRole('button', { name: /subtract turnover/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('subtract turnover button is enabled when turnovers > 0', () => {
    setTurnovers('home', 2)
    render(<TeamStatsPanel team="home" />)
    const btn = screen.getByRole('button', { name: /subtract turnover/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('dispatches ADD_TURNOVER on + click', async () => {
    render(<TeamStatsPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /add turnover/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'ADD_TURNOVER', team: 'home' })
  })

  it('dispatches SUBTRACT_TURNOVER on − click when turnovers > 0', async () => {
    setTurnovers('home', 1)
    render(<TeamStatsPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /subtract turnover/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'SUBTRACT_TURNOVER', team: 'home' })
  })

  it('does not dispatch when subtract turnover clicked at 0', async () => {
    setTurnovers('home', 0)
    render(<TeamStatsPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /subtract turnover/i }))
    expect(send).not.toHaveBeenCalled()
  })

  it('works for the away team', () => {
    setPlayers('away', [
      { ...makeDefaultPlayer(), id: 'p1', fga: 8, fgm: 4 },
    ])
    render(<TeamStatsPanel team="away" />)
    expect(screen.getByLabelText(/field goal percentage/i).textContent).toBe('50.0%')
  })
})
