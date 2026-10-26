import React, { useEffect, useState } from 'react'
import {
  relayBuzzerService,
  RelayBuzzerState,
} from '../hardware/relayBuzzerService'
import './RelayBuzzerSettings.css'

export function RelayBuzzerSettings(): React.ReactElement {
  const [state, setState] = useState<RelayBuzzerState>(() => relayBuzzerService.getState())
  const [vercelCopied, setVercelCopied] = useState(false)

  const VERCEL_CONSOLE_URL = 'https://relay-web-console.vercel.app'

  useEffect(() => {
    const unsubscribe = relayBuzzerService.subscribe((s) => setState(s))
    return () => {
      unsubscribe()
    }
  }, [])

  const handleOpenVercelConsole = async (): Promise<void> => {
    try {
      if (window.electron?.openExternal) {
        await window.electron.openExternal(VERCEL_CONSOLE_URL)
        return
      }
      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke('scoreboard:query', {
          type: 'OPEN_EXTERNAL_URL',
          url: VERCEL_CONSOLE_URL
        })
        return
      }
    } catch (err) {
      console.warn('[RelaySettings] openExternal failed, falling back to window.open:', err)
    }
    window.open(VERCEL_CONSOLE_URL, '_blank')
  }

  const handleCopyVercelUrl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(VERCEL_CONSOLE_URL)
      setVercelCopied(true)
      setTimeout(() => setVercelCopied(false), 2000)
    } catch {
      // ignore clipboard error
    }
  }

  const handleConnect = async (): Promise<void> => {
    if (state.connected) {
      await relayBuzzerService.disconnect()
    } else {
      await relayBuzzerService.connect()
    }
  }

  const handleTestBuzzer = (): void => {
    relayBuzzerService.testBuzzer()
  }

  const updateConfig = (updates: Partial<typeof state.config>): void => {
    relayBuzzerService.saveConfig(updates)
  }

  return (
    <section className="relay-settings">
      <div className="relay-settings__header">
        <h3 className="relay-settings__title">⚡ Physical Buzzer Relay (Dual Mode Active)</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span className={`relay-badge ${state.connected ? 'relay-badge--connected' : 'relay-badge--disconnected'}`}>
            <span className="relay-dot" />
            {state.connected ? `Direct USB: Connected (${state.portInfo})` : 'Direct USB: Disconnected'}
          </span>
          <span className={`relay-badge ${state.bridgeConnected ? 'relay-badge--connected' : 'relay-badge--disconnected'}`} style={{ borderStyle: 'dashed' }}>
            <span className="relay-dot" />
            {state.bridgeConnected ? `Vercel Bridge: Synced (${state.bridgeClientsCount} browser)` : 'Vercel Bridge: Standby'}
          </span>
        </div>
      </div>

      <p className="relay-settings__hint">
        The physical buzzer / siren automatically triggers via USB Relay when game clock expires (00:00) or on shot clock violation.
      </p>

      {/* ── Vercel Cloud Console Card ── */}
      <div className="relay-vercel-card">
        <div className="relay-vercel-card__top">
          <div className="relay-vercel-card__info">
            <div className="relay-vercel-card__title-row">
              <span className="relay-vercel-triangle">▲</span>
              <span className="relay-vercel-title">Vercel Cloud Console</span>
              <span className="relay-vercel-badge">@florendojohnlloyd</span>
              <span className={`relay-badge ${state.bridgeConnected ? 'relay-badge--connected' : 'relay-badge--disconnected'}`}>
                <span className="relay-dot" />
                {state.bridgeConnected ? 'Bridge Synced' : 'Ready'}
              </span>
            </div>

            <div className="relay-server-card__url-row">
              <span className="relay-server-card__label">Vercel Website:</span>
              <a
                href={VERCEL_CONSOLE_URL}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  void handleOpenVercelConsole()
                }}
                className="relay-vercel-link"
                title="Click to open in browser"
              >
                <code>{VERCEL_CONSOLE_URL}</code>
                <span className="relay-link-icon">↗</span>
              </a>

              <button
                type="button"
                className="relay-mini-btn"
                onClick={handleCopyVercelUrl}
                title="Copy Vercel link to clipboard"
              >
                {vercelCopied ? '✓ Copied' : '📋 Copy Link'}
              </button>
            </div>
          </div>

          <div className="relay-server-card__actions">
            <button
              type="button"
              className="relay-btn relay-btn--vercel"
              onClick={handleOpenVercelConsole}
              title="Open Vercel Web Console in browser (Chrome/Edge)"
            >
              ▲ Open Vercel Web Console
            </button>
          </div>
        </div>

        <p className="relay-vercel-card__note">
          ✨ <strong>Dual Mode Active:</strong> You can connect the USB Relay to the Vercel website in Chrome, OR connect directly to this app. When connected to the Vercel console, <strong>the Scoreboard will automatically sound the siren on the website</strong> whenever time hits 00:00!
        </p>
      </div>

      {state.error && (
        <div className="relay-error-msg">
          <div className="relay-error-text">⚠️ {state.error}</div>
          <div className="relay-error-actions">
            <button
              type="button"
              className="relay-btn relay-btn--compact relay-btn--connect"
              onClick={handleConnect}
            >
              🔄 Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Port Advisory for Dual Mode */}
      <div className="relay-advisory-box">
        <span className="relay-advisory-box__icon">💡</span>
        <div>
          <strong>Dual Mode Guidance:</strong>
          <br />• <strong>Method 1 (Vercel Website):</strong> Connect the USB Relay on the Vercel website in Chrome. When a game runs in Scoreboard, it auto-buzzes on the website!
          <br />• <strong>Method 2 (Direct USB):</strong> Click <em>&quot;🔌 Connect Direct USB Relay&quot;</em> below to control it directly without a browser.
        </div>
      </div>

      {/* Connect & Test Action Row */}
      <div className="relay-settings__row relay-settings__row--actions">
        <button
          type="button"
          className={`relay-btn ${state.connected ? 'relay-btn--disconnect' : 'relay-btn--connect'}`}
          onClick={handleConnect}
          disabled={state.connecting}
        >
          {state.connecting ? 'Connecting...' : state.connected ? '🔌 Disconnect Direct USB' : '🔌 Connect Direct USB Relay'}
        </button>

        <button
          type="button"
          className={`relay-btn relay-btn--test ${state.isBuzzing ? 'relay-btn--buzzing' : ''}`}
          onClick={handleTestBuzzer}
          disabled={(!state.connected && !state.bridgeConnected) || state.isBuzzing}
          title={state.connected || state.bridgeConnected ? 'Click to test physical buzzer sound' : 'Connect via USB or open and connect the Vercel console'}
        >
          {state.isBuzzing ? '🔊 Buzzing...' : '⚡ Test Physical Buzzer Relay'}
        </button>
      </div>

      {/* Duration Sliders Deck (NBA Standards) */}
      <div className="relay-timing-grid">
        <div className="relay-slider-card">
          <div className="relay-slider-header">
            <span className="relay-slider-title">🏀 Game Clock End Buzzer (00:00)</span>
            <span className="relay-slider-badge">
              {(state.config.periodEndDurationSeconds ?? state.config.durationSeconds).toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="10.0"
            step="0.1"
            className="relay-range"
            value={state.config.periodEndDurationSeconds ?? state.config.durationSeconds}
            onChange={(e) => updateConfig({ periodEndDurationSeconds: parseFloat(e.target.value) })}
          />
          <div className="relay-range-labels">
            <span>0.5s (Short)</span>
            <span>3.0s (NBA Standard)</span>
            <span>10.0s</span>
          </div>
        </div>

        <div className="relay-slider-card">
          <div className="relay-slider-header">
            <span className="relay-slider-title">⏱️ Shot Clock Violation Buzzer (24s/14s)</span>
            <span className="relay-slider-badge">
              {(state.config.shotClockDurationSeconds ?? state.config.durationSeconds * 0.5).toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="10.0"
            step="0.1"
            className="relay-range"
            value={state.config.shotClockDurationSeconds ?? state.config.durationSeconds * 0.5}
            onChange={(e) => updateConfig({ shotClockDurationSeconds: parseFloat(e.target.value) })}
          />
          <div className="relay-range-labels">
            <span>0.5s (Short)</span>
            <span>1.5s (NBA Standard)</span>
            <span>10.0s</span>
          </div>
        </div>
      </div>

      {/* Hardware & Wiring Configuration */}
      <div className="relay-config-grid">
        <div className="relay-config-card">
          <label className="relay-settings__label">Physical Buzzer Status</label>
          <button
            type="button"
            className={`relay-toggle ${state.config.enabled ? 'relay-toggle--on' : ''}`}
            onClick={() => updateConfig({ enabled: !state.config.enabled })}
          >
            {state.config.enabled ? 'RELAY ENABLED (ON)' : 'RELAY DISABLED (OFF)'}
          </button>
        </div>

        <div className="relay-config-card">
          <label className="relay-settings__label">Wiring Mode (Terminal Connection)</label>
          <select
            className="relay-select"
            value={state.config.wiringMode}
            onChange={(e) => updateConfig({ wiringMode: e.target.value as 'NO' | 'NC' })}
          >
            <option value="NC">Normally Closed (NC) — Inverted (Recommended)</option>
            <option value="NO">Normally Open (NO) — Standard</option>
          </select>
        </div>
      </div>

      {/* Trigger Checkboxes Card */}
      <div className="relay-triggers-card">
        <label className="relay-settings__label">Buzzer Automation Events</label>
        <div className="relay-triggers-list">
          <label className="relay-check-item">
            <input
              type="checkbox"
              checked={state.config.triggerOnPeriodEnd}
              onChange={(e) => updateConfig({ triggerOnPeriodEnd: e.target.checked })}
            />
            <span>🏀 <strong>Game Clock Period End (00:00)</strong> — Automatic buzzer when the quarter / period ends</span>
          </label>

          <label className="relay-check-item">
            <input
              type="checkbox"
              checked={state.config.triggerOnShotClock}
              onChange={(e) => updateConfig({ triggerOnShotClock: e.target.checked })}
            />
            <span>⏱️ <strong>Shot Clock Violation (00s)</strong> — Automatic horn when 24s or 14s expires</span>
          </label>

          <label className="relay-check-item">
            <input
              type="checkbox"
              checked={state.config.triggerOnManual}
              onChange={(e) => updateConfig({ triggerOnManual: e.target.checked })}
            />
            <span>📢 <strong>Manual Horn Button</strong> — When clicking the horn button on the control panel</span>
          </label>
        </div>
      </div>

      {/* Diagnostics Section */}
      {state.stats && state.eventHistory && (
        <div className="relay-settings__group" style={{ marginTop: '16px', borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
          <label className="relay-settings__label">📊 Diagnostics & Event History</label>
          
          {/* Statistics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '0.75rem', color: '#888' }}>Period End Triggers</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ffd21c' }}>{state.stats.totalPeriodEnd}</div>
            </div>
            <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '0.75rem', color: '#888' }}>Shot Clock Triggers</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ffd21c' }}>{state.stats.totalShotClock}</div>
            </div>
            <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '0.75rem', color: '#888' }}>Manual Triggers</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ffd21c' }}>{state.stats.totalManual}</div>
            </div>
            {state.connectionUptime && state.connected && (
              <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>Connection Uptime</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#0f0' }}>{Math.floor(state.connectionUptime / 1000 / 60)}m</div>
              </div>
            )}
          </div>

          {/* Last Trigger */}
          {state.stats.lastTrigger && (
            <div style={{ padding: '10px', background: 'rgba(255,210,28,0.1)', borderRadius: '6px', border: '1px solid rgba(255,210,28,0.3)', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>Last Trigger</div>
              <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
                <strong>{state.stats.lastTrigger.source.replace('_', ' ')}</strong> • {state.stats.lastTrigger.duration.toFixed(1)}s • {new Date(state.stats.lastTrigger.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}

          {/* Event History */}
          <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px', color: '#ffd21c' }}>Recent Events (Last 10)</div>
            {state.eventHistory.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#888', textAlign: 'center', padding: '20px' }}>No events yet</div>
            ) : (
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '4px', color: '#888' }}>Time</th>
                    <th style={{ textAlign: 'left', padding: '4px', color: '#888' }}>Source</th>
                    <th style={{ textAlign: 'right', padding: '4px', color: '#888' }}>Duration</th>
                    <th style={{ textAlign: 'center', padding: '4px', color: '#888' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.eventHistory.map((event, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '6px 4px', color: '#bbb' }}>{new Date(event.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: '6px 4px', color: '#ffd21c', fontWeight: 'bold' }}>{event.source.replace('_', ' ')}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#0ff' }}>{event.duration.toFixed(1)}s</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>{event.success ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Test Connection Button */}
          <button
            type="button"
            className="relay-btn relay-btn--test"
            style={{ marginTop: '12px', width: '100%' }}
            onClick={async () => {
              const result = await relayBuzzerService.testConnection()
              alert(result ? 'Connection test successful! ✅' : 'Connection test failed. Check if USB Relay is plugged in. ❌')
            }}
            disabled={!state.connected}
          >
            🔍 Test Connection (Quick Relay Cycle)
          </button>
        </div>
      )}
    </section>
  )
}
