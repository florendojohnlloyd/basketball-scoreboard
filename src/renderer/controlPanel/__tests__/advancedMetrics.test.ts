// @vitest-environment jsdom
/**
 * Tests for advanced player metrics utilities (Requirement 21):
 *   computeMinutesPlayed, computePlusMinus, computeEfficiency, computePEI
 *
 * These are pure-function unit tests — no React, no store mocking needed.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { DEFAULT_GAME_STATE, makeDefaultPlayer } from '@shared/types'
import type { SubstitutionEntry } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron before importing store (avoids IPC crash in jsdom)
// ---------------------------------------------------------------------------
beforeAll(() => {
  Object.defineProperty(window, 'electron', {
    value: {
      ipcRenderer: {
        on: vi.fn(),
        invoke: vi.fn().mockResolvedValue(null),
        send: vi.fn(),
      },
    },
    writable: true,
  })
})

import {
  computeMinutesPlayed,
  computePlusMinus,
  computeEfficiency,
  computePEI,
} from '../store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<ReturnType<typeof makeDefaultPlayer>> = {}) {
  return { ...makeDefaultPlayer(), id: 'p1', ...overrides }
}

/** Build a pair of substitution entries: enter at enterMs, exit at exitMs (clock counts down) */
function subPair(enterMs: number, exitMs: number, period = 1): SubstitutionEntry[] {
  return [
    { clockMs: enterMs, period, active: true },
    { clockMs: exitMs,  period, active: false },
  ]
}

// ---------------------------------------------------------------------------
// computeMinutesPlayed
// ---------------------------------------------------------------------------

