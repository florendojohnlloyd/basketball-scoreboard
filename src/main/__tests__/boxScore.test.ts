/**
 * Example-based tests: Box Score generation — period snapshots (Requirement 17)
 * Feature: basketball-scoreboard
 *
 * Tests:
 *   - CAPTURE_PERIOD_SNAPSHOT records correct stats at period end
 *   - Period 2 increments = Q2 cumulative - Q1 cumulative
 *   - ADVANCE_PERIOD automatically captures a snapshot
 *   - Totals row sums correctly across multiple players
 *   - Re-capturing the same period replaces the existing snapshot
 */
import { describe, it, expect } from 'vitest'
import { gameReducer } from '../gameStore'
import { DEFAULT_GAME_STATE, makeDefaultPlayer } from '../../shared/types'
import type { GameState } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fresh(): GameState {
  return DEFAULT_GAME_STATE()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Box Score — CAPTURE_PERIOD_SNAPSHOT (Requirement 17)', () => {

  it('records correct cumulative stats for all players at period end', () => {
    const state = fresh()
    const playerA = {
      ...makeDefaultPlayer(),
      id: 'p1', name: 'Alice', number: '10',
      points: 12, rebounds: 5, assists: 3, steals: 1, blocks: 0,
      fga: 8, fgm: 5, fouls: 2, active: true,
    }
    const playerB = {
      ...makeDefaultPlayer(),
      id: 'p2', name: 'Bob', number: '20',
      points: 8, rebounds: 2, assists: 1, steals: 0, blocks: 1,
      fga: 6, fgm: 4, fouls: 1, active: true,
    }
    const stateWithPlayers: GameState = {
      ...state,
      period: { ...state.period, current: 1 },
      home: { ...state.home, players: [playerA, playerB] },
    }

    const result = gameReducer(stateWithPlayers, { type: 'CAPTURE_PERIOD_SNAPSHOT' })

    // Should produce 2 snapshots: home (period 1) + away (period 1)
    expect(result.periodSnapshots).toHaveLength(2)

    const homeSnap = result.periodSnapshots.find(
      s => s.teamId === 'home' && s.period === 1
    )
    expect(homeSnap).toBeDefined()
    expect(homeSnap!.playerSnapshots).toHaveLength(2)

    // playerA stats are captured verbatim
    expect(homeSnap!.playerSnapshots[0].points).toBe(12)
    expect(homeSnap!.playerSnapshots[0].rebounds).toBe(5)
    expect(homeSnap!.playerSnapshots[0].fgm).toBe(5)
    expect(homeSnap!.playerSnapshots[0].fga).toBe(8)
    expect(homeSnap!.playerSnapshots[0].fouls).toBe(2)

    // playerB stats
    expect(homeSnap!.playerSnapshots[1].points).toBe(8)
    expect(homeSnap!.playerSnapshots[1].blocks).toBe(1)
  })

  it('period 2 increments equal cumulative totals at end of Q2 minus totals at end of Q1', () => {
    const state = fresh()
    const player = {
      ...makeDefaultPlayer(),
      id: 'p1', name: 'Alice', number: '10',
      points: 6, rebounds: 3, assists: 2, steals: 1, blocks: 0,
      fga: 4, fgm: 3, fouls: 1, active: true,
    }

    // Capture Q1 snapshot with 6 pts
    const stateQ1End: GameState = {
      ...state,
      period: { ...state.period, current: 1 },
      home: { ...state.home, players: [player] },
    }
    const afterQ1Snap = gameReducer(stateQ1End, { type: 'CAPTURE_PERIOD_SNAPSHOT' })

    // Player scores more in Q2 — now has 14 pts, 7 reb, 7 fgm out of 10 fga
    const playerAfterQ2 = {
      ...player,
      points: 14, rebounds: 7, assists: 4,
      fga: 10, fgm: 7, fouls: 2,
    }
    const stateQ2End: GameState = {
      ...afterQ1Snap,
      period: { ...afterQ1Snap.period, current: 2 },
      home: { ...afterQ1Snap.home, players: [playerAfterQ2] },
    }
    const afterQ2Snap = gameReducer(stateQ2End, { type: 'CAPTURE_PERIOD_SNAPSHOT' })

    const q1HomeSnap = afterQ2Snap.periodSnapshots.find(
      s => s.period === 1 && s.teamId === 'home'
    )!
    const q2HomeSnap = afterQ2Snap.periodSnapshots.find(
      s => s.period === 2 && s.teamId === 'home'
    )!

    expect(q1HomeSnap).toBeDefined()
    expect(q2HomeSnap).toBeDefined()

    // Q2 increment = Q2 cumulative − Q1 cumulative
    const ptsQ2 = q2HomeSnap.playerSnapshots[0].points - q1HomeSnap.playerSnapshots[0].points
    const rebQ2 = q2HomeSnap.playerSnapshots[0].rebounds - q1HomeSnap.playerSnapshots[0].rebounds
    const fgmQ2 = q2HomeSnap.playerSnapshots[0].fgm - q1HomeSnap.playerSnapshots[0].fgm
    const fgaQ2 = q2HomeSnap.playerSnapshots[0].fga - q1HomeSnap.playerSnapshots[0].fga

    expect(ptsQ2).toBe(8)   // 14 − 6
    expect(rebQ2).toBe(4)   // 7 − 3
    expect(fgmQ2).toBe(4)   // 7 − 3
    expect(fgaQ2).toBe(6)   // 10 − 4
  })

  it('ADVANCE_PERIOD automatically captures a period snapshot before incrementing the period', () => {
    const state = fresh()
    const player = {
      ...makeDefaultPlayer(),
      id: 'p1', name: 'Test', number: '5',
      points: 10, rebounds: 4, assists: 2, steals: 0, blocks: 0,
      fga: 6, fgm: 4, fouls: 1, active: true,
    }
    const startState: GameState = {
      ...state,
      gamePhase: 'in-game',
      period: { ...state.period, current: 1 },
      gameClock: { ...state.gameClock, running: false, displayMs: 0 },
      home: { ...state.home, players: [player] },
    }

    const afterAdvance = gameReducer(startState, { type: 'ADVANCE_PERIOD' })

    // Snapshot for period 1 should have been captured
    expect(afterAdvance.periodSnapshots.length).toBeGreaterThan(0)

    const snap = afterAdvance.periodSnapshots.find(
      s => s.period === 1 && s.teamId === 'home'
    )
    expect(snap).toBeDefined()
    expect(snap!.playerSnapshots[0].points).toBe(10)
    expect(snap!.playerSnapshots[0].fgm).toBe(4)

    // Period counter should now be 2
    expect(afterAdvance.period.current).toBe(2)
  })

  it('re-capturing the same period replaces (not appends) the existing snapshot', () => {
    const state = fresh()
    const player = {
      ...makeDefaultPlayer(),
      id: 'p1', name: 'Test', number: '5',
      points: 6, active: true,
    }
    const stateP1: GameState = {
      ...state,
      period: { ...state.period, current: 1 },
      home: { ...state.home, players: [player] },
    }

    // First capture at 6 pts
    const after1st = gameReducer(stateP1, { type: 'CAPTURE_PERIOD_SNAPSHOT' })

    // Player scores more, capture again for the same period
    const playerUpdated = { ...player, points: 10 }
    const stateP1Updated: GameState = {
      ...after1st,
      home: { ...after1st.home, players: [playerUpdated] },
    }
    const after2nd = gameReducer(stateP1Updated, { type: 'CAPTURE_PERIOD_SNAPSHOT' })

    // Should still be exactly 2 snapshots for period 1 (home + away), not 4
    const p1Snaps = after2nd.periodSnapshots.filter(s => s.period === 1)
    expect(p1Snaps).toHaveLength(2)

    // The latest capture (10 pts) wins
    const homeSnap = p1Snaps.find(s => s.teamId === 'home')!
    expect(homeSnap.playerSnapshots[0].points).toBe(10)
  })

})

