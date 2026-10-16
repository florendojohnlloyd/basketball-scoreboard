/**
 * CloudSyncPanel — Admin-only Cloud Sync configuration & status UI (Task 69, Requirement 32)
 *
 * Features:
 * - Endpoint URL field (must start with https://) + masked API Key field
 * - "Test Connection" button → CLOUD_SYNC_TEST_CONNECTION, shows success (green) /
 *   failure (red, with error description) indicator (Req 32.3)
 * - Enable/disable toggle; saving persists config via CLOUD_SYNC_SET_CONFIG. HTTP
 *   (non-TLS) endpoints are rejected at save time (Req 32.8).
 * - Last-sync timestamp and a "Syncing…" indicator, driven by CLOUD_SYNC_STATUS events.
 * - Persistent CLOUD_SYNC_AUTH_ERROR banner with a "Re-enter credentials" prompt (Req 32.9).
 * - "Sync Now" button for a manual trigger via CLOUD_SYNC_TRIGGER_NOW.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { CloudSyncConfig } from '@shared/types'
import './CloudSyncPanel.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncStatus = 'idle' | 'syncing' | 'error'

interface TestResult {
  ok: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the URL uses the TLS scheme required by Req 32.8. */
export function isHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim())
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// CloudSyncPanel component
// ---------------------------------------------------------------------------

