/**
 * Shared TypeScript types and data models — LigaControl V17.11
 */

// ---------------------------------------------------------------------------
// IPC Channel Constants
// ---------------------------------------------------------------------------

export const SCOREBOARD_COMMAND = 'scoreboard:command';
export const SCOREBOARD_STATE   = 'scoreboard:state';
export const SCOREBOARD_EVENT   = 'scoreboard:event';
export const SCOREBOARD_QUERY   = 'scoreboard:query';

// ---------------------------------------------------------------------------
// Liga System
// ---------------------------------------------------------------------------

export interface LigaTeam {
  id: string;
  name: string;
  color: string;
  logoPath: string | null;
  playerImagePath: string | null;
  players: LigaPlayer[];
  createdAt: string;
}

export interface LigaPlayer {
  id: string;
  number: string;   // 1–99, unique within team
  name: string;     // 1–50 chars
  photoPath?: string | null; // path relative to userData dir; null/undefined when not assigned
}

export interface Liga {
  id: string;
  name: string;
  year: number;
  createdAt: string;
  teams: LigaTeam[];
  schedule?: ScheduledGame[];   // Requirement 24 — persisted schedule array
  venues?: Venue[];             // Requirement 25 — persisted venues array
  staff?: StaffMember[];        // Requirement 26 — persisted staff array
}

// ---------------------------------------------------------------------------
// Game Event Log
// ---------------------------------------------------------------------------

export type GameEventType =
  | 'SCORE'
  | 'SCORE_UNDO'
  | 'FOUL'
  | 'FOUL_UNDO'
  | 'PLAYER_FOUL'
  | 'PLAYER_FOUL_UNDO'
  | 'PLAYER_FOUL_OUT'
  | 'REBOUND'
  | 'REBOUND_UNDO'
  | 'ASSIST'
  | 'ASSIST_UNDO'
  | 'TIMEOUT'
  | 'TIMEOUT_UNDO'
  | 'SUBSTITUTION'
  | 'PERIOD_START'
  | 'PERIOD_END'
  | 'OVERTIME_START'
  | 'POSSESSION_CHANGE'
  | 'UNDO'
  | 'GAME_START'
  | 'GAME_RESET';

