/**
 * Shared TypeScript types and data models for the Basketball Scoreboard.
 * Used across the main process and both renderer windows.
 */

// ---------------------------------------------------------------------------
// IPC Channel Constants
// ---------------------------------------------------------------------------

export const SCOREBOARD_COMMAND = 'scoreboard:command';
export const SCOREBOARD_STATE = 'scoreboard:state';
export const SCOREBOARD_EVENT = 'scoreboard:event';
export const SCOREBOARD_QUERY = 'scoreboard:query';

// ---------------------------------------------------------------------------
// Core Interfaces
// ---------------------------------------------------------------------------

export interface TeamConfig {
  name: string;       // 1–30 chars, non-whitespace-only
  color: string;      // CSS hex color, e.g. "#1D428A"
  logoPath: string | null;
}

export interface TimeoutState {
  fullRemaining: number;    // 0 to gameConfig.fullTimeoutsPerTeam
  twentyRemaining: number;  // 0 to gameConfig.twentySecTimeoutsPerTeam
}

export interface TeamState {
  config: TeamConfig;
  score: number;   // >= 0
  fouls: number;   // >= 0
  timeouts: TimeoutState;
}

export interface ClockState {
  displayMs: number;            // current value in milliseconds
  running: boolean;
  configuredDurationMs: number;
}

export interface ShotClockState {
  displayMs: number;                 // current value in milliseconds
  running: boolean;
  configuredDurationSeconds: number; // 14–30
  enabled: boolean;
}

export interface PeriodState {
  current: number;                  // 1-indexed
  format: 'quarters' | 'halves';
  isOvertime: boolean;
  overtimeNumber: number;           // 0 if not OT, 1 for first OT, etc.
}

export interface GameConfig {
  periodDurationMinutes: number;       // 1–60
  periodCount: 2 | 4;
  overtimeDurationMinutes: number;
  shotClockDurationSeconds: number;    // 14–30
  bonusThreshold: number;              // 1–10
  fullTimeoutsPerTeam: number;         // 0–10
  twentySecTimeoutsPerTeam: number;    // 0–10
}

export interface GameState {
  gamePhase: 'pre-game' | 'in-game' | 'post-game';
  gameConfig: GameConfig;
  home: TeamState;
  away: TeamState;
  gameClock: ClockState;
  shotClock: ShotClockState;
  period: PeriodState;
  volume: number; // 0.0 – 1.0
}

export interface Preset {
  name: string;       // 1–30 chars, unique
  config: GameConfig;
  builtIn: boolean;   // true for NBA Rules, FIBA Rules
  createdAt: string;  // ISO 8601
}

// ---------------------------------------------------------------------------
// ClockEngine interface (used by main process)
// ---------------------------------------------------------------------------

export interface ClockEngine {
  startGameClock(): void;
  stopGameClock(): void;
  startShotClock(): void;
  stopShotClock(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Command Type — discriminated union (22 variants)
// ---------------------------------------------------------------------------

export type CommandType =
  | { type: 'ADD_SCORE'; team: 'home' | 'away'; points: 1 | 2 | 3 }
  | { type: 'SUBTRACT_SCORE'; team: 'home' | 'away' }
  | { type: 'START_GAME_CLOCK' }
  | { type: 'STOP_GAME_CLOCK' }
  | { type: 'RESET_GAME_CLOCK' }
  | { type: 'SET_GAME_CLOCK'; seconds: number }
  | { type: 'START_SHOT_CLOCK' }
  | { type: 'STOP_SHOT_CLOCK' }
  | { type: 'RESET_SHOT_CLOCK' }
  | { type: 'CLOCK_TICK'; deltaMs: number }
  | { type: 'ADD_FOUL'; team: 'home' | 'away' }
  | { type: 'SUBTRACT_FOUL'; team: 'home' | 'away' }
  | { type: 'USE_TIMEOUT'; team: 'home' | 'away'; kind: 'full' | 'twenty' }
  | { type: 'RESTORE_TIMEOUT'; team: 'home' | 'away'; kind: 'full' | 'twenty' }
  | { type: 'ADVANCE_PERIOD' }
  | { type: 'SET_TEAM_CONFIG'; team: 'home' | 'away'; config: Partial<TeamConfig> }
  | { type: 'LOAD_PRESET'; preset: GameConfig }
  | { type: 'NEW_GAME'; clearTeams: boolean }
  | { type: 'SET_SHOT_CLOCK_ENABLED'; enabled: boolean }
  | { type: 'SET_VOLUME'; level: number };

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Built-in Preset Constants
// ---------------------------------------------------------------------------

export const NBA_RULES: GameConfig = {
  periodDurationMinutes: 12,
  periodCount: 4,
  overtimeDurationMinutes: 5,
  shotClockDurationSeconds: 24,
  bonusThreshold: 5,
  fullTimeoutsPerTeam: 7,
  twentySecTimeoutsPerTeam: 1,
} as const;

export const FIBA_RULES: GameConfig = {
  periodDurationMinutes: 10,
  periodCount: 4,
  overtimeDurationMinutes: 5,
  shotClockDurationSeconds: 24,
  bonusThreshold: 4,
  fullTimeoutsPerTeam: 5,
  twentySecTimeoutsPerTeam: 0,
} as const;

// ---------------------------------------------------------------------------
// DEFAULT_GAME_STATE factory
// ---------------------------------------------------------------------------

/**
 * Returns a fresh GameState using NBA Rules defaults.
 * Always returns a new object — safe to mutate.
 */
export function DEFAULT_GAME_STATE(): GameState {
  const config: GameConfig = { ...NBA_RULES };
  const defaultTeam = (name: string, color: string): TeamState => ({
    config: { name, color, logoPath: null },
    score: 0,
    fouls: 0,
    timeouts: {
      fullRemaining: config.fullTimeoutsPerTeam,
      twentyRemaining: config.twentySecTimeoutsPerTeam,
    },
  });

  return {
    gamePhase: 'pre-game',
    gameConfig: config,
    home: defaultTeam('Home', '#1D428A'),
    away: defaultTeam('Away', '#C8102E'),
    gameClock: {
      displayMs: config.periodDurationMinutes * 60 * 1000,
      running: false,
      configuredDurationMs: config.periodDurationMinutes * 60 * 1000,
    },
    shotClock: {
      displayMs: config.shotClockDurationSeconds * 1000,
      running: false,
      configuredDurationSeconds: config.shotClockDurationSeconds,
      enabled: true,
    },
    period: {
      current: 1,
      format: 'quarters',
      isOvertime: false,
      overtimeNumber: 0,
    },
    volume: 0.8,
  };
}
