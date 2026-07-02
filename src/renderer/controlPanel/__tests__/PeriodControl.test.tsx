// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'

vi.mock('../store', async () => {
  const { create } = await import('zustand')
  const { DEFAULT_GAME_STATE } = await import('@shared/types')
  type GS = ReturnType<typeof DEFAULT_GAME_STATE>
  const store = create<{ gameState: GS }>(() => ({ gameState: DEFAULT_GAME_STATE() }))
  const send = vi.fn()
  return { useControlPanelStore: store, sendCommand: (c: unknown) => send('scoreboard:command', c), __testStore: store, __mockSend: send }
})

import PeriodControl from '../components/PeriodControl'
import { DEFAULT_GAME_STATE } from '@shared/types'
import type { GameState } from '@shared/types'

type Store = { setState(u: ((s: { gameState: GameState }) => unknown) | { gameState: GameState }): void }
let store: Store, send: ReturnType<typeof vi.fn>

beforeAll(async () => {
  const m = await import('../store') as unknown as { __testStore: Store; __mockSend: ReturnType<typeof vi.fn> }
  store = m.__testStore; send = m.__mockSend
})

const patch = (p: Partial<GameState>) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, ...p } }))

describe('PeriodControl', () => {
  beforeEach(() => { send.mockClear(); store.setState({ gameState: DEFAULT_GAME_STATE() }); vi.restoreAllMocks() })
  afterEach(() => vi.restoreAllMocks())

  it('renders Q1 of 4 by default', () => {
    render(<PeriodControl />)
    expect(screen.getByText(/Q1 of 4/i)).toBeTruthy()
  })

  it('renders OT labels', () => {
    patch({ period: { ...DEFAULT_GAME_STATE().period, isOvertime: true, overtimeNumber: 1 } })
    render(<PeriodControl />)
    expect(screen.getByText('OT')).toBeTruthy()
  })

  it('shows clock-running warning and does not dispatch', async () => {
    patch({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, running: true } })
    render(<PeriodControl />)
    await userEvent.click(screen.getByRole('button', { name: /advance to next period/i }))
    expect(screen.getByRole('alert').textContent).toMatch(/stop the clock before advancing/i)
    expect(send).not.toHaveBeenCalled()
  })

  it('dispatches ADVANCE_PERIOD when clock stopped, not final period', async () => {
    patch({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, running: false }, period: { ...DEFAULT_GAME_STATE().period, current: 1 } })
    render(<PeriodControl />)
    await userEvent.click(screen.getByRole('button', { name: /advance to next period/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'ADVANCE_PERIOD' })
  })

  it('shows confirmation at final period with unequal scores; dispatches on confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    patch({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, running: false }, period: { ...DEFAULT_GAME_STATE().period, current: 4 }, home: { ...DEFAULT_GAME_STATE().home, score: 20 }, away: { ...DEFAULT_GAME_STATE().away, score: 15 } })
    render(<PeriodControl />)
    await userEvent.click(screen.getByRole('button', { name: /advance to next period/i }))
    expect(window.confirm).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'ADVANCE_PERIOD' })
  })

  it('does not dispatch when final-period confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    patch({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, running: false }, period: { ...DEFAULT_GAME_STATE().period, current: 4 }, home: { ...DEFAULT_GAME_STATE().home, score: 20 }, away: { ...DEFAULT_GAME_STATE().away, score: 15 } })
    render(<PeriodControl />)
    await userEvent.click(screen.getByRole('button', { name: /advance to next period/i }))
    expect(send).not.toHaveBeenCalled()
  })

  it('shows OT dialog for tied scores at final period', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    patch({ gameClock: { ...DEFAULT_GAME_STATE().gameClock, running: false }, period: { ...DEFAULT_GAME_STATE().period, current: 4 }, home: { ...DEFAULT_GAME_STATE().home, score: 25 }, away: { ...DEFAULT_GAME_STATE().away, score: 25 } })
    render(<PeriodControl />)
    await userEvent.click(screen.getByRole('button', { name: /advance to next period/i }))
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/tied|overtime|OT/i))
  })

  it('renders format selector in pre-game only', () => {
    patch({ gamePhase: 'pre-game' })
    render(<PeriodControl />)
    expect(screen.getByRole('combobox', { name: /select game format/i })).toBeTruthy()

    store.setState({ gameState: DEFAULT_GAME_STATE() })
    patch({ gamePhase: 'in-game' })
    const { rerender } = render(<PeriodControl />)
    rerender(<PeriodControl />)
    expect(screen.queryByRole('combobox', { name: /select game format/i })).toBeNull()
  })

  it('dispatches LOAD_PRESET with periodCount=2 when Halves selected', async () => {
    patch({ gamePhase: 'pre-game' })
    render(<PeriodControl />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /select game format/i }), 'halves')
    expect(send).toHaveBeenCalledWith('scoreboard:command', expect.objectContaining({ type: 'LOAD_PRESET', preset: expect.objectContaining({ periodCount: 2 }) }))
  })
})
