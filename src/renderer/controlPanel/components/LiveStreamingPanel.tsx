/**
 * LiveStreamingPanel — Admin-only Live Streaming configuration & control UI
 * (Task 72, Requirement 33)
 *
 * Sections:
 * - Overlay server: port input (1024–65535, default 8080) + enable/disable
 *   toggle. Surfaces OVERLAY_PORT_CONFLICT as an inline error (Req 33.1, 33.7).
 * - Overlay config: visible-element checkboxes (score, clock, period, fouls,
 *   timeouts), font-scale slider (0.5×–2.0×), transparency slider (0–100%).
 *   Changes are pushed to the overlay page via OVERLAY_SET_CONFIG (Req 33.3).
 * - RTMP: destination URL (validated rtmp:// / rtmps://) + masked stream key,
 *   Start/Stop Stream button (Req 33.4).
 * - Live RTMP status: elapsed duration while streaming, reconnect warnings, and
 *   a persistent "Stream Failed" alert once all retries are exhausted
 *   (Req 33.5, 33.6). Broader status-bar integration lives in StatusBar.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { OverlayConfig, RtmpStatus } from '@shared/types'
import './LiveStreamingPanel.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 8080
const MIN_PORT = 1024
const MAX_PORT = 65535

const MIN_FONT_SCALE = 0.5
const MAX_FONT_SCALE = 2.0

/** All overlay elements that can be toggled on/off (Req 33.3). */
export const OVERLAY_ELEMENTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'score', label: 'Score' },
  { key: 'clock', label: 'Clock' },
  { key: 'period', label: 'Period' },
  { key: 'fouls', label: 'Team Fouls' },
  { key: 'timeouts', label: 'Timeouts' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the port is an integer within the allowed range (Req 33.1). */
export function isValidOverlayPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT
}

/** True when the URL uses the rtmp:// or rtmps:// scheme (Req 33.4). */
export function isValidRtmpUrl(url: string): boolean {
  const u = url.trim()
  return u.startsWith('rtmp://') || u.startsWith('rtmps://')
}

