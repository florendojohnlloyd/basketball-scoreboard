import { create } from 'zustand'
import { DEFAULT_GAME_STATE, SCOREBOARD_STATE, SCOREBOARD_COMMAND, SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { GameState, CommandType, Role } from '@shared/types'

// ---------------------------------------------------------------------------
// Session types (Requirement 28)
// ---------------------------------------------------------------------------

export interface UserSession {
  id: string;
  username: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface ControlPanelStore {
  gameState: GameState
  setGameState: (state: GameState) => void
  session: UserSession | null
  setSession: (session: UserSession | null) => void
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export const useControlPanelStore = create<ControlPanelStore>((set) => ({
  gameState: DEFAULT_GAME_STATE(),
  setGameState: (state: GameState) => set({ gameState: state }),
  session: null,
  setSession: (session: UserSession | null) => set({ session }),
}))

// ---------------------------------------------------------------------------
// Derived selectors (Requirement 14)
// ---------------------------------------------------------------------------

/**
 * Returns the team field goal percentage as a number (0–100),
 * or null when total FGA across all players is 0 (avoid division-by-zero).
 */
export function teamFgPct(gameState: GameState, team: 'home' | 'away'): number | null {
  const players = gameState[team].players
  const totalFga = players.reduce((sum, p) => sum + (p.fga ?? 0), 0)
  const totalFgm = players.reduce((sum, p) => sum + (p.fgm ?? 0), 0)
  if (totalFga === 0) return null
  return (totalFgm / totalFga) * 100
}

/**
 * Returns the sum of all players' rebound counts for a team.
 */
export function teamRebounds(gameState: GameState, team: 'home' | 'away'): number {
  return gameState[team].players.reduce((sum, p) => sum + (p.rebounds ?? 0), 0)
}

// ---------------------------------------------------------------------------
// IPC subscription — subscribe to state snapshots from main process
// Wrapped in a DOMContentLoaded guard so contextBridge is ready.
// ---------------------------------------------------------------------------

function attachIpc(): void {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    // Listen for ongoing state broadcasts
    window.electron.ipcRenderer.on(SCOREBOARD_STATE, (rawState: unknown) => {
      useControlPanelStore.getState().setGameState(rawState as GameState)
    })

    // Listen for AUTH_STATE events (Requirement 28)
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, (rawEvent: unknown) => {
      const event = rawEvent as { type: string; user?: UserSession | null }
      if (event.type === 'AUTH_STATE') {
        useControlPanelStore.getState().setSession(event.user ?? null)
      }
    })

    // Request initial state snapshot from main process on load
    window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, { type: 'GET_STATE' })
      .then((state: unknown) => {
        if (state) useControlPanelStore.getState().setGameState(state as GameState)
      })
      .catch(() => {/* ignore if main not ready yet */})
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachIpc)
} else {
  attachIpc()
}

// ---------------------------------------------------------------------------
// Advanced Metrics helpers (Requirement 21)
// ---------------------------------------------------------------------------

/**
 * Compute the total game-clock minutes a player was active by pairing
 * substitution entries (active=true / active=false).
 *
 * Rules:
 *  - Walk the substitution log in order.
 *  - When we see active=true, note the entry clockMs as `startMs`.
 *  - When we see active=false after a start, compute elapsed = startMs − clockMs
 *    (clock counts DOWN, so start > stop means positive elapsed).
 *  - If the player is currently active (odd number of "in" entries), accumulate
 *    the open interval against the current clock value passed as `currentClockMs`.
 *
 * @returns minutes played as a floating-point number.
 */
export function computeMinutesPlayed(
  player: { active: boolean; substitutions: { clockMs: number; period: number; active: boolean }[] },
  currentClockMs: number,
): number {
  const subs = player.substitutions || []
  let totalMs = 0
  let startMs: number | null = null

  for (const entry of subs) {
    if (entry.active) {
      // Entering the court — record start time
      startMs = entry.clockMs
    } else {
      // Leaving the court — accumulate elapsed if we had a matching entry
      if (startMs !== null) {
        const elapsed = startMs - entry.clockMs
        totalMs += Math.max(0, elapsed)
        startMs = null
      }
    }
  }

  // If still active (open interval), count up to current clock value
  if (startMs !== null && player.active) {
    const elapsed = startMs - currentClockMs
    totalMs += Math.max(0, elapsed)
  }

  return totalMs / 60000 // milliseconds → minutes
}

/**
 * Compute plus/minus for a player: net score differential (team − opponent)
 * during all intervals the player was active.
 *
 * Uses the SCORE events' `clockMs` field (game-clock time when the event occurred)
 * and the player's substitution entries to determine whether the player was on
 * court when each scoring event happened.
 *
 * A player is considered "on court" between paired substitution entries where
 * active=true (entering) and active=false (exiting). If still active with no
 * exit entry, they are considered on court until the present (currentClockMs).
 */
