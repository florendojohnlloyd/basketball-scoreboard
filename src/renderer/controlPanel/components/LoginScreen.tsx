/**
 * LoginScreen — handles authentication and initial Admin setup (Requirement 28).
 *
 * Renders:
 * - Admin setup screen when no accounts exist (first launch)
 * - Login form with username/password fields
 * - Error messages on invalid credentials
 * - Lockout message with remaining time when account is locked
 */

import React, { useState, useEffect, useRef } from 'react'
import { SCOREBOARD_QUERY } from '@shared/types'
import './LoginScreen.css'

// Password validation rules (mirrors roleStore.validatePassword)
function validatePassword(p: string): { valid: boolean; error?: string } {
  if (p.length < 8) return { valid: false, error: 'Password must be at least 8 characters.' }
  if (!/[A-Z]/.test(p)) return { valid: false, error: 'Must contain at least one uppercase letter.' }
  if (!/[0-9]/.test(p)) return { valid: false, error: 'Must contain at least one digit.' }
  if (!/[^A-Za-z0-9]/.test(p)) return { valid: false, error: 'Must contain at least one special character.' }
  return { valid: true }
}

interface LoginScreenProps {
  onLogin: (user: { id: string; username: string; role: string }) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps): React.ReactElement {
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [lockoutMessage, setLockoutMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const lockoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check if accounts exist on mount
  useEffect(() => {
    window.electron.ipcRenderer
      .invoke(SCOREBOARD_QUERY, { type: 'AUTH_HAS_ACCOUNTS' })
      .then((result: unknown) => {
        const res = result as { hasAccounts: boolean }
        setMode(res.hasAccounts ? 'login' : 'setup')
      })
      .catch(() => {
        // If query fails, default to login mode
        setMode('login')
      })
    return () => {
      if (lockoutIntervalRef.current) clearInterval(lockoutIntervalRef.current)
    }
  }, [])

  function startLockoutCountdown(lockedUntil: string): void {
    if (lockoutIntervalRef.current) clearInterval(lockoutIntervalRef.current)

    const updateMessage = (): void => {
      const remainingMs = new Date(lockedUntil).getTime() - Date.now()
      if (remainingMs <= 0) {
        setLockoutMessage('')
        if (lockoutIntervalRef.current) clearInterval(lockoutIntervalRef.current)
        return
      }
      const minutes = Math.floor(remainingMs / 60000)
      const seconds = Math.ceil((remainingMs % 60000) / 1000)
      setLockoutMessage(`Account locked. Try again in ${minutes}m ${seconds}s.`)
    }

    updateMessage()
    lockoutIntervalRef.current = setInterval(updateMessage, 1000)
  }

  async function handleLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (submitting) return

    setError('')
    setLockoutMessage('')

    if (!username.trim() || !password) {
      setError('Please enter username and password.')
      return
    }

    setSubmitting(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'AUTH_LOGIN',
        username: username.trim(),
        password,
      }) as { success: boolean; user?: { id: string; username: string; role: string }; error?: string }

      if (result.success && result.user) {
        onLogin(result.user)
      } else {
        const errMsg = result.error ?? 'Invalid username or password.'
        // Check for lockout error
        if (errMsg.includes('Account locked')) {
          // Extract the lockedUntil date from the error message
          const match = errMsg.match(/until (.+)\.$/)
          if (match) {
            startLockoutCountdown(match[1])
          } else {
            setLockoutMessage('Account locked. Try again in 5 minutes.')
          }
        } else {
          setError(errMsg)
        }
      }
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSetup(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (submitting) return

    setError('')

    if (!username.trim()) {
      setError('Please enter a username.')
      return
    }

    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      setError(passwordValidation.error!)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, {
        type: 'AUTH_SETUP',
        username: username.trim(),
        password,
      }) as { success: boolean; user?: { id: string; username: string; role: string }; error?: string }

      if (result.success && result.user) {
        onLogin(result.user)
      } else {
        setError(result.error ?? 'Setup failed. Please try again.')
      }
    } catch (err) {
      setError('Setup failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'loading') {
    return (
      <div className="login-screen" data-testid="login-screen">
        <div className="login-screen__card">
          <p className="login-screen__loading">Loading...</p>
        </div>
      </div>
    )
  }

  if (mode === 'setup') {
    return (
      <div className="login-screen" data-testid="login-screen">
        <div className="login-screen__card">
          <h1 className="login-screen__title">Admin Setup</h1>
          <p className="login-screen__subtitle">Create the initial Admin account to get started.</p>

          <form className="login-screen__form" onSubmit={handleSetup}>
            <div className="login-screen__field">
              <label htmlFor="setup-username">Username</label>
              <input
                id="setup-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Admin username"
                disabled={submitting}
                autoFocus
              />
            </div>

            <div className="login-screen__field">
              <label htmlFor="setup-password">Password</label>
              <input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 chars, 1 upper, 1 digit, 1 special"
                disabled={submitting}
              />
            </div>

            <div className="login-screen__field">
              <label htmlFor="setup-confirm">Confirm Password</label>
              <input
                id="setup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                disabled={submitting}
              />
            </div>

            {error && <div className="login-screen__error" role="alert">{error}</div>}

            <button
              type="submit"
              className="login-screen__submit"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Admin Account'}
            </button>
          </form>

          <p className="login-screen__hint">
            Password requirements: 8+ characters, uppercase, digit, special character.
          </p>
        </div>
      </div>
    )
  }

  // Login mode
  return (
    <div className="login-screen" data-testid="login-screen">
      <div className="login-screen__card">
        <h1 className="login-screen__title">Login</h1>
        <p className="login-screen__subtitle">Basketball Scoreboard System</p>

        <form className="login-screen__form" onSubmit={handleLogin}>
          <div className="login-screen__field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="login-screen__field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              disabled={submitting}
            />
          </div>

          {error && <div className="login-screen__error" role="alert">{error}</div>}
          {lockoutMessage && <div className="login-screen__lockout" role="alert">{lockoutMessage}</div>}

          <button
            type="submit"
            className="login-screen__submit"
            disabled={submitting || !!lockoutMessage}
          >
            {submitting ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginScreen
