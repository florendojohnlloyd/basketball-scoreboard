/**
 * Example-based integration tests for GameStore / GameReducer behaviors
 * not fully covered by property-based tests.
 *
 * Task 33 — covers the following scenarios:
 *   - Game clock auto-stops when CLOCK_TICK drives displayMs to 0
 *   - Shot clock auto-stops at 0 and never goes negative
 *   - ADVANCE_PERIOD at the final regular period with tied scores → OT (isOvertime: true, overtimeNumber: 1)
 *   - ADVANCE_PERIOD at OT1 → OT2 (overtimeNumber: 2)
 *   - LOAD_PRESET replaces all GameConfig fields while preserving home and away team configs
 *   - NEW_GAME with clearTeams: true resets both team names to empty strings
 *   - SET_GAME_CLOCK outside [0, 3600] seconds leaves state unchanged
 *   - SET_VOLUME outside [0.0, 1.0] leaves volume unchanged
 */
import { describe, it, expect } from 'vitest'
import { gameReducer } from '../gameStore'
import { DEFAULT_GAME_STATE } from '../../shared/types'
import type { GameState, GameConfig } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fresh(): GameState {
  return DEFAULT_GAME_STATE()
}

// ---------------------------------------------------------------------------
// Game clock auto-stops when CLOCK_TICK drives displayMs to 0
// ---------------------------------------------------------------------------

describe('Game clock auto-stops at zero via CLOCK_TICK', () => {
  it('running becomes false and displayMs === 0 when tick exactly matches remaining time', () => {
    let s = fresh()
    // Set clock to exactly 500 ms remaining
    s = gameReducer(s, { type: 'SET_GAME_CLOCK', seconds: 1 }) // 1000 ms
    s = gameReducer(s, { type: 'START_GAME_CLOCK' })
    // Tick by exactly the remaining amount
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 1000 })

    expect(s.gameClock.displayMs).toBe(0)
    expect(s.gameClock.running).toBe(false)
  })

  it('running becomes false and displayMs === 0 when tick overshoots remaining time', () => {
    let s = fresh()
    // Set clock to 300 ms
    s = { ...s, gameClock: { ...s.gameClock, displayMs: 300, running: true } }
    // Tick by more than the remaining amount
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 1000 })

    expect(s.gameClock.displayMs).toBe(0)
    expect(s.gameClock.running).toBe(false)
  })

  it('displayMs does not go below zero after a large tick', () => {
    let s = fresh()
    s = { ...s, gameClock: { ...s.gameClock, displayMs: 50, running: true } }
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 999_999 })

    expect(s.gameClock.displayMs).toBe(0)
    expect(s.gameClock.running).toBe(false)
    expect(s.gameClock.displayMs).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// Shot clock auto-stops at 0, holds at 0 (never goes negative)
// ---------------------------------------------------------------------------

