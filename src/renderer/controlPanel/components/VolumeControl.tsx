import React, { useCallback } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import './VolumeControl.css'

// ---------------------------------------------------------------------------
// AudioEngine import — lazy / guarded so this component compiles safely
// before task 20 creates the module.
// ---------------------------------------------------------------------------

let audioEngineRef: { setGain: (level: number) => void } | null = null

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../audio/audioEngine') as {
    audioEngine?: { setGain: (level: number) => void }
  }
  audioEngineRef = mod.audioEngine ?? null
} catch {
  // Module not yet created (task 20). Safe to ignore.
}

// ---------------------------------------------------------------------------
// VolumeControl component
// ---------------------------------------------------------------------------

/**
 * Slider (0–100) that controls audio output volume.
 *
 * - Converts the integer percentage to a 0.0–1.0 level.
 * - Dispatches SET_VOLUME to the main process via IPC.
 * - Immediately applies the gain via audioEngine.setGain() for instant feedback.
 * - Displays the current percentage next to the slider.
 */
function VolumeControl(): React.ReactElement {
  const volume = useControlPanelStore((s) => s.gameState.volume)

  // volume in state is 0.0–1.0; convert to 0–100 for the slider
  const percent = Math.round(volume * 100)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const percentValue = parseInt(e.target.value, 10)
      const level = percentValue / 100

      // Dispatch to main process so the value is persisted in game state
      sendCommand({ type: 'SET_VOLUME', level })

      // Apply gain immediately for real-time feedback (no IPC round-trip needed)
      try {
        audioEngineRef?.setGain(level)
      } catch (err) {
        console.error('[VolumeControl] audioEngine.setGain() failed:', err)
      }
    },
    [],
  )

  return (
    <div className="volume-control">
      <label className="volume-control__label" htmlFor="volume-slider">
        Volume
      </label>
      <div className="volume-control__row">
        <input
          id="volume-slider"
          className="volume-control__slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={handleChange}
          aria-label={`Volume: ${percent}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent} percent`}
        />
        <span className="volume-control__value" aria-hidden="true">
          {percent}%
        </span>
      </div>
    </div>
  )
}

export default VolumeControl
