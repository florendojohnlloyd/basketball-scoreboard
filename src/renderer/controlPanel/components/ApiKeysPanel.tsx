/**
 * ApiKeysPanel — Admin-only REST API key management & server control (Task 74, Requirement 34)
 *
 * Features:
 * - API server enable/disable + port config (1024–65535, default 3000). Starting
 *   surfaces an API_PORT_CONFLICT error when the port is already in use (Req 34.1).
 * - Create key: label input (1–50 chars). On creation the raw key is shown ONCE
 *   with a copy affordance — only the SHA-256 hash is stored (Req 34.4).
 * - List active/revoked keys with label, created date, and active status.
 * - Revoke key with confirmation; takes effect immediately on the ApiServer (Req 34.5).
 *
 * All interactions go through the SCOREBOARD_QUERY IPC channel.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { SCOREBOARD_QUERY } from '@shared/types'
import type { ApiKey } from '@shared/types'
import './ApiKeysPanel.css'

// ---------------------------------------------------------------------------
// Constants (mirror apiKeyStore business rules)
// ---------------------------------------------------------------------------

export const API_PORT_MIN = 1024
export const API_PORT_MAX = 65535
export const DEFAULT_API_PORT = 3000
export const API_KEY_LABEL_MAX = 50
export const MAX_ACTIVE_API_KEYS = 20

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the value is an integer inside the allowed API port range. */
export function isValidApiPort(port: number): boolean {
  return Number.isInteger(port) && port >= API_PORT_MIN && port <= API_PORT_MAX
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

interface ApiStatus {
  running: boolean
  port: number
  enabled: boolean
  portConflict: boolean
}

// ---------------------------------------------------------------------------
// ApiKeysPanel component
// ---------------------------------------------------------------------------

function ApiKeysPanel(): React.ReactElement {
  // ── Server status ──
  const [status, setStatus] = useState<ApiStatus>({
    running: false,
    port: DEFAULT_API_PORT,
    enabled: false,
    portConflict: false,
  })
  const [portInput, setPortInput] = useState<string>(String(DEFAULT_API_PORT))
  const [serverBusy, setServerBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // ── Key list ──
  const [keys, setKeys] = useState<ApiKey[]>([])

  // ── Create-key form ──
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const activeCount = keys.filter((k) => k.active).length
  const atKeyLimit = activeCount >= MAX_ACTIVE_API_KEYS

  // ── Data loading ──
  const loadKeys = useCallback(async (): Promise<void> => {
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'API_KEY_LIST',
      })) as { success?: boolean; keys?: ApiKey[] } | undefined
      if (result?.keys) setKeys(result.keys)
    } catch {
      // Leave the current list unchanged on transient failures.
    }
  }, [])

  const loadStatus = useCallback(async (): Promise<void> => {
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'API_GET_STATUS',
      })) as ApiStatus | undefined
      if (result) {
        setStatus(result)
        setPortInput(String(result.port))
      }
    } catch {
      // Keep defaults on failure.
    }
  }, [])

  useEffect(() => {
    void loadStatus()
    void loadKeys()
  }, [loadStatus, loadKeys])

  // ── Server enable/disable ──
  async function handleStart(): Promise<void> {
    setServerError(null)
    const port = Number(portInput)
    if (!isValidApiPort(port)) {
      setServerError(`Port must be an integer between ${API_PORT_MIN} and ${API_PORT_MAX}.`)
      return
    }
    setServerBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'API_START',
        port,
      })) as { success?: boolean; error?: string; status?: ApiStatus } | undefined

      if (result?.status) setStatus(result.status)
      if (!result?.success) {
        setServerError(result?.error ?? 'Failed to start the API server.')
      }
    } catch (err) {
      setServerError((err as Error).message ?? 'Failed to start the API server.')
    } finally {
      setServerBusy(false)
    }
  }

  async function handleStop(): Promise<void> {
    setServerError(null)
    setServerBusy(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'API_STOP',
      })) as { success?: boolean; error?: string; status?: ApiStatus } | undefined
      if (result?.status) setStatus(result.status)
      if (!result?.success && result?.error) setServerError(result.error)
    } catch (err) {
      setServerError((err as Error).message ?? 'Failed to stop the API server.')
    } finally {
      setServerBusy(false)
    }
  }

  // ── Create key ──
  async function handleCreate(): Promise<void> {
    setCreateError(null)
    setNewRawKey(null)
    setCopied(false)

    const trimmed = label.trim()
    if (trimmed.length < 1 || trimmed.length > API_KEY_LABEL_MAX) {
      setCreateError(`Label must be 1–${API_KEY_LABEL_MAX} characters.`)
      return
    }
    if (atKeyLimit) {
      setCreateError(`Maximum of ${MAX_ACTIVE_API_KEYS} active keys reached. Revoke one first.`)
      return
    }

    setCreating(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'API_KEY_CREATE',
        label: trimmed,
      })) as { success?: boolean; error?: string; rawKey?: string } | undefined

      if (result?.success && result.rawKey) {
        setNewRawKey(result.rawKey)
        setLabel('')
        await loadKeys()
      } else {
        setCreateError(result?.error ?? 'Failed to create API key.')
      }
    } catch (err) {
      setCreateError((err as Error).message ?? 'Failed to create API key.')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy(): Promise<void> {
    if (!newRawKey) return
    try {
      await navigator.clipboard.writeText(newRawKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable; the key remains visible for manual copy.
    }
  }

  // ── Revoke key ──
  async function handleRevoke(key: ApiKey): Promise<void> {
    const ok = window.confirm(
      `Revoke API key "${key.label}"? Applications using this key will stop working immediately. This cannot be undone.`,
    )
    if (!ok) return

    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'API_KEY_REVOKE',
        id: key.id,
      })) as { success?: boolean; error?: string; keys?: ApiKey[] } | undefined
      if (result?.keys) {
        setKeys(result.keys)
      } else {
        await loadKeys()
      }
    } catch {
      await loadKeys()
    }
  }

  return (
    <div className="api-keys-panel">

      {/* ── Server control ── */}
      <fieldset className="api-keys-panel__fieldset">
        <legend>API Server</legend>

        <div className="api-keys-panel__row api-keys-panel__row--status" aria-live="polite">
          {status.running ? (
            <span className="api-keys-panel__status api-keys-panel__status--running" data-testid="api-status">
              ● Running on port {status.port}
            </span>
          ) : (
            <span className="api-keys-panel__status api-keys-panel__status--stopped" data-testid="api-status">
              ○ Stopped
            </span>
          )}
        </div>

        <div className="api-keys-panel__row">
          <label className="api-keys-panel__label" htmlFor="api-port">Port</label>
          <input
            id="api-port"
            className="api-keys-panel__input api-keys-panel__input--port"
            type="number"
            min={API_PORT_MIN}
            max={API_PORT_MAX}
            value={portInput}
            disabled={status.running || serverBusy}
            onChange={(e) => setPortInput(e.target.value)}
          />
        </div>
        <small className="api-keys-panel__hint">
          Allowed range {API_PORT_MIN}–{API_PORT_MAX} (default {DEFAULT_API_PORT}).
        </small>

        <div className="api-keys-panel__row api-keys-panel__row--actions">
          {status.running ? (
            <button
              className="api-keys-panel__btn api-keys-panel__btn--secondary"
              onClick={handleStop}
              disabled={serverBusy}
            >
              {serverBusy ? '⏳ Stopping…' : '■ Disable API'}
            </button>
          ) : (
            <button
              className="api-keys-panel__btn api-keys-panel__btn--primary"
              onClick={handleStart}
              disabled={serverBusy}
            >
              {serverBusy ? '⏳ Starting…' : '▶ Enable API'}
            </button>
          )}
        </div>

        {(serverError || status.portConflict) && (
          <div className="api-keys-panel__notice api-keys-panel__notice--error" role="alert" data-testid="api-error">
            <span className="api-keys-panel__notice-icon">⚠</span>
            <span>{serverError ?? `Port ${status.port} is already in use. Choose another port.`}</span>
          </div>
        )}
      </fieldset>

      {/* ── Create key ── */}
      <fieldset className="api-keys-panel__fieldset">
        <legend>Create API Key</legend>

        <div className="api-keys-panel__row">
          <label className="api-keys-panel__label" htmlFor="api-key-label">Label</label>
          <input
            id="api-key-label"
            className="api-keys-panel__input"
            type="text"
            maxLength={API_KEY_LABEL_MAX}
            placeholder="e.g. Stats Platform"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="api-keys-panel__row api-keys-panel__row--actions">
          <button
            className="api-keys-panel__btn api-keys-panel__btn--primary"
            onClick={handleCreate}
            disabled={creating || atKeyLimit || !label.trim()}
          >
            {creating ? '⏳ Creating…' : '＋ Create Key'}
          </button>
          <span className="api-keys-panel__count" data-testid="key-count">
            {activeCount} / {MAX_ACTIVE_API_KEYS} active
          </span>
        </div>

        {createError && (
          <div className="api-keys-panel__notice api-keys-panel__notice--error" role="alert">
            <span className="api-keys-panel__notice-icon">⚠</span>
            <span>{createError}</span>
          </div>
        )}

        {/* One-time raw key display (Req 34.4) */}
        {newRawKey && (
          <div className="api-keys-panel__reveal" role="status" data-testid="raw-key-reveal">
            <div className="api-keys-panel__reveal-warning">
              ⚠ Copy this key now — it will not be shown again. Only its hash is stored.
            </div>
            <div className="api-keys-panel__reveal-row">
              <code className="api-keys-panel__reveal-key" data-testid="raw-key-value">{newRawKey}</code>
              <button
                className="api-keys-panel__btn api-keys-panel__btn--secondary"
                onClick={handleCopy}
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {/* ── Key list ── */}
      <fieldset className="api-keys-panel__fieldset">
        <legend>API Keys</legend>

        {keys.length === 0 ? (
          <p className="api-keys-panel__empty">No API keys yet.</p>
        ) : (
          <table className="api-keys-panel__table">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Created</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="api-keys-panel__sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className={key.active ? '' : 'api-keys-panel__row--revoked'}>
                  <td>{key.label}</td>
                  <td>{formatDate(key.createdAt)}</td>
                  <td>
                    {key.active ? (
                      <span className="api-keys-panel__badge api-keys-panel__badge--active">Active</span>
                    ) : (
                      <span className="api-keys-panel__badge api-keys-panel__badge--revoked">Revoked</span>
                    )}
                  </td>
                  <td className="api-keys-panel__actions-cell">
                    {key.active && (
                      <button
                        className="api-keys-panel__btn api-keys-panel__btn--danger api-keys-panel__btn--sm"
                        onClick={() => handleRevoke(key)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>

    </div>
  )
}

export default ApiKeysPanel
