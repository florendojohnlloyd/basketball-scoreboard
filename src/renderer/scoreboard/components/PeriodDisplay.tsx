import React from 'react'
import { useScoreboardStore } from '../store'
import { formatPeriodLabel } from '@renderer/shared/periodUtils'
import './PeriodDisplay.css'

/**
 * PeriodDisplay — current period label for the Scoreboard Display.
 *
 * Reads `gameState.period` and `gameState.gameConfig` from the Zustand store
 * and renders a human-readable label via `formatPeriodLabel`:
 *
 *   - Quarters (periodCount 4): "Q1", "Q2", "Q3", "Q4"
 *   - Halves  (periodCount 2): "1st Half", "2nd Half"
 *   - Overtime:  "OT" (first), "2OT", "3OT", … (subsequent)
 *
 * Positioned below the game clock in the center column.
 * Font size is smaller than the game clock (`clamp(1.5rem, 3.5vw, 4rem)`)
 * but clearly readable at distance.
 * White foreground (#FFFFFF) on dark background (#0a0a0a) exceeds 21:1
 * contrast — well above the WCAG AA 4.5:1 minimum.
 */
function PeriodDisplay(): React.ReactElement {
  const period = useScoreboardStore((s) => s.gameState.period)
  const gameConfig = useScoreboardStore((s) => s.gameState.gameConfig)

  const label = formatPeriodLabel(period, gameConfig)

  return (
    <div className="period-display" aria-label="Current period">
      <span
        className="period-display__label"
        aria-live="polite"
        aria-atomic="true"
      >
        {label}
      </span>
    </div>
  )
}

export default PeriodDisplay
