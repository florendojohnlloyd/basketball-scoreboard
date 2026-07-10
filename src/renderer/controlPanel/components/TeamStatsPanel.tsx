import React from 'react'
import { useControlPanelStore, sendCommand, teamFgPct, teamRebounds } from '../store'
import './TeamStatsPanel.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TeamStatsPanelProps {
  /** Which team this panel displays stats for */
  team: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// TeamStatsPanel component — Requirement 14
// ---------------------------------------------------------------------------

/**
 * Displays team-level derived statistics for a single team:
 *  - FG% (shown as "—" when FGA = 0, rounded to 1 decimal otherwise)
 *  - Total rebounds (sum of all player rebound counts)
 *  - Turnover counter with +/− buttons (floored at 0)
 *
 * Updates within 200 ms of any player stat change via Zustand subscription.
 */
function TeamStatsPanel({ team }: TeamStatsPanelProps): React.ReactElement {
  const gameState = useControlPanelStore((s) => s.gameState)
  const teamState = gameState[team]
  const { config, turnovers } = teamState

  const fgPct = teamFgPct(gameState, team)
  const totalRebounds = teamRebounds(gameState, team)

  const fgPctDisplay = fgPct === null ? '—' : `${fgPct.toFixed(1)}%`

  function handleAddTurnover(): void {
    sendCommand({ type: 'ADD_TURNOVER', team })
  }

  function handleSubtractTurnover(): void {
    sendCommand({ type: 'SUBTRACT_TURNOVER', team })
  }

  return (
    <div className="team-stats-panel" data-team={team}>
      {/* Team name */}
      <div className="team-stats-panel__name">{config.name}</div>

      {/* FG% */}
      <div className="team-stats-panel__stat">
        <span className="team-stats-panel__stat-label">FG%</span>
        <span
          className="team-stats-panel__stat-value"
          aria-label={`${config.name} field goal percentage: ${fgPctDisplay}`}
        >
          {fgPctDisplay}
        </span>
      </div>

      {/* Total Rebounds */}
      <div className="team-stats-panel__stat">
        <span className="team-stats-panel__stat-label">REB</span>
        <span
          className="team-stats-panel__stat-value"
          aria-label={`${config.name} total rebounds: ${totalRebounds}`}
        >
          {totalRebounds}
        </span>
      </div>

      {/* Turnovers */}
      <div className="team-stats-panel__stat team-stats-panel__stat--to">
        <span className="team-stats-panel__stat-label">TO</span>
        <div
          className="team-stats-panel__to-controls"
          role="group"
          aria-label={`${config.name} turnover controls`}
        >
          <button
            className="team-stats-panel__btn team-stats-panel__btn--subtract"
            onClick={handleSubtractTurnover}
            disabled={turnovers === 0}
            aria-label={`Subtract turnover from ${config.name}`}
            aria-disabled={turnovers === 0}
          >
            −
          </button>
          <span
            className="team-stats-panel__stat-value"
            aria-label={`${config.name} turnovers: ${turnovers}`}
          >
            {turnovers}
          </span>
          <button
            className="team-stats-panel__btn team-stats-panel__btn--add"
            onClick={handleAddTurnover}
            aria-label={`Add turnover to ${config.name}`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

export default TeamStatsPanel
