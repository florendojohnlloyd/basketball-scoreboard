import React, { useState, useEffect, useCallback } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { GameConfig, Preset } from '@shared/types'
import './GameConfigPanel.css'

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

const PERIOD_DURATION_MIN = 1
const PERIOD_DURATION_MAX = 60
const SHOT_CLOCK_MIN = 14
const SHOT_CLOCK_MAX = 30
const BONUS_MIN = 1
const BONUS_MAX = 10
const TIMEOUTS_MIN = 0
const TIMEOUTS_MAX = 10
const PRESET_NAME_MAX = 30

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validatePeriodDuration(val: number): string {
  if (!Number.isInteger(val) || val < PERIOD_DURATION_MIN || val > PERIOD_DURATION_MAX) {
    return `Must be an integer between ${PERIOD_DURATION_MIN} and ${PERIOD_DURATION_MAX} minutes`
  }
  return ''
}

function validateShotClock(val: number): string {
  if (!Number.isInteger(val) || val < SHOT_CLOCK_MIN || val > SHOT_CLOCK_MAX) {
    return `Must be an integer between ${SHOT_CLOCK_MIN} and ${SHOT_CLOCK_MAX} seconds`
  }
  return ''
}

function validateBonus(val: number): string {
  if (!Number.isInteger(val) || val < BONUS_MIN || val > BONUS_MAX) {
    return `Must be an integer between ${BONUS_MIN} and ${BONUS_MAX}`
  }
  return ''
}

