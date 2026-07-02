/**
 * Unit tests for gameReducer and createGameStore.
 * Covers all 22 command variants with example-based tests.
 */
import { describe, it, expect } from 'vitest'
import { gameReducer, createGameStore } from '../gameStore'
import { DEFAULT_GAME_STATE } from '../../shared/types'
import type { GameState, CommandType } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fresh(): GameState {
  return DEFAULT_GAME_STATE()
}

// ---------------------------------------------------------------------------
// ADD_SCORE / SUBTRACT_SCORE
// ---------------------------------------------------------------------------
describe('ADD_SCORE', () => {
  it('adds 1 point to home', () => {
    const s = gameReducer(fresh(), { type: 'ADD_SCORE', team: 'home', points: 1 })
    expect(s.home.score).toBe(1)
    expect(s.away.score).toBe(0)
  })

  it('adds 2 points to away', () => {
    const s = gameReducer(fresh(), { type: 'ADD_SCORE', team: 'away', points: 2 })
    expect(s.away.score).toBe(2)
  })

  it('adds 3 points', () => {
    const s = gameReducer(fresh(), { type: 'ADD_SCORE', team: 'home', points: 3 })
    expect(s.home.score).toBe(3)
  })
})

describe('SUBTRACT_SCORE', () => {
  it('decrements score by 1', () => {
    let s = gameReducer(fresh(), { type: 'ADD_SCORE', team: 'home', points: 3 })
    s = gameReducer(s, { type: 'SUBTRACT_SCORE', team: 'home' })
    expect(s.home.score).toBe(2)
  })

  it('floors at 0 when score is already 0', () => {
    const s = gameReducer(fresh(), { type: 'SUBTRACT_SCORE', team: 'home' })
    expect(s.home.score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// START/STOP/RESET_GAME_CLOCK
// ---------------------------------------------------------------------------
describe('Game clock toggle', () => {
  it('START_GAME_CLOCK sets running to true', () => {
    const s = gameReducer(fresh(), { type: 'START_GAME_CLOCK' })
    expect(s.gameClock.running).toBe(true)
  })

  it('STOP_GAME_CLOCK sets running to false', () => {
    let s = gameReducer(fresh(), { type: 'START_GAME_CLOCK' })
    s = gameReducer(s, { type: 'STOP_GAME_CLOCK' })
    expect(s.gameClock.running).toBe(false)
  })

  it('RESET_GAME_CLOCK resets displayMs and stops clock', () => {
    let s = gameReducer(fresh(), { type: 'START_GAME_CLOCK' })
    // Simulate some ticks
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 5000 })
    s = gameReducer(s, { type: 'RESET_GAME_CLOCK' })
    expect(s.gameClock.running).toBe(false)
    expect(s.gameClock.displayMs).toBe(s.gameClock.configuredDurationMs)
  })
})

// ---------------------------------------------------------------------------
// SET_GAME_CLOCK
// ---------------------------------------------------------------------------
describe('SET_GAME_CLOCK', () => {
  it('accepts valid seconds 0–3600', () => {
    const s = gameReducer(fresh(), { type: 'SET_GAME_CLOCK', seconds: 300 })
    expect(s.gameClock.displayMs).toBe(300_000)
  })

  it('accepts boundary value 0', () => {
    const s = gameReducer(fresh(), { type: 'SET_GAME_CLOCK', seconds: 0 })
    expect(s.gameClock.displayMs).toBe(0)
  })

  it('accepts boundary value 3600', () => {
    const s = gameReducer(fresh(), { type: 'SET_GAME_CLOCK', seconds: 3600 })
    expect(s.gameClock.displayMs).toBe(3_600_000)
  })

  it('rejects negative seconds — state unchanged', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: -1 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })

  it('rejects seconds > 3600 — state unchanged', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: 3601 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })

  it('rejects non-integer seconds — state unchanged', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: 5.5 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })
})

