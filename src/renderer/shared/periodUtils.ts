/**
 * Shared period display utilities for renderer processes.
 *
 * Used by both the Control Panel (task 12) and the Scoreboard Display (task 25).
 */

import type { PeriodState, GameConfig } from '@shared/types'

/**
 * Formats a period into a human-readable label.
 *
 * Rules:
 *  - Quarters (periodCount === 4): "Q1", "Q2", "Q3", "Q4"
 *  - Halves  (periodCount === 2): "1st Half", "2nd Half"
 *  - Overtime (isOvertime):
 *      overtimeNumber === 1 → "OT"
 *      overtimeNumber === 2 → "2OT"
 *      overtimeNumber === N → "NOT" (N = overtimeNumber)
 *
 * @param period  Current PeriodState from GameState
 * @param config  Current GameConfig from GameState
 * @returns       Human-readable label string
 */
export function formatPeriodLabel(period: PeriodState, config: GameConfig): string {
  if (period.isOvertime) {
    return period.overtimeNumber === 1
      ? 'OT'
      : `${period.overtimeNumber}OT`
  }

  if (config.periodCount === 4) {
    return `Q${period.current}`
  }

  // Halves
  return period.current === 1 ? '1st Half' : '2nd Half'
}
