import React, { useCallback, useEffect, useState } from 'react'
import { SCOREBOARD_EVENT, SCOREBOARD_QUERY } from '@shared/types'
import './StatusBar.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A warning entry shown in the status bar. */
interface Warning {
  id: string
  message: string
  kind: 'error' | 'warning'
}

type ScoreboardEvent = { type: string; name?: string; message?: string }

/** Minimal display info returned by GET_MONITORS. */
interface DisplayInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ---------------------------------------------------------------------------
// StatusBar component
// ---------------------------------------------------------------------------

/**
 * Persistent status bar rendered at the bottom of the Control Panel.
 *
 * Responsibilities:
 * - Shows current monitor connection status.
 * - Shows active system warnings (audio unavailable, logo load error,
 *   corrupted preset, display disconnected).
 * - The DISPLAY_DISCONNECTED alert persists until the operator dismisses it
 *   or a display is reconnected.
 */
function StatusBar(): React.ReactElement {
  // ---- Monitor status label ----
  const [monitorStatus, setMonitorStatus] = useState<string>('Checking display…')

  // ---- Active warnings ----
  const [warnings, setWarnings] = useState<Warning[]>([])

  // ---- Persistent display-disconnected alert id (so we can clear it) ----
  const [disconnectedAlertId, setDisconnectedAlertId] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const addWarning = useCallback((message: string, kind: Warning['kind']): string => {
    const id = makeId()
    setWarnings((prev) => [...prev, { id, message, kind }])
    return id
  }, [])

  const removeWarning = useCallback((id: string): void => {
    setWarnings((prev) => prev.filter((w) => w.id !== id))
  }, [])

  // -------------------------------------------------------------------------
  // Load monitor status on mount
  // -------------------------------------------------------------------------

  async function refreshMonitorStatus(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'GET_MONITORS',
      })
      const displays = result as DisplayInfo[]
      if (displays.length <= 1) {
        setMonitorStatus('No secondary display')
      } else {
        // Report the second display (index 1) as the scoreboard display
        setMonitorStatus(`Scoreboard on Display ${2}`)
      }
    } catch {
      setMonitorStatus('Display status unavailable')
    }
  }

  // -------------------------------------------------------------------------
  // Mount: load monitor status + subscribe to scoreboard events
  // -------------------------------------------------------------------------

  useEffect(() => {
    refreshMonitorStatus()

    const handleEvent = (raw: unknown): void => {
      const event = raw as ScoreboardEvent

      switch (event.type) {
        case 'DISPLAY_DISCONNECTED': {
          // Only add one disconnected alert at a time
          setDisconnectedAlertId((prevId) => {
            if (prevId !== null) return prevId // already showing
            const newId = makeId()
            setWarnings((prev) => [
              ...prev,
              {
                id: newId,
                message: 'Display disconnected — scoreboard is no longer visible',
                kind: 'error',
              },
            ])
            return newId
          })
          setMonitorStatus('No secondary display')
          break
        }

        case 'DISPLAY_ADDED': {
          // A display was added — clear the disconnected alert and refresh status
          setDisconnectedAlertId((prevId) => {
            if (prevId !== null) {
              setWarnings((prev) => prev.filter((w) => w.id !== prevId))
            }
            return null
          })
          refreshMonitorStatus()
          break
        }

        case 'DISPLAY_REMOVED': {
          // Refresh the monitor status; if now only one display the status updates
          refreshMonitorStatus()
          break
        }

        case 'AUDIO_UNAVAILABLE': {
          addWarning('Audio unavailable — buzzer sounds will not play', 'warning')
          break
        }

        case 'LOGO_ERROR': {
          const detail = event.name ? ` (${event.name})` : ''
          addWarning(`Logo could not be loaded${detail}`, 'warning')
          break
        }

        case 'PRESET_CORRUPTED': {
          const name = event.name ?? 'Unknown'
          addWarning(`Preset "${name}" is corrupted and has been removed`, 'error')
          break
        }

        default:
          break
      }
    }

    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)

    return () => {
      window.electron.ipcRenderer.removeAllListeners(SCOREBOARD_EVENT)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addWarning])

  // -------------------------------------------------------------------------
  // Dismiss handler for the disconnected alert (operator-initiated)
  // -------------------------------------------------------------------------

  function handleDismissDisconnected(): void {
    setDisconnectedAlertId((prevId) => {
      if (prevId !== null) {
        setWarnings((prev) => prev.filter((w) => w.id !== prevId))
      }
      return null
    })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasWarnings = warnings.length > 0

  return (
    <footer
      className={`status-bar${hasWarnings ? ' status-bar--has-warnings' : ''}`}
      role="contentinfo"
      aria-label="System status"
    >
      {/* Monitor connection status */}
      <div className="status-bar__monitor" aria-live="polite" aria-atomic="true">
        <span className="status-bar__dot" aria-hidden="true" />
        <span className="status-bar__monitor-text">{monitorStatus}</span>
      </div>

      {/* Active warnings / alerts */}
      {hasWarnings && (
        <ul className="status-bar__warnings" aria-label="System warnings" aria-live="assertive">
          {warnings.map((w) => {
            const isDisconnected = w.id === disconnectedAlertId

            return (
              <li
                key={w.id}
                className={`status-bar__warning status-bar__warning--${w.kind}`}
                role="alert"
              >
                <span className="status-bar__warning-icon" aria-hidden="true">
                  {w.kind === 'error' ? '⚠' : 'ℹ'}
                </span>
                <span className="status-bar__warning-text">{w.message}</span>

                {/* Dismiss button — always available; required for DISPLAY_DISCONNECTED */}
                <button
                  className="status-bar__dismiss"
                  onClick={
                    isDisconnected
                      ? handleDismissDisconnected
                      : () => removeWarning(w.id)
                  }
                  aria-label={`Dismiss: ${w.message}`}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </footer>
  )
}

export default StatusBar