function CloudSyncPanel(): React.ReactElement {
  // ── Configuration form state ──
  const [enabled, setEnabled] = useState(false)
  const [endpointUrl, setEndpointUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasStoredKey, setHasStoredKey] = useState(false)

  // ── Save / validation state ──
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Test-connection state ──
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // ── Live sync status (driven by CLOUD_SYNC_STATUS events) ──
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [manualSyncing, setManualSyncing] = useState(false)

  // ── Persistent auth-error banner (CLOUD_SYNC_AUTH_ERROR) ──
  const [authError, setAuthError] = useState(false)

  const apiKeyRef = useRef<HTMLInputElement | null>(null)

  // ── Load the current (sanitised) config from the main process on mount ──
  useEffect(() => {
    let cancelled = false
    window.electron.ipcRenderer
      .invoke(SCOREBOARD_QUERY, { type: 'CLOUD_SYNC_GET_CONFIG' })
      .then((raw: unknown) => {
        if (cancelled || !raw) return
        const cfg = raw as { enabled?: boolean; endpointUrl?: string; hasApiKey?: boolean; lastSyncAt?: string | null }
        setEnabled(!!cfg.enabled)
        setEndpointUrl(cfg.endpointUrl ?? '')
        setHasStoredKey(!!cfg.hasApiKey)
        if (cfg.lastSyncAt) setLastSyncAt(cfg.lastSyncAt)
      })
      .catch(() => {
        // No config available yet — leave defaults.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Listen for CLOUD_SYNC_STATUS and CLOUD_SYNC_AUTH_ERROR events ──
  const handleEvent = useCallback((raw: unknown): void => {
    const event = raw as { type: string; status?: SyncStatus; lastSyncAt?: string }

    if (event.type === 'CLOUD_SYNC_STATUS') {
      const status = event.status ?? 'idle'
      setSyncStatus(status)
      if (status !== 'syncing') {
        setManualSyncing(false)
      }
      if (event.lastSyncAt) {
        setLastSyncAt(event.lastSyncAt)
      }
      // Any successful status clears a previously-shown auth error.
      if (status === 'idle') {
        setAuthError(false)
      }
    }

    if (event.type === 'CLOUD_SYNC_AUTH_ERROR') {
      setAuthError(true)
      setManualSyncing(false)
      setSyncStatus('error')
    }
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)
    return () => {
      window.electron.ipcRenderer.removeAllListeners(SCOREBOARD_EVENT)
    }
  }, [handleEvent])

  // ── Handlers ──

  async function handleTestConnection(): Promise<void> {
    setTestResult(null)

    // Client-side guard so the user gets immediate feedback for a bad scheme.
    if (!isHttpsUrl(endpointUrl)) {
      setTestResult({ ok: false, error: 'Endpoint URL must start with https://' })
      return
    }

    setTesting(true)
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'CLOUD_SYNC_TEST_CONNECTION',
      })) as TestResult
      setTestResult(result ?? { ok: false, error: 'No response from endpoint' })
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message ?? 'Test connection failed' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(): Promise<void> {
    setSaveError(null)

    // Reject non-TLS endpoints at save time (Req 32.8).
    if (!isHttpsUrl(endpointUrl)) {
      setSaveStatus('error')
      setSaveError('Endpoint URL must start with https:// — insecure http:// endpoints are not allowed.')
      return
    }

    // Require a key on first configuration (when none is stored yet).
    if (enabled && !hasStoredKey && !apiKey.trim()) {
      setSaveStatus('error')
      setSaveError('An API Key is required to enable Cloud Sync.')
      return
    }

    setSaveStatus('saving')

    const config: CloudSyncConfig = {
      enabled,
      endpointUrl: endpointUrl.trim(),
      // Empty apiKey means "keep the existing stored key" — the service only
      // re-encrypts when a non-empty key is provided.
      apiKey: apiKey.trim(),
    }

    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'CLOUD_SYNC_SET_CONFIG',
        config,
      })) as { success: boolean; error?: string }

      if (result && result.success) {
        setSaveStatus('saved')
        setAuthError(false)
        // Once saved, the key is stored; clear the plaintext field.
        if (apiKey.trim()) {
          setHasStoredKey(true)
          setApiKey('')
        }
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
        setSaveError(result?.error ?? 'Failed to save Cloud Sync configuration.')
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError((err as Error).message ?? 'Failed to save Cloud Sync configuration.')
    }
  }

  async function handleSyncNow(): Promise<void> {
    setManualSyncing(true)
    setSyncStatus('syncing')
    try {
      const result = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'CLOUD_SYNC_TRIGGER_NOW',
      })) as { success?: boolean; completedAt?: string; error?: string } | undefined

      if (result) {
        if (result.success) {
          setSyncStatus('idle')
          if (result.completedAt) setLastSyncAt(result.completedAt)
        } else {
          setSyncStatus('error')
        }
      }
    } catch {
      setSyncStatus('error')
    } finally {
      setManualSyncing(false)
    }
  }

  function handleReenterCredentials(): void {
    setAuthError(false)
    setApiKey('')
    setHasStoredKey(false)
    // Focus the API key field so the Admin can immediately re-enter credentials.
    apiKeyRef.current?.focus()
  }

  const isSyncing = syncStatus === 'syncing' || manualSyncing

  return (
    <div className="cloud-sync-panel">

      {/* ── Persistent auth-error banner (Req 32.9) ── */}
      {authError && (
        <div className="cloud-sync-panel__banner" role="alert" aria-live="assertive">
          <span className="cloud-sync-panel__banner-icon">⚠</span>
          <span className="cloud-sync-panel__banner-text">
            Cloud Sync authentication failed. Automatic sync is paused until you re-enter valid credentials.
          </span>
          <button
            className="cloud-sync-panel__btn cloud-sync-panel__btn--primary"
            onClick={handleReenterCredentials}
          >
            Re-enter credentials
          </button>
        </div>
      )}

      {/* ── Configuration ── */}
      <fieldset className="cloud-sync-panel__fieldset">
        <legend>Cloud Sync Configuration</legend>

        <div className="cloud-sync-panel__row cloud-sync-panel__row--wrap">
          <label className="cloud-sync-panel__label" htmlFor="cloud-sync-enabled">
            <input
              id="cloud-sync-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {' '}Enable Cloud Sync
          </label>
        </div>

        <div className="cloud-sync-panel__row">
          <label className="cloud-sync-panel__label" htmlFor="cloud-sync-endpoint">Endpoint URL</label>
          <input
            id="cloud-sync-endpoint"
            className="cloud-sync-panel__input"
            type="url"
            inputMode="url"
            placeholder="https://sync.example.com/api"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            aria-describedby="cloud-sync-endpoint-hint"
          />
        </div>
        <small id="cloud-sync-endpoint-hint" className="cloud-sync-panel__hint">
          Must begin with <code>https://</code>. Insecure <code>http://</code> endpoints are rejected.
        </small>

        <div className="cloud-sync-panel__row">
          <label className="cloud-sync-panel__label" htmlFor="cloud-sync-apikey">API Key</label>
          <input
            id="cloud-sync-apikey"
            ref={apiKeyRef}
            className="cloud-sync-panel__input"
            type="password"
            autoComplete="new-password"
            placeholder={hasStoredKey ? '•••••••• (stored — leave blank to keep)' : 'Enter API key'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="cloud-sync-panel__row cloud-sync-panel__row--actions">
          <button
            className="cloud-sync-panel__btn cloud-sync-panel__btn--secondary"
            onClick={handleTestConnection}
            disabled={testing}
            aria-busy={testing}
          >
            {testing ? '⏳ Testing…' : '🔌 Test Connection'}
          </button>

          <button
            className="cloud-sync-panel__btn cloud-sync-panel__btn--primary"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? '⏳ Saving…' : saveStatus === 'saved' ? '✓ Saved' : '💾 Save'}
          </button>
        </div>

        {/* Test-connection result */}
        {testResult && (
          <div
            className={`cloud-sync-panel__notice cloud-sync-panel__notice--${testResult.ok ? 'success' : 'error'}`}
            data-testid="test-result"
            aria-live="polite"
          >
            <span className="cloud-sync-panel__notice-icon">{testResult.ok ? '✓' : '⚠'}</span>
            <span>
              {testResult.ok
                ? 'Connection successful — the endpoint responded.'
                : `Connection failed: ${testResult.error ?? 'Unknown error'}`}
            </span>
          </div>
        )}

        {/* Save error */}
        {saveStatus === 'error' && saveError && (
          <div className="cloud-sync-panel__notice cloud-sync-panel__notice--error" aria-live="assertive">
            <span className="cloud-sync-panel__notice-icon">⚠</span>
            <span>{saveError}</span>
          </div>
        )}
      </fieldset>

      {/* ── Status ── */}
      <fieldset className="cloud-sync-panel__fieldset">
        <legend>Sync Status</legend>

        <div className="cloud-sync-panel__row cloud-sync-panel__row--status" aria-live="polite">
          {isSyncing ? (
            <span className="cloud-sync-panel__status cloud-sync-panel__status--syncing" data-testid="sync-status">
              <span className="cloud-sync-panel__spinner" aria-hidden="true" />
              Syncing…
            </span>
          ) : syncStatus === 'error' ? (
            <span className="cloud-sync-panel__status cloud-sync-panel__status--error" data-testid="sync-status">
              ⚠ Sync error
            </span>
          ) : (
            <span className="cloud-sync-panel__status cloud-sync-panel__status--idle" data-testid="sync-status">
              ● Idle
            </span>
          )}
        </div>

        <div className="cloud-sync-panel__row">
          <span className="cloud-sync-panel__label">Last sync</span>
          <span className="cloud-sync-panel__val" data-testid="last-sync">{formatTimestamp(lastSyncAt)}</span>
        </div>

        <div className="cloud-sync-panel__row cloud-sync-panel__row--actions">
          <button
            className="cloud-sync-panel__btn cloud-sync-panel__btn--primary"
            onClick={handleSyncNow}
            disabled={!enabled || isSyncing}
            aria-busy={isSyncing}
          >
            {isSyncing ? '⏳ Syncing…' : '☁ Sync Now'}
          </button>
        </div>
      </fieldset>

    </div>
  )
}

export default CloudSyncPanel
