import React, { useState } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import './FoulPanel.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FoulPanelProps {
  /** Which team this panel controls */
  team: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// FoulPanel component
// ---------------------------------------------------------------------------

/**
 * Renders foul-management controls for a single team.
 *
 * "+" dispatches ADD_FOUL; "−" dispatches SUBTRACT_FOUL (disabled at 0).
 * Shows a BONUS badge when fouls >= gameConfig.bonusThreshold.
 * Shows current foul count and configured bonus threshold.
 * Provides a numeric input (1–10) to reconfigure the bonus threshold via LOAD_PRESET.
 */
function FoulPanel({ team }: FoulPanelProps): React.ReactElement {
  const teamState = useControlPanelStore((s) => s.gameState[team])
  const gameConfig = useControlPanelStore((s) => s.gameState.gameConfig)
  const { fouls, config } = teamState
  const { bonusThreshold } = gameConfig

  // Local state for the threshold input (string so partial typing works)
  const [thresholdInput, setThresholdInput] = useState<string>(String(bonusThreshold))
  const [thresholdError, setThresholdError] = useState<string>('')

  const isBonus = fouls >= bonusThreshold

  function handleAdd(): void {
    sendCommand({ type: 'ADD_FOUL', team })
  }

  function handleSubtract(): void {
    sendCommand({ type: 'SUBTRACT_FOUL', team })
  }

  function handleThresholdChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const raw = e.target.value
    setThresholdInput(raw)

    const num = Number(raw)
    if (!raw.trim() || !Number.isInteger(num) || num < 1 || num > 10) {
      setThresholdError('Bonus threshold must be between 1 and 10')
    } else {
      setThresholdError('')
      sendCommand({
        type: 'LOAD_PRESET',
        preset: { ...gameConfig, bonusThreshold: num },
      })
    }
  }

  return (
    <div className="foul-panel" data-team={team}>
      {/* Team name */}
      <div className="foul-panel__team-name">{config.name}</div>

      {/* Foul count display with bonus threshold */}
      <div
        className="foul-panel__count"
        aria-label={`${config.name} fouls: ${fouls} of ${bonusThreshold}`}
      >
        {fouls} / {bonusThreshold} fouls
        {isBonus && (
          <span className="foul-panel__bonus-badge" aria-label="Bonus">
            BONUS
          </span>
        )}
      </div>

      {/* +/− buttons */}
      <div className="foul-panel__buttons" role="group" aria-label={`${config.name} foul controls`}>
        <button
          className="foul-panel__btn foul-panel__btn--add"
          onClick={handleAdd}
          aria-label={`Add foul to ${config.name}`}
        >
          +
        </button>

        <button
          className="foul-panel__btn foul-panel__btn--subtract"
          onClick={handleSubtract}
          disabled={fouls === 0}
          aria-label={`Subtract foul from ${config.name}`}
          aria-disabled={fouls === 0}
        >
          −
        </button>
      </div>

      {/* Bonus threshold configuration */}
      <div className="foul-panel__threshold-config">
        <label
          className="foul-panel__threshold-label"
          htmlFor={`bonus-threshold-${team}`}
        >
          Bonus at
        </label>
        <input
          id={`bonus-threshold-${team}`}
          className={`foul-panel__threshold-input${thresholdError ? ' foul-panel__threshold-input--error' : ''}`}
          type="number"
          min={1}
          max={10}
          value={thresholdInput}
          onChange={handleThresholdChange}
          aria-label={`Bonus threshold for ${config.name}`}
          aria-describedby={thresholdError ? `bonus-threshold-${team}-error` : undefined}
        />
        {thresholdError && (
          <div
            id={`bonus-threshold-${team}-error`}
            className="foul-panel__threshold-error"
            role="alert"
          >
            {thresholdError}
          </div>
        )}
      </div>
    </div>
  )
}

export default FoulPanel
