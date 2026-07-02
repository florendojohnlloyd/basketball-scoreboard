import React, { useState } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { formatPeriodLabel } from '../../shared/periodUtils'
import type { GameConfig } from '@shared/types'
import './PeriodControl.css'

// ---------------------------------------------------------------------------
// PeriodControl component
// ---------------------------------------------------------------------------

/**
 * Period-tracking section of the Control Panel.
 *
 * - Displays the current period label (e.g. "Q2 of 4", "OT") using
 *   the shared `formatPeriodLabel` utility.
 * - "Next Period" button dispatches ADVANCE_PERIOD after running several
 *   guard checks:
 *     1. Game clock running → shows inline warning, does NOT dispatch.
 *     2. Final period, tied scores → offers OT via window.confirm.
 *     3. Final period, unequal scores → asks for confirmation via window.confirm.
 *     4. Otherwise → dispatches immediately.
 * - Game-format selector (Quarters / Halves) available only in pre-game phase;
 *   dispatches LOAD_PRESET with merged gameConfig.
 */
function PeriodControl(): React.ReactElement {
  const gameState = useControlPanelStore((s) => s.gameState)
  const { period, gameConfig, gamePhase, gameClock, home, away } = gameState

  const [clockWarning, setClockWarning] = useState(false)

  // ---- derived helpers -----------------------------------------------------

  /** True when the current period is the last regulation period and NOT in OT */
  const isFinalPeriod =
    !period.isOvertime && period.current >= gameConfig.periodCount

  const isPreGame = gamePhase === 'pre-game'

  const label = formatPeriodLabel(period, gameConfig)

  // "Q2 of 4" or "2nd Half of 2" or "OT" (no "of N" suffix in overtime)
  const displayLabel = period.isOvertime
    ? label
    : `${label} of ${gameConfig.periodCount}`

  // ---- handlers ------------------------------------------------------------

  function handleNextPeriod(): void {
    // Guard 1: clock is running
    if (gameClock.running) {
      setClockWarning(true)
      return
    }
    setClockWarning(false)

    if (isFinalPeriod) {
      const tied = home.score === away.score

      if (tied) {
        // Guard 2: final period, tied → offer OT
        const addOT = window.confirm(
          'The game is tied at the end of regulation. Add overtime?'
        )
        if (!addOT) return
      } else {
        // Guard 3: final period, unequal scores → confirm advance
        const confirmed = window.confirm(
          'This is the final period. Are you sure you want to advance?'
        )
        if (!confirmed) return
      }
    }

    sendCommand({ type: 'ADVANCE_PERIOD' })
  }

  function handleFormatChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const format = e.target.value as 'quarters' | 'halves'
    const periodCount: 2 | 4 = format === 'quarters' ? 4 : 2

    const mergedConfig: GameConfig = {
      ...gameConfig,
      periodCount,
    }

    sendCommand({ type: 'LOAD_PRESET', preset: mergedConfig })
  }

  // ---- New Game handler ---------------------------------------------------

  function handleNewGame(): void {
    const confirmed = window.confirm(
      'Start a new game? This will reset all scores, fouls, clocks, and timeouts to their configured values.'
    )
    if (!confirmed) return
    sendCommand({ type: 'NEW_GAME', clearTeams: false })
  }

  // ---- render --------------------------------------------------------------

  return (
    <div className="period-control">
      {/* Current period label */}
      <div
        className="period-control__label"
        aria-label={`Current period: ${displayLabel}`}
        aria-live="polite"
      >
        {displayLabel}
      </div>

      {/* Next Period button + inline clock warning */}
      <div className="period-control__advance-row">
        <button
          className="period-control__btn period-control__btn--advance"
          onClick={handleNextPeriod}
          aria-label="Advance to next period"
        >
          Next Period
        </button>

        {clockWarning && (
          <span
            className="period-control__warning"
            role="alert"
            aria-live="assertive"
          >
            Stop the clock before advancing
          </span>
        )}
      </div>

      {/* New Game button */}
      <div className="period-control__new-game-row">
        <button
          className="period-control__btn period-control__btn--new-game"
          onClick={handleNewGame}
          aria-label="Start a new game"
        >
          New Game
        </button>
      </div>

      {/* Game format selector — pre-game only */}
      {isPreGame && (
        <div className="period-control__format">
          <label
            className="period-control__format-label"
            htmlFor="period-format-select"
          >
            Game Format
          </label>
          <select
            id="period-format-select"
            className="period-control__format-select"
            value={gameConfig.periodCount === 4 ? 'quarters' : 'halves'}
            onChange={handleFormatChange}
            aria-label="Select game format"
          >
            <option value="quarters">Quarters (4)</option>
            <option value="halves">Halves (2)</option>
          </select>
        </div>
      )}
    </div>
  )
}

export default PeriodControl
