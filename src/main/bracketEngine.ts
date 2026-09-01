/**
 * BracketEngine — tournament lifecycle management.
 *
 * Manages tournament creation, deletion, reset, and retrieval.
 * Each tournament is persisted as a single JSON file at:
 *   {userData}/tournaments/{ligaId}/{tournamentId}.json
 *
 * Follows the same factory/interface pattern as ligaStore.ts.
 */

import { app } from 'electron';
import { join } from 'path';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from 'fs';
import { randomUUID } from 'crypto';
import type {
  Tournament,
  TournamentSummary,
  TournamentSeed,
  BracketFormat,
  TournamentStatus,
  BracketOptions,
  MatchNode,
  BracketPayload,
  BracketUpdatePayload,
  GameLogRecord,
} from '../shared/types';
import type { LigaStore } from './ligaStore';
import type { OverlayServer } from './overlayServer';
import { exportBracketPdf as generateBracketPdf } from './exportService';
import {
  generateSingleElimBracket,
  generateDoubleElimBracket,
  generateRoundRobinSchedule,
} from './bracketAlgorithms';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_FORMATS: BracketFormat[] = [
  'single-elimination',
  'double-elimination',
  'round-robin',
];

function tournamentsDir(ligaId: string): string {
  const dir = join(app.getPath('userData'), 'tournaments', ligaId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function tournamentPath(ligaId: string, tournamentId: string): string {
  return join(tournamentsDir(ligaId), `${tournamentId}.json`);
}

/**
 * Validates that the minimum required fields are present on a parsed Tournament.
 * Requirements 1.5, 7.5
 */
function isValidTournamentData(data: unknown): data is Tournament {
  if (typeof data !== 'object' || data === null) return false;
  const t = data as Record<string, unknown>;
  return (
    typeof t.id === 'string' && t.id.length > 0 &&
    typeof t.name === 'string' && t.name.length > 0 &&
    typeof t.format === 'string' &&
    typeof t.status === 'string' &&
    typeof t.createdAt === 'string' && t.createdAt.length > 0 &&
    typeof t.ligaId === 'string' && t.ligaId.length > 0
  );
}

/**
 * Reads and parses a single tournament JSON file.
 * Returns null (and logs a warning) if the file is missing or corrupted.
 * Requirement 7.5
 */
function readTournamentFile(filePath: string): Tournament | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isValidTournamentData(parsed)) {
      console.warn(`[BracketEngine] Tournament file failed validation: ${filePath}`);
      return null;
    }
    return parsed;
  } catch {
    console.warn(`[BracketEngine] Failed to read tournament file: ${filePath}`);
    return null;
  }
}

/**
 * Writes the full tournament state to disk.
 * Requirement 7.1
 */
