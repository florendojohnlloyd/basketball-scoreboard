/**
 * Pure validation functions for the Basketball Scoreboard Control Panel.
 * All functions are side-effect-free and return a ValidationResult.
 */

import type { ValidationResult } from '../../shared/types';

// ---------------------------------------------------------------------------
// Team name validation
// ---------------------------------------------------------------------------

/**
 * Validates a team name.
 * Valid: trimmed length in [1, 30] and not composed entirely of whitespace.
 *
 * Validates: Requirements 2.3
 */
export function validateTeamName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Team name cannot be empty or whitespace only.' };
  }
  if (trimmed.length > 30) {
    return { valid: false, error: 'Team name must be 30 characters or fewer.' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Shot clock duration validation
// ---------------------------------------------------------------------------

/**
 * Validates a shot clock duration in whole seconds.
 * Valid range: [14, 30] inclusive.
 *
 * Validates: Requirements 5.4
 */
export function validateShotClockDuration(seconds: number): ValidationResult {
  if (!Number.isInteger(seconds) || seconds < 14 || seconds > 30) {
    return {
      valid: false,
      error: `Shot clock duration must be a whole number between 14 and 30 seconds.`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Bonus threshold validation
// ---------------------------------------------------------------------------

/**
 * Validates the bonus threshold (team fouls required to enter bonus).
 * Valid range: [1, 10] inclusive.
 *
 * Validates: Requirements 7.6
 */
export function validateBonusThreshold(value: number): ValidationResult {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    return {
      valid: false,
      error: 'Bonus threshold must be a whole number between 1 and 10.',
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Timeout count validation
// ---------------------------------------------------------------------------

/**
 * Validates a timeout count configuration (full or 20-second timeouts per team).
 * Valid range: [0, 10] inclusive.
 *
 * Validates: Requirements 8.1
 */
export function validateTimeoutCount(value: number): ValidationResult {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    return {
      valid: false,
      error: 'Timeout count must be a whole number between 0 and 10.',
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// WCAG contrast helper
// ---------------------------------------------------------------------------

/**
 * Parses a 6-digit hex color string (with or without leading '#') and returns
 * the [r, g, b] components as values in [0, 255].
 */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

/**
 * Computes the WCAG relative luminance for an sRGB color.
 * See: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number): number => {
    const sRGB = c / 255;
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Computes the WCAG contrast ratio between two luminance values.
 * See: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Given a background hex color, returns either '#FFFFFF' (white) or '#000000'
 * (black) — whichever achieves a contrast ratio ≥ 4.5:1 against the given color.
 *
 * This is used to choose text/foreground colors that meet WCAG AA on any
 * team accent color background.
 *
 * Validates: Requirements 11.2
 */
export function getContrastTextColor(hexColor: string): string {
  const [r, g, b] = parseHex(hexColor);
  const bgLuminance = relativeLuminance(r, g, b);

  const whiteLuminance = 1.0; // luminance of #FFFFFF
  const blackLuminance = 0.0; // luminance of #000000

  const whiteContrast = contrastRatio(whiteLuminance, bgLuminance);
  const blackContrast = contrastRatio(blackLuminance, bgLuminance);

  // Prefer white; fall back to black if black provides better contrast
  return whiteContrast >= blackContrast ? '#FFFFFF' : '#000000';
}
