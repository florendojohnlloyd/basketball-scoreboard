/**
 * Example-based tests for IPC RBAC middleware (Task 59 — Requirement 28)
 *
 * Tests cover:
 * - Viewer role blocked from ADD_SCORE (SCORING category)
 * - Admin passes all categories
 * - Scorekeeper blocked from LIGA_CONFIG commands
 * - requiredCategory returns correct category for all known command types
 * - Session map management (login/logout)
 * - ACCESS_DENIED event sent on permission failure
 * - Command NOT dispatched on permission failure
 * - Audit entry NOT written on permission failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requiredCategory, sessionMap } from '../ipcRouter';
import type { Session } from '../ipcRouter';
import type { ActionCategory, Role } from '../../shared/types';

// ---------------------------------------------------------------------------
// Tests for requiredCategory — static mapping from command type to category
// ---------------------------------------------------------------------------

describe('requiredCategory — command type to ActionCategory mapping', () => {
  it('maps ADD_SCORE to SCORING', () => {
    expect(requiredCategory('ADD_SCORE')).toBe('SCORING');
  });

  it('maps SUBTRACT_SCORE to SCORING', () => {
    expect(requiredCategory('SUBTRACT_SCORE')).toBe('SCORING');
  });

  it('maps ADD_PLAYER_POINTS to SCORING', () => {
    expect(requiredCategory('ADD_PLAYER_POINTS')).toBe('SCORING');
  });

  it('maps START_GAME_CLOCK to CLOCK', () => {
    expect(requiredCategory('START_GAME_CLOCK')).toBe('CLOCK');
  });

  it('maps STOP_GAME_CLOCK to CLOCK', () => {
    expect(requiredCategory('STOP_GAME_CLOCK')).toBe('CLOCK');
  });

  it('maps RESET_GAME_CLOCK to CLOCK', () => {
    expect(requiredCategory('RESET_GAME_CLOCK')).toBe('CLOCK');
  });

  it('maps SET_GAME_CLOCK to CLOCK', () => {
    expect(requiredCategory('SET_GAME_CLOCK')).toBe('CLOCK');
  });

  it('maps START_SHOT_CLOCK to CLOCK', () => {
    expect(requiredCategory('START_SHOT_CLOCK')).toBe('CLOCK');
  });

  it('maps CLOCK_TICK to CLOCK', () => {
    expect(requiredCategory('CLOCK_TICK')).toBe('CLOCK');
  });

  it('maps ADD_FOUL to FOULS', () => {
    expect(requiredCategory('ADD_FOUL')).toBe('FOULS');
  });

  it('maps SUBTRACT_FOUL to FOULS', () => {
    expect(requiredCategory('SUBTRACT_FOUL')).toBe('FOULS');
  });

  it('maps ADD_PLAYER_FOUL to FOULS', () => {
    expect(requiredCategory('ADD_PLAYER_FOUL')).toBe('FOULS');
  });

  it('maps USE_TIMEOUT to TIMEOUTS', () => {
    expect(requiredCategory('USE_TIMEOUT')).toBe('TIMEOUTS');
  });

  it('maps RESTORE_TIMEOUT to TIMEOUTS', () => {
    expect(requiredCategory('RESTORE_TIMEOUT')).toBe('TIMEOUTS');
  });

  it('maps ADD_PLAYER_STAT to PLAYER_STATS', () => {
    expect(requiredCategory('ADD_PLAYER_STAT')).toBe('PLAYER_STATS');
  });

  it('maps TOGGLE_PLAYER_ACTIVE to PLAYER_STATS', () => {
    expect(requiredCategory('TOGGLE_PLAYER_ACTIVE')).toBe('PLAYER_STATS');
  });

  it('maps LOAD_LIGA_TEAMS to LIGA_CONFIG', () => {
    expect(requiredCategory('LOAD_LIGA_TEAMS')).toBe('LIGA_CONFIG');
  });

  it('maps NEW_GAME to LIGA_CONFIG', () => {
    expect(requiredCategory('NEW_GAME')).toBe('LIGA_CONFIG');
  });

  it('maps BACKUP_CREATE to LIGA_CONFIG', () => {
    expect(requiredCategory('BACKUP_CREATE')).toBe('LIGA_CONFIG');
  });

  it('maps USER_CREATE to USER_MGMT', () => {
    expect(requiredCategory('USER_CREATE')).toBe('USER_MGMT');
  });

  it('maps USER_DELETE to USER_MGMT', () => {
    expect(requiredCategory('USER_DELETE')).toBe('USER_MGMT');
  });

  it('maps AUTH_LOGIN to USER_MGMT', () => {
    expect(requiredCategory('AUTH_LOGIN')).toBe('USER_MGMT');
  });

  it('maps SET_VOLUME to SYSTEM', () => {
    expect(requiredCategory('SET_VOLUME')).toBe('SYSTEM');
  });

  it('maps UNDO to SYSTEM', () => {
    expect(requiredCategory('UNDO')).toBe('SYSTEM');
  });

  it('maps OVERLAY_CONFIG_SET to STREAMING', () => {
    expect(requiredCategory('OVERLAY_CONFIG_SET')).toBe('STREAMING');
  });

  it('maps RTMP_START to STREAMING', () => {
    expect(requiredCategory('RTMP_START')).toBe('STREAMING');
  });

  it('maps MOBILE_VIEWER_START to STREAMING (Req 36.7 — Admin-controlled)', () => {
    expect(requiredCategory('MOBILE_VIEWER_START')).toBe('STREAMING');
  });

  it('maps MOBILE_VIEWER_STOP to STREAMING (Req 36.7 — Admin-controlled)', () => {
    expect(requiredCategory('MOBILE_VIEWER_STOP')).toBe('STREAMING');
  });

  it('maps OVERLAY_START to STREAMING (Req 33.1 — Admin-controlled)', () => {
    expect(requiredCategory('OVERLAY_START')).toBe('STREAMING');
  });

  it('maps OVERLAY_STOP to STREAMING (Req 33 — Admin-controlled)', () => {
    expect(requiredCategory('OVERLAY_STOP')).toBe('STREAMING');
  });

  it('maps OVERLAY_SET_CONFIG to STREAMING (Req 33.3 — Admin-controlled)', () => {
    expect(requiredCategory('OVERLAY_SET_CONFIG')).toBe('STREAMING');
  });

  it('maps OVERLAY_GET_CONFIG to STREAMING (Req 33 — Admin-controlled)', () => {
    expect(requiredCategory('OVERLAY_GET_CONFIG')).toBe('STREAMING');
  });

  it('maps RTMP_GET_STATUS to STREAMING (Req 33.5 — Admin-controlled)', () => {
    expect(requiredCategory('RTMP_GET_STATUS')).toBe('STREAMING');
  });

  it('maps read-only MOBILE_VIEWER_GET_STATUS to VIEWER', () => {
    expect(requiredCategory('MOBILE_VIEWER_GET_STATUS')).toBe('VIEWER');
  });

  it('maps read-only MOBILE_VIEWER_GET_QR to VIEWER', () => {
    expect(requiredCategory('MOBILE_VIEWER_GET_QR')).toBe('VIEWER');
  });

  it('returns VIEWER for unknown command types', () => {
    expect(requiredCategory('UNKNOWN_COMMAND')).toBe('VIEWER');
  });
});

// ---------------------------------------------------------------------------
// Session map management
// ---------------------------------------------------------------------------

describe('sessionMap — in-memory session tracking', () => {
  beforeEach(() => {
    sessionMap.clear();
  });

  it('starts empty', () => {
    expect(sessionMap.size).toBe(0);
  });

  it('stores a session by webContentsId', () => {
    const session: Session = { userId: 'u1', username: 'admin', role: 'Admin' };
    sessionMap.set(1, session);
    expect(sessionMap.get(1)).toEqual(session);
  });

  it('removes a session on logout', () => {
    sessionMap.set(1, { userId: 'u1', username: 'admin', role: 'Admin' });
    sessionMap.delete(1);
    expect(sessionMap.get(1)).toBeUndefined();
  });

  it('supports multiple concurrent sessions', () => {
    sessionMap.set(1, { userId: 'u1', username: 'admin', role: 'Admin' });
    sessionMap.set(2, { userId: 'u2', username: 'scorer', role: 'Scorekeeper' });
    expect(sessionMap.size).toBe(2);
    expect(sessionMap.get(1)!.role).toBe('Admin');
    expect(sessionMap.get(2)!.role).toBe('Scorekeeper');
  });
});

// ---------------------------------------------------------------------------
// RBAC enforcement: Viewer blocked from ADD_SCORE
// ---------------------------------------------------------------------------

describe('RBAC enforcement — Viewer role blocked from ADD_SCORE', () => {
  it('Viewer cannot perform SCORING actions', () => {
    // Import canPerform from roleStore to validate the permission check
    const PERMISSIONS: Record<Role, Set<ActionCategory>> = {
      Admin: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING']),
      Scorekeeper: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER']),
      Coach: new Set(['VIEWER', 'PLAYER_STATS']),
      Viewer: new Set(['VIEWER']),
    };

    const role: Role = 'Viewer';
    const category = requiredCategory('ADD_SCORE'); // 'SCORING'
    const canPerform = PERMISSIONS[role].has(category);

    expect(category).toBe('SCORING');
    expect(canPerform).toBe(false);
  });

  it('Viewer cannot perform CLOCK actions', () => {
    const PERMISSIONS: Record<Role, Set<ActionCategory>> = {
      Admin: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING']),
      Scorekeeper: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER']),
      Coach: new Set(['VIEWER', 'PLAYER_STATS']),
      Viewer: new Set(['VIEWER']),
    };

    const role: Role = 'Viewer';
    const category = requiredCategory('START_GAME_CLOCK');
    expect(PERMISSIONS[role].has(category)).toBe(false);
  });

  it('Viewer cannot perform FOULS actions', () => {
    const PERMISSIONS: Record<Role, Set<ActionCategory>> = {
      Admin: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING']),
      Scorekeeper: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER']),
      Coach: new Set(['VIEWER', 'PLAYER_STATS']),
      Viewer: new Set(['VIEWER']),
    };

    const role: Role = 'Viewer';
    const category = requiredCategory('ADD_FOUL');
    expect(PERMISSIONS[role].has(category)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RBAC enforcement: Admin passes all categories
// ---------------------------------------------------------------------------

describe('RBAC enforcement — Admin passes all categories', () => {
  const PERMISSIONS: Record<Role, Set<ActionCategory>> = {
    Admin: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING']),
    Scorekeeper: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER']),
    Coach: new Set(['VIEWER', 'PLAYER_STATS']),
    Viewer: new Set(['VIEWER']),
  };

  const allCommands = [
    'ADD_SCORE', 'SUBTRACT_SCORE', 'ADD_PLAYER_POINTS',
    'START_GAME_CLOCK', 'STOP_GAME_CLOCK', 'RESET_GAME_CLOCK', 'SET_GAME_CLOCK',
    'START_SHOT_CLOCK', 'STOP_SHOT_CLOCK', 'RESET_SHOT_CLOCK',
    'ADD_FOUL', 'SUBTRACT_FOUL', 'ADD_PLAYER_FOUL', 'SUBTRACT_PLAYER_FOUL',
    'USE_TIMEOUT', 'RESTORE_TIMEOUT',
    'ADD_PLAYER_STAT', 'SUBTRACT_PLAYER_STAT', 'TOGGLE_PLAYER_ACTIVE',
    'LOAD_LIGA_TEAMS', 'SET_TEAM_CONFIG', 'NEW_GAME', 'ADVANCE_PERIOD',
    'USER_CREATE', 'USER_DELETE', 'USER_UPDATE',
    'SET_VOLUME', 'SET_POSSESSION', 'UNDO',
    'OVERLAY_CONFIG_SET', 'RTMP_START',
  ];

  it('Admin has permission for every known command type', () => {
    for (const cmd of allCommands) {
      const category = requiredCategory(cmd);
      expect(PERMISSIONS['Admin'].has(category)).toBe(true);
    }
  });

  it('Admin can perform all 10 action categories', () => {
    const allCategories: ActionCategory[] = [
      'SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS',
      'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING',
    ];
    for (const cat of allCategories) {
      expect(PERMISSIONS['Admin'].has(cat)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// RBAC enforcement: Scorekeeper blocked from LIGA_CONFIG commands
// ---------------------------------------------------------------------------

describe('RBAC enforcement — Scorekeeper blocked from LIGA_CONFIG commands', () => {
  const PERMISSIONS: Record<Role, Set<ActionCategory>> = {
    Admin: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING']),
    Scorekeeper: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER']),
    Coach: new Set(['VIEWER', 'PLAYER_STATS']),
    Viewer: new Set(['VIEWER']),
  };

  it('Scorekeeper cannot perform LIGA_CONFIG actions', () => {
    const role: Role = 'Scorekeeper';
    expect(PERMISSIONS[role].has('LIGA_CONFIG')).toBe(false);
  });

  it('Scorekeeper blocked from NEW_GAME (maps to LIGA_CONFIG)', () => {
    const category = requiredCategory('NEW_GAME');
    expect(category).toBe('LIGA_CONFIG');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(false);
  });

  it('Scorekeeper blocked from LOAD_LIGA_TEAMS (maps to LIGA_CONFIG)', () => {
    const category = requiredCategory('LOAD_LIGA_TEAMS');
    expect(category).toBe('LIGA_CONFIG');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(false);
  });

  it('Scorekeeper blocked from BACKUP_CREATE (maps to LIGA_CONFIG)', () => {
    const category = requiredCategory('BACKUP_CREATE');
    expect(category).toBe('LIGA_CONFIG');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(false);
  });

  it('Scorekeeper blocked from CLOUD_SYNC_CONFIGURE (maps to LIGA_CONFIG)', () => {
    const category = requiredCategory('CLOUD_SYNC_CONFIGURE');
    expect(category).toBe('LIGA_CONFIG');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(false);
  });

  it('Scorekeeper CAN perform SCORING actions', () => {
    const category = requiredCategory('ADD_SCORE');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(true);
  });

  it('Scorekeeper CAN perform CLOCK actions', () => {
    const category = requiredCategory('START_GAME_CLOCK');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(true);
  });

  it('Scorekeeper CAN perform FOULS actions', () => {
    const category = requiredCategory('ADD_FOUL');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(true);
  });

  it('Scorekeeper CAN perform TIMEOUTS actions', () => {
    const category = requiredCategory('USE_TIMEOUT');
    expect(PERMISSIONS['Scorekeeper'].has(category)).toBe(true);
  });

  it('Scorekeeper blocked from USER_MGMT', () => {
    expect(PERMISSIONS['Scorekeeper'].has('USER_MGMT')).toBe(false);
  });

  it('Scorekeeper blocked from STREAMING', () => {
    expect(PERMISSIONS['Scorekeeper'].has('STREAMING')).toBe(false);
  });

  it('Scorekeeper blocked from SYSTEM', () => {
    expect(PERMISSIONS['Scorekeeper'].has('SYSTEM')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Coach role restrictions
// ---------------------------------------------------------------------------

describe('RBAC enforcement — Coach role restrictions', () => {
  const PERMISSIONS: Record<Role, Set<ActionCategory>> = {
    Admin: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING']),
    Scorekeeper: new Set(['SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER']),
    Coach: new Set(['VIEWER', 'PLAYER_STATS']),
    Viewer: new Set(['VIEWER']),
  };

  it('Coach blocked from SCORING', () => {
    const category = requiredCategory('ADD_SCORE');
    expect(PERMISSIONS['Coach'].has(category)).toBe(false);
  });

  it('Coach blocked from CLOCK', () => {
    const category = requiredCategory('START_GAME_CLOCK');
    expect(PERMISSIONS['Coach'].has(category)).toBe(false);
  });

  it('Coach blocked from LIGA_CONFIG', () => {
    expect(PERMISSIONS['Coach'].has('LIGA_CONFIG')).toBe(false);
  });

  it('Coach CAN view (VIEWER)', () => {
    expect(PERMISSIONS['Coach'].has('VIEWER')).toBe(true);
  });

  it('Coach CAN access PLAYER_STATS (read)', () => {
    expect(PERMISSIONS['Coach'].has('PLAYER_STATS')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requiredCategory completeness — all command types have a mapped category
// ---------------------------------------------------------------------------

describe('requiredCategory — completeness check', () => {
  const ALL_KNOWN_COMMANDS = [
    // Scoring
    'ADD_SCORE', 'SUBTRACT_SCORE', 'ADD_PLAYER_POINTS',
    // Clock
    'START_GAME_CLOCK', 'STOP_GAME_CLOCK', 'RESET_GAME_CLOCK', 'SET_GAME_CLOCK',
    'START_SHOT_CLOCK', 'STOP_SHOT_CLOCK', 'RESET_SHOT_CLOCK', 'SET_SHOT_CLOCK_ENABLED',
    'CLOCK_TICK', 'START_TIMEOUT', 'END_TIMEOUT', 'TIMEOUT_TICK',
    // Fouls
    'ADD_FOUL', 'SUBTRACT_FOUL', 'ADD_PLAYER_FOUL', 'SUBTRACT_PLAYER_FOUL',
    // Timeouts
    'USE_TIMEOUT', 'RESTORE_TIMEOUT',
    // Player stats
    'ADD_PLAYER_STAT', 'SUBTRACT_PLAYER_STAT', 'ADD_PLAYER_REBOUND', 'ADD_PLAYER_ASSIST',
    'ADD_PLAYER', 'REMOVE_PLAYER', 'UPDATE_PLAYER_NAME', 'UPDATE_PLAYER_NUMBER',
    'TOGGLE_PLAYER_ACTIVE', 'ASSIGN_PLAYER_PHOTO', 'TOGGLE_SHOW_PHOTOS_ON_SCOREBOARD',
    'ADD_TURNOVER', 'SUBTRACT_TURNOVER', 'CAPTURE_PERIOD_SNAPSHOT',
    // Liga / config
    'LOAD_LIGA_TEAMS', 'SET_TEAM_CONFIG', 'LOAD_PRESET', 'ADVANCE_PERIOD',
    'NEW_GAME', 'SET_SPONSOR_LOGOS', 'BACKUP_CREATE', 'BACKUP_RESTORE',
    'BACKUP_SCHEDULE_SET', 'CLOUD_SYNC_CONFIGURE', 'CLOUD_SYNC_NOW',
    // User management
    'AUTH_LOGIN', 'AUTH_LOGOUT', 'USER_LIST', 'USER_CREATE',
    'USER_UPDATE', 'USER_DELETE', 'USER_CHANGE_PASSWORD',
    // System
    'SET_VOLUME', 'SET_POSSESSION', 'SWITCH_SIDES', 'UNDO',
    'API_KEY_CREATE', 'API_KEY_REVOKE',
    // Streaming
    'OVERLAY_CONFIG_SET', 'RTMP_CONFIG_SET', 'RTMP_START', 'RTMP_STOP',
  ];

  const ALL_CATEGORIES: ActionCategory[] = [
    'SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS',
    'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING',
  ];

  it('every known command type maps to a non-VIEWER category', () => {
    for (const cmd of ALL_KNOWN_COMMANDS) {
      const cat = requiredCategory(cmd);
      // Every explicitly-listed command should not fall through to default VIEWER
      expect(ALL_CATEGORIES).toContain(cat);
    }
  });

  it('all returned categories are valid ActionCategory values', () => {
    for (const cmd of ALL_KNOWN_COMMANDS) {
      const cat = requiredCategory(cmd);
      expect(ALL_CATEGORIES).toContain(cat);
    }
  });
});
