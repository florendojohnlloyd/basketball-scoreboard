/**
 * Example-based integration tests for ClockEngine.
 * Feature: basketball-scoreboard
 *
 * Uses Vitest fake timers to simulate time passage without real delays.
 * The ClockEngine fires a setInterval every 100 ms per clock, dispatching
 * CLOCK_TICK commands with the actual elapsed ms (drift-compensated).
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { createClockEngine } from '../clockEngine'
import type { CommandType } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect CLOCK_TICK dispatches into an array for assertions. */
function makeDispatch() {
  const calls: { deltaMs: number }[] = []
  const dispatch = (cmd: CommandType) => {
    if (cmd.type === 'CLOCK_TICK') {
      calls.push({ deltaMs: cmd.deltaMs })
    }
  }
  return { calls, dispatch }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Test: starting the game clock produces ~10 CLOCK_TICK dispatches per 1000 ms
// ---------------------------------------------------------------------------

describe('ClockEngine — game clock ticking', () => {
  test('advancing 1000 ms produces approximately 10 CLOCK_TICK dispatches', () => {
    const { calls, dispatch } = makeDispatch()
    const engine = createClockEngine(dispatch)

    engine.startGameClock()
    vi.advanceTimersByTime(1000)

    // Expect approximately 10 ticks (one per 100 ms interval)
    expect(calls.length).toBeGreaterThanOrEqual(9)
    expect(calls.length).toBeLessThanOrEqual(11)
  })

  test('each CLOCK_TICK dispatched has deltaMs approximately 100 ms', () => {
    const { calls, dispatch } = makeDispatch()
    const engine = createClockEngine(dispatch)

    engine.startGameClock()
    vi.advanceTimersByTime(1000)

    // Every tick should report close to 100 ms
    for (const tick of calls) {
      expect(tick.deltaMs).toBeGreaterThanOrEqual(90)
      expect(tick.deltaMs).toBeLessThanOrEqual(110)
    }
  })
})

// ---------------------------------------------------------------------------
// Test: stopping the game clock halts further dispatches
// ---------------------------------------------------------------------------

describe('ClockEngine — stopping the game clock', () => {
  test('no further CLOCK_TICK dispatches after stopGameClock()', () => {
    const { calls, dispatch } = makeDispatch()
    const engine = createClockEngine(dispatch)

    engine.startGameClock()
    vi.advanceTimersByTime(500)
    const countAfterStart = calls.length

    engine.stopGameClock()
    vi.advanceTimersByTime(1000) // advance more — should produce zero additional ticks

    expect(calls.length).toBe(countAfterStart)
  })
})

// ---------------------------------------------------------------------------
// Test: shot clock is independent of game clock
// ---------------------------------------------------------------------------

describe('ClockEngine — shot clock independence', () => {
  test('starting and stopping shot clock does not affect game clock dispatch count', () => {
    const { calls, dispatch } = makeDispatch()
    const engine = createClockEngine(dispatch)

    // Start game clock only, note tick count after 500 ms
    engine.startGameClock()
    vi.advanceTimersByTime(500)
    const gameClockTicksOnly = calls.length

    // Reset calls, then run game clock + shot clock together for another 500 ms.
    // ClockEngine uses a SINGLE shared 100ms interval for both clocks: a single
    // CLOCK_TICK is dispatched per interval regardless of how many clocks are
    // active (the reducer applies the shared tick to every running clock). So
    // starting the shot clock must NOT change the CLOCK_TICK dispatch count.
    calls.length = 0
    engine.startShotClock()
    vi.advanceTimersByTime(500)
    const bothClocksTickCount = calls.length

    engine.stopShotClock()

    // Shared-timer invariant: adding the shot clock does not add extra ticks.
    expect(bothClocksTickCount).toBe(gameClockTicksOnly)

    // After stopping the shot clock, the game clock is still running so ticks
    // continue at the same shared rate.
    calls.length = 0
    vi.advanceTimersByTime(500)
    const afterStopShotClock = calls.length

    // Same shared rate as the game-clock-only run.
    expect(afterStopShotClock).toBe(gameClockTicksOnly)
  })
})

// ---------------------------------------------------------------------------
// Test: dispose() clears both timers
// ---------------------------------------------------------------------------

describe('ClockEngine — dispose()', () => {
  test('dispose() stops both clocks; no further dispatches after dispose', () => {
    const { calls, dispatch } = makeDispatch()
    const engine = createClockEngine(dispatch)

    engine.startGameClock()
    engine.startShotClock()
    vi.advanceTimersByTime(300)

    const countBeforeDispose = calls.length
    expect(countBeforeDispose).toBeGreaterThan(0)

    engine.dispose()
    calls.length = 0 // reset to isolate post-dispose behaviour

    vi.advanceTimersByTime(1000)

    // No ticks should be dispatched after dispose
    expect(calls.length).toBe(0)
  })

  test('dispose() is safe to call when no clocks are running', () => {
    const { calls, dispatch } = makeDispatch()
    const engine = createClockEngine(dispatch)

    // Should not throw
    expect(() => engine.dispose()).not.toThrow()

    vi.advanceTimersByTime(500)
    expect(calls.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Test: game clock cumulative drift over 10 minutes
// ---------------------------------------------------------------------------

describe('ClockEngine — game clock drift over 10 minutes', () => {
  test('total deltaMs sum is within 1000 ms of 600,000 ms after advancing 600,000 ms', () => {
    const { calls, dispatch } = makeDispatch()
    const engine = createClockEngine(dispatch)

    engine.startGameClock()
    // Advance fake time by 10 minutes (600,000 ms)
    vi.advanceTimersByTime(600_000)
    engine.stopGameClock()

    const totalDelta = calls.reduce((sum, tick) => sum + tick.deltaMs, 0)

    // Total should be within 1 second (1000 ms) of the 10-minute span
    expect(totalDelta).toBeGreaterThanOrEqual(600_000 - 1000)
    expect(totalDelta).toBeLessThanOrEqual(600_000 + 1000)
  })
})