function validateTimeouts(val: number): string {
  if (!Number.isInteger(val) || val < TIMEOUTS_MIN || val > TIMEOUTS_MAX) {
    return `Must be an integer between ${TIMEOUTS_MIN} and ${TIMEOUTS_MAX}`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Field state shape
// ---------------------------------------------------------------------------

interface FieldState {
  raw: string
  error: string
}

function makeField(initial: string | number): FieldState {
  return { raw: String(initial), error: '' }
}

function parseIntField(field: FieldState): number {
  return parseInt(field.raw, 10)
}

// ---------------------------------------------------------------------------
// Toast component (inline error notification)
// ---------------------------------------------------------------------------

interface ToastProps {
  message: string
  onDismiss: () => void
}

function Toast({ message, onDismiss }: ToastProps): React.ReactElement {
  return (
    <div className="gcp-toast" role="alert" aria-live="assertive">
      <span className="gcp-toast__message">{message}</span>
      <button
        className="gcp-toast__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        ✕
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SaveAsModal component
// ---------------------------------------------------------------------------

interface SaveAsModalProps {
  existingNames: string[]
  builtInNames: string[]
  onConfirm: (name: string) => void
  onCancel: () => void
}

function SaveAsModal({
  existingNames,
  builtInNames,
  onConfirm,
  onCancel,
}: SaveAsModalProps): React.ReactElement {
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  // When name already exists (but is not built-in) ask for overwrite confirmation
  const [overwriteTarget, setOverwriteTarget] = useState<string | null>(null)

  const userExistingNames = existingNames.filter((n) => !builtInNames.includes(n))

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setNameInput(e.target.value)
    setNameError('')
    setOverwriteTarget(null)
  }

  function handleSave(): void {
    const trimmed = nameInput.trim()
    if (trimmed.length === 0) {
      setNameError('Name cannot be empty')
      return
    }
    if (nameInput.length > PRESET_NAME_MAX) {
      setNameError(`Name must be ${PRESET_NAME_MAX} characters or fewer`)
      return
    }
    if (builtInNames.includes(trimmed)) {
      setNameError('This name is reserved for a built-in preset')
      return
    }
    if (userExistingNames.includes(trimmed)) {
      // Need overwrite confirmation
      setOverwriteTarget(trimmed)
      setNameError('')
      return
    }
    onConfirm(trimmed)
  }

  function handleOverwriteConfirm(): void {
    if (overwriteTarget) {
      onConfirm(overwriteTarget)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="gcp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="save-modal-title">
      <div className="gcp-modal">
        <h3 id="save-modal-title" className="gcp-modal__title">Save As Preset</h3>

        {overwriteTarget ? (
          <>
            <p className="gcp-modal__body">
              A preset named <strong>"{overwriteTarget}"</strong> already exists. Overwrite it?
            </p>
            <div className="gcp-modal__actions">
              <button
                className="gcp-modal__btn gcp-modal__btn--danger"
                onClick={handleOverwriteConfirm}
              >
                Overwrite
              </button>
              <button
                className="gcp-modal__btn gcp-modal__btn--secondary"
                onClick={() => setOverwriteTarget(null)}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="gcp-modal__label" htmlFor="preset-name-input">
              Preset name <span className="gcp-modal__hint">(1–{PRESET_NAME_MAX} characters)</span>
            </label>
            <input
              id="preset-name-input"
              className={`gcp-modal__input${nameError ? ' gcp-modal__input--error' : ''}`}
              type="text"
              value={nameInput}
              maxLength={PRESET_NAME_MAX + 1}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              autoFocus
              aria-describedby={nameError ? 'preset-name-error' : undefined}
              aria-invalid={nameError ? 'true' : undefined}
            />
            {nameError && (
              <div id="preset-name-error" className="gcp-modal__error" role="alert">
                {nameError}
              </div>
            )}
            <div className="gcp-modal__actions">
              <button
                className="gcp-modal__btn gcp-modal__btn--primary"
                onClick={handleSave}
              >
                Save
              </button>
              <button
                className="gcp-modal__btn gcp-modal__btn--secondary"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DeleteConfirmModal component
// ---------------------------------------------------------------------------

interface DeleteConfirmModalProps {
  presetName: string
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmModal({
  presetName,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps): React.ReactElement {
  return (
    <div className="gcp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
      <div className="gcp-modal">
        <h3 id="delete-modal-title" className="gcp-modal__title">Delete Preset</h3>
        <p className="gcp-modal__body">
          Delete <strong>"{presetName}"</strong>? This cannot be undone.
        </p>
        <div className="gcp-modal__actions">
          <button
            className="gcp-modal__btn gcp-modal__btn--danger"
            onClick={onConfirm}
          >
            Delete
          </button>
          <button
            className="gcp-modal__btn gcp-modal__btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GameConfigPanel component
// ---------------------------------------------------------------------------

/**
 * Game configuration screen: lets the operator edit all GameConfig fields,
 * apply them via LOAD_PRESET, and manage saved presets (list, load, save, delete).
 */
function GameConfigPanel(): React.ReactElement {
  const gameConfig = useControlPanelStore((s) => s.gameState.gameConfig)

  // ---- Config form fields ----
  const [periodDuration, setPeriodDuration] = useState<FieldState>(() =>
    makeField(gameConfig.periodDurationMinutes),
  )
  const [periodCount, setPeriodCount] = useState<2 | 4>(gameConfig.periodCount)
  const [shotClock, setShotClock] = useState<FieldState>(() =>
    makeField(gameConfig.shotClockDurationSeconds),
  )
  const [bonus, setBonus] = useState<FieldState>(() =>
    makeField(gameConfig.bonusThreshold),
  )
  const [fullTimeouts, setFullTimeouts] = useState<FieldState>(() =>
    makeField(gameConfig.fullTimeoutsPerTeam),
  )
  const [twentySecTimeouts, setTwentySecTimeouts] = useState<FieldState>(() =>
    makeField(gameConfig.twentySecTimeoutsPerTeam),
  )

  // ---- Preset list ----
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetsLoading, setPresetsLoading] = useState(false)

  // ---- Modals ----
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // ---- Toast ----
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // ---- Built-in preset names ----
  const builtInNames = presets.filter((p) => p.builtIn).map((p) => p.name)
  const allPresetNames = presets.map((p) => p.name)

  // ---- Load preset list ----
  const loadPresets = useCallback(async () => {
    setPresetsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'GET_PRESETS',
      })
      setPresets(result as Preset[])
    } catch (err) {
      console.error('[GameConfigPanel] Failed to load presets:', err)
      setToastMessage('Failed to load presets. Please try again.')
    } finally {
      setPresetsLoading(false)
    }
  }, [])

  // On mount: load presets and listen for PRESET_CORRUPTED events
  useEffect(() => {
    loadPresets()

    const handleEvent = (raw: unknown): void => {
      const event = raw as { type: string; name?: string }
      if (event.type === 'PRESET_CORRUPTED') {
        const name = event.name ?? 'Unknown'
        setToastMessage(`Preset "${name}" could not be loaded and has been removed.`)
        // Refresh the preset list to reflect the removal
        loadPresets()
      }
    }

    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)

    return () => {
      window.electron.ipcRenderer.removeAllListeners(SCOREBOARD_EVENT)
    }
  }, [loadPresets])

  // ---- Populate form when a preset is loaded into the game state ----
  // Sync form fields whenever the underlying gameConfig changes
  useEffect(() => {
    setPeriodDuration(makeField(gameConfig.periodDurationMinutes))
    setPeriodCount(gameConfig.periodCount)
    setShotClock(makeField(gameConfig.shotClockDurationSeconds))
    setBonus(makeField(gameConfig.bonusThreshold))
    setFullTimeouts(makeField(gameConfig.fullTimeoutsPerTeam))
    setTwentySecTimeouts(makeField(gameConfig.twentySecTimeoutsPerTeam))
  }, [gameConfig])

  // ---- Per-field blur: validate and show inline error ----
  function blurField(
    field: FieldState,
    setState: React.Dispatch<React.SetStateAction<FieldState>>,
    validate: (v: number) => string,
  ): void {
    const num = parseInt(field.raw, 10)
    const err = isNaN(num) ? 'Must be a valid integer' : validate(num)
    setState({ ...field, error: err })
  }

  // ---- Validate all fields before applying config ----
  function validateAll(): GameConfig | null {
    const pd = parseIntField(periodDuration)
    const sc = parseIntField(shotClock)
    const bn = parseIntField(bonus)
    const ft = parseIntField(fullTimeouts)
    const tt = parseIntField(twentySecTimeouts)

    const pdErr = isNaN(pd) ? 'Must be a valid integer' : validatePeriodDuration(pd)
    const scErr = isNaN(sc) ? 'Must be a valid integer' : validateShotClock(sc)
    const bnErr = isNaN(bn) ? 'Must be a valid integer' : validateBonus(bn)
    const ftErr = isNaN(ft) ? 'Must be a valid integer' : validateTimeouts(ft)
    const ttErr = isNaN(tt) ? 'Must be a valid integer' : validateTimeouts(tt)

    // Update error states
    if (pdErr) setPeriodDuration((prev) => ({ ...prev, error: pdErr }))
    if (scErr) setShotClock((prev) => ({ ...prev, error: scErr }))
    if (bnErr) setBonus((prev) => ({ ...prev, error: bnErr }))
    if (ftErr) setFullTimeouts((prev) => ({ ...prev, error: ftErr }))
    if (ttErr) setTwentySecTimeouts((prev) => ({ ...prev, error: ttErr }))

    if (pdErr || scErr || bnErr || ftErr || ttErr) return null

    return {
      periodDurationMinutes: pd,
      periodCount,
      overtimeDurationMinutes: gameConfig.overtimeDurationMinutes,
      shotClockDurationSeconds: sc,
      bonusThreshold: bn,
      fullTimeoutsPerTeam: ft,
      twentySecTimeoutsPerTeam: tt,
    }
  }

  // ---- Apply config ----
  function handleApplyConfig(): void {
    const config = validateAll()
    if (!config) return
    sendCommand({ type: 'LOAD_PRESET', preset: config })
  }

  // ---- Load a preset into the form + apply ----
  function handleLoadPreset(preset: Preset): void {
    sendCommand({ type: 'LOAD_PRESET', preset: preset.config })
  }

  // ---- Save as preset ----
  async function handleSaveAsConfirm(name: string): Promise<void> {
    setShowSaveModal(false)
    const config = validateAll()
    if (!config) {
      setToastMessage('Fix validation errors before saving a preset.')
      return
    }
    try {
      await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'SAVE_PRESET',
        name,
        config,
      })
      await loadPresets()
    } catch (err) {
      console.error('[GameConfigPanel] Failed to save preset:', err)
      setToastMessage('Failed to save preset. Please try again.')
    }
  }

  // ---- Delete preset ----
  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget) return
    const name = deleteTarget
    setDeleteTarget(null)
    try {
      await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'DELETE_PRESET',
        name,
      })
      await loadPresets()
    } catch (err) {
      console.error('[GameConfigPanel] Failed to delete preset:', err)
      setToastMessage('Failed to delete preset. Please try again.')
    }
  }

  // ---- Render ----

  return (
    <div className="gcp">
      {/* ------------------------------------------------------------------ */}
      {/* Toast notification                                                  */}
      {/* ------------------------------------------------------------------ */}
      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modals                                                               */}
      {/* ------------------------------------------------------------------ */}
      {showSaveModal && (
        <SaveAsModal
          existingNames={allPresetNames}
          builtInNames={builtInNames}
          onConfirm={handleSaveAsConfirm}
          onCancel={() => setShowSaveModal(false)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          presetName={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Config form                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="gcp__form">
        <div className="gcp__form-heading">Game Settings</div>

        {/* Period Duration */}
        <div className="gcp__field">
          <label className="gcp__label" htmlFor="gcp-period-duration">
            Period duration <span className="gcp__range">(1–60 min)</span>
          </label>
          <div className="gcp__input-row">
            <input
              id="gcp-period-duration"
              className={`gcp__input${periodDuration.error ? ' gcp__input--error' : ''}`}
              type="number"
              min={PERIOD_DURATION_MIN}
              max={PERIOD_DURATION_MAX}
              step={1}
              value={periodDuration.raw}
              onChange={(e) => setPeriodDuration({ raw: e.target.value, error: '' })}
              onBlur={() => blurField(periodDuration, setPeriodDuration, validatePeriodDuration)}
              aria-label="Period duration in minutes"
              aria-describedby={periodDuration.error ? 'gcp-period-duration-error' : undefined}
              aria-invalid={periodDuration.error ? 'true' : undefined}
            />
            <span className="gcp__suffix">min</span>
          </div>
          {periodDuration.error && (
            <div id="gcp-period-duration-error" className="gcp__error" role="alert">
              {periodDuration.error}
            </div>
          )}
        </div>

        {/* Period Count */}
        <div className="gcp__field">
          <span className="gcp__label">Periods</span>
          <div className="gcp__radio-group" role="radiogroup" aria-label="Number of periods">
            {([2, 4] as const).map((count) => (
              <label key={count} className="gcp__radio-label">
                <input
                  type="radio"
                  name="gcp-period-count"
                  value={count}
                  checked={periodCount === count}
                  onChange={() => setPeriodCount(count)}
                  aria-label={count === 2 ? '2 halves' : '4 quarters'}
                />
                <span>{count === 2 ? '2 (halves)' : '4 (quarters)'}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Shot Clock Duration */}
        <div className="gcp__field">
          <label className="gcp__label" htmlFor="gcp-shot-clock">
            Shot clock <span className="gcp__range">(14–30 s)</span>
          </label>
          <div className="gcp__input-row">
            <input
              id="gcp-shot-clock"
              className={`gcp__input${shotClock.error ? ' gcp__input--error' : ''}`}
              type="number"
              min={SHOT_CLOCK_MIN}
              max={SHOT_CLOCK_MAX}
              step={1}
              value={shotClock.raw}
              onChange={(e) => setShotClock({ raw: e.target.value, error: '' })}
              onBlur={() => blurField(shotClock, setShotClock, validateShotClock)}
              aria-label="Shot clock duration in seconds"
              aria-describedby={shotClock.error ? 'gcp-shot-clock-error' : undefined}
              aria-invalid={shotClock.error ? 'true' : undefined}
            />
            <span className="gcp__suffix">sec</span>
          </div>
          {shotClock.error && (
            <div id="gcp-shot-clock-error" className="gcp__error" role="alert">
              {shotClock.error}
            </div>
          )}
        </div>

        {/* Bonus Threshold */}
        <div className="gcp__field">
          <label className="gcp__label" htmlFor="gcp-bonus">
            Bonus threshold <span className="gcp__range">(1–10 fouls)</span>
          </label>
          <div className="gcp__input-row">
            <input
              id="gcp-bonus"
              className={`gcp__input${bonus.error ? ' gcp__input--error' : ''}`}
              type="number"
              min={BONUS_MIN}
              max={BONUS_MAX}
              step={1}
              value={bonus.raw}
              onChange={(e) => setBonus({ raw: e.target.value, error: '' })}
              onBlur={() => blurField(bonus, setBonus, validateBonus)}
              aria-label="Team foul bonus threshold"
              aria-describedby={bonus.error ? 'gcp-bonus-error' : undefined}
              aria-invalid={bonus.error ? 'true' : undefined}
            />
            <span className="gcp__suffix">fouls</span>
          </div>
          {bonus.error && (
            <div id="gcp-bonus-error" className="gcp__error" role="alert">
              {bonus.error}
            </div>
          )}
        </div>

        {/* Full Timeouts */}
        <div className="gcp__field">
          <label className="gcp__label" htmlFor="gcp-full-timeouts">
            Full timeouts per team <span className="gcp__range">(0–10)</span>
          </label>
          <div className="gcp__input-row">
            <input
              id="gcp-full-timeouts"
              className={`gcp__input${fullTimeouts.error ? ' gcp__input--error' : ''}`}
              type="number"
              min={TIMEOUTS_MIN}
              max={TIMEOUTS_MAX}
              step={1}
              value={fullTimeouts.raw}
              onChange={(e) => setFullTimeouts({ raw: e.target.value, error: '' })}
              onBlur={() => blurField(fullTimeouts, setFullTimeouts, validateTimeouts)}
              aria-label="Full timeouts per team"
              aria-describedby={fullTimeouts.error ? 'gcp-full-timeouts-error' : undefined}
              aria-invalid={fullTimeouts.error ? 'true' : undefined}
            />
          </div>
          {fullTimeouts.error && (
            <div id="gcp-full-timeouts-error" className="gcp__error" role="alert">
              {fullTimeouts.error}
            </div>
          )}
        </div>

        {/* 20-Second Timeouts */}
        <div className="gcp__field">
          <label className="gcp__label" htmlFor="gcp-twenty-timeouts">
            20-second timeouts per team <span className="gcp__range">(0–10)</span>
          </label>
          <div className="gcp__input-row">
            <input
              id="gcp-twenty-timeouts"
              className={`gcp__input${twentySecTimeouts.error ? ' gcp__input--error' : ''}`}
              type="number"
              min={TIMEOUTS_MIN}
              max={TIMEOUTS_MAX}
              step={1}
              value={twentySecTimeouts.raw}
              onChange={(e) => setTwentySecTimeouts({ raw: e.target.value, error: '' })}
              onBlur={() => blurField(twentySecTimeouts, setTwentySecTimeouts, validateTimeouts)}
              aria-label="20-second timeouts per team"
              aria-describedby={twentySecTimeouts.error ? 'gcp-twenty-timeouts-error' : undefined}
              aria-invalid={twentySecTimeouts.error ? 'true' : undefined}
            />
          </div>
          {twentySecTimeouts.error && (
            <div id="gcp-twenty-timeouts-error" className="gcp__error" role="alert">
              {twentySecTimeouts.error}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="gcp__form-actions">
          <button
            className="gcp__btn gcp__btn--primary"
            onClick={handleApplyConfig}
            aria-label="Apply game configuration"
          >
            Apply Config
          </button>
          <button
            className="gcp__btn gcp__btn--secondary"
            onClick={() => setShowSaveModal(true)}
            aria-label="Save configuration as a new preset"
          >
            Save As Preset
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Preset list                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="gcp__presets">
        <div className="gcp__presets-heading">Presets</div>

        {presetsLoading && (
          <div className="gcp__presets-loading" aria-live="polite">
            Loading presets…
          </div>
        )}

        {!presetsLoading && presets.length === 0 && (
          <div className="gcp__presets-empty" aria-live="polite">
            No presets saved yet.
          </div>
        )}

        <ul className="gcp__preset-list" aria-label="Saved presets">
          {presets.map((preset) => (
            <li key={preset.name} className="gcp__preset-item">
              <div className="gcp__preset-info">
                {preset.builtIn && (
                  <span
                    className="gcp__preset-lock"
                    aria-label="Read-only preset"
                    title="Built-in preset — read only"
                  >
                    🔒
                  </span>
                )}
                <span className="gcp__preset-name">{preset.name}</span>
              </div>
              <div className="gcp__preset-actions">
                <button
                  className="gcp__preset-btn gcp__preset-btn--load"
                  onClick={() => handleLoadPreset(preset)}
                  aria-label={`Load preset: ${preset.name}`}
                >
                  Load
                </button>
                {!preset.builtIn && (
                  <button
                    className="gcp__preset-btn gcp__preset-btn--delete"
                    onClick={() => setDeleteTarget(preset.name)}
                    aria-label={`Delete preset: ${preset.name}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default GameConfigPanel