export interface GameEvent {
  id: string;
  timestamp: string;        // ISO 8601
  clockMs: number;          // game clock value when event happened
  period: number;
  type: GameEventType;
  team?: 'home' | 'away';
  playerId?: string;
  playerName?: string;
  points?: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Substitution entry (referenced by Player)
// ---------------------------------------------------------------------------

/** Substitution entry recorded when a player's active status changes. */
export interface SubstitutionEntry {
  clockMs: number;
  period: number;
  active: boolean; // true = entering, false = exiting
}

// ---------------------------------------------------------------------------
// Core Game Interfaces
// ---------------------------------------------------------------------------

export interface TeamConfig {
  name: string;
  color: string;
  logoPath: string | null;
  playerImagePath: string | null;
}

export interface TimeoutState {
  fullRemaining: number;
  twentyRemaining: number;
  // Per-half tracking for custom rules
  firstHalfUsed: number;    // timeouts used in Q1-Q2 (max 2)
  secondHalfUsed: number;   // timeouts used in Q3-Q4 (max 3)
  overtimeUsed: number;     // timeouts used in OT (max 1)
}

export interface Player {
  id: string;
  number: string;
  name: string;
  fouls: number;
  points: number;
  rebounds: number;
  assists: number;
  active: boolean;
  fouledOut: boolean;
  // Extended per-player stats (Requirement 13)
  steals: number;
  blocks: number;
  fga: number;               // field goal attempts
  fgm: number;               // field goal makes (fgm <= fga always)
  minutesPlayed: number;     // seconds of game-clock time while active
  substitutions: SubstitutionEntry[];
  // Player photo (Requirement 16)
  photoPath: string | null;  // path relative to userData dir; null when not assigned
}

export interface TeamState {
  config: TeamConfig;
  score: number;
  fouls: number;
  timeouts: TimeoutState;
  players: Player[];
  turnovers: number;  // >= 0, reset to 0 on NEW_GAME (Requirement 14)
}

export interface ClockState {
  displayMs: number;
  running: boolean;
  configuredDurationMs: number;
}

export interface ShotClockState {
  displayMs: number;
  running: boolean;
  configuredDurationSeconds: number;
  enabled: boolean;
}

export interface PeriodState {
  current: number;
  format: 'quarters' | 'halves';
  isOvertime: boolean;
  overtimeNumber: number;
}

export interface GameConfig {
  periodDurationMinutes: number;
  periodCount: 2 | 4;
  overtimeDurationMinutes: number;
  shotClockDurationSeconds: number;
  bonusThreshold: number;
  foulOutLimit: number;           // personal fouls before foul-out (default 5)
  fullTimeoutsPerTeam: number;
  twentySecTimeoutsPerTeam: number;
  timeoutDurationSeconds: number; // timeout countdown duration (default 60)
}

export interface GameState {
  gamePhase: 'pre-game' | 'in-game' | 'post-game';
  gameConfig: GameConfig;
  home: TeamState;
  away: TeamState;
  gameClock: ClockState;
  shotClock: ShotClockState;
  period: PeriodState;
  volume: number;
  possession: 'home' | 'away' | null;
  events: GameEvent[];
  // Liga context for this game session
  ligaId: string | null;
  ligaName: string | null;
  // Timeout state
  timeout: TimeoutActiveState | null;
  // Sponsor logos (up to 5 file paths)
  sponsorLogos: string[];
  // Period snapshots for box score (Requirement 17)
  periodSnapshots: PeriodSnapshot[];
  // Settings
  showPhotosOnScoreboard: boolean;  // Requirement 16
}

export interface TimeoutActiveState {
  team: 'home' | 'away';
  remainingMs: number;
  running: boolean;
}

export interface Preset {
  name: string;
  config: GameConfig;
  builtIn: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ClockEngine interface
// ---------------------------------------------------------------------------

export interface ClockEngine {
  startGameClock(): void;
  stopGameClock(): void;
  startShotClock(): void;
  stopShotClock(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Command Type — full discriminated union
// ---------------------------------------------------------------------------

export type CommandType =
  // Score
  | { type: 'ADD_SCORE';      team: 'home' | 'away'; points: 1 | 2 | 3 }
  | { type: 'SUBTRACT_SCORE'; team: 'home' | 'away' }
  // Game Clock
  | { type: 'START_GAME_CLOCK' }
  | { type: 'STOP_GAME_CLOCK' }
  | { type: 'RESET_GAME_CLOCK' }
  | { type: 'SET_GAME_CLOCK'; seconds: number }
  // Shot Clock
  | { type: 'START_SHOT_CLOCK' }
  | { type: 'STOP_SHOT_CLOCK' }
  | { type: 'RESET_SHOT_CLOCK' }
  | { type: 'SET_SHOT_CLOCK_ENABLED'; enabled: boolean }
  // Internal tick
  | { type: 'CLOCK_TICK'; deltaMs: number }
  // Fouls (team-level)
  | { type: 'ADD_FOUL';      team: 'home' | 'away' }
  | { type: 'SUBTRACT_FOUL'; team: 'home' | 'away' }
  // Timeouts
  | { type: 'USE_TIMEOUT';     team: 'home' | 'away'; kind: 'full' | 'twenty' }
  | { type: 'RESTORE_TIMEOUT'; team: 'home' | 'away'; kind: 'full' | 'twenty' }
  // Period
  | { type: 'ADVANCE_PERIOD' }
  // Team Config
  | { type: 'SET_TEAM_CONFIG'; team: 'home' | 'away'; config: Partial<TeamConfig> }
  // Preset / Game
  | { type: 'LOAD_PRESET'; preset: GameConfig }
  | { type: 'NEW_GAME'; clearTeams: boolean }
  // Volume
  | { type: 'SET_VOLUME'; level: number }
  // Possession
  | { type: 'SET_POSSESSION'; team: 'home' | 'away' | null }
  // Players
  | { type: 'ADD_PLAYER';    team: 'home' | 'away'; player: Player }
  | { type: 'REMOVE_PLAYER'; team: 'home' | 'away'; playerId: string }
  | { type: 'ADD_PLAYER_FOUL';      team: 'home' | 'away'; playerId: string }
  | { type: 'SUBTRACT_PLAYER_FOUL'; team: 'home' | 'away'; playerId: string }
  | { type: 'ADD_PLAYER_POINTS';    team: 'home' | 'away'; playerId: string; points: 1 | 2 | 3 }
  | { type: 'ADD_PLAYER_REBOUND';   team: 'home' | 'away'; playerId: string }
  | { type: 'ADD_PLAYER_ASSIST';    team: 'home' | 'away'; playerId: string }
  | { type: 'UPDATE_PLAYER_NAME';   team: 'home' | 'away'; playerId: string; name: string }
  | { type: 'UPDATE_PLAYER_NUMBER'; team: 'home' | 'away'; playerId: string; number: string }
  | { type: 'TOGGLE_PLAYER_ACTIVE'; team: 'home' | 'away'; playerId: string }
  // Utility
  | { type: 'SWITCH_SIDES' }
  | { type: 'LOAD_LIGA_TEAMS'; home: Pick<TeamState, 'config' | 'players'>; away: Pick<TeamState, 'config' | 'players'>; ligaId: string; ligaName: string }
  // Timeout countdown
  | { type: 'START_TIMEOUT'; team: 'home' | 'away' }
  | { type: 'TIMEOUT_TICK'; deltaMs: number }
  | { type: 'END_TIMEOUT' }
  // Sponsors
  | { type: 'SET_SPONSOR_LOGOS'; logos: string[] }
  // Undo (handled at store level, not in reducer)
  | { type: 'UNDO' }
  // Extended player stats (Requirement 13)
  | { type: 'ADD_PLAYER_STAT';      team: 'home' | 'away'; playerId: string; stat: 'steals' | 'blocks' | 'fga' | 'fgm' | 'rebounds' | 'assists' | 'points' | 'fouls' }
  | { type: 'SUBTRACT_PLAYER_STAT'; team: 'home' | 'away'; playerId: string; stat: 'steals' | 'blocks' | 'fga' | 'fgm' | 'rebounds' | 'assists' | 'points' | 'fouls' }
  // Team turnovers (Requirement 14)
  | { type: 'ADD_TURNOVER';      team: 'home' | 'away' }
  | { type: 'SUBTRACT_TURNOVER'; team: 'home' | 'away' }
  // Period snapshot (Requirement 17)
  | { type: 'CAPTURE_PERIOD_SNAPSHOT' }
  // Player photo (Requirement 16)
  | { type: 'ASSIGN_PLAYER_PHOTO'; team: 'home' | 'away'; playerId: string; photoPath: string | null }
  // Show player photos on scoreboard toggle (Requirement 16.4)
  | { type: 'TOGGLE_SHOW_PHOTOS_ON_SCOREBOARD'; enabled: boolean }
  // Authentication / session (Requirement 28)
  | { type: 'AUTH_LOGIN';           username: string; password: string }
  | { type: 'AUTH_LOGOUT' }
  // User management (Requirement 28)
  | { type: 'USER_LIST' }
  | { type: 'USER_CREATE';          username: string; passwordHash: string; role: Role }
  | { type: 'USER_UPDATE';          userId: string; updates: Partial<Pick<UserAccount, 'username' | 'role'>> }
  | { type: 'USER_DELETE';          userId: string }
  | { type: 'USER_CHANGE_PASSWORD'; userId: string; newPasswordHash: string }
  // Backup / restore (Requirement 29)
  | { type: 'BACKUP_CREATE';        destinationPath: string }
  | { type: 'BACKUP_RESTORE';       archivePath: string }
  | { type: 'BACKUP_SCHEDULE_SET';  config: BackupScheduleConfig }
  // Cloud sync (Requirement 30)
  | { type: 'CLOUD_SYNC_CONFIGURE'; config: CloudSyncConfig }
  | { type: 'CLOUD_SYNC_NOW' }
  // Overlay / streaming (Requirements 33–34)
  | { type: 'OVERLAY_CONFIG_SET';   config: OverlayConfig }
  | { type: 'RTMP_CONFIG_SET';      config: RtmpConfig }
  | { type: 'RTMP_START' }
  | { type: 'RTMP_STOP' }
  // REST API keys (Requirement 35)
  | { type: 'API_KEY_CREATE'; label: string }
  | { type: 'API_KEY_REVOKE';  keyId: string };

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Role and ActionCategory — RBAC (Requirement 28)
// ---------------------------------------------------------------------------

/** The four user roles supported by the application. */
export type Role = 'Admin' | 'Scorekeeper' | 'Coach' | 'Viewer';

/**
 * The 10 action categories used for RBAC permission checks.
 * Each IPC command maps to exactly one of these categories.
 */
export type ActionCategory =
  | 'SCORING'
  | 'CLOCK'
  | 'FOULS'
  | 'TIMEOUTS'
  | 'PLAYER_STATS'
  | 'LIGA_CONFIG'
  | 'USER_MGMT'
  | 'SYSTEM'
  | 'VIEWER'
  | 'STREAMING';

// ---------------------------------------------------------------------------
// Extended Player / Team Statistics (Requirements 13–17, 21)
// ---------------------------------------------------------------------------

// SubstitutionEntry is defined above (near the Player interface).

/**
 * Full in-game per-player statistics.
 * Extends the lightweight Player type with extended tracking fields.
 */
export interface PlayerStats {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fga: number;          // field goal attempts
  fgm: number;          // field goal makes (fgm <= fga always)
  fouls: number;
  active: boolean;
  jerseyNumber: string | null;
  photoPath: string | null;
  minutesPlayed: number; // seconds of game-clock time while active
  substitutions: SubstitutionEntry[];
}

/**
 * Team-level stats — turnovers (FG% and total rebounds are derived).
 */
export interface TeamStats {
  turnovers: number;    // >= 0, reset to 0 on NEW_GAME
}

/**
 * Snapshot of all player stats at the end of a period.
 * Used for box-score per-period breakdown (Requirement 17).
 */
export interface PeriodSnapshot {
  period: number;
  teamId: string;       // 'home' | 'away' or Liga team id
  playerSnapshots: PlayerStats[];
}

// ---------------------------------------------------------------------------
// Game Log (Requirement 18)
// ---------------------------------------------------------------------------

/** Final scores stored in a game log record. */
export interface FinalScores {
  home: number;
  away: number;
}

/**
 * A completed game record persisted to disk.
 */
export interface GameLogRecord {
  id: string;
  ligaId: string;
  date: string;                  // ISO 8601
  homeTeam: string;              // team name
  awayTeam: string;              // team name
  finalScores: FinalScores;
  playerStats: Record<string, PlayerStats>; // keyed by playerId
  events: GameEvent[];
  periodSnapshots: PeriodSnapshot[];
  scheduledGameId?: string;      // link to ScheduledGame if available
  attendance?: number;           // 0–99999, absent when not recorded
}

// ---------------------------------------------------------------------------
// Schedule Management (Requirements 24–27)
// ---------------------------------------------------------------------------

/** Status of a scheduled game entry. */
export type ScheduledGameStatus = 'Scheduled' | 'InProgress' | 'Completed';

/** A scheduled game entry in a Liga. */
export interface ScheduledGame {
  id: string;
  ligaId: string;
  date: string;                  // ISO 8601 date string
  homeTeamId: string;
  awayTeamId: string;
  venueId?: string;
  courtId?: string;              // only present when venueId is set
  assignedStaff: string[];       // array of StaffMember ids
  status: ScheduledGameStatus;
  gameLogId?: string;            // linked game log id when completed
  attendance?: number;           // 0–99999
}

/** A venue record. */
export interface Venue {
  id: string;
  name: string;                  // 1–80 chars
  address?: string;              // up to 200 chars
}

/** A staff member (referee, scorekeeper, etc.). */
export interface StaffMember {
  id: string;
  name: string;                  // 1–50 chars
  role: string;                  // e.g. 'Referee', 'Scorekeeper', or custom up to 30 chars
}

// ---------------------------------------------------------------------------
// User Accounts (Requirement 28)
// ---------------------------------------------------------------------------

/** A user account stored by RoleStore. */
export interface UserAccount {
  id: string;
  username: string;
  passwordHash: string;          // bcrypt hash — never store plain text
  role: Role;
  createdAt: string;             // ISO 8601
  failedAttempts: number;        // reset to 0 on successful login or lockout expiry
  lockedUntil?: string;          // ISO 8601; absent when not locked
}

// ---------------------------------------------------------------------------
// Audit Log (Requirement 31)
// ---------------------------------------------------------------------------

/** A single entry in the append-only audit log. */
export interface AuditEntry {
  id: string;
  timestamp: string;             // ISO 8601 UTC
  username: string;
  role: Role;
  actionType: string;            // command type or API endpoint
  entityId: string;              // affected entity id (e.g. playerId, ligaId)
  previousValue: unknown;        // serialised previous state
  newValue: unknown;             // serialised new state
}

/** Filter parameters for querying the audit log. */
export interface AuditFilter {
  fromDate?: string;             // ISO 8601
  toDate?: string;               // ISO 8601
  username?: string;
  actionType?: string;
}

// ---------------------------------------------------------------------------
// Backup & Recovery (Requirement 29)
// ---------------------------------------------------------------------------

/** Manifest file included in every backup archive. */
export interface BackupManifest {
  createdAt: string;             // ISO 8601
  appVersion: string;
  files: string[];               // relative paths of all included files
}

/** Admin-configured automatic backup schedule. */
export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  destinationFolder: string;
}

// ---------------------------------------------------------------------------
// Offline Sync (Requirement 30)
// ---------------------------------------------------------------------------

/** A queued local change pending upload to the cloud endpoint. */
export interface PendingChange {
  id: string;
  timestamp: string;             // ISO 8601 UTC
  entityType: string;            // e.g. 'liga', 'gameLog', 'roster'
  entityId: string;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: unknown;              // serialised entity or delta
}

// ---------------------------------------------------------------------------
// Cloud Sync (Requirement 30)
// ---------------------------------------------------------------------------

/** Admin-configured cloud synchronisation settings. */
export interface CloudSyncConfig {
  enabled: boolean;
  endpointUrl: string;           // must start with https://
  apiKey: string;                // encrypted at rest via safeStorage
}

// ---------------------------------------------------------------------------
// Live Streaming / Overlay (Requirements 33–34)
// ---------------------------------------------------------------------------

/** Configuration for the browser-source overlay webpage. */
export interface OverlayConfig {
  visibleElements: string[];     // e.g. ['score', 'clock', 'period', 'fouls']
  fontScaleFactor: number;       // e.g. 1.0 = 100%
  backgroundAlpha: number;       // 0.0 = fully transparent, 1.0 = fully opaque
}

/** RTMP streaming destination configuration. */
export interface RtmpConfig {
  destinationUrl: string;        // rtmp:// URL
  streamKey: string;
}

// ---------------------------------------------------------------------------
// REST API Keys (Requirement 35)
// ---------------------------------------------------------------------------

/** An API key record issued to an external system. */
export interface ApiKey {
  id: string;
  label: string;                 // human-readable description
  keyHash: string;               // bcrypt hash of the raw key
  createdAt: string;             // ISO 8601
  active: boolean;
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
  foulOutLimit: 6,
  fullTimeoutsPerTeam: 7,
  twentySecTimeoutsPerTeam: 1,
  timeoutDurationSeconds: 60,
} as const;

export const FIBA_RULES: GameConfig = {
  periodDurationMinutes: 10,
  periodCount: 4,
  overtimeDurationMinutes: 5,
  shotClockDurationSeconds: 24,
  bonusThreshold: 4,
  foulOutLimit: 5,
  fullTimeoutsPerTeam: 5,
  twentySecTimeoutsPerTeam: 0,
  timeoutDurationSeconds: 60,
} as const;

// ---------------------------------------------------------------------------
// DEFAULT_GAME_STATE factory
// ---------------------------------------------------------------------------

export function makeDefaultPlayer(): Player {
  return {
    id: '', number: '', name: '', fouls: 0, points: 0, rebounds: 0, assists: 0,
    active: true, fouledOut: false,
    steals: 0, blocks: 0, fga: 0, fgm: 0, minutesPlayed: 0, substitutions: [],
    photoPath: null,
  };
}

export function DEFAULT_GAME_STATE(): GameState {
  const config: GameConfig = { ...NBA_RULES };
  const defaultTeam = (name: string, color: string): TeamState => ({
    config: { name, color, logoPath: null, playerImagePath: null },
    score: 0,
    fouls: 0,
    turnovers: 0,
    timeouts: {
      fullRemaining: config.fullTimeoutsPerTeam,
      twentyRemaining: config.twentySecTimeoutsPerTeam,
      firstHalfUsed: 0,
      secondHalfUsed: 0,
      overtimeUsed: 0,
    },
    players: [],
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
    possession: null,
    events: [],
    ligaId: null,
    ligaName: null,
    timeout: null,
    sponsorLogos: [],
    periodSnapshots: [],
    showPhotosOnScoreboard: false,
  };
}
