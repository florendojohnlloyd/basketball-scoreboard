import React from 'react'
import { useScoreboardStore } from '../store'
import './ShotClockDisplay.css'

// Threshold (in seconds) at which the display turns amber/orange
const AMBER_THRESHOLD_SECONDS = 5

/**
 * ShotClockDisplay — shot clock for the Scoreboard Display.
 *
 * Reads `gameState.shotClock` from the Zustand store, which is updated
 * every ≤ 100 ms as the main process broadcasts state snapshots.
 *
 * Visual behaviour:
 *   - Hidden entirely when `shotClock.enabled === false`.
 *   - Displays `Math.ceil(shotClock.displayMs / 1000)` as a whole integer.
 *   - Font size is ~50% of the game clock (`clamp(2rem, 5vw, 5rem)`)
 *     so it is visually subordinate but clearly readable.
 *   - Turns amber/orange (#FF8C00) when the displayed value is ≤ 5 seconds.
 *   - White (#FFFFFF) otherwise — ≥ 21:1 contrast against #0a0a0a.
 */
function ShotClockDisplay(): React.ReactElement | null {
  const enabled = useScoreboardStore((s) => s.gameState.shotClock.enabled)
  const displayMs = useScoreboardStore((s) => s.gameState.shotClock.displayMs)

  // Hide the element completely when the shot clock is disabled
  if (!enabled) {
    return null
  }

  const displaySeconds = Math.ceil(displayMs / 1000)
  const isAmber = displaySeconds <= AMBER_THRESHOLD_SECONDS

  return (
    <div className="shot-clock-display" aria-label="Shot clock">
      <span
        className={`shot-clock-display__value${isAmber ? ' shot-clock-display__value--amber' : ''}`}
        aria-live="off"
        role="timer"
      >
        {displaySeconds}
      </span>
    </div>
  )
}

export default ShotClockDisplay
