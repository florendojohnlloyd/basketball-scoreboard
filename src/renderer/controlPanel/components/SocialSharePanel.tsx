/**
 * SocialSharePanel — Social Media Sharing UI (Task 76, Requirement 35)
 *
 * Available to Admin and Scorekeeper roles (SHARE capability). Provides:
 * - Per-platform (Twitter/X, Facebook) connection status (missing / valid / expired)
 *   with Connect / Reconnect / Disconnect affordances driven by OAuth (Req 35.3–35.6).
 * - An editable preview of the auto-generated share text from the current game
 *   state (Req 35.2), refreshable on demand.
 * - An optional "Attach scoreboard screenshot" toggle (Req 35.7).
 * - A "Share" button that dispatches the post to the selected platform (Req 35.1).
 * - Surfacing of OAuth/post events — SHARE_OAUTH_COMPLETE, SHARE_OAUTH_FAILED,
 *   SHARE_POST_COMPLETE, SHARE_IMAGE_UNSUPPORTED — as inline notices (Req 35.8).
 *
 * All heavy lifting (OAuth PKCE, token encryption, posting, screenshot capture,
 * audit logging) lives in the main-process SocialShareService; this panel only
 * issues IPC queries and reflects the results/events.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { SocialPlatform, SocialTokenStatus } from '@shared/types'
import './SocialSharePanel.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface PlatformMeta {
  id: SocialPlatform
  label: string
  icon: string
}

const PLATFORMS: PlatformMeta[] = [
  { id: 'twitter', label: 'Twitter / X', icon: '𝕏' },
  { id: 'facebook', label: 'Facebook', icon: 'f' },
]

type NoticeKind = 'success' | 'error' | 'info'

interface Notice {
  kind: NoticeKind
  text: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable connection status label for a token status. */
export function tokenStatusLabel(status: SocialTokenStatus): string {
  switch (status) {
    case 'valid':
      return 'Connected'
    case 'expired':
      return 'Session expired'
    case 'missing':
    default:
      return 'Not connected'
  }
}

/** The primary connect affordance label for a token status. */
export function connectButtonLabel(status: SocialTokenStatus): string {
  switch (status) {
    case 'valid':
      return 'Reconnect'
    case 'expired':
      return 'Reconnect'
    case 'missing':
    default:
      return 'Connect'
  }
}

// ---------------------------------------------------------------------------
// SocialSharePanel component
// ---------------------------------------------------------------------------

