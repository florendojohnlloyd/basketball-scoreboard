/**
 * Shared clock display utilities for renderer processes.
 */

/**
 * Formats a millisecond value as a zero-padded "MM:SS" string.
 *
 * - Clamps negative inputs to 0.
 * - Truncates (floor) sub-second remainders — the display never rounds up.
 *
 * @param ms  Clock value in milliseconds (non-negative integer expected)
 * @returns   Zero-padded string, e.g. "12:05", "00:00", "60:00"
 */
export function formatClockDisplay(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Formats a shot clock millisecond value as a whole number of seconds.
 *
 * Uses Math.ceil so that any partial second counts as a full second,
 * matching the standard basketball shot clock convention.
 *
 * @param ms  Shot clock value in milliseconds (non-negative integer expected)
 * @returns   Whole number of seconds remaining (integer, no fractional part)
 */
export function formatShotClock(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 1000)
}
