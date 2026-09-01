// ---------------------------------------------------------------------------
// bracketAlgorithms.ts — Pure-function bracket generation algorithms
// ---------------------------------------------------------------------------

import { randomUUID } from 'crypto';
import type {
  TournamentSeed,
  BracketOptions,
  Round,
  MatchNode,
  MatchNodeStatus,
} from '../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the smallest power of two ≥ n. */
export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Generates a standard round name based on the number of matches in that round. */
function roundName(matchCount: number, totalRounds: number, roundIndex: number): string {
  if (roundIndex === totalRounds - 1) return 'Final';
  if (roundIndex === totalRounds - 2) return 'Semifinals';
  if (roundIndex === totalRounds - 3) return 'Quarterfinals';
  const teamsInRound = matchCount * 2;
  return `Round of ${teamsInRound}`;
}

/**
 * Creates the seeded bracket positions using the standard fold pattern.
 *
 * For N slots (a power of two), this places seeds so that:
 * - Seed 1 is at the top, seed 2 is at the bottom (different halves)
 * - If all higher seeds win, seed 1 meets seed 2 only in the final
 * - In each sub-bracket, the highest seed faces the lowest seed
 *
 * The algorithm recursively builds the bracket positions. For a bracket of size N:
 * - Start with [1]
 * - For each doubling step, pair each existing position p with (currentSize + 1 - p)
 *
 * This produces the standard tennis/NCAA bracket placement.
 */
