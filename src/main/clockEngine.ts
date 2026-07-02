/**
 * ClockEngine — drift-compensated timer for the game clock and shot clock.
 *
 * Uses two independent NodeJS.Timer intervals (one per clock) firing every
 * 100 ms. Each tick measures the actual elapsed time since the previous tick
 * (drift compensation) and dispatches a CLOCK_TICK command with that value.
 *
 * Drift compensation pattern:
 *   - Record `lastTickTime = Date.now()` when the interval starts.
 *   - On each callback: compute `actualElapsed = Date.now() - lastTickTime`,
 *     update `lastTickTime = Date.now()`, then dispatch CLOCK_TICK with
 *     `deltaMs: actualElapsed`.
 *
 * This keeps cumulative clock drift well within the 1 s per 10 min requirement
 * regardless of system scheduling jitter.
 */

import type { ClockEngine, CommandType } from '../shared/types'

const TICK_INTERVAL_MS = 100

/**
 * Creates a ClockEngine that dispatches CLOCK_TICK commands through the
 * provided `dispatch` function. The same dispatch is used for both the game
 * clock and the shot clock — the GameStore reducer applies the delta to
 * whichever clocks are currently running.
 */
export function createClockEngine(
  dispatch: (cmd: CommandType) => void,
): ClockEngine {
  let gameClockTimer: ReturnType<typeof setInterval> | null = null
  let shotClockTimer: ReturnType<typeof setInterval> | null = null

  // ---------------------------------------------------------------------------
  // Game clock
  // ---------------------------------------------------------------------------

  function startGameClock(): void {
    if (gameClockTimer !== null) return // already running

    let lastTickTime = Date.now()

    gameClockTimer = setInterval(() => {
      const now = Date.now()
      const actualElapsed = now - lastTickTime
      lastTickTime = now
      dispatch({ type: 'CLOCK_TICK', deltaMs: actualElapsed })
    }, TICK_INTERVAL_MS)
  }

  function stopGameClock(): void {
    if (gameClockTimer === null) return
    clearInterval(gameClockTimer)
    gameClockTimer = null
  }

  // ---------------------------------------------------------------------------
  // Shot clock
  // ---------------------------------------------------------------------------

  function startShotClock(): void {
    if (shotClockTimer !== null) return // already running

    let lastTickTime = Date.now()

    shotClockTimer = setInterval(() => {
      const now = Date.now()
      const actualElapsed = now - lastTickTime
      lastTickTime = now
      dispatch({ type: 'CLOCK_TICK', deltaMs: actualElapsed })
    }, TICK_INTERVAL_MS)
  }

  function stopShotClock(): void {
    if (shotClockTimer === null) return
    clearInterval(shotClockTimer)
    shotClockTimer = null
  }

  // ---------------------------------------------------------------------------
  // Dispose — clears both intervals
  // ---------------------------------------------------------------------------

  function dispose(): void {
    stopGameClock()
    stopShotClock()
  }

  return {
    startGameClock,
    stopGameClock,
    startShotClock,
    stopShotClock,
    dispose,
  }
}