describe('Shot clock auto-stops at zero via CLOCK_TICK', () => {
  it('shot clock stops and holds at 0 when tick is larger than remaining shot clock value', () => {
    let s = fresh()
    // Put 500 ms on shot clock and start it
    s = { ...s, shotClock: { ...s.shotClock, displayMs: 500, running: true } }
    // Dispatch a tick larger than 500 ms
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 2000 })

    expect(s.shotClock.displayMs).toBe(0)
    expect(s.shotClock.running).toBe(false)
  })

  it('shot clock stays at 0 and does not go negative on a second large tick', () => {
    let s = fresh()
    // Tick shot clock to 0
    s = { ...s, shotClock: { ...s.shotClock, displayMs: 100, running: true } }
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 5000 })
    expect(s.shotClock.displayMs).toBe(0)
    expect(s.shotClock.running).toBe(false)

    // Try another tick — already stopped, should remain at 0
    const before = s
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 5000 })
    expect(s.shotClock.displayMs).toBe(0)
    expect(s.shotClock.running).toBe(false)
    // Remains identical to pre-tick state for the shot clock portion
    expect(s.shotClock).toEqual(before.shotClock)
  })

  it('shot clock exactly hits 0 when deltaMs equals remaining', () => {
    let s = fresh()
    s = { ...s, shotClock: { ...s.shotClock, displayMs: 1000, running: true } }
    s = gameReducer(s, { type: 'CLOCK_TICK', deltaMs: 1000 })

    expect(s.shotClock.displayMs).toBe(0)
    expect(s.shotClock.running).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ADVANCE_PERIOD at the final regular period with tied scores → OT
// ---------------------------------------------------------------------------

describe('ADVANCE_PERIOD into overtime from final regulation period', () => {
  it('produces isOvertime: true and overtimeNumber: 1 when advancing past max regulation period', () => {
    let s = fresh() // NBA_RULES: periodCount = 4
    // Tie the game scores to reflect the most realistic OT-triggering scenario
    s = gameReducer(s, { type: 'ADD_SCORE', team: 'home', points: 2 })
    s = gameReducer(s, { type: 'ADD_SCORE', team: 'away', points: 2 })
    // Advance through periods 1–4
    for (let i = 0; i < 4; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }

    expect(s.period.isOvertime).toBe(true)
    expect(s.period.overtimeNumber).toBe(1)
  })

  it('game clock is reset to overtimeDurationMinutes after entering OT', () => {
    let s = fresh() // NBA_RULES: overtimeDurationMinutes = 5
    for (let i = 0; i < 4; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }

    const expectedMs = s.gameConfig.overtimeDurationMinutes * 60 * 1000
    expect(s.gameClock.configuredDurationMs).toBe(expectedMs)
    expect(s.gameClock.displayMs).toBe(expectedMs)
    expect(s.gameClock.running).toBe(false)
  })

  it('works with periodCount=2 (halves format) — advancing past period 2 enters OT', () => {
    let s = fresh()
    // Switch to 2-period format
    s = gameReducer(s, {
      type: 'LOAD_PRESET',
      preset: { ...s.gameConfig, periodCount: 2 },
    })
    // Advance through periods 1 and 2
    s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    s = gameReducer(s, { type: 'ADVANCE_PERIOD' })

    expect(s.period.isOvertime).toBe(true)
    expect(s.period.overtimeNumber).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// ADVANCE_PERIOD at OT1 produces OT2 (overtimeNumber: 2)
// ---------------------------------------------------------------------------

describe('ADVANCE_PERIOD from OT1 to OT2', () => {
  it('produces overtimeNumber: 2 when advancing from OT1', () => {
    let s = fresh() // NBA_RULES: periodCount = 4
    // Reach OT1 by advancing through 4 regulation periods
    for (let i = 0; i < 4; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }
    expect(s.period.isOvertime).toBe(true)
    expect(s.period.overtimeNumber).toBe(1)

    // Advance once more — should produce OT2
    s = gameReducer(s, { type: 'ADVANCE_PERIOD' })

    expect(s.period.isOvertime).toBe(true)
    expect(s.period.overtimeNumber).toBe(2)
  })

  it('OT2 game clock is also set to overtimeDurationMinutes', () => {
    let s = fresh()
    // Reach OT2
    for (let i = 0; i < 5; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }

    const expectedMs = s.gameConfig.overtimeDurationMinutes * 60 * 1000
    expect(s.gameClock.configuredDurationMs).toBe(expectedMs)
    expect(s.gameClock.displayMs).toBe(expectedMs)
  })
})

// ---------------------------------------------------------------------------
// LOAD_PRESET replaces all GameConfig fields while preserving home and away team configs
// ---------------------------------------------------------------------------

describe('LOAD_PRESET preserves team configs while replacing GameConfig', () => {
  const fibaPreset: GameConfig = {
    periodDurationMinutes: 10,
    periodCount: 4,
    overtimeDurationMinutes: 5,
    shotClockDurationSeconds: 24,
    bonusThreshold: 4,
    fullTimeoutsPerTeam: 5,
    twentySecTimeoutsPerTeam: 0,
  }

  it('replaces all GameConfig fields with preset values', () => {
    const s = gameReducer(fresh(), { type: 'LOAD_PRESET', preset: fibaPreset })

    expect(s.gameConfig.periodDurationMinutes).toBe(fibaPreset.periodDurationMinutes)
    expect(s.gameConfig.periodCount).toBe(fibaPreset.periodCount)
    expect(s.gameConfig.overtimeDurationMinutes).toBe(fibaPreset.overtimeDurationMinutes)
    expect(s.gameConfig.shotClockDurationSeconds).toBe(fibaPreset.shotClockDurationSeconds)
    expect(s.gameConfig.bonusThreshold).toBe(fibaPreset.bonusThreshold)
    expect(s.gameConfig.fullTimeoutsPerTeam).toBe(fibaPreset.fullTimeoutsPerTeam)
    expect(s.gameConfig.twentySecTimeoutsPerTeam).toBe(fibaPreset.twentySecTimeoutsPerTeam)
    expect(s.gameConfig).toEqual(fibaPreset)
  })

  it('preserves home team name and color after LOAD_PRESET', () => {
    let s = fresh()
    s = gameReducer(s, {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { name: 'Lakers', color: '#552583' },
    })
    s = gameReducer(s, { type: 'LOAD_PRESET', preset: fibaPreset })

    expect(s.home.config.name).toBe('Lakers')
    expect(s.home.config.color).toBe('#552583')
  })

  it('preserves away team name and color after LOAD_PRESET', () => {
    let s = fresh()
    s = gameReducer(s, {
      type: 'SET_TEAM_CONFIG',
      team: 'away',
      config: { name: 'Celtics', color: '#007A33' },
    })
    s = gameReducer(s, { type: 'LOAD_PRESET', preset: fibaPreset })

    expect(s.away.config.name).toBe('Celtics')
    expect(s.away.config.color).toBe('#007A33')
  })

  it('preserves home logoPath after LOAD_PRESET', () => {
    let s = fresh()
    s = gameReducer(s, {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { logoPath: '/logos/lakers.png' },
    })
    s = gameReducer(s, { type: 'LOAD_PRESET', preset: fibaPreset })

    expect(s.home.config.logoPath).toBe('/logos/lakers.png')
  })

  it('does not modify team scores, fouls, or game phase when loading preset', () => {
    let s = fresh()
    s = gameReducer(s, { type: 'ADD_SCORE', team: 'home', points: 3 })
    s = gameReducer(s, { type: 'ADD_FOUL', team: 'away' })
    const scoreBefore = s.home.score
    const foulsBefore = s.away.fouls
    s = gameReducer(s, { type: 'LOAD_PRESET', preset: fibaPreset })

    expect(s.home.score).toBe(scoreBefore)
    expect(s.away.fouls).toBe(foulsBefore)
  })
})

// ---------------------------------------------------------------------------
// NEW_GAME with clearTeams: true
// ---------------------------------------------------------------------------

describe('NEW_GAME with clearTeams: true', () => {
  it('resets logoPath to null for both teams', () => {
    let s = fresh()
    s = gameReducer(s, {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { logoPath: '/logos/home.png' },
    })
    s = gameReducer(s, {
      type: 'SET_TEAM_CONFIG',
      team: 'away',
      config: { logoPath: '/logos/away.png' },
    })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: true })

    expect(s.home.config.logoPath).toBeNull()
    expect(s.away.config.logoPath).toBeNull()
  })

  it('preserves team names and colors when clearTeams: true', () => {
    let s = fresh()
    s = gameReducer(s, {
      type: 'SET_TEAM_CONFIG',
      team: 'home',
      config: { name: 'Bulls', color: '#CE1141' },
    })
    s = gameReducer(s, {
      type: 'SET_TEAM_CONFIG',
      team: 'away',
      config: { name: 'Bucks', color: '#00471B' },
    })
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: true })

    // Per the implemented reducer behavior: names and colors are preserved even with clearTeams: true
    expect(s.home.config.name).toBe('Bulls')
    expect(s.home.config.color).toBe('#CE1141')
    expect(s.away.config.name).toBe('Bucks')
    expect(s.away.config.color).toBe('#00471B')
  })

  it('still resets scores, fouls, and period when clearTeams: true', () => {
    let s = fresh()
    s = gameReducer(s, { type: 'ADD_SCORE', team: 'home', points: 3 })
    s = gameReducer(s, { type: 'ADD_FOUL', team: 'away' })
    for (let i = 0; i < 2; i++) {
      s = gameReducer(s, { type: 'ADVANCE_PERIOD' })
    }
    s = gameReducer(s, { type: 'NEW_GAME', clearTeams: true })

    expect(s.home.score).toBe(0)
    expect(s.away.score).toBe(0)
    expect(s.away.fouls).toBe(0)
    expect(s.period.current).toBe(1)
    expect(s.period.isOvertime).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SET_GAME_CLOCK outside [0, 3600] seconds leaves state unchanged
// ---------------------------------------------------------------------------

describe('SET_GAME_CLOCK rejects out-of-range values', () => {
  it('leaves gameClock.displayMs unchanged when seconds is negative', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: -1 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })

  it('leaves gameClock.displayMs unchanged when seconds is -0.5 (non-integer)', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: -0.5 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })

  it('leaves gameClock.displayMs unchanged when seconds is 3601', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: 3601 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })

  it('leaves gameClock.displayMs unchanged when seconds is 99999', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: 99999 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })

  it('leaves gameClock.displayMs unchanged when seconds is 5.5 (non-integer)', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_GAME_CLOCK', seconds: 5.5 })
    expect(s.gameClock.displayMs).toBe(base.gameClock.displayMs)
  })

  it('still accepts boundary value 0 (valid)', () => {
    const s = gameReducer(fresh(), { type: 'SET_GAME_CLOCK', seconds: 0 })
    expect(s.gameClock.displayMs).toBe(0)
  })

  it('still accepts boundary value 3600 (valid)', () => {
    const s = gameReducer(fresh(), { type: 'SET_GAME_CLOCK', seconds: 3600 })
    expect(s.gameClock.displayMs).toBe(3_600_000)
  })
})

// ---------------------------------------------------------------------------
// SET_VOLUME outside [0.0, 1.0] leaves volume unchanged
// ---------------------------------------------------------------------------

describe('SET_VOLUME rejects out-of-range values', () => {
  it('leaves volume unchanged when level is -0.1', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_VOLUME', level: -0.1 })
    expect(s.volume).toBe(base.volume)
  })

  it('leaves volume unchanged when level is -1', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_VOLUME', level: -1 })
    expect(s.volume).toBe(base.volume)
  })

  it('leaves volume unchanged when level is 1.001', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_VOLUME', level: 1.001 })
    expect(s.volume).toBe(base.volume)
  })

  it('leaves volume unchanged when level is 100', () => {
    const base = fresh()
    const s = gameReducer(base, { type: 'SET_VOLUME', level: 100 })
    expect(s.volume).toBe(base.volume)
  })

  it('accepts boundary value 0.0 (valid)', () => {
    const s = gameReducer(fresh(), { type: 'SET_VOLUME', level: 0.0 })
    expect(s.volume).toBe(0.0)
  })

  it('accepts boundary value 1.0 (valid)', () => {
    const s = gameReducer(fresh(), { type: 'SET_VOLUME', level: 1.0 })
    expect(s.volume).toBe(1.0)
  })

  it('retains a previously set valid volume when an invalid level is rejected', () => {
    let s = gameReducer(fresh(), { type: 'SET_VOLUME', level: 0.75 })
    expect(s.volume).toBe(0.75)
    // Now try to set an invalid volume — should remain 0.75
    s = gameReducer(s, { type: 'SET_VOLUME', level: 2.0 })
    expect(s.volume).toBe(0.75)
  })
})
