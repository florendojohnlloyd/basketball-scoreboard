// @vitest-environment jsdom
/**
 * Example-based tests for MobileViewerPanel (Requirement 36 — Task 78).
 *
 * Tests covered:
 *  - isValidViewerPort accepts the allowed range and rejects out-of-range /
 *    non-integer ports (Req 36.1).
 *  - An out-of-range port is rejected client-side and no MOBILE_VIEWER_START
 *    query is dispatched (Req 36.1).
 *  - A successful start renders the local URL and QR code (Req 36.8).
 *  - A MOBILE_VIEWER_PORT_CONFLICT event surfaces a conflict banner (Req 36.7/36.8).
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

import MobileViewerPanel, { isValidViewerPort } from '../components/MobileViewerPanel'

const STOPPED_STATUS = { running: false, port: 0, localUrl: null, qrCodeDataUri: null }

/** Return the event handler registered via ipcRenderer.on(SCOREBOARD_EVENT, ...). */
function getEventHandler(): (raw: unknown) => void {
  const call = mockOn.mock.calls.find((c) => c[0] === SCOREBOARD_EVENT)
  return call?.[1] as (raw: unknown) => void
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileViewerPanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    mockRemoveListener.mockReset()
    // Default: MOBILE_VIEWER_GET_STATUS (fired on mount) resolves stopped.
    mockInvoke.mockResolvedValue(STOPPED_STATUS)
  })

  it('isValidViewerPort accepts the allowed range and rejects out-of-range / non-integers', () => {
    expect(isValidViewerPort(8081)).toBe(true)
    expect(isValidViewerPort(1024)).toBe(true)
    expect(isValidViewerPort(65535)).toBe(true)
    expect(isValidViewerPort(1023)).toBe(false)
    expect(isValidViewerPort(65536)).toBe(false)
    expect(isValidViewerPort(8081.5)).toBe(false)
    expect(isValidViewerPort(NaN)).toBe(false)
  })

  it('rejects an out-of-range port client-side without dispatching MOBILE_VIEWER_START (Req 36.1)', async () => {
    render(<MobileViewerPanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'MOBILE_VIEWER_GET_STATUS' }),
    )
    mockInvoke.mockClear()

    const portField = screen.getByLabelText(/^port$/i)
    fireEvent.change(portField, { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: /start server/i }))

    expect(await screen.findByText(/must be a whole number between 1024 and 65535/i)).toBeTruthy()
    const startCalls = mockInvoke.mock.calls.filter(
      (c) => (c[1] as { type?: string })?.type === 'MOBILE_VIEWER_START',
    )
    expect(startCalls).toHaveLength(0)
  })

  it('renders the local URL and QR code after a successful start (Req 36.8)', async () => {
    render(<MobileViewerPanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'MOBILE_VIEWER_GET_STATUS' }),
    )

    const runningStatus = {
      running: true,
      port: 8081,
      localUrl: 'http://192.168.1.42:8081',
      qrCodeDataUri: 'data:image/png;base64,AAAABBBB',
    }
    // The start invoke resolves success with the running status.
    mockInvoke.mockResolvedValueOnce({ success: true, status: runningStatus })

    fireEvent.click(screen.getByRole('button', { name: /start server/i }))

    const url = await screen.findByTestId('viewer-url')
    expect(url.textContent).toBe('http://192.168.1.42:8081')

    const qr = screen.getByTestId('viewer-qr') as HTMLImageElement
    expect(qr.getAttribute('src')).toBe('data:image/png;base64,AAAABBBB')

    expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'MOBILE_VIEWER_START', port: 8081 })
  })

  it('surfaces a port-conflict banner on MOBILE_VIEWER_PORT_CONFLICT (Req 36.7)', async () => {
    render(<MobileViewerPanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'MOBILE_VIEWER_GET_STATUS' }),
    )

    const handler = getEventHandler()
    expect(handler).toBeTypeOf('function')

    // Simulate the main process reporting a port conflict.
    act(() => {
      handler({ type: 'MOBILE_VIEWER_PORT_CONFLICT', port: 8081 })
    })

    expect(await screen.findByText(/port 8081 is already in use/i)).toBeTruthy()
  })
})
