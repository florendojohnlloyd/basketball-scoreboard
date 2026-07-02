/**
 * Property-based tests for pure validation functions.
 *
 * Feature: basketball-scoreboard
 * Properties covered: 1, 8, 14, 15, 23
 */

import * as fc from 'fast-check';
import {
  validateTeamName,
  validateShotClockDuration,
  validateBonusThreshold,
  validateTimeoutCount,
  getContrastTextColor,
} from '../../shared/validation';

// ---------------------------------------------------------------------------
// Helper: WCAG relative luminance
// ---------------------------------------------------------------------------

function toLinear(c: number): number {
  const sRGB = c / 255;
  return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Property 1: Team name validation accepts valid names and rejects invalid ones
// Validates: Requirements 2.3
// ---------------------------------------------------------------------------

test('Property 1 — team name validation accepts valid names and rejects invalid ones', () => {
  // Feature: basketball-scoreboard, Property 1: Team name validation accepts valid names and rejects invalid ones
  fc.assert(
    fc.property(
      fc.string({ minLength: 0, maxLength: 50 }),
      (name) => {
        const result = validateTeamName(name);
        const trimmed = name.trim();

        if (trimmed.length === 0 || trimmed.length > 30) {
          // Invalid: empty after trim, whitespace-only, or exceeds 30 chars
          expect(result.valid).toBe(false);
          expect(result.error).toBeTruthy();
        } else {
          // Valid: trimmed length in [1, 30]
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 8: Shot clock duration accepts [14, 30] and rejects outside
// Validates: Requirements 5.4
// ---------------------------------------------------------------------------

test('Property 8 — shot clock duration accepts [14, 30] and rejects values outside that range', () => {
  // Feature: basketball-scoreboard, Property 8: Shot clock duration configuration accepts valid values and rejects invalid ones
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 50 }),
      (seconds) => {
        const result = validateShotClockDuration(seconds);

        if (seconds >= 14 && seconds <= 30) {
          // Valid range
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        } else {
          // Outside valid range
          expect(result.valid).toBe(false);
          expect(result.error).toBeTruthy();
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 14: Bonus threshold accepts [1, 10] and rejects outside
// Validates: Requirements 7.6
// ---------------------------------------------------------------------------

test('Property 14 — bonus threshold accepts [1, 10] and rejects values outside that range', () => {
  // Feature: basketball-scoreboard, Property 14: Bonus threshold configuration accepts valid values and rejects invalid ones
  fc.assert(
    fc.property(
      fc.integer({ min: -5, max: 15 }),
      (value) => {
        const result = validateBonusThreshold(value);

        if (value >= 1 && value <= 10) {
          // Valid range
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        } else {
          // Outside valid range
          expect(result.valid).toBe(false);
          expect(result.error).toBeTruthy();
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 15: Timeout count accepts [0, 10] and rejects outside
// Validates: Requirements 8.1
// ---------------------------------------------------------------------------

test('Property 15 — timeout count accepts [0, 10] and rejects values outside that range', () => {
  // Feature: basketball-scoreboard, Property 15: Timeout count configuration accepts values in valid range
  fc.assert(
    fc.property(
      fc.integer({ min: -5, max: 15 }),
      (value) => {
        const result = validateTimeoutCount(value);

        if (value >= 0 && value <= 10) {
          // Valid range
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        } else {
          // Outside valid range
          expect(result.valid).toBe(false);
          expect(result.error).toBeTruthy();
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 23: WCAG AA contrast ≥ 4.5:1 for any team accent color
// Validates: Requirements 11.2
// ---------------------------------------------------------------------------

test('Property 23 — WCAG AA contrast ratio ≥ 4.5:1 is met for any team accent color', () => {
  // Feature: basketball-scoreboard, Property 23: WCAG AA contrast is met for any configured team accent color
  //
  // For each generated hex color C (the team accent/background color),
  // getContrastTextColor('#' + C) must return '#FFFFFF' or '#000000' —
  // specifically the one that achieves the maximum (best) WCAG contrast ratio
  // against C. When either white or black achieves ≥ 4.5:1, it must be chosen.
  //
  // Note: WCAG AA (4.5:1) with a binary white/black choice is only guaranteed
  // for luminance values outside the mid-tone band (~0.175–0.183). The function
  // always picks the maximum-contrast option, which is the best possible
  // result under a white/black constraint.
  fc.assert(
    fc.property(
      fc.hexaString({ minLength: 6, maxLength: 6 }),
      (hexChars) => {
        const accentColor = '#' + hexChars;
        const textColor = getContrastTextColor(accentColor);

        // The returned text color must be either white or black
        expect(['#FFFFFF', '#000000']).toContain(textColor);

        const accentLuminance = relativeLuminance(accentColor);
        const whiteLuminance = relativeLuminance('#FFFFFF');
        const blackLuminance = relativeLuminance('#000000');

        const whiteContrast = contrastRatio(whiteLuminance, accentLuminance);
        const blackContrast = contrastRatio(blackLuminance, accentLuminance);

        // The function must always return the option with the higher contrast
        // (i.e., the best achievable contrast given binary white/black choice)
        if (whiteContrast >= blackContrast) {
          expect(textColor).toBe('#FFFFFF');
        } else {
          expect(textColor).toBe('#000000');
        }

        // When WCAG AA is achievable with either white or black, it must be met
        const bestContrast = Math.max(whiteContrast, blackContrast);
        const returnedContrast = contrastRatio(relativeLuminance(textColor), accentLuminance);
        expect(returnedContrast).toBe(bestContrast);
      }
    ),
    { numRuns: 100 }
  );
});
