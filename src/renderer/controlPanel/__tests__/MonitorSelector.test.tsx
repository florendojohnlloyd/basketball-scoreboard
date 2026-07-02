// @vitest-environment jsdom
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'

type Listener = (...args: unknown[]) => void
interface FakeIpc {
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  emit: (channel: string, payload: unknown) => void
}

function makeIpc(): FakeIpc {
  const listeners: Record<string, Listener[]> = {}
  const invoke = vi.fn()
  const on = vi.fn((ch: string, h: Listener) => { (listeners[ch] ??= []).push(h) })
  const removeAllListeners = vi.fn((ch: string) => { delete listeners[ch] })
  const emit = (ch: string, payload: unknown) => (listeners[ch] ?? []).forEach(h => h(payload))
  return { invoke, on, removeAllListeners, emit }
}

const SINGLE = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
const DUAL   = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }, { id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }]

describe('MonitorSelector', () => {
  let ipc: FakeIpc

  beforeEach(() => {
    ipc = makeIpc()
    Object.defineProperty(window, 'electron', { value: { ipcRenderer: ipc }, writable: true, configurable: true })
  })
  afterEach(() => vi.restoreAllMocks())

  async function mount() {
    const { default: MonitorSelector } = await import('../components/MonitorSelector')
    return render(<MonitorSelector />)
  }

  it('invokes GET_MONITORS on mount', async () => {
    ipc.invoke.mockResolvedValue(SINGLE)
    await mount()
    await waitFor(() => expect(ipc.invoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'GET_MONITORS' }))
  })

  it('disables dropdown and Assign when only one display', async () => {
    ipc.invoke.mockResolvedValue(SINGLE)
    await mount()
    await waitFor(() => {
      expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
      expect((screen.getByRole('button', { name: /assign/i }) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText(/a second display is required for the scoreboard/i)).toBeTruthy()
    })
  })

  it('enables dropdown and Assign with two displays', async () => {
    ipc.invoke.mockResolvedValue(DUAL)
    await mount()
    await waitFor(() => {
      expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false)
      expect((screen.getByRole('button', { name: /assign/i }) as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('invokes ASSIGN_DISPLAY with selected id on Assign click', async () => {
    ipc.invoke.mockResolvedValueOnce(DUAL).mockResolvedValueOnce({ success: true })
    await mount()
    await waitFor(() => screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('button', { name: /assign/i }))
    await waitFor(() => expect(ipc.invoke).toHaveBeenCalledWith(SCOREBOARD_QUERY, { type: 'ASSIGN_DISPLAY', displayId: DUAL[0].id }))
  })

  it('shows DISPLAY_DISCONNECTED alert on event', async () => {
    ipc.invoke.mockResolvedValue(SINGLE)
    await mount()
    await waitFor(() => expect(ipc.on).toHaveBeenCalledWith(SCOREBOARD_EVENT, expect.any(Function)))
    act(() => ipc.emit(SCOREBOARD_EVENT, { type: 'DISPLAY_DISCONNECTED' }))
    await waitFor(() => expect(screen.getByText(/display monitor disconnected — scoreboard is no longer visible/i)).toBeTruthy())
  })

  it('re-enables controls on DISPLAY_ADDED event', async () => {
    ipc.invoke.mockResolvedValueOnce(SINGLE).mockResolvedValueOnce(DUAL)
    await mount()
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true))
    act(() => ipc.emit(SCOREBOARD_EVENT, { type: 'DISPLAY_ADDED' }))
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false))
  })

  it('calls removeAllListeners on unmount', async () => {
    ipc.invoke.mockResolvedValue(SINGLE)
    const { unmount } = await mount()
    await waitFor(() => expect(ipc.on).toHaveBeenCalled())
    unmount()
    expect(ipc.removeAllListeners).toHaveBeenCalledWith(SCOREBOARD_EVENT)
  })
})
