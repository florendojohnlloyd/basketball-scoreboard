/**
 * Unit tests for analytics.ts — computeSeasonAverages (Requirement 19)
 *                             — computeLeaderboards   (Requirement 20)
 */

import { describe, test, expect } from 'vitest'
import { computeSeasonAverages, computeLeaderboards } from '../analytics'
import type { GameLogRecord, PlayerStats } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayerStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    fga: 0,
    fgm: 0,
    fouls: 0,
    active: true,
    jerseyNumber: null,
    photoPath: null,
    minutesPlayed: 0,
    substitutions: [],
    ...overrides,
  }
}

function makeLog(
  overrides: Partial<GameLogRecord> & { playerStats: Record<string, PlayerStats> }
): GameLogRecord {
  return {
    id: `log-${Math.random().toString(36).slice(2)}`,
    ligaId: 'liga-1',
    date: new Date().toISOString(),
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    finalScores: { home: 80, away: 70 },
    events: [],
    periodSnapshots: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Req 19.4 — empty logs → "No games recorded" message (no player rows)
// ---------------------------------------------------------------------------

describe('computeSeasonAverages — empty logs', () => {
  test('returns empty player averages when no game logs exist', () => {
    const result = computeSeasonAverages([])
    expect(result.playerAverages).toHaveLength(0)
  })

  test('team averages have gamesPlayed = 0 when no logs exist', () => {
    const result = computeSeasonAverages([])
    expect(result.homeTeamAverages.gamesPlayed).toBe(0)
    expect(result.awayTeamAverages.gamesPlayed).toBe(0)
  })

  test('team FG% is null when no logs exist', () => {
    const result = computeSeasonAverages([])
    expect(result.homeTeamAverages.fgPct).toBeNull()
    expect(result.awayTeamAverages.fgPct).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Req 19.2 — per-player averages: sum ÷ games played
// ---------------------------------------------------------------------------

describe('computeSeasonAverages — per-player averages', () => {
  test('computes correct per-game averages for a player across two games', () => {
    const log1 = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 20, rebounds: 5, assists: 4, steals: 2, blocks: 1, fga: 10, fgm: 8 }),
      },
    })
    const log2 = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 10, rebounds: 3, assists: 2, steals: 0, blocks: 0, fga: 8, fgm: 5 }),
      },
    })

    const result = computeSeasonAverages([log1, log2])
    const avg = result.playerAverages.find(p => p.playerId === 'player-1')
    expect(avg).toBeDefined()
    expect(avg!.gamesPlayed).toBe(2)
    expect(avg!.pointsPerGame).toBe(15.0)       // (20 + 10) / 2
    expect(avg!.reboundsPerGame).toBe(4.0)      // (5 + 3) / 2
    expect(avg!.assistsPerGame).toBe(3.0)       // (4 + 2) / 2
    expect(avg!.stealsPerGame).toBe(1.0)        // (2 + 0) / 2
    expect(avg!.blocksPerGame).toBe(0.5)        // (1 + 0) / 2
  })

  test('FG% is computed as fgm/fga * 100 across all games', () => {
    // Game 1: 8/10 = 80%, Game 2: 5/8 = 62.5% → combined (13/18) = 72.2%
    const log1 = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 20, fga: 10, fgm: 8 }),
      },
    })
    const log2 = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 10, fga: 8, fgm: 5 }),
      },
    })

    const result = computeSeasonAverages([log1, log2])
    const avg = result.playerAverages.find(p => p.playerId === 'player-1')
    expect(avg!.fgPct).toBeCloseTo((13 / 18) * 100, 1)
  })

  test('FG% is null when player has zero FGA across all games', () => {
    const log = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 5, fga: 0, fgm: 0 }),
      },
    })

    const result = computeSeasonAverages([log])
    const avg = result.playerAverages.find(p => p.playerId === 'player-1')
    expect(avg!.fgPct).toBeNull()
  })

  test('player who never appeared in any game is excluded from averages', () => {
    // All stats are 0 — player did not appear
    const log = makeLog({
      playerStats: {
        'ghost-player': makePlayerStats({ points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fga: 0, fgm: 0 }),
      },
    })

    const result = computeSeasonAverages([log])
    const ghost = result.playerAverages.find(p => p.playerId === 'ghost-player')
    expect(ghost).toBeUndefined()
  })

  test('player appearance counted only for games they participated in', () => {
    // Player appears in game 1 but not game 2
    const log1 = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 20, fga: 5, fgm: 3 }),
      },
    })
    const log2 = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fga: 0, fgm: 0 }),
      },
    })

    const result = computeSeasonAverages([log1, log2])
    const avg = result.playerAverages.find(p => p.playerId === 'player-1')
    // Only 1 game played, not 2
    expect(avg!.gamesPlayed).toBe(1)
    expect(avg!.pointsPerGame).toBe(20.0)
  })

  test('multiple players are tracked independently', () => {
    const log = makeLog({
      playerStats: {
        'player-1': makePlayerStats({ points: 30, rebounds: 8 }),
        'player-2': makePlayerStats({ points: 15, rebounds: 3 }),
      },
    })

    const result = computeSeasonAverages([log])
    expect(result.playerAverages).toHaveLength(2)
    const p1 = result.playerAverages.find(p => p.playerId === 'player-1')
    const p2 = result.playerAverages.find(p => p.playerId === 'player-2')
    expect(p1!.pointsPerGame).toBe(30.0)
    expect(p2!.pointsPerGame).toBe(15.0)
  })

  test('player averages are sorted by points per game descending', () => {
    const log = makeLog({
      playerStats: {
        'low-scorer': makePlayerStats({ points: 5 }),
        'high-scorer': makePlayerStats({ points: 25 }),
        'mid-scorer':  makePlayerStats({ points: 15 }),
      },
    })

    const result = computeSeasonAverages([log])
    const ppgs = result.playerAverages.map(p => p.pointsPerGame)
    for (let i = 0; i < ppgs.length - 1; i++) {
      expect(ppgs[i]).toBeGreaterThanOrEqual(ppgs[i + 1])
    }
  })
})

