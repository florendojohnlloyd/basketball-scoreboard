import React, { useState } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import './ShotClockControl.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid range for the shot clock duration (seconds, inclusive) */
const DURATION_MIN_SEC = 14
const DURATION_MAX_SEC = 30

/** Urgency threshold: highlight display amber at or below this value (seconds) */
const URGENCY_THRESHOLD_SEC = 5

// ---------------------------------------------------------------------------
// ShotClockControl component
// ---------------------------------------------------------------------------

/**
 * Shot-clock section of the Control Panel.
 *
 * - Displays the current shot clock value as a whole number of seconds (Math.ceil).
 * - Amber urgency highlight when displayed value ≤ 5 seconds.
 * - Enable/disable toggle dispatches SET_SHOT_CLOCK_ENABLED.
 * - Start / Stop / Reset buttons dispatch the corresponding shot clock commands.
 * - All controls except the toggle are visually disabled when the shot clock is disabled.
 * - Duration configuration input (14–30 s) dispatches LOAD_PRESET with the merged gameConfig.
 */
function ShotClockControl(): React.ReactElement {
  const shotClock = useControlPanelStore((s) => s.gameState.shotClock)
  const gameConfig = useControlPanelStore((s) => s.gameState.gameConfig)

  const { displayMs, running, configuredDurationSeconds, enabled } = shotClock

  // Local state for the duration input
  const [durationValue, setDurationValue] = useState<string>(
    String(configuredDurationSeconds),
  )
  const [durationError, setDurationError] = useState<string | null>(null)

  // ---- derived values ------------------------------------------------------

  const displaySeconds = Math.ceil(displayMs / 1000)
  const isUrgent = displaySeconds <= URGENCY_THRESHOLD_SEC

  // ---- handlers ------------------------------------------------------------

  function handleStart(): void {
    sendCommand({ type: 'START_SHOT_CLOCK' })
  }

  function handleStop(): void {
    sendCommand({ type: 'STOP_SHOT_CLOCK' })
  }

  function handleReset(): void {
    sendCommand({ type: 'RESET_SHOT_CLOCK' })
  }

  function handleToggleEnabled(e: React.ChangeEvent<HTMLInputElement>): void {
    sendCommand({ type: 'SET_SHOT_CLOCK_ENABLED', enabled: e.target.checked })
  }

  function handleDurationChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setDurationValue(e.target.value)
    // Clear any previous error as the user types
    if (durationError) setDurationError(null)
  }

  function commitDuration(): void {
    const trimmed = durationValue.trim()
    const parsed = parseInt(trimmed, 10)

    if (!trimmed || isNaN(parsed) || String(parsed) !== trimmed) {
      setDurationError('Enter a whole number of seconds')
      return
    }

    if (parsed < DURATION_MIN_SEC || parsed > DURATION_MAX_SEC) {
      setDurationError(`Duration must be ${DURATION_MIN_SEC}–${DURATION_MAX_SEC} seconds`)
      return
    }

    setDurationError(null)
    // Dispatch LOAD_PRESET with the current config merged with the new duration
    sendCommand({
      type: 'LOAD_PRESET',
      preset: { ...gameConfig, shotClockDurationSeconds: parsed },
    })
  }

  function handleDurationKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      commitDuration()
    }
  }

  // ---- class names ---------------------------------------------------------

  const displayClass = [
    'shot-clock__display',
    isUrgent && enabled ? 'shot-clock__display--urgent' : '',
    !enabled ? 'shot-clock__display--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const controlsWrapperClass = [
    'shot-clock__controls-wrapper',
    !enabled ? 'shot-clock__controls-wrapper--hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const durationInputClass = [
    'shot-clock__duration-input',
    durationError ? 'shot-clock__duration-input--error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // ---- render --------------------------------------------------------------

  return (
    <div className="shot-clock">
      {/* Shot clock display */}
      <div
        className={displayClass}
        role="timer"
        aria-label={`Shot clock: ${displaySeconds} seconds`}
        aria-live="off"
      >
        {displaySeconds}
      </div>

      {/* Running status */}
      <div className="shot-clock__status" aria-live="polite">
        {enabled ? (running ? 'Running' : 'Stopped') : 'Disabled'}
      </div>

      {/* Enable / Disable toggle */}
      <div className="shot-clock__toggle-row">
        <label className="shot-clock__toggle" htmlFor="shot-clock-enabled">
          <input
            id="shot-clock-enabled"
            type="checkbox"
            checked={enabled}
            onChange={handleToggleEnabled}
            aria-label="Enable shot clock"
          />
          <span className="shot-clock__toggle-track" />
        </label>
        <span
          className="shot-clock__toggle-label"
          onClick={() =>
            sendCommand({ type: 'SET_SHOT_CLOCK_ENABLED', enabled: !enabled })
          }
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* Controls — visually faded when shot clock is disabled */}
      <div
        className={controlsWrapperClass}
        aria-hidden={!enabled}
      >
        {/* Start / Stop / Reset buttons */}
        <div
          className="shot-clock__controls"
          role="group"
          aria-label="Shot clock controls"
        >
          <button
            className="shot-clock__btn shot-clock__btn--start"
            onClick={handleStart}
            disabled={running || !enabled}
            aria-label="Start shot clock"
            aria-disabled={running || !enabled}
          >
            Start
          </button>

          <button
            className="shot-clock__btn shot-clock__btn--stop"
            onClick={handleStop}
            disabled={!running || !enabled}
            aria-label="Stop shot clock"
            aria-disabled={!running || !enabled}
          >
            Stop
          </button>

          <button
            className="shot-clock__btn shot-clock__btn--reset"
            onClick={handleReset}
            disabled={!enabled}
            aria-label="Reset shot clock"
            aria-disabled={!enabled}
          >
            Reset
          </button>
        </div>

        {/* Duration configuration */}
        <div className="shot-clock__duration">
          <span className="shot-clock__duration-label">Duration</span>
          <div className="shot-clock__duration-row">
            <input
              className={durationInputClass}
              type="number"
              min={DURATION_MIN_SEC}
              max={DURATION_MAX_SEC}
              step={1}
              value={durationValue}
              onChange={handleDurationChange}
              onKeyDown={handleDurationKeyDown}
              onBlur={commitDuration}
              disabled={!enabled}
              aria-label={`Shot clock duration in seconds (${DURATION_MIN_SEC}–${DURATION_MAX_SEC})`}
              aria-describedby="shot-clock-duration-error"
              aria-invalid={durationError !== null}
            />
            <span className="shot-clock__duration-suffix">sec</span>
          </div>
          <div
            id="shot-clock-duration-error"
            className="shot-clock__duration-error"
            role="alert"
            aria-live="assertive"
          >
            {durationError ?? ''}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShotClockControl
