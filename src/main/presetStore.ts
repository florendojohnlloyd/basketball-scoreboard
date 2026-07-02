/**
 * PresetStore — persistence and built-in presets
 *
 * Manages game configuration presets using electron-store for persistence.
 * Built-in presets (NBA Rules, FIBA Rules) are embedded in the application
 * bundle and are never read from disk.
 */

import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import {
  GameConfig,
  Preset,
  NBA_RULES,
  FIBA_RULES,
  SCOREBOARD_EVENT,
  ValidationResult,
} from '../shared/types';

// ---------------------------------------------------------------------------
// PresetStore interface
// ---------------------------------------------------------------------------

export interface PresetStore {
  list(): Preset[];
  load(name: string): GameConfig;
  save(name: string, config: GameConfig): void;
  delete(name: string): void;
  isBuiltIn(name: string): boolean;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a GameConfig object against the required field ranges.
 * Returns a ValidationResult indicating whether the config is valid.
 */
export function validateGameConfig(config: unknown): ValidationResult {
  if (typeof config !== 'object' || config === null) {
    return { valid: false, error: 'Config must be an object' };
  }

  const c = config as Record<string, unknown>;

  // periodDurationMinutes: [1, 60]
  if (
    typeof c.periodDurationMinutes !== 'number' ||
    !Number.isInteger(c.periodDurationMinutes) ||
    c.periodDurationMinutes < 1 ||
    c.periodDurationMinutes > 60
  ) {
    return {
      valid: false,
      error: `periodDurationMinutes must be an integer in [1, 60], got ${c.periodDurationMinutes}`,
    };
  }

  // periodCount: {2, 4}
  if (c.periodCount !== 2 && c.periodCount !== 4) {
    return {
      valid: false,
      error: `periodCount must be 2 or 4, got ${c.periodCount}`,
    };
  }

  // overtimeDurationMinutes: must be a positive number (not strictly bounded by spec)
  if (typeof c.overtimeDurationMinutes !== 'number' || c.overtimeDurationMinutes <= 0) {
    return {
      valid: false,
      error: `overtimeDurationMinutes must be a positive number, got ${c.overtimeDurationMinutes}`,
    };
  }

  // shotClockDurationSeconds: [14, 30]
  if (
    typeof c.shotClockDurationSeconds !== 'number' ||
    !Number.isInteger(c.shotClockDurationSeconds) ||
    c.shotClockDurationSeconds < 14 ||
    c.shotClockDurationSeconds > 30
  ) {
    return {
      valid: false,
      error: `shotClockDurationSeconds must be an integer in [14, 30], got ${c.shotClockDurationSeconds}`,
    };
  }

  // bonusThreshold: [1, 10]
  if (
    typeof c.bonusThreshold !== 'number' ||
    !Number.isInteger(c.bonusThreshold) ||
    c.bonusThreshold < 1 ||
    c.bonusThreshold > 10
  ) {
    return {
      valid: false,
      error: `bonusThreshold must be an integer in [1, 10], got ${c.bonusThreshold}`,
    };
  }

  // fullTimeoutsPerTeam: [0, 10]
  if (
    typeof c.fullTimeoutsPerTeam !== 'number' ||
    !Number.isInteger(c.fullTimeoutsPerTeam) ||
    c.fullTimeoutsPerTeam < 0 ||
    c.fullTimeoutsPerTeam > 10
  ) {
    return {
      valid: false,
      error: `fullTimeoutsPerTeam must be an integer in [0, 10], got ${c.fullTimeoutsPerTeam}`,
    };
  }

  // twentySecTimeoutsPerTeam: [0, 10]
  if (
    typeof c.twentySecTimeoutsPerTeam !== 'number' ||
    !Number.isInteger(c.twentySecTimeoutsPerTeam) ||
    c.twentySecTimeoutsPerTeam < 0 ||
    c.twentySecTimeoutsPerTeam > 10
  ) {
    return {
      valid: false,
      error: `twentySecTimeoutsPerTeam must be an integer in [0, 10], got ${c.twentySecTimeoutsPerTeam}`,
    };
  }

  return { valid: true };
}

/**
 * Validates a preset name: 1–30 chars, non-whitespace-only.
 */
export function validatePresetName(name: string): ValidationResult {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Preset name must be a string' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Preset name must not be empty or whitespace-only' };
  }
  if (name.length > 30) {
    return { valid: false, error: 'Preset name must be 30 characters or fewer' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

const BUILT_IN_NAMES = new Set(['NBA Rules', 'FIBA Rules']);

const BUILT_IN_PRESETS: Preset[] = [
  {
    name: 'NBA Rules',
    config: { ...NBA_RULES },
    builtIn: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    name: 'FIBA Rules',
    config: { ...FIBA_RULES },
    builtIn: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// electron-store schema
// ---------------------------------------------------------------------------

interface StoreSchema {
  presets: Preset[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a PresetStore backed by electron-store.
 *
 * @param controlPanelWindow - optional reference to the Control Panel window
 *   used to send IPC error events for corrupted presets. Pass null/undefined
 *   in unit tests where Electron is not available.
 */
export function createPresetStore(
  controlPanelWindow?: BrowserWindow | null
): PresetStore {
  const store = new Store<StoreSchema>({
    name: 'presets',
    defaults: { presets: [] },
  });

  /**
   * Sends a PRESET_CORRUPTED event to the Control Panel window if available.
   */
  function notifyCorrupted(name: string): void {
    if (
      controlPanelWindow &&
      !controlPanelWindow.isDestroyed() &&
      controlPanelWindow.webContents
    ) {
      controlPanelWindow.webContents.send(SCOREBOARD_EVENT, {
        type: 'PRESET_CORRUPTED',
        name,
      });
    }
  }

  return {
    /**
     * Returns all presets: built-ins first, then valid user presets.
     * Corrupted user presets are removed from the store and an IPC event
     * is sent to the Control Panel.
     */
    list(): Preset[] {
      const raw = store.get('presets', []);
      const valid: Preset[] = [];
      const corrupted: Preset[] = [];

      for (const preset of raw) {
        // A stored preset must have a name and a config object
        if (!preset || typeof preset.name !== 'string') {
          console.error('[PresetStore] Corrupted preset (missing name):', preset);
          notifyCorrupted(String((preset as Record<string, unknown>)?.name ?? 'unknown'));
          corrupted.push(preset);
          continue;
        }

        const result = validateGameConfig(preset.config);
        if (!result.valid) {
          console.error(
            `[PresetStore] Corrupted preset "${preset.name}": ${result.error}`
          );
          notifyCorrupted(preset.name);
          corrupted.push(preset);
        } else {
          valid.push(preset);
        }
      }

      // Persist cleaned list if any corrupted entries were found
      if (corrupted.length > 0) {
        store.set('presets', valid);
      }

      return [...BUILT_IN_PRESETS, ...valid];
    },

    /**
     * Returns the GameConfig for the named preset.
     * Checks built-ins first, then user presets.
     * Throws an Error if no preset with the given name exists.
     */
    load(name: string): GameConfig {
      // Check built-ins first
      const builtIn = BUILT_IN_PRESETS.find((p) => p.name === name);
      if (builtIn) {
        return { ...builtIn.config };
      }

      // Check user presets
      const userPresets = store.get('presets', []);
      const found = userPresets.find((p) => p.name === name);
      if (!found) {
        throw new Error(`Preset "${name}" not found`);
      }

      const result = validateGameConfig(found.config);
      if (!result.valid) {
        throw new Error(
          `Preset "${name}" has an invalid config: ${result.error}`
        );
      }

      return { ...found.config };
    },

    /**
     * Saves a user preset with the given name and config.
     * Validates name (1–30 chars, non-whitespace-only).
     * If a user preset with the same name exists, it is overwritten.
     * Built-in presets cannot be overwritten (throws an error).
     * Validates the config before saving.
     */
    save(name: string, config: GameConfig): void {
      const nameResult = validatePresetName(name);
      if (!nameResult.valid) {
        throw new Error(`Invalid preset name: ${nameResult.error}`);
      }

      if (BUILT_IN_NAMES.has(name)) {
        throw new Error(
          `Cannot save over built-in preset "${name}". Choose a different name.`
        );
      }

      const configResult = validateGameConfig(config);
      if (!configResult.valid) {
        throw new Error(`Invalid game config: ${configResult.error}`);
      }

      const userPresets = store.get('presets', []);
      const existingIndex = userPresets.findIndex((p) => p.name === name);

      const newPreset: Preset = {
        name,
        config: { ...config },
        builtIn: false,
        createdAt: existingIndex >= 0
          ? userPresets[existingIndex].createdAt  // preserve original creation date on overwrite
          : new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        userPresets[existingIndex] = newPreset;
      } else {
        userPresets.push(newPreset);
      }

      store.set('presets', userPresets);
    },

    /**
     * Deletes a user preset by name.
     * Throws if the named preset is a built-in.
     * Throws if no user preset with that name exists.
     */
    delete(name: string): void {
      if (BUILT_IN_NAMES.has(name)) {
        throw new Error(`Cannot delete built-in preset "${name}"`);
      }

      const userPresets = store.get('presets', []);
      const index = userPresets.findIndex((p) => p.name === name);

      if (index === -1) {
        throw new Error(`Preset "${name}" not found`);
      }

      userPresets.splice(index, 1);
      store.set('presets', userPresets);
    },

    /**
     * Returns true if the given name is a built-in preset name.
     */
    isBuiltIn(name: string): boolean {
      return BUILT_IN_NAMES.has(name);
    },
  };
}
