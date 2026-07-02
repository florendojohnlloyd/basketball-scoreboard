/**
 * GameStore — pure reducer and authoritative game state for the main process.
 *
 * `gameReducer` is a pure function (no side effects, no mutations).
 * `createGameStore` wraps it in a stateful container with `dispatch` / `getState`.
 */

import type {
  GameState,
  CommandType,
  TeamState,
  ClockState,
  ShotClockState,
  PeriodState,
} from '../shared/types'
import { DEFAULT_GAME_STATE } from '../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Return a shallow-copied team with the score adjusted, floored at 0. */
function adjustScore(team: TeamState, delta: number): TeamState {
  return { ...team, score: Math.max(0, team.score + delta) }
}

/** Return a shallow-copied team with the foul count adjusted, floored at 0. */
function adjustFouls(team: TeamState, delta: number): TeamState {
  return { ...team, fouls: Math.max(0, team.fouls + delta) }
}

/** Decrement a running clock by deltaMs, clamp at 0, stop if it reaches 0. */
function tickClock(clock: ClockState, deltaMs: number): ClockState {
  if (!clock.running) return clock
  const next = Math.max(0, clock.displayMs - deltaMs)
  return { ...clock, displayMs: next, running: next > 0 }
}

/** Decrement a running shot clock by deltaMs, clamp at 0, stop if it reaches 0. */
function tickShotClock(clock: ShotClockState, deltaMs: number): ShotClockState {
  if (!clock.running) return clock
  const next = Math.max(0, clock.displayMs - deltaMs)
  return { ...clock, displayMs: next, running: next > 0 }
}

/** Build a fresh ClockState reset to configured duration and stopped. */
function resetGameClock(clock: ClockState): ClockState {
  return { ...clock, running: false, displayMs: clock.configuredDurationMs }
}

/** Build a fresh ShotClockState reset to configured duration and stopped. */
function resetShotClock(clock: ShotClockState): ShotClockState {
  return {
    ...clock,
    running: false,
    displayMs: clock.configuredDurationSeconds * 1000,
  }
}

/** Reset a team's foul count to 0 while keeping everything else intact. */
function clearFouls(team: TeamState): TeamState {
  return { ...team, fouls: 0 }
}

/** Reset a team's timeouts to the configured maximum values. */
function resetTimeouts(team: TeamState, config: GameState['gameConfig']): TeamState {
  return {
    ...team,
    timeouts: {
      fullRemaining: config.fullTimeoutsPerTeam,
      twentyRemaining: config.twentySecTimeoutsPerTeam,
    },
  }
}

// ---------------------------------------------------------------------------
// Pure Reducer
// ---------------------------------------------------------------------------

