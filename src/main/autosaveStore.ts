/**
 * AutosaveStore — debounced crash-recovery autosave.
 *
 * Writes full GameState to {userData}/data/autosave_current.json
 * every 10 seconds while a game is active.
 * On launch, main checks for existing autosave and prompts user.
 */

import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import type { GameState } from '../shared/types';

const DEBOUNCE_MS = 10_000; // write at most every 10 s

export interface AutosaveStore {
  /** Schedule a save. Debounced — only writes after DEBOUNCE_MS of silence. */
  schedule(state: GameState): void;
  /** Save immediately (e.g. on app close). */
  flush(state: GameState): void;
  /** Read the saved state. Returns null if none exists or is corrupt. */
  read(): GameState | null;
  /** Clear the autosave file (call on intentional game reset/new game). */
  clear(): void;
  dispose(): void;
}

function dataDir(): string {
  const dir = join(app.getPath('userData'), 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function savePath(): string {
  return join(dataDir(), 'autosave_current.json');
}

export function createAutosaveStore(): AutosaveStore {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function writeNow(state: GameState): void {
    try {
      writeFileSync(savePath(), JSON.stringify(state), 'utf-8');
    } catch (e) {
      console.error('[AutosaveStore] Failed to write autosave:', e);
    }
  }

  return {
    schedule(state: GameState): void {
      if (state.gamePhase !== 'in-game') return; // only save active games
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        writeNow(state);
        timer = null;
      }, DEBOUNCE_MS);
    },

    flush(state: GameState): void {
      if (timer) { clearTimeout(timer); timer = null; }
      if (state.gamePhase === 'in-game') writeNow(state);
    },

    read(): GameState | null {
      const path = savePath();
      if (!existsSync(path)) return null;
      try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(raw) as GameState;
        if (!parsed.gamePhase || !parsed.home || !parsed.away) return null;
        return parsed;
      } catch {
        return null;
      }
    },

    clear(): void {
      if (timer) { clearTimeout(timer); timer = null; }
      const path = savePath();
      if (existsSync(path)) {
        try { unlinkSync(path); } catch { /* ignore */ }
      }
    },

    dispose(): void {
      if (timer) { clearTimeout(timer); timer = null; }
    },
  };
}
