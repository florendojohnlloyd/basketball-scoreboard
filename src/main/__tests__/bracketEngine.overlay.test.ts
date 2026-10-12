/**
 * Unit tests for BracketEngine overlay wiring (Task 6.3)
 *
 * Tests:
 *  - recordResult advances bracket and broadcasts incremental update (Req 9.1, 9.2)
 *  - revertResult clears downstream and broadcasts (Req 4.5, 9.1)
 *  - broadcastBracketState sends full payload (Req 9.3)
 *  - getFullBracketPayload returns BracketPayload shape (Req 9.3)
 *  - overlayServer is optional — no crash when not provided
 *  - tied scores do not advance bracket and set isTie (Req 4.6)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  BracketPayload,
  BracketUpdatePayload,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Mock electron app.getPath to use a temp directory
// ---------------------------------------------------------------------------

const TEST_USER_DATA = join(__dirname, '__test_userData_bracketEngine_overlay__');

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
let broadcastCalls: Array<BracketPayload | BracketUpdatePayload>;

const mockOverlayServer = {
  broadcastBracket: vi.fn((payload: BracketPayload | BracketUpdatePayload) => {
    broadcastCalls.push(payload);
  }),
  start: vi.fn(),
  stop: vi.fn(),
  broadcastState: vi.fn(),
  onConnection: vi.fn(),
  getPort: vi.fn().mockReturnValue(null),
  isRunning: vi.fn().mockReturnValue(false),
};

beforeEach(() => {
  if (existsSync(TEST_USER_DATA)) {
    try { rmSync(TEST_USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {}
  }
  mkdirSync(TEST_USER_DATA, { recursive: true });

  broadcastCalls = [];
  mockOverlayServer.broadcastBracket.mockClear();

  ligaStore = createLigaStore();
  bracketEngine = createBracketEngine({
    ligaStore,
    overlayServer: mockOverlayServer as any,
    userDataPath: TEST_USER_DATA,
  });

  // Create a real Liga with two teams
  const liga = ligaStore.createLiga('Test Liga', 2024);
  testLigaId = liga.id;
  ligaStore.addTeam(testLigaId, { name: 'Alpha' });
  ligaStore.addTeam(testLigaId, { name: 'Beta' });
});

afterEach(() => {
  if (existsSync(TEST_USER_DATA)) {
    try { rmSync(TEST_USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {}
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createAndSeedTournament(format: 'single-elimination' | 'round-robin' = 'single-elimination') {
  const tournament = bracketEngine.createTournament(testLigaId, 'Test Tournament', format);
  const liga = ligaStore.loadLiga(testLigaId);
  const teamIds = liga.teams.map(t => t.id);
  bracketEngine.manualSeed(tournament.id, teamIds);
  return tournament;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BracketEngine overlay wiring', () => {
  describe('overlayServer is optional', () => {
    it('does not crash when no overlayServer is provided', () => {
      const engineNoOverlay = createBracketEngine({
        ligaStore,
        userDataPath: TEST_USER_DATA,
      });

      const t = engineNoOverlay.createTournament(testLigaId, 'No Overlay', 'single-elimination');
      const liga = ligaStore.loadLiga(testLigaId);
      const teamIds = liga.teams.map(t => t.id);

      expect(() => engineNoOverlay.manualSeed(t.id, teamIds)).not.toThrow();
      expect(() => engineNoOverlay.generateBracket(t.id)).not.toThrow();
    });
  });

  describe('broadcastBracketState', () => {
    it('calls broadcastBracket with a full BracketPayload (Req 9.3)', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      mockOverlayServer.broadcastBracket.mockClear();
      bracketEngine.broadcastBracketState(generated.id);

      expect(mockOverlayServer.broadcastBracket).toHaveBeenCalledOnce();
      const payload = mockOverlayServer.broadcastBracket.mock.calls[0][0] as BracketPayload;
      expect(payload.tournamentId).toBe(generated.id);
      expect(Array.isArray(payload.matchNodes)).toBe(true);
      expect(payload.format).toBe('single-elimination');
    });

    it('throws when tournament does not exist', () => {
      expect(() => bracketEngine.broadcastBracketState('nonexistent-id')).toThrow();
    });
  });

  describe('getFullBracketPayload', () => {
    it('returns a BracketPayload with the correct shape (Req 9.3)', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      const payload = bracketEngine.getFullBracketPayload(generated.id);

      expect(payload.tournamentId).toBe(generated.id);
      expect(payload.name).toBe('Test Tournament');
      expect(payload.format).toBe('single-elimination');
      expect(Array.isArray(payload.matchNodes)).toBe(true);
      expect(Array.isArray(payload.rounds)).toBe(true);
      expect(Array.isArray(payload.seeds)).toBe(true);
    });

    it('throws when tournament does not exist', () => {
      expect(() => bracketEngine.getFullBracketPayload('nonexistent-id')).toThrow();
    });
  });

  describe('recordResult broadcasts incremental update (Req 9.1, 9.2)', () => {
    it('calls broadcastBracket after recording a result', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      const firstMatch = generated.matchNodes.find(n => n.status === 'pending' && !n.isBye);
      expect(firstMatch).toBeDefined();

      mockOverlayServer.broadcastBracket.mockClear();
      bracketEngine.recordResult(generated.id, firstMatch!.id, 10, 5);

      expect(mockOverlayServer.broadcastBracket).toHaveBeenCalled();
    });

    it('broadcast payload contains the updated match node', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      const firstMatch = generated.matchNodes.find(n => n.status === 'pending' && !n.isBye);
      expect(firstMatch).toBeDefined();

      mockOverlayServer.broadcastBracket.mockClear();
      bracketEngine.recordResult(generated.id, firstMatch!.id, 10, 5);

      const payload = mockOverlayServer.broadcastBracket.mock.calls[0][0] as BracketUpdatePayload;
      expect(payload.tournamentId).toBe(generated.id);
      expect(Array.isArray(payload.updatedMatchNodes)).toBe(true);
      const updatedNode = payload.updatedMatchNodes.find(n => n.id === firstMatch!.id);
      expect(updatedNode).toBeDefined();
      expect(updatedNode!.status).toBe('completed');
    });
  });

  describe('tied scores (Req 4.6)', () => {
    it('does not advance bracket on tied score', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      const firstMatch = generated.matchNodes.find(n => n.status === 'pending' && !n.isBye);
      expect(firstMatch).toBeDefined();

      const result = bracketEngine.recordResult(generated.id, firstMatch!.id, 5, 5);

      expect(result.isTie).toBe(true);
      expect(result.advanced).toBe(false);
      const node = result.tournament.matchNodes.find(n => n.id === firstMatch!.id);
      expect(node?.status).toBe('in-progress');
      expect(node?.winnerTeamId).toBeNull();
    });

    it('broadcasts even for tied scores', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      const firstMatch = generated.matchNodes.find(n => n.status === 'pending' && !n.isBye);
      expect(firstMatch).toBeDefined();

      mockOverlayServer.broadcastBracket.mockClear();
      bracketEngine.recordResult(generated.id, firstMatch!.id, 5, 5);

      expect(mockOverlayServer.broadcastBracket).toHaveBeenCalled();
    });
  });

  describe('revertResult clears downstream and broadcasts (Req 4.5, 9.1)', () => {
    it('calls broadcastBracket after reverting a result', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      const firstMatch = generated.matchNodes.find(n => n.status === 'pending' && !n.isBye);
      expect(firstMatch).toBeDefined();

      bracketEngine.recordResult(generated.id, firstMatch!.id, 10, 5);
      mockOverlayServer.broadcastBracket.mockClear();

      bracketEngine.revertResult(generated.id, firstMatch!.id);

      expect(mockOverlayServer.broadcastBracket).toHaveBeenCalled();
    });

    it('broadcast after revert includes the reverted node as pending', () => {
      const t = createAndSeedTournament();
      const generated = bracketEngine.generateBracket(t.id);

      const firstMatch = generated.matchNodes.find(n => n.status === 'pending' && !n.isBye);
      expect(firstMatch).toBeDefined();

      bracketEngine.recordResult(generated.id, firstMatch!.id, 10, 5);
      mockOverlayServer.broadcastBracket.mockClear();

      bracketEngine.revertResult(generated.id, firstMatch!.id);

      const payload = mockOverlayServer.broadcastBracket.mock.calls[0][0] as BracketUpdatePayload;
      const revertedNode = payload.updatedMatchNodes.find(n => n.id === firstMatch!.id);
      expect(revertedNode).toBeDefined();
      expect(revertedNode!.status).toBe('pending');
      expect(revertedNode!.winnerTeamId).toBeNull();
    });
  });
});
