// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import * as fc from 'fast-check'
import { formatClockDisplay } from '../../shared/clockUtils'

vi.mock('../store', async () => {
  const { create } = await import('zustand')
  const { DEFAULT_GAME_STATE } = await import('@shared/types')
  type GS = ReturnType<typeof DEFAULT_GAME_STATE>
  const store = create<{ gameState: GS }>(() => ({ gameState: DEFAULT_GAME_STATE() }))
  const send = vi.fn()
  return { useControlPanelStore: store, sendCommand: (c: unknown) => send('scoreboard:command', c), __testStore: store, __mockSend: send }
})

import GameClockControl from '../components/GameClockControl'
import { DEFAULT_GAME_STATE } from '@shared/types'
import type { GameState } from '@shared/types'

type Store = { setState(u: ((s: { gameState: GameState }) => unknown) | { gameState: GameState }): void }
let store: Store, send: ReturnType<typeof vi.fn>

beforeAll(async () => {
  const m = await import('../store') as unknown as { __testStore: Store; __mockSend: ReturnType<typeof vi.fn> }
  store = m.__testStore; send = m.__mockSend
})

const setClock = (displayMs: number, running: boolean) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, gameClock: { ...s.gameState.gameClock, displayMs, running } } }))

// ---------------------------------------------------------------------------
// formatClockDisplay
// ---------------------------------------------------------------------------

describe('formatClockDisplay', () => {
  it('formats 0 as "00:00"', () => expect(formatClockDisplay(0)).toBe('00:00'))
  it('formats 60000 as "01:00"', () => expect(formatClockDisplay(60_000)).toBe('01:00'))
  it('formats 9000 as "00:09" (zero-pads seconds)', () => expect(formatClockDisplay(9_000)).toBe('00:09'))
  it('clamps negative input to "00:00"', () => expect(formatClockDisplay(-5_000)).toBe('00:00'))

  it('always produces MM:SS pattern', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 3_600_000 }), (ms) => {
      const r = formatClockDisplay(ms)
      expect(r).toMatch(/^\d+:\d{2}$/)
      const s = parseInt(r.split(':')[1], 10)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(59)
    }))
  })
})

// ---------------------------------------------------------------------------
// GameClockControl
// ---------------------------------------------------------------------------

describe('GameClockControl', () => {
  beforeEach(() => { send.mockClear(); store.setState({ gameState: DEFAULT_GAME_STATE() }) })

  it('renders clock in MM:SS format', () => {
    setClock(12 * 60 * 1000, false)
    render(<GameClockControl />)
    expect(screen.getByText('12:00')).toBeTruthy()
  })

  it('applies urgent style when displayMs < 10000', () => {
    setClock(9_999, false)
    render(<GameClockControl />)
    expect(screen.getByRole('timer').className).toContain('urgent')
  })

  it('does not apply urgent style when displayMs >= 10000', () => {
    setClock(10_000, false)
    render(<GameClockControl />)
    expect(screen.getByRole('timer').className).not.toContain('urgent')
  })

  it('disables Start when running', () => {
    setClock(300_000, true)
    render(<GameClockControl />)
    expect((screen.getByRole('button', { name: /start game clock/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables Stop when stopped', () => {
    setClock(300_000, false)
    render(<GameClockControl />)
    expect((screen.getByRole('button', { name: /stop game clock/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('dispatches START_GAME_CLOCK', async () => {
    setClock(300_000, false)
    render(<GameClockControl />)
    await userEvent.click(screen.getByRole('button', { name: /start game clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'START_GAME_CLOCK' })
  })

  it('dispatches STOP_GAME_CLOCK', async () => {
    setClock(300_000, true)
    render(<GameClockControl />)
    await userEvent.click(screen.getByRole('button', { name: /stop game clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'STOP_GAME_CLOCK' })
  })

  it('dispatches RESET_GAME_CLOCK', async () => {
    setClock(300_000, false)
    render(<GameClockControl />)
    await userEvent.click(screen.getByRole('button', { name: /reset game clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'RESET_GAME_CLOCK' })
  })

  it('dispatches SET_GAME_CLOCK with correct seconds for "12:30"', async () => {
    setClock(300_000, false)
    render(<GameClockControl />)
    const input = screen.getByRole('textbox', { name: /set game clock time/i })
    await userEvent.clear(input); await userEvent.type(input, '12:30')
    await userEvent.click(screen.getByRole('button', { name: /apply clock time/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'SET_GAME_CLOCK', seconds: 750 })
  })

  it('shows validation error for "99:99" and does not dispatch', async () => {
    setClock(300_000, false)
    render(<GameClockControl />)
    const input = screen.getByRole('textbox', { name: /set game clock time/i })
    await userEvent.clear(input); await userEvent.type(input, '99:99')
    await userEvent.click(screen.getByRole('button', { name: /apply clock time/i }))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(send).not.toHaveBeenCalled()
  })

  it('disables time entry input when clock is running', () => {
    setClock(300_000, true)
    render(<GameClockControl />)
    expect((screen.getByRole('textbox', { name: /set game clock time/i }) as HTMLInputElement).disabled).toBe(true)
  })
})
