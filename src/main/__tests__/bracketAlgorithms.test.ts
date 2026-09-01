import { describe, it, expect } from 'vitest';
import {
  generateSingleElimBracket,
  generateDoubleElimBracket,
  generateSeedPositions,
  generateRoundRobinSchedule,
  nextPowerOfTwo,
} from '../bracketAlgorithms';
import type { TournamentSeed, BracketOptions } from '../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeeds(count: number): TournamentSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    seedNumber: i + 1,
    teamId: `team-${i + 1}`,
    teamName: `Team ${i + 1}`,
    record: { wins: count - i, losses: i },
    pointDifferential: (count - i) * 10,
  }));
}

const defaultOptions: BracketOptions = { consolationMatch: false };
const consolationOptions: BracketOptions = { consolationMatch: true };

// ---------------------------------------------------------------------------
// nextPowerOfTwo
// ---------------------------------------------------------------------------

describe('nextPowerOfTwo', () => {
  it('returns 1 for 0 and 1', () => {
    expect(nextPowerOfTwo(0)).toBe(1);
    expect(nextPowerOfTwo(1)).toBe(1);
  });

  it('returns correct powers of two', () => {
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(4)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(7)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(9)).toBe(16);
    expect(nextPowerOfTwo(16)).toBe(16);
    expect(nextPowerOfTwo(17)).toBe(32);
    expect(nextPowerOfTwo(64)).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// generateSeedPositions
// ---------------------------------------------------------------------------

describe('generateSeedPositions', () => {
  it('generates correct positions for 2 slots', () => {
    expect(generateSeedPositions(2)).toEqual([1, 2]);
  });

  it('generates correct positions for 4 slots', () => {
    const positions = generateSeedPositions(4);
    expect(positions).toEqual([1, 4, 2, 3]);
  });

  it('generates correct positions for 8 slots', () => {
    const positions = generateSeedPositions(8);
    // Standard fold: [1, 8, 4, 5, 2, 7, 3, 6]
    expect(positions).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('ensures seed 1 and seed 2 are in different halves', () => {
    const positions = generateSeedPositions(8);
    const half = positions.length / 2;
    const firstHalf = positions.slice(0, half);
    const secondHalf = positions.slice(half);

    const seed1InFirst = firstHalf.includes(1);
    const seed2InFirst = firstHalf.includes(2);
    expect(seed1InFirst).not.toBe(seed2InFirst);
  });
});

// ---------------------------------------------------------------------------
// generateSingleElimBracket — Power of Two Teams
// ---------------------------------------------------------------------------

describe('generateSingleElimBracket', () => {
  describe('with power-of-two teams (no BYEs)', () => {
    it('generates correct structure for 2 teams', () => {
      const seeds = makeSeeds(2);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      expect(rounds).toHaveLength(1); // Just the Final
      expect(matchNodes).toHaveLength(1);
      expect(rounds[0].name).toBe('Final');

      const match = matchNodes[0];
      expect(match.homeTeamId).toBe('team-1');
      expect(match.awayTeamId).toBe('team-2');
      expect(match.homeSeed).toBe(1);
      expect(match.awaySeed).toBe(2);
      expect(match.isBye).toBe(false);
      expect(match.status).toBe('pending');
    });

    it('generates correct structure for 4 teams', () => {
      const seeds = makeSeeds(4);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      expect(rounds).toHaveLength(2); // Semifinals + Final
      expect(matchNodes).toHaveLength(3); // 2 semis + 1 final

      // First round: 2 matches
      expect(rounds[0].matchNodeIds).toHaveLength(2);
      expect(rounds[0].name).toBe('Semifinals');

      // Final
      expect(rounds[1].matchNodeIds).toHaveLength(1);
      expect(rounds[1].name).toBe('Final');

      // Verify seeding: position[0]=1, position[1]=4, position[2]=2, position[3]=3
      // So match 0: seed 1 vs seed 4, match 1: seed 2 vs seed 3
      const firstRoundMatches = matchNodes.filter((n) => n.roundIndex === 0);
      const match0 = firstRoundMatches[0];
      const match1 = firstRoundMatches[1];

      expect(match0.homeSeed).toBe(1);
      expect(match0.awaySeed).toBe(4);
      expect(match1.homeSeed).toBe(2);
      expect(match1.awaySeed).toBe(3);
    });

    it('generates correct structure for 8 teams', () => {
      const seeds = makeSeeds(8);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      expect(rounds).toHaveLength(3); // QF + SF + F
      expect(matchNodes).toHaveLength(7); // 4 + 2 + 1

      expect(rounds[0].name).toBe('Quarterfinals');
      expect(rounds[1].name).toBe('Semifinals');
      expect(rounds[2].name).toBe('Final');
    });

    it('wires source match IDs for subsequent rounds', () => {
      const seeds = makeSeeds(4);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      const finalNode = matchNodes.find((n) => n.roundIndex === 1)!;
      const firstRoundIds = rounds[0].matchNodeIds;

      expect(finalNode.homeSourceMatchId).toBe(firstRoundIds[0]);
      expect(finalNode.awaySourceMatchId).toBe(firstRoundIds[1]);
    });

    it('all match nodes have unique IDs', () => {
      const seeds = makeSeeds(16);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      const ids = matchNodes.map((n) => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('no BYE matches for power-of-two teams', () => {
      const seeds = makeSeeds(8);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      const byeMatches = matchNodes.filter((n) => n.isBye);
      expect(byeMatches).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Non-power-of-two teams (BYEs needed)
  // ---------------------------------------------------------------------------

  describe('with non-power-of-two teams (BYEs)', () => {
    it('generates BYE matches for 3 teams', () => {
      const seeds = makeSeeds(3);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      // bracketSize=4, so 2 first-round matches, 1 final = 3 match nodes
      expect(rounds).toHaveLength(2);
      expect(matchNodes).toHaveLength(3);

      // One BYE should exist (4 - 3 = 1 BYE)
      const byeMatches = matchNodes.filter((n) => n.isBye);
      expect(byeMatches).toHaveLength(1);

      // BYE match should be completed with the real team as winner
      const byeMatch = byeMatches[0];
      expect(byeMatch.status).toBe('bye');
      expect(byeMatch.winnerTeamId).not.toBeNull();
    });

    it('assigns BYEs to highest seeds (lowest seed numbers)', () => {
      const seeds = makeSeeds(5);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      // bracketSize=8, byeCount=3 (seeds 1, 2, 3 get BYEs)
      const byeMatches = matchNodes.filter((n) => n.isBye && n.roundIndex === 0);
      expect(byeMatches).toHaveLength(3);

      // Check that BYE winners are seeds 1, 2, and 3
      const byeWinnerTeams = byeMatches.map((n) => n.winnerTeamId).sort();
      expect(byeWinnerTeams).toEqual(['team-1', 'team-2', 'team-3'].sort());
    });

    it('advances BYE winners to next round', () => {
      const seeds = makeSeeds(3);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      // Seed 1 should get BYE and advance to the final
      const finalNode = matchNodes.find((n) => n.roundIndex === 1)!;

      // One of the teams in the final should be from the BYE
      const byeMatch = matchNodes.find((n) => n.isBye)!;
      const byeWinner = byeMatch.winnerTeamId;

      // The final should have the BYE winner pre-filled
      const hasAdvanced =
        finalNode.homeTeamId === byeWinner || finalNode.awayTeamId === byeWinner;
      expect(hasAdvanced).toBe(true);
    });

    it('generates correct structure for 6 teams', () => {
      const seeds = makeSeeds(6);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      // bracketSize=8, rounds=3 (QF + SF + F)
      expect(rounds).toHaveLength(3);

      // Total nodes: 4 (QF) + 2 (SF) + 1 (F) = 7
      expect(matchNodes).toHaveLength(7);

      // BYEs: 8 - 6 = 2
      const byeMatches = matchNodes.filter((n) => n.isBye);
      expect(byeMatches).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Consolation Match
  // ---------------------------------------------------------------------------

  describe('consolation match', () => {
    it('adds a consolation match when enabled and there are enough rounds', () => {
      const seeds = makeSeeds(4);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, consolationOptions);

      // Should have 3 rounds: Semifinals, Final, 3rd Place Match
      expect(rounds).toHaveLength(3);
      expect(rounds[2].name).toBe('3rd Place Match');

      // Should have 4 match nodes: 2 semis + 1 final + 1 consolation
      expect(matchNodes).toHaveLength(4);

      const consolation = matchNodes.find((n) => n.bracketSection === 'consolation')!;
      expect(consolation).toBeDefined();
      expect(consolation.homeSourceIsLoser).toBe(true);
      expect(consolation.awaySourceIsLoser).toBe(true);
    });

    it('consolation match sources are the semifinal matches', () => {
      const seeds = makeSeeds(8);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, consolationOptions);

      const consolation = matchNodes.find((n) => n.bracketSection === 'consolation')!;
      const semiRound = rounds.find((r) => r.name === 'Semifinals')!;

      expect(consolation.homeSourceMatchId).toBe(semiRound.matchNodeIds[0]);
      expect(consolation.awaySourceMatchId).toBe(semiRound.matchNodeIds[1]);
    });

    it('does not add consolation match when disabled', () => {
      const seeds = makeSeeds(4);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      const consolation = matchNodes.find((n) => n.bracketSection === 'consolation');
      expect(consolation).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Bracket Section & Structure
  // ---------------------------------------------------------------------------

  describe('bracket section assignment', () => {
    it('all non-consolation matches are in winners section', () => {
      const seeds = makeSeeds(8);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      for (const node of matchNodes) {
        expect(node.bracketSection).toBe('winners');
      }
    });

    it('first round nodes have no source match IDs', () => {
      const seeds = makeSeeds(8);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      const firstRound = matchNodes.filter((n) => n.roundIndex === 0);
      for (const node of firstRound) {
        expect(node.homeSourceMatchId).toBeNull();
        expect(node.awaySourceMatchId).toBeNull();
      }
    });

    it('all subsequent round nodes reference source matches', () => {
      const seeds = makeSeeds(8);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      const laterRounds = matchNodes.filter(
        (n) => n.roundIndex > 0 && n.bracketSection !== 'consolation'
      );
      for (const node of laterRounds) {
        expect(node.homeSourceMatchId).not.toBeNull();
        expect(node.awaySourceMatchId).not.toBeNull();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Seed Placement Correctness
  // ---------------------------------------------------------------------------

  describe('seed placement', () => {
    it('seed 1 and seed 2 are in different halves for 8 teams', () => {
      const seeds = makeSeeds(8);
      const { rounds, matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      // In a bracket of 8, first round has 4 matches
      // Top half: matches 0, 1 → feed into semifinal 0
      // Bottom half: matches 2, 3 → feed into semifinal 1
      const firstRound = matchNodes.filter((n) => n.roundIndex === 0);
      const topHalf = firstRound.slice(0, 2);
      const bottomHalf = firstRound.slice(2, 4);

      const topSeeds = topHalf.flatMap((n) => [n.homeSeed, n.awaySeed]).filter(Boolean);
      const bottomSeeds = bottomHalf.flatMap((n) => [n.homeSeed, n.awaySeed]).filter(Boolean);

      // Seed 1 and Seed 2 should not both be in the same half
      const seed1InTop = topSeeds.includes(1);
      const seed2InTop = topSeeds.includes(2);
      expect(seed1InTop).not.toBe(seed2InTop);
    });

    it('seed 1 faces the highest seed number in round 1 for power-of-two', () => {
      const seeds = makeSeeds(8);
      const { matchNodes } = generateSingleElimBracket(seeds, defaultOptions);

      // Seed 1 should face seed 8 in round 1
      const seed1Match = matchNodes.find(
        (n) => n.roundIndex === 0 && (n.homeSeed === 1 || n.awaySeed === 1)
      )!;

      const opponent = seed1Match.homeSeed === 1 ? seed1Match.awaySeed : seed1Match.homeSeed;
      expect(opponent).toBe(8);
    });
  });
});

// ---------------------------------------------------------------------------
// generateRoundRobinSchedule
// ---------------------------------------------------------------------------

describe('generateRoundRobinSchedule', () => {
  // -------------------------------------------------------------------------
  // Even team counts (no BYE padding required)
  // -------------------------------------------------------------------------

  describe('even number of teams', () => {
    it('generates N-1 rounds for N even teams (N=2)', () => {
      const seeds = makeSeeds(2);
      const { rounds } = generateRoundRobinSchedule(seeds);
      // 2 teams → 1 round
      expect(rounds).toHaveLength(1);
    });

    it('generates N-1 rounds for N=4', () => {
      const seeds = makeSeeds(4);
      const { rounds } = generateRoundRobinSchedule(seeds);
      expect(rounds).toHaveLength(3);
    });

    it('generates N-1 rounds for N=6', () => {
      const seeds = makeSeeds(6);
      const { rounds } = generateRoundRobinSchedule(seeds);
      expect(rounds).toHaveLength(5);
    });

    it('each round has floor(N/2) matches for N=4', () => {
      const seeds = makeSeeds(4);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);
      for (const round of rounds) {
        expect(round.matchNodeIds).toHaveLength(2);
      }
      // Total matches = N*(N-1)/2 = 6
      expect(matchNodes).toHaveLength(6);
    });

    it('each round has floor(N/2) matches for N=6', () => {
      const seeds = makeSeeds(6);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);
      for (const round of rounds) {
        expect(round.matchNodeIds).toHaveLength(3);
      }
      // Total matches = 6*5/2 = 15
      expect(matchNodes).toHaveLength(15);
    });

    it('every team plays every other team exactly once for N=4', () => {
      const seeds = makeSeeds(4);
      const { matchNodes } = generateRoundRobinSchedule(seeds);

      const matchSet = new Set<string>();
      for (const node of matchNodes) {
        expect(node.isBye).toBe(false);
        const a = node.homeSeed!;
        const b = node.awaySeed!;
        const key = [Math.min(a, b), Math.max(a, b)].join('-');
        expect(matchSet.has(key)).toBe(false); // no duplicate matchups
        matchSet.add(key);
      }
      // N*(N-1)/2 = 6 unique pairs
      expect(matchSet.size).toBe(6);
    });

    it('every team plays every other team exactly once for N=6', () => {
      const seeds = makeSeeds(6);
      const { matchNodes } = generateRoundRobinSchedule(seeds);

      const matchSet = new Set<string>();
      for (const node of matchNodes) {
        if (node.isBye) continue;
        const a = node.homeSeed!;
        const b = node.awaySeed!;
        const key = [Math.min(a, b), Math.max(a, b)].join('-');
        expect(matchSet.has(key)).toBe(false);
        matchSet.add(key);
      }
      expect(matchSet.size).toBe(15);
    });

    it('no team appears more than once per round for N=4', () => {
      const seeds = makeSeeds(4);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      for (const round of rounds) {
        const teamsInRound = new Set<string>();
        for (const id of round.matchNodeIds) {
          const node = matchNodes.find((n) => n.id === id)!;
          if (node.homeTeamId) {
            expect(teamsInRound.has(node.homeTeamId)).toBe(false);
            teamsInRound.add(node.homeTeamId);
          }
          if (node.awayTeamId) {
            expect(teamsInRound.has(node.awayTeamId)).toBe(false);
            teamsInRound.add(node.awayTeamId);
          }
        }
      }
    });

    it('no team appears more than once per round for N=8', () => {
      const seeds = makeSeeds(8);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      for (const round of rounds) {
        const teamsInRound = new Set<string>();
        for (const id of round.matchNodeIds) {
          const node = matchNodes.find((n) => n.id === id)!;
          if (node.homeTeamId) {
            expect(teamsInRound.has(node.homeTeamId)).toBe(false);
            teamsInRound.add(node.homeTeamId);
          }
          if (node.awayTeamId) {
            expect(teamsInRound.has(node.awayTeamId)).toBe(false);
            teamsInRound.add(node.awayTeamId);
          }
        }
      }
    });

    it('all non-bye match nodes have bracketSection = round-robin', () => {
      const seeds = makeSeeds(4);
      const { matchNodes } = generateRoundRobinSchedule(seeds);
      for (const node of matchNodes) {
        expect(node.bracketSection).toBe('round-robin');
      }
    });

    it('all match IDs are unique for N=6', () => {
      const seeds = makeSeeds(6);
      const { matchNodes } = generateRoundRobinSchedule(seeds);
      const ids = matchNodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('no source match links exist (no advancement wiring)', () => {
      const seeds = makeSeeds(4);
      const { matchNodes } = generateRoundRobinSchedule(seeds);
      for (const node of matchNodes) {
        expect(node.homeSourceMatchId).toBeNull();
        expect(node.awaySourceMatchId).toBeNull();
      }
    });

    it('rounds are named Round 1, Round 2, … etc.', () => {
      const seeds = makeSeeds(4);
      const { rounds } = generateRoundRobinSchedule(seeds);
      expect(rounds[0].name).toBe('Round 1');
      expect(rounds[1].name).toBe('Round 2');
      expect(rounds[2].name).toBe('Round 3');
    });
  });

  // -------------------------------------------------------------------------
  // Odd team counts (BYE padding required)
  // -------------------------------------------------------------------------

  describe('odd number of teams', () => {
    it('generates N rounds for N=3 (odd)', () => {
      const seeds = makeSeeds(3);
      const { rounds } = generateRoundRobinSchedule(seeds);
      // 3 odd → pad to 4 → 3 rounds
      expect(rounds).toHaveLength(3);
    });

    it('generates N rounds for N=5 (odd)', () => {
      const seeds = makeSeeds(5);
      const { rounds } = generateRoundRobinSchedule(seeds);
      expect(rounds).toHaveLength(5);
    });

    it('each round has exactly one BYE match for N=3', () => {
      const seeds = makeSeeds(3);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      for (const round of rounds) {
        const byeCount = round.matchNodeIds
          .map((id) => matchNodes.find((n) => n.id === id)!)
          .filter((n) => n.isBye).length;
        expect(byeCount).toBe(1);
      }
    });

    it('each round has exactly one BYE match for N=5', () => {
      const seeds = makeSeeds(5);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      for (const round of rounds) {
        const byeCount = round.matchNodeIds
          .map((id) => matchNodes.find((n) => n.id === id)!)
          .filter((n) => n.isBye).length;
        expect(byeCount).toBe(1);
      }
    });

    it('every real pair plays exactly once for N=3', () => {
      const seeds = makeSeeds(3);
      const { matchNodes } = generateRoundRobinSchedule(seeds);

      const realMatches = matchNodes.filter((n) => !n.isBye);
      // 3*(3-1)/2 = 3 real matches
      expect(realMatches).toHaveLength(3);

      const matchSet = new Set<string>();
      for (const node of realMatches) {
        const a = node.homeSeed!;
        const b = node.awaySeed!;
        const key = [Math.min(a, b), Math.max(a, b)].join('-');
        expect(matchSet.has(key)).toBe(false);
        matchSet.add(key);
      }
      expect(matchSet.size).toBe(3);
    });

    it('every real pair plays exactly once for N=5', () => {
      const seeds = makeSeeds(5);
      const { matchNodes } = generateRoundRobinSchedule(seeds);

      const realMatches = matchNodes.filter((n) => !n.isBye);
      // 5*(5-1)/2 = 10 real matches
      expect(realMatches).toHaveLength(10);

      const matchSet = new Set<string>();
      for (const node of realMatches) {
        const a = node.homeSeed!;
        const b = node.awaySeed!;
        const key = [Math.min(a, b), Math.max(a, b)].join('-');
        expect(matchSet.has(key)).toBe(false);
        matchSet.add(key);
      }
      expect(matchSet.size).toBe(10);
    });

    it('no real team appears more than once per round for N=5', () => {
      const seeds = makeSeeds(5);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      for (const round of rounds) {
        const teamsInRound = new Set<string>();
        for (const id of round.matchNodeIds) {
          const node = matchNodes.find((n) => n.id === id)!;
          if (node.homeTeamId) {
            expect(teamsInRound.has(node.homeTeamId)).toBe(false);
            teamsInRound.add(node.homeTeamId);
          }
          if (node.awayTeamId) {
            expect(teamsInRound.has(node.awayTeamId)).toBe(false);
            teamsInRound.add(node.awayTeamId);
          }
        }
      }
    });

    it('BYE matches have a real winner team set and status = bye', () => {
      const seeds = makeSeeds(3);
      const { matchNodes } = generateRoundRobinSchedule(seeds);

      const byeMatches = matchNodes.filter((n) => n.isBye);
      for (const b of byeMatches) {
        expect(b.status).toBe('bye');
        expect(b.winnerTeamId).not.toBeNull();
      }
    });

    it('all match IDs are unique for N=5', () => {
      const seeds = makeSeeds(5);
      const { matchNodes } = generateRoundRobinSchedule(seeds);
      const ids = matchNodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('works for 2 teams (minimum round-robin)', () => {
      const seeds = makeSeeds(2);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      expect(rounds).toHaveLength(1);
      expect(matchNodes).toHaveLength(1);
      expect(matchNodes[0].isBye).toBe(false);
      expect(matchNodes[0].homeTeamId).toBe('team-1');
      expect(matchNodes[0].awayTeamId).toBe('team-2');
    });

    it('works for larger even count N=10', () => {
      const seeds = makeSeeds(10);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      expect(rounds).toHaveLength(9); // N-1
      // Each round has 5 matches, total = 9*5 = 45 = 10*9/2
      expect(matchNodes).toHaveLength(45);

      // Verify all unique matchups
      const matchSet = new Set<string>();
      for (const node of matchNodes) {
        const a = node.homeSeed!;
        const b = node.awaySeed!;
        const key = [Math.min(a, b), Math.max(a, b)].join('-');
        expect(matchSet.has(key)).toBe(false);
        matchSet.add(key);
      }
    });

    it('works for N=7 (odd)', () => {
      const seeds = makeSeeds(7);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);

      expect(rounds).toHaveLength(7); // N rounds for odd N
      const realMatches = matchNodes.filter((n) => !n.isBye);
      // 7*6/2 = 21 real matches
      expect(realMatches).toHaveLength(21);
    });

    it('round index matches position in rounds array', () => {
      const seeds = makeSeeds(4);
      const { rounds } = generateRoundRobinSchedule(seeds);
      rounds.forEach((round, idx) => {
        expect(round.index).toBe(idx);
      });
    });

    it('match node roundIndex matches round position', () => {
      const seeds = makeSeeds(4);
      const { rounds, matchNodes } = generateRoundRobinSchedule(seeds);
      for (const round of rounds) {
        for (const id of round.matchNodeIds) {
          const node = matchNodes.find((n) => n.id === id)!;
          expect(node.roundIndex).toBe(round.index);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// generateDoubleElimBracket
// ---------------------------------------------------------------------------

describe('generateDoubleElimBracket', () => {
  // -------------------------------------------------------------------------
  // Basic structure
  // -------------------------------------------------------------------------

  describe('basic structure', () => {
    it('generates expected round counts for 4 teams', () => {
      // 4 teams → bracketSize=4, winnersRounds=2, lbRounds=2*(2-1)=2
      // WB rounds: 2, LB rounds: 2, Grand Final: 1 → total unique round indices = 5
      const seeds = makeSeeds(4);
      const { winnersBracket, losersBracket, grandFinal, matchNodes } =
        generateDoubleElimBracket(seeds);

      expect(winnersBracket).toHaveLength(2); // WB Semis + WB Final
      expect(losersBracket).toHaveLength(2);  // LB Round 1 + LB Final
      expect(grandFinal).toBeDefined();
      // Total match nodes: 2 (WB R0) + 1 (WB R1) + 1 (LB R0) + 1 (LB R1) + 1 (GF) = 6
      expect(matchNodes).toHaveLength(6);
    });

    it('generates expected round counts for 8 teams', () => {
      // 8 teams → bracketSize=8, winnersRounds=3, lbRounds=2*(3-1)=4
      const seeds = makeSeeds(8);
      const { winnersBracket, losersBracket, grandFinal, matchNodes } =
        generateDoubleElimBracket(seeds);

      expect(winnersBracket).toHaveLength(3); // QF, SF, F
      expect(losersBracket).toHaveLength(4);  // 4 LB rounds
      expect(grandFinal).toBeDefined();

      // WB nodes: 4 + 2 + 1 = 7
      // LB nodes: 2 + 2 + 1 + 1 = 6
      // GF: 1
      // Total: 14
      expect(matchNodes).toHaveLength(14);
    });

    it('generates expected round counts for 2 teams', () => {
      // 2 teams → bracketSize=2, winnersRounds=1, lbRounds=0
      // WB: 1 round (1 match), no LB, GF: 1 match = 2 total
      const seeds = makeSeeds(2);
      const { winnersBracket, losersBracket, grandFinal, matchNodes } =
        generateDoubleElimBracket(seeds);

      expect(winnersBracket).toHaveLength(1);
      expect(losersBracket).toHaveLength(0);
      expect(grandFinal).toBeDefined();
      expect(matchNodes).toHaveLength(2);
      // For 2 teams, no LB exists so awaySourceMatchId on GF is null
      expect(grandFinal.awaySourceMatchId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // All match node IDs are unique
  // -------------------------------------------------------------------------

  describe('unique match node IDs', () => {
    it('all match node IDs are unique for 4 teams', () => {
      const seeds = makeSeeds(4);
      const { matchNodes } = generateDoubleElimBracket(seeds);
      const ids = matchNodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all match node IDs are unique for 8 teams', () => {
      const seeds = makeSeeds(8);
      const { matchNodes } = generateDoubleElimBracket(seeds);
      const ids = matchNodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all match node IDs are unique for 16 teams', () => {
      const seeds = makeSeeds(16);
      const { matchNodes } = generateDoubleElimBracket(seeds);
      const ids = matchNodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // -------------------------------------------------------------------------
  // Winners bracket correctness
  // -------------------------------------------------------------------------

  describe('winners bracket', () => {
    it('winners bracket uses same seeded placement as single-elimination', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      // Round 0 first match should be seed 1 vs seed 8 (standard fold)
      const wbR0MatchIds = winnersBracket[0].matchNodeIds;
      const wbR0Matches = wbR0MatchIds.map((id) => matchNodes.find((n) => n.id === id)!);

      const seed1Match = wbR0Matches.find(
        (n) => n.homeSeed === 1 || n.awaySeed === 1
      )!;
      expect(seed1Match).toBeDefined();
      const opponent = seed1Match.homeSeed === 1 ? seed1Match.awaySeed : seed1Match.homeSeed;
      expect(opponent).toBe(8);
    });

    it('winners bracket section is "winners" for all WB nodes', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      const wbIds = new Set(winnersBracket.flatMap((r) => r.matchNodeIds));
      for (const id of wbIds) {
        const node = matchNodes.find((n) => n.id === id)!;
        expect(node.bracketSection).toBe('winners');
      }
    });

    it('winners bracket nodes use homeSourceIsLoser=false and awaySourceIsLoser=false', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      for (const round of winnersBracket) {
        for (const id of round.matchNodeIds) {
          const node = matchNodes.find((n) => n.id === id)!;
          expect(node.homeSourceIsLoser).toBe(false);
          expect(node.awaySourceIsLoser).toBe(false);
        }
      }
    });

    it('seed 1 and seed 2 are in different halves of the winners bracket', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      const wbR0 = winnersBracket[0].matchNodeIds.map((id) =>
        matchNodes.find((n) => n.id === id)!
      );
      const half = wbR0.length / 2;
      const topHalf = wbR0.slice(0, half);
      const bottomHalf = wbR0.slice(half);

      const topSeeds = topHalf.flatMap((n) => [n.homeSeed, n.awaySeed]).filter(Boolean);
      const bottomSeeds = bottomHalf.flatMap((n) => [n.homeSeed, n.awaySeed]).filter(Boolean);

      const seed1InTop = topSeeds.includes(1);
      const seed2InTop = topSeeds.includes(2);
      expect(seed1InTop).not.toBe(seed2InTop);
    });
  });

  // -------------------------------------------------------------------------
  // Losers bracket correctness
  // -------------------------------------------------------------------------

  describe('losers bracket', () => {
    it('losers bracket section is "losers" for all LB nodes', () => {
      const seeds = makeSeeds(8);
      const { losersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      const lbIds = new Set(losersBracket.flatMap((r) => r.matchNodeIds));
      for (const id of lbIds) {
        const node = matchNodes.find((n) => n.id === id)!;
        expect(node.bracketSection).toBe('losers');
      }
    });

    it('first losers bracket round sources are all from winners bracket round 0', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, losersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      const wbR0Ids = new Set(winnersBracket[0].matchNodeIds);
      const lbR0Ids = losersBracket[0].matchNodeIds;

      for (const id of lbR0Ids) {
        const node = matchNodes.find((n) => n.id === id)!;
        // Both sources come from WB round 0 matches (taking their losers)
        expect(node.homeSourceMatchId).toBeDefined();
        expect(node.awaySourceMatchId).toBeDefined();
        expect(wbR0Ids.has(node.homeSourceMatchId!)).toBe(true);
        expect(wbR0Ids.has(node.awaySourceMatchId!)).toBe(true);
        expect(node.homeSourceIsLoser).toBe(true);
        expect(node.awaySourceIsLoser).toBe(true);
      }
    });

    it('losers bracket drop-in rounds reference winners bracket losers', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, losersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      // For 8 teams: LB R0=initial pair (lbR=0), LB R1=drop-in from WB-R1 (lbR=1),
      // LB R2=play (lbR=2), LB R3=drop-in from WB-R2 (lbR=3).
      // Test LB round index 1 (lbR=1): should reference WB-R1 losers on away side.
      if (losersBracket.length >= 2) {
        const lbR1 = losersBracket[1]; // second LB round = first drop-in after initial
        const wbR1Ids = new Set(winnersBracket[1].matchNodeIds);

        for (const id of lbR1.matchNodeIds) {
          const node = matchNodes.find((n) => n.id === id)!;
          // away side comes from WB-R1 losers
          expect(node.awaySourceIsLoser).toBe(true);
          expect(wbR1Ids.has(node.awaySourceMatchId!)).toBe(true);
          // home side comes from LB survivors (not a WB loser)
          expect(node.homeSourceIsLoser).toBe(false);
        }
      }
    });

    it('losers bracket has correct number of rounds for 8 teams', () => {
      const seeds = makeSeeds(8);
      const { losersBracket } = generateDoubleElimBracket(seeds);
      // 8 teams → winnersRounds=3, lbRounds = 2*(3-1) = 4
      expect(losersBracket).toHaveLength(4);
    });

    it('losers bracket last round (LB Final) has exactly one match', () => {
      const seeds = makeSeeds(8);
      const { losersBracket } = generateDoubleElimBracket(seeds);
      const lbFinal = losersBracket[losersBracket.length - 1];
      expect(lbFinal.matchNodeIds).toHaveLength(1);
      expect(lbFinal.name).toBe('Losers Final');
    });
  });

  // -------------------------------------------------------------------------
  // Grand Final
  // -------------------------------------------------------------------------

  describe('grand final', () => {
    it('grand final section is "final"', () => {
      const seeds = makeSeeds(4);
      const { grandFinal } = generateDoubleElimBracket(seeds);
      expect(grandFinal.bracketSection).toBe('final');
    });

    it('grand final sources WB champion and LB champion', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, losersBracket, grandFinal } = generateDoubleElimBracket(seeds);

      const wbFinalId = winnersBracket[winnersBracket.length - 1].matchNodeIds[0];
      const lbFinalId = losersBracket[losersBracket.length - 1].matchNodeIds[0];

      expect(grandFinal.homeSourceMatchId).toBe(wbFinalId);
      expect(grandFinal.awaySourceMatchId).toBe(lbFinalId);
    });

    it('grand final homeSourceIsLoser=false and awaySourceIsLoser=false', () => {
      const seeds = makeSeeds(8);
      const { grandFinal } = generateDoubleElimBracket(seeds);

      // We take the WINNER of the WB final and WINNER of the LB final
      expect(grandFinal.homeSourceIsLoser).toBe(false);
      expect(grandFinal.awaySourceIsLoser).toBe(false);
    });

    it('grand final starts as pending', () => {
      const seeds = makeSeeds(8);
      const { grandFinal } = generateDoubleElimBracket(seeds);
      expect(grandFinal.status).toBe('pending');
      expect(grandFinal.homeTeamId).toBeNull();
      expect(grandFinal.awayTeamId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Non-power-of-two teams (BYEs in winners bracket)
  // -------------------------------------------------------------------------

  describe('non-power-of-two teams', () => {
    it('handles 5 teams with BYEs in winners bracket', () => {
      const seeds = makeSeeds(5);
      const { winnersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      // bracketSize=8, byeCount=3 → 3 BYE matches in WB round 0
      const wbR0Ids = winnersBracket[0].matchNodeIds;
      const wbR0Matches = wbR0Ids.map((id) => matchNodes.find((n) => n.id === id)!);
      const byeMatches = wbR0Matches.filter((n) => n.isBye);
      expect(byeMatches).toHaveLength(3);
    });

    it('BYE matches are assigned status "bye" in winners bracket', () => {
      const seeds = makeSeeds(6);
      const { winnersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      const wbR0Ids = winnersBracket[0].matchNodeIds;
      const wbR0Matches = wbR0Ids.map((id) => matchNodes.find((n) => n.id === id)!);
      const byeMatches = wbR0Matches.filter((n) => n.isBye);

      for (const node of byeMatches) {
        expect(node.status).toBe('bye');
        expect(node.winnerTeamId).not.toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Teams are not duplicated across WB and LB in first round
  // -------------------------------------------------------------------------

  describe('team placement', () => {
    it('every team appears exactly once across WB round-0 matches for power-of-two', () => {
      const seeds = makeSeeds(8);
      const { winnersBracket, matchNodes } = generateDoubleElimBracket(seeds);

      const wbR0 = winnersBracket[0].matchNodeIds.map((id) =>
        matchNodes.find((n) => n.id === id)!
      );

      const teamIds: string[] = [];
      for (const node of wbR0) {
        if (node.homeTeamId) teamIds.push(node.homeTeamId);
        if (node.awayTeamId) teamIds.push(node.awayTeamId);
      }

      expect(teamIds).toHaveLength(8);
      expect(new Set(teamIds).size).toBe(8);
    });

    it('grand final is included in the flat matchNodes array', () => {
      const seeds = makeSeeds(8);
      const { grandFinal, matchNodes } = generateDoubleElimBracket(seeds);

      const found = matchNodes.find((n) => n.id === grandFinal.id);
      expect(found).toBeDefined();
    });
  });
});
