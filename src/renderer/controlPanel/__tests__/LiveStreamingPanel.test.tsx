// @vitest-environment jsdom
/**
 * Example + helper tests for LiveStreamingPanel (Requirement 33 — Task 72).
 *
 * Covered:
 *  - isValidOverlayPort accepts the allowed range and rejects out-of-range /
 *    non-integer ports (Req 33.1).
 *  - isValidRtmpUrl only accepts rtmp:// / rtmps:// (Req 33.4).
 *  - formatElapsed renders M:SS and H:MM:SS.
 *  - An out-of-range overlay port is rejected client-side without dispatching
 *    OVERLAY_START (Req 33.1).
 *  - An invalid RTMP URL is rejected client-side without dispatching RTMP_START
 *    (Req 33.4).
 *  - An OVERLAY_PORT_CONFLICT event surfaces a conflict banner (Req 33.7).
 *  - An RTMP_STATUS_UPDATE (active) renders the "Streaming" badge with elapsed
 *    duration (Req 33.5); RTMP_RECONNECT_ATTEMPT shows a reconnect warning and
 *    RTMP_FAILED shows the persistent "Stream Failed" alert (Req 33.6).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer (module level, before component import)
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()

Object.defineProperty(globalThis.window, 'electron', {
  value: {
    ipcRenderer: {
      invoke: mockInvoke,
      on: mockOn,
      removeListener: mockRemoveListener,
      send: vi.fn(),
    },
  },
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// Import component after mocks are wired
// ---------------------------------------------------------------------------

import LiveStreamingPanel, {
  isValidOverlayPort,
  isValidRtmpUrl,
  formatElapsed,
} from '../components/LiveStreamingPanel'

const DEFAULT_CONFIG_RESULT = {
  config: { visibleElements: ['score', 'clock'], fontScaleFactor: 1.0, backgroundAlpha: 0.0 },
  running: false,
  port: 0,
}
const STOPPED_RTMP = { active: false, elapsedSeconds: 0, error: null }

/** Return the event handler registered via ipcRenderer.on(SCOREBOARD_EVENT, ...). */
function getEventHandler(): (raw: unknown) => void {
  const call = mockOn.mock.calls.find((c) => c[0] === SCOREBOARD_EVENT)
  return call?.[1] as (raw: unknown) => void
}

/** Default mount behaviour: OVERLAY_GET_CONFIG + RTMP_GET_STATUS resolve. */
function primeMountInvokes(): void {
  mockInvoke.mockImplementation((_channel: string, msg: { type: string }) => {
    if (msg.type === 'OVERLAY_GET_CONFIG') return Promise.resolve(DEFAULT_CONFIG_RESULT)
    if (msg.type === 'RTMP_GET_STATUS') return Promise.resolve(STOPPED_RTMP)
    return Promise.resolve({ success: true })
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiveStreamingPanel helpers', () => {
  it('isValidOverlayPort accepts the allowed range, rejects out-of-range / non-integers', () => {
    expect(isValidOverlayPort(8080)).toBe(true)
    expect(isValidOverlayPort(1024)).toBe(true)
    expect(isValidOverlayPort(65535)).toBe(true)
    expect(isValidOverlayPort(1023)).toBe(false)
    expect(isValidOverlayPort(65536)).toBe(false)
    expect(isValidOverlayPort(8080.5)).toBe(false)
    expect(isValidOverlayPort(NaN)).toBe(false)
  })

  it('isValidRtmpUrl only accepts rtmp:// and rtmps://', () => {
    expect(isValidRtmpUrl('rtmp://live.example.com/app')).toBe(true)
    expect(isValidRtmpUrl('rtmps://live.example.com/app')).toBe(true)
    expect(isValidRtmpUrl('  rtmp://trimmed.example.com  ')).toBe(true)
    expect(isValidRtmpUrl('http://live.example.com')).toBe(false)
    expect(isValidRtmpUrl('live.example.com')).toBe(false)
    expect(isValidRtmpUrl('')).toBe(false)
  })

  it('formatElapsed renders M:SS below one hour and H:MM:SS above', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(5)).toBe('0:05')
    expect(formatElapsed(65)).toBe('1:05')
    expect(formatElapsed(3661)).toBe('1:01:01')
  })
})