// ---------------------------------------------------------------------------
// Req 19.3 — per-team averages
// ---------------------------------------------------------------------------

describe('computeSeasonAverages — per-team averages', () => {
  test('home team points per game is computed correctly', () => {
    const log1 = makeLog({ finalScores: { home: 80, away: 70 }, playerStats: {} })
    const log2 = makeLog({ finalScores: { home: 90, away: 60 }, playerStats: {} })

    const result = computeSeasonAverages([log1, log2])
    expect(result.homeTeamAverages.gamesPlayed).toBe(2)
    expect(result.homeTeamAverages.pointsPerGame).toBe(85.0) // (80 + 90) / 2
  })

  test('away team points per game is computed correctly', () => {
    const log1 = makeLog({ finalScores: { home: 80, away: 70 }, playerStats: {} })
    const log2 = makeLog({ finalScores: { home: 90, away: 60 }, playerStats: {} })

    const result = computeSeasonAverages([log1, log2])
    expect(result.awayTeamAverages.gamesPlayed).toBe(2)
    expect(result.awayTeamAverages.pointsPerGame).toBe(65.0) // (70 + 60) / 2
  })

  test('team FG% is null when no shot attempts recorded', () => {
    const log = makeLog({
      finalScores: { home: 60, away: 55 },
      playerStats: {},
      periodSnapshots: [],
    })

    const result = computeSeasonAverages([log])
    expect(result.homeTeamAverages.fgPct).toBeNull()
  })

  test('team names are taken from logs', () => {
    const log = makeLog({
      homeTeam: 'Lakers',
      awayTeam: 'Celtics',
      playerStats: {},
    })

    const result = computeSeasonAverages([log])
    expect(result.homeTeamAverages.teamName).toBe('Lakers')
    expect(result.awayTeamAverages.teamName).toBe('Celtics')
  })
})

// ---------------------------------------------------------------------------
// Req 19.5 — no cached state (pure function)
// ---------------------------------------------------------------------------

