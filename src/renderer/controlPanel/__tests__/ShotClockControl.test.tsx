// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

vi.mock('../store', async () => {
  const { create } = await import('zustand')
  const { DEFAULT_GAME_STATE } = await import('@shared/types')
  type GS = ReturnType<typeof DEFAULT_GAME_STATE>
  const store = create<{ gameState: GS }>(() => ({ gameState: DEFAULT_GAME_STATE() }))
  const send = vi.fn()
  return { useControlPanelStore: store, sendCommand: (c: unknown) => send('scoreboard:command', c), __testStore: store, __mockSend: send }
})

import ShotClockControl from '../components/ShotClockControl'
import { DEFAULT_GAME_STATE } from '@shared/types'
import type { GameState } from '@shared/types'

type Store = { setState(u: ((s: { gameState: GameState }) => unknown) | { gameState: GameState }): void }
let store: Store, send: ReturnType<typeof vi.fn>

beforeAll(async () => {
  const m = await import('../store') as unknown as { __testStore: Store; __mockSend: ReturnType<typeof vi.fn> }
  store = m.__testStore; send = m.__mockSend
})

const setSC = (patch: Partial<GameState['shotClock']>) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, shotClock: { ...s.gameState.shotClock, ...patch } } }))

describe('ShotClockControl', () => {
  beforeEach(() => { send.mockClear(); store.setState({ gameState: DEFAULT_GAME_STATE() }) })

  it('renders shot clock value as whole seconds (Math.ceil)', () => {
    setSC({ displayMs: 24000 })
    render(<ShotClockControl />)
    expect(screen.getByRole('timer').textContent).toBe('24')
  })

  it('renders 1 for displayMs=500 (ceil)', () => {
    setSC({ displayMs: 500 })
    render(<ShotClockControl />)
    expect(screen.getByRole('timer').textContent).toBe('1')
  })

  it('shows "Disabled" when shot clock is disabled', () => {
    setSC({ enabled: false })
    render(<ShotClockControl />)
    expect(screen.getAllByText('Disabled').length).toBeGreaterThanOrEqual(1)
  })

  it('dispatches SET_SHOT_CLOCK_ENABLED=false when toggled off', async () => {
    setSC({ enabled: true })
    render(<ShotClockControl />)
    await userEvent.click(screen.getByRole('checkbox', { name: /enable shot clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'SET_SHOT_CLOCK_ENABLED', enabled: false })
  })

  it('dispatches SET_SHOT_CLOCK_ENABLED=true when toggled on', async () => {
    setSC({ enabled: false })
    render(<ShotClockControl />)
    await userEvent.click(screen.getByRole('checkbox', { name: /enable shot clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'SET_SHOT_CLOCK_ENABLED', enabled: true })
  })

  it('dispatches LOAD_PRESET on valid duration entry', async () => {
    render(<ShotClockControl />)
    const input = screen.getByRole('spinbutton', { name: /shot clock duration in seconds/i })
    await userEvent.clear(input); await userEvent.type(input, '20')
    await userEvent.keyboard('{Enter}')
    expect(send).toHaveBeenCalledWith('scoreboard:command', expect.objectContaining({ type: 'LOAD_PRESET', preset: expect.objectContaining({ shotClockDurationSeconds: 20 }) }))
  })

  it('shows validation error and does not dispatch for duration below 14', async () => {
    render(<ShotClockControl />)
    const input = screen.getByRole('spinbutton', { name: /shot clock duration in seconds/i })
    await userEvent.clear(input); await userEvent.type(input, '13')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('alert').textContent).toMatch(/14.{1,5}30/i)
    expect(send).not.toHaveBeenCalled()
  })

  it('shows validation error and does not dispatch for duration above 30', async () => {
    render(<ShotClockControl />)
    const input = screen.getByRole('spinbutton', { name: /shot clock duration in seconds/i })
    await userEvent.clear(input); await userEvent.type(input, '31')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('alert').textContent).toMatch(/14.{1,5}30/i)
    expect(send).not.toHaveBeenCalled()
  })

  it('shows error for empty input', async () => {
    render(<ShotClockControl />)
    const input = screen.getByRole('spinbutton', { name: /shot clock duration in seconds/i })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(screen.getByRole('alert').textContent).toMatch(/whole number/i)
  })

  it('dispatches START_SHOT_CLOCK', async () => {
    setSC({ running: false, enabled: true })
    render(<ShotClockControl />)
    await userEvent.click(screen.getByRole('button', { name: /start shot clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'START_SHOT_CLOCK' })
  })

  it('dispatches STOP_SHOT_CLOCK', async () => {
    setSC({ running: true, enabled: true })
    render(<ShotClockControl />)
    await userEvent.click(screen.getByRole('button', { name: /stop shot clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'STOP_SHOT_CLOCK' })
  })

  it('dispatches RESET_SHOT_CLOCK', async () => {
    setSC({ running: false, enabled: true })
    render(<ShotClockControl />)
    await userEvent.click(screen.getByRole('button', { name: /reset shot clock/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'RESET_SHOT_CLOCK' })
  })
})
