/**
 * ClockEngine — drift-compensated timer for game clock, shot clock, and timeout countdown.
 *
 * Uses a SINGLE shared 100ms interval for game/shot clocks.
 * Uses a SEPARATE 100ms interval for timeout countdown.
 */

import type { ClockEngine, CommandType } from '../shared/types'

const TICK_INTERVAL_MS = 100

export interface ExtendedClockEngine extends ClockEngine {
  startTimeoutClock(): void;
  stopTimeoutClock(): void;
}

export function createClockEngine(
  dispatch: (cmd: CommandType) => void,
): ExtendedClockEngine {
  let timer: ReturnType<typeof setInterval> | null = null
  let timeoutTimer: ReturnType<typeof setInterval> | null = null
  let gameClockActive = false
  let shotClockActive = false
  let lastTickTime = Date.now()

  function startTimer(): void {
    if (timer !== null) return
    lastTickTime = Date.now()
    timer = setInterval(() => {
      const now = Date.now()
      const actualElapsed = now - lastTickTime
      lastTickTime = now
      dispatch({ type: 'CLOCK_TICK', deltaMs: actualElapsed })
    }, TICK_INTERVAL_MS)
  }

  function stopTimer(): void {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  function syncTimer(): void {
    if (gameClockActive || shotClockActive) startTimer()
    else stopTimer()
  }

  function startGameClock(): void  { gameClockActive = true; syncTimer() }
  function stopGameClock(): void   { gameClockActive = false; syncTimer() }
  function startShotClock(): void  { shotClockActive = true; syncTimer() }
  function stopShotClock(): void   { shotClockActive = false; syncTimer() }

  // ── Timeout countdown (separate timer) ──
  function startTimeoutClock(): void {
    if (timeoutTimer !== null) return
    let lastTick = Date.now()
    timeoutTimer = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastTick
      lastTick = now
      dispatch({ type: 'TIMEOUT_TICK', deltaMs: elapsed })
    }, TICK_INTERVAL_MS)
  }

  function stopTimeoutClock(): void {
    if (timeoutTimer === null) return
    clearInterval(timeoutTimer)
    timeoutTimer = null
  }

  function dispose(): void {
    gameClockActive = false
    shotClockActive = false
    stopTimer()
    stopTimeoutClock()
  }

  return {
    startGameClock,
    stopGameClock,
    startShotClock,
    stopShotClock,
    startTimeoutClock,
    stopTimeoutClock,
    dispose,
  }
}
