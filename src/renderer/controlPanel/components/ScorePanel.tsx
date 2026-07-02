import React from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import './ScorePanel.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ScorePanelProps {
  /** Which team this panel controls */
  team: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// ScorePanel component
// ---------------------------------------------------------------------------

/**
 * Renders score-management buttons for a single team.
 *
 * +1 / +2 / +3 dispatch ADD_SCORE with the corresponding points value.
 * -1 dispatches SUBTRACT_SCORE and is disabled when score === 0.
 * Score and team name are read directly from the Zustand store.
 */
function ScorePanel({ team }: ScorePanelProps): React.ReactElement {
  const teamState = useControlPanelStore((s) => s.gameState[team])
  const { score, config } = teamState

  function handleAdd(points: 1 | 2 | 3): void {
    sendCommand({ type: 'ADD_SCORE', team, points })
  }

  function handleSubtract(): void {
    sendCommand({ type: 'SUBTRACT_SCORE', team })
  }

  return (
    <div className="score-panel" data-team={team}>
      {/* Team name */}
      <div className="score-panel__team-name">{config.name}</div>

      {/* Current score display */}
      <div className="score-panel__score" aria-label={`${config.name} score: ${score}`}>
        {score}
      </div>

      {/* Score buttons */}
      <div className="score-panel__buttons" role="group" aria-label={`${config.name} score controls`}>
        <button
          className="score-panel__btn score-panel__btn--add"
          onClick={() => handleAdd(1)}
          aria-label={`Add 1 point to ${config.name}`}
        >
          +1
        </button>

        <button
          className="score-panel__btn score-panel__btn--add"
          onClick={() => handleAdd(2)}
          aria-label={`Add 2 points to ${config.name}`}
        >
          +2
        </button>

        <button
          className="score-panel__btn score-panel__btn--add"
          onClick={() => handleAdd(3)}
          aria-label={`Add 3 points to ${config.name}`}
        >
          +3
        </button>

        <button
          className="score-panel__btn score-panel__btn--subtract"
          onClick={handleSubtract}
          disabled={score === 0}
          aria-label={`Subtract 1 point from ${config.name}`}
          aria-disabled={score === 0}
        >
          -1
        </button>
      </div>
    </div>
  )
}

export default ScorePanel
