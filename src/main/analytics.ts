/**
 * analytics.ts — Season average computation (Requirement 19).
 *
 * Reads from persisted GameLogRecord data; no cached state is kept here.
 * Averages are recomputed every time they are requested.
 */

import type { GameLogRecord } from '../shared/types';

// ---------------------------------------------------------------------------
// Output types
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

export interface SeasonStats {
  playerAverages: PlayerSeasonAvg[];
  homeTeamAverages: TeamSeasonAvg;
  awayTeamAverages: TeamSeasonAvg;
  attendance: AttendanceStats;
}

// ---------------------------------------------------------------------------
// computeSeasonAverages
// ---------------------------------------------------------------------------

/**
 * Compute per-player and per-team season averages from an array of saved game
 * log records.  Pass all logs for a single Liga; results are recomputed each
 * call (no caching).
 *
 * Per-player averages are divided by the number of games in which the player
 * appeared (any stat > 0). Players who never appeared are excluded.
 *
 * Per-team averages are derived from team-level final scores and the
 * aggregated player stats across all logs.
 */
export function computeSeasonAverages(gameLogs: GameLogRecord[]): SeasonStats {
  if (gameLogs.length === 0) {
    const emptyTeam = (name: string): TeamSeasonAvg => ({
      teamName: name,
      gamesPlayed: 0,
      pointsPerGame: 0,
      fgPct: null,
      reboundsPerGame: 0,
      assistsPerGame: 0,
      turnoversPerGame: 0,
    });
    return {
      playerAverages: [],
      homeTeamAverages: emptyTeam(''),
      awayTeamAverages: emptyTeam(''),
      attendance: { totalAttendance: 0, gamesWithAttendance: 0, averageAttendance: 0 },
    };
  }

  // ── Per-player accumulation ──────────────────────────────────────────────
  interface PlayerAccum {
    playerName: string;
    jerseyNumber: string | null;
    teamName: string;
    gamesPlayed: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    fga: number;
    fgm: number;
  }

  const playerMap = new Map<string, PlayerAccum>();

  // ── Per-team accumulation ────────────────────────────────────────────────
  interface TeamAccum {
    teamName: string;
    games: number;
    points: number;
    fga: number;
    fgm: number;
    rebounds: number;
    assists: number;
    turnovers: number;
  }

  // We accumulate home-side and away-side independently across all logs.
  // "Home" and "away" here are log-relative (each game designates one team per side).
  const homeAccum: TeamAccum = { teamName: '', games: 0, points: 0, fga: 0, fgm: 0, rebounds: 0, assists: 0, turnovers: 0 };
  const awayAccum: TeamAccum = { teamName: '', games: 0, points: 0, fga: 0, fgm: 0, rebounds: 0, assists: 0, turnovers: 0 };

  for (const log of gameLogs) {
    // Track team names from most recent log
    homeAccum.teamName = log.homeTeam;
    awayAccum.teamName = log.awayTeam;

    homeAccum.games++;
    awayAccum.games++;
    homeAccum.points += log.finalScores.home;
    awayAccum.points += log.finalScores.away;

    // Accumulate per-player stats
    for (const [playerId, stats] of Object.entries(log.playerStats)) {
      const totalActivity =
        stats.points + stats.rebounds + stats.assists +
        stats.steals + stats.blocks + stats.fga;

      // A player "appeared" in a game when any stat > 0
      if (totalActivity === 0) continue;

      if (!playerMap.has(playerId)) {
        playerMap.set(playerId, {
          playerName: playerId, // default; may be overridden if richer data available
          jerseyNumber: stats.jerseyNumber ?? null,
          teamName: '',
          gamesPlayed: 0,
          points: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          fga: 0,
          fgm: 0,
        });
      }

      const acc = playerMap.get(playerId)!;
      acc.gamesPlayed++;
      acc.points    += stats.points;
      acc.rebounds  += stats.rebounds;
      acc.assists   += stats.assists;
      acc.steals    += stats.steals;
      acc.blocks    += stats.blocks;
      acc.fga       += stats.fga;
      acc.fgm       += stats.fgm;
      // Keep latest jersey number
      if (stats.jerseyNumber) acc.jerseyNumber = stats.jerseyNumber;
    }

    // Team-level rebounds, assists, turnovers derived from player totals per game.
    // We determine which players belong to home/away by mapping team names stored
    // in the period snapshots when available, or by iterating period snapshots.
    // Fallback: aggregate all players for both sides using finalScores as the only
    // reliable team-split signal for derived per-team stats.
    let homeFGA = 0, homeFGM = 0, homeREB = 0, homeAST = 0, homeTOV = 0;
    let awayFGA = 0, awayFGM = 0, awayREB = 0, awayAST = 0, awayTOV = 0;

    if (log.periodSnapshots && log.periodSnapshots.length > 0) {
      // Use periodSnapshots to determine home vs. away players
      const homePlayerIds = new Set<string>();
      const awayPlayerIds = new Set<string>();

      for (const snap of log.periodSnapshots) {
        const side = snap.teamId === 'home' ? 'home' : snap.teamId === 'away' ? 'away' : null;
        if (!side) continue;
        for (const ps of snap.playerSnapshots) {
          if ('jerseyNumber' in ps && ps.jerseyNumber != null) {
            // we can't recover player IDs from snapshots alone, skip team-split
          }
        }
        if (side === 'home') {
          // We know these snapshots belong to home
          snap.playerSnapshots.forEach((_, idx) => {
            // record index as placeholder — we'll use the full playerStats below
            void idx;
          });
        }
      }

      // If snapshot teamIds are 'home'/'away' strings we can split
      const homeSnap = log.periodSnapshots.filter(s => s.teamId === 'home');
      const awaySnap = log.periodSnapshots.filter(s => s.teamId === 'away');

      if (homeSnap.length > 0 || awaySnap.length > 0) {
        // Use last-period snapshot totals for each team
        const lastHomePeriod = homeSnap.reduce((mx, s) => s.period > mx.period ? s : mx, homeSnap[0] ?? { period: 0, playerSnapshots: [] });
        const lastAwayPeriod = awaySnap.reduce((mx, s) => s.period > mx.period ? s : mx, awaySnap[0] ?? { period: 0, playerSnapshots: [] });

        for (const ps of lastHomePeriod.playerSnapshots ?? []) {
          homeFGA += ps.fga;
          homeFGM += ps.fgm;
          homeREB += ps.rebounds;
          homeAST += ps.assists;
        }
        for (const ps of lastAwayPeriod.playerSnapshots ?? []) {
          awayFGA += ps.fga;
          awayFGM += ps.fgm;
          awayREB += ps.rebounds;
          awayAST += ps.assists;
        }
      }
    } else {
      // No snapshots: sum all player stats, can't split by team
      for (const stats of Object.values(log.playerStats)) {
        homeFGA += stats.fga;
        homeFGM += stats.fgm;
        homeREB += stats.rebounds;
        homeAST += stats.assists;
      }
      // Away will be 0 — unavoidable without team-player mapping
    }

    homeAccum.fga += homeFGA;
    homeAccum.fgm += homeFGM;
    homeAccum.rebounds += homeREB;
    homeAccum.assists  += homeAST;
    homeAccum.turnovers += homeTOV;

    awayAccum.fga += awayFGA;
    awayAccum.fgm += awayFGM;
    awayAccum.rebounds += awayREB;
    awayAccum.assists  += awayAST;
    awayAccum.turnovers += awayTOV;
  }

  // ── Build player averages ────────────────────────────────────────────────
  const playerAverages: PlayerSeasonAvg[] = [];
  for (const [playerId, acc] of playerMap.entries()) {
    const gp = acc.gamesPlayed;
    const fgPct = acc.fga > 0 ? round1((acc.fgm / acc.fga) * 100) : null;
    playerAverages.push({
      playerId,
      playerName: acc.playerName,
      jerseyNumber: acc.jerseyNumber,
      teamName: acc.teamName,
      gamesPlayed: gp,
      pointsPerGame:    round1(acc.points   / gp),
      reboundsPerGame:  round1(acc.rebounds / gp),
      assistsPerGame:   round1(acc.assists  / gp),
      stealsPerGame:    round1(acc.steals   / gp),
      blocksPerGame:    round1(acc.blocks   / gp),
      fgPct,
    });
  }

  // Sort by points per game descending
  playerAverages.sort((a, b) => b.pointsPerGame - a.pointsPerGame);

  // ── Build team averages ──────────────────────────────────────────────────
  function buildTeamAvg(acc: TeamAccum): TeamSeasonAvg {
    const gp = acc.games;
    return {
      teamName: acc.teamName,
      gamesPlayed: gp,
      pointsPerGame:     gp > 0 ? round1(acc.points    / gp) : 0,
      fgPct:             acc.fga > 0 ? round1((acc.fgm / acc.fga) * 100) : null,
      reboundsPerGame:   gp > 0 ? round1(acc.rebounds  / gp) : 0,
      assistsPerGame:    gp > 0 ? round1(acc.assists   / gp) : 0,
      turnoversPerGame:  gp > 0 ? round1(acc.turnovers / gp) : 0,
    };
  }

  // ── Compute attendance stats (Requirement 27.5) ─────────────────────────
  let totalAttendance = 0;
  let gamesWithAttendance = 0;
  for (const log of gameLogs) {
    if (log.attendance != null && log.attendance >= 0) {
      totalAttendance += log.attendance;
      gamesWithAttendance++;
    }
  }
  const averageAttendance = gamesWithAttendance > 0
    ? round1(totalAttendance / gamesWithAttendance)
    : 0;

  return {
    playerAverages,
    homeTeamAverages: buildTeamAvg(homeAccum),
    awayTeamAverages: buildTeamAvg(awayAccum),
    attendance: { totalAttendance, gamesWithAttendance, averageAttendance },
  };
}

