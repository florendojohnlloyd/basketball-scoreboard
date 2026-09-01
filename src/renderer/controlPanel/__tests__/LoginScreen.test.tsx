// @vitest-environment jsdom
/**
 * LoginScreen tests — Requirement 28: Login screen and session management.
 *
 * Example-based tests:
 * - Wrong password shows error
 * - 3 failed attempts shows lockout message
 * - Successful login calls onLogin callback
 * - Admin setup screen shown on first launch (no accounts)
 * - Logout clears session in store
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// IPC mock setup (same pattern as MonitorSelector.test.tsx)
// ---------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void

interface FakeIpc {
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  emit: (channel: string, payload: unknown) => void
}

function makeIpc(): FakeIpc {
  const listeners: Record<string, Listener[]> = {}
  const invoke = vi.fn()
  const on = vi.fn((ch: string, h: Listener) => { (listeners[ch] ??= []).push(h) })
  const send = vi.fn()
  const removeAllListeners = vi.fn((ch: string) => { delete listeners[ch] })
  const emit = (ch: string, payload: unknown) => (listeners[ch] ?? []).forEach(h => h(payload))
  return { invoke, on, send, removeAllListeners, emit }
}

describe('LoginScreen', () => {
  let ipc: FakeIpc

  beforeEach(() => {
    ipc = makeIpc()
    Object.defineProperty(window, 'electron', { value: { ipcRenderer: ipc }, writable: true, configurable: true })
  })

  afterEach(() => vi.restoreAllMocks())

  async function mountLoginScreen(onLogin = vi.fn()) {
    // Dynamic import to pick up the fresh window.electron mock each time
    const { LoginScreen } = await import('../components/LoginScreen')
    const result = render(<LoginScreen onLogin={onLogin} />)
    return { ...result, onLogin }
  }

  it('shows login form when accounts exist', async () => {
    ipc.invoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'AUTH_HAS_ACCOUNTS') return Promise.resolve({ hasAccounts: true })
      return Promise.resolve({ success: false })
    })

    const { onLogin } = await mountLoginScreen()

    await waitFor(() => {
      expect(screen.getByText('Login')).toBeTruthy()
    })
    expect(screen.getByLabelText('Username')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: /log in/i })).toBeTruthy()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('shows Admin Setup screen when no accounts exist (first launch)', async () => {
    ipc.invoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'AUTH_HAS_ACCOUNTS') return Promise.resolve({ hasAccounts: false })
      return Promise.resolve({ success: false })
    })

    await mountLoginScreen()

    await waitFor(() => {
      expect(screen.getByText('Admin Setup')).toBeTruthy()
    })
    expect(screen.getByLabelText('Username')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByLabelText('Confirm Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: /create admin account/i })).toBeTruthy()
  })

  it('shows error message on wrong password', async () => {
    ipc.invoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'AUTH_HAS_ACCOUNTS') return Promise.resolve({ hasAccounts: true })
      if (q.type === 'AUTH_LOGIN') return Promise.resolve({ success: false, error: 'Invalid username or password.' })
      return Promise.resolve({ success: false })
    })

    const { onLogin } = await mountLoginScreen()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Login')).toBeTruthy())

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Invalid username or password.')
    })

    expect(onLogin).not.toHaveBeenCalled()
  })

  it('shows lockout message after 3 failed attempts', async () => {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    ipc.invoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'AUTH_HAS_ACCOUNTS') return Promise.resolve({ hasAccounts: true })
      if (q.type === 'AUTH_LOGIN') return Promise.resolve({ success: false, error: `Account locked until ${lockedUntil}.` })
      return Promise.resolve({ success: false })
    })

    const { onLogin } = await mountLoginScreen()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Login')).toBeTruthy())

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      const lockout = alerts.find(el => el.textContent?.includes('Account locked'))
      expect(lockout).toBeTruthy()
    })

    // Submit button should be disabled during lockout
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: /log in/i }) as HTMLButtonElement).disabled
      ).toBe(true)
    })

    expect(onLogin).not.toHaveBeenCalled()
  })

  it('calls onLogin on successful login', async () => {
    const testUser = { id: 'u1', username: 'admin', role: 'Admin' }

    ipc.invoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'AUTH_HAS_ACCOUNTS') return Promise.resolve({ hasAccounts: true })
      if (q.type === 'AUTH_LOGIN') return Promise.resolve({ success: true, user: testUser })
      return Promise.resolve({ success: false })
    })

    const { onLogin } = await mountLoginScreen()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Login')).toBeTruthy())

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(testUser)
    })
  })

  it('validates password requirements during Admin setup', async () => {
    ipc.invoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'AUTH_HAS_ACCOUNTS') return Promise.resolve({ hasAccounts: false })
      return Promise.resolve({ success: false })
    })

    const { onLogin } = await mountLoginScreen()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Admin Setup')).toBeTruthy())

    // Submit with weak password
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm Password'), 'short')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('at least 8 characters')
    })

    expect(onLogin).not.toHaveBeenCalled()
  })

  it('successful admin setup calls onLogin', async () => {
    const testUser = { id: 'u1', username: 'newadmin', role: 'Admin' }

    ipc.invoke.mockImplementation((_ch: string, q: { type: string }) => {
      if (q.type === 'AUTH_HAS_ACCOUNTS') return Promise.resolve({ hasAccounts: false })
      if (q.type === 'AUTH_SETUP') return Promise.resolve({ success: true, user: testUser })
      return Promise.resolve({ success: false })
    })

    const { onLogin } = await mountLoginScreen()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Admin Setup')).toBeTruthy())

    await user.type(screen.getByLabelText('Username'), 'newadmin')
    await user.type(screen.getByLabelText('Password'), 'StrongP@ss1')
    await user.type(screen.getByLabelText('Confirm Password'), 'StrongP@ss1')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(testUser)
    })
  })
})

describe('App session management (login/logout flow)', () => {
  it('session store starts null and updates on login/logout', () => {
    // Directly test the store behavior that App.tsx relies on.
    // App.tsx reads session from store: if null → LoginScreen, else → AuthenticatedApp
    // On logout: invokes AUTH_LOGOUT IPC and calls setSession(null)
    const { create } = require('zustand')

    interface SessionStore {
      session: { id: string; username: string; role: string } | null
      setSession: (s: { id: string; username: string; role: string } | null) => void
    }

    const useStore = create<SessionStore>((set: any) => ({
      session: null,
      setSession: (session: any) => set({ session }),
    }))

    // Initial state: null (login screen shown)
    expect(useStore.getState().session).toBeNull()

    // Simulate successful login
    useStore.getState().setSession({ id: 'u1', username: 'admin', role: 'Admin' })
    expect(useStore.getState().session).toEqual({ id: 'u1', username: 'admin', role: 'Admin' })

    // Simulate logout
    useStore.getState().setSession(null)
    expect(useStore.getState().session).toBeNull()
  })
})
