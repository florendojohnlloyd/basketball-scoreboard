/**
 * Report data shapes shared by the main process (analytics.ts, exportService.ts)
 * and the renderer (BoxScoreView, SeasonStatsView).
 *
 * They live in src/shared so the renderer can import them without pulling
 * main-process files into the web TypeScript project.
 */

// ---------------------------------------------------------------------------
// Season analytics (Requirement 19)
// ---------------------------------------------------------------------------

export interface PlayerSeasonAvg {
  /** Player ID (key from playerStats map) */
  playerId: string;
  /** Display name — best-effort from playerStats key; callers may override */
  playerName: string;
  jerseyNumber: string | null;
  teamName: string;
  gamesPlayed: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  /** FG% as 0–100, or null when FGA = 0 across all games */
  fgPct: number | null;
}

export interface TeamSeasonAvg {
  teamName: string;
  gamesPlayed: number;
  pointsPerGame: number;
  /** FG% as 0–100, or null when totalFGA = 0 */
  fgPct: number | null;
  reboundsPerGame: number;
  assistsPerGame: number;
  turnoversPerGame: number;
}

export interface AttendanceStats {
  totalAttendance: number;
  gamesWithAttendance: number;
  averageAttendance: number;
}

// ---------------------------------------------------------------------------
// Leaderboards (Requirement 20)
// ---------------------------------------------------------------------------

export type LeaderboardCategory =
  | 'pointsPerGame'
  | 'reboundsPerGame'
  | 'assistsPerGame'
  | 'stealsPerGame'
  | 'blocksPerGame';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  teamName: string;
  /** Stat value rounded to 1 decimal place */
  value: number;
}

export type Leaderboards = Record<LeaderboardCategory, LeaderboardEntry[]>;

// ---------------------------------------------------------------------------
// PDF / Excel export payloads (Requirement 22)
// ---------------------------------------------------------------------------

export interface ExportPlayerRow {
  jerseyNumber: string;
  name: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fgm: number;
  fta: number;
  ftm: number;
  fouls: number;
  fgPct: string; // pre-formatted e.g. "53.3%" or "—"
  ftPct: string; // pre-formatted FT% e.g. "85.0%" or "—"
}

export interface ExportTeamData {
  teamName: string;
  rows: ExportPlayerRow[];
  totals: Omit<ExportPlayerRow, 'jerseyNumber' | 'name' | 'fgPct' | 'ftPct'> & { fgPct: string; ftPct: string };
}

/** Shape for Box Score export */
export interface BoxScoreExportData {
  kind: 'box-score';
  ligaName: string;
  gameDate: string;  // human-readable date string
  homeTeam: ExportTeamData;
  awayTeam: ExportTeamData;
  /** Score per quarter / set up to the final (optional for backward compatibility) */
  periodScores?: ExportPeriodScores;
}

/** Score per period (Q1..Q4/OT or SET 1..5) for exports */
export interface ExportPeriodScores {
  labels: string[];
  home: number[];
  away: number[];
  finalLabel: string;
  homeFinal: number;
  awayFinal: number;
}

export interface ExportPlayerAvgRow {
  jerseyNumber: string;
  name: string;
  gamesPlayed: number;
  ptsPerGame: number;
  rebPerGame: number;
  astPerGame: number;
  stlPerGame: number;
  blkPerGame: number;
  fgPct: string; // "—" or "53.3%"
}

export interface ExportTeamAvgRow {
  teamName: string;
  gamesPlayed: number;
  ppg: number;
  fgPct: string;
  rpg: number;
  apg: number;
  topg: number;
}

/** Shape for Season Stats export */
export interface SeasonStatsExportData {
  kind: 'season-stats';
  ligaName: string;
  playerAverages: ExportPlayerAvgRow[];
  teamAverages: ExportTeamAvgRow[];
}

export type ExportData = BoxScoreExportData | SeasonStatsExportData;
