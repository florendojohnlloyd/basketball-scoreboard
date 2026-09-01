// @vitest-environment jsdom
/**
 * Example-based tests for CloudSyncPanel (Requirement 32 — Task 69).
 *
 * Tests covered:
 *  - An http:// (non-TLS) endpoint is rejected at save time and no
 *    CLOUD_SYNC_SET_CONFIG query is sent (Req 32.8).
 *  - A successful test connection shows a green success indicator (Req 32.3).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCOREBOARD_QUERY } from '@shared/types'

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

import CloudSyncPanel, { isHttpsUrl } from '../components/CloudSyncPanel'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CloudSyncPanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    mockRemoveListener.mockReset()
    // Default: CLOUD_SYNC_GET_CONFIG (fired on mount) resolves with empty config.
    mockInvoke.mockResolvedValue({ enabled: false, endpointUrl: '', hasApiKey: false })
  })

  it('isHttpsUrl accepts https and rejects http / bare hosts', () => {
    expect(isHttpsUrl('https://sync.example.com')).toBe(true)
    expect(isHttpsUrl('HTTPS://SYNC.EXAMPLE.COM')).toBe(true)
    expect(isHttpsUrl('http://insecure.example.com')).toBe(false)
    expect(isHttpsUrl('sync.example.com')).toBe(false)
    expect(isHttpsUrl('')).toBe(false)
  })

  it('rejects an http:// endpoint at save time without sending SET_CONFIG (Req 32.8)', async () => {
    render(<CloudSyncPanel />)

    // Wait for the mount-time GET_CONFIG to settle.
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'CLOUD_SYNC_GET_CONFIG' }),
    )
    mockInvoke.mockClear()

    // Enter an insecure endpoint and attempt to save.
    const endpoint = screen.getByLabelText(/endpoint url/i)
    fireEvent.change(endpoint, { target: { value: 'http://insecure.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    // Error is surfaced and no SET_CONFIG query was dispatched.
    expect(await screen.findByText(/insecure http:\/\/ endpoints are not allowed/i)).toBeTruthy()
    const setConfigCalls = mockInvoke.mock.calls.filter(
      (c) => (c[1] as { type?: string })?.type === 'CLOUD_SYNC_SET_CONFIG',
    )
    expect(setConfigCalls).toHaveLength(0)
  })

  it('shows a green success indicator when the test connection succeeds (Req 32.3)', async () => {
    render(<CloudSyncPanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'CLOUD_SYNC_GET_CONFIG' }),
    )

    // Next invoke (the test-connection call) resolves ok.
    mockInvoke.mockResolvedValueOnce({ ok: true })

    const endpoint = screen.getByLabelText(/endpoint url/i)
    fireEvent.change(endpoint, { target: { value: 'https://sync.example.com/api' } })
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    const result = await screen.findByTestId('test-result')
    expect(result.className).toContain('cloud-sync-panel__notice--success')
    expect(result.textContent).toMatch(/connection successful/i)

    expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'CLOUD_SYNC_TEST_CONNECTION' })
  })

  it('shows a red failure indicator with the error description when the test connection fails', async () => {
    render(<CloudSyncPanel />)

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'CLOUD_SYNC_GET_CONFIG' }),
    )

    mockInvoke.mockResolvedValueOnce({ ok: false, error: 'Endpoint returned HTTP 500' })

    const endpoint = screen.getByLabelText(/endpoint url/i)
    fireEvent.change(endpoint, { target: { value: 'https://sync.example.com/api' } })
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    const result = await screen.findByTestId('test-result')
    expect(result.className).toContain('cloud-sync-panel__notice--error')
    expect(result.textContent).toMatch(/HTTP 500/i)
  })
})
