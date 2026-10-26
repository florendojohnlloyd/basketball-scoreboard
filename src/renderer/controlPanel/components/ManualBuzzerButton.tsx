import React, { useState, useCallback } from 'react'
import { relayBuzzerService } from '../hardware/relayBuzzerService'
import './ManualBuzzerButton.css'

// ---------------------------------------------------------------------------
// AudioEngine import — lazy / guarded so this component compiles safely
// before task 20 creates the module. The singleton reference is populated
// by audioEngine.ts when it is initialised.
// ---------------------------------------------------------------------------

let audioEngineRef: { playEndOfPeriod: () => void } | null = null

try {
  // Dynamically require so a missing module doesn't crash the renderer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../audio/audioEngine') as {
    audioEngine?: { playEndOfPeriod: () => void }
  }
  audioEngineRef = mod.audioEngine ?? null
} catch {
  // Module not yet created (task 20). Safe to ignore.
}

// ---------------------------------------------------------------------------
// ManualBuzzerButton component
// ---------------------------------------------------------------------------

/**
 * A single "Buzzer" button that triggers the end-of-period buzzer sound.
 * Shows a brief "pressed" visual state while the sound is playing.
 */
function ManualBuzzerButton(): React.ReactElement {
  const [pressed, setPressed] = useState(false)

  const handleClick = useCallback((): void => {
    setPressed(true)

    try {
      audioEngineRef?.playEndOfPeriod()
      relayBuzzerService.triggerBuzzer('MANUAL')
    } catch (err) {
      console.error('[ManualBuzzerButton] audioEngine.playEndOfPeriod() failed:', err)
    }

    // Clear the "pressed" visual after 800 ms (typical buzzer duration)
    setTimeout(() => setPressed(false), 800)
  }, [])

  return (
    <button
      className={`buzzer-btn${pressed ? ' buzzer-btn--pressed' : ''}`}
      onClick={handleClick}
      aria-label="Trigger end-of-period buzzer"
      aria-pressed={pressed}
    >
      🔔 Buzzer
    </button>
  )
}

export default ManualBuzzerButton
