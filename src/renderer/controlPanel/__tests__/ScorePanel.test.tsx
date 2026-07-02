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

import ScorePanel from '../components/ScorePanel'
import { DEFAULT_GAME_STATE } from '@shared/types'
import type { GameState } from '@shared/types'

type Store = { setState(u: ((s: { gameState: GameState }) => unknown) | { gameState: GameState }): void }
let store: Store, send: ReturnType<typeof vi.fn>

beforeAll(async () => {
  const m = await import('../store') as unknown as { __testStore: Store; __mockSend: ReturnType<typeof vi.fn> }
  store = m.__testStore; send = m.__mockSend
})

const setScore = (team: 'home' | 'away', score: number) =>
  store.setState((s: { gameState: GameState }) => ({ gameState: { ...s.gameState, [team]: { ...s.gameState[team], score } } }))

describe('ScorePanel', () => {
  beforeEach(() => { send.mockClear(); store.setState({ gameState: DEFAULT_GAME_STATE() }) })

  it('renders team name', () => {
    render(<ScorePanel team="home" />)
    expect(screen.getByText('Home')).toBeTruthy()
  })

  it('disables -1 at score 0', () => {
    setScore('home', 0)
    render(<ScorePanel team="home" />)
    expect((screen.getByRole('button', { name: /subtract 1 point/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables -1 when score > 0', () => {
    setScore('home', 5)
    render(<ScorePanel team="home" />)
    expect((screen.getByRole('button', { name: /subtract 1 point/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('dispatches ADD_SCORE points=3 on +3 click', async () => {
    render(<ScorePanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /add 3 points/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'ADD_SCORE', team: 'home', points: 3 })
  })

  it('dispatches SUBTRACT_SCORE when score > 0', async () => {
    setScore('home', 3)
    render(<ScorePanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /subtract 1 point/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'SUBTRACT_SCORE', team: 'home' })
  })

  it('does not dispatch when -1 clicked at score 0', async () => {
    setScore('home', 0)
    render(<ScorePanel team="home" />)
    await userEvent.click(screen.getByRole('button', { name: /subtract 1 point/i }))
    expect(send).not.toHaveBeenCalled()
  })

  it('dispatches ADD_SCORE for away team', async () => {
    render(<ScorePanel team="away" />)
    await userEvent.click(screen.getByRole('button', { name: /add 3 points/i }))
    expect(send).toHaveBeenCalledWith('scoreboard:command', { type: 'ADD_SCORE', team: 'away', points: 3 })
  })
})
