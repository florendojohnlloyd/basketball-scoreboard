/**
 * GameStore — pure reducer + undo stack + event log.
 *
 * CLOCK_TICK commands do NOT enter the undo stack.
 * All other undoable actions push the previous state.
 */

import type {
  GameState, CommandType, TeamState, ClockState,
  ShotClockState, PeriodState, Player, GameEvent, SubstitutionEntry,
} from '../shared/types';
import { DEFAULT_GAME_STATE } from '../shared/types';

const UNDO_LIMIT = 50;

// ---------------------------------------------------------------------------
// ID helper (no uuid dep)
// ---------------------------------------------------------------------------
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Event builder
// ---------------------------------------------------------------------------
function makeEvent(
  state: GameState,
  type: GameEvent['type'],
  opts: Partial<Omit<GameEvent, 'id' | 'timestamp' | 'clockMs' | 'period' | 'type'>> & { description: string }
): GameEvent {
  return {
    id: uid(),
    timestamp: new Date().toISOString(),
    clockMs: state.gameClock.displayMs,
    period: state.period.current,
    type,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function tickClock(clock: ClockState, delta: number): ClockState {
  if (!clock.running) return clock;
  const next = Math.max(0, clock.displayMs - delta);
  return { ...clock, displayMs: next, running: next > 0 };
}

function tickShotClock(clock: ShotClockState, delta: number): ShotClockState {
  if (!clock.running) return clock;
  const next = Math.max(0, clock.displayMs - delta);
  return { ...clock, displayMs: next, running: next > 0 };
}

function resetGameClock(clock: ClockState): ClockState {
  return { ...clock, running: false, displayMs: clock.configuredDurationMs };
}

function resetShotClock(clock: ShotClockState): ShotClockState {
  return { ...clock, running: false, displayMs: clock.configuredDurationSeconds * 1000 };
}

function clearFouls(team: TeamState): TeamState {
  return { ...team, fouls: 0, players: team.players.map(p => ({ ...p, fouls: 0, fouledOut: false })) };
}

// ---------------------------------------------------------------------------
// Pure Reducer
// ---------------------------------------------------------------------------
export function gameReducer(state: GameState, command: CommandType): GameState {
  switch (command.type) {

    // ── SCORE ──
    case 'ADD_SCORE': {
      const t = command.team;
      const ev = makeEvent(state, 'SCORE', {
        team: t, points: command.points,
        description: `${state[t].config.name} +${command.points}`,
      });
      return {
        ...state,
        [t]: { ...state[t], score: state[t].score + command.points },
        events: [...state.events, ev],
      };
    }
    case 'SUBTRACT_SCORE': {
      const t = command.team;
      return {
        ...state,
        [t]: { ...state[t], score: Math.max(0, state[t].score - 1) },
      };
    }

    // ── GAME CLOCK ──
    case 'START_GAME_CLOCK': {
      const newState = { ...state, gameClock: { ...state.gameClock, running: true } };
      if (state.gamePhase === 'pre-game') {
        const ev = makeEvent(newState, 'GAME_START', { description: 'Game started' });
        return { ...newState, gamePhase: 'in-game', events: [...state.events, ev] };
      }
      return newState;
    }
    case 'STOP_GAME_CLOCK':
      return { ...state, gameClock: { ...state.gameClock, running: false } };
    case 'RESET_GAME_CLOCK':
      return { ...state, gameClock: resetGameClock(state.gameClock) };
    case 'SET_GAME_CLOCK': {
      const { seconds } = command;
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) return state;
      return { ...state, gameClock: { ...state.gameClock, displayMs: seconds * 1000 } };
    }

    // ── SHOT CLOCK ──
    case 'START_SHOT_CLOCK':
      return { ...state, shotClock: { ...state.shotClock, running: true } };
    case 'STOP_SHOT_CLOCK':
      return { ...state, shotClock: { ...state.shotClock, running: false } };
    case 'RESET_SHOT_CLOCK':
      return { ...state, shotClock: resetShotClock(state.shotClock) };
    case 'SET_SHOT_CLOCK_ENABLED':
      return { ...state, shotClock: { ...state.shotClock, enabled: command.enabled, running: false } };

    // ── CLOCK TICK (no undo) ──
    case 'CLOCK_TICK': {
      const { deltaMs } = command;
      return {
        ...state,
        gameClock: tickClock(state.gameClock, deltaMs),
        shotClock: tickShotClock(state.shotClock, deltaMs),
      };
    }

    // ── FOULS (team-level) ──
    case 'ADD_FOUL': {
      const t = command.team;
      const ev = makeEvent(state, 'FOUL', {
        team: t,
        description: `${state[t].config.name} team foul #${state[t].fouls + 1}`,
      });
      return {
        ...state,
        [t]: { ...state[t], fouls: state[t].fouls + 1 },
        events: [...state.events, ev],
      };
    }
    case 'SUBTRACT_FOUL': {
      const t = command.team;
      return {
        ...state,
        [t]: { ...state[t], fouls: Math.max(0, state[t].fouls - 1) },
      };
    }

    // ── TIMEOUTS ──
    case 'USE_TIMEOUT': {
      const { team, kind } = command;
      const ts = state[team];
      const { period, gameClock } = state;

      // ── Custom timeout rules ──
      const isOT = period.isOvertime;
      const isFirstHalf = !isOT && period.current <= 2;
      const isSecondHalf = !isOT && period.current >= 3;
      const isLast2MinQ4 = period.current === 4 && !isOT && gameClock.displayMs <= 120_000;

      // Determine max allowed for current phase
      const firstHalfMax = 2;
      const secondHalfMax = 3;
      const otMax = 1;
      const last2MinMax = 2; // max 2 timeouts in last 2 min of Q4

      const { firstHalfUsed, secondHalfUsed, overtimeUsed } = ts.timeouts;

      // Check if timeout is allowed
      if (kind === 'full') {
        if (isFirstHalf && firstHalfUsed >= firstHalfMax) return state; // blocked
        if (isSecondHalf && secondHalfUsed >= secondHalfMax) return state; // blocked
        if (isOT && overtimeUsed >= otMax) return state; // blocked
        if (isLast2MinQ4 && secondHalfUsed >= last2MinMax) return state; // last 2 min restriction
      }

      const field = kind === 'full' ? 'fullRemaining' : 'twentyRemaining';
      const max = kind === 'full' ? state.gameConfig.fullTimeoutsPerTeam : state.gameConfig.twentySecTimeoutsPerTeam;
      const next = clamp(ts.timeouts[field] - 1, 0, max);

      const newTimeouts: typeof ts.timeouts = {
        ...ts.timeouts,
        [field]: next,
        firstHalfUsed: isFirstHalf && kind === 'full' ? firstHalfUsed + 1 : firstHalfUsed,
        secondHalfUsed: isSecondHalf && kind === 'full' ? secondHalfUsed + 1 : secondHalfUsed,
        overtimeUsed: isOT && kind === 'full' ? overtimeUsed + 1 : overtimeUsed,
      };

      const ev = makeEvent(state, 'TIMEOUT', {
        team,
        description: `${ts.config.name} timeout — ${next} left`,
      });
      return {
        ...state,
        [team]: { ...ts, timeouts: newTimeouts },
        events: [...state.events, ev],
      };
    }
    case 'RESTORE_TIMEOUT': {
      const { team, kind } = command;
      const ts = state[team];
      const max = kind === 'full' ? state.gameConfig.fullTimeoutsPerTeam : state.gameConfig.twentySecTimeoutsPerTeam;
      const field = kind === 'full' ? 'fullRemaining' : 'twentyRemaining';
      const next = clamp(ts.timeouts[field] + 1, 0, max);
      return {
        ...state,
        [team]: { ...ts, timeouts: { ...ts.timeouts, [field]: next } },
      };
    }

    // ── PERIOD ──
    case 'ADVANCE_PERIOD': {
      const { period, gameConfig } = state;
      const gameClock: ClockState = { ...resetGameClock(state.gameClock) };
      const home = clearFouls(state.home);
      const away = clearFouls(state.away);
      let newPeriod: PeriodState;

      if (!period.isOvertime && period.current >= gameConfig.periodCount) {
        newPeriod = { ...period, current: period.current + 1, isOvertime: true, overtimeNumber: 1 };
        gameClock.configuredDurationMs = gameConfig.overtimeDurationMinutes * 60 * 1000;
        gameClock.displayMs = gameClock.configuredDurationMs;
      } else if (period.isOvertime) {
        newPeriod = { ...period, current: period.current + 1, overtimeNumber: period.overtimeNumber + 1 };
        gameClock.configuredDurationMs = gameConfig.overtimeDurationMinutes * 60 * 1000;
        gameClock.displayMs = gameClock.configuredDurationMs;
      } else {
        newPeriod = { ...period, current: period.current + 1 };
        gameClock.configuredDurationMs = gameConfig.periodDurationMinutes * 60 * 1000;
        gameClock.displayMs = gameClock.configuredDurationMs;
      }

      const ev = makeEvent(state, newPeriod.isOvertime && newPeriod.overtimeNumber === 1 ? 'OVERTIME_START' : 'PERIOD_START', {
        period: newPeriod.current,
        description: newPeriod.isOvertime ? `OT${newPeriod.overtimeNumber} starts` : `Q${newPeriod.current} starts`,
      });
      // Auto-capture period snapshot before advancing (Requirement 17)
      const stateBeforeAdvance = { ...state };
      const capturedSnap = gameReducer(stateBeforeAdvance, { type: 'CAPTURE_PERIOD_SNAPSHOT' });
      return {
        ...capturedSnap,
        period: newPeriod,
        gameClock,
        home: {
          ...clearFouls(capturedSnap.home),
          timeouts: {
            ...capturedSnap.home.timeouts,
            // Reset per-half counters at Q2→Q3 transition or at OT start
            ...(capturedSnap.period.current === 2 ? { secondHalfUsed: 0 } : {}),
            ...(newPeriod.isOvertime && newPeriod.overtimeNumber === 1 ? { overtimeUsed: 0 } : {}),
            // Refresh remaining based on phase
            fullRemaining: newPeriod.isOvertime
              ? 1
              : capturedSnap.period.current === 2
                ? 3  // entering second half: 3 timeouts available
                : capturedSnap.home.timeouts.fullRemaining,
          },
        },
        away: {
          ...clearFouls(capturedSnap.away),
          timeouts: {
            ...capturedSnap.away.timeouts,
            ...(capturedSnap.period.current === 2 ? { secondHalfUsed: 0 } : {}),
            ...(newPeriod.isOvertime && newPeriod.overtimeNumber === 1 ? { overtimeUsed: 0 } : {}),
            fullRemaining: newPeriod.isOvertime
              ? 1
              : capturedSnap.period.current === 2
                ? 3
                : capturedSnap.away.timeouts.fullRemaining,
          },
        },
        events: [...capturedSnap.events, ev],
      };
    }

    // ── TEAM CONFIG ──
    case 'SET_TEAM_CONFIG': {
      const { team, config } = command;
      return {
        ...state,
        [team]: { ...state[team], config: { ...state[team].config, ...config } },
      };
    }

    // ── POSSESSION ──
    case 'SET_POSSESSION': {
      const ev = makeEvent(state, 'POSSESSION_CHANGE', {
        team: command.team ?? undefined,
        description: command.team ? `Possession → ${state[command.team].config.name}` : 'Possession cleared',
      });
      return { ...state, possession: command.team, events: [...state.events, ev] };
    }

    // ── PRESET / NEW GAME ──
    case 'LOAD_PRESET': {
      const { preset } = command;
      const durationMs = preset.periodDurationMinutes * 60 * 1000;
      return {
        ...state,
        gameConfig: { ...preset },
        gameClock: { displayMs: durationMs, running: false, configuredDurationMs: durationMs },
        shotClock: { ...state.shotClock, displayMs: preset.shotClockDurationSeconds * 1000, running: false, configuredDurationSeconds: preset.shotClockDurationSeconds },
        home: { ...state.home, timeouts: { fullRemaining: preset.fullTimeoutsPerTeam, twentyRemaining: preset.twentySecTimeoutsPerTeam, firstHalfUsed: 0, secondHalfUsed: 0, overtimeUsed: 0 } },
        away: { ...state.away, timeouts: { fullRemaining: preset.fullTimeoutsPerTeam, twentyRemaining: preset.twentySecTimeoutsPerTeam, firstHalfUsed: 0, secondHalfUsed: 0, overtimeUsed: 0 } },
      };
    }

    case 'NEW_GAME': {
      const { clearTeams } = command;
      const cfg = state.gameConfig;
      const dur = cfg.periodDurationMinutes * 60 * 1000;
      const resetTeam = (t: TeamState): TeamState => ({
        config: clearTeams ? { name: t.config.name, color: t.config.color, logoPath: null, playerImagePath: null } : { ...t.config },
        score: 0, fouls: 0, turnovers: 0,
        timeouts: { fullRemaining: cfg.fullTimeoutsPerTeam, twentyRemaining: cfg.twentySecTimeoutsPerTeam, firstHalfUsed: 0, secondHalfUsed: 0, overtimeUsed: 0 },
        players: clearTeams ? [] : t.players.map(p => ({
          ...p,
          fouls: 0, points: 0, rebounds: 0, assists: 0,
          steals: 0, blocks: 0, fga: 0, fgm: 0,
          fouledOut: false, active: true,
        })),
      });
      const ev = makeEvent(state, 'GAME_RESET', { description: 'Game reset' });
      return {
        ...state,
        gamePhase: 'pre-game',
        home: resetTeam(state.home),
        away: resetTeam(state.away),
        gameClock: { displayMs: dur, running: false, configuredDurationMs: dur },
        shotClock: { displayMs: cfg.shotClockDurationSeconds * 1000, running: false, configuredDurationSeconds: cfg.shotClockDurationSeconds, enabled: state.shotClock.enabled },
        period: { current: 1, format: state.period.format, isOvertime: false, overtimeNumber: 0 },
        possession: null,
        events: [...state.events, ev],
        periodSnapshots: [],
      };
    }

    // ── VOLUME ──
    case 'SET_VOLUME': {
      const { level } = command;
      if (level < 0 || level > 1) return state;
      return { ...state, volume: level };
    }

    // ── PLAYERS ──
    case 'ADD_PLAYER': {
      const { team, player } = command;
      return { ...state, [team]: { ...state[team], players: [...state[team].players, player] } };
    }
    case 'REMOVE_PLAYER': {
      const { team, playerId } = command;
      return { ...state, [team]: { ...state[team], players: state[team].players.filter(p => p.id !== playerId) } };
    }

    case 'ADD_PLAYER_FOUL': {
      const { team, playerId } = command;
      const ts = state[team];
      const limit = state.gameConfig.foulOutLimit;
      let foulOut = false;
      const players = ts.players.map((p): Player => {
        if (p.id !== playerId) return p;
        const newFouls = p.fouls + 1;
        foulOut = newFouls >= limit && !p.fouledOut;
        return { ...p, fouls: newFouls, active: newFouls >= limit ? false : p.active, fouledOut: newFouls >= limit };
      });
      const player = players.find(p => p.id === playerId);
      const events = [...state.events];
      events.push(makeEvent(state, 'PLAYER_FOUL', {
        team, playerId,
        playerName: player?.name,
        description: `${player?.name ?? '?'} foul #${player?.fouls ?? '?'}`,
      }));
      if (foulOut && player) {
        events.push(makeEvent(state, 'PLAYER_FOUL_OUT', {
          team, playerId,
          playerName: player.name,
          description: `⚠️ ${player.name} FOULED OUT`,
        }));
      }
      return {
        ...state,
        [team]: { ...ts, players, fouls: ts.fouls + 1 },
        events,
      };
    }

    case 'SUBTRACT_PLAYER_FOUL': {
      const { team, playerId } = command;
      const ts = state[team];
      const limit = state.gameConfig.foulOutLimit;
      const players = ts.players.map((p): Player => {
        if (p.id !== playerId) return p;
        const newFouls = Math.max(0, p.fouls - 1);
        return { ...p, fouls: newFouls, fouledOut: newFouls >= limit, active: newFouls < limit ? true : p.active };
      });
      return { ...state, [team]: { ...ts, players, fouls: Math.max(0, ts.fouls - 1) } };
    }

    case 'ADD_PLAYER_POINTS': {
      const { team, playerId, points } = command;
      const ts = state[team];
      const players = ts.players.map((p): Player =>
        p.id === playerId ? { ...p, points: p.points + points } : p
      );
      const player = players.find(p => p.id === playerId);
      const ev = makeEvent(state, 'SCORE', {
        team, playerId, points, playerName: player?.name,
        description: `${player?.name ?? '?'} +${points} pts`,
      });
      return {
        ...state,
        [team]: { ...ts, players, score: ts.score + points },
        events: [...state.events, ev],
      };
    }

    case 'ADD_PLAYER_REBOUND': {
      const { team, playerId } = command;
      const ts = state[team];
      const players = ts.players.map((p): Player =>
        p.id === playerId ? { ...p, rebounds: p.rebounds + 1 } : p
      );
      const player = players.find(p => p.id === playerId);
      const ev = makeEvent(state, 'REBOUND', {
        team, playerId, playerName: player?.name,
        description: `${player?.name ?? '?'} +REB`,
      });
      return { ...state, [team]: { ...ts, players }, events: [...state.events, ev] };
    }

    case 'ADD_PLAYER_ASSIST': {
      const { team, playerId } = command;
      const ts = state[team];
      const players = ts.players.map((p): Player =>
        p.id === playerId ? { ...p, assists: p.assists + 1 } : p
      );
      const player = players.find(p => p.id === playerId);
      const ev = makeEvent(state, 'ASSIST', {
        team, playerId, playerName: player?.name,
        description: `${player?.name ?? '?'} +AST`,
      });
      return { ...state, [team]: { ...ts, players }, events: [...state.events, ev] };
    }

    case 'UPDATE_PLAYER_NAME': {
      const { team, playerId, name } = command;
      const players = state[team].players.map(p => p.id === playerId ? { ...p, name } : p);
      return { ...state, [team]: { ...state[team], players } };
    }

    case 'UPDATE_PLAYER_NUMBER': {
      const { team, playerId, number } = command;
      const players = state[team].players.map(p => p.id === playerId ? { ...p, number } : p);
      return { ...state, [team]: { ...state[team], players } };
    }

    case 'TOGGLE_PLAYER_ACTIVE': {
      const { team, playerId } = command;
      const ts = state[team];
      const players = ts.players.map((p): Player => {
        if (p.id !== playerId) return p;
        const newActive = !p.active;
        const entry: SubstitutionEntry = {
          clockMs: state.gameClock.displayMs,
          period: state.period.current,
          active: newActive,
        };
        return { ...p, active: newActive, substitutions: [...(p.substitutions || []), entry] };
      });
      const player = players.find(p => p.id === playerId);
      const ev = makeEvent(state, 'SUBSTITUTION', {
        team, playerId, playerName: player?.name,
        description: `${player?.name ?? '?'} ${player?.active ? 'subbed IN' : 'subbed OUT'}`,
      });
      return { ...state, [team]: { ...ts, players }, events: [...state.events, ev] };
    }

    case 'SWITCH_SIDES':
      return { ...state, home: state.away, away: state.home };

    // ── Extended Player Stats (Requirement 13) ──
    case 'ADD_PLAYER_STAT': {
      const { team, playerId, stat } = command;
      const ts = state[team];
      const players = ts.players.map((p): Player => {
        if (p.id !== playerId) return p;
        if (stat === 'fgm') {
          // FGM increment also atomically increments FGA
          return { ...p, fgm: p.fgm + 1, fga: p.fga + 1 };
        }
        return { ...p, [stat]: (p[stat] as number) + 1 };
      });
      return { ...state, [team]: { ...ts, players } };
    }

    case 'SUBTRACT_PLAYER_STAT': {
      const { team, playerId, stat } = command;
      const ts = state[team];
      const players = ts.players.map((p): Player => {
        if (p.id !== playerId) return p;
        if (stat === 'fgm') {
          // FGM decrement also decrements FGA, both floored at 0,
          // and ensures FGM never exceeds FGA after decrement.
          const newFgm = Math.max(0, p.fgm - 1);
          const newFga = Math.max(newFgm, Math.max(0, p.fga - 1));
          return { ...p, fgm: newFgm, fga: newFga };
        }
        return { ...p, [stat]: Math.max(0, (p[stat] as number) - 1) };
      });
      return { ...state, [team]: { ...ts, players } };
    }

    // ── Team Turnovers (Requirement 14) ──
    case 'ADD_TURNOVER': {
      const t = command.team;
      return {
        ...state,
        [t]: { ...state[t], turnovers: (state[t].turnovers ?? 0) + 1 },
      };
    }
    case 'SUBTRACT_TURNOVER': {
      const t = command.team;
      return {
        ...state,
        [t]: { ...state[t], turnovers: Math.max(0, (state[t].turnovers ?? 0) - 1) },
      };
    }

    // ── Timeout Countdown ──
    case 'START_TIMEOUT': {
      const durationMs = state.gameConfig.timeoutDurationSeconds * 1000;
      return {
        ...state,
        timeout: { team: command.team, remainingMs: durationMs, running: true },
        gameClock: { ...state.gameClock, running: false },
        shotClock: { ...state.shotClock, running: false },
      };
    }

    case 'TIMEOUT_TICK': {
      if (!state.timeout || !state.timeout.running) return state;
      const next = Math.max(0, state.timeout.remainingMs - command.deltaMs);
      return {
        ...state,
        timeout: { ...state.timeout, remainingMs: next, running: next > 0 },
      };
    }

    case 'END_TIMEOUT':
      return { ...state, timeout: null };

    case 'SET_SPONSOR_LOGOS':
      return { ...state, sponsorLogos: command.logos };

    case 'LOAD_LIGA_TEAMS': {
      const { home, away, ligaId, ligaName } = command;
      return {
        ...state,
        ligaId,
        ligaName,
        home: {
          ...state.home,
          config: home.config,
          players: home.players,
          score: 0,
          fouls: 0,
          turnovers: 0,
          timeouts: { fullRemaining: state.gameConfig.fullTimeoutsPerTeam, twentyRemaining: state.gameConfig.twentySecTimeoutsPerTeam, firstHalfUsed: 0, secondHalfUsed: 0, overtimeUsed: 0 },
        },
        away: {
          ...state.away,
          config: away.config,
          players: away.players,
          score: 0,
          fouls: 0,
          turnovers: 0,
          timeouts: { fullRemaining: state.gameConfig.fullTimeoutsPerTeam, twentyRemaining: state.gameConfig.twentySecTimeoutsPerTeam, firstHalfUsed: 0, secondHalfUsed: 0, overtimeUsed: 0 },
        },
      };
    }

    // ── Period Snapshot (Requirement 17) ──
    case 'CAPTURE_PERIOD_SNAPSHOT': {
      const currentPeriod = state.period.current;
      const homeSnap = {
        period: currentPeriod,
        teamId: 'home' as const,
        playerSnapshots: state.home.players.map(p => ({
          points: p.points,
          rebounds: p.rebounds,
          assists: p.assists,
          steals: p.steals,
          blocks: p.blocks,
          fga: p.fga,
          fgm: p.fgm,
          fouls: p.fouls,
          active: p.active,
          jerseyNumber: p.number || null,
          photoPath: p.photoPath ?? null,
          minutesPlayed: p.minutesPlayed,
          substitutions: p.substitutions,
        })),
      };
      const awaySnap = {
        period: currentPeriod,
        teamId: 'away' as const,
        playerSnapshots: state.away.players.map(p => ({
          points: p.points,
          rebounds: p.rebounds,
          assists: p.assists,
          steals: p.steals,
          blocks: p.blocks,
          fga: p.fga,
          fgm: p.fgm,
          fouls: p.fouls,
          active: p.active,
          jerseyNumber: p.number || null,
          photoPath: p.photoPath ?? null,
          minutesPlayed: p.minutesPlayed,
          substitutions: p.substitutions,
        })),
      };
      const existing = (state.periodSnapshots ?? []).filter(
        s => s.period !== currentPeriod
      );
      return {
        ...state,
        periodSnapshots: [...existing, homeSnap, awaySnap],
      };
    }

    // ── Player Photo (Requirement 16) ──
    case 'ASSIGN_PLAYER_PHOTO': {
      const { team, playerId, photoPath } = command;
      const ts = state[team];
      const players = ts.players.map((p): Player =>
        p.id === playerId ? { ...p, photoPath } : p
      );
      return { ...state, [team]: { ...ts, players } };
    }

    case 'TOGGLE_SHOW_PHOTOS_ON_SCOREBOARD':
      return { ...state, showPhotosOnScoreboard: command.enabled };

    case 'UNDO':
      // Handled at the store level, not in reducer
      return state;

    default: {
      const _exhaustive: never = command;
      void _exhaustive;
      return state;
    }
  }
}

// ---------------------------------------------------------------------------
// GameStore with undo stack
// ---------------------------------------------------------------------------

export interface GameStore {
  dispatch(command: CommandType): GameState;
  getState(): GameState;
  canUndo(): boolean;
  getUndoDescription(): string | null;
}

/** Commands that should NOT be pushed to the undo stack */
const NO_UNDO = new Set<CommandType['type']>([
  'CLOCK_TICK', 'TIMEOUT_TICK', 'START_TIMEOUT', 'END_TIMEOUT',
  'START_GAME_CLOCK', 'STOP_GAME_CLOCK',
  'START_SHOT_CLOCK', 'STOP_SHOT_CLOCK', 'SET_VOLUME',
  'SET_SPONSOR_LOGOS',
]);

export function createGameStore(initialState?: GameState): GameStore {
  let state: GameState = initialState ?? DEFAULT_GAME_STATE();
  const undoStack: Array<{ state: GameState; description: string }> = [];

  function pushUndo(prevState: GameState, cmd: CommandType): void {
    if (NO_UNDO.has(cmd.type)) return;
    undoStack.push({ state: prevState, description: cmd.type });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }

  return {
    dispatch(command: CommandType): GameState {
      if (command.type === 'UNDO') {
        const prev = undoStack.pop();
        if (prev) {
          const undoEv: GameEvent = {
            id: uid(),
            timestamp: new Date().toISOString(),
            clockMs: state.gameClock.displayMs,
            period: state.period.current,
            type: 'UNDO',
            description: `Undid: ${prev.description}`,
          };
          state = { ...prev.state, events: [...prev.state.events, undoEv] };
        }
        return state;
      }
      const prevState = state;
      state = gameReducer(state, command);
      if (state !== prevState) pushUndo(prevState, command);
      return state;
    },
    getState(): GameState { return state; },
    canUndo(): boolean { return undoStack.length > 0; },
    getUndoDescription(): string | null {
      const top = undoStack[undoStack.length - 1];
      return top ? top.description : null;
    },
  };
}