describe('computeSeasonAverages — purity / no caching', () => {
  test('calling twice with same input produces identical output', () => {
    const logs = [
      makeLog({ playerStats: { 'p1': makePlayerStats({ points: 20 }) } }),
    ]

    const result1 = computeSeasonAverages(logs)
    const result2 = computeSeasonAverages(logs)

    expect(result1.playerAverages[0].pointsPerGame)
      .toBe(result2.playerAverages[0].pointsPerGame)
  })

  test('adding a new log changes the averages (no stale cache)', () => {
    const log1 = makeLog({ playerStats: { 'p1': makePlayerStats({ points: 20 }) } })
    const log2 = makeLog({ playerStats: { 'p1': makePlayerStats({ points: 30 }) } })

    const resultBefore = computeSeasonAverages([log1])
    const resultAfter  = computeSeasonAverages([log1, log2])

    expect(resultBefore.playerAverages[0].pointsPerGame).toBe(20.0)
    expect(resultAfter.playerAverages[0].pointsPerGame).toBe(25.0) // (20 + 30) / 2
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('computeSeasonAverages — edge cases', () => {
  test('single game with single player', () => {
    const log = makeLog({
      playerStats: {
        'solo': makePlayerStats({ points: 18, rebounds: 7, assists: 3, steals: 2, blocks: 1, fga: 12, fgm: 7 }),
      },
    })

    const result = computeSeasonAverages([log])
    const avg = result.playerAverages[0]
    expect(avg.gamesPlayed).toBe(1)
    expect(avg.pointsPerGame).toBe(18.0)
    expect(avg.reboundsPerGame).toBe(7.0)
    expect(avg.assistsPerGame).toBe(3.0)
    expect(avg.stealsPerGame).toBe(2.0)
    expect(avg.blocksPerGame).toBe(1.0)
    expect(avg.fgPct).toBeCloseTo((7 / 12) * 100, 1)
  })

  test('averages are rounded to 1 decimal', () => {
    // 3 points across 2 games → 1.5 ppg
    const log1 = makeLog({ playerStats: { 'p': makePlayerStats({ points: 1 }) } })
    const log2 = makeLog({ playerStats: { 'p': makePlayerStats({ points: 2 }) } })

    const result = computeSeasonAverages([log1, log2])
    const avg = result.playerAverages[0]
    expect(avg.pointsPerGame).toBe(1.5)
  })
})

// ===========================================================================
// computeLeaderboards — Requirement 20
// ===========================================================================

describe('computeLeaderboards — empty logs', () => {
  test('returns empty arrays for all categories when no game logs exist', () => {
    const result = computeLeaderboards([])
    expect(result.pointsPerGame).toHaveLength(0)
    expect(result.reboundsPerGame).toHaveLength(0)
    expect(result.assistsPerGame).toHaveLength(0)
    expect(result.stealsPerGame).toHaveLength(0)
    expect(result.blocksPerGame).toHaveLength(0)
  })
})

describe('computeLeaderboards — basic ranking', () => {
  test('ranks players by points per game descending', () => {
    const log = makeLog({
      playerStats: {
        'high': makePlayerStats({ points: 30 }),
        'mid':  makePlayerStats({ points: 15 }),
        'low':  makePlayerStats({ points: 5 }),
      },
    })

    const result = computeLeaderboards([log])
    const ranks = result.pointsPerGame.map(e => e.rank)
    const values = result.pointsPerGame.map(e => e.value)

    // ranks should be sequential from 1
    expect(ranks).toEqual([1, 2, 3])
    // values descending
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i + 1])
    }
  })

  test('each entry has rank, playerName, teamName, and value', () => {
    const log = makeLog({
      playerStats: {
        'p1': makePlayerStats({ points: 20 }),
      },
    })

    const result = computeLeaderboards([log])
    const entry = result.pointsPerGame[0]
    expect(entry).toHaveProperty('rank')
    expect(entry).toHaveProperty('playerName')
    expect(entry).toHaveProperty('teamName')
    expect(entry).toHaveProperty('value')
    expect(entry.rank).toBe(1)
    expect(entry.value).toBe(20.0)
  })

  test('value is rounded to 1 decimal place', () => {
    // 10 + 20 = 30 points over 2 games → 15.0 (already integer)
    // Let's test with 10 + 21 = 31 / 2 = 15.5
    const log1 = makeLog({ playerStats: { 'p': makePlayerStats({ points: 10 }) } })
    const log2 = makeLog({ playerStats: { 'p': makePlayerStats({ points: 21 }) } })

    const result = computeLeaderboards([log1, log2])
    expect(result.pointsPerGame[0].value).toBe(15.5)
  })

  test('players who never appeared are excluded (all stats zero)', () => {
    const log = makeLog({
      playerStats: {
        'ghost': makePlayerStats({ points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fga: 0, fgm: 0 }),
        'real':  makePlayerStats({ points: 10 }),
      },
    })

    const result = computeLeaderboards([log])
    expect(result.pointsPerGame).toHaveLength(1)
    expect(result.pointsPerGame[0].playerName).toBe('real')
  })
})

describe('computeLeaderboards — top 10 cap (Req 20.2)', () => {
  test('returns at most 10 entries per category', () => {
    // Create 12 distinct players
    const playerStats: Record<string, PlayerStats> = {}
    for (let i = 1; i <= 12; i++) {
      playerStats[`player-${i}`] = makePlayerStats({ points: i * 2 })
    }

    const log = makeLog({ playerStats })
    const result = computeLeaderboards([log])

    expect(result.pointsPerGame).toHaveLength(10)
  })

  test('when fewer than 10 qualify, returns only available entries (Req 20.3)', () => {
    const log = makeLog({
      playerStats: {
        'p1': makePlayerStats({ points: 20 }),
        'p2': makePlayerStats({ points: 15 }),
      },
    })

    const result = computeLeaderboards([log])
    expect(result.pointsPerGame).toHaveLength(2)
  })
})

describe('computeLeaderboards — all five categories', () => {
  test('each category ranks independently', () => {
    const log = makeLog({
      playerStats: {
        'scorer':    makePlayerStats({ points: 30, rebounds: 1, assists: 1, steals: 1, blocks: 1 }),
        'rebounder': makePlayerStats({ points: 1, rebounds: 15, assists: 1, steals: 1, blocks: 1 }),
        'assister':  makePlayerStats({ points: 1, rebounds: 1, assists: 10, steals: 1, blocks: 1 }),
        'stealer':   makePlayerStats({ points: 1, rebounds: 1, assists: 1, steals: 5, blocks: 1 }),
        'blocker':   makePlayerStats({ points: 1, rebounds: 1, assists: 1, steals: 1, blocks: 4 }),
      },
    })

    const result = computeLeaderboards([log])

    // Each category should have rank-1 for the dominant player
    expect(result.pointsPerGame[0].playerName).toBe('scorer')
    expect(result.reboundsPerGame[0].playerName).toBe('rebounder')
    expect(result.assistsPerGame[0].playerName).toBe('assister')
    expect(result.stealsPerGame[0].playerName).toBe('stealer')
    expect(result.blocksPerGame[0].playerName).toBe('blocker')
  })

  test('per-game averages use games played, not total games', () => {
    // player-1 appears in both games, player-2 only in game 1
    const log1 = makeLog({
      playerStats: {
        'p1': makePlayerStats({ points: 20 }),
        'p2': makePlayerStats({ points: 30 }),
      },
    })
    const log2 = makeLog({
      playerStats: {
        'p1': makePlayerStats({ points: 20 }),
        // p2 absent (all zeros)
        'p2': makePlayerStats({ points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fga: 0, fgm: 0 }),
      },
    })

    const result = computeLeaderboards([log1, log2])

    const p1Entry = result.pointsPerGame.find(e => e.playerName === 'p1')
    const p2Entry = result.pointsPerGame.find(e => e.playerName === 'p2')

    expect(p1Entry).toBeDefined()
    expect(p1Entry!.value).toBe(20.0)   // (20+20)/2 = 20.0

    expect(p2Entry).toBeDefined()
    expect(p2Entry!.value).toBe(30.0)   // 30/1 = 30 (appeared in 1 game only)
  })
})

describe('computeLeaderboards — purity', () => {
  test('calling twice with same input produces identical output', () => {
    const logs = [
      makeLog({ playerStats: { 'p1': makePlayerStats({ points: 25, rebounds: 8 }) } }),
    ]

    const r1 = computeLeaderboards(logs)
    const r2 = computeLeaderboards(logs)

    expect(r1.pointsPerGame[0].value).toBe(r2.pointsPerGame[0].value)
    expect(r1.reboundsPerGame[0].value).toBe(r2.reboundsPerGame[0].value)
  })
})
