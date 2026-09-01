/**
 * LigaStore — multi-team JSON database.
 *
 * Each Liga is saved as a JSON file in {userData}/ligas/.
 * Corrupted files are excluded from the loadable list (not deleted).
 */

import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import type { Liga, LigaTeam, LigaPlayer, GameLogRecord, ScheduledGame, Venue, StaffMember } from '../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ligasDir(): string {
  const dir = join(app.getPath('userData'), 'ligas');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function ligaPath(id: string): string {
  return join(ligasDir(), `${id}.json`);
}

function gameLogsDir(ligaId: string): string {
  const dir = join(app.getPath('userData'), 'gameLogs', ligaId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface LigaStore {
  listLigas(): Array<{ id: string; name: string; year: number; teamCount: number }>;
  loadLiga(id: string): Liga;
  saveLiga(liga: Liga): void;
  createLiga(name: string, year: number): Liga;
  addTeam(ligaId: string, team: Omit<LigaTeam, 'id' | 'createdAt'>): LigaTeam;
  updateTeam(ligaId: string, teamId: string, updates: Partial<Omit<LigaTeam, 'id' | 'createdAt'>>): void;
  removeTeam(ligaId: string, teamId: string): void;
  addPlayer(ligaId: string, teamId: string, player: Omit<LigaPlayer, 'id'>): LigaPlayer;
  updatePlayer(ligaId: string, teamId: string, playerId: string, updates: Partial<Omit<LigaPlayer, 'id'>>): void;
  removePlayer(ligaId: string, teamId: string, playerId: string): void;
  exportBackup(ligaId: string, destPath: string): void;
  // Game log methods (Requirement 18)
  saveGameLog(record: GameLogRecord): void;
  listGameLogs(ligaId: string): Array<{ id: string; date: string; homeTeam: string; awayTeam: string; finalScores: { home: number; away: number }; fileName: string }>;
  loadGameLog(ligaId: string, logId: string): GameLogRecord;
  deleteGameLog(ligaId: string, logId: string): void;
  // Schedule methods (Requirement 24)
  addScheduledGame(ligaId: string, entry: Omit<ScheduledGame, 'id'>): ScheduledGame;
  updateScheduledGame(ligaId: string, gameId: string, updates: Partial<Omit<ScheduledGame, 'id' | 'ligaId'>>): void;
  removeScheduledGame(ligaId: string, gameId: string): void;
  listScheduledGames(ligaId: string): ScheduledGame[];
  // Venue methods (Requirement 25)
  addVenue(ligaId: string, venue: Omit<Venue, 'id'>): Venue;
  updateVenue(ligaId: string, venueId: string, updates: Partial<Omit<Venue, 'id'>>): void;
  removeVenue(ligaId: string, venueId: string): { affectedGameIds: string[] };
  listVenues(ligaId: string): Venue[];
  // Staff methods (Requirement 26)
  addStaff(ligaId: string, staff: Omit<StaffMember, 'id'>): StaffMember;
  updateStaff(ligaId: string, staffId: string, updates: Partial<Omit<StaffMember, 'id'>>): void;
  removeStaff(ligaId: string, staffId: string): { affectedGameIds: string[] };
  listStaff(ligaId: string): StaffMember[];
  assignStaffToGame(ligaId: string, gameId: string, staffId: string): void;
  unassignStaffFromGame(ligaId: string, gameId: string, staffId: string): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLigaStore(): LigaStore {

  function readLigaFile(filePath: string): Liga | null {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Liga;
      // Basic validation
      if (!parsed.id || !parsed.name || !Array.isArray(parsed.teams)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeLigaFile(liga: Liga): void {
    writeFileSync(ligaPath(liga.id), JSON.stringify(liga, null, 2), 'utf-8');
  }

  return {
    listLigas() {
      const dir = ligasDir();
      const files = readdirSync(dir).filter(f => f.endsWith('.json'));
      const result: Array<{ id: string; name: string; year: number; teamCount: number }> = [];
      for (const file of files) {
        const liga = readLigaFile(join(dir, file));
        if (liga) {
          result.push({ id: liga.id, name: liga.name, year: liga.year, teamCount: liga.teams.length });
        }
      }
      return result.sort((a, b) => b.year - a.year);
    },

    loadLiga(id: string): Liga {
      const liga = readLigaFile(ligaPath(id));
      if (!liga) throw new Error(`Liga "${id}" not found or is corrupted.`);
      return liga;
    },

    saveLiga(liga: Liga): void {
      writeLigaFile(liga);
    },

    createLiga(name: string, year: number): Liga {
      const liga: Liga = {
        id: generateId(),
        name: name.trim(),
        year,
        createdAt: new Date().toISOString(),
        teams: [],
      };
      writeLigaFile(liga);
      return liga;
    },

    addTeam(ligaId: string, team: Omit<LigaTeam, 'id' | 'createdAt'>): LigaTeam {
      const liga = this.loadLiga(ligaId);
      const newTeam: LigaTeam = {
        ...team,
        id: generateId(),
        createdAt: new Date().toISOString(),
        players: team.players ?? [],
      };
      liga.teams.push(newTeam);
      writeLigaFile(liga);
      return newTeam;
    },

    updateTeam(ligaId: string, teamId: string, updates: Partial<Omit<LigaTeam, 'id' | 'createdAt'>>): void {
      const liga = this.loadLiga(ligaId);
      const idx = liga.teams.findIndex(t => t.id === teamId);
      if (idx === -1) throw new Error(`Team "${teamId}" not found in liga.`);
      liga.teams[idx] = { ...liga.teams[idx], ...updates };
      writeLigaFile(liga);
    },

    removeTeam(ligaId: string, teamId: string): void {
      const liga = this.loadLiga(ligaId);
      liga.teams = liga.teams.filter(t => t.id !== teamId);
      writeLigaFile(liga);
    },

    addPlayer(ligaId: string, teamId: string, player: Omit<LigaPlayer, 'id'>): LigaPlayer {
      const liga = this.loadLiga(ligaId);
      const team = liga.teams.find(t => t.id === teamId);
      if (!team) throw new Error(`Team "${teamId}" not found.`);
      const newPlayer: LigaPlayer = { ...player, id: generateId() };
      team.players.push(newPlayer);
      writeLigaFile(liga);
      return newPlayer;
    },

    updatePlayer(ligaId: string, teamId: string, playerId: string, updates: Partial<Omit<LigaPlayer, 'id'>>): void {
      const liga = this.loadLiga(ligaId);
      const team = liga.teams.find(t => t.id === teamId);
      if (!team) throw new Error(`Team "${teamId}" not found.`);
      const idx = team.players.findIndex(p => p.id === playerId);
      if (idx === -1) throw new Error(`Player "${playerId}" not found.`);
      team.players[idx] = { ...team.players[idx], ...updates };
      writeLigaFile(liga);
    },

    removePlayer(ligaId: string, teamId: string, playerId: string): void {
      const liga = this.loadLiga(ligaId);
      const team = liga.teams.find(t => t.id === teamId);
      if (!team) throw new Error(`Team "${teamId}" not found.`);
      team.players = team.players.filter(p => p.id !== playerId);
      writeLigaFile(liga);
    },

    exportBackup(ligaId: string, destPath: string): void {
      const liga = this.loadLiga(ligaId);
      writeFileSync(destPath, JSON.stringify(liga, null, 2), 'utf-8');
    },

    // ── Game Log Methods (Requirement 18) ──

    saveGameLog(record: GameLogRecord): void {
      const dir = gameLogsDir(record.ligaId);
      const filePath = join(dir, `${record.id}.json`);
      writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    },

    listGameLogs(ligaId: string) {
      const dir = gameLogsDir(ligaId);
      const files = readdirSync(dir).filter(f => f.endsWith('.json'));
      const result: Array<{
        id: string; date: string; homeTeam: string; awayTeam: string;
        finalScores: { home: number; away: number }; fileName: string;
      }> = [];
      for (const file of files) {
        try {
          const raw = readFileSync(join(dir, file), 'utf-8');
          const record = JSON.parse(raw) as GameLogRecord;
          if (record.id && record.date) {
            result.push({
              id: record.id,
              date: record.date,
              homeTeam: record.homeTeam,
              awayTeam: record.awayTeam,
              finalScores: record.finalScores,
              fileName: file,
            });
          }
        } catch {
          // Corrupted file — exclude from list (do not delete)
        }
      }
      // Sort by date descending
      return result.sort((a, b) => b.date.localeCompare(a.date));
    },

    loadGameLog(ligaId: string, logId: string): GameLogRecord {
      const filePath = join(gameLogsDir(ligaId), `${logId}.json`);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as GameLogRecord;
      } catch {
        throw new Error(`Game log "${logId}" not found or is corrupted.`);
      }
    },

    deleteGameLog(ligaId: string, logId: string): void {
      const filePath = join(gameLogsDir(ligaId), `${logId}.json`);
      if (existsSync(filePath)) unlinkSync(filePath);
    },

    // ── Schedule Methods (Requirement 24) ──

    addScheduledGame(ligaId: string, entry: Omit<ScheduledGame, 'id'>): ScheduledGame {
      const liga = this.loadLiga(ligaId);
      const newEntry: ScheduledGame = { ...entry, id: generateId() };
      liga.schedule = [...(liga.schedule ?? []), newEntry];
      writeLigaFile(liga);
      return newEntry;
    },

    updateScheduledGame(ligaId: string, gameId: string, updates: Partial<Omit<ScheduledGame, 'id' | 'ligaId'>>): void {
      const liga = this.loadLiga(ligaId);
      const idx = (liga.schedule ?? []).findIndex(g => g.id === gameId);
      if (idx === -1) throw new Error(`Scheduled game "${gameId}" not found in liga.`);
      const schedule = [...(liga.schedule ?? [])];
      schedule[idx] = { ...schedule[idx], ...updates };
      liga.schedule = schedule;
      writeLigaFile(liga);
    },

    removeScheduledGame(ligaId: string, gameId: string): void {
      const liga = this.loadLiga(ligaId);
      liga.schedule = (liga.schedule ?? []).filter(g => g.id !== gameId);
      writeLigaFile(liga);
    },

    listScheduledGames(ligaId: string): ScheduledGame[] {
      const liga = this.loadLiga(ligaId);
      return (liga.schedule ?? []).sort((a, b) => a.date.localeCompare(b.date));
    },

    // ── Venue Methods (Requirement 25) ──

    addVenue(ligaId: string, venue: Omit<Venue, 'id'>): Venue {
      const liga = this.loadLiga(ligaId);
      const newVenue: Venue = { ...venue, id: generateId() };
      liga.venues = [...(liga.venues ?? []), newVenue];
      writeLigaFile(liga);
      return newVenue;
    },

    updateVenue(ligaId: string, venueId: string, updates: Partial<Omit<Venue, 'id'>>): void {
      const liga = this.loadLiga(ligaId);
      const venues = liga.venues ?? [];
      const idx = venues.findIndex(v => v.id === venueId);
      if (idx === -1) throw new Error(`Venue "${venueId}" not found in liga.`);
      venues[idx] = { ...venues[idx], ...updates };
      liga.venues = venues;
      writeLigaFile(liga);
    },

    removeVenue(ligaId: string, venueId: string): { affectedGameIds: string[] } {
      const liga = this.loadLiga(ligaId);
      // Remove venue from list
      liga.venues = (liga.venues ?? []).filter(v => v.id !== venueId);
      // Clear venue/court from all affected scheduled game entries
      const affectedGameIds: string[] = [];
      liga.schedule = (liga.schedule ?? []).map(game => {
        if (game.venueId === venueId) {
          affectedGameIds.push(game.id);
          const { venueId: _v, courtId: _c, ...rest } = game;
          return rest as ScheduledGame;
        }
        return game;
      });
      writeLigaFile(liga);
      return { affectedGameIds };
    },

    listVenues(ligaId: string): Venue[] {
      const liga = this.loadLiga(ligaId);
      return liga.venues ?? [];
    },

    // ── Staff Methods (Requirement 26) ──

    addStaff(ligaId: string, staff: Omit<StaffMember, 'id'>): StaffMember {
      const liga = this.loadLiga(ligaId);
      const newStaff: StaffMember = { ...staff, id: generateId() };
      liga.staff = [...(liga.staff ?? []), newStaff];
      writeLigaFile(liga);
      return newStaff;
    },

    updateStaff(ligaId: string, staffId: string, updates: Partial<Omit<StaffMember, 'id'>>): void {
      const liga = this.loadLiga(ligaId);
      const staffList = liga.staff ?? [];
      const idx = staffList.findIndex(s => s.id === staffId);
      if (idx === -1) throw new Error(`Staff "${staffId}" not found in liga.`);
      staffList[idx] = { ...staffList[idx], ...updates };
      liga.staff = staffList;
      writeLigaFile(liga);
    },

    removeStaff(ligaId: string, staffId: string): { affectedGameIds: string[] } {
      const liga = this.loadLiga(ligaId);
      // Remove staff from list
      liga.staff = (liga.staff ?? []).filter(s => s.id !== staffId);
      // Remove from all scheduled game assignedStaff arrays
      const affectedGameIds: string[] = [];
      liga.schedule = (liga.schedule ?? []).map(game => {
        if (game.assignedStaff.includes(staffId)) {
          affectedGameIds.push(game.id);
          return { ...game, assignedStaff: game.assignedStaff.filter(id => id !== staffId) };
        }
        return game;
      });
      writeLigaFile(liga);
      return { affectedGameIds };
    },

    listStaff(ligaId: string): StaffMember[] {
      const liga = this.loadLiga(ligaId);
      return liga.staff ?? [];
    },

    assignStaffToGame(ligaId: string, gameId: string, staffId: string): void {
      const liga = this.loadLiga(ligaId);
      const schedule = liga.schedule ?? [];
      const idx = schedule.findIndex(g => g.id === gameId);
      if (idx === -1) throw new Error(`Scheduled game "${gameId}" not found in liga.`);
      // Prevent duplicate assignment
      if (schedule[idx].assignedStaff.includes(staffId)) {
        throw new Error(`Staff member already assigned to this game.`);
      }
      schedule[idx] = { ...schedule[idx], assignedStaff: [...schedule[idx].assignedStaff, staffId] };
      liga.schedule = schedule;
      writeLigaFile(liga);
    },

    unassignStaffFromGame(ligaId: string, gameId: string, staffId: string): void {
      const liga = this.loadLiga(ligaId);
      const schedule = liga.schedule ?? [];
      const idx = schedule.findIndex(g => g.id === gameId);
      if (idx === -1) throw new Error(`Scheduled game "${gameId}" not found in liga.`);
      schedule[idx] = { ...schedule[idx], assignedStaff: schedule[idx].assignedStaff.filter(id => id !== staffId) };
      liga.schedule = schedule;
      writeLigaFile(liga);
    },
  };
}
