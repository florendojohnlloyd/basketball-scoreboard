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

import FoulPanel from '../components/FoulPanel'
import { DEFAULT_GAME_STATE } from '@shared/types'
import type { GameState } from '@shared/types'

type Store = { setState(u: ((s: { gameState: GameState }) => unknown) | { gameState: GameState }): void }
let store: Store, send: ReturnType<typeof vi.fn>

beforeAll(async () => {
  const m = await import('../store') as unknown as { __testStore: Store; __mockSend: ReturnType<typeof vi.fn> }
  store = m.__testStore; send = m.__mockSend
})

const setFouls = (team: 'home' | 'away', fouls: number) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, [team]: { ...s.gameState[team], fouls } } }))

const setThreshold = (t: number) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, gameConfig: { ...s.gameState.gameConfig, bonusThreshold: t } } }))

describe('FoulPanel', () => {
  beforeEach(() => { send.mockClear(); store.setState({ gameState: DEFAULT_GAME_STATE() }) })

  it('disables − when fouls === 0', () => {
    setFouls('home', 0)
    render(<FoulPanel team="home" />)
    expect((screen.getByRole('button', { name: /subtract foul from home/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables − when fouls > 0', () => {
    setFouls('home', 2)
    render(<FoulPanel team="home" />)
    expect((screen.getByRole('button', { name: /subtract foul from home/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows BONUS badge when fouls >= bonusThreshold', () => {
    setFouls('home', 5); setThreshold(5)
    render(<FoulPanel team="home" />)
    expect(screen.getByText('BONUS')).toBeTruthy()
  })

  it('hides BONUS badge when fouls < bonusThreshold', () => {
    setFouls('home', 2); setThreshold(5)
    render(<FoulPanel team="home" />)
    expect(screen.queryByText('BONUS')).toBeNull()
  })

  it('dispatches ADD_FOUL', async () => {
    render(<FoulPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /add foul to home/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'ADD_FOUL', team: 'home' })
  })

  it('dispatches SUBTRACT_FOUL when fouls > 0', async () => {
    setFouls('home', 3)
    render(<FoulPanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /subtract foul from home/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'SUBTRACT_FOUL', team: 'home' })
  })

  it('dispatches LOAD_PRESET on valid threshold change', () => {
    render(<FoulPanel team="home" />)
    fireEvent.change(screen.getByRole('spinbutton', { name: /bonus threshold for home/i }), { target: { value: '3' } })
    expect(send).toHaveBeenCalledWith('scoreboard:command', expect.objectContaining({ type: 'LOAD_PRESET', preset: expect.objectContaining({ bonusThreshold: 3 }) }))
  })

  it('shows error and does not dispatch for threshold = 0', () => {
    render(<FoulPanel team="home" />)
    fireEvent.change(screen.getByRole('spinbutton', { name: /bonus threshold for home/i }), { target: { value: '0' } })
    expect(screen.getByRole('alert').textContent).toMatch(/between 1 and 10/i)
    expect(send).not.toHaveBeenCalled()
  })

  it('shows error and does not dispatch for threshold = 11', () => {
    render(<FoulPanel team="home" />)
    fireEvent.change(screen.getByRole('spinbutton', { name: /bonus threshold for home/i }), { target: { value: '11' } })
    expect(screen.getByRole('alert').textContent).toMatch(/between 1 and 10/i)
    expect(send).not.toHaveBeenCalled()
  })
})