export function gameReducer(state: GameState, command: CommandType): GameState {
  switch (command.type) {
    // -----------------------------------------------------------------------
    // Score
    // -----------------------------------------------------------------------
    case 'ADD_SCORE': {
      const team = command.team === 'home' ? 'home' : 'away'
      return { ...state, [team]: adjustScore(state[team], command.points) }
    }

    case 'SUBTRACT_SCORE': {
      const team = command.team === 'home' ? 'home' : 'away'
      return { ...state, [team]: adjustScore(state[team], -1) }
    }

    // -----------------------------------------------------------------------
    // Game Clock
    // -----------------------------------------------------------------------
    case 'START_GAME_CLOCK':
      return { ...state, gameClock: { ...state.gameClock, running: true } }

    case 'STOP_GAME_CLOCK':
      return { ...state, gameClock: { ...state.gameClock, running: false } }

    case 'RESET_GAME_CLOCK':
      return { ...state, gameClock: resetGameClock(state.gameClock) }

    case 'SET_GAME_CLOCK': {
      const { seconds } = command
      // Validate: must be an integer in [0, 3600]
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
        // Reject — return state unchanged
        return state
      }
      return {
        ...state,
        gameClock: { ...state.gameClock, displayMs: seconds * 1000 },
      }
    }

    // -----------------------------------------------------------------------
    // Shot Clock
    // -----------------------------------------------------------------------
    case 'START_SHOT_CLOCK':
      return { ...state, shotClock: { ...state.shotClock, running: true } }

    case 'STOP_SHOT_CLOCK':
      return { ...state, shotClock: { ...state.shotClock, running: false } }

    case 'RESET_SHOT_CLOCK':
      return { ...state, shotClock: resetShotClock(state.shotClock) }

    // -----------------------------------------------------------------------
    // Clock Tick (both clocks)
    // -----------------------------------------------------------------------
    case 'CLOCK_TICK': {
      const { deltaMs } = command
      const gameClock = tickClock(state.gameClock, deltaMs)
      const shotClock = tickShotClock(state.shotClock, deltaMs)
      return { ...state, gameClock, shotClock }
    }

    // -----------------------------------------------------------------------
    // Fouls
    // -----------------------------------------------------------------------
    case 'ADD_FOUL': {
      const team = command.team === 'home' ? 'home' : 'away'
      return { ...state, [team]: adjustFouls(state[team], 1) }
    }

    case 'SUBTRACT_FOUL': {
      const team = command.team === 'home' ? 'home' : 'away'
      return { ...state, [team]: adjustFouls(state[team], -1) }
    }

    // -----------------------------------------------------------------------
    // Timeouts
    // -----------------------------------------------------------------------
    case 'USE_TIMEOUT': {
      const { team, kind } = command
      const teamState = state[team]
      const max =
        kind === 'full'
          ? state.gameConfig.fullTimeoutsPerTeam
          : state.gameConfig.twentySecTimeoutsPerTeam
      const field = kind === 'full' ? 'fullRemaining' : 'twentyRemaining'
      const current = teamState.timeouts[field]
      const next = clamp(current - 1, 0, max)
      return {
        ...state,
        [team]: {
          ...teamState,
          timeouts: { ...teamState.timeouts, [field]: next },
        },
      }
    }

    case 'RESTORE_TIMEOUT': {
      const { team, kind } = command
      const teamState = state[team]
      const max =
        kind === 'full'
          ? state.gameConfig.fullTimeoutsPerTeam
          : state.gameConfig.twentySecTimeoutsPerTeam
      const field = kind === 'full' ? 'fullRemaining' : 'twentyRemaining'
      const current = teamState.timeouts[field]
      const next = clamp(current + 1, 0, max)
      return {
        ...state,
        [team]: {
          ...teamState,
          timeouts: { ...teamState.timeouts, [field]: next },
        },
      }
    }

    // -----------------------------------------------------------------------
    // Period
    // -----------------------------------------------------------------------
    case 'ADVANCE_PERIOD': {
      const { period, gameConfig } = state
      const maxRegulationPeriods = gameConfig.periodCount

      // Stop the game clock and reset it
      const gameClock: ClockState = {
        ...resetGameClock(state.gameClock),
        // For OT periods use overtime duration
        configuredDurationMs: period.isOvertime
          ? gameConfig.overtimeDurationMinutes * 60 * 1000
          : state.gameClock.configuredDurationMs,
      }

      // Reset both teams' foul counts
      const home = clearFouls(state.home)
      const away = clearFouls(state.away)

      let newPeriod: PeriodState

      if (!period.isOvertime && period.current >= maxRegulationPeriods) {
        // Advancing past final regulation period → enter overtime
        newPeriod = {
          ...period,
          current: period.current + 1,
          isOvertime: true,
          overtimeNumber: 1,
        }
        // Update game clock to OT duration
        gameClock.configuredDurationMs = gameConfig.overtimeDurationMinutes * 60 * 1000
        gameClock.displayMs = gameClock.configuredDurationMs
      } else if (period.isOvertime) {
        // Already in OT — move to next OT period
        newPeriod = {
          ...period,
          current: period.current + 1,
          overtimeNumber: period.overtimeNumber + 1,
        }
        // OT clock duration stays as configured
        gameClock.configuredDurationMs = gameConfig.overtimeDurationMinutes * 60 * 1000
        gameClock.displayMs = gameClock.configuredDurationMs
      } else {
        // Normal regulation period advance
        newPeriod = { ...period, current: period.current + 1 }
        // Keep regulation clock duration, just reset it
        gameClock.configuredDurationMs = gameConfig.periodDurationMinutes * 60 * 1000
        gameClock.displayMs = gameClock.configuredDurationMs
      }

      return { ...state, period: newPeriod, gameClock, home, away }
    }

    // -----------------------------------------------------------------------
    // Team Config
    // -----------------------------------------------------------------------
    case 'SET_TEAM_CONFIG': {
      const { team, config } = command
      const teamState = state[team]
      return {
        ...state,
        [team]: {
          ...teamState,
          config: { ...teamState.config, ...config },
        },
      }
    }

    // -----------------------------------------------------------------------
    // Preset
    // -----------------------------------------------------------------------
    case 'LOAD_PRESET': {
      const { preset } = command
      const durationMs = preset.periodDurationMinutes * 60 * 1000
      // Rebuild clocks from preset values
      const gameClock: ClockState = {
        displayMs: durationMs,
        running: false,
        configuredDurationMs: durationMs,
      }
      const shotClock: ShotClockState = {
        displayMs: preset.shotClockDurationSeconds * 1000,
        running: false,
        configuredDurationSeconds: preset.shotClockDurationSeconds,
        enabled: state.shotClock.enabled,
      }
      // Rebuild timeout state for both teams based on new config maxima
      const home: TeamState = {
        ...state.home,
        timeouts: {
          fullRemaining: preset.fullTimeoutsPerTeam,
          twentyRemaining: preset.twentySecTimeoutsPerTeam,
        },
      }
      const away: TeamState = {
        ...state.away,
        timeouts: {
          fullRemaining: preset.fullTimeoutsPerTeam,
          twentyRemaining: preset.twentySecTimeoutsPerTeam,
        },
      }
      return {
        ...state,
        gameConfig: { ...preset },
        gameClock,
        shotClock,
        home,
        away,
      }
    }

    // -----------------------------------------------------------------------
    // New Game
    // -----------------------------------------------------------------------
    case 'NEW_GAME': {
      const { clearTeams } = command
      const { gameConfig } = state
      const durationMs = gameConfig.periodDurationMinutes * 60 * 1000

      const resetTeam = (existing: TeamState): TeamState => ({
        config: clearTeams
          ? { name: existing.config.name, color: existing.config.color, logoPath: null }
          : { ...existing.config },
        score: 0,
        fouls: 0,
        timeouts: {
          fullRemaining: gameConfig.fullTimeoutsPerTeam,
          twentyRemaining: gameConfig.twentySecTimeoutsPerTeam,
        },
      })

      return {
        ...state,
        gamePhase: 'pre-game',
        home: resetTeam(state.home),
        away: resetTeam(state.away),
        gameClock: {
          displayMs: durationMs,
          running: false,
          configuredDurationMs: durationMs,
        },
        shotClock: {
          displayMs: gameConfig.shotClockDurationSeconds * 1000,
          running: false,
          configuredDurationSeconds: gameConfig.shotClockDurationSeconds,
          enabled: state.shotClock.enabled,
        },
        period: {
          current: 1,
          format: state.period.format,
          isOvertime: false,
          overtimeNumber: 0,
        },
      }
    }

    // -----------------------------------------------------------------------
    // Shot Clock Enabled Toggle
    // -----------------------------------------------------------------------
    case 'SET_SHOT_CLOCK_ENABLED':
      return {
        ...state,
        shotClock: { ...state.shotClock, enabled: command.enabled, running: false },
      }

    // -----------------------------------------------------------------------
    // Volume
    // -----------------------------------------------------------------------
    case 'SET_VOLUME': {
      const { level } = command
      if (level < 0.0 || level > 1.0) {
        // Reject — return state unchanged
        return state
      }
      return { ...state, volume: level }
    }

    default: {
      // Exhaustiveness guard — TypeScript should catch this at compile time
      const _exhaustive: never = command
      void _exhaustive
      return state
    }
  }
}

// ---------------------------------------------------------------------------
// GameStore factory
// ---------------------------------------------------------------------------

export interface GameStore {
  dispatch(command: CommandType): GameState
  getState(): GameState
}

/**
 * Creates a stateful GameStore backed by `gameReducer`.
 * The main process should create exactly one instance.
 */
export function createGameStore(initialState?: GameState): GameStore {
  let state: GameState = initialState ?? DEFAULT_GAME_STATE()

  return {
    dispatch(command: CommandType): GameState {
      state = gameReducer(state, command)
      return state
    },
    getState(): GameState {
      return state
    },
  }
}
