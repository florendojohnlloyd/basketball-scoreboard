// Feature: basketball-scoreboard, Property 11: Period label format is correct for all valid period numbers
// Validates: Requirements 6.3, 6.7

import * as fc from 'fast-check'
import { describe, test } from 'vitest'
import { formatPeriodLabel } from '../../shared/periodUtils'
import type { PeriodState, GameConfig } from '@shared/types'
import { NBA_RULES, FIBA_RULES } from '@shared/types'

/**
 * Property 11 — Period label format is correct for all valid period numbers
 *
 * For any period number N in [1, configured period count] and game format
 * (quarters or halves), the period label SHALL be "Q{N}" for quarters and
 * "{ordinal} Half" for halves; for any overtime period OT number K ≥ 1,
 * the label SHALL be "OT" when K = 1 and "{K}OT" when K > 1.
 *
 * Validates: Requirements 6.3, 6.7
 */
describe('Property 11 — Period label format', () => {
  // Base configs for quarters (periodCount 4) and halves (periodCount 2)
  const quartersConfig: GameConfig = { ...NBA_RULES }
  const halvesConfig: GameConfig = { ...FIBA_RULES, periodCount: 2 }

  // Ordinal labels for the two halves
  const halfOrdinals: Record<number, string> = {
    1: '1st Half',
    2: '2nd Half',
  }

  test('quarters format: label is Q{N} for any valid period number N in [1, 4]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        (n) => {
          const period: PeriodState = {
            current: n,
            format: 'quarters',
            isOvertime: false,
            overtimeNumber: 0,
          }
          const label = formatPeriodLabel(period, quartersConfig)
          expect(label).toBe(`Q${n}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('halves format: label is "{ordinal} Half" for any valid period number N in [1, 2]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 }),
        (n) => {
          const period: PeriodState = {
            current: n,
            format: 'halves',
            isOvertime: false,
            overtimeNumber: 0,
          }
          const label = formatPeriodLabel(period, halvesConfig)
          expect(label).toBe(halfOrdinals[n])
        }
      ),
      { numRuns: 100 }
    )
  })

  test('overtime K=1 produces "OT", K>1 produces "{K}OT", for any game format', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.oneof(fc.constant('quarters' as const), fc.constant('halves' as const)),
        (k, format) => {
          const config = format === 'quarters' ? quartersConfig : halvesConfig
          const period: PeriodState = {
            current: format === 'quarters' ? 4 : 2, // past max period → overtime
            format,
            isOvertime: true,
            overtimeNumber: k,
          }
          const label = formatPeriodLabel(period, config)
          if (k === 1) {
            expect(label).toBe('OT')
          } else {
            expect(label).toBe(`${k}OT`)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  test('combined: any valid period or OT produces correct label', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.oneof(fc.constant('quarters' as const), fc.constant('halves' as const)),
        fc.integer({ min: 0, max: 10 }),
        (periodNum, format, otNum) => {
          const config = format === 'quarters' ? quartersConfig : halvesConfig
          const maxPeriod = config.periodCount // 4 for quarters, 2 for halves

          // Clamp period number to valid range for the format
          const clampedPeriod = Math.min(periodNum, maxPeriod) as number

          // Regular period (not overtime)
          const regularPeriod: PeriodState = {
            current: clampedPeriod,
            format,
            isOvertime: false,
            overtimeNumber: 0,
          }
          const regularLabel = formatPeriodLabel(regularPeriod, config)

          if (format === 'quarters') {
            expect(regularLabel).toBe(`Q${clampedPeriod}`)
          } else {
            expect(regularLabel).toBe(halfOrdinals[clampedPeriod])
          }

          // Overtime period (otNum ≥ 1)
          if (otNum >= 1) {
            const otPeriod: PeriodState = {
              current: clampedPeriod,
              format,
              isOvertime: true,
              overtimeNumber: otNum,
            }
            const otLabel = formatPeriodLabel(otPeriod, config)
            if (otNum === 1) {
              expect(otLabel).toBe('OT')
            } else {
              expect(otLabel).toBe(`${otNum}OT`)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
