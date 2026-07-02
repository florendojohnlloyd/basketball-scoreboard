// @vitest-environment jsdom
/**
 * Scoreboard Display — example-based unit tests (Task 37)
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { DEFAULT_GAME_STATE } from '@shared/types'
import type { GameState } from '@shared/types'

vi.mock('../store', async () => {
  const { create } = await import('zustand')
  const { DEFAULT_GAME_STATE } = await import('@shared/types')
  type GS = ReturnType<typeof DEFAULT_GAME_STATE>
  const store = create<{ gameState: GS }>(() => ({ gameState: DEFAULT_GAME_STATE() }))
  return { useScoreboardStore: store, sendCommand: vi.fn(), __testStore: store }
})

import TeamSection from '../components/TeamSection'
import ClockDisplay from '../components/ClockDisplay'
import ShotClockDisplay from '../components/ShotClockDisplay'
import PeriodDisplay from '../components/PeriodDisplay'
import ScoreboardLayout from '../components/ScoreboardLayout'

type Store = { setState(u: ((s: { gameState: GameState }) => { gameState: GameState }) | { gameState: GameState }): void }
let store: Store

beforeAll(async () => {
  const mod = (await import('../store')) as unknown as { __testStore: Store }
  store = mod.__testStore
})

const set = (patch: Partial<GameState>) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, ...patch } }))

// ===========================================================================
// TeamSection
// ===========================================================================

describe('TeamSection', () => {
  beforeEach(() => store.setState({ gameState: DEFAULT_GAME_STATE() }))

  it('shows BONUS when fouls >= bonusThreshold', () => {
    set({ home: { ...DEFAULT_GAME_STATE().home, fouls: 5 }, gameConfig: { ...DEFAULT_GAME_STATE().gameConfig, bonusThreshold: 5 } })
    render(<TeamSection team="home" />)
    expect(screen.getByText('BONUS')).toBeTruthy()
  })

  it('hides BONUS when fouls < bonusThreshold', () => {
    set({ home: { ...DEFAULT_GAME_STATE().home, fouls: 4 }, gameConfig: { ...DEFAULT_GAME_STATE().gameConfig, bonusThreshold: 5 } })
    render(<TeamSection team="home" />)
    expect(screen.queryByText('BONUS')).toBeNull()
  })

  it('applies --team-color CSS variable', () => {
    set({ home: { ...DEFAULT_GAME_STATE().home, config: { name: 'Lakers', color: '#552583', logoPath: null } } })
    const { container } = render(<TeamSection team="home" />)
    const section = container.querySelector('section.team-section') as HTMLElement
    expect(section.style.getPropertyValue('--team-color')).toBe('#552583')
  })

  it('renders logo when logoPath is set', () => {
    set({ home: { ...DEFAULT_GAME_STATE().home, config: { name: 'Home', color: '#fff', logoPath: '/logo.png' } } })
    render(<TeamSection team="home" />)
    expect((screen.getByRole('img') as HTMLImageElement).src).toContain('logo.png')
  })

  it('does not render logo when logoPath is null', () => {
    set({ home: { ...DEFAULT_GAME_STATE().home, config: { name: 'Home', color: '#fff', logoPath: null } } })
    render(<TeamSection team="home" />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})

// ===========================================================================
// ClockDisplay
// ===========================================================================

describe('ClockDisplay', () => {
  beforeEach(() => store.setState({ gameState: DEFAULT_GAME_STATE() }))

  it('renders "12:34" for displayMs = 754000', () => {
    set({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, displayMs: 754000 } })
    render(<ClockDisplay />)
    expect(screen.getByRole('timer').textContent).toBe('12:34')
  })

  it('renders "00:00" for displayMs = 0', () => {
    set({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, displayMs: 0, running: false } })
    render(<ClockDisplay />)
    expect(screen.getByRole('timer').textContent).toBe('00:00')
  })

  it('applies flash class when running and displayMs < 10000', () => {
    set({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, displayMs: 9999, running: true } })
    render(<ClockDisplay />)
    expect(screen.getByRole('timer').className).toContain('clock-display__time--flashing')
  })

  it('does not apply flash class when displayMs > 10000', () => {
    set({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, displayMs: 120000, running: true } })
    render(<ClockDisplay />)
    expect(screen.getByRole('timer').className).not.toContain('clock-display__time--flashing')
  })
})

// ===========================================================================
// ShotClockDisplay
// ===========================================================================

describe('ShotClockDisplay', () => {
  beforeEach(() => store.setState({ gameState: DEFAULT_GAME_STATE() }))

  it('renders "24" for displayMs = 24000', () => {
    set({ shotClock: { ...DEFAULT_GAME_STATE().shotClock, displayMs: 24000, enabled: true } })
    render(<ShotClockDisplay />)
    expect(screen.getByRole('timer').textContent).toBe('24')
  })

  it('renders "1" for displayMs = 500 (Math.ceil)', () => {
    set({ shotClock: { ...DEFAULT_GAME_STATE().shotClock, displayMs: 500, enabled: true } })
    render(<ShotClockDisplay />)
    expect(screen.getByRole('timer').textContent).toBe('1')
  })

  it('is unmounted when enabled === false', () => {
    set({ shotClock: { ...DEFAULT_GAME_STATE().shotClock, enabled: false } })
    const { container } = render(<ShotClockDisplay />)
    expect(container.firstChild).toBeNull()
  })

  it('is visible when enabled === true', () => {
    set({ shotClock: { ...DEFAULT_GAME_STATE().shotClock, enabled: true, displayMs: 24000 } })
    render(<ShotClockDisplay />)
    expect(screen.getByRole('timer')).toBeTruthy()
  })
})

// ===========================================================================
// PeriodDisplay
// ===========================================================================

describe('PeriodDisplay', () => {
  beforeEach(() => store.setState({ gameState: DEFAULT_GAME_STATE() }))

  it('renders "Q1" for quarters period 1', () => {
    set({ period: { current: 1, format: 'quarters', isOvertime: false, overtimeNumber: 0 } })
    render(<PeriodDisplay />)
    expect(screen.getByText('Q1')).toBeTruthy()
  })

  it('renders "2nd Half" for halves period 2', () => {
    set({ period: { current: 2, format: 'halves', isOvertime: false, overtimeNumber: 0 }, gameConfig: { ...DEFAULT_GAME_STATE().gameConfig, periodCount: 2 } })
    render(<PeriodDisplay />)
    expect(screen.getByText('2nd Half')).toBeTruthy()
  })

  it('renders "OT" for overtimeNumber = 1', () => {
    set({ period: { current: 4, format: 'quarters', isOvertime: true, overtimeNumber: 1 } })
    render(<PeriodDisplay />)
    expect(screen.getByText('OT')).toBeTruthy()
  })

  it('renders "3OT" for overtimeNumber = 3', () => {
    set({ period: { current: 4, format: 'quarters', isOvertime: true, overtimeNumber: 3 } })
    render(<PeriodDisplay />)
    expect(screen.getByText('3OT')).toBeTruthy()
  })
})

// ===========================================================================
// ScoreboardLayout — no interactive controls
// ===========================================================================

describe('ScoreboardLayout', () => {
  beforeEach(() => store.setState({ gameState: DEFAULT_GAME_STATE() }))

  it('contains no button, input, select, or form elements', () => {
    const { container } = render(<ScoreboardLayout />)
    expect(container.querySelectorAll('button').length).toBe(0)
    expect(container.querySelectorAll('input').length).toBe(0)
    expect(container.querySelectorAll('select').length).toBe(0)
    expect(container.querySelectorAll('form').length).toBe(0)
  })

  it('renders both team sections', () => {
    render(<ScoreboardLayout />)
    expect(screen.getByLabelText(/home team/i)).toBeTruthy()
    expect(screen.getByLabelText(/away team/i)).toBeTruthy()
  })
})
