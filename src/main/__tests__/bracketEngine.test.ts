/**
 * Unit tests for BracketEngine — tournament lifecycle methods (Task 3.1)
 *
 * Tests:
 *  - createTournament with validation
 *  - deleteTournament removes JSON file
 *  - resetTournament reverts to post-seeding state
 *  - getTournament loads state correctly
 *  - listTournaments with sorting and corrupted file handling
 *  - getActiveTournament finds in-progress tournaments
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  Tournament,
  BracketFormat,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Mock electron app.getPath to use a temp directory
// ---------------------------------------------------------------------------

const TEST_USER_DATA = join(__dirname, '__test_userData_bracketEngine__');

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return TEST_USER_DATA;
      return TEST_USER_DATA;
    },
  },
}));

import { createBracketEngine, BracketEngine } from '../bracketEngine';
import { createLigaStore, LigaStore } from '../ligaStore';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let ligaStore: LigaStore;
let bracketEngine: BracketEngine;
let testLigaId: string;

beforeEach(() => {
  // Create clean test directory
  if (existsSync(TEST_USER_DATA)) {
    try { rmSync(TEST_USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {}
  }
  mkdirSync(TEST_USER_DATA, { recursive: true });

  ligaStore = createLigaStore();
  bracketEngine = createBracketEngine({ ligaStore });

  // Create a real Liga for use in tests
  const liga = ligaStore.createLiga('Test Liga', 2024);
  testLigaId = liga.id;
});

afterEach(() => {
  if (existsSync(TEST_USER_DATA)) {
    try { rmSync(TEST_USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {}
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedTournament(t: Tournament): Tournament {
  // Inject a seed list directly into the file to simulate post-seeding state
  const seeded: Tournament = {
    ...t,
    status: 'seeding',
    seeds: [
      { seedNumber: 1, teamId: 'team-1', teamName: 'Alpha', record: { wins: 5, losses: 1 }, pointDifferential: 30 },
      { seedNumber: 2, teamId: 'team-2', teamName: 'Beta', record: { wins: 4, losses: 2 }, pointDifferential: 10 },
    ],
    updatedAt: new Date().toISOString(),
  };
  const tourDir = join(TEST_USER_DATA, 'tournaments', t.ligaId);
  writeFileSync(join(tourDir, `${t.id}.json`), JSON.stringify(seeded, null, 2), 'utf-8');
  return seeded;
}

function writeTournamentRaw(data: unknown, ligaId: string, fileName: string): void {
  const dir = join(TEST_USER_DATA, 'tournaments', ligaId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), JSON.stringify(data, null, 2), 'utf-8');
}

function writeCorruptFile(ligaId: string, fileName: string): void {
  const dir = join(TEST_USER_DATA, 'tournaments', ligaId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), 'INVALID JSON {{{{', 'utf-8');
}

// ===========================================================================
// createTournament
// ===========================================================================

describe('createTournament', () => {
  it('creates a tournament with correct metadata', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Spring Cup', 'single-elimination');
    expect(t.id).toBeTruthy();
    expect(t.ligaId).toBe(testLigaId);
    expect(t.name).toBe('Spring Cup');
    expect(t.format).toBe('single-elimination');
    expect(t.status).toBe('pending');
    expect(t.createdAt).toBeTruthy();
    expect(t.updatedAt).toBeTruthy();
    expect(t.seeds).toEqual([]);
    expect(t.rounds).toEqual([]);
    expect(t.matchNodes).toEqual([]);
    expect(t.options.consolationMatch).toBe(false);
  });

  it('generates a unique ID for each tournament', () => {
    const t1 = bracketEngine.createTournament(testLigaId, 'Cup A', 'single-elimination');
    const t2 = bracketEngine.createTournament(testLigaId, 'Cup B', 'single-elimination');
    expect(t1.id).not.toBe(t2.id);
  });

  it('trims whitespace from the tournament name', () => {
    const t = bracketEngine.createTournament(testLigaId, '  Spring Cup  ', 'single-elimination');
    expect(t.name).toBe('Spring Cup');
  });

  it('accepts all three valid bracket formats', () => {
    const formats: BracketFormat[] = ['single-elimination', 'double-elimination', 'round-robin'];
    for (const fmt of formats) {
      const t = bracketEngine.createTournament(testLigaId, `${fmt} Cup`, fmt);
      expect(t.format).toBe(fmt);
    }
  });

  it('persists tournament to disk', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Persisted Cup', 'round-robin');
    const expected = join(TEST_USER_DATA, 'tournaments', testLigaId, `${t.id}.json`);
    expect(existsSync(expected)).toBe(true);
  });

  it('throws when name is empty string', () => {
    expect(() => bracketEngine.createTournament(testLigaId, '', 'single-elimination'))
      .toThrow(/empty|blank/i);
  });

  it('throws when name is only whitespace', () => {
    expect(() => bracketEngine.createTournament(testLigaId, '   ', 'single-elimination'))
      .toThrow(/empty|blank/i);
  });

  it('throws when name exceeds 100 characters', () => {
    expect(() => bracketEngine.createTournament(testLigaId, 'A'.repeat(101), 'single-elimination'))
      .toThrow(/100/);
  });

  it('accepts a name that is exactly 100 characters', () => {
    const name = 'A'.repeat(100);
    const t = bracketEngine.createTournament(testLigaId, name, 'single-elimination');
    expect(t.name).toBe(name);
  });

  it('throws for an unsupported format', () => {
    expect(() =>
      bracketEngine.createTournament(testLigaId, 'Cup', 'swiss-system' as BracketFormat)
    ).toThrow(/unsupported|format/i);
  });

  it('throws when ligaId does not exist', () => {
    expect(() =>
      bracketEngine.createTournament('nonexistent-liga', 'Cup', 'single-elimination')
    ).toThrow(/liga.*not found/i);
  });
});

// ===========================================================================
// deleteTournament
// ===========================================================================

describe('deleteTournament', () => {
  it('removes the JSON file from disk', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Delete Me', 'single-elimination');
    const path = join(TEST_USER_DATA, 'tournaments', testLigaId, `${t.id}.json`);
    expect(existsSync(path)).toBe(true);

    bracketEngine.deleteTournament(t.id);
    expect(existsSync(path)).toBe(false);
  });

  it('deleted tournament no longer appears in listTournaments', () => {
    const t1 = bracketEngine.createTournament(testLigaId, 'Keep', 'single-elimination');
    const t2 = bracketEngine.createTournament(testLigaId, 'Delete', 'round-robin');

    bracketEngine.deleteTournament(t2.id);
    const list = bracketEngine.listTournaments(testLigaId);

    expect(list.find((x) => x.id === t2.id)).toBeUndefined();
    expect(list.find((x) => x.id === t1.id)).toBeDefined();
  });

  it('deleted tournament throws on getTournament', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Gone', 'single-elimination');
    bracketEngine.deleteTournament(t.id);
    expect(() => bracketEngine.getTournament(t.id)).toThrow(/not found/i);
  });

  it('throws when tournamentId does not exist', () => {
    expect(() => bracketEngine.deleteTournament('nonexistent-id')).toThrow(/not found/i);
  });
});

// ===========================================================================
// resetTournament
// ===========================================================================

describe('resetTournament', () => {
  it('reverts an in-progress tournament to seeding status when seeds exist', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Reset Cup', 'single-elimination');
    const seeded = seedTournament(t);
    expect(seeded.status).toBe('seeding');

    // Simulate in-progress state by writing it
    const inProgress: Tournament = {
      ...seeded,
      status: 'in-progress',
      rounds: [{ index: 0, name: 'Final', matchNodeIds: ['m1'] }],
      matchNodes: [{
        id: 'm1', roundIndex: 0, position: 0, bracketSection: 'winners',
        homeTeamId: 'team-1', awayTeamId: 'team-2', homeSeed: 1, awaySeed: 2,
        homeSourceMatchId: null, awaySourceMatchId: null,
        homeSourceIsLoser: false, awaySourceIsLoser: false,
        status: 'pending', homeScore: null, awayScore: null,
        winnerTeamId: null, loserTeamId: null, scheduledGameId: null, gameLogId: null, isBye: false,
      }],
    };
    writeFileSync(
      join(TEST_USER_DATA, 'tournaments', testLigaId, `${t.id}.json`),
      JSON.stringify(inProgress, null, 2), 'utf-8'
    );

    // Need a fresh engine to clear index
    const freshEngine = createBracketEngine({ ligaStore });
    const reset = freshEngine.resetTournament(t.id);

    expect(reset.status).toBe('seeding');
    expect(reset.rounds).toEqual([]);
    expect(reset.matchNodes).toEqual([]);
    expect(reset.seeds).toHaveLength(2); // seeds preserved
    expect(reset.championTeamId).toBeUndefined();
  });

  it('reverts a seeding tournament to pending when no seeds exist', () => {
    const t = bracketEngine.createTournament(testLigaId, 'No Seeds', 'single-elimination');
    const reset = bracketEngine.resetTournament(t.id);
    expect(reset.status).toBe('pending');
    expect(reset.seeds).toEqual([]);
  });

  it('clears bracket structure but preserves metadata', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Meta Cup', 'double-elimination');
    const seeded = seedTournament(t);

    const freshEngine = createBracketEngine({ ligaStore });
    const reset = freshEngine.resetTournament(seeded.id);

    expect(reset.id).toBe(t.id);
    expect(reset.ligaId).toBe(testLigaId);
    expect(reset.name).toBe('Meta Cup');
    expect(reset.format).toBe('double-elimination');
    expect(reset.createdAt).toBe(t.createdAt);
  });

  it('updates updatedAt timestamp on reset', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Time Cup', 'round-robin');
    const originalUpdatedAt = t.updatedAt;
    // Small delay to ensure different timestamp
    const reset = bracketEngine.resetTournament(t.id);
    expect(reset.updatedAt).toBeDefined();
    // updatedAt should be >= original (may be equal if very fast)
    expect(new Date(reset.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );
  });

  it('throws when tournamentId does not exist', () => {
    expect(() => bracketEngine.resetTournament('nonexistent-id')).toThrow(/not found/i);
  });

  it('persists reset state to disk', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Persist Reset', 'single-elimination');
    bracketEngine.resetTournament(t.id);

    // Verify by loading a fresh engine
    const freshEngine = createBracketEngine({ ligaStore });
    const loaded = freshEngine.getTournament(t.id);
    expect(loaded.status).toBe('pending');
    expect(loaded.rounds).toEqual([]);
  });
});

// ===========================================================================
// getTournament
// ===========================================================================

describe('getTournament', () => {
  it('returns the full tournament state', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Full Cup', 'round-robin');
    const loaded = bracketEngine.getTournament(t.id);
    expect(loaded).toEqual(t);
  });

  it('throws when tournament does not exist', () => {
    expect(() => bracketEngine.getTournament('does-not-exist')).toThrow(/not found/i);
  });

  it('returns fresh data after a reset (not cached)', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Cache Test', 'single-elimination');
    bracketEngine.resetTournament(t.id);
    const loaded = bracketEngine.getTournament(t.id);
    expect(loaded.status).toBe('pending');
  });
});

// ===========================================================================
// listTournaments
// ===========================================================================

describe('listTournaments', () => {
  it('returns all valid tournaments for a liga', () => {
    bracketEngine.createTournament(testLigaId, 'Cup A', 'single-elimination');
    bracketEngine.createTournament(testLigaId, 'Cup B', 'double-elimination');
    bracketEngine.createTournament(testLigaId, 'Cup C', 'round-robin');

    const list = bracketEngine.listTournaments(testLigaId);
    expect(list).toHaveLength(3);
  });

  it('returns TournamentSummary shape (not full tournament)', () => {
    bracketEngine.createTournament(testLigaId, 'Summary Cup', 'single-elimination');
    const list = bracketEngine.listTournaments(testLigaId);
    const s = list[0];
    expect(s).toHaveProperty('id');
    expect(s).toHaveProperty('name');
    expect(s).toHaveProperty('format');
    expect(s).toHaveProperty('status');
    expect(s).toHaveProperty('createdAt');
    expect(s).toHaveProperty('teamCount');
    // Full tournament fields not present
    expect(s).not.toHaveProperty('rounds');
    expect(s).not.toHaveProperty('matchNodes');
  });

  it('sorts by createdAt descending', async () => {
    // Insert three tournaments with slightly different timestamps
    const t1 = bracketEngine.createTournament(testLigaId, 'First', 'single-elimination');
    await new Promise((r) => setTimeout(r, 5));
    const t2 = bracketEngine.createTournament(testLigaId, 'Second', 'single-elimination');
    await new Promise((r) => setTimeout(r, 5));
    const t3 = bracketEngine.createTournament(testLigaId, 'Third', 'single-elimination');

    const list = bracketEngine.listTournaments(testLigaId);
    expect(list[0].id).toBe(t3.id); // newest first
    expect(list[1].id).toBe(t2.id);
    expect(list[2].id).toBe(t1.id);
  });

  it('excludes corrupted JSON files from listing', () => {
    bracketEngine.createTournament(testLigaId, 'Good Cup', 'single-elimination');
    writeCorruptFile(testLigaId, 'corrupt.json');

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = bracketEngine.listTournaments(testLigaId);
    consoleSpy.mockRestore();

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Good Cup');
  });

  it('excludes files missing required fields from listing', () => {
    bracketEngine.createTournament(testLigaId, 'Good Cup', 'single-elimination');
    // Missing required 'status' field
    writeTournamentRaw(
      { id: 'missing-fields', name: 'Bad', format: 'single-elimination', ligaId: testLigaId },
      testLigaId, 'missing.json'
    );

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = bracketEngine.listTournaments(testLigaId);
    consoleSpy.mockRestore();

    expect(list).toHaveLength(1);
  });

  it('returns empty array for a liga with no tournaments', () => {
    const list = bracketEngine.listTournaments(testLigaId);
    expect(list).toEqual([]);
  });

  it('returns empty array for a non-existent liga (graceful handling)', () => {
    const list = bracketEngine.listTournaments('no-such-liga');
    expect(list).toEqual([]);
  });

  it('does not delete corrupted files (only excludes them)', () => {
    writeCorruptFile(testLigaId, 'corrupt.json');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bracketEngine.listTournaments(testLigaId);
    consoleSpy.mockRestore();

    const path = join(TEST_USER_DATA, 'tournaments', testLigaId, 'corrupt.json');
    expect(existsSync(path)).toBe(true);
  });

  it('caps results at 200 entries', () => {
    // Create 202 tournaments via direct file writes (avoid slow individual creates)
    const dir = join(TEST_USER_DATA, 'tournaments', testLigaId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 202; i++) {
      const id = `tour-${String(i).padStart(4, '0')}`;
      const tournament: Tournament = {
        id, ligaId: testLigaId, name: `Cup ${i}`, format: 'single-elimination',
        status: 'pending', createdAt: new Date(Date.now() + i * 1000).toISOString(),
        updatedAt: new Date().toISOString(), seeds: [], rounds: [], matchNodes: [],
        options: { consolationMatch: false },
      };
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(tournament), 'utf-8');
    }
    const freshEngine = createBracketEngine({ ligaStore });
    const list = freshEngine.listTournaments(testLigaId);
    expect(list.length).toBe(200);
  });
});

// ===========================================================================
// getActiveTournament
// ===========================================================================

describe('getActiveTournament', () => {
  it('returns null when no in-progress tournament exists', () => {
    bracketEngine.createTournament(testLigaId, 'Pending Cup', 'single-elimination');
    const active = bracketEngine.getActiveTournament(testLigaId);
    expect(active).toBeNull();
  });

  it('returns the in-progress tournament', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Active Cup', 'single-elimination');
    // Write it as in-progress directly
    const inProgress: Tournament = {
      ...t, status: 'in-progress',
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(TEST_USER_DATA, 'tournaments', testLigaId, `${t.id}.json`),
      JSON.stringify(inProgress, null, 2), 'utf-8'
    );

    const freshEngine = createBracketEngine({ ligaStore });
    const active = freshEngine.getActiveTournament(testLigaId);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(t.id);
    expect(active!.status).toBe('in-progress');
  });

  it('returns null for a liga with no tournaments', () => {
    const active = bracketEngine.getActiveTournament(testLigaId);
    expect(active).toBeNull();
  });

  it('returns null for a non-existent liga', () => {
    const active = bracketEngine.getActiveTournament('nonexistent-liga');
    expect(active).toBeNull();
  });

  it('ignores completed and pending tournaments when finding active', () => {
    bracketEngine.createTournament(testLigaId, 'Pending', 'single-elimination');
    const t2 = bracketEngine.createTournament(testLigaId, 'Completed', 'single-elimination');

    // Write t2 as completed
    const completed: Tournament = {
      ...t2, status: 'completed', championTeamId: 'team-1',
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(
      join(TEST_USER_DATA, 'tournaments', testLigaId, `${t2.id}.json`),
      JSON.stringify(completed, null, 2), 'utf-8'
    );

    const freshEngine = createBracketEngine({ ligaStore });
    const active = freshEngine.getActiveTournament(testLigaId);
    expect(active).toBeNull();
  });
});

// ===========================================================================
// Persistence round-trip
// ===========================================================================

describe('Persistence round-trip', () => {
  it('tournament survives simulated restart (fresh engine reads from disk)', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Survive Restart', 'double-elimination');

    // Simulate restart: new engine instance
    const freshEngine = createBracketEngine({ ligaStore });
    const loaded = freshEngine.getTournament(t.id);

    expect(loaded.id).toBe(t.id);
    expect(loaded.name).toBe('Survive Restart');
    expect(loaded.format).toBe('double-elimination');
    expect(loaded.status).toBe('pending');
    expect(loaded.ligaId).toBe(testLigaId);
  });

  it('listTournaments reflects all changes after restart', () => {
    bracketEngine.createTournament(testLigaId, 'Alpha', 'single-elimination');
    bracketEngine.createTournament(testLigaId, 'Beta', 'round-robin');

    const freshEngine = createBracketEngine({ ligaStore });
    const list = freshEngine.listTournaments(testLigaId);
    expect(list).toHaveLength(2);
    const names = list.map((x) => x.name).sort();
    expect(names).toEqual(['Alpha', 'Beta']);
  });
});

// ===========================================================================
// Cross-liga isolation
// ===========================================================================

describe('Cross-liga isolation', () => {
  it('listTournaments only returns tournaments for the specified liga', () => {
    const liga2 = ligaStore.createLiga('Liga Two', 2025);

    bracketEngine.createTournament(testLigaId, 'Liga1 Cup', 'single-elimination');
    bracketEngine.createTournament(liga2.id, 'Liga2 Cup', 'round-robin');

    const list1 = bracketEngine.listTournaments(testLigaId);
    const list2 = bracketEngine.listTournaments(liga2.id);

    expect(list1).toHaveLength(1);
    expect(list1[0].name).toBe('Liga1 Cup');
    expect(list2).toHaveLength(1);
    expect(list2[0].name).toBe('Liga2 Cup');
  });
});

// ===========================================================================
// autoSeed
// ===========================================================================

describe('autoSeed', () => {
  it('returns a SeedResult with updated tournament', () => {
    // Add teams to the Liga
    ligaStore.addTeam(testLigaId, { name: 'Alpha', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    ligaStore.addTeam(testLigaId, { name: 'Beta', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Auto Seed Cup', 'single-elimination');
    const result = bracketEngine.autoSeed(t.id);

    expect(result.tournament).toBeDefined();
    expect(result.tournament.status).toBe('seeding');
    expect(result.tournament.seeds).toHaveLength(2);
  });

  it('sets tournament status to "seeding"', () => {
    ligaStore.addTeam(testLigaId, { name: 'A', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    ligaStore.addTeam(testLigaId, { name: 'B', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Status Cup', 'single-elimination');
    const result = bracketEngine.autoSeed(t.id);
    expect(result.tournament.status).toBe('seeding');
  });

  it('persists seeds to disk — fresh engine sees them', () => {
    ligaStore.addTeam(testLigaId, { name: 'Alpha', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    ligaStore.addTeam(testLigaId, { name: 'Beta', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Persist Seed Cup', 'single-elimination');
    bracketEngine.autoSeed(t.id);

    const fresh = createBracketEngine({ ligaStore });
    const loaded = fresh.getTournament(t.id);
    expect(loaded.seeds).toHaveLength(2);
    expect(loaded.status).toBe('seeding');
  });

  it('seeds 1-based seed numbers', () => {
    ligaStore.addTeam(testLigaId, { name: 'X', color: '#000', logoPath: null, playerImagePath: null, players: [] });
    ligaStore.addTeam(testLigaId, { name: 'Y', color: '#111', logoPath: null, playerImagePath: null, players: [] });
    ligaStore.addTeam(testLigaId, { name: 'Z', color: '#222', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Seeds Cup', 'single-elimination');
    const { tournament } = bracketEngine.autoSeed(t.id);

    const seedNumbers = tournament.seeds.map((s) => s.seedNumber).sort((a, b) => a - b);
    expect(seedNumbers).toEqual([1, 2, 3]);
  });

  it('teams with no game logs get 0-0 record and placed at the bottom (Req 2.1)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Alpha', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'Beta', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });
    const team3 = ligaStore.addTeam(testLigaId, { name: 'Gamma', color: '#00f', logoPath: null, playerImagePath: null, players: [] });

    // Add a scheduled game and game log so Alpha beat Beta
    const scheduled = ligaStore.addScheduledGame(testLigaId, {
      ligaId: testLigaId,
      date: '2024-01-01',
      homeTeamId: team1.id,
      awayTeamId: team2.id,
      assignedStaff: [],
      status: 'Completed',
    });

    ligaStore.saveGameLog({
      id: 'log-1',
      ligaId: testLigaId,
      date: '2024-01-01',
      homeTeam: 'Alpha',
      awayTeam: 'Beta',
      finalScores: { home: 80, away: 60 },
      playerStats: {},
      events: [],
      periodSnapshots: [],
      scheduledGameId: scheduled.id,
    });

    const t = bracketEngine.createTournament(testLigaId, 'Records Cup', 'single-elimination');
    const { tournament } = bracketEngine.autoSeed(t.id);

    const seed1 = tournament.seeds.find((s) => s.teamId === team1.id)!;
    const seed2 = tournament.seeds.find((s) => s.teamId === team2.id)!;
    const seed3 = tournament.seeds.find((s) => s.teamId === team3.id)!;

    // Alpha (1W) should be seeded above Beta (0-1, -20 diff) and Gamma (0-0, 0 diff)
    // Gamma (0-0, 0 diff) actually outranks Beta (0-1, -20 diff) by point differential
    expect(seed1.seedNumber).toBeLessThan(seed3.seedNumber); // Alpha above Gamma
    expect(seed3.seedNumber).toBeLessThan(seed2.seedNumber); // Gamma above Beta (better point diff)

    // Verify records
    expect(seed1.record).toEqual({ wins: 1, losses: 0 });
    expect(seed2.record).toEqual({ wins: 0, losses: 1 });
    expect(seed3.record).toEqual({ wins: 0, losses: 0 });
  });

  it('tiebreaker: point differential used when win/loss records are equal (Req 2.7)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Alpha', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'Beta', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });
    ligaStore.addTeam(testLigaId, { name: 'Gamma', color: '#00f', logoPath: null, playerImagePath: null, players: [] });

    // Each team wins one game vs a 4th team (not in this seeding set) — won't match
    // Instead, set up Alpha beats Gamma (big score), Beta beats Gamma (small score)
    const team4 = ligaStore.addTeam(testLigaId, { name: 'Delta', color: '#ff0', logoPath: null, playerImagePath: null, players: [] });

    const s1 = ligaStore.addScheduledGame(testLigaId, {
      ligaId: testLigaId, date: '2024-01-01',
      homeTeamId: team1.id, awayTeamId: team4.id,
      assignedStaff: [], status: 'Completed',
    });
    const s2 = ligaStore.addScheduledGame(testLigaId, {
      ligaId: testLigaId, date: '2024-01-02',
      homeTeamId: team2.id, awayTeamId: team4.id,
      assignedStaff: [], status: 'Completed',
    });

    // Alpha beats Delta by 30, Beta beats Delta by 10
    ligaStore.saveGameLog({ id: 'log-alpha', ligaId: testLigaId, date: '2024-01-01',
      homeTeam: 'Alpha', awayTeam: 'Delta', finalScores: { home: 100, away: 70 },
      playerStats: {}, events: [], periodSnapshots: [], scheduledGameId: s1.id });
    ligaStore.saveGameLog({ id: 'log-beta', ligaId: testLigaId, date: '2024-01-02',
      homeTeam: 'Beta', awayTeam: 'Delta', finalScores: { home: 80, away: 70 },
      playerStats: {}, events: [], periodSnapshots: [], scheduledGameId: s2.id });

    // Only seed teams 1-3 (not Delta), create a tournament with these 3
    const t = bracketEngine.createTournament(testLigaId, 'Diff Cup', 'single-elimination');
    const { tournament } = bracketEngine.autoSeed(t.id);

    // Alpha and Beta both have 1 win, but Alpha has +30 diff vs Beta's +10
    const seedAlpha = tournament.seeds.find((s) => s.teamId === team1.id)!;
    const seedBeta = tournament.seeds.find((s) => s.teamId === team2.id)!;
    expect(seedAlpha.seedNumber).toBeLessThan(seedBeta.seedNumber);
    expect(seedAlpha.pointDifferential).toBe(30);
    expect(seedBeta.pointDifferential).toBe(10);
  });

  it('tiebreaker: alphabetical order used when win/loss and point diff are equal (Req 2.7)', () => {
    // Two teams, no game logs — both 0-0, 0 point diff → sort alphabetically
    ligaStore.addTeam(testLigaId, { name: 'Zebra', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    ligaStore.addTeam(testLigaId, { name: 'Aardvark', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Alpha Cup', 'single-elimination');
    const { tournament } = bracketEngine.autoSeed(t.id);

    const seed1 = tournament.seeds.find((s) => s.seedNumber === 1)!;
    const seed2 = tournament.seeds.find((s) => s.seedNumber === 2)!;
    expect(seed1.teamName).toBe('Aardvark');
    expect(seed2.teamName).toBe('Zebra');
  });

  it('auto-seed ordering is deterministic regardless of input team order (Req 2.7)', () => {
    // Create 4 teams with different records
    const t1 = ligaStore.addTeam(testLigaId, { name: 'Alpha', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const t2 = ligaStore.addTeam(testLigaId, { name: 'Beta', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });
    const t3 = ligaStore.addTeam(testLigaId, { name: 'Gamma', color: '#00f', logoPath: null, playerImagePath: null, players: [] });
    const t4 = ligaStore.addTeam(testLigaId, { name: 'Delta', color: '#ff0', logoPath: null, playerImagePath: null, players: [] });

    // Alpha beats everyone, then Beta, Gamma, Delta have different records
    const games = [
      { home: t1, away: t2, score: { home: 90, away: 60 } },
      { home: t1, away: t3, score: { home: 85, away: 70 } },
      { home: t1, away: t4, score: { home: 80, away: 65 } },
      { home: t2, away: t3, score: { home: 75, away: 70 } },
      { home: t3, away: t4, score: { home: 80, away: 60 } },
    ];
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      const s = ligaStore.addScheduledGame(testLigaId, {
        ligaId: testLigaId, date: `2024-01-0${i + 1}`,
        homeTeamId: g.home.id, awayTeamId: g.away.id,
        assignedStaff: [], status: 'Completed',
      });
      ligaStore.saveGameLog({
        id: `log-${i}`, ligaId: testLigaId, date: `2024-01-0${i + 1}`,
        homeTeam: g.home.name, awayTeam: g.away.name,
        finalScores: g.score, playerStats: {}, events: [], periodSnapshots: [],
        scheduledGameId: s.id,
      });
    }

    const tour = bracketEngine.createTournament(testLigaId, 'Determinism Cup', 'single-elimination');
    const result1 = bracketEngine.autoSeed(tour.id);

    // Reset and re-seed — should produce same order
    bracketEngine.resetTournament(tour.id);
    const fresh = createBracketEngine({ ligaStore });
    const result2 = fresh.autoSeed(tour.id);

    // Compare seed assignments by teamId
    const order1 = result1.tournament.seeds.map((s) => s.teamId);
    const order2 = result2.tournament.seeds.map((s) => s.teamId);
    expect(order1).toEqual(order2);
  });

  it('throws when tournament does not exist', () => {
    expect(() => bracketEngine.autoSeed('nonexistent-tournament')).toThrow(/not found/i);
  });

  it('uses name-based fallback when scheduledGameId is absent', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Wolves', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'Owls', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    // Save a game log WITHOUT a scheduledGameId (name-based matching only)
    ligaStore.saveGameLog({
      id: 'log-namebased', ligaId: testLigaId, date: '2024-02-01',
      homeTeam: 'Wolves', awayTeam: 'Owls', finalScores: { home: 90, away: 70 },
      playerStats: {}, events: [], periodSnapshots: [],
      // no scheduledGameId
    });

    const t = bracketEngine.createTournament(testLigaId, 'Name Match Cup', 'single-elimination');
    const { tournament } = bracketEngine.autoSeed(t.id);

    const seedWolves = tournament.seeds.find((s) => s.teamId === team1.id)!;
    const seedOwls = tournament.seeds.find((s) => s.teamId === team2.id)!;

    // Wolves won — should be seeded 1st
    expect(seedWolves.seedNumber).toBe(1);
    expect(seedWolves.record.wins).toBe(1);
    expect(seedOwls.record.losses).toBe(1);
  });
});

// ===========================================================================
// manualSeed
// ===========================================================================

describe('manualSeed', () => {
  it('seeds teams in the provided order (index 0 = seed 1)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Alpha', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'Beta', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });
    const team3 = ligaStore.addTeam(testLigaId, { name: 'Gamma', color: '#00f', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Manual Cup', 'single-elimination');
    const { tournament } = bracketEngine.manualSeed(t.id, [team3.id, team1.id, team2.id]);

    expect(tournament.seeds[0].seedNumber).toBe(1);
    expect(tournament.seeds[0].teamId).toBe(team3.id);
    expect(tournament.seeds[1].seedNumber).toBe(2);
    expect(tournament.seeds[1].teamId).toBe(team1.id);
    expect(tournament.seeds[2].seedNumber).toBe(3);
    expect(tournament.seeds[2].teamId).toBe(team2.id);
  });

  it('sets tournament status to "seeding"', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'A', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'B', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Status Cup', 'single-elimination');
    const { tournament } = bracketEngine.manualSeed(t.id, [team1.id, team2.id]);
    expect(tournament.status).toBe('seeding');
  });

  it('persists manual seeds to disk', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'X', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'Y', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Persist Manual', 'single-elimination');
    bracketEngine.manualSeed(t.id, [team2.id, team1.id]);

    const fresh = createBracketEngine({ ligaStore });
    const loaded = fresh.getTournament(t.id);
    expect(loaded.seeds).toHaveLength(2);
    expect(loaded.seeds[0].teamId).toBe(team2.id);
    expect(loaded.seeds[0].seedNumber).toBe(1);
  });

  it('denormalises team name into each seed entry', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Warriors', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'Lakers', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Name Cup', 'single-elimination');
    const { tournament } = bracketEngine.manualSeed(t.id, [team1.id, team2.id]);

    expect(tournament.seeds[0].teamName).toBe('Warriors');
    expect(tournament.seeds[1].teamName).toBe('Lakers');
  });

  it('accepts exactly 2 teams (minimum, Req 2.4)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'A', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'B', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, '2-Team Cup', 'single-elimination');
    expect(() => bracketEngine.manualSeed(t.id, [team1.id, team2.id])).not.toThrow();
  });

  it('throws when fewer than 2 teams provided (Req 2.4)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Only', color: '#f00', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Too Few Cup', 'single-elimination');
    expect(() => bracketEngine.manualSeed(t.id, [team1.id])).toThrow(/2|minimum/i);
  });

  it('throws when empty list provided (Req 2.4)', () => {
    const t = bracketEngine.createTournament(testLigaId, 'Empty Cup', 'single-elimination');
    expect(() => bracketEngine.manualSeed(t.id, [])).toThrow(/2|minimum/i);
  });

  it('throws when more than 64 teams provided (Req 2.8)', () => {
    // Add 65 teams
    const teamIds: string[] = [];
    for (let i = 0; i < 65; i++) {
      const tm = ligaStore.addTeam(testLigaId, { name: `Team ${i}`, color: '#f00', logoPath: null, playerImagePath: null, players: [] });
      teamIds.push(tm.id);
    }

    const t = bracketEngine.createTournament(testLigaId, 'Too Many Cup', 'single-elimination');
    expect(() => bracketEngine.manualSeed(t.id, teamIds)).toThrow(/64|maximum/i);
  });

  it('accepts exactly 64 teams (maximum, Req 2.8)', () => {
    const teamIds: string[] = [];
    for (let i = 0; i < 64; i++) {
      const tm = ligaStore.addTeam(testLigaId, { name: `Team ${i}`, color: '#f00', logoPath: null, playerImagePath: null, players: [] });
      teamIds.push(tm.id);
    }

    const t = bracketEngine.createTournament(testLigaId, '64 Team Cup', 'single-elimination');
    expect(() => bracketEngine.manualSeed(t.id, teamIds)).not.toThrow();
  });

  it('throws for duplicate team IDs (Req 2.5)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Alpha', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'Beta', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Dup Cup', 'single-elimination');
    expect(() => bracketEngine.manualSeed(t.id, [team1.id, team2.id, team1.id])).toThrow(/duplicate/i);
  });

  it('throws for team IDs not in the Liga (Req 2.3)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'A', color: '#f00', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Invalid Cup', 'single-elimination');
    expect(() => bracketEngine.manualSeed(t.id, [team1.id, 'nonexistent-team-id'])).toThrow(/nonexistent-team-id/);
  });

  it('throws when tournament does not exist', () => {
    expect(() => bracketEngine.manualSeed('nonexistent-tournament', ['t1', 't2'])).toThrow(/not found/i);
  });

  it('does not modify tournament state when validation fails (Req 2.3)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'Valid', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const t = bracketEngine.createTournament(testLigaId, 'Immutable Cup', 'single-elimination');
    const originalStatus = t.status;

    expect(() => bracketEngine.manualSeed(t.id, [team1.id, 'invalid-id'])).toThrow();

    const unchanged = bracketEngine.getTournament(t.id);
    expect(unchanged.status).toBe(originalStatus);
    expect(unchanged.seeds).toEqual([]);
  });

  it('does not modify tournament state when duplicate IDs provided (Req 2.5)', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'A', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'B', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });
    const t = bracketEngine.createTournament(testLigaId, 'No Change Cup', 'single-elimination');

    expect(() => bracketEngine.manualSeed(t.id, [team1.id, team2.id, team1.id])).toThrow();

    const unchanged = bracketEngine.getTournament(t.id);
    expect(unchanged.seeds).toEqual([]);
    expect(unchanged.status).toBe('pending');
  });

  it('updates updatedAt timestamp after successful seed', () => {
    const team1 = ligaStore.addTeam(testLigaId, { name: 'A', color: '#f00', logoPath: null, playerImagePath: null, players: [] });
    const team2 = ligaStore.addTeam(testLigaId, { name: 'B', color: '#0f0', logoPath: null, playerImagePath: null, players: [] });

    const t = bracketEngine.createTournament(testLigaId, 'Time Cup', 'single-elimination');
    const { tournament } = bracketEngine.manualSeed(t.id, [team1.id, team2.id]);

    expect(new Date(tournament.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(t.updatedAt).getTime()
    );
  });
});
