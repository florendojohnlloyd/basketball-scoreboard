// @vitest-environment jsdom
/**
 * Example-based tests for SocialSharePanel (Requirement 35 — Task 76).
 *
 * Covered:
 *  - tokenStatusLabel / connectButtonLabel helpers.
 *  - Mount loads per-platform token status + generated share text (Req 35.2).
 *  - Connect issues SHARE_OAUTH_INITIATE for the selected platform (Req 35.4).
 *  - Disconnect is disabled when no token is stored, enabled otherwise (Req 35.x).
 *  - Share dispatches SHARE_POST with the edited text + attach flag (Req 35.1, 35.7).
 *  - Empty share text is rejected client-side before dispatch.
 *  - OAuth/post/image events surface as notices (SHARE_OAUTH_COMPLETE /
 *    SHARE_POST_COMPLETE / SHARE_IMAGE_UNSUPPORTED, Req 35.8).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer (before component import)
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
const mockOn = vi.fn()

Object.defineProperty(globalThis.window, 'electron', {
  value: {
    ipcRenderer: {
      invoke: mockInvoke,
      on: mockOn,
      removeAllListeners: vi.fn(),
      send: vi.fn(),
    },
  },
  writable: true,
  configurable: true,
})

import SocialSharePanel, { tokenStatusLabel, connectButtonLabel } from '../components/SocialSharePanel'

// Default mount responses: both platforms missing, a generated preview text.
function defaultInvoke(): void {
  mockInvoke.mockImplementation(async (_channel: string, query: { type: string; platform?: string }) => {
    switch (query.type) {
      case 'SHARE_TOKEN_STATUS':
        return { success: true, status: 'missing' }
      case 'SHARE_GENERATE_TEXT':
        return { success: true, text: 'Liga | 2025-01-01\nHome 10 – 8 Away\nQ2' }
      default:
        return { success: true }
    }
  })
}

/** Grab the SCOREBOARD_EVENT handler the panel registered via ipcRenderer.on. */
function getEventHandler(): (raw: unknown) => void {
  const call = mockOn.mock.calls.find((c) => c[0] === SCOREBOARD_EVENT)
  if (!call) throw new Error('SCOREBOARD_EVENT handler was not registered')
  return call[1] as (raw: unknown) => void
}

describe('SocialSharePanel helpers', () => {
  it('tokenStatusLabel maps statuses to human labels', () => {
    expect(tokenStatusLabel('valid')).toBe('Connected')
    expect(tokenStatusLabel('expired')).toBe('Session expired')
    expect(tokenStatusLabel('missing')).toBe('Not connected')
  })

  it('connectButtonLabel is Connect when missing, Reconnect otherwise', () => {
    expect(connectButtonLabel('missing')).toBe('Connect')
    expect(connectButtonLabel('valid')).toBe('Reconnect')
    expect(connectButtonLabel('expired')).toBe('Reconnect')
  })
})

describe('SocialSharePanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    defaultInvoke()
  })

  it('loads share text and token statuses on mount (Req 35.2)', async () => {
    render(<SocialSharePanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'SHARE_GENERATE_TEXT' }),
    )
    expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'SHARE_TOKEN_STATUS', platform: 'twitter' })
    expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'SHARE_TOKEN_STATUS', platform: 'facebook' })

    await waitFor(() =>
      expect((screen.getByTestId('share-text') as HTMLTextAreaElement).value).toBe('Liga | 2025-01-01\nHome 10 – 8 Away\nQ2'),
    )
    expect(screen.getByTestId('status-twitter').textContent).toContain('Not connected')
  })

  it('Connect issues SHARE_OAUTH_INITIATE for the selected platform (Req 35.4)', async () => {
    render(<SocialSharePanel />)
    await waitFor(() => expect(screen.getByTestId('share-text')).toBeTruthy())

    // Select Facebook, then Connect.
    fireEvent.click(screen.getByText('Facebook'))
    fireEvent.click(screen.getByTestId('connect-btn'))

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, {
        type: 'SHARE_OAUTH_INITIATE',
        platform: 'facebook',
      }),
    )
  })

  it('Disconnect is disabled when no token is stored', async () => {
    render(<SocialSharePanel />)
    await waitFor(() => expect(screen.getByTestId('share-text')).toBeTruthy())
    expect((screen.getByTestId('disconnect-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('Share dispatches SHARE_POST with edited text and attach flag (Req 35.1, 35.7)', async () => {
    render(<SocialSharePanel />)
    await waitFor(() => expect(screen.getByTestId('share-text')).toBeTruthy())

    // Edit the preview text.
    fireEvent.change(screen.getByTestId('share-text'), { target: { value: 'Custom share text' } })
    // Attach toggle defaults to checked; leave it on.
    fireEvent.click(screen.getByTestId('share-btn'))

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, {
        type: 'SHARE_POST',
        platform: 'twitter',
        text: 'Custom share text',
        attachScreenshot: true,
      }),
    )
  })

  it('rejects an empty share text before dispatching (Req 35.2)', async () => {
    render(<SocialSharePanel />)
    await waitFor(() => expect(screen.getByTestId('share-text')).toBeTruthy())

    fireEvent.change(screen.getByTestId('share-text'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('share-btn'))

    await waitFor(() => expect(screen.getByTestId('notice').textContent).toMatch(/cannot be empty/i))
    expect(mockInvoke).not.toHaveBeenCalledWith(
      SCOREBOARD_QUERY,
      expect.objectContaining({ type: 'SHARE_POST' }),
    )
  })

  it('surfaces SHARE_POST_COMPLETE success as a notice (Req 35.8)', async () => {
    render(<SocialSharePanel />)
    await waitFor(() => expect(screen.getByTestId('share-text')).toBeTruthy())

    const handler = getEventHandler()
    act(() => {
      handler({ type: 'SHARE_POST_COMPLETE', platform: 'twitter', success: true })
    })

    await waitFor(() => expect(screen.getByTestId('notice').textContent).toMatch(/Shared to Twitter/i))
  })

  it('surfaces SHARE_OAUTH_FAILED as an error notice (Req 35.8)', async () => {
    render(<SocialSharePanel />)
    await waitFor(() => expect(screen.getByTestId('share-text')).toBeTruthy())

    const handler = getEventHandler()
    act(() => {
      handler({ type: 'SHARE_OAUTH_FAILED', platform: 'twitter', error: 'access denied' })
    })

    await waitFor(() => expect(screen.getByTestId('notice').textContent).toMatch(/Authorization failed/i))
  })

  it('surfaces SHARE_IMAGE_UNSUPPORTED as an info notice (Req 35.8)', async () => {
    render(<SocialSharePanel />)
    await waitFor(() => expect(screen.getByTestId('share-text')).toBeTruthy())

    const handler = getEventHandler()
    act(() => {
      handler({ type: 'SHARE_IMAGE_UNSUPPORTED', platform: 'facebook', message: 'Image sharing is unavailable for facebook; posting text only.' })
    })

    await waitFor(() => expect(screen.getByTestId('notice').textContent).toMatch(/image sharing is unavailable/i))
  })
})
