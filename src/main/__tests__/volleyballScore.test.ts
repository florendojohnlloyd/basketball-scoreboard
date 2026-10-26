import { describe, it, expect } from 'vitest'
import { gameReducer } from '../gameStore'
import { DEFAULT_GAME_STATE } from '../../shared/types'

describe('Volleyball scoring verification', () => {
  it('adds exactly 1 point to player and team score in volleyball', () => {
    let state = DEFAULT_GAME_STATE()
    state = gameReducer(state, { type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })

    const testPlayer = {
      id: 'vbp-1', number: '7', name: 'Jaloy Spiker',
      fouls: 0, points: 0, rebounds: 0, assists: 0,
      active: true, fouledOut: false,
      steals: 0, blocks: 0, fga: 0, fgm: 0,
      minutesPlayed: 0, substitutions: [],
      photoPath: null
    }
    state = gameReducer(state, { type: 'ADD_PLAYER', team: 'home', player: testPlayer })

    // Add 1 player point
    state = gameReducer(state, { type: 'ADD_PLAYER_POINTS', team: 'home', playerId: 'vbp-1', points: 1 })

    const p = state.home.players.find(x => x.id === 'vbp-1')
    expect(p?.points).toBe(1)
    expect(state.home.score).toBe(1)
    expect(state.volleyball?.pointsCurrentSet.home).toBe(1)

    // Add another point
    state = gameReducer(state, { type: 'ADD_PLAYER_POINTS', team: 'home', playerId: 'vbp-1', points: 1 })
    const p2 = state.home.players.find(x => x.id === 'vbp-1')
    expect(p2?.points).toBe(2)
    expect(state.home.score).toBe(2)
    expect(state.volleyball?.pointsCurrentSet.home).toBe(2)

    // Minus point
    state = gameReducer(state, { type: 'SUBTRACT_PLAYER_STAT', team: 'home', playerId: 'vbp-1', stat: 'points' })
    state = gameReducer(state, { type: 'SUBTRACT_VB_POINT', team: 'home' })
    const p3 = state.home.players.find(x => x.id === 'vbp-1')
    expect(p3?.points).toBe(1)
    expect(state.home.score).toBe(1)
    expect(state.volleyball?.pointsCurrentSet.home).toBe(1)
  })
})