/** Format elapsed seconds as H:MM:SS (or M:SS below one hour). */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${minutes}:${ss}`
}

const DEFAULT_CONFIG: OverlayConfig = {
  visibleElements: OVERLAY_ELEMENTS.map((e) => e.key),
  fontScaleFactor: 1.0,
  backgroundAlpha: 0.0,
}

// ---------------------------------------------------------------------------
// LiveStreamingPanel component
// ---------------------------------------------------------------------------

function LiveStreamingPanel(): React.ReactElement {
  // ── Overlay server state ──
  const [portInput, setPortInput] = useState<string>(String(DEFAULT_PORT))
  const [overlayRunning, setOverlayRunning] = useState(false)
  const [overlayPort, setOverlayPort] = useState(0)
  const [portConflictPort, setPortConflictPort] = useState<number | null>(null)
  const [overlayBusy, setOverlayBusy] = useState(false)
  const [overlayError, setOverlayError] = useState<string | null>(null)

  // ── Overlay config state ──
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG)

  // ── RTMP state ──
  const [rtmpUrl, setRtmpUrl] = useState('')
  const [streamKey, setStreamKey] = useState('')
  const [rtmpStatus, setRtmpStatus] = useState<RtmpStatus>({
    active: false,
    elapsedSeconds: 0,
    error: null,
  })
  const [rtmpBusy, setRtmpBusy] = useState(false)
  const [rtmpError, setRtmpError] = useState<string | null>(null)
  const [reconnectWarning, setReconnectWarning] = useState<string | null>(null)
  const [streamFailed, setStreamFailed] = useState(false)

  // ── Load current overlay config + status on mount ──
  useEffect(() => {
    let cancelled = false

    window.electron.ipcRenderer
      .invoke(SCOREBOARD_QUERY, { type: 'OVERLAY_GET_CONFIG' })
      .then((raw: unknown) => {
        if (cancelled || !raw) return
        const r = raw as { config?: OverlayConfig; running?: boolean; port?: number }
        if (r.config) setConfig(r.config)
        if (typeof r.running === 'boolean') setOverlayRunning(r.running)
        if (r.port) {
          setOverlayPort(r.port)
          if (r.running) setPortInput(String(r.port))
        }
      })
      .catch(() => {
        /* leave defaults */
      })

    window.electron.ipcRenderer
      .invoke(SCOREBOARD_QUERY, { type: 'RTMP_GET_STATUS' })
      .then((raw: unknown) => {
        if (cancelled || !raw) return
        const s = raw as RtmpStatus
        setRtmpStatus(s)
      })
      .catch(() => {
        /* leave defaults */
      })

    return () => {
      cancelled = true
    }
  }, [])

  // ── Subscribe to overlay/RTMP events ──
  const handleEvent = useCallback((raw: unknown): void => {
    const event = raw as {
      type: string
      port?: number
      status?: RtmpStatus
      attempt?: number
      maxAttempts?: number
      message?: string
    }

    switch (event.type) {
      case 'OVERLAY_PORT_CONFLICT':
        setPortConflictPort(event.port ?? null)
        setOverlayBusy(false)
        setOverlayRunning(false)
        break

      case 'RTMP_STATUS_UPDATE':
        if (event.status) {
          setRtmpStatus(event.status)
          // A healthy status update clears the transient reconnect warning.
          if (event.status.active && !event.status.error) {
            setReconnectWarning(null)
          }
          if (!event.status.active && !event.status.error) {
            setStreamFailed(false)
          }
        }
        break

      case 'RTMP_RECONNECT_ATTEMPT':
        setReconnectWarning(
          `Connection lost — reconnecting (attempt ${event.attempt ?? '?'} of ${event.maxAttempts ?? '?'})…`,
        )
        break

      case 'RTMP_FAILED':
        setStreamFailed(true)
        setReconnectWarning(null)
        break

      case 'RTMP_ERROR':
        setRtmpError(event.message ?? 'RTMP error.')
        break

      default:
        break
    }
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)
    return () => {
      window.electron.ipcRenderer.removeAllListeners(SCOREBOARD_EVENT)
    }
  }, [handleEvent])

  // ── Overlay server handlers ──

  async function handleStartOverlay(): Promise<void> {
    setOverlayError(null)
    setPortConflictPort(null)

    const port = Number(portInput)
    if (!isValidOverlayPort(port)) {
      setOverlayError(`Port must be a whole number between ${MIN_PORT} and ${MAX_PORT}.`)
      return
    }

    setOverlayBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'OVERLAY_START',
        port,
      })) as {
        success: boolean
        status?: { running: boolean; port: number; portConflict: boolean }
        error?: string
      }

      if (result && result.success && result.status) {
        setOverlayRunning(result.status.running)
        setOverlayPort(result.status.port)
      } else if (result && !result.success) {
        // Port conflicts also arrive via the OVERLAY_PORT_CONFLICT event.
        if (!result.status?.portConflict) {
          setOverlayError(result.error ?? 'Failed to start the overlay server.')
        }
      }
    } catch (err) {
      setOverlayError((err as Error).message ?? 'Failed to start the overlay server.')
    } finally {
      setOverlayBusy(false)
    }
  }

  async function handleStopOverlay(): Promise<void> {
    setOverlayError(null)
    setPortConflictPort(null)
    setOverlayBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'OVERLAY_STOP',
      })) as { success: boolean; error?: string }

      if (result && result.success) {
        setOverlayRunning(false)
        setOverlayPort(0)
      } else if (result && !result.success) {
        setOverlayError(result.error ?? 'Failed to stop the overlay server.')
      }
    } catch (err) {
      setOverlayError((err as Error).message ?? 'Failed to stop the overlay server.')
    } finally {
      setOverlayBusy(false)
    }
  }

  function handleToggleOverlay(nextEnabled: boolean): void {
    if (nextEnabled) void handleStartOverlay()
    else void handleStopOverlay()
  }

  // ── Overlay config handlers (pushed live, Req 33.3) ──

  function pushConfig(next: OverlayConfig): void {
    setConfig(next)
    void window.electron.ipcRenderer
      .invoke(SCOREBOARD_QUERY, { type: 'OVERLAY_SET_CONFIG', config: next })
      .catch(() => {
        /* non-blocking */
      })
  }

  function handleToggleElement(key: string, checked: boolean): void {
    const set = new Set(config.visibleElements)
    if (checked) set.add(key)
    else set.delete(key)
    // Preserve canonical element ordering.
    const visibleElements = OVERLAY_ELEMENTS.map((e) => e.key).filter((k) => set.has(k))
    pushConfig({ ...config, visibleElements })
  }

  function handleFontScale(value: number): void {
    pushConfig({ ...config, fontScaleFactor: value })
  }

  function handleTransparency(percent: number): void {
    // Slider is 0–100% transparency; backgroundAlpha is opacity (1 = opaque).
    const alpha = Math.min(1, Math.max(0, 1 - percent / 100))
    pushConfig({ ...config, backgroundAlpha: alpha })
  }

  // ── RTMP handlers ──

  async function handleStartStream(): Promise<void> {
    setRtmpError(null)
    setStreamFailed(false)
    setReconnectWarning(null)

    if (!isValidRtmpUrl(rtmpUrl)) {
      setRtmpError('Destination URL must start with rtmp:// or rtmps://')
      return
    }

    setRtmpBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'RTMP_START',
        config: { destinationUrl: rtmpUrl.trim(), streamKey },
      })) as { success: boolean; status?: RtmpStatus; error?: string }

      if (result && result.success && result.status) {
        setRtmpStatus(result.status)
      } else if (result && !result.success) {
        setRtmpError(result.error ?? 'Failed to start the RTMP stream.')
      }
    } catch (err) {
      setRtmpError((err as Error).message ?? 'Failed to start the RTMP stream.')
    } finally {
      setRtmpBusy(false)
    }
  }

  async function handleStopStream(): Promise<void> {
    setRtmpError(null)
    setStreamFailed(false)
    setReconnectWarning(null)
    setRtmpBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'RTMP_STOP',
      })) as { success: boolean; status?: RtmpStatus; error?: string }

      if (result && result.success && result.status) {
        setRtmpStatus(result.status)
      } else if (result && !result.success) {
        setRtmpError(result.error ?? 'Failed to stop the RTMP stream.')
      }
    } catch (err) {
      setRtmpError((err as Error).message ?? 'Failed to stop the RTMP stream.')
    } finally {
      setRtmpBusy(false)
    }
  }

  // ── Derived values ──
  const transparencyPercent = Math.round((1 - config.backgroundAlpha) * 100)
  const streaming = rtmpStatus.active

  return (
    <div className="live-streaming-panel">

      {/* ── Overlay server ── */}
      <fieldset className="live-streaming-panel__fieldset">
        <legend>Overlay Server</legend>

        {portConflictPort !== null && (
          <div className="live-streaming-panel__banner" role="alert" aria-live="assertive">
            <span className="live-streaming-panel__banner-icon">⚠</span>
            <span>
              Port {portConflictPort} is already in use. Choose a different port and try again.
            </span>
          </div>
        )}

        <div className="live-streaming-panel__row live-streaming-panel__row--wrap">
          <label className="live-streaming-panel__label" htmlFor="overlay-enabled">
            <input
              id="overlay-enabled"
              type="checkbox"
              checked={overlayRunning}
              disabled={overlayBusy}
              onChange={(e) => handleToggleOverlay(e.target.checked)}
            />
            {' '}Enable overlay server
          </label>
        </div>

        <small className="live-streaming-panel__hint">
          Serves a transparent browser-source page for OBS Studio or equivalent streaming software.
        </small>

        <div className="live-streaming-panel__row">
          <label className="live-streaming-panel__label" htmlFor="overlay-port">Port</label>
          <input
            id="overlay-port"
            className="live-streaming-panel__input live-streaming-panel__input--port"
            type="number"
            inputMode="numeric"
            min={MIN_PORT}
            max={MAX_PORT}
            step={1}
            placeholder={String(DEFAULT_PORT)}
            value={portInput}
            disabled={overlayRunning || overlayBusy}
            onChange={(e) => setPortInput(e.target.value)}
            aria-describedby="overlay-port-hint"
          />
          {overlayRunning && (
            <a
              className="live-streaming-panel__url"
              href={`http://localhost:${overlayPort}/`}
              target="_blank"
              rel="noreferrer"
            >
              http://localhost:{overlayPort}/
            </a>
          )}
        </div>
        <small id="overlay-port-hint" className="live-streaming-panel__hint">
          Allowed range: {MIN_PORT}–{MAX_PORT} (default {DEFAULT_PORT}). Stop the server to change the port.
        </small>

        <div className="live-streaming-panel__row live-streaming-panel__row--status" aria-live="polite">
          {overlayRunning ? (
            <span
              className="live-streaming-panel__status live-streaming-panel__status--running"
              data-testid="overlay-status"
            >
              ● Running on port {overlayPort}
            </span>
          ) : (
            <span
              className="live-streaming-panel__status live-streaming-panel__status--stopped"
              data-testid="overlay-status"
            >
              ● Stopped
            </span>
          )}
        </div>

        {overlayError && (
          <div className="live-streaming-panel__notice live-streaming-panel__notice--error" aria-live="assertive">
            <span className="live-streaming-panel__notice-icon">⚠</span>
            <span>{overlayError}</span>
          </div>
        )}
      </fieldset>

      {/* ── Overlay configuration ── */}
      <fieldset className="live-streaming-panel__fieldset">
        <legend>Overlay Appearance</legend>

        <div className="live-streaming-panel__row live-streaming-panel__row--wrap">
          <span className="live-streaming-panel__label">Visible elements</span>
          <div className="live-streaming-panel__checks">
            {OVERLAY_ELEMENTS.map((el) => (
              <label key={el.key} className="live-streaming-panel__check">
                <input
                  type="checkbox"
                  checked={config.visibleElements.includes(el.key)}
                  onChange={(e) => handleToggleElement(el.key, e.target.checked)}
                  data-testid={`overlay-el-${el.key}`}
                />
                {' '}{el.label}
              </label>
            ))}
          </div>
        </div>

        <div className="live-streaming-panel__row">
          <label className="live-streaming-panel__label" htmlFor="overlay-font-scale">
            Font scale
          </label>
          <input
            id="overlay-font-scale"
            type="range"
            min={MIN_FONT_SCALE}
            max={MAX_FONT_SCALE}
            step={0.1}
            value={config.fontScaleFactor}
            onChange={(e) => handleFontScale(Number(e.target.value))}
            aria-valuetext={`${config.fontScaleFactor.toFixed(1)}×`}
          />
          <span className="live-streaming-panel__val">{config.fontScaleFactor.toFixed(1)}×</span>
        </div>

        <div className="live-streaming-panel__row">
          <label className="live-streaming-panel__label" htmlFor="overlay-transparency">
            Transparency
          </label>
          <input
            id="overlay-transparency"
            type="range"
            min={0}
            max={100}
            step={1}
            value={transparencyPercent}
            onChange={(e) => handleTransparency(Number(e.target.value))}
            aria-valuetext={`${transparencyPercent}%`}
          />
          <span className="live-streaming-panel__val">{transparencyPercent}%</span>
        </div>
      </fieldset>

      {/* ── RTMP streaming ── */}
      <fieldset className="live-streaming-panel__fieldset">
        <legend>RTMP Stream</legend>

        <div className="live-streaming-panel__row">
          <label className="live-streaming-panel__label" htmlFor="rtmp-url">Destination URL</label>
          <input
            id="rtmp-url"
            className="live-streaming-panel__input"
            type="text"
            placeholder="rtmp://live.example.com/app"
            value={rtmpUrl}
            disabled={streaming || rtmpBusy}
            onChange={(e) => setRtmpUrl(e.target.value)}
          />
        </div>

        <div className="live-streaming-panel__row">
          <label className="live-streaming-panel__label" htmlFor="rtmp-key">Stream key</label>
          <input
            id="rtmp-key"
            className="live-streaming-panel__input"
            type="password"
            placeholder="••••••••••"
            value={streamKey}
            disabled={streaming || rtmpBusy}
            onChange={(e) => setStreamKey(e.target.value)}
          />
        </div>

        <div className="live-streaming-panel__row live-streaming-panel__row--actions">
          {streaming ? (
            <button
              className="live-streaming-panel__btn live-streaming-panel__btn--secondary"
              onClick={() => { void handleStopStream() }}
              disabled={rtmpBusy}
              aria-busy={rtmpBusy}
            >
              {rtmpBusy ? '⏳ Stopping…' : '⏹ Stop Stream'}
            </button>
          ) : (
            <button
              className="live-streaming-panel__btn live-streaming-panel__btn--primary"
              onClick={() => { void handleStartStream() }}
              disabled={rtmpBusy}
              aria-busy={rtmpBusy}
            >
              {rtmpBusy ? '⏳ Starting…' : '▶ Start Stream'}
            </button>
          )}

          {streaming && (
            <span
              className="live-streaming-panel__streaming-badge"
              data-testid="streaming-badge"
              aria-live="polite"
            >
              ● Streaming {formatElapsed(rtmpStatus.elapsedSeconds)}
            </span>
          )}
        </div>

        {reconnectWarning && (
          <div
            className="live-streaming-panel__notice live-streaming-panel__notice--warning"
            role="alert"
            aria-live="assertive"
            data-testid="reconnect-warning"
          >
            <span className="live-streaming-panel__notice-icon">⚠</span>
            <span>{reconnectWarning}</span>
          </div>
        )}

        {streamFailed && (
          <div
            className="live-streaming-panel__notice live-streaming-panel__notice--error"
            role="alert"
            aria-live="assertive"
            data-testid="stream-failed"
          >
            <span className="live-streaming-panel__notice-icon">⚠</span>
            <span>Stream Failed — reconnection attempts exhausted. The stream has stopped.</span>
          </div>
        )}

        {rtmpError && !streamFailed && (
          <div className="live-streaming-panel__notice live-streaming-panel__notice--error" aria-live="assertive">
            <span className="live-streaming-panel__notice-icon">⚠</span>
            <span>{rtmpError}</span>
          </div>
        )}
      </fieldset>

    </div>
  )
}

export default LiveStreamingPanel
