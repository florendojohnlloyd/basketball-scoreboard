// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
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

import TimeoutPanel from '../components/TimeoutPanel'
import { DEFAULT_GAME_STATE } from '@shared/types'
import type { GameState } from '@shared/types'

type Store = { setState(u: ((s: { gameState: GameState }) => unknown) | { gameState: GameState }): void }
let store: Store, send: ReturnType<typeof vi.fn>

beforeAll(async () => {
  const m = await import('../store') as unknown as { __testStore: Store; __mockSend: ReturnType<typeof vi.fn> }
  store = m.__testStore; send = m.__mockSend
})

const setTimeouts = (team: 'home' | 'away', fullRemaining: number, twentyRemaining: number) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, [team]: { ...s.gameState[team], timeouts: { fullRemaining, twentyRemaining } } } }))

const setConfig = (full: number, twenty: number) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, gameConfig: { ...s.gameState.gameConfig, fullTimeoutsPerTeam: full, twentySecTimeoutsPerTeam: twenty } } }))

describe('TimeoutPanel', () => {
  beforeEach(() => { send.mockClear(); store.setState({ gameState: DEFAULT_GAME_STATE() }) })

  it('disables full decrement at 0', () => {
    setTimeouts('home', 0, 1)
    render(<TimeoutPanel team="home" />)
    expect((screen.getByRole('button', { name: /use full timeout for home/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables full decrement when > 0', () => {
    setTimeouts('home', 2, 1)
    render(<TimeoutPanel team="home" />)
    expect((screen.getByRole('button', { name: /use full timeout for home/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables full increment at configured max', () => {
    setConfig(7, 1); setTimeouts('home', 7, 1)
    render(<TimeoutPanel team="home" />)
    expect((screen.getByRole('button', { name: /restore full timeout for home/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables full increment below max', () => {
    setConfig(7, 1); setTimeouts('home', 5, 1)
    render(<TimeoutPanel team="home" />)
    expect((screen.getByRole('button', { name: /restore full timeout for home/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables 20s decrement at 0', () => {
    setTimeouts('home', 2, 0)
    render(<TimeoutPanel team="home" />)
    expect((screen.getByRole('button', { name: /use 20-second timeout for home/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables 20s increment at max', () => {
    setConfig(7, 2); setTimeouts('home', 3, 2)
    render(<TimeoutPanel team="home" />)
    expect((screen.getByRole('button', { name: /restore 20-second timeout for home/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('dispatches USE_TIMEOUT full', async () => {
    setTimeouts('home', 3, 1)
    render(<TimeoutPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /use full timeout for home/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
  })

  it('dispatches USE_TIMEOUT twenty', async () => {
    setTimeouts('home', 3, 1)
    render(<TimeoutPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /use 20-second timeout for home/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'USE_TIMEOUT', team: 'home', kind: 'twenty' })
  })

  it('dispatches RESTORE_TIMEOUT full', async () => {
    setConfig(7, 1); setTimeouts('home', 3, 1)
    render(<TimeoutPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /restore full timeout for home/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'RESTORE_TIMEOUT', team: 'home', kind: 'full' })
  })

  it('dispatches RESTORE_TIMEOUT twenty', async () => {
    setConfig(7, 2); setTimeouts('home', 3, 0)
    render(<TimeoutPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /restore 20-second timeout for home/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'RESTORE_TIMEOUT', team: 'home', kind: 'twenty' })
  })

  it('full and 20s timeouts are managed independently', async () => {
    setConfig(7, 2); setTimeouts('home', 3, 2)
    render(<TimeoutPanel team="home" />)
    // 20s restore is disabled (at max)
    expect((screen.getByRole('button', { name: /restore 20-second timeout for home/i }) as HTMLButtonElement).disabled).toBe(true)
    // Using a full timeout does not affect 20s
    await userEvent.click(screen.getByRole('button', { name: /use full timeout for home/i }))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
  })
})