// ---------------------------------------------------------------------------
// Shot Clock
// ---------------------------------------------------------------------------
describe('Shot clock commands', () => {
  it('START_SHOT_CLOCK sets running to true', () => {
    const s = gameReducer(fresh(), { type: 'START_SHOT_CLOCK' })
    expect(s.shotClock.running).toBe(true)
  })

  it('STOP_SHOT_CLOCK sets running to false', () => {
    let s = gameReducer(fresh(), { type: 'START_SHOT_CLOCK' })
    s = gameReducer(s, { type: 'STOP_SHOT_CLOCK' })
    expect(s.shotClock.running).toBe(false)
  })

  it('RESET_SHOT_CLOCK resets to configuredDurationSeconds * 1000 and stops', () => {
    let s = gameReducer(fresh(), { type: 'START_SHOT_CLOCK' })
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 3000 })
    s = gameReducer(s, { type: 'RESET_SHOT_CLOCK' })
    expect(s.shotClock.running).toBe(false)
    expect(s.shotClock.displayMs).toBe(s.shotClock.configuredDurationSeconds * 1000)
  })

  it('SET_SHOT_CLOCK_ENABLED disables shot clock and stops it', () => {
    let s = gameReducer(fresh(), { type: 'START_SHOT_CLOCK' })
    s = gameReducer(s, { type: 'SET_SHOT_CLOCK_ENABLED', enabled: false })
    expect(s.shotClock.enabled).toBe(false)
    expect(s.shotClock.running).toBe(false)
  })

  it('SET_SHOT_CLOCK_ENABLED enables shot clock', () => {
    let s = gameReducer(fresh(), { type: 'SET_SHOT_CLOCK_ENABLED', enabled: false })
    s = gameReducer(s, { type: 'SET_SHOT_CLOCK_ENABLED', enabled: true })
    expect(s.shotClock.enabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CLOCK_TICK
// ---------------------------------------------------------------------------
describe('CLOCK_TICK', () => {
  it('decrements running game clock', () => {
    let s = gameReducer(fresh(), { type: 'START_GAME_CLOCK' })
    const before = s.gameClock.displayMs
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 100 })
    expect(s.gameClock.displayMs).toBe(before - 100)
  })

  it('does not decrement stopped game clock', () => {
    const s0 = fresh() // not running
    const s1 = gameReducer(s0, { type: 'CLOCK_TICK', deltaMs: 100 })
    expect(s1.gameClock.displayMs).toBe(s0.gameClock.displayMs)
  })

  it('clamps game clock at 0 and stops it', () => {
    let s = gameReducer(fresh(), { type: 'SET_GAME_CLOCK', seconds: 0 })
    s = gameReducer(s, { type: 'START_GAME_CLOCK' })
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 500 })
    expect(s.gameClock.displayMs).toBe(0)
    expect(s.gameClock.running).toBe(false)
  })

  it('stops game clock exactly at 0 when tick matches remaining time', () => {
    let s = gameReducer(fresh(), { type: 'SET_GAME_CLOCK', seconds: 1 })
    s = gameReducer(s, { type: 'START_GAME_CLOCK' })
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 1000 })
    expect(s.gameClock.displayMs).toBe(0)
    expect(s.gameClock.running).toBe(false)
  })

  it('decrements running shot clock independently', () => {
    let s = gameReducer(fresh(), { type: 'START_SHOT_CLOCK' })
    const before = s.shotClock.displayMs
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 200 })
    expect(s.shotClock.displayMs).toBe(before - 200)
  })

  it('clamps shot clock at 0 and stops it', () => {
    let s = gameReducer(fresh(), { type: 'RESET_SHOT_CLOCK' })
    // Set shot clock displayMs manually via state patch (for test isolation)
    s = { ...s, shotClock: { ...s.shotClock, displayMs: 100, running: true } }
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 500 })
    expect(s.shotClock.displayMs).toBe(0)
    expect(s.shotClock.running).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ADD_FOUL / SUBTRACT_FOUL