function SocialSharePanel(): React.ReactElement {
  // ── Selected platform + per-platform token status ──
  const [platform, setPlatform] = useState<SocialPlatform>('twitter')
  const [statuses, setStatuses] = useState<Record<SocialPlatform, SocialTokenStatus>>({
    twitter: 'missing',
    facebook: 'missing',
  })

  // ── Share text preview (editable) ──
  const [shareText, setShareText] = useState('')
  const [textLoading, setTextLoading] = useState(false)

  // ── Attach-screenshot toggle ──
  const [attachScreenshot, setAttachScreenshot] = useState(true)

  // ── In-flight indicators + notices ──
  const [connecting, setConnecting] = useState(false)
  const [posting, setPosting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  // Guards a stale event handler after unmount (the preload only exposes
  // removeAllListeners, which would clobber other components' listeners, so we
  // instead no-op once unmounted rather than detaching the shared listener).
  const mountedRef = useRef(true)

  const refreshStatus = useCallback(async (p: SocialPlatform): Promise<void> => {
    try {
      const res = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'SHARE_TOKEN_STATUS',
        platform: p,
      })) as { success?: boolean; status?: SocialTokenStatus } | undefined
      if (!mountedRef.current) return
      if (res && res.success && res.status) {
        setStatuses((prev) => ({ ...prev, [p]: res.status as SocialTokenStatus }))
      }
    } catch {
      // Leave the status untouched on failure.
    }
  }, [])

  const refreshShareText = useCallback(async (): Promise<void> => {
    setTextLoading(true)
    try {
      const res = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'SHARE_GENERATE_TEXT',
      })) as { success?: boolean; text?: string } | undefined
      if (!mountedRef.current) return
      if (res && res.success && typeof res.text === 'string') {
        setShareText(res.text)
      }
    } catch {
      // Keep whatever text is present.
    } finally {
      if (mountedRef.current) setTextLoading(false)
    }
  }, [])

  // ── Initial load: statuses for all platforms + share text preview ──
  useEffect(() => {
    mountedRef.current = true
    for (const p of PLATFORMS) void refreshStatus(p.id)
    void refreshShareText()
    return () => {
      mountedRef.current = false
    }
  }, [refreshStatus, refreshShareText])

  // ── Surface OAuth / post events (Req 35.8) ──
  const handleEvent = useCallback(
    (raw: unknown): void => {
      if (!mountedRef.current) return
      const event = raw as {
        type: string
        platform?: SocialPlatform
        error?: string
        success?: boolean
        message?: string
      }

      switch (event.type) {
        case 'SHARE_OAUTH_COMPLETE': {
          setConnecting(false)
          if (event.platform) void refreshStatus(event.platform)
          setNotice({ kind: 'success', text: `Connected to ${platformLabel(event.platform)}.` })
          break
        }
        case 'SHARE_OAUTH_FAILED': {
          setConnecting(false)
          setNotice({
            kind: 'error',
            text: `Authorization failed for ${platformLabel(event.platform)}: ${event.error ?? 'unknown error'}`,
          })
          if (event.platform) void refreshStatus(event.platform)
          break
        }
        case 'SHARE_POST_COMPLETE': {
          setPosting(false)
          if (event.success) {
            setNotice({ kind: 'success', text: `Shared to ${platformLabel(event.platform)}.` })
          } else {
            setNotice({
              kind: 'error',
              text: `Share to ${platformLabel(event.platform)} failed: ${event.error ?? 'unknown error'}`,
            })
          }
          if (event.platform) void refreshStatus(event.platform)
          break
        }
        case 'SHARE_IMAGE_UNSUPPORTED': {
          setNotice({
            kind: 'info',
            text: event.message ?? `Image sharing is unavailable for ${platformLabel(event.platform)}; posted text only.`,
          })
          break
        }
        default:
          break
      }
    },
    [refreshStatus],
  )

  useEffect(() => {
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)
    // No removeListener is exposed by the preload; the mountedRef guard above
    // makes the handler a no-op after unmount.
    return () => { /* handler self-guards via mountedRef */ }
  }, [handleEvent])

  // ── Handlers ──

  async function handleConnect(): Promise<void> {
    setNotice(null)
    setConnecting(true)
    try {
      const res = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'SHARE_OAUTH_INITIATE',
        platform,
      })) as { success?: boolean; error?: string } | undefined
      if (res && !res.success) {
        setConnecting(false)
        setNotice({ kind: 'error', text: res.error ?? 'Could not start authorization.' })
      } else {
        setNotice({
          kind: 'info',
          text: 'Your browser was opened to authorize access. Complete sign-in, then return here.',
        })
      }
    } catch (err) {
      setConnecting(false)
      setNotice({ kind: 'error', text: (err as Error).message ?? 'Could not start authorization.' })
    }
  }

  async function handleDisconnect(): Promise<void> {
    setNotice(null)
    try {
      await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'SHARE_TOKEN_REVOKE',
        platform,
      })
      await refreshStatus(platform)
      setNotice({ kind: 'info', text: `Disconnected from ${platformLabel(platform)}.` })
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message ?? 'Could not disconnect.' })
    }
  }

  async function handleShare(): Promise<void> {
    setNotice(null)

    if (!shareText.trim()) {
      setNotice({ kind: 'error', text: 'Share text cannot be empty.' })
      return
    }

    setPosting(true)
    try {
      const res = (await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'SHARE_POST',
        platform,
        text: shareText,
        attachScreenshot,
      })) as { success?: boolean; reauthRequired?: boolean; error?: string } | undefined

      // A SHARE_POST_COMPLETE event will normally arrive and drive the notice /
      // spinner. Handle the synchronous rejection path too (e.g. re-auth needed).
      if (res && !res.success) {
        setPosting(false)
        if (res.reauthRequired) {
          setNotice({
            kind: 'error',
            text: `${platformLabel(platform)} needs to be reconnected before sharing. Use Connect / Reconnect above.`,
          })
        } else {
          setNotice({ kind: 'error', text: res.error ?? 'Share failed.' })
        }
        void refreshStatus(platform)
      }
    } catch (err) {
      setPosting(false)
      setNotice({ kind: 'error', text: (err as Error).message ?? 'Share failed.' })
    }
  }

  const currentStatus = statuses[platform]

  return (
    <div className="social-share-panel">

      {/* ── Platform connections ── */}
      <fieldset className="social-share-panel__fieldset">
        <legend>Platforms</legend>

        <div className="social-share-panel__platforms" role="radiogroup" aria-label="Select a platform">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={platform === p.id}
              className={`social-share-panel__platform${platform === p.id ? ' social-share-panel__platform--active' : ''}`}
              onClick={() => setPlatform(p.id)}
            >
              <span className="social-share-panel__platform-icon" aria-hidden="true">{p.icon}</span>
              <span className="social-share-panel__platform-label">{p.label}</span>
              <span
                className={`social-share-panel__badge social-share-panel__badge--${statuses[p.id]}`}
                data-testid={`status-${p.id}`}
              >
                {tokenStatusLabel(statuses[p.id])}
              </span>
            </button>
          ))}
        </div>

        <div className="social-share-panel__row social-share-panel__row--actions">
          <button
            className="social-share-panel__btn social-share-panel__btn--primary"
            onClick={handleConnect}
            disabled={connecting}
            aria-busy={connecting}
            data-testid="connect-btn"
          >
            {connecting ? '⏳ Awaiting authorization…' : `🔗 ${connectButtonLabel(currentStatus)}`}
          </button>

          <button
            className="social-share-panel__btn social-share-panel__btn--secondary"
            onClick={handleDisconnect}
            disabled={currentStatus === 'missing'}
            data-testid="disconnect-btn"
          >
            ⨯ Disconnect
          </button>
        </div>
      </fieldset>

      {/* ── Share content ── */}
      <fieldset className="social-share-panel__fieldset">
        <legend>Post</legend>

        <div className="social-share-panel__row social-share-panel__row--column">
          <div className="social-share-panel__row social-share-panel__row--between">
            <label className="social-share-panel__label" htmlFor="social-share-text">Preview</label>
            <button
              className="social-share-panel__btn social-share-panel__btn--link"
              onClick={() => void refreshShareText()}
              disabled={textLoading}
              data-testid="refresh-text-btn"
            >
              {textLoading ? 'Refreshing…' : '↻ Regenerate from game'}
            </button>
          </div>
          <textarea
            id="social-share-text"
            className="social-share-panel__textarea"
            rows={4}
            value={shareText}
            placeholder="The share summary is generated from the current game state."
            onChange={(e) => setShareText(e.target.value)}
            data-testid="share-text"
          />
        </div>

        <div className="social-share-panel__row">
          <label className="social-share-panel__label" htmlFor="social-share-attach">
            <input
              id="social-share-attach"
              type="checkbox"
              checked={attachScreenshot}
              onChange={(e) => setAttachScreenshot(e.target.checked)}
              data-testid="attach-toggle"
            />
            {' '}Attach scoreboard screenshot
          </label>
        </div>

        <div className="social-share-panel__row social-share-panel__row--actions">
          <button
            className="social-share-panel__btn social-share-panel__btn--primary"
            onClick={handleShare}
            disabled={posting}
            aria-busy={posting}
            data-testid="share-btn"
          >
            {posting ? '⏳ Sharing…' : '📣 Share'}
          </button>
        </div>
      </fieldset>

      {/* ── Notice (OAuth / post events + local validation) ── */}
      {notice && (
        <div
          className={`social-share-panel__notice social-share-panel__notice--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
          data-testid="notice"
        >
          <span className="social-share-panel__notice-icon">
            {notice.kind === 'success' ? '✓' : notice.kind === 'error' ? '⚠' : 'ℹ'}
          </span>
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  )
}

/** Friendly label for a platform id (used in event notices). */
function platformLabel(id: SocialPlatform | undefined): string {
  const meta = PLATFORMS.find((p) => p.id === id)
  return meta ? meta.label : (id ?? 'platform')
}

export default SocialSharePanel
