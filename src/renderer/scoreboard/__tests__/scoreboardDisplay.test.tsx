// @vitest-environment jsdom
/**
 * Scoreboard Display — example-based unit tests (Task 37)
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { DEFAULT_GAME_STATE, makeDefaultPlayer } from '@shared/types'
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

  it('applies the team color as a CSS custom property', () => {
    set({ home: { ...DEFAULT_GAME_STATE().home, config: { ...DEFAULT_GAME_STATE().home.config, name: 'Lakers', color: '#552583', logoPath: null } } })
    const { container } = render(<TeamSection team="home" />)
    const section = container.querySelector('section.ts') as HTMLElement
    expect(section).not.toBeNull()
    expect(section.style.getPropertyValue('--tc')).toBe('#552583')
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
// TeamSection — jersey number display (Requirement 15)
// ===========================================================================

describe('TeamSection — jersey numbers', () => {
  beforeEach(() => store.setState({ gameState: DEFAULT_GAME_STATE() }))

  it('renders jersey number when player has a non-empty number', () => {
    const player = { ...makeDefaultPlayer(), id: 'p1', name: 'Jordan', number: '23', active: true, points: 30 }
    set({ home: { ...DEFAULT_GAME_STATE().home, players: [player] } })
    render(<TeamSection team="home" />)
    // The jersey number span should contain '23'
    const numEl = document.querySelector('.ts__player-num')
    expect(numEl).not.toBeNull()
    expect(numEl!.textContent).toBe('23')
  })

  it('renders empty string (no visible number) when jerseyNumber is null — layout unchanged', () => {
    // Player.number is a string field; null is represented as '' in the Player type
    // We test both an explicit empty string and simulate null-like value
    const playerWithNull = { ...makeDefaultPlayer(), id: 'p2', name: 'LeBron', number: '', active: true, points: 10 }
    const playerWithNumber = { ...makeDefaultPlayer(), id: 'p3', name: 'Kobe', number: '24', active: true, points: 20 }
    set({ home: { ...DEFAULT_GAME_STATE().home, players: [playerWithNull, playerWithNumber] } })
    const { container } = render(<TeamSection team="home" />)

    const rows = container.querySelectorAll('.ts__player-row')
    // Both players are active so both rows should appear
    expect(rows.length).toBe(2)

    const numEls = container.querySelectorAll('.ts__player-num')
    // First player: empty number renders as empty string
    expect(numEls[0].textContent).toBe('')
    // Second player: number renders normally
    expect(numEls[1].textContent).toBe('24')

    // Layout: both rows exist and both still have a .ts__player-name element
    const nameEls = container.querySelectorAll('.ts__player-name')
    expect(nameEls.length).toBe(2)
    expect(nameEls[0].textContent).toBe('LeBron')
    expect(nameEls[1].textContent).toBe('Kobe')
  })

  it('renders player row with name and points alongside jersey number', () => {
    const player = { ...makeDefaultPlayer(), id: 'p4', name: 'Magic', number: '32', active: true, points: 15 }
    set({ home: { ...DEFAULT_GAME_STATE().home, players: [player] } })
    const { container } = render(<TeamSection team="home" />)

    expect(container.querySelector('.ts__player-num')?.textContent).toBe('32')
    expect(container.querySelector('.ts__player-name')?.textContent).toBe('Magic')
    expect(container.querySelector('.ts__player-pts')?.textContent).toBe('15')
  })

  it('does not render player list section when no players are active', () => {
    const inactivePlayer = { ...makeDefaultPlayer(), id: 'p5', name: 'Bench', number: '99', active: false }
    set({ home: { ...DEFAULT_GAME_STATE().home, players: [inactivePlayer] } })
    const { container } = render(<TeamSection team="home" />)
    // Player list section should not be rendered
    expect(container.querySelector('.ts__player-list')).toBeNull()
  })

  it('only shows active players in the list', () => {
    const active   = { ...makeDefaultPlayer(), id: 'pa', name: 'Active',   number: '1',  active: true  }
    const inactive = { ...makeDefaultPlayer(), id: 'pi', name: 'Inactive', number: '99', active: false }
    set({ home: { ...DEFAULT_GAME_STATE().home, players: [active, inactive] } })
    const { container } = render(<TeamSection team="home" />)
    const rows = container.querySelectorAll('.ts__player-row')
    expect(rows.length).toBe(1)
    expect(container.querySelector('.ts__player-name')?.textContent).toBe('Active')
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

  it('renders both teams', () => {
    // DEFAULT_GAME_STATE starts in the pre-game phase, which renders the
    // matchup screen showing both team names.
    render(<ScoreboardLayout />)
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('Away')).toBeTruthy()
  })
})
