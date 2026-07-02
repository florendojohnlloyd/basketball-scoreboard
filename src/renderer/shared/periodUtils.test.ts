import { describe, it, expect } from 'vitest'
import { formatPeriodLabel } from './periodUtils'
import type { PeriodState, GameConfig } from '@shared/types'
import { NBA_RULES, FIBA_RULES } from '@shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePeriod(overrides: Partial<PeriodState> = {}): PeriodState {
  return {
    current: 1,
    format: 'quarters',
    isOvertime: false,
    overtimeNumber: 0,
    ...overrides,
  }
}

/** NBA / FIBA use 4 quarters */
const quartersConfig: GameConfig = { ...NBA_RULES }

/** Halves config */
const halvesConfig: GameConfig = { ...FIBA_RULES, periodCount: 2 }

// ---------------------------------------------------------------------------
// Quarters (periodCount === 4)
// ---------------------------------------------------------------------------

describe('formatPeriodLabel — quarters', () => {
  it('formats Q1', () => {
    expect(formatPeriodLabel(makePeriod({ current: 1 }), quartersConfig)).toBe('Q1')
  })

  it('formats Q2', () => {
    expect(formatPeriodLabel(makePeriod({ current: 2 }), quartersConfig)).toBe('Q2')
  })

  it('formats Q3', () => {
    expect(formatPeriodLabel(makePeriod({ current: 3 }), quartersConfig)).toBe('Q3')
  })

  it('formats Q4', () => {
    expect(formatPeriodLabel(makePeriod({ current: 4 }), quartersConfig)).toBe('Q4')
  })
})

// ---------------------------------------------------------------------------
// Halves (periodCount === 2)
// ---------------------------------------------------------------------------

describe('formatPeriodLabel — halves', () => {
  it('formats 1st Half', () => {
    expect(formatPeriodLabel(makePeriod({ current: 1 }), halvesConfig)).toBe('1st Half')
  })

  it('formats 2nd Half', () => {
    expect(formatPeriodLabel(makePeriod({ current: 2 }), halvesConfig)).toBe('2nd Half')
  })
})

// ---------------------------------------------------------------------------
// Overtime
// ---------------------------------------------------------------------------

describe('formatPeriodLabel — overtime', () => {
  it('formats first OT as "OT"', () => {
    const period = makePeriod({ isOvertime: true, overtimeNumber: 1 })
    expect(formatPeriodLabel(period, quartersConfig)).toBe('OT')
  })

  it('formats second OT as "2OT"', () => {
    const period = makePeriod({ isOvertime: true, overtimeNumber: 2 })
    expect(formatPeriodLabel(period, quartersConfig)).toBe('2OT')
  })

  it('formats third OT as "3OT"', () => {
    const period = makePeriod({ isOvertime: true, overtimeNumber: 3 })
    expect(formatPeriodLabel(period, quartersConfig)).toBe('3OT')
  })

  it('OT label is independent of periodCount (quarters config)', () => {
    const period = makePeriod({ isOvertime: true, overtimeNumber: 1 })
    expect(formatPeriodLabel(period, quartersConfig)).toBe('OT')
  })

  it('OT label is independent of periodCount (halves config)', () => {
    const period = makePeriod({ isOvertime: true, overtimeNumber: 1 })
    expect(formatPeriodLabel(period, halvesConfig)).toBe('OT')
  })

  it('formats high overtime numbers correctly', () => {
    const period = makePeriod({ isOvertime: true, overtimeNumber: 10 })
    expect(formatPeriodLabel(period, quartersConfig)).toBe('10OT')
  })
})