// ---------------------------------------------------------------------------
describe('Foul commands', () => {
  it('ADD_FOUL increments foul count', () => {
    const s = gameReducer(fresh(), { type: 'ADD_FOUL', team: 'home' })
    expect(s.home.fouls).toBe(1)
  })

  it('SUBTRACT_FOUL decrements foul count', () => {
    let s = gameReducer(fresh(), { type: 'ADD_FOUL', team: 'away' })
    s = gameReducer(s, { type: 'SUBTRACT_FOUL', team: 'away' })
    expect(s.away.fouls).toBe(0)
  })

  it('SUBTRACT_FOUL floors at 0', () => {
    const s = gameReducer(fresh(), { type: 'SUBTRACT_FOUL', team: 'home' })
    expect(s.home.fouls).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// USE_TIMEOUT / RESTORE_TIMEOUT
// ---------------------------------------------------------------------------
describe('Timeout commands', () => {
  it('USE_TIMEOUT decrements full timeout', () => {
    const base = fresh()
    const before = base.home.timeouts.fullRemaining
    const s = gameReducer(base, { type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
    expect(s.home.timeouts.fullRemaining).toBe(before - 1)
  })

  it('USE_TIMEOUT floors at 0', () => {
    let s = fresh()
    // Drain all full timeouts
    const max = s.gameConfig.fullTimeoutsPerTeam
    for (let i = 0; i < max + 2; i++) {
      s = gameReducer(s, { type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
    }
    expect(s.home.timeouts.fullRemaining).toBe(0)
  })

  it('RESTORE_TIMEOUT increments full timeout', () => {
    let s = gameReducer(fresh(), { type: 'USE_TIMEOUT', team: 'away', kind: 'full' })
    const before = s.away.timeouts.fullRemaining
    s = gameReducer(s, { type: 'RESTORE_TIMEOUT', team: 'away', kind: 'full' })
    expect(s.away.timeouts.fullRemaining).toBe(before + 1)
  })

  it('RESTORE_TIMEOUT clamps at configured maximum', () => {
    let s = fresh()
    const max = s.gameConfig.fullTimeoutsPerTeam
    for (let i = 0; i < max + 2; i++) {
      s = gameReducer(s, { type: 'RESTORE_TIMEOUT', team: 'home', kind: 'full' })
    }
    expect(s.home.timeouts.fullRemaining).toBe(max)
  })

  it('USE_TIMEOUT and RESTORE_TIMEOUT work for twenty-second kind', () => {
    let s = gameReducer(fresh(), { type: 'USE_TIMEOUT', team: 'home', kind: 'twenty' })
    expect(s.home.timeouts.twentyRemaining).toBe(0) // NBA_RULES has 1 twenty-sec timeout
    s = gameReducer(s, { type: 'RESTORE_TIMEOUT', team: 'home', kind: 'twenty' })
    expect(s.home.timeouts.twentyRemaining).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// ADVANCE_PERIOD
// ---------------------------------------------------------------------------
describe('ADVANCE_PERIOD', () => {
  it('increments period counter', () => {
    const s = gameReducer(fresh(), { type: 'ADVANCE_PERIOD' })
    expect(s.period.current).toBe(2)
  })

  it('stops and resets game clock', () => {
    let s = gameReducer(fresh(), { type: 'START_GAME_CLOCK' })
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 5000 })
    s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    expect(s.gameClock.running).toBe(false)
    expect(s.gameClock.displayMs).toBe(s.gameClock.configuredDurationMs)
  })

  it('resets both teams foul counts to 0', () => {
    let s = gameReducer(fresh(), { type: 'ADD_FOUL', team: 'home' })
    s = gameReducer(s, { type: 'ADD_FOUL', team: 'away' })
    s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    expect(s.home.fouls).toBe(0)
    expect(s.away.fouls).toBe(0)
  })

  it('enters overtime when advancing past max regulation period', () => {
    // NBA_RULES has periodCount: 4 — advance 4 times
    let s = fresh()
    for (let i = 0; i < 4; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }
    expect(s.period.isOvertime).toBe(true)
    expect(s.period.overtimeNumber).toBe(1)
  })

  it('sets OT clock duration to overtimeDurationMinutes', () => {
    let s = fresh() // periodCount: 4
    for (let i = 0; i < 4; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }
    const expectedMs = s.gameConfig.overtimeDurationMinutes * 60 * 1000
    expect(s.gameClock.configuredDurationMs).toBe(expectedMs)
    expect(s.gameClock.displayMs).toBe(expectedMs)
  })

  it('increments overtimeNumber on successive OT periods', () => {
    let s = fresh()
    for (let i = 0; i < 5; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }
    expect(s.period.isOvertime).toBe(true)
    expect(s.period.overtimeNumber).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// SET_TEAM_CONFIG
// ---------------------------------------------------------------------------
describe('SET_TEAM_CONFIG', () => {
  it('merges partial config into home team', () => {
    const s = gameReducer(fresh(), {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { name: 'Lakers' },
    })
    expect(s.home.config.name).toBe('Lakers')
    expect(s.home.config.color).toBe('#1D428A') // unchanged
  })

  it('merges partial config into away team', () => {
    const s = gameReducer(fresh(), {
      type: 'SET_TEAM_CONFIG',
      team: 'away',
      config: { color: '#FF0000', logoPath: '/img/logo.png' },
    })
    expect(s.away.config.color).toBe('#FF0000')
    expect(s.away.config.logoPath).toBe('/img/logo.png')
    expect(s.away.config.name).toBe('Away') // unchanged
  })
})

// ---------------------------------------------------------------------------
// LOAD_PRESET
// ---------------------------------------------------------------------------
describe('LOAD_PRESET', () => {
  it('replaces gameConfig with preset values', () => {
    const preset = {
      periodDurationMinutes: 10,
      periodCount: 4 as const,
      overtimeDurationMinutes: 5,
      shotClockDurationSeconds: 24,
      bonusThreshold: 4,
      fullTimeoutsPerTeam: 5,
      twentySecTimeoutsPerTeam: 0,
    }
    const s = gameReducer(fresh(), { type: 'LOAD_PRESET', preset })
    expect(s.gameConfig).toEqual(preset)
  })

  it('updates game clock to new period duration', () => {
    const preset = {
      periodDurationMinutes: 10,
      periodCount: 4 as const,
      overtimeDurationMinutes: 5,
      shotClockDurationSeconds: 24,
      bonusThreshold: 4,
      fullTimeoutsPerTeam: 5,
      twentySecTimeoutsPerTeam: 0,
    }
    const s = gameReducer(fresh(), { type: 'LOAD_PRESET', preset })
    expect(s.gameClock.configuredDurationMs).toBe(10 * 60 * 1000)
    expect(s.gameClock.displayMs).toBe(10 * 60 * 1000)
  })

  it('preserves team names when loading preset', () => {
    let s = gameReducer(fresh(), {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { name: 'Warriors' },
    })
    const preset = {
      periodDurationMinutes: 12,
      periodCount: 4 as const,
      overtimeDurationMinutes: 5,
      shotClockDurationSeconds: 24,
      bonusThreshold: 5,
      fullTimeoutsPerTeam: 7,
      twentySecTimeoutsPerTeam: 1,
    }
    s = gameReducer(s, { type: 'LOAD_PRESET', preset })
    expect(s.home.config.name).toBe('Warriors')
  })
})

// ---------------------------------------------------------------------------
// NEW_GAME
// ---------------------------------------------------------------------------
describe('NEW_GAME', () => {
  it('resets scores to 0', () => {
    let s = gameReducer(fresh(), { type: 'ADD_SCORE', team: 'home', points: 3 })
    s = gameReducer(s, { type: 'ADD_SCORE', team: 'away', points: 2 })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: false })
    expect(s.home.score).toBe(0)
    expect(s.away.score).toBe(0)
  })

  it('resets fouls to 0', () => {
    let s = gameReducer(fresh(), { type: 'ADD_FOUL', team: 'home' })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: false })
    expect(s.home.fouls).toBe(0)
  })

  it('resets period to 1 and clears overtime', () => {
    let s = fresh()
    for (let i = 0; i < 4; i++) s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: false })
    expect(s.period.current).toBe(1)
    expect(s.period.isOvertime).toBe(false)
    expect(s.period.overtimeNumber).toBe(0)
  })

  it('resets timeouts to configured maxima', () => {
    let s = gameReducer(fresh(), { type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: false })
    expect(s.home.timeouts.fullRemaining).toBe(s.gameConfig.fullTimeoutsPerTeam)
  })

  it('resets game clock to configured duration and stops it', () => {
    let s = gameReducer(fresh(), { type: 'START_GAME_CLOCK' })
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 5000 })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: false })
    expect(s.gameClock.running).toBe(false)
    expect(s.gameClock.displayMs).toBe(s.gameClock.configuredDurationMs)
  })

  it('preserves team names when clearTeams is false', () => {
    let s = gameReducer(fresh(), {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { name: 'Heat' },
    })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: false })
    expect(s.home.config.name).toBe('Heat')
  })

  it('preserves team names even when clearTeams is true (only clears logo)', () => {
    let s = gameReducer(fresh(), {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { name: 'Heat', logoPath: '/logo.png' },
    })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: true })
    // Names and colors are preserved; only logoPath is reset
    expect(s.home.config.name).toBe('Heat')
    expect(s.home.config.logoPath).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SET_VOLUME
// ---------------------------------------------------------------------------
describe('SET_VOLUME', () => {
  it('sets volume to valid level', () => {
    const s = gameReducer(fresh(), { type: 'SET_VOLUME', level: 0.5 })
    expect(s.volume).toBe(0.5)
  })

  it('accepts boundary values 0.0 and 1.0', () => {
    let s = gameReducer(fresh(), { type: 'SET_VOLUME', level: 0.0 })
    expect(s.volume).toBe(0.0)
    s = gameReducer(s, { type: 'SET_VOLUME', level: 1.0 })
    expect(s.volume).toBe(1.0)
  })

  it('rejects volume < 0.0 — state unchanged', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_VOLUME', level: -0.1 })
    expect(s.volume).toBe(base.volume)
  })

  it('rejects volume > 1.0 — state unchanged', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_VOLUME', level: 1.1 })
    expect(s.volume).toBe(base.volume)
  })
})

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------
describe('Reducer immutability', () => {
  it('does not mutate the input state', () => {
    const base = fresh()
    const frozen = Object.freeze({ ...base, home: Object.freeze({ ...base.home }) })
    // This should not throw even though the input is frozen
    expect(() =>
      gameReducer(frozen as GameState, { type: 'ADD_SCORE', team: 'home', points: 1 })
    ).not.toThrow()
  })

  it('returns a new object reference after every mutation', () => {
    const base = fresh()
    const next = gameReducer(base, { type: 'ADD_SCORE', team: 'home', points: 1 })
    expect(next).not.toBe(base)
  })
})

// ---------------------------------------------------------------------------
// createGameStore factory
// ---------------------------------------------------------------------------
describe('createGameStore', () => {
  it('initialises with DEFAULT_GAME_STATE when no argument given', () => {
    const store = createGameStore()
    expect(store.getState()).toEqual(DEFAULT_GAME_STATE())
  })

  it('dispatch updates and returns new state', () => {
    const store = createGameStore()
    const next = store.dispatch({ type: 'ADD_SCORE', team: 'home', points: 2 })
    expect(next.home.score).toBe(2)
    expect(store.getState().home.score).toBe(2)
  })

  it('getState returns the current state after multiple dispatches', () => {
    const store = createGameStore()
    store.dispatch({ type: 'ADD_SCORE', team: 'home', points: 1 })
    store.dispatch({ type: 'ADD_SCORE', team: 'home', points: 1 })
    expect(store.getState().home.score).toBe(2)
  })

  it('accepts a custom initial state', () => {
    const custom = DEFAULT_GAME_STATE()
    custom.volume = 0.3
    const store = createGameStore(custom)
    expect(store.getState().volume).toBe(0.3)
  })
})
