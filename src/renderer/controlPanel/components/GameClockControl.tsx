import React, { useState, useRef } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { formatClockDisplay } from '../../shared/clockUtils'
import './GameClockControl.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** SET_GAME_CLOCK valid range in seconds */
const SET_CLOCK_MIN_SEC = 0
const SET_CLOCK_MAX_SEC = 3600

/** Urgency threshold: highlight display red below this value */
const URGENCY_THRESHOLD_MS = 10_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a "MM:SS" string into total seconds.
 * Returns `null` when the input cannot be parsed.
 */
function parseMmSs(value: string): number | null {
  const trimmed = value.trim()
  const match = /^(\d{1,3}):(\d{2})$/.exec(trimmed)
  if (!match) return null
  const mins = parseInt(match[1], 10)
  const secs = parseInt(match[2], 10)
  if (secs > 59) return null
  return mins * 60 + secs
}

// ---------------------------------------------------------------------------
// GameClockControl component
// ---------------------------------------------------------------------------

/**
 * Game-clock section of the Control Panel.
 *
 * - Displays current game clock in MM:SS, going red when < 10 s remains.
 * - Start / Stop / Reset buttons dispatch the corresponding commands.
 * - Manual time-entry input (MM:SS) lets operators set the clock while it is stopped.
 */
function GameClockControl(): React.ReactElement {
  const gameClock = useControlPanelStore((s) => s.gameState.gameClock)
  const { displayMs, running } = gameClock

  // Manual set state
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ---- handlers ------------------------------------------------------------

  function handleStart(): void {
    sendCommand({ type: 'START_GAME_CLOCK' })
  }

  function handleStop(): void {
    sendCommand({ type: 'STOP_GAME_CLOCK' })
  }

  function handleReset(): void {
    sendCommand({ type: 'RESET_GAME_CLOCK' })
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setInputValue(e.target.value)
    // Clear error on every keystroke so the user gets fresh feedback on commit
    if (inputError) setInputError(null)
  }

  function commitSetClock(): void {
    const seconds = parseMmSs(inputValue)

    if (seconds === null) {
      setInputError('Invalid format — use MM:SS (e.g. 12:00)')
      return
    }

    if (seconds < SET_CLOCK_MIN_SEC || seconds > SET_CLOCK_MAX_SEC) {
      setInputError(`Time must be between ${SET_CLOCK_MIN_SEC}:00 and ${Math.floor(SET_CLOCK_MAX_SEC / 60)}:00`)
      return
    }

    setInputError(null)
    sendCommand({ type: 'SET_GAME_CLOCK', seconds })
    setInputValue('')
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      commitSetClock()
    }
  }

  // ---- derived state -------------------------------------------------------

  const isUrgent = displayMs < URGENCY_THRESHOLD_MS

  const displayClass = [
    'game-clock__display',
    isUrgent ? 'game-clock__display--urgent' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inputClass = [
    'game-clock__set-input',
    inputError ? 'game-clock__set-input--error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // ---- render --------------------------------------------------------------

  return (
    <div className="game-clock">
      {/* Clock display */}
      <div
        className={displayClass}
        role="timer"
        aria-label={`Game clock: ${formatClockDisplay(displayMs)}`}
        aria-live="off"
      >
        {formatClockDisplay(displayMs)}
      </div>

      {/* Running status */}
      <div className="game-clock__status" aria-live="polite">
        {running ? 'Running' : 'Stopped'}
      </div>

      {/* Start / Stop / Reset controls */}
      <div className="game-clock__controls" role="group" aria-label="Game clock controls">
        <button
          className="game-clock__btn game-clock__btn--start"
          onClick={handleStart}
          disabled={running}
          aria-label="Start game clock"
          aria-disabled={running}
        >
          Start
        </button>

        <button
          className="game-clock__btn game-clock__btn--stop"
          onClick={handleStop}
          disabled={!running}
          aria-label="Stop game clock"
          aria-disabled={!running}
        >
          Stop
        </button>

        <button
          className="game-clock__btn game-clock__btn--reset"
          onClick={handleReset}
          aria-label="Reset game clock"
        >
          Reset
        </button>
      </div>

      {/* Manual time entry */}
      <div className="game-clock__set">
        <span className="game-clock__set-label">Set time</span>
        <div className="game-clock__set-row">
          <input
            ref={inputRef}
            className={inputClass}
            type="text"
            placeholder="MM:SS"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            disabled={running}
            aria-label="Set game clock time (MM:SS)"
            aria-describedby="game-clock-set-error"
            aria-invalid={inputError !== null}
          />
          <button
            className="game-clock__set-btn"
            onClick={commitSetClock}
            disabled={running}
            aria-label="Apply clock time"
          >
            Set
          </button>
        </div>
        <div
          id="game-clock-set-error"
          className="game-clock__set-error"
          role="alert"
          aria-live="assertive"
        >
          {inputError ?? ''}
        </div>
      </div>
    </div>
  )
}

export default GameClockControl