describe('computeMinutesPlayed', () => {
  it('returns 0 when substitutions is empty and player is not active', () => {
    const p = makePlayer({ active: false, substitutions: [] })
    expect(computeMinutesPlayed(p, 60_000)).toBe(0)
  })

  it('returns 0 when substitutions is empty and player is active (no entry time recorded)', () => {
    // No substitution entry means no recorded entry time — minutes = 0
    const p = makePlayer({ active: true, substitutions: [] })
    expect(computeMinutesPlayed(p, 55_000)).toBe(0)
  })

  it('computes elapsed from one completed interval', () => {
    // Clock counted down from 600_000 ms (10 min) to 540_000 ms (9 min) → 1 minute played
    const p = makePlayer({
      active: false,
      substitutions: subPair(600_000, 540_000),
    })
    const minutes = computeMinutesPlayed(p, 540_000)
    expect(minutes).toBeCloseTo(1, 5)
  })

  it('handles 30-second interval correctly', () => {
    // 600_000 → 570_000 = 30 seconds = 0.5 minutes
    const p = makePlayer({
      active: false,
      substitutions: subPair(600_000, 570_000),
    })
    expect(computeMinutesPlayed(p, 570_000)).toBeCloseTo(0.5, 5)
  })

  it('accumulates multiple completed intervals', () => {
    // Two 1-minute intervals = 2 minutes total
    const p = makePlayer({
      active: false,
      substitutions: [
        { clockMs: 600_000, period: 1, active: true },
        { clockMs: 540_000, period: 1, active: false },
        { clockMs: 480_000, period: 1, active: true },
        { clockMs: 420_000, period: 1, active: false },
      ],
    })
    expect(computeMinutesPlayed(p, 420_000)).toBeCloseTo(2, 5)
  })

  it('includes the open interval when player is currently active', () => {
    // Entered at 600_000, current clock is 540_000 → 1 minute elapsed (open interval)
    const p = makePlayer({
      active: true,
      substitutions: [{ clockMs: 600_000, period: 1, active: true }],
    })
    expect(computeMinutesPlayed(p, 540_000)).toBeCloseTo(1, 5)
  })

  it('does not include open interval when player is no longer active', () => {
    // Started at 600_000, exited at 570_000 → 0.5 min; then not active — no open interval
    const p = makePlayer({
      active: false,
      substitutions: subPair(600_000, 570_000),
    })
    // Current clock is much later — but player is not active, so no open interval
    expect(computeMinutesPlayed(p, 200_000)).toBeCloseTo(0.5, 5)
  })

  it('returns 0 when enter and exit are at the same clock value', () => {
    const p = makePlayer({
      active: false,
      substitutions: subPair(600_000, 600_000),
    })
    expect(computeMinutesPlayed(p, 600_000)).toBe(0)
  })

  it('floors to 0 when exit > enter (reversed clocks are clamped)', () => {
    // Defensive: if exit clockMs > enter clockMs (corrupt data), elapsed is 0
    const p = makePlayer({
      active: false,
      substitutions: [
        { clockMs: 500_000, period: 1, active: true },
        { clockMs: 600_000, period: 1, active: false }, // invalid: exit > enter (clock went up)
      ],
    })
    expect(computeMinutesPlayed(p, 600_000)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeEfficiency
// ---------------------------------------------------------------------------

describe('computeEfficiency', () => {
  it('returns 0 for an all-zero stat player', () => {
    const p = makePlayer()
    expect(computeEfficiency(p)).toBe(0)
  })

  it('computes: PTS + REB + AST + STL + BLK − (FGA−FGM) − Fouls', () => {
    const p = makePlayer({
      points: 20, rebounds: 5, assists: 3, steals: 2, blocks: 1,
      fga: 15, fgm: 8, fouls: 3,
    })
    // (20+5+3+2+1) − (15−8) − 3 = 31 − 7 − 3 = 21
    expect(computeEfficiency(p)).toBe(21)
  })

  it('can be negative when misses and fouls are high', () => {
    const p = makePlayer({
      points: 2, rebounds: 0, assists: 0, steals: 0, blocks: 0,
      fga: 10, fgm: 1, fouls: 5,
    })
    // 2 − (10−1) − 5 = 2 − 9 − 5 = −12
    expect(computeEfficiency(p)).toBe(-12)
  })

  it('ignores minutes played (no division)', () => {
    const p = makePlayer({
      points: 10, rebounds: 5, assists: 0, steals: 0, blocks: 0,
      fga: 8, fgm: 5, fouls: 2,
    })
    // 10+5 − (8−5) − 2 = 15 − 3 − 2 = 10
    expect(computeEfficiency(p)).toBe(10)
    // Same result regardless of minutesPlayed
    const p2 = { ...p, minutesPlayed: 999 }
    expect(computeEfficiency(p2)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// computePEI
// ---------------------------------------------------------------------------

describe('computePEI', () => {
  it('returns null when minutesPlayed is 0', () => {
    const p = makePlayer({ active: false, substitutions: [] })
    expect(computePEI(p, 60_000)).toBeNull()
  })

  it('computes PEI = efficiency / minutesPlayed', () => {
    // 2 minutes on court (clock: 600_000 → 480_000 = 120_000 ms = 2 min)
    const p = makePlayer({
      active: false,
      substitutions: subPair(600_000, 480_000),
      points: 10, rebounds: 5, assists: 3, steals: 1, blocks: 1,
      fga: 10, fgm: 6, fouls: 2,
    })
    // efficiency = 10+5+3+1+1 − (10-6) − 2 = 20 − 4 − 2 = 14
    // minutes = 2
    // PEI = 14 / 2 = 7
    const pei = computePEI(p, 480_000)
    expect(pei).not.toBeNull()
    expect(pei!).toBeCloseTo(7, 4)
  })

  it('returns a positive PEI for a good player', () => {
    // 1 minute on court
    const p = makePlayer({
      active: false,
      substitutions: subPair(600_000, 540_000),
      points: 20, rebounds: 10, assists: 5, steals: 2, blocks: 2,
      fga: 12, fgm: 8, fouls: 1,
    })
    const pei = computePEI(p, 540_000)
    expect(pei).not.toBeNull()
    expect(pei!).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// computePlusMinus
// ---------------------------------------------------------------------------

describe('computePlusMinus', () => {
  it('returns 0 when player has no substitution entries', () => {
    const gs = DEFAULT_GAME_STATE()
    const p = makePlayer({ active: false, substitutions: [] })
    expect(computePlusMinus(p, 'home', gs)).toBe(0)
  })

  it('returns 0 when there are no score events', () => {
    const gs = DEFAULT_GAME_STATE()
    // Player was on court for entire period but no scoring happened
    const p = makePlayer({
      active: true,
      substitutions: [{ clockMs: 720_000, period: 1, active: true }],
    })
    expect(computePlusMinus(p, 'home', gs)).toBe(0)
  })

  it('counts home team points scored while player is active as positive', () => {
    const gs = DEFAULT_GAME_STATE()
    const p = makePlayer({
      active: true,
      substitutions: [{ clockMs: 720_000, period: 1, active: true }],
    })
    // Add a SCORE event for home team while clock is BELOW 720_000 (player was on court)
    gs.events.push({
      id: 'e1',
      timestamp: new Date().toISOString(),
      clockMs: 680_000,   // after player entered (720_000)
      period: 1,
      type: 'SCORE',
      team: 'home',
      points: 2,
      description: '+2 home',
    })
    gs.gameClock.displayMs = 650_000
    expect(computePlusMinus(p, 'home', gs)).toBe(2)
  })

  it('counts opponent points scored while player is active as negative', () => {
    const gs = DEFAULT_GAME_STATE()
    const p = makePlayer({
      active: true,
      substitutions: [{ clockMs: 720_000, period: 1, active: true }],
    })
    gs.events.push({
      id: 'e1',
      timestamp: new Date().toISOString(),
      clockMs: 680_000,
      period: 1,
      type: 'SCORE',
      team: 'away',
      points: 3,
      description: '+3 away',
    })
    gs.gameClock.displayMs = 650_000
    expect(computePlusMinus(p, 'home', gs)).toBe(-3)
  })

  it('excludes score events before player entered (clock higher than entry)', () => {
    const gs = DEFAULT_GAME_STATE()
    const p = makePlayer({
      active: true,
      substitutions: [{ clockMs: 600_000, period: 1, active: true }],
    })
    // Score happened at 650_000 — which is BEFORE entry (clock was higher, i.e. earlier)
    gs.events.push({
      id: 'e1',
      timestamp: new Date().toISOString(),
      clockMs: 650_000,   // before player entered (at 600_000)
      period: 1,
      type: 'SCORE',
      team: 'home',
      points: 2,
      description: '+2',
    })
    gs.gameClock.displayMs = 550_000
    expect(computePlusMinus(p, 'home', gs)).toBe(0)
  })

  it('excludes score events after player exited (clock lower than exit)', () => {
    const gs = DEFAULT_GAME_STATE()
    const p = makePlayer({
      active: false,
      substitutions: subPair(600_000, 540_000),
    })
    // Score happened at 500_000 — after player exited (540_000)
    gs.events.push({
      id: 'e1',
      timestamp: new Date().toISOString(),
      clockMs: 500_000,
      period: 1,
      type: 'SCORE',
      team: 'home',
      points: 3,
      description: '+3',
    })
    gs.gameClock.displayMs = 500_000
    expect(computePlusMinus(p, 'home', gs)).toBe(0)
  })

  it('accumulates multiple scoring events across intervals', () => {
    const gs = DEFAULT_GAME_STATE()
    const p = makePlayer({
      active: true,
      substitutions: [
        { clockMs: 720_000, period: 1, active: true },
        { clockMs: 660_000, period: 1, active: false },
        { clockMs: 600_000, period: 1, active: true },
      ],
    })
    // Event in first interval: +2 home at 690_000 (after 720_000 entry, before 660_000 exit)
    gs.events.push({
      id: 'e1',
      timestamp: new Date().toISOString(),
      clockMs: 690_000,
      period: 1,
      type: 'SCORE',
      team: 'home',
      points: 2,
      description: '+2',
    })
    // Event between intervals (player on bench): +3 away at 640_000
    gs.events.push({
      id: 'e2',
      timestamp: new Date().toISOString(),
      clockMs: 640_000,
      period: 1,
      type: 'SCORE',
      team: 'away',
      points: 3,
      description: '+3',
    })
    // Event in second interval: +1 home at 580_000
    gs.events.push({
      id: 'e3',
      timestamp: new Date().toISOString(),
      clockMs: 580_000,
      period: 1,
      type: 'SCORE',
      team: 'home',
      points: 1,
      description: '+1',
    })
    gs.gameClock.displayMs = 560_000
    // +2 home (first interval) + 0 (bench) + 1 home (second interval) = +3
    expect(computePlusMinus(p, 'home', gs)).toBe(3)
  })
})
