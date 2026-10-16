/**
 * MobileViewerPanel — Admin-only Mobile Viewer server configuration & status UI
 * (Task 78, Requirement 36)
 *
 * Features:
 * - Enable/disable the mobile viewer server from the Admin settings area (Req 36.7).
 * - Configurable port in the range 1024–65535 (default 8081) (Req 36.1).
 * - Displays the local network IPv4 URL and a scannable QR code encoding that URL
 *   whenever the server is active (Req 36.8).
 * - Surfaces MOBILE_VIEWER_PORT_CONFLICT and MOBILE_VIEWER_STATUS_CHANGED events.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { MobileViewerStatus } from '@shared/types'
import './MobileViewerPanel.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 8081
const MIN_PORT = 1024
const MAX_PORT = 65535

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the port is an integer within the allowed range (Req 36.1). */
export function isValidViewerPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT
}

// ---------------------------------------------------------------------------
// MobileViewerPanel component
// ---------------------------------------------------------------------------

function MobileViewerPanel(): React.ReactElement {
  // ── Configuration form state ──
  const [portInput, setPortInput] = useState<string>(String(DEFAULT_PORT))

  // ── Live server status ──
  const [status, setStatus] = useState<MobileViewerStatus>({
    running: false,
    port: 0,
    localUrl: null,
    qrCodeDataUri: null,
  })

  // ── Action / feedback state ──
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [portConflictPort, setPortConflictPort] = useState<number | null>(null)

  // ── Load the current status from the main process on mount ──
  useEffect(() => {
    let cancelled = false
    window.electron.ipcRenderer
      .invoke(SCOREBOARD_QUERY, { type: 'MOBILE_VIEWER_GET_STATUS' })
      .then((raw: unknown) => {
        if (cancelled || !raw) return
        const s = raw as MobileViewerStatus
        setStatus(s)
        if (s.running && s.port) setPortInput(String(s.port))
      })
      .catch(() => {
        // No status available yet — leave defaults.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Listen for MOBILE_VIEWER_STATUS_CHANGED and MOBILE_VIEWER_PORT_CONFLICT ──
  const handleEvent = useCallback((raw: unknown): void => {
    const event = raw as { type: string; status?: MobileViewerStatus; port?: number }

    if (event.type === 'MOBILE_VIEWER_STATUS_CHANGED' && event.status) {
      setStatus(event.status)
      setPortConflictPort(null)
      if (event.status.running && event.status.port) {
        setPortInput(String(event.status.port))
      }
    }

    if (event.type === 'MOBILE_VIEWER_PORT_CONFLICT') {
      setPortConflictPort(event.port ?? null)
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)
    return () => {
      window.electron.ipcRenderer.removeAllListeners(SCOREBOARD_EVENT)
    }
  }, [handleEvent])

  // ── Handlers ──

  async function handleStart(): Promise<void> {
    setError(null)
    setPortConflictPort(null)

    const port = Number(portInput)
    if (!isValidViewerPort(port)) {
      setError(`Port must be a whole number between ${MIN_PORT} and ${MAX_PORT}.`)
      return
    }

    setBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'MOBILE_VIEWER_START',
        port,
      })) as { success: boolean; status?: MobileViewerStatus; error?: string }

      if (result && result.success && result.status) {
        setStatus(result.status)
      } else if (result && !result.success) {
        // Port-conflict errors also arrive via the MOBILE_VIEWER_PORT_CONFLICT event.
        setError(result.error ?? 'Failed to start the mobile viewer server.')
      }
    } catch (err) {
      setError((err as Error).message ?? 'Failed to start the mobile viewer server.')
    } finally {
      setBusy(false)
    }
  }

  async function handleStop(): Promise<void> {
    setError(null)
    setPortConflictPort(null)
    setBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'MOBILE_VIEWER_STOP',
      })) as { success: boolean; status?: MobileViewerStatus; error?: string }

      if (result && result.success && result.status) {
        setStatus(result.status)
      } else if (result && !result.success) {
        setError(result.error ?? 'Failed to stop the mobile viewer server.')
      }
    } catch (err) {
      setError((err as Error).message ?? 'Failed to stop the mobile viewer server.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(nextEnabled: boolean): Promise<void> {
    if (nextEnabled) {
      await handleStart()
    } else {
      await handleStop()
    }
  }

  const running = status.running

  return (
    <div className="mobile-viewer-panel">

      {/* ── Port-conflict banner (MOBILE_VIEWER_PORT_CONFLICT) ── */}
      {portConflictPort !== null && (
        <div className="mobile-viewer-panel__banner" role="alert" aria-live="assertive">
          <span className="mobile-viewer-panel__banner-icon">⚠</span>
          <span className="mobile-viewer-panel__banner-text">
            Port {portConflictPort} is already in use. Choose a different port and try again.
          </span>
        </div>
      )}

      {/* ── Configuration ── */}
      <fieldset className="mobile-viewer-panel__fieldset">
        <legend>Mobile Viewer</legend>

        <div className="mobile-viewer-panel__row mobile-viewer-panel__row--wrap">
          <label className="mobile-viewer-panel__label" htmlFor="mobile-viewer-enabled">
            <input
              id="mobile-viewer-enabled"
              type="checkbox"
              checked={running}
              disabled={busy}
              onChange={(e) => { void handleToggle(e.target.checked) }}
            />
            {' '}Enable Mobile Viewer server
          </label>
        </div>

        <small className="mobile-viewer-panel__hint">
          Serves a mobile-friendly live-scores page on your local network. Coaches and players
          can open the URL below (or scan the QR code) on any device connected to the same network.
        </small>

        <div className="mobile-viewer-panel__row">
          <label className="mobile-viewer-panel__label" htmlFor="mobile-viewer-port">Port</label>
          <input
            id="mobile-viewer-port"
            className="mobile-viewer-panel__input mobile-viewer-panel__input--port"
            type="number"
            inputMode="numeric"
            min={MIN_PORT}
            max={MAX_PORT}
            step={1}
            placeholder={String(DEFAULT_PORT)}
            value={portInput}
            disabled={running || busy}
            onChange={(e) => setPortInput(e.target.value)}
            aria-describedby="mobile-viewer-port-hint"
          />
        </div>
        <small id="mobile-viewer-port-hint" className="mobile-viewer-panel__hint">
          Allowed range: {MIN_PORT}–{MAX_PORT} (default {DEFAULT_PORT}). Stop the server to change the port.
        </small>

        {/* Start / Stop actions */}
        <div className="mobile-viewer-panel__row mobile-viewer-panel__row--actions">
          {running ? (
            <button
              className="mobile-viewer-panel__btn mobile-viewer-panel__btn--secondary"
              onClick={() => { void handleStop() }}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? '⏳ Stopping…' : '⏹ Stop Server'}
            </button>
          ) : (
            <button
              className="mobile-viewer-panel__btn mobile-viewer-panel__btn--primary"
              onClick={() => { void handleStart() }}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? '⏳ Starting…' : '▶ Start Server'}
            </button>
          )}
        </div>

        {/* Error notice */}
        {error && (
          <div className="mobile-viewer-panel__notice mobile-viewer-panel__notice--error" aria-live="assertive">
            <span className="mobile-viewer-panel__notice-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}
      </fieldset>

      {/* ── Status / Access (Req 36.8) ── */}
      <fieldset className="mobile-viewer-panel__fieldset">
        <legend>Access</legend>

        <div className="mobile-viewer-panel__row mobile-viewer-panel__row--status" aria-live="polite">
          {running ? (
            <span className="mobile-viewer-panel__status mobile-viewer-panel__status--running" data-testid="viewer-status">
              ● Running on port {status.port}
            </span>
          ) : (
            <span className="mobile-viewer-panel__status mobile-viewer-panel__status--stopped" data-testid="viewer-status">
              ● Stopped
            </span>
          )}
        </div>

        {running && status.localUrl ? (
          <div className="mobile-viewer-panel__access">
            <div className="mobile-viewer-panel__row">
              <span className="mobile-viewer-panel__label">Local URL</span>
              <a
                className="mobile-viewer-panel__url"
                href={status.localUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="viewer-url"
              >
                {status.localUrl}
              </a>
            </div>

            {status.qrCodeDataUri && (
              <div className="mobile-viewer-panel__qr-wrap">
                <img
                  className="mobile-viewer-panel__qr"
                  src={status.qrCodeDataUri}
                  alt={`QR code linking to the mobile viewer at ${status.localUrl}`}
                  data-testid="viewer-qr"
                  width={200}
                  height={200}
                />
                <small className="mobile-viewer-panel__hint">
                  Scan this code with a phone camera to open the live scores page.
                </small>
              </div>
            )}
          </div>
        ) : (
          <small className="mobile-viewer-panel__hint">
            Start the server to display the shareable URL and QR code.
          </small>
        )}
      </fieldset>

    </div>
  )
}

export default MobileViewerPanel