function writeTournamentFile(tournament: Tournament): void {
  const path = tournamentPath(tournament.ligaId, tournament.id);
  writeFileSync(path, JSON.stringify(tournament, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AdvanceResult {
  tournament: Tournament;
  advanced: boolean;
  nextMatchNodeId?: string;
  isTie?: boolean;
}

export interface RevertResult {
  tournament: Tournament;
  revertedMatchNodeId: string;
  clearedDownstreamIds: string[];
}

export interface SeedResult {
  tournament: Tournament;
}

export interface BracketEngine {
  // Tournament lifecycle
  createTournament(ligaId: string, name: string, format: BracketFormat): Tournament;
  deleteTournament(tournamentId: string): void;
  resetTournament(tournamentId: string): Tournament;

  // Seeding
  autoSeed(tournamentId: string): SeedResult;
  manualSeed(tournamentId: string, teamIds: string[]): SeedResult;

  // Bracket generation
  generateBracket(tournamentId: string, options?: BracketOptions): Tournament;

  // Match progression (Requirements 4.1–4.7, 9.1, 9.2)
  recordResult(tournamentId: string, matchNodeId: string, homeScore: number, awayScore: number): AdvanceResult;
  revertResult(tournamentId: string, matchNodeId: string): RevertResult;
  onGameLogSaved(record: GameLogRecord): AdvanceResult | null;
  onGameLogDeleted(ligaId: string, logId: string): RevertResult | null;

  // Queries
  getTournament(tournamentId: string): Tournament;
  listTournaments(ligaId: string): TournamentSummary[];
  getActiveTournament(ligaId: string): Tournament | null;

  // Real-time (Requirements 9.1–9.4)
  broadcastBracketState(tournamentId: string): void;
  getFullBracketPayload(tournamentId: string): BracketPayload;

  // Export (Requirements 8.1–8.6)
  exportBracketPdf(tournamentId: string, destPath: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface BracketEngineDeps {
  ligaStore: LigaStore;
  /** Optional overlay server for real-time WebSocket broadcasts (Requirements 9.1–9.3). */
  overlayServer?: OverlayServer;
  /** Override for app.getPath('userData') in tests — not used in production. */
  userDataPath?: string;
}

// ---------------------------------------------------------------------------
// In-memory index: tournamentId → ligaId (populated by scanning files)
// Enables getTournament(id) without knowing the ligaId up front.
// ---------------------------------------------------------------------------

type TournamentIndex = Map<string, string>; // tournamentId → ligaId

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBracketEngine(deps: BracketEngineDeps): BracketEngine {
  const { ligaStore } = deps;
  const overlayServer = deps.overlayServer ?? null;

  /**
   * A lazy index mapping tournamentId → ligaId.
   * Built on first use; invalidated on create/delete operations.
   *
   * Note: The index is built from the filesystem scan so it stays consistent
   * across simulated restarts in integration tests.
   */
  let index: TournamentIndex | null = null;

  /** Resolve the base data directory. In tests the dep can override it. */
  function getDataDir(): string {
    return deps.userDataPath ?? app.getPath('userData');
  }

  function tournamentsBaseDir(): string {
    return join(getDataDir(), 'tournaments');
  }

  function resolvedTournamentsDir(ligaId: string): string {
    const dir = join(tournamentsBaseDir(), ligaId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  function resolvedTournamentPath(ligaId: string, tournamentId: string): string {
    return join(resolvedTournamentsDir(ligaId), `${tournamentId}.json`);
  }

  function readFile(filePath: string): Tournament | null {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!isValidTournamentData(parsed)) {
        console.warn(`[BracketEngine] Tournament file failed validation: ${filePath}`);
        return null;
      }
      return parsed;
    } catch {
      console.warn(`[BracketEngine] Failed to read tournament file: ${filePath}`);
      return null;
    }
  }

  function writeFile(tournament: Tournament): void {
    const path = resolvedTournamentPath(tournament.ligaId, tournament.id);
    writeFileSync(path, JSON.stringify(tournament, null, 2), 'utf-8');
  }

  /**
   * Builds (or rebuilds) the in-memory index by scanning all liga subdirectories
   * under the tournaments base folder.
   */
  function buildIndex(): TournamentIndex {
    const newIndex: TournamentIndex = new Map();
    const base = tournamentsBaseDir();
    if (!existsSync(base)) return newIndex;

    let ligaDirs: string[];
    try {
      ligaDirs = readdirSync(base);
    } catch {
      return newIndex;
    }

    for (const ligaId of ligaDirs) {
      const ligaDir = join(base, ligaId);
      let files: string[];
      try {
        files = readdirSync(ligaDir).filter((f) => f.endsWith('.json'));
      } catch {
        continue;
      }
      for (const file of files) {
        const tournamentId = file.replace(/\.json$/, '');
        newIndex.set(tournamentId, ligaId);
      }
    }

    return newIndex;
  }

  function getIndex(): TournamentIndex {
    if (!index) {
      index = buildIndex();
    }
    return index;
  }

  function invalidateIndex(): void {
    index = null;
  }

  /**
   * Finds the ligaId for a given tournamentId.
   * Throws if not found.
   */
  function findLigaIdForTournament(tournamentId: string): string {
    const idx = getIndex();
    const ligaId = idx.get(tournamentId);
    if (!ligaId) {
      throw new Error(`Tournament "${tournamentId}" not found.`);
    }
    return ligaId;
  }

  // ---------------------------------------------------------------------------
  // Broadcast helpers (Requirements 9.1, 9.2, 9.3)
  // ---------------------------------------------------------------------------

  /**
   * Builds a BracketPayload from a full Tournament object.
   * Used for initial connection delivery and full-state broadcasts.
   */
  function buildFullPayload(tournament: Tournament): BracketPayload {
    return {
      tournamentId: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      seeds: tournament.seeds,
      matchNodes: tournament.matchNodes,
      rounds: tournament.rounds,
      winnersBracket: tournament.winnersBracket,
      losersBracket: tournament.losersBracket,
      grandFinal: tournament.grandFinal,
      standings: tournament.standings,
      championTeamId: tournament.championTeamId,
    };
  }

  /**
   * Broadcasts a full bracket state to all connected WebSocket clients.
   * No-op if overlayServer is not wired in.
   */
  function broadcastFull(tournament: Tournament): void {
    if (!overlayServer) return;
    overlayServer.broadcastBracket(buildFullPayload(tournament));
  }

  /**
   * Broadcasts an incremental bracket update to all connected WebSocket clients.
   * Only sends the changed match nodes plus status/champion info.
   * No-op if overlayServer is not wired in.
   */
  function broadcastUpdate(tournament: Tournament, changedNodes: MatchNode[]): void {
    if (!overlayServer) return;
    const payload: BracketUpdatePayload = {
      tournamentId: tournament.id,
      updatedMatchNodes: changedNodes,
      status: tournament.status,
      championTeamId: tournament.championTeamId,
    };
    overlayServer.broadcastBracket(payload);
  }

  // ---------------------------------------------------------------------------
  // Match progression helpers
  // ---------------------------------------------------------------------------

  /**
   * Recursively collects all match nodes that depend (directly or transitively)
   * on the result of a given match node — used for downstream reversion.
   * Requirement 4.5
   */
  function collectDownstreamNodeIds(
    matchNodeId: string,
    allNodes: MatchNode[],
  ): string[] {
    const downstream: string[] = [];
    const queue: string[] = [matchNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const node of allNodes) {
        if (node.id === current) continue; // skip self
        const dependsOnCurrent =
          node.homeSourceMatchId === current ||
          node.awaySourceMatchId === current;
        if (dependsOnCurrent && !visited.has(node.id)) {
          downstream.push(node.id);
          queue.push(node.id);
        }
      }
    }

    return downstream;
  }

  /**
   * Checks if all match nodes in the tournament are resolved (completed or BYE).
   * Used to determine if the tournament should transition to "completed" status.
   * Requirement 4.4
   */
  function allMatchesResolved(matchNodes: MatchNode[]): boolean {
    return matchNodes.every((n) => n.status === 'completed' || n.status === 'bye');
  }

  /**
   * Advances bracket state after a match result is recorded.
   * Returns the list of nodes that were changed (for incremental broadcast).
   */
  function applyResult(
    tournament: Tournament,
    matchNodeId: string,
    homeScore: number,
    awayScore: number,
  ): { updated: Tournament; changedNodes: MatchNode[] } {
    const nodeIndex = tournament.matchNodes.findIndex((n) => n.id === matchNodeId);
    if (nodeIndex === -1) {
      throw new Error(`Match node "${matchNodeId}" not found in tournament "${tournament.id}".`);
    }

    const node = tournament.matchNodes[nodeIndex];

    // Requirement 4.6: tied scores — do not advance
    if (homeScore === awayScore) {
      // Update the node score but mark as not advanced (no winner set)
      const updatedNode: MatchNode = {
        ...node,
        homeScore,
        awayScore,
        status: 'in-progress',
      };
      const updatedNodes = [...tournament.matchNodes];
      updatedNodes[nodeIndex] = updatedNode;
      const updated: Tournament = {
        ...tournament,
        matchNodes: updatedNodes,
        updatedAt: new Date().toISOString(),
      };
      return { updated, changedNodes: [updatedNode] };
    }

    const winnerId = homeScore > awayScore
      ? node.homeTeamId
      : node.awayTeamId;
    const loserId = homeScore > awayScore
      ? node.awayTeamId
      : node.homeTeamId;

    const completedNode: MatchNode = {
      ...node,
      homeScore,
      awayScore,
      winnerTeamId: winnerId,
      loserTeamId: loserId,
      status: 'completed',
    };

    const changedNodeIds = new Set<string>([matchNodeId]);
    let updatedNodes = [...tournament.matchNodes];
    updatedNodes[nodeIndex] = completedNode;

    // Advance winner and loser to next round nodes (Requirements 4.1, 4.2)
    for (let i = 0; i < updatedNodes.length; i++) {
      const n = updatedNodes[i];
      let changed = false;
      let patch: Partial<MatchNode> = {};

      // Winner advances into next round's home or away slot
      if (n.homeSourceMatchId === matchNodeId && !n.homeSourceIsLoser) {
        patch = { ...patch, homeTeamId: winnerId };
        changed = true;
      }
      if (n.awaySourceMatchId === matchNodeId && !n.awaySourceIsLoser) {
        patch = { ...patch, awayTeamId: winnerId };
        changed = true;
      }

      // Loser slot (losers bracket in double-elim, Req 4.2)
      if (n.homeSourceMatchId === matchNodeId && n.homeSourceIsLoser) {
        patch = { ...patch, homeTeamId: loserId };
        changed = true;
      }
      if (n.awaySourceMatchId === matchNodeId && n.awaySourceIsLoser) {
        patch = { ...patch, awayTeamId: loserId };
        changed = true;
      }

      if (changed) {
        updatedNodes[i] = { ...n, ...patch };
        changedNodeIds.add(n.id);
      }
    }

    // Requirement 4.3: if loserId placed into losers bracket and then loses again → eliminated
    // (The loser of a losers-bracket match has loserTeamId set — no further bracket slot targets it.)

    // Check for tournament completion (Requirement 4.4)
    let newStatus: TournamentStatus = tournament.status;
    let championTeamId: string | undefined = tournament.championTeamId;
    if (allMatchesResolved(updatedNodes)) {
      newStatus = 'completed';
      // The winner of the last match is the champion
      championTeamId = completedNode.winnerTeamId ?? undefined;
    }

    const updated: Tournament = {
      ...tournament,
      matchNodes: updatedNodes,
      status: newStatus,
      championTeamId,
      updatedAt: new Date().toISOString(),
    };

    const changedNodes = updatedNodes.filter((n) => changedNodeIds.has(n.id));
    return { updated, changedNodes };
  }

  return {
    // -----------------------------------------------------------------------
    // createTournament
    // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
    // -----------------------------------------------------------------------
    createTournament(ligaId: string, name: string, format: BracketFormat): Tournament {
      // Validate format (Req 1.2, 1.7)
      if (!VALID_FORMATS.includes(format)) {
        throw new Error(
          `Unsupported bracket format "${format}". Valid formats: ${VALID_FORMATS.join(', ')}.`
        );
      }

      // Validate name (Req 1.6)
      const trimmedName = name.trim();
      if (trimmedName.length === 0) {
        throw new Error('Tournament name must not be empty or blank.');
      }
      if (trimmedName.length > 100) {
        throw new Error('Tournament name must be 100 characters or fewer.');
      }

      // Validate Liga exists (Req 1.4)
      try {
        ligaStore.loadLiga(ligaId);
      } catch {
        throw new Error(`Liga "${ligaId}" not found.`);
      }

      // Create tournament (Req 1.3, 1.5)
      const now = new Date().toISOString();
      const tournament: Tournament = {
        id: randomUUID(),
        ligaId,
        name: trimmedName,
        format,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        seeds: [],
        rounds: [],
        matchNodes: [],
        options: {
          consolationMatch: false,
        },
      };

      writeFile(tournament);
      invalidateIndex();
      return tournament;
    },

    // -----------------------------------------------------------------------
    // autoSeed
    // Requirements: 2.1, 2.3, 2.4, 2.7, 2.8
    // -----------------------------------------------------------------------
    autoSeed(tournamentId: string): SeedResult {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }

      // Load all teams from the Liga (Req 2.3)
      const liga = ligaStore.loadLiga(ligaId);
      const teams = liga.teams;

      if (teams.length < 2) {
        throw new Error('At least 2 teams are required in the Liga to auto-seed.');
      }
      if (teams.length > 64) {
        throw new Error('Cannot seed more than 64 teams into a tournament. (Req 2.8)');
      }

      // Load all game logs to compute win/loss records and point differentials.
      // GameLogRecord stores team *names* (homeTeam/awayTeam strings).
      // We also check scheduledGameId → ScheduledGame for ID-based matching.
      const schedule = liga.schedule ?? [];
      const scheduledGameMap = new Map(schedule.map((g) => [g.id, g]));

      // Accumulator: teamId → { wins, losses, pointDifferential }
      interface TeamRecord {
        wins: number;
        losses: number;
        pointDifferential: number;
      }
      const records = new Map<string, TeamRecord>();
      for (const team of teams) {
        records.set(team.id, { wins: 0, losses: 0, pointDifferential: 0 });
      }

      // Build name → teamId map for name-based fallback matching.
      // If multiple teams share a name, name-based matching is skipped for those.
      const nameToTeamIds = new Map<string, string[]>();
      for (const team of teams) {
        const key = team.name.toLowerCase();
        const existing = nameToTeamIds.get(key) ?? [];
        existing.push(team.id);
        nameToTeamIds.set(key, existing);
      }

      // Enumerate game logs
      let gameLogs: Array<import('../shared/types').GameLogRecord>;
      try {
        const logList = ligaStore.listGameLogs(ligaId);
        gameLogs = logList.map((entry) => ligaStore.loadGameLog(ligaId, entry.id));
      } catch {
        gameLogs = [];
      }

      for (const log of gameLogs) {
        let homeTeamId: string | null = null;
        let awayTeamId: string | null = null;

        // Prefer ID-based matching via scheduledGameId link
        if (log.scheduledGameId) {
          const scheduled = scheduledGameMap.get(log.scheduledGameId);
          if (scheduled) {
            homeTeamId = records.has(scheduled.homeTeamId) ? scheduled.homeTeamId : null;
            awayTeamId = records.has(scheduled.awayTeamId) ? scheduled.awayTeamId : null;
          }
        }

        // Fallback: name-based matching
        if (!homeTeamId) {
          const homeIds = nameToTeamIds.get(log.homeTeam.toLowerCase()) ?? [];
          if (homeIds.length === 1) homeTeamId = homeIds[0];
        }
        if (!awayTeamId) {
          const awayIds = nameToTeamIds.get(log.awayTeam.toLowerCase()) ?? [];
          if (awayIds.length === 1) awayTeamId = awayIds[0];
        }

        // Skip if we can't identify both teams in this Liga
        if (!homeTeamId || !awayTeamId) continue;

        const homeScore = log.finalScores.home;
        const awayScore = log.finalScores.away;

        const homeRec = records.get(homeTeamId)!;
        const awayRec = records.get(awayTeamId)!;

        if (homeScore > awayScore) {
          homeRec.wins++;
          awayRec.losses++;
        } else if (awayScore > homeScore) {
          awayRec.wins++;
          homeRec.losses++;
        }
        // Ties: neither wins nor losses — per design, tied games don't advance brackets

        homeRec.pointDifferential += homeScore - awayScore;
        awayRec.pointDifferential += awayScore - homeScore;
      }

      // Sort teams by:
      //   1. Wins descending
      //   2. Point differential descending (tiebreaker, Req 2.7)
      //   3. Team name alphabetically ascending (final tiebreaker, Req 2.7)
      // Teams with no game logs get 0-0 records and go to the bottom (Req 2.1)
      const sortedTeams = [...teams].sort((a, b) => {
        const ra = records.get(a.id)!;
        const rb = records.get(b.id)!;
        if (rb.wins !== ra.wins) return rb.wins - ra.wins;
        if (rb.pointDifferential !== ra.pointDifferential) {
          return rb.pointDifferential - ra.pointDifferential;
        }
        return a.name.localeCompare(b.name);
      });

      const seeds: TournamentSeed[] = sortedTeams.map((team, i) => {
        const rec = records.get(team.id)!;
        return {
          seedNumber: i + 1,
          teamId: team.id,
          teamName: team.name,
          record: { wins: rec.wins, losses: rec.losses },
          pointDifferential: rec.pointDifferential,
        };
      });

      const updated: Tournament = {
        ...tournament,
        seeds,
        status: 'seeding',
        updatedAt: new Date().toISOString(),
      };

      writeFile(updated);
      return { tournament: updated };
    },

    // -----------------------------------------------------------------------
    // manualSeed
    // Requirements: 2.2, 2.3, 2.4, 2.5, 2.8
    // -----------------------------------------------------------------------
    manualSeed(tournamentId: string, teamIds: string[]): SeedResult {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }

      // Validate: 2–64 teams (Req 2.4, 2.8)
      if (teamIds.length < 2) {
        throw new Error('At least 2 teams are required to seed a tournament. (Req 2.4)');
      }
      if (teamIds.length > 64) {
        throw new Error('Cannot seed more than 64 teams into a tournament. (Req 2.8)');
      }

      // Validate: no duplicates (Req 2.5)
      const uniqueIds = new Set(teamIds);
      if (uniqueIds.size !== teamIds.length) {
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const id of teamIds) {
          if (seen.has(id)) duplicates.add(id);
          else seen.add(id);
        }
        throw new Error(
          `Duplicate team IDs are not allowed: ${[...duplicates].join(', ')}. (Req 2.5)`
        );
      }

      // Validate: all team IDs exist in the Liga (Req 2.3)
      const liga = ligaStore.loadLiga(ligaId);
      const ligaTeamMap = new Map(liga.teams.map((t) => [t.id, t]));

      const invalidIds = teamIds.filter((id) => !ligaTeamMap.has(id));
      if (invalidIds.length > 0) {
        throw new Error(
          `The following team IDs do not exist in Liga "${ligaId}": ${invalidIds.join(', ')}. (Req 2.3)`
        );
      }

      // Build seeds — index 0 = seed 1, etc. (Req 2.2)
      const seeds: TournamentSeed[] = teamIds.map((teamId, i) => {
        const team = ligaTeamMap.get(teamId)!;
        return {
          seedNumber: i + 1,
          teamId: team.id,
          teamName: team.name,
          record: { wins: 0, losses: 0 },
          pointDifferential: 0,
        };
      });

      const updated: Tournament = {
        ...tournament,
        seeds,
        status: 'seeding',
        updatedAt: new Date().toISOString(),
      };

      writeFile(updated);
      return { tournament: updated };
    },

    // -----------------------------------------------------------------------
    // generateBracket
    // Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 5.2, 5.6
    // -----------------------------------------------------------------------
    generateBracket(tournamentId: string, options?: BracketOptions): Tournament {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }

      // Must have seeds before generating (status should be 'seeding')
      if (tournament.seeds.length < 2) {
        throw new Error('Tournament must be seeded with at least 2 teams before generating the bracket.');
      }

      // Validate Liga still exists (Req 5.6)
      let ligaExists = true;
      try {
        ligaStore.loadLiga(ligaId);
      } catch {
        ligaExists = false;
      }
      if (!ligaExists) {
        throw new Error(`Liga "${ligaId}" not found. Cannot create ScheduledGame entries.`);
      }

      // Merge options: provided options override the stored ones
      const effectiveOptions: BracketOptions = {
        ...tournament.options,
        ...(options ?? {}),
      };

      // -----------------------------------------------------------------------
      // Generate bracket structure (pure function — no side effects yet)
      // Requirement 3.6: if generation fails, no partial state persisted
      // -----------------------------------------------------------------------
      let rounds: Tournament['rounds'];
      let matchNodes: MatchNode[];
      let winnersBracket: Tournament['winnersBracket'];
      let losersBracket: Tournament['losersBracket'];
      let grandFinal: Tournament['grandFinal'];

      try {
        if (tournament.format === 'single-elimination') {
          const result = generateSingleElimBracket(tournament.seeds, effectiveOptions);
          rounds = result.rounds;
          matchNodes = result.matchNodes;
        } else if (tournament.format === 'double-elimination') {
          const result = generateDoubleElimBracket(tournament.seeds);
          rounds = [...result.winnersBracket, ...result.losersBracket];
          matchNodes = result.matchNodes;
          winnersBracket = result.winnersBracket;
          losersBracket = result.losersBracket;
          grandFinal = result.grandFinal;
        } else if (tournament.format === 'round-robin') {
          const result = generateRoundRobinSchedule(tournament.seeds);
          rounds = result.rounds;
          matchNodes = result.matchNodes;
        } else {
          throw new Error(`Unsupported bracket format: "${tournament.format}".`);
        }
      } catch (err) {
        // Requirement 3.6: generation failure must not persist partial state
        throw new Error(
          `Bracket generation failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // -----------------------------------------------------------------------
      // Create ScheduledGame entries for every MatchNode where both teams are known
      // Requirement 5.1, 5.2: bidirectional links between ScheduledGame and MatchNode
      // -----------------------------------------------------------------------
      // We collect (matchNodeId → scheduledGameId) links to apply after all games are created.
      // If any ScheduledGame creation fails, we do NOT persist the tournament update
      // (atomic: all or nothing).
      const matchNodeToGameId = new Map<string, string>();

      try {
        for (const node of matchNodes) {
          // Only create ScheduledGame for nodes with both teams determined and not a BYE
          if (
            node.homeTeamId !== null &&
            node.awayTeamId !== null &&
            !node.isBye
          ) {
            const today = new Date().toISOString().slice(0, 10);
            const game = ligaStore.addScheduledGame(ligaId, {
              ligaId,
              date: today,
              homeTeamId: node.homeTeamId,
              awayTeamId: node.awayTeamId,
              assignedStaff: [],
              status: 'Scheduled',
              matchNodeId: node.id,    // bidirectional link (Req 5.2)
            });
            matchNodeToGameId.set(node.id, game.id);
          }
        }
      } catch (err) {
        // ScheduledGame creation failed — do not persist partial tournament state (Req 3.6)
        throw new Error(
          `Failed to create scheduled games during bracket generation: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // -----------------------------------------------------------------------
      // Apply bidirectional links: set MatchNode.scheduledGameId for each created game
      // Requirement 5.2
      // -----------------------------------------------------------------------
      const linkedMatchNodes: MatchNode[] = matchNodes.map((node) => {
        const gameId = matchNodeToGameId.get(node.id);
        if (gameId !== undefined) {
          return { ...node, scheduledGameId: gameId };
        }
        return node;
      });

      // -----------------------------------------------------------------------
      // Persist updated tournament state (all-or-nothing: only reaches here on success)
      // Requirement 3 (status → "in-progress"), 7.1
      // -----------------------------------------------------------------------
      const updated: Tournament = {
        ...tournament,
        status: 'in-progress',
        rounds,
        matchNodes: linkedMatchNodes,
        winnersBracket,
        losersBracket,
        grandFinal,
        options: effectiveOptions,
        updatedAt: new Date().toISOString(),
      };

      writeFile(updated);
      return updated;
    },

    // -----------------------------------------------------------------------
    // Requirements: 1.1
    // -----------------------------------------------------------------------
    deleteTournament(tournamentId: string): void {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      if (existsSync(path)) {
        unlinkSync(path);
      }
      invalidateIndex();
    },

    // -----------------------------------------------------------------------
    // resetTournament
    // Requirements: 1.1 (reset = revert to post-seeding state, clear results)
    // -----------------------------------------------------------------------
    resetTournament(tournamentId: string): Tournament {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }

      // Revert to post-seeding state if seeds exist, otherwise back to pending.
      // Clears all bracket structure and results, but retains seeding.
      const newStatus: TournamentStatus = tournament.seeds.length > 0 ? 'seeding' : 'pending';

      const reset: Tournament = {
        ...tournament,
        status: newStatus,
        rounds: [],
        matchNodes: [],
        winnersBracket: undefined,
        losersBracket: undefined,
        grandFinal: undefined,
        standings: undefined,
        championTeamId: undefined,
        updatedAt: new Date().toISOString(),
      };

      writeFile(reset);
      return reset;
    },

    // -----------------------------------------------------------------------
    // getTournament
    // Requirements: 7.4, 7.6
    // -----------------------------------------------------------------------
    getTournament(tournamentId: string): Tournament {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }
      return tournament;
    },

    // -----------------------------------------------------------------------
    // listTournaments
    // Requirements: 7.3, 7.5
    // -----------------------------------------------------------------------
    listTournaments(ligaId: string): TournamentSummary[] {
      const dir = resolvedTournamentsDir(ligaId);
      let files: string[];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      } catch {
        return [];
      }

      const result: TournamentSummary[] = [];

      for (const file of files) {
        const filePath = join(dir, file);
        const tournament = readFile(filePath);
        if (!tournament) {
          // Corrupted file — already warned in readFile; exclude from list (Req 7.5)
          continue;
        }
        result.push({
          id: tournament.id,
          name: tournament.name,
          format: tournament.format,
          status: tournament.status,
          createdAt: tournament.createdAt,
          teamCount: tournament.seeds.length,
          championTeamId: tournament.championTeamId,
        });
      }

      // Sort by creation date descending; max 200 entries (Req 7.3)
      result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return result.slice(0, 200);
    },

    // -----------------------------------------------------------------------
    // getActiveTournament
    // Requirements: 9.3, 9.4
    // -----------------------------------------------------------------------
    getActiveTournament(ligaId: string): Tournament | null {
      const dir = resolvedTournamentsDir(ligaId);
      let files: string[];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      } catch {
        return null;
      }

      for (const file of files) {
        const filePath = join(dir, file);
        const tournament = readFile(filePath);
        if (tournament && tournament.status === 'in-progress') {
          return tournament;
        }
      }

      return null;
    },

    // -----------------------------------------------------------------------
    // recordResult
    // Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 9.1, 9.2
    // -----------------------------------------------------------------------
    recordResult(tournamentId: string, matchNodeId: string, homeScore: number, awayScore: number): AdvanceResult {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }

      const { updated, changedNodes } = applyResult(tournament, matchNodeId, homeScore, awayScore);

      writeFile(updated);

      // Requirement 9.1, 9.2: broadcast bracket update within 2 seconds
      broadcastUpdate(updated, changedNodes);

      // Requirement 4.6: tied score — no advancement, return isTie flag
      const resultNode = updated.matchNodes.find((n) => n.id === matchNodeId);
      if (resultNode && resultNode.status === 'in-progress' && homeScore === awayScore) {
        return { tournament: updated, advanced: false, isTie: true };
      }

      const completedNode = updated.matchNodes.find((n) => n.id === matchNodeId);
      const nextMatchNodeId = completedNode
        ? updated.matchNodes.find((n) =>
            (n.homeSourceMatchId === matchNodeId && !n.homeSourceIsLoser) ||
            (n.awaySourceMatchId === matchNodeId && !n.awaySourceIsLoser)
          )?.id
        : undefined;

      return {
        tournament: updated,
        advanced: true,
        nextMatchNodeId,
      };
    },

    // -----------------------------------------------------------------------
    // revertResult
    // Requirements: 4.5, 5.5, 9.1, 9.2
    // -----------------------------------------------------------------------
    revertResult(tournamentId: string, matchNodeId: string): RevertResult {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }

      const nodeIndex = tournament.matchNodes.findIndex((n) => n.id === matchNodeId);
      if (nodeIndex === -1) {
        throw new Error(`Match node "${matchNodeId}" not found in tournament "${tournamentId}".`);
      }

      // Collect all downstream match nodes that need to be cleared
      const downstreamIds = collectDownstreamNodeIds(matchNodeId, tournament.matchNodes);

      // Reset the target node to pending and clear its result
      const targetNode = tournament.matchNodes[nodeIndex];
      const resetNode: MatchNode = {
        ...targetNode,
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        loserTeamId: null,
        status: 'pending',
        gameLogId: null,
      };

      const downstreamIdSet = new Set(downstreamIds);
      const updatedNodes = tournament.matchNodes.map((n, i) => {
        if (i === nodeIndex) return resetNode;
        if (!downstreamIdSet.has(n.id)) return n;

        // Clear team assignments that came from the reverted match
        let homeTeamId = n.homeTeamId;
        let awayTeamId = n.awayTeamId;

        // Clear slots whose source was the reverted match
        if (n.homeSourceMatchId === matchNodeId) homeTeamId = null;
        if (n.awaySourceMatchId === matchNodeId) awayTeamId = null;

        // Also clear recursively if this downstream node had a result
        return {
          ...n,
          homeTeamId,
          awayTeamId,
          homeScore: null,
          awayScore: null,
          winnerTeamId: null,
          loserTeamId: null,
          status: 'pending' as const,
          gameLogId: null,
        };
      });

      // Also reset linked ScheduledGame status if present (Requirement 5.5)
      if (resetNode.scheduledGameId && ligaId) {
        try {
          ligaStore.updateScheduledGame(ligaId, resetNode.scheduledGameId, {
            status: 'Scheduled',
            gameLogId: undefined,
          });
        } catch {
          // Non-blocking — the scheduled game may have been removed
        }
      }

      // Revert tournament status from 'completed' back to 'in-progress' if applicable
      const newStatus: TournamentStatus =
        tournament.status === 'completed' ? 'in-progress' : tournament.status;

      const updated: Tournament = {
        ...tournament,
        matchNodes: updatedNodes,
        status: newStatus,
        championTeamId: newStatus === 'in-progress' ? undefined : tournament.championTeamId,
        updatedAt: new Date().toISOString(),
      };

      writeFile(updated);

      // Broadcast incremental update with all changed nodes
      const changedNodes = updatedNodes.filter(
        (n, i) => i === nodeIndex || downstreamIdSet.has(n.id)
      );
      broadcastUpdate(updated, changedNodes);

      return {
        tournament: updated,
        revertedMatchNodeId: matchNodeId,
        clearedDownstreamIds: downstreamIds,
      };
    },

    // -----------------------------------------------------------------------
    // onGameLogSaved
    // Requirements: 4.1, 4.2, 4.7, 9.1, 9.2
    // -----------------------------------------------------------------------
    onGameLogSaved(record: GameLogRecord): AdvanceResult | null {
      // Find any in-progress tournament in the game log's liga
      if (!record.ligaId) return null;

      const dir = resolvedTournamentsDir(record.ligaId);
      let files: string[];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      } catch {
        return null;
      }

      for (const file of files) {
        const filePath = join(dir, file);
        const tournament = readFile(filePath);
        if (!tournament || tournament.status !== 'in-progress') continue;

        // Find a match node linked to this game log's scheduledGameId
        let targetNode: MatchNode | undefined;

        if (record.scheduledGameId) {
          targetNode = tournament.matchNodes.find(
            (n) => n.scheduledGameId === record.scheduledGameId
          );
        }

        // Fallback: find a node with a matching scheduledGameId via the game log ID link
        if (!targetNode && record.id) {
          targetNode = tournament.matchNodes.find((n) => n.gameLogId === record.id);
        }

        if (!targetNode) continue;

        // Requirement 4.7: round-robin — record result in standings, no advancement
        if (tournament.format === 'round-robin') {
          // Record the scores on the node but don't advance
          const nodeIndex = tournament.matchNodes.findIndex((n) => n.id === targetNode!.id);
          const updatedNode: MatchNode = {
            ...targetNode,
            homeScore: record.finalScores.home,
            awayScore: record.finalScores.away,
            status: 'completed',
            gameLogId: record.id,
            winnerTeamId: record.finalScores.home > record.finalScores.away
              ? targetNode.homeTeamId
              : record.finalScores.away > record.finalScores.home
              ? targetNode.awayTeamId
              : null,
            loserTeamId: record.finalScores.home > record.finalScores.away
              ? targetNode.awayTeamId
              : record.finalScores.away > record.finalScores.home
              ? targetNode.homeTeamId
              : null,
          };
          const updatedNodes = [...tournament.matchNodes];
          updatedNodes[nodeIndex] = updatedNode;
          const updatedTournament: Tournament = {
            ...tournament,
            matchNodes: updatedNodes,
            updatedAt: new Date().toISOString(),
          };
          writeFile(updatedTournament);
          broadcastUpdate(updatedTournament, [updatedNode]);
          return { tournament: updatedTournament, advanced: false };
        }

        // Apply the result and advance the bracket
        const { updated, changedNodes } = applyResult(
          tournament,
          targetNode.id,
          record.finalScores.home,
          record.finalScores.away,
        );

        // Stamp the gameLogId on the target node
        const finalNodes = updated.matchNodes.map((n) =>
          n.id === targetNode!.id ? { ...n, gameLogId: record.id } : n
        );
        const finalTournament: Tournament = { ...updated, matchNodes: finalNodes };

        writeFile(finalTournament);
        broadcastUpdate(finalTournament, changedNodes);

        // Create ScheduledGame for newly determined next round matches (Requirement 5.3)
        const today = new Date().toISOString().slice(0, 10);
        const newScheduledGameNodes: string[] = [];
        for (const changedNode of changedNodes) {
          if (
            changedNode.id !== targetNode.id &&
            changedNode.homeTeamId !== null &&
            changedNode.awayTeamId !== null &&
            !changedNode.isBye &&
            changedNode.scheduledGameId === null
          ) {
            try {
              const game = ligaStore.addScheduledGame(record.ligaId, {
                ligaId: record.ligaId,
                date: today,
                homeTeamId: changedNode.homeTeamId,
                awayTeamId: changedNode.awayTeamId,
                assignedStaff: [],
                status: 'Scheduled',
                matchNodeId: changedNode.id,
              });
              newScheduledGameNodes.push(game.id);

              // Link scheduledGameId back into the match node
              const idx = finalTournament.matchNodes.findIndex((n) => n.id === changedNode.id);
              if (idx !== -1) {
                finalTournament.matchNodes[idx] = {
                  ...finalTournament.matchNodes[idx],
                  scheduledGameId: game.id,
                };
              }
            } catch {
              // Non-blocking — scheduling failure should not stop bracket progression
            }
          }
        }

        if (newScheduledGameNodes.length > 0) {
          writeFile(finalTournament);
        }

        return {
          tournament: finalTournament,
          advanced: record.finalScores.home !== record.finalScores.away,
          isTie: record.finalScores.home === record.finalScores.away,
        };
      }

      return null;
    },

    // -----------------------------------------------------------------------
    // onGameLogDeleted
    // Requirements: 4.5, 5.5, 9.1, 9.2
    // -----------------------------------------------------------------------
    onGameLogDeleted(ligaId: string, logId: string): RevertResult | null {
      const dir = resolvedTournamentsDir(ligaId);
      let files: string[];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      } catch {
        return null;
      }

      for (const file of files) {
        const filePath = join(dir, file);
        const tournament = readFile(filePath);
        if (!tournament || tournament.status !== 'in-progress') continue;

        // Find the match node linked to the deleted game log
        const targetNode = tournament.matchNodes.find((n) => n.gameLogId === logId);
        if (!targetNode) continue;

        // Reuse the revertResult logic
        const downstreamIds = collectDownstreamNodeIds(targetNode.id, tournament.matchNodes);

        const nodeIndex = tournament.matchNodes.findIndex((n) => n.id === targetNode.id);
        const resetNode: MatchNode = {
          ...targetNode,
          homeScore: null,
          awayScore: null,
          winnerTeamId: null,
          loserTeamId: null,
          status: 'pending',
          gameLogId: null,
        };

        const downstreamIdSet = new Set(downstreamIds);
        const updatedNodes = tournament.matchNodes.map((n, i) => {
          if (i === nodeIndex) return resetNode;
          if (!downstreamIdSet.has(n.id)) return n;

          let homeTeamId = n.homeTeamId;
          let awayTeamId = n.awayTeamId;
          if (n.homeSourceMatchId === targetNode.id) homeTeamId = null;
          if (n.awaySourceMatchId === targetNode.id) awayTeamId = null;

          return {
            ...n,
            homeTeamId,
            awayTeamId,
            homeScore: null,
            awayScore: null,
            winnerTeamId: null,
            loserTeamId: null,
            status: 'pending' as const,
            gameLogId: null,
          };
        });

        // Reset linked ScheduledGame (Requirement 5.5)
        if (resetNode.scheduledGameId) {
          try {
            ligaStore.updateScheduledGame(ligaId, resetNode.scheduledGameId, {
              status: 'Scheduled',
              gameLogId: undefined,
            });
          } catch {
            // Non-blocking
          }
        }

        const newStatus: TournamentStatus =
          tournament.status === 'completed' ? 'in-progress' : tournament.status;

        const updated: Tournament = {
          ...tournament,
          matchNodes: updatedNodes,
          status: newStatus,
          championTeamId: newStatus === 'in-progress' ? undefined : tournament.championTeamId,
          updatedAt: new Date().toISOString(),
        };

        writeFile(updated);

        const changedNodes = updatedNodes.filter(
          (n, i) => i === nodeIndex || downstreamIdSet.has(n.id)
        );
        broadcastUpdate(updated, changedNodes);

        return {
          tournament: updated,
          revertedMatchNodeId: targetNode.id,
          clearedDownstreamIds: downstreamIds,
        };
      }

      return null;
    },

    // -----------------------------------------------------------------------
    // broadcastBracketState
    // Requirements: 9.1, 9.3
    // -----------------------------------------------------------------------
    broadcastBracketState(tournamentId: string): void {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }
      broadcastFull(tournament);
    },

    // -----------------------------------------------------------------------
    // getFullBracketPayload
    // Requirements: 9.3
    // -----------------------------------------------------------------------
    getFullBracketPayload(tournamentId: string): BracketPayload {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }
      return buildFullPayload(tournament);
    },

    // -----------------------------------------------------------------------
    // exportBracketPdf
    // Requirements: 8.1, 8.3, 8.4, 8.5, 8.6
    // -----------------------------------------------------------------------
    async exportBracketPdf(tournamentId: string, destPath: string): Promise<void> {
      const ligaId = findLigaIdForTournament(tournamentId);
      const path = resolvedTournamentPath(ligaId, tournamentId);
      const tournament = readFile(path);
      if (!tournament) {
        throw new Error(`Tournament "${tournamentId}" not found or is corrupted.`);
      }
      return generateBracketPdf(tournament, destPath);
    },
  };
}
