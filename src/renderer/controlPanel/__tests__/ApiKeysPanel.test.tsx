// @vitest-environment jsdom
/**
 * Example-based tests for ApiKeysPanel (Requirement 34 — Task 74).
 *
 * Covered:
 *  - isValidApiPort helper (range 1024–65535).
 *  - Creating a key surfaces the raw key once with a copy affordance (Req 34.4).
 *  - Revoke prompts for confirmation and sends API_KEY_REVOKE (Req 34.5).
 *  - A port conflict on start shows a persistent error (Req 34.1).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SCOREBOARD_QUERY } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock window.electron.ipcRenderer (before component import)
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockClipboardWrite = vi.fn().mockResolvedValue(undefined)

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

Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: { writeText: mockClipboardWrite },
  writable: true,
  configurable: true,
})

import ApiKeysPanel, { isValidApiPort } from '../components/ApiKeysPanel'

// Default responses for the mount-time queries (API_GET_STATUS + API_KEY_LIST).
function defaultInvoke(): void {
  mockInvoke.mockImplementation(async (_channel: string, query: { type: string }) => {
    switch (query.type) {
      case 'API_GET_STATUS':
        return { running: false, port: 3000, enabled: false, portConflict: false }
      case 'API_KEY_LIST':
        return { success: true, keys: [] }
      default:
        return { success: true }
    }
  })
}

describe('ApiKeysPanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockReset()
    mockClipboardWrite.mockClear()
    vi.restoreAllMocks()
    defaultInvoke()
  })

  it('isValidApiPort enforces the 1024–65535 range', () => {
    expect(isValidApiPort(3000)).toBe(true)
    expect(isValidApiPort(1024)).toBe(true)
    expect(isValidApiPort(65535)).toBe(true)
    expect(isValidApiPort(80)).toBe(false)
    expect(isValidApiPort(70000)).toBe(false)
    expect(isValidApiPort(3000.5)).toBe(false)
  })

  it('shows the raw key once after creation with a copy affordance (Req 34.4)', async () => {
    render(<ApiKeysPanel />)
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'API_KEY_LIST' }),
    )

    // Arrange the create response.
    mockInvoke.mockImplementation(async (_channel: string, query: { type: string }) => {
      if (query.type === 'API_KEY_CREATE') {
        return { success: true, key: { id: '1', label: 'Test', keyHash: 'h', createdAt: new Date().toISOString(), active: true }, rawKey: 'SECRET-RAW-KEY-123' }
      }
      if (query.type === 'API_KEY_LIST') {
        return { success: true, keys: [{ id: '1', label: 'Test', keyHash: 'h', createdAt: new Date().toISOString(), active: true }] }
      }
      return { success: true }
    })

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('＋ Create Key'))

    const reveal = await screen.findByTestId('raw-key-value')
    expect(reveal.textContent).toBe('SECRET-RAW-KEY-123')

    // Copy affordance writes to the clipboard.
    fireEvent.click(screen.getByText('📋 Copy'))
    await waitFor(() => expect(mockClipboardWrite).toHaveBeenCalledWith('SECRET-RAW-KEY-123'))
  })

  it('revokes a key after confirmation (Req 34.5)', async () => {
    mockInvoke.mockImplementation(async (_channel: string, query: { type: string }) => {
      if (query.type === 'API_GET_STATUS') return { running: false, port: 3000, enabled: false, portConflict: false }
      if (query.type === 'API_KEY_LIST') {
        return { success: true, keys: [{ id: 'k1', label: 'MyKey', keyHash: 'h', createdAt: new Date().toISOString(), active: true }] }
      }
      if (query.type === 'API_KEY_REVOKE') return { success: true, keys: [{ id: 'k1', label: 'MyKey', keyHash: 'h', createdAt: new Date().toISOString(), active: false }] }
      return { success: true }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ApiKeysPanel />)
    await screen.findByText('MyKey')

    fireEvent.click(screen.getByText('Revoke'))

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'API_KEY_REVOKE', id: 'k1' }),
    )
    await screen.findByText('Revoked')
  })

  it('does not revoke when confirmation is cancelled', async () => {
    mockInvoke.mockImplementation(async (_channel: string, query: { type: string }) => {
      if (query.type === 'API_GET_STATUS') return { running: false, port: 3000, enabled: false, portConflict: false }
      if (query.type === 'API_KEY_LIST') {
        return { success: true, keys: [{ id: 'k1', label: 'MyKey', keyHash: 'h', createdAt: new Date().toISOString(), active: true }] }
      }
      return { success: true }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<ApiKeysPanel />)
    await screen.findByText('MyKey')

    fireEvent.click(screen.getByText('Revoke'))

    // No revoke query should have been sent.
    expect(mockInvoke).not.toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'API_KEY_REVOKE', id: 'k1' })
  })

  it('shows a persistent error when starting the server hits a port conflict (Req 34.1)', async () => {
    render(<ApiKeysPanel />)
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'API_GET_STATUS' }),
    )

    mockInvoke.mockImplementation(async (_channel: string, query: { type: string }) => {
      if (query.type === 'API_START') {
        return {
          success: false,
          error: 'API_PORT_CONFLICT: Port 3000 is already in use.',
          status: { running: false, port: 3000, enabled: true, portConflict: true },
        }
      }
      return { success: true }
    })

    fireEvent.click(screen.getByText('▶ Enable API'))

    const err = await screen.findByTestId('api-error')
    expect(err.textContent).toMatch(/already in use/i)
  })
})
