/**
 * Shared clock display utilities for renderer processes.
 */

/**
 * Formats a millisecond value as "MM:SS" above 60s, or "S.T" (seconds.tenths) below 60s.
 * Matches standard basketball scoreboard convention.
 */
export function formatClockDisplay(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSec = Math.floor(clamped / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Formats clock with tenths-of-seconds precision.
 * Shows "M:SS.T" below 60s, "MM:SS" at or above 60s.
 */
export function formatClockPrecise(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped >= 60000) {
    return formatClockDisplay(clamped)
  }
  // Below 1 minute: show tenths
  const totalSec = Math.floor(clamped / 1000)
  const tenths = Math.floor((clamped % 1000) / 100)
  return `0:${String(totalSec).padStart(2, '0')}.${tenths}`
}

/**
 * Formats a shot clock millisecond value as a whole number of seconds.
 * Uses Math.ceil so that any partial second counts as a full second.
 */
export function formatShotClock(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 1000)
}