describe('LiveStreamingPanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    mockRemoveListener.mockReset()
    primeMountInvokes()
  })

  it('rejects an out-of-range overlay port client-side without dispatching OVERLAY_START (Req 33.1)', async () => {
    render(<LiveStreamingPanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'OVERLAY_GET_CONFIG' }),
    )
    mockInvoke.mockClear()

    const portField = screen.getByLabelText(/^port$/i)
    fireEvent.change(portField, { target: { value: '80' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /enable overlay server/i }))

    expect(await screen.findByText(/must be a whole number between 1024 and 65535/i)).toBeTruthy()
    const startCalls = mockInvoke.mock.calls.filter(
      (c) => (c[1] as { type?: string })?.type === 'OVERLAY_START',
    )
    expect(startCalls).toHaveLength(0)
  })

  it('rejects an invalid RTMP URL client-side without dispatching RTMP_START (Req 33.4)', async () => {
    render(<LiveStreamingPanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'RTMP_GET_STATUS' }),
    )
    mockInvoke.mockClear()

    fireEvent.change(screen.getByLabelText(/destination url/i), {
      target: { value: 'http://not-rtmp.example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start stream/i }))

    expect(await screen.findByText(/must start with rtmp:\/\/ or rtmps:\/\//i)).toBeTruthy()
    const startCalls = mockInvoke.mock.calls.filter(
      (c) => (c[1] as { type?: string })?.type === 'RTMP_START',
    )
    expect(startCalls).toHaveLength(0)
  })

  it('surfaces a port-conflict banner on OVERLAY_PORT_CONFLICT (Req 33.7)', async () => {
    render(<LiveStreamingPanel />)
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'OVERLAY_GET_CONFIG' }),
    )

    const handler = getEventHandler()
    expect(handler).toBeTypeOf('function')

    act(() => {
      handler({ type: 'OVERLAY_PORT_CONFLICT', port: 8080 })
    })

    expect(await screen.findByText(/port 8080 is already in use/i)).toBeTruthy()
  })

  it('shows the Streaming badge with elapsed duration on RTMP_STATUS_UPDATE (Req 33.5)', async () => {
    // Start with an active stream so the Stop button + badge render.
    mockInvoke.mockImplementation((_channel: string, msg: { type: string }) => {
      if (msg.type === 'OVERLAY_GET_CONFIG') return Promise.resolve(DEFAULT_CONFIG_RESULT)
      if (msg.type === 'RTMP_GET_STATUS')
        return Promise.resolve({ active: true, elapsedSeconds: 0, error: null })
      return Promise.resolve({ success: true })
    })

    render(<LiveStreamingPanel />)
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'RTMP_GET_STATUS' }),
    )

    const handler = getEventHandler()
    act(() => {
      handler({ type: 'RTMP_STATUS_UPDATE', status: { active: true, elapsedSeconds: 65, error: null } })
    })

    const badge = await screen.findByTestId('streaming-badge')
    expect(badge.textContent).toMatch(/streaming\s+1:05/i)
  })

  it('shows a reconnect warning then a persistent Stream Failed alert (Req 33.6)', async () => {
    render(<LiveStreamingPanel />)
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'RTMP_GET_STATUS' }),
    )

    const handler = getEventHandler()

    act(() => {
      handler({ type: 'RTMP_RECONNECT_ATTEMPT', attempt: 2, maxAttempts: 3 })
    })
    expect(await screen.findByTestId('reconnect-warning')).toBeTruthy()
    expect(screen.getByTestId('reconnect-warning').textContent).toMatch(/attempt 2 of 3/i)

    act(() => {
      handler({ type: 'RTMP_FAILED' })
    })
    expect(await screen.findByTestId('stream-failed')).toBeTruthy()
    // The transient reconnect warning is cleared once the stream fails.
    expect(screen.queryByTestId('reconnect-warning')).toBeNull()
  })
})
