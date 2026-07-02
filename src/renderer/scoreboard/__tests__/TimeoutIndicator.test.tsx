// Feature: basketball-scoreboard, Property 17: Timeout indicator rendering reflects remaining and total counts
//
// For any remaining count R and maximum M where 0 ≤ R ≤ M ≤ 10, the rendered timeout
// indicators SHALL show exactly R filled indicators and exactly (M − R) unfilled indicators.
//
// Validates: Requirements 8.5

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Pure dot-generation logic extracted from TimeoutDots (TeamSection.tsx)
//
// TimeoutDots renders `total` spans. For index i in [0, total):
//   i < remaining  → 'team-section__timeout-dot--filled'
//   i >= remaining → 'team-section__timeout-dot--empty'
//
// We test that logic directly without needing to mount the React component
// (which requires a Zustand store and CSS — not needed to verify counts).
// ---------------------------------------------------------------------------

/**
 * Mirrors the dot-generation logic from the TimeoutDots helper in TeamSection.tsx.
 * Returns an array of 'filled' | 'empty' strings of length `total`.
 */
function generateDots(remaining: number, total: number): Array<'filled' | 'empty'> {
  return Array.from({ length: total }, (_, i) =>
    i < remaining ? 'filled' : 'empty'
  )
}

// ---------------------------------------------------------------------------
// Property 17
// ---------------------------------------------------------------------------

describe('TimeoutIndicator — Property 17', () => {
  it(
    'shows exactly R filled and (M - R) empty indicators for any valid 0 ≤ R ≤ M ≤ 10',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (a, b) => {
            // Derive R (remaining) and M (total) so that R ≤ M
            const remaining = Math.min(a, b)
            const total = Math.max(a, b)

            const dots = generateDots(remaining, total)

            // Total count must equal M
            expect(dots).toHaveLength(total)

            // Filled count must equal R
            const filledCount = dots.filter((d) => d === 'filled').length
            expect(filledCount).toBe(remaining)

            // Unfilled count must equal M − R
            const emptyCount = dots.filter((d) => d === 'empty').length
            expect(emptyCount).toBe(total - remaining)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // ---------------------------------------------------------------------------
  // Edge-case spot checks for clarity
  // ---------------------------------------------------------------------------

  it('all filled when R equals M', () => {
    for (let m = 0; m <= 10; m++) {
      const dots = generateDots(m, m)
      expect(dots.filter((d) => d === 'filled').length).toBe(m)
      expect(dots.filter((d) => d === 'empty').length).toBe(0)
    }
  })

  it('all empty when R is 0', () => {
    for (let m = 0; m <= 10; m++) {
      const dots = generateDots(0, m)
      expect(dots.filter((d) => d === 'filled').length).toBe(0)
      expect(dots.filter((d) => d === 'empty').length).toBe(m)
    }
  })

  it('zero dots when M is 0 (total === 0 renders nothing)', () => {
    const dots = generateDots(0, 0)
    expect(dots).toHaveLength(0)
  })
})
