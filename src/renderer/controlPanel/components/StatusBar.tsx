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
  /** When true, this warning can only be dismissed automatically (not by user click) */
  autoOnly?: boolean
}

type ScoreboardEvent = {
  type: string
  name?: string
  message?: string
  destinationFolder?: string
  success?: boolean
  path?: string
  error?: string
  status?: { active: boolean; elapsedSeconds: number; error: string | null }
  attempt?: number
  maxAttempts?: number
}

/** Format elapsed seconds as H:MM:SS (or M:SS below one hour). */
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${minutes}:${ss}`
}

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

  // ---- Persistent backup-destination-inaccessible alert id ----
  // Dismissed only when next backup to that destination succeeds (Req 29.5)
  const [backupDestAlertId, setBackupDestAlertId] = useState<string | null>(null)

  // ---- Live Streaming status (Requirement 33.5–33.6) ----
  // "Streaming" badge with elapsed duration while the RTMP stream is active.
  const [streamActive, setStreamActive] = useState(false)
  const [streamElapsed, setStreamElapsed] = useState(0)
  // Persistent "Stream Failed" alert after all reconnect retries are exhausted.
  const [streamFailedAlertId, setStreamFailedAlertId] = useState<string | null>(null)

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

        // ── Backup events (Requirement 29) ──

        case 'BACKUP_DESTINATION_INACCESSIBLE': {
          // Persistent warning — only one at a time. Cleared when next backup to that
          // destination succeeds (see BACKUP_COMPLETE handler below).
          setBackupDestAlertId((prevId) => {
            if (prevId !== null) return prevId // already showing
            const folder = event.destinationFolder ?? 'configured folder'
            const newId = makeId()
            setWarnings((prev) => [
              ...prev,
              {
                id: newId,
                message: `Auto-backup failed — destination folder inaccessible: ${folder}`,
                kind: 'error',
                autoOnly: true,
              },
            ])
            return newId
          })
          break
        }

        case 'BACKUP_COMPLETE': {
          if (event.success) {
            // Clear the destination-inaccessible warning — backup to that folder succeeded
            setBackupDestAlertId((prevId) => {
              if (prevId !== null) {
                setWarnings((prev) => prev.filter((w) => w.id !== prevId))
              }
              return null
            })
          }
          break
        }

        // ── Live Streaming events (Requirement 33.5–33.6) ──

        case 'RTMP_STATUS_UPDATE': {
          const status = event.status
          if (!status) break
          setStreamActive(status.active)
          setStreamElapsed(status.elapsedSeconds)
          // A healthy, active stream clears any lingering "Stream Failed" alert.
          if (status.active) {
            setStreamFailedAlertId((prevId) => {
              if (prevId !== null) {
                setWarnings((prev) => prev.filter((w) => w.id !== prevId))
              }
              return null
            })
          }
          break
        }

        case 'RTMP_RECONNECT_ATTEMPT': {
          const attempt = event.attempt ?? '?'
          const max = event.maxAttempts ?? '?'
          addWarning(
            `Stream connection lost — reconnecting (attempt ${attempt} of ${max})…`,
            'warning',
          )
          break
        }

        case 'RTMP_FAILED': {
          // Stream is no longer active; show a persistent error alert (Req 33.6).
          setStreamActive(false)
          setStreamFailedAlertId((prevId) => {
            if (prevId !== null) return prevId // already showing
            const newId = makeId()
            setWarnings((prev) => [
              ...prev,
              {
                id: newId,
                message: 'Stream Failed — reconnection attempts exhausted. The stream has stopped.',
                kind: 'error',
              },
            ])
            return newId
          })
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

      {/* Live Streaming badge (Requirement 33.5) */}
      {streamActive && (
        <div
          className="status-bar__streaming"
          role="status"
          aria-live="polite"
          data-testid="statusbar-streaming"
        >
          <span className="status-bar__streaming-dot" aria-hidden="true" />
          <span className="status-bar__streaming-text">
            Streaming {formatElapsed(streamElapsed)}
          </span>
        </div>
      )}

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

                {/* Dismiss button — shown for manually dismissable warnings only.
                    autoOnly warnings (e.g. BACKUP_DESTINATION_INACCESSIBLE) are
                    dismissed only when the system clears the condition. */}
                {!w.autoOnly && (
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
                )}
              </li>
            )
          })}
        </ul>
      )}
    </footer>
  )
}

export default StatusBar
