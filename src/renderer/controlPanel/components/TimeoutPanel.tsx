import React from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import './TimeoutPanel.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimeoutPanelProps {
  /** Which team this panel controls */
  team: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// TimeoutPanel component
// ---------------------------------------------------------------------------

/**
 * Renders timeout-management controls for a single team.
 *
 * Two rows: full timeouts and 20-second timeouts.
 * Each row shows remaining / total and "−" / "+" buttons.
 * "−" dispatches USE_TIMEOUT (disabled when remaining === 0).
 * "+" dispatches RESTORE_TIMEOUT (disabled when remaining === max).
 */
function TimeoutPanel({ team }: TimeoutPanelProps): React.ReactElement {
  const teamState = useControlPanelStore((s) => s.gameState[team])
  const gameConfig = useControlPanelStore((s) => s.gameState.gameConfig)

  const { timeouts, config } = teamState
  const { fullTimeoutsPerTeam, twentySecTimeoutsPerTeam } = gameConfig

  function handleUse(kind: 'full' | 'twenty'): void {
    sendCommand({ type: 'USE_TIMEOUT', team, kind })
  }

  function handleRestore(kind: 'full' | 'twenty'): void {
    sendCommand({ type: 'RESTORE_TIMEOUT', team, kind })
  }

  return (
    <div className="timeout-panel" data-team={team}>
      {/* Team name */}
      <div className="timeout-panel__team-name">{config.name}</div>

      {/* Full timeouts row */}
      <div
        className="timeout-panel__row"
        role="group"
        aria-label={`${config.name} full timeout controls`}
      >
        <span className="timeout-panel__label">Full</span>
        <span
          className="timeout-panel__count"
          aria-label={`${config.name} full timeouts: ${timeouts.fullRemaining} of ${fullTimeoutsPerTeam}`}
        >
          {timeouts.fullRemaining} / {fullTimeoutsPerTeam}
        </span>
        <div className="timeout-panel__buttons">
          <button
            className="timeout-panel__btn timeout-panel__btn--use"
            onClick={() => handleUse('full')}
            disabled={timeouts.fullRemaining === 0}
            aria-label={`Use full timeout for ${config.name}`}
            aria-disabled={timeouts.fullRemaining === 0}
          >
            −
          </button>
          <button
            className="timeout-panel__btn timeout-panel__btn--restore"
            onClick={() => handleRestore('full')}
            disabled={timeouts.fullRemaining === fullTimeoutsPerTeam}
            aria-label={`Restore full timeout for ${config.name}`}
            aria-disabled={timeouts.fullRemaining === fullTimeoutsPerTeam}
          >
            +
          </button>
        </div>
      </div>

      {/* 20-second timeouts row */}
      <div
        className="timeout-panel__row"
        role="group"
        aria-label={`${config.name} 20-second timeout controls`}
      >
        <span className="timeout-panel__label">20s</span>
        <span
          className="timeout-panel__count"
          aria-label={`${config.name} 20-second timeouts: ${timeouts.twentyRemaining} of ${twentySecTimeoutsPerTeam}`}
        >
          {timeouts.twentyRemaining} / {twentySecTimeoutsPerTeam}
        </span>
        <div className="timeout-panel__buttons">
          <button
            className="timeout-panel__btn timeout-panel__btn--use"
            onClick={() => handleUse('twenty')}
            disabled={timeouts.twentyRemaining === 0}
            aria-label={`Use 20-second timeout for ${config.name}`}
            aria-disabled={timeouts.twentyRemaining === 0}
          >
            −
          </button>
          <button
            className="timeout-panel__btn timeout-panel__btn--restore"
            onClick={() => handleRestore('twenty')}
            disabled={timeouts.twentyRemaining === twentySecTimeoutsPerTeam}
            aria-label={`Restore 20-second timeout for ${config.name}`}
            aria-disabled={timeouts.twentyRemaining === twentySecTimeoutsPerTeam}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

export default TimeoutPanel
