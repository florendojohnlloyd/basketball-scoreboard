/**
 * AudioEngine — Web Audio API singleton for the Control Panel renderer.
 *
 * Responsibilities:
 * - Construct and manage an AudioContext + master GainNode.
 * - Synthesize buzzer tones via OscillatorNode on demand.
 * - Subscribe to scoreboard:event IPC messages and trigger the appropriate
 *   buzzer automatically (BUZZER_END_PERIOD / BUZZER_SHOT_CLOCK).
 * - Surface an AUDIO_UNAVAILABLE event to the StatusBar when the audio
 *   subsystem cannot be initialised or enters a suspended state.
 * - Expose a setGain(level) method for the VolumeControl slider.
 *
 * All playback methods are silent no-ops when audioAvailable === false.
 */

import { SCOREBOARD_EVENT } from '@shared/types'
import hornSound from '../../shared/sounds/horn.mp3'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScoreboardEvent = { type: string }

// ---------------------------------------------------------------------------
// AudioEngine class (private — exported only as singleton)
// ---------------------------------------------------------------------------

class AudioEngine {
  private ctx: AudioContext | null = null
  private gainNode: GainNode | null = null
  private audioAvailable = false

  constructor() {
    this._init()
    this._subscribeToIpc()
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  private _init(): void {
    try {
      this.ctx = new AudioContext()

      // Create the master gain node and connect it to the destination
      this.gainNode = this.ctx.createGain()
      this.gainNode.gain.value = 0.8 // match DEFAULT_GAME_STATE volume
      this.gainNode.connect(this.ctx.destination)

      if (this.ctx.state === 'suspended') {
        // Context starts suspended on some browsers until a user gesture —
        // attempt to resume immediately; if it stays suspended, mark unavailable.
        this.ctx
          .resume()
          .then(() => {
            if (this.ctx!.state === 'suspended') {
              this._markUnavailable()
            } else {
              this.audioAvailable = true
            }
          })
          .catch(() => this._markUnavailable())
      } else {
        this.audioAvailable = true
      }

      // Also watch for the context being suspended after the fact
      // (e.g. OS mutes audio while app is running)
      this.ctx.addEventListener('statechange', () => {
        if (this.ctx?.state === 'suspended') {
          this._markUnavailable()
        }
      })
    } catch {
      this._markUnavailable()
    }
  }

  private _markUnavailable(): void {
    if (this.audioAvailable) {
      // Only emit the warning once
      return
    }
    this.audioAvailable = false
    this._emitAudioUnavailable()
  }

  /** Dispatch the AUDIO_UNAVAILABLE event via IPC so StatusBar can show it. */
  private _emitAudioUnavailable(): void {
    try {
      window.electron.ipcRenderer.send(SCOREBOARD_EVENT, { type: 'AUDIO_UNAVAILABLE' })
    } catch {
      // If IPC is unavailable (e.g., test env), fall back to console warning
      console.warn('[AudioEngine] Audio unavailable and could not send IPC event')
    }
  }

  // -------------------------------------------------------------------------
  // IPC subscription
  // -------------------------------------------------------------------------

  private _subscribeToIpc(): void {
    try {
      // Resume AudioContext on first user interaction (required by Chromium)
      const resumeOnGesture = (): void => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().then(() => {
            this.audioAvailable = true
          }).catch(() => {/* ignore */})
        }
        window.removeEventListener('click', resumeOnGesture)
        window.removeEventListener('touchstart', resumeOnGesture)
        window.removeEventListener('keydown', resumeOnGesture)
      }
      window.addEventListener('click', resumeOnGesture)
      window.addEventListener('touchstart', resumeOnGesture)
      window.addEventListener('keydown', resumeOnGesture)

      window.electron.ipcRenderer.on(SCOREBOARD_EVENT, (raw: unknown) => {
        const event = raw as ScoreboardEvent
        // Resume context if suspended before playing
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().then(() => {
            this.audioAvailable = true
            this._handleBuzzerEvent(event)
          }).catch(() => {/* ignore */})
          return
        }
        this._handleBuzzerEvent(event)
      })
    } catch {
      console.warn('[AudioEngine] Could not subscribe to scoreboard:event IPC channel')
    }
  }

  private _handleBuzzerEvent(event: ScoreboardEvent): void {
    switch (event.type) {
      case 'BUZZER_END_PERIOD':
        this.playEndOfPeriod()
        break
      case 'BUZZER_SHOT_CLOCK':
        this.playShotClockViolation()
        break
      default:
        break
    }
  }

  // -------------------------------------------------------------------------
  // Playback helpers
  // -------------------------------------------------------------------------

  /**
   * Create an OscillatorNode routed through the master GainNode and play it
   * for the specified duration (seconds).
   */
  private _playTone(frequencyHz: number, durationSeconds: number): void {
    if (!this.audioAvailable || !this.ctx || !this.gainNode) return

    // Resume the context if it was suspended (e.g., before first user gesture)
    const playWhenReady = (): void => {
      const oscillator = this.ctx!.createOscillator()
      oscillator.type = 'square'
      oscillator.frequency.value = frequencyHz
      oscillator.connect(this.gainNode!)

      const start = this.ctx!.currentTime
      oscillator.start(start)
      oscillator.stop(start + durationSeconds)

      // Detach after playback to free resources
      oscillator.onended = () => {
        try {
          oscillator.disconnect()
        } catch {
          // already disconnected
        }
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(playWhenReady).catch(() => this._markUnavailable())
    } else {
      playWhenReady()
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * End-of-period buzzer — plays the horn sound.
   */
  playEndOfPeriod(): void {
    this._playAudioFile(hornSound)
  }

  /**
   * Shot-clock / substitution horn — plays the horn sound.
   */
  playShotClockViolation(): void {
    this._playAudioFile(hornSound)
  }

  /**
   * Play an audio file using HTMLAudioElement (bypasses Web Audio tone).
   */
  private _playAudioFile(url: string): void {
    try {
      const audio = new Audio(url)
      audio.volume = this.gainNode?.gain.value ?? 0.8
      audio.play().catch(() => this._playTone(440, 1.5))
    } catch {
      this._playTone(440, 1.5)
    }
  }

  /**
   * Set the master gain level. Accepts values in [0.0, 1.0] (Requirement 12.4).
   * Values outside the valid range are clamped silently.
   */
  setGain(level: number): void {
    if (!this.gainNode) return
    const clamped = Math.max(0, Math.min(1, level))
    this.gainNode.gain.value = clamped
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const audioEngine = new AudioEngine()