export function computePlusMinus(
  player: { id: string; active: boolean; substitutions: { clockMs: number; period: number; active: boolean }[] },
  team: 'home' | 'away',
  gameState: GameState,
): number {
  const opponent: 'home' | 'away' = team === 'home' ? 'away' : 'home'
  const currentClockMs = gameState.gameClock.displayMs
  const currentPeriod = gameState.period.current

  // Build on-court intervals as { enterClockMs, enterPeriod, exitClockMs, exitPeriod }
  // Clock counts DOWN, so "between" means: period matches or later, clockMs <= enter and >= exit
  interface Interval {
    enterPeriod: number;
    enterClockMs: number;
    exitPeriod: number | null;
    exitClockMs: number | null;
  }
  const intervals: Interval[] = []
  let enterEntry: { clockMs: number; period: number } | null = null

  for (const sub of (player.substitutions || [])) {
    if (sub.active) {
      enterEntry = { clockMs: sub.clockMs, period: sub.period }
    } else {
      if (enterEntry !== null) {
        intervals.push({
          enterPeriod: enterEntry.period,
          enterClockMs: enterEntry.clockMs,
          exitPeriod: sub.period,
          exitClockMs: sub.clockMs,
        })
        enterEntry = null
      }
    }
  }

  // If player is still active — open interval ending at current clock
  if (enterEntry !== null && player.active) {
    intervals.push({
      enterPeriod: enterEntry.period,
      enterClockMs: enterEntry.clockMs,
      exitPeriod: currentPeriod,
      exitClockMs: currentClockMs,
    })
  }

  /**
   * Returns true if a game event's (period, clockMs) falls inside an on-court interval.
   * Clock counts down within a period, so inside means:
   *   - If same period as enter: clockMs <= enterClockMs
   *   - If same period as exit: clockMs >= exitClockMs (clock is lower, i.e. later in time)
   *   - If period between enter and exit: always inside
   */
  function isInsideInterval(evPeriod: number, evClockMs: number, interval: Interval): boolean {
    const { enterPeriod, enterClockMs, exitPeriod, exitClockMs } = interval
    const exitP = exitPeriod ?? currentPeriod
    const exitC = exitClockMs ?? currentClockMs

    if (evPeriod < enterPeriod || evPeriod > exitP) return false
    if (evPeriod === enterPeriod && evClockMs > enterClockMs) return false // before player entered
    if (evPeriod === exitP && evClockMs < exitC) return false              // after player exited
    return true
  }

  let plusMinus = 0
  for (const ev of gameState.events) {
    if (ev.type !== 'SCORE') continue
    const scoringTeam = ev.team as 'home' | 'away' | undefined
    if (!scoringTeam) continue
    const pts = (ev.points as number | undefined) ?? 0
    const inInterval = intervals.some(interval =>
      isInsideInterval(ev.period, ev.clockMs, interval)
    )
    if (inInterval) {
      if (scoringTeam === team) {
        plusMinus += pts
      } else if (scoringTeam === opponent) {
        plusMinus -= pts
      }
    }
  }

  return plusMinus
}

/**
 * Efficiency = PTS + REB + AST + STL + BLK − (FGA − FGM) − Fouls
 */
export function computeEfficiency(p: {
  points: number; rebounds: number; assists: number;
  steals: number; blocks: number; fga: number; fgm: number; fouls: number;
}): number {
  return p.points + p.rebounds + p.assists + p.steals + p.blocks
    - (p.fga - p.fgm) - p.fouls
}

/**
 * PEI = Efficiency ÷ minutesPlayed
 * Returns null when minutesPlayed = 0 (display "—").
 */
export function computePEI(player: {
  id: string; active: boolean;
  substitutions: { clockMs: number; period: number; active: boolean }[];
  points: number; rebounds: number; assists: number;
  steals: number; blocks: number; fga: number; fgm: number; fouls: number;
}, currentClockMs: number): number | null {
  const minutes = computeMinutesPlayed(player, currentClockMs)
  if (minutes === 0) return null
  return computeEfficiency(player) / minutes
}

// ---------------------------------------------------------------------------
// sendCommand — dispatch a command to the main process
// ---------------------------------------------------------------------------

export function sendCommand(command: CommandType): void {
  // Fire command via send (main process handles and broadcasts)
  window.electron.ipcRenderer.send(SCOREBOARD_COMMAND, command)
  // Also fetch state after a brief wait to guarantee UI update
  // Using two retries to handle any timing edge cases
  const refresh = (): void => {
    window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, { type: 'GET_STATE' })
      .then((state: unknown) => {
        if (state) useControlPanelStore.getState().setGameState(state as GameState)
      })
      .catch(() => {})
  }
  setTimeout(refresh, 16)
  setTimeout(refresh, 100)
}