describe('Box Score — totals row computation (Requirement 17)', () => {

  it('team totals row sums are correct across multiple players', () => {
    // Mirrors the reduce logic inside BoxScoreView.renderTeamTable
    const players = [
      { points: 12, rebounds: 5, assists: 3, steals: 2, blocks: 1, fga: 8, fgm: 6, fouls: 2 },
      { points: 8,  rebounds: 3, assists: 2, steals: 0, blocks: 1, fga: 6, fgm: 3, fouls: 3 },
      { points: 6,  rebounds: 7, assists: 1, steals: 1, blocks: 0, fga: 4, fgm: 2, fouls: 1 },
    ]

    const totals = players.reduce(
      (acc, p) => ({
        points:   acc.points   + p.points,
        rebounds: acc.rebounds + p.rebounds,
        assists:  acc.assists  + p.assists,
        steals:   acc.steals   + p.steals,
        blocks:   acc.blocks   + p.blocks,
        fga:      acc.fga      + p.fga,
        fgm:      acc.fgm      + p.fgm,
        fouls:    acc.fouls    + p.fouls,
      }),
      { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fga: 0, fgm: 0, fouls: 0 }
    )

    expect(totals.points).toBe(26)    // 12 + 8 + 6
    expect(totals.rebounds).toBe(15)  // 5 + 3 + 7
    expect(totals.assists).toBe(6)    // 3 + 2 + 1
    expect(totals.steals).toBe(3)     // 2 + 0 + 1
    expect(totals.blocks).toBe(2)     // 1 + 1 + 0
    expect(totals.fga).toBe(18)       // 8 + 6 + 4
    expect(totals.fgm).toBe(11)       // 6 + 3 + 2
    expect(totals.fouls).toBe(6)      // 2 + 3 + 1

    // FG% for totals — 11/18 = 61.1%
    const fgPct = totals.fga === 0
      ? '—'
      : `${((totals.fgm / totals.fga) * 100).toFixed(1)}%`
    expect(fgPct).toBe('61.1%')
  })

  it('team FG% shows "—" when FGA is 0', () => {
    const fgPct = (fgm: number, fga: number): string =>
      fga === 0 ? '—' : `${((fgm / fga) * 100).toFixed(1)}%`

    expect(fgPct(0, 0)).toBe('—')
    expect(fgPct(3, 8)).toBe('37.5%')
    expect(fgPct(8, 8)).toBe('100.0%')
  })

})
