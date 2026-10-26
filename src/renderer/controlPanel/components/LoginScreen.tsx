/**
 * LoginScreen — handles authentication and initial Admin setup (Requirement 28).
 *
 * Renders:
 * - Admin setup screen when no accounts exist (first launch)
 * - Login form with username/password fields
 * - Error messages on invalid credentials
 * - Lockout message with remaining time when account is locked
 * - Show/hide password toggles
 * - High-end modern sports-tech UI with Fitness Exclusive branding
 */

import React, { useState, useEffect, useRef } from 'react'
import { SCOREBOARD_QUERY } from '@shared/types'
import fitnessLogo from '../../../../pictures/red.png'
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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

  // Password requirement checks for visual feedback during setup
  const hasMinLength = password.length >= 8
  const hasUpper = /[A-Z]/.test(password)
  const hasDigit = /[0-9]/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)

  if (mode === 'loading') {
    return (
      <div className="login-screen" data-testid="login-screen">
        <div className="login-screen__card">
          <div className="login-screen__brand">
            <div className="login-screen__logo-wrap">
              <img src={fitnessLogo} alt="Fitness Exclusive" className="login-screen__brand-img" />
            </div>
          </div>
          <div className="login-screen__spinner" />
          <p className="login-screen__loading">Initializing system security...</p>
        </div>
      </div>
    )
  }

  if (mode === 'setup') {
    return (
      <div className="login-screen" data-testid="login-screen">
        <div className="login-screen__card">
          <div className="login-screen__brand">
            <div className="login-screen__logo-wrap">
              <img src={fitnessLogo} alt="Fitness Exclusive" className="login-screen__brand-img" />
            </div>
            <div className="login-screen__badge">FIRST LAUNCH SETUP</div>
          </div>

          <h1 className="login-screen__title">Admin Setup</h1>
          <p className="login-screen__subtitle">Create the initial Admin account to get started.</p>

          <form className="login-screen__form" onSubmit={handleSetup}>
            <div className="login-screen__field">
              <label htmlFor="setup-username">Username</label>
              <div className="login-screen__input-wrapper">
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
            </div>

            <div className="login-screen__field">
              <label htmlFor="setup-password">Password</label>
              <div className="login-screen__input-wrapper">
                <input
                  id="setup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 upper, 1 digit, 1 special"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="login-screen__toggle-pwd"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="login-screen__field">
              <label htmlFor="setup-confirm">Confirm Password</label>
              <div className="login-screen__input-wrapper">
                <input
                  id="setup-confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="login-screen__toggle-pwd"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Visual Password Requirements Tracker */}
            <div className="login-screen__reqs">
              <span className={`login-screen__req-item ${hasMinLength ? 'login-screen__req-item--valid' : ''}`}>
                {hasMinLength ? '✓' : '•'} 8+ characters
              </span>
              <span className={`login-screen__req-item ${hasUpper ? 'login-screen__req-item--valid' : ''}`}>
                {hasUpper ? '✓' : '•'} Uppercase letter
              </span>
              <span className={`login-screen__req-item ${hasDigit ? 'login-screen__req-item--valid' : ''}`}>
                {hasDigit ? '✓' : '•'} At least 1 digit
              </span>
              <span className={`login-screen__req-item ${hasSpecial ? 'login-screen__req-item--valid' : ''}`}>
                {hasSpecial ? '✓' : '•'} Special character
              </span>
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
        <div className="login-screen__brand">
          <div className="login-screen__logo-wrap">
            <img src={fitnessLogo} alt="Fitness Exclusive" className="login-screen__brand-img" />
          </div>
          <div className="login-screen__badge">OFFICIAL CONTROL SYSTEM</div>
        </div>

        <h1 className="login-screen__title">Login</h1>
        <p className="login-screen__subtitle">Basketball Scoreboard System</p>

        <form className="login-screen__form" onSubmit={handleLogin}>
          <div className="login-screen__field">
            <label htmlFor="login-username">Username</label>
            <div className="login-screen__input-wrapper">
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                disabled={submitting}
                autoFocus
              />
            </div>
          </div>

          <div className="login-screen__field">
            <label htmlFor="login-password">Password</label>
            <div className="login-screen__input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={submitting}
              />
              <button
                type="button"
                className="login-screen__toggle-pwd"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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

        <div className="login-screen__footer">
          <span className="login-screen__footer-dot" />
          <span>RBAC Protected Session • Local Auth</span>
        </div>
      </div>
    </div>
  )
}

export default LoginScreen