// ---------------------------------------------------------------------------
// Leaderboard types (Requirement 20)
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
// computeLeaderboards (Requirement 20)
// ---------------------------------------------------------------------------

/**
 * Compute top-10 leaderboards for five per-game stat categories.
 *
 * Rules:
 * - Only players with ≥ 1 game appearance (any stat > 0) are included.
 * - Each category is ranked independently, descending, top 10.
 * - Values are rounded to 1 decimal place.
 * - Averages are re-derived from the logs — no cached state.
 */
export function computeLeaderboards(gameLogs: GameLogRecord[]): Leaderboards {
  if (gameLogs.length === 0) {
    return emptyLeaderboards();
  }

  // Accumulate per-player totals (same logic as computeSeasonAverages)
  interface PlayerAccum {
    playerName: string;
    teamName: string;
    gamesPlayed: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
  }

  const playerMap = new Map<string, PlayerAccum>();

  for (const log of gameLogs) {
    for (const [playerId, stats] of Object.entries(log.playerStats)) {
      const totalActivity =
        stats.points + stats.rebounds + stats.assists +
        stats.steals + stats.blocks + stats.fga;

      // A player "appeared" in a game when any stat > 0
      if (totalActivity === 0) continue;

      if (!playerMap.has(playerId)) {
        playerMap.set(playerId, {
          playerName: playerId,
          teamName: '',
          gamesPlayed: 0,
          points: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
        });
      }

      const acc = playerMap.get(playerId)!;
      acc.gamesPlayed++;
      acc.points   += stats.points;
      acc.rebounds += stats.rebounds;
      acc.assists  += stats.assists;
      acc.steals   += stats.steals;
      acc.blocks   += stats.blocks;
    }
  }

  // Build per-category leaderboard
  function buildLeaderboard(
    getValue: (acc: PlayerAccum) => number
  ): LeaderboardEntry[] {
    const entries: Array<{ playerId: string; acc: PlayerAccum; value: number }> = [];

    for (const [playerId, acc] of playerMap.entries()) {
      if (acc.gamesPlayed === 0) continue;
      const value = round1(getValue(acc) / acc.gamesPlayed);
      entries.push({ playerId, acc, value });
    }

    // Sort descending, take top 10
    entries.sort((a, b) => b.value - a.value);
    const top10 = entries.slice(0, 10);

    return top10.map((e, idx) => ({
      rank: idx + 1,
      playerId: e.playerId,
      playerName: e.acc.playerName,
      teamName: e.acc.teamName,
      value: e.value,
    }));
  }

  return {
    pointsPerGame:   buildLeaderboard(acc => acc.points),
    reboundsPerGame: buildLeaderboard(acc => acc.rebounds),
    assistsPerGame:  buildLeaderboard(acc => acc.assists),
    stealsPerGame:   buildLeaderboard(acc => acc.steals),
    blocksPerGame:   buildLeaderboard(acc => acc.blocks),
  };
}

function emptyLeaderboards(): Leaderboards {
  const empty: LeaderboardEntry[] = [];
  return {
    pointsPerGame:   empty,
    reboundsPerGame: empty,
    assistsPerGame:  empty,
    stealsPerGame:   empty,
    blocksPerGame:   empty,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
