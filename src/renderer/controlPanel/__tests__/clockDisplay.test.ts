// Feature: basketball-scoreboard

import * as fc from 'fast-check'
import { formatClockDisplay, formatShotClock } from '../../shared/clockUtils'

/**
 * Property 6 — Game clock display is always formatted as MM:SS
 *
 * For any valid clock value in milliseconds, formatClockDisplay(ms) must
 * match the pattern MM:SS where MM and SS are zero-padded integers,
 * MM is in [00, 60], and SS is in [00, 59].
 *
 * Validates: Requirements 4.7
 */
test('Property 6: game clock display is always formatted as MM:SS', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 3_600_000 }),
      (ms) => {
        const result = formatClockDisplay(ms)

        // Must match MM:SS pattern exactly
        expect(result).toMatch(/^\d{2}:\d{2}$/)

        const [mmStr, ssStr] = result.split(':')
        const mm = parseInt(mmStr, 10)
        const ss = parseInt(ssStr, 10)

        // MM must be in [0, 60]
        expect(mm).toBeGreaterThanOrEqual(0)
        expect(mm).toBeLessThanOrEqual(60)

        // SS must be in [0, 59]
        expect(ss).toBeGreaterThanOrEqual(0)
        expect(ss).toBeLessThanOrEqual(59)

        // Both parts must be zero-padded to 2 digits
        expect(mmStr).toHaveLength(2)
        expect(ssStr).toHaveLength(2)
      }
    ),
    { numRuns: 100 }
  )
})

/**
 * Property 9 — Shot clock display shows whole seconds only
 *
 * For any shot clock internal millisecond value V in [0, 30000], the
 * displayed value is Math.ceil(V / 1000) as a whole integer.
 *
 * Validates: Requirements 5.5
 */
test('Property 9: shot clock display shows whole seconds only', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 30_000 }),
      (ms) => {
        const displayed = formatShotClock(ms)

        // Must be a whole integer (no fractional part)
        expect(Number.isInteger(displayed)).toBe(true)

        // Must equal Math.ceil(ms / 1000)
        expect(displayed).toBe(Math.ceil(ms / 1000))

        // Must be in range [0, 30]
        expect(displayed).toBeGreaterThanOrEqual(0)
        expect(displayed).toBeLessThanOrEqual(30)
      }
    ),
    { numRuns: 100 }
  )
})
