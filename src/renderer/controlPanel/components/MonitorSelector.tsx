import React, { useEffect, useRef, useState } from 'react'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import './MonitorSelector.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal representation of a display returned by GET_MONITORS. */
interface DisplayInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
}

type ScoreboardEvent = { type: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayLabel(display: DisplayInfo, index: number): string {
  return `Display ${index + 1} (${display.bounds.width}×${display.bounds.height})`
}

// ---------------------------------------------------------------------------
// MonitorSelector component
// ---------------------------------------------------------------------------

/**
 * Renders a dropdown of available displays and an "Assign" button that moves
 * the scoreboard window to the selected display.
 *
 * Behaviour:
 * - On mount, queries available displays via GET_MONITORS.
 * - Disables dropdown and button when only one monitor is present.
 * - Shows a persistent alert when the display hosting the scoreboard is disconnected.
 * - Re-enables controls when a new display is detected via DISPLAY_ADDED.
 */
function MonitorSelector(): React.ReactElement {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [disconnected, setDisconnected] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Track whether we've loaded displays at least once
  const loadedRef = useRef(false)

  // -------------------------------------------------------------------------
  // Load available displays
  // -------------------------------------------------------------------------

  async function loadDisplays(): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'GET_MONITORS',
      })
      const list = result as DisplayInfo[]
      setDisplays(list)
      // Pre-select first item if nothing is selected yet
      if (list.length > 0 && selectedId === null) {
        setSelectedId(list[0].id)
      }
      loadedRef.current = true
    } catch (err) {
      console.error('[MonitorSelector] Failed to load displays:', err)
    }
  }

  // -------------------------------------------------------------------------
  // Mount: load displays + subscribe to scoreboard events
  // -------------------------------------------------------------------------

  useEffect(() => {
    loadDisplays()

    const handleEvent = (raw: unknown): void => {
      const event = raw as ScoreboardEvent

      if (event.type === 'DISPLAY_DISCONNECTED') {
        setDisconnected(true)
      } else if (event.type === 'DISPLAY_ADDED') {
        // Re-query the display list and re-enable controls
        setDisconnected(false)
        loadDisplays()
      } else if (event.type === 'DISPLAY_REMOVED') {
        // Refresh the list so a disconnected display is no longer shown
        loadDisplays()
      }
    }

    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)

    return () => {
      window.electron.ipcRenderer.removeAllListeners(SCOREBOARD_EVENT)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -------------------------------------------------------------------------
  // Assign handler
  // -------------------------------------------------------------------------

  async function handleAssign(): Promise<void> {
    if (selectedId === null) return
    setAssigning(true)
    setAssignError(null)
    try {
      await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'ASSIGN_DISPLAY',
        displayId: selectedId,
      })
      // Clear disconnected state — scoreboard is now reassigned
      setDisconnected(false)
    } catch (err) {
      setAssignError('Failed to assign display. Please try again.')
      console.error('[MonitorSelector] Assign failed:', err)
    } finally {
      setAssigning(false)
    }
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isSingleMonitor = displays.length <= 1
  const controlsDisabled = isSingleMonitor || assigning

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="monitor-selector">
      {/* Disconnection alert — persistent until reassigned */}
      {disconnected && (
        <div
          className="monitor-selector__alert monitor-selector__alert--error"
          role="alert"
          aria-live="assertive"
        >
          Display monitor disconnected — scoreboard is no longer visible
        </div>
      )}

      {/* Single-monitor status message */}
      {isSingleMonitor && (
        <div
          className="monitor-selector__status"
          role="status"
          aria-live="polite"
        >
          A second display is required for the Scoreboard
        </div>
      )}

      {/* Assign error */}
      {assignError && (
        <div
          className="monitor-selector__alert monitor-selector__alert--error"
          role="alert"
        >
          {assignError}
        </div>
      )}

      {/* Dropdown + Assign button */}
      <div className="monitor-selector__row">
        <select
          className="monitor-selector__select"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          disabled={controlsDisabled}
          aria-label="Select display for scoreboard"
          aria-disabled={controlsDisabled}
        >
          {displays.length === 0 && (
            <option value="" disabled>
              No displays found
            </option>
          )}
          {displays.map((display, index) => (
            <option key={display.id} value={display.id}>
              {displayLabel(display, index)}
            </option>
          ))}
        </select>

        <button
          className="monitor-selector__btn"
          onClick={handleAssign}
          disabled={controlsDisabled}
          aria-label="Assign scoreboard to selected display"
          aria-disabled={controlsDisabled}
        >
          {assigning ? 'Assigning…' : 'Assign'}
        </button>
      </div>
    </div>
  )
}

export default MonitorSelector
