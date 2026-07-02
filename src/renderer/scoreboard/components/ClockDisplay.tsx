import React from 'react'
import { useScoreboardStore } from '../store'
import { formatClockDisplay } from '@renderer/shared/clockUtils'
import './ClockDisplay.css'

// The last-10-seconds threshold in milliseconds
const FLASH_THRESHOLD_MS = 10_000

/**
 * ClockDisplay — centered game clock for the Scoreboard Display.
 *
 * Reads `gameState.gameClock.displayMs` from the Zustand store, which is
 * updated every ≤ 100 ms as the main process broadcasts state snapshots.
 *
 * Visual behaviour:
 *   - Renders the clock in MM:SS format via `formatClockDisplay`.
 *   - Font size scales with viewport width (`clamp(4rem, 10vw, 10rem)`),
 *     ensuring legibility from 5 m on a 55-inch display.
 *   - White foreground (#FFFFFF) achieves > 21:1 contrast against the
 *     dark background (#0a0a0a) — exceeds WCAG AA (4.5:1).
 *   - Flashes with a red-pulse animation during the last 10 seconds
 *     of a period (displayMs ≤ 10 000 ms and clock is running or at 0).
 */
function ClockDisplay(): React.ReactElement {
  const displayMs = useScoreboardStore((s) => s.gameState.gameClock.displayMs)
  const isRunning = useScoreboardStore((s) => s.gameState.gameClock.running)

  const formattedTime = formatClockDisplay(displayMs)

  /*
   * Flash when:
   *   - 0 < displayMs <= 10 000 ms (last 10 seconds remaining), OR
   *   - displayMs === 0 (clock hit zero)
   * AND the clock is running (or has just hit 0, running becomes false at 0).
   * This matches the intent: warn the operator and audience during the
   * final seconds. We also flash at 0 so the display pulses at the buzzer.
   */
  const isFlashing = displayMs <= FLASH_THRESHOLD_MS && (isRunning || displayMs === 0)

  return (
    <div className="clock-display" aria-label="Game clock">
      <span
        className={`clock-display__time${isFlashing ? ' clock-display__time--flashing' : ''}`}
        aria-live="off"
        role="timer"
      >
        {formattedTime}
      </span>
    </div>
  )
}

export default ClockDisplay