export function generateSeedPositions(bracketSize: number): number[] {
  if (bracketSize === 1) return [1];

  let positions = [1];
  let currentSize = 1;

  while (currentSize < bracketSize) {
    currentSize *= 2;
    const nextPositions: number[] = [];
    for (const p of positions) {
      nextPositions.push(p);
      nextPositions.push(currentSize + 1 - p);
    }
    positions = nextPositions;
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Single-Elimination Bracket Generation
// ---------------------------------------------------------------------------

/**
 * Generates a complete single-elimination bracket from the given seeds.
 *
 * - Determines rounds via ceil(log2(teamCount))
 * - Calculates BYEs: nextPowerOfTwo(teamCount) - teamCount
 * - Places seeds using fold pattern
 * - Assigns BYEs to highest seeds (lowest seed numbers)
 * - Creates MatchNode for each contest; marks BYE matches as completed
 * - Wires homeSourceMatchId / awaySourceMatchId for subsequent rounds
 * - Supports consolation match option (3rd place match between semifinal losers)
 */
export function generateSingleElimBracket(
  seeds: TournamentSeed[],
  options: BracketOptions
): { rounds: Round[]; matchNodes: MatchNode[] } {
  const teamCount = seeds.length;
  const bracketSize = nextPowerOfTwo(teamCount);
  const totalRounds = Math.ceil(Math.log2(bracketSize));
  const byeCount = bracketSize - teamCount;

  // Build a seed map for quick lookups
  const seedMap = new Map<number, TournamentSeed>();
  for (const s of seeds) {
    seedMap.set(s.seedNumber, s);
  }

  // Generate the bracket positions (which seed goes where in round 1)
  const positions = generateSeedPositions(bracketSize);

  // Determine which seeds receive BYEs (the highest seeds = lowest seed numbers)
  // BYEs are assigned to seeds 1..byeCount
  const byeSeeds = new Set<number>();
  for (let i = 1; i <= byeCount; i++) {
    byeSeeds.add(i);
  }

  // Create first-round match nodes
  const allMatchNodes: MatchNode[] = [];
  const rounds: Round[] = [];
  const firstRoundMatchCount = bracketSize / 2;

  const firstRoundNodes: MatchNode[] = [];
  for (let i = 0; i < firstRoundMatchCount; i++) {
    const homeSeedNum = positions[i * 2];
    const awaySeedNum = positions[i * 2 + 1];

    const homeSeed = seedMap.get(homeSeedNum) ?? null;
    const awaySeed = seedMap.get(awaySeedNum) ?? null;

    // Determine if either side is a BYE
    // A BYE occurs when the opposing seed number exceeds teamCount
    // (those positions are unfilled) OR when the seed is in byeSeeds set
    // and the opponent is the one that doesn't exist
    const homeIsBye = homeSeedNum > teamCount;
    const awayIsBye = awaySeedNum > teamCount;

    let homeTeamId: string | null = homeIsBye ? null : (homeSeed?.teamId ?? null);
    let awayTeamId: string | null = awayIsBye ? null : (awaySeed?.teamId ?? null);
    let homeSeedVal: number | null = homeIsBye ? null : homeSeedNum;
    let awaySeedVal: number | null = awayIsBye ? null : awaySeedNum;

    // A match is a BYE match if one side doesn't have a team
    const isBye = homeIsBye || awayIsBye;
    let status: MatchNodeStatus = 'pending';
    let winnerTeamId: string | null = null;
    let loserTeamId: string | null = null;

    if (isBye) {
      status = 'bye';
      // The team that exists wins automatically
      if (homeIsBye && !awayIsBye) {
        winnerTeamId = awayTeamId;
      } else if (awayIsBye && !homeIsBye) {
        winnerTeamId = homeTeamId;
      }
    }

    const node: MatchNode = {
      id: randomUUID(),
      roundIndex: 0,
      position: i,
      bracketSection: 'winners',
      homeTeamId,
      awayTeamId,
      homeSeed: homeSeedVal,
      awaySeed: awaySeedVal,
      homeSourceMatchId: null,
      awaySourceMatchId: null,
      homeSourceIsLoser: false,
      awaySourceIsLoser: false,
      status,
      homeScore: isBye ? null : null,
      awayScore: isBye ? null : null,
      winnerTeamId,
      loserTeamId,
      scheduledGameId: null,
      gameLogId: null,
      isBye,
    };

    firstRoundNodes.push(node);
    allMatchNodes.push(node);
  }

  rounds.push({
    index: 0,
    name: roundName(firstRoundMatchCount, totalRounds, 0),
    matchNodeIds: firstRoundNodes.map((n) => n.id),
  });

  // Create subsequent rounds
  let previousRoundNodes = firstRoundNodes;

  for (let r = 1; r < totalRounds; r++) {
    const matchCount = previousRoundNodes.length / 2;
    const roundNodes: MatchNode[] = [];

    for (let i = 0; i < matchCount; i++) {
      const homeSource = previousRoundNodes[i * 2];
      const awaySource = previousRoundNodes[i * 2 + 1];

      // If source matches are BYE matches, the winner is already known
      const homeTeamId = homeSource.status === 'bye' ? homeSource.winnerTeamId : null;
      const awayTeamId = awaySource.status === 'bye' ? awaySource.winnerTeamId : null;

      // Determine seeds for pre-determined teams
      let homeSeedVal: number | null = null;
      let awaySeedVal: number | null = null;
      if (homeTeamId && homeSource.winnerTeamId) {
        // The winner's seed — which side won?
        homeSeedVal = homeSource.homeTeamId === homeTeamId
          ? homeSource.homeSeed
          : homeSource.awaySeed;
      }
      if (awayTeamId && awaySource.winnerTeamId) {
        awaySeedVal = awaySource.homeTeamId === awayTeamId
          ? awaySource.homeSeed
          : awaySource.awaySeed;
      }

      const node: MatchNode = {
        id: randomUUID(),
        roundIndex: r,
        position: i,
        bracketSection: 'winners',
        homeTeamId,
        awayTeamId,
        homeSeed: homeSeedVal,
        awaySeed: awaySeedVal,
        homeSourceMatchId: homeSource.id,
        awaySourceMatchId: awaySource.id,
        homeSourceIsLoser: false,
        awaySourceIsLoser: false,
        status: 'pending',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        loserTeamId: null,
        scheduledGameId: null,
        gameLogId: null,
        isBye: false,
      };

      roundNodes.push(node);
      allMatchNodes.push(node);
    }

    rounds.push({
      index: r,
      name: roundName(matchCount, totalRounds, r),
      matchNodeIds: roundNodes.map((n) => n.id),
    });

    previousRoundNodes = roundNodes;
  }

  // Consolation match: 3rd place match between semifinal losers
  if (options.consolationMatch && totalRounds >= 2) {
    const semifinalRound = rounds[totalRounds - 2];
    const semifinalNodeIds = semifinalRound.matchNodeIds;

    // The two semifinal match nodes
    const semi1Id = semifinalNodeIds[0];
    const semi2Id = semifinalNodeIds[1];

    const consolationNode: MatchNode = {
      id: randomUUID(),
      roundIndex: totalRounds, // One beyond the final round index
      position: 0,
      bracketSection: 'consolation',
      homeTeamId: null,
      awayTeamId: null,
      homeSeed: null,
      awaySeed: null,
      homeSourceMatchId: semi1Id,
      awaySourceMatchId: semi2Id,
      homeSourceIsLoser: true,
      awaySourceIsLoser: true,
      status: 'pending',
      homeScore: null,
      awayScore: null,
      winnerTeamId: null,
      loserTeamId: null,
      scheduledGameId: null,
      gameLogId: null,
      isBye: false,
    };

    allMatchNodes.push(consolationNode);

    // Add a consolation round
    rounds.push({
      index: totalRounds,
      name: '3rd Place Match',
      matchNodeIds: [consolationNode.id],
    });
  }

  return { rounds, matchNodes: allMatchNodes };
}

// ---------------------------------------------------------------------------
// Round-Robin Schedule Generation
// ---------------------------------------------------------------------------

/**
 * Generates a complete round-robin schedule using the "circle method".
 *
 * Algorithm:
 * - If N is odd, add a phantom BYE team so N becomes even.
 * - Fix team at position 0 (the "pivot"), rotate the remaining N-1 teams
 *   clockwise each round.
 * - Each round pairs: pivot vs last, 1st vs (N-2)th, 2nd vs (N-3)th, etc.
 * - For N even: N-1 rounds, floor(N/2) matches per round.
 * - For N odd: N rounds, floor(N/2) matches per round (one match per round is
 *   a BYE — the team scheduled against the phantom pivot).
 *
 * Guarantees (see design Property 5):
 * - Every real team plays every other real team exactly once.
 * - No real team appears more than once per round.
 * - Total real matches = N_real * (N_real - 1) / 2.
 */
export function generateRoundRobinSchedule(
  seeds: TournamentSeed[]
): { rounds: Round[]; matchNodes: MatchNode[] } {
  const teamCount = seeds.length;

  // -----------------------------------------------------------------------
  // Normalise: if odd number of teams, add a phantom BYE team at the end.
  // -----------------------------------------------------------------------
  const isOdd = teamCount % 2 !== 0;
  // Working list of seed numbers (1-based). Position 0 is the fixed pivot.
  // When isOdd, we append 0 as the phantom BYE seat.
  const seats: (number | 0)[] = seeds.map((s) => s.seedNumber);
  if (isOdd) {
    seats.push(0); // 0 = BYE placeholder
  }
  const n = seats.length; // always even now
  const numRounds = n - 1; // N-1 rounds for N even

  // Build a quick lookup from seed number → TournamentSeed
  const seedMap = new Map<number, TournamentSeed>();
  for (const s of seeds) {
    seedMap.set(s.seedNumber, s);
  }

  // -----------------------------------------------------------------------
  // Circle method: fix seats[0], rotate seats[1..n-1] each round.
  // -----------------------------------------------------------------------
  // `ring` is the rotating part (length n-1).
  const ring: (number | 0)[] = seats.slice(1);

  const allMatchNodes: MatchNode[] = [];
  const rounds: Round[] = [];

  for (let r = 0; r < numRounds; r++) {
    // Current round pairings:
    // Pair 0: pivot (seats[0]) vs ring[n-2] (last element of ring)
    // Pairs 1..n/2-1: ring[i-1] vs ring[n-2-i]
    const pivot = seats[0];
    const matchesPerRound = n / 2;
    const roundNodes: MatchNode[] = [];

    for (let i = 0; i < matchesPerRound; i++) {
      let homeSeatNum: number | 0;
      let awaySeatNum: number | 0;

      if (i === 0) {
        // Pivot pairing
        homeSeatNum = pivot;
        awaySeatNum = ring[n - 2]; // last element of ring
      } else {
        homeSeatNum = ring[i - 1];
        awaySeatNum = ring[n - 2 - i];
      }

      const isBye = homeSeatNum === 0 || awaySeatNum === 0;
      const homeSeedEntry = homeSeatNum !== 0 ? seedMap.get(homeSeatNum as number) ?? null : null;
      const awaySeedEntry = awaySeatNum !== 0 ? seedMap.get(awaySeatNum as number) ?? null : null;

      const node: MatchNode = {
        id: randomUUID(),
        roundIndex: r,
        position: i,
        bracketSection: 'round-robin',
        homeTeamId: homeSeedEntry?.teamId ?? null,
        awayTeamId: awaySeedEntry?.teamId ?? null,
        homeSeed: homeSeatNum !== 0 ? (homeSeatNum as number) : null,
        awaySeed: awaySeatNum !== 0 ? (awaySeatNum as number) : null,
        homeSourceMatchId: null,
        awaySourceMatchId: null,
        homeSourceIsLoser: false,
        awaySourceIsLoser: false,
        status: isBye ? 'bye' : 'pending',
        homeScore: null,
        awayScore: null,
        winnerTeamId: isBye ? (homeSeedEntry?.teamId ?? awaySeedEntry?.teamId ?? null) : null,
        loserTeamId: null,
        scheduledGameId: null,
        gameLogId: null,
        isBye,
      };

      roundNodes.push(node);
      allMatchNodes.push(node);
    }

    rounds.push({
      index: r,
      name: `Round ${r + 1}`,
      matchNodeIds: roundNodes.map((n) => n.id),
    });

    // Rotate ring clockwise by 1 position (last element moves to front)
    const last = ring[ring.length - 1];
    ring.pop();
    ring.unshift(last);
  }

  return { rounds, matchNodes: allMatchNodes };
}

// ---------------------------------------------------------------------------
// Double-Elimination Bracket Generation
// ---------------------------------------------------------------------------

/**
 * Generates a complete double-elimination bracket from the given seeds.
 *
 * Structure:
 * - Winners_Bracket: identical seeded placement to single-elimination
 * - Losers_Bracket: `2 * (winnersRounds - 1)` rounds with this pattern:
 *     - LB R0:  WB round-0 losers pair against each other (initial drop)
 *     - LB R1:  LB-R0 survivors + WB round-1 losers (drop-in)
 *     - LB R2:  LB-R1 survivors play each other (play round)
 *     - LB R3:  LB-R2 survivors + WB round-2 losers (drop-in)
 *     - LB R4:  play ... Last LB round: LB Final
 * - Grand Final: Winners_Bracket champion vs Losers_Bracket champion.
 *
 * Returns:
 * - `winnersBracket`: the Winners_Bracket rounds (subset of all rounds)
 * - `losersBracket`: the Losers_Bracket rounds (subset of all rounds)
 * - `grandFinal`: the Grand Final MatchNode
 * - `matchNodes`: flat array of ALL MatchNodes across winners + losers + grand final
 */
export function generateDoubleElimBracket(seeds: TournamentSeed[]): {
  winnersBracket: Round[];
  losersBracket: Round[];
  grandFinal: MatchNode;
  matchNodes: MatchNode[];
} {
  const teamCount = seeds.length;
  const bracketSize = nextPowerOfTwo(teamCount);
  const winnersRounds = Math.ceil(Math.log2(bracketSize)); // same as single-elim

  // -------------------------------------------------------------------------
  // Step 1: Build Winners_Bracket using same algorithm as single-elimination
  //         (but without consolation, and using 'winners' bracketSection)
  // -------------------------------------------------------------------------

  const seedMap = new Map<number, TournamentSeed>();
  for (const s of seeds) {
    seedMap.set(s.seedNumber, s);
  }

  const positions = generateSeedPositions(bracketSize);
  const firstRoundMatchCount = bracketSize / 2;

  const allMatchNodes: MatchNode[] = [];

  // Build first round
  const wbFirstRound: MatchNode[] = [];
  for (let i = 0; i < firstRoundMatchCount; i++) {
    const homeSeedNum = positions[i * 2];
    const awaySeedNum = positions[i * 2 + 1];

    const homeSeed = seedMap.get(homeSeedNum) ?? null;
    const awaySeed = seedMap.get(awaySeedNum) ?? null;

    const homeIsBye = homeSeedNum > teamCount;
    const awayIsBye = awaySeedNum > teamCount;

    const homeTeamId: string | null = homeIsBye ? null : (homeSeed?.teamId ?? null);
    const awayTeamId: string | null = awayIsBye ? null : (awaySeed?.teamId ?? null);
    const homeSeedVal: number | null = homeIsBye ? null : homeSeedNum;
    const awaySeedVal: number | null = awayIsBye ? null : awaySeedNum;

    const isBye = homeIsBye || awayIsBye;
    let status: MatchNodeStatus = isBye ? 'bye' : 'pending';
    let winnerTeamId: string | null = null;

    if (isBye) {
      winnerTeamId = homeIsBye ? awayTeamId : homeTeamId;
    }

    const node: MatchNode = {
      id: randomUUID(),
      roundIndex: 0,
      position: i,
      bracketSection: 'winners',
      homeTeamId,
      awayTeamId,
      homeSeed: homeSeedVal,
      awaySeed: awaySeedVal,
      homeSourceMatchId: null,
      awaySourceMatchId: null,
      homeSourceIsLoser: false,
      awaySourceIsLoser: false,
      status,
      homeScore: null,
      awayScore: null,
      winnerTeamId,
      loserTeamId: null,
      scheduledGameId: null,
      gameLogId: null,
      isBye,
    };

    wbFirstRound.push(node);
    allMatchNodes.push(node);
  }

  // Build subsequent Winners_Bracket rounds
  const wbRoundNodes: MatchNode[][] = [wbFirstRound];
  let previousWbRound = wbFirstRound;

  for (let r = 1; r < winnersRounds; r++) {
    const matchCount = previousWbRound.length / 2;
    const roundNodes: MatchNode[] = [];

    for (let i = 0; i < matchCount; i++) {
      const homeSource = previousWbRound[i * 2];
      const awaySource = previousWbRound[i * 2 + 1];

      // If source is a BYE match, the winner is already known
      const homeTeamId = homeSource.status === 'bye' ? homeSource.winnerTeamId : null;
      const awayTeamId = awaySource.status === 'bye' ? awaySource.winnerTeamId : null;

      let homeSeedVal: number | null = null;
      let awaySeedVal: number | null = null;
      if (homeTeamId && homeSource.winnerTeamId) {
        homeSeedVal = homeSource.homeTeamId === homeTeamId
          ? homeSource.homeSeed
          : homeSource.awaySeed;
      }
      if (awayTeamId && awaySource.winnerTeamId) {
        awaySeedVal = awaySource.homeTeamId === awayTeamId
          ? awaySource.homeSeed
          : awaySource.awaySeed;
      }

      const node: MatchNode = {
        id: randomUUID(),
        roundIndex: r,
        position: i,
        bracketSection: 'winners',
        homeTeamId,
        awayTeamId,
        homeSeed: homeSeedVal,
        awaySeed: awaySeedVal,
        homeSourceMatchId: homeSource.id,
        awaySourceMatchId: awaySource.id,
        homeSourceIsLoser: false,
        awaySourceIsLoser: false,
        status: 'pending',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        loserTeamId: null,
        scheduledGameId: null,
        gameLogId: null,
        isBye: false,
      };

      roundNodes.push(node);
      allMatchNodes.push(node);
    }

    wbRoundNodes.push(roundNodes);
    previousWbRound = roundNodes;
  }

  // Build Winners_Bracket Round descriptors (roundIndex 0..winnersRounds-1)
  const winnersBracketRounds: Round[] = wbRoundNodes.map((nodes, r) => ({
    index: r,
    name: wbRoundName(nodes.length, winnersRounds, r),
    matchNodeIds: nodes.map((n) => n.id),
  }));

  // -------------------------------------------------------------------------
  // Step 2: Build Losers_Bracket
  //
  // Total LB rounds = 2 * (winnersRounds - 1).
  // Round pattern (lbR = local LB round index, 0-based):
  //   lbR=0       → Initial: WB round-0 losers pair among themselves
  //   lbR=1       → Drop-in: LB-R0 survivors + WB round-1 losers
  //   lbR=2       → Play: LB-R1 survivors meet each other
  //   lbR=3       → Drop-in: LB-R2 survivors + WB round-2 losers
  //   lbR=4       → Play ...
  //   Even lbR≥2  → Play round
  //   lbR=0 or odd lbR → Drop-in round
  //   WB drop-in for odd lbR: WB-R[(lbR+1)/2]
  //
  // Losers bracket global roundIndex = winnersRounds + lbR (no clash with WB).
  // -------------------------------------------------------------------------

  const totalLbRounds = 2 * (winnersRounds - 1);
  const losersBracketRounds: Round[] = [];
  let lbSurvivorNodes: MatchNode[] = []; // output nodes of the previous LB round

  for (let lbR = 0; lbR < totalLbRounds; lbR++) {
    const lbRoundIndex = winnersRounds + lbR; // global round index (no clash with WB)
    const roundNodes: MatchNode[] = [];
    // Even lbR >= 2 are pure play rounds; all others are drop-in rounds
    const isPlayRound = lbR >= 2 && lbR % 2 === 0;

    if (isPlayRound) {
      // Play round: LB survivors face each other, halving the field
      const matchCount = lbSurvivorNodes.length / 2;
      for (let i = 0; i < matchCount; i++) {
        const homeSource = lbSurvivorNodes[i * 2];
        const awaySource = lbSurvivorNodes[i * 2 + 1];
        roundNodes.push({
          id: randomUUID(), roundIndex: lbRoundIndex, position: i,
          bracketSection: 'losers',
          homeTeamId: null, awayTeamId: null, homeSeed: null, awaySeed: null,
          homeSourceMatchId: homeSource.id, awaySourceMatchId: awaySource.id,
          homeSourceIsLoser: false, awaySourceIsLoser: false,
          status: 'pending', homeScore: null, awayScore: null,
          winnerTeamId: null, loserTeamId: null,
          scheduledGameId: null, gameLogId: null, isBye: false,
        });
      }
    } else if (lbR === 0) {
      // Initial round: WB round-0 losers pair among themselves (first vs last half)
      const wbR0Matches = wbRoundNodes[0];
      const loserCount = wbR0Matches.length;
      const matchCount = loserCount / 2;
      for (let i = 0; i < matchCount; i++) {
        roundNodes.push({
          id: randomUUID(), roundIndex: lbRoundIndex, position: i,
          bracketSection: 'losers',
          homeTeamId: null, awayTeamId: null, homeSeed: null, awaySeed: null,
          homeSourceMatchId: wbR0Matches[i].id,
          awaySourceMatchId: wbR0Matches[loserCount - 1 - i].id,
          homeSourceIsLoser: true, awaySourceIsLoser: true, // take loser of WB match
          status: 'pending', homeScore: null, awayScore: null,
          winnerTeamId: null, loserTeamId: null,
          scheduledGameId: null, gameLogId: null, isBye: false,
        });
      }
    } else {
      // Odd lbR >= 1: LB survivors + WB[(lbR+1)/2] losers, paired one-to-one
      const wbDropInRoundIndex = (lbR + 1) / 2;
      const wbDropInMatches = wbRoundNodes[wbDropInRoundIndex];
      const matchCount = lbSurvivorNodes.length;
      for (let i = 0; i < matchCount; i++) {
        roundNodes.push({
          id: randomUUID(), roundIndex: lbRoundIndex, position: i,
          bracketSection: 'losers',
          homeTeamId: null, awayTeamId: null, homeSeed: null, awaySeed: null,
          homeSourceMatchId: lbSurvivorNodes[i].id, // winner of prev LB match
          awaySourceMatchId: wbDropInMatches[i].id, // loser of WB match (drops in)
          homeSourceIsLoser: false, // take WINNER of LB match
          awaySourceIsLoser: true,  // take LOSER of WB match
          status: 'pending', homeScore: null, awayScore: null,
          winnerTeamId: null, loserTeamId: null,
          scheduledGameId: null, gameLogId: null, isBye: false,
        });
      }
    }

    for (const n of roundNodes) allMatchNodes.push(n);
    lbSurvivorNodes = roundNodes;

    losersBracketRounds.push({
      index: lbRoundIndex,
      name: lbRoundName(lbR, totalLbRounds),
      matchNodeIds: roundNodes.map((n) => n.id),
    });
  }

  // -------------------------------------------------------------------------
  // Step 3: Grand Final
  //   home: winner of the WB Final (homeSourceIsLoser = false)
  //   away: winner of the LB Final (awaySourceIsLoser = false)
  //   For 2-team brackets (no LB rounds), awaySourceMatchId = null.
  // -------------------------------------------------------------------------

  const wbFinalNode = wbRoundNodes[winnersRounds - 1][0];
  const lbFinalNode: MatchNode | undefined = lbSurvivorNodes[0];
  const grandFinalRoundIndex = winnersRounds + totalLbRounds;

  const grandFinal: MatchNode = {
    id: randomUUID(),
    roundIndex: grandFinalRoundIndex,
    position: 0,
    bracketSection: 'final',
    homeTeamId: null,
    awayTeamId: null,
    homeSeed: null,
    awaySeed: null,
    homeSourceMatchId: wbFinalNode.id,
    awaySourceMatchId: lbFinalNode?.id ?? null,
    homeSourceIsLoser: false, // WB champion (winner of WB final)
    awaySourceIsLoser: false, // LB champion (winner of LB final)
    status: 'pending',
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    loserTeamId: null,
    scheduledGameId: null,
    gameLogId: null,
    isBye: false,
  };

  allMatchNodes.push(grandFinal);

  return {
    winnersBracket: winnersBracketRounds,
    losersBracket: losersBracketRounds,
    grandFinal,
    matchNodes: allMatchNodes,
  };
}

// ---------------------------------------------------------------------------
// Private helpers for Double-Elimination round naming
// ---------------------------------------------------------------------------

function wbRoundName(matchCount: number, totalWbRounds: number, roundIndex: number): string {
  if (roundIndex === totalWbRounds - 1) return 'Winners Final';
  if (roundIndex === totalWbRounds - 2) return 'Winners Semifinals';
  if (roundIndex === totalWbRounds - 3) return 'Winners Quarterfinals';
  return `Winners Round of ${matchCount * 2}`;
}

function lbRoundName(lbR: number, totalLbRounds: number): string {
  if (lbR === totalLbRounds - 1) return 'Losers Final';
  if (lbR === 0) return 'Losers Round 1';
  // Odd drop-in rounds: lbR=1→R2, lbR=3→R3, lbR=5→R4 ...
  // Even play rounds:   lbR=2→R2B, lbR=4→R3B ...
  const isPlayRound = lbR % 2 === 0;
  const num = isPlayRound ? lbR / 2 + 1 : (lbR + 3) / 2;
  return isPlayRound ? `Losers Round ${num}B` : `Losers Round ${num}`;
}
