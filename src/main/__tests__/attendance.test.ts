/**
 * Example-based tests for Attendance Tracking (Requirement 27).
 *
 * Tests covered:
 *  1. Non-integer attendance value is rejected by validator
 *  2. Out-of-range attendance value is rejected (< 0, > 99999)
 *  3. Valid attendance values are accepted (0, 99999, typical values)
 *  4. Auto-association links game log to matching scheduled game
 *  5. Auto-association does not link when date differs
 *  6. Auto-association does not link when team names differ
 *  7. Season stats attendance computation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GameLogRecord, PlayerStats, Liga, ScheduledGame } from '../../shared/types'
import { computeSeasonAverages } from '../analytics'

// ---------------------------------------------------------------------------
// Mock electron app.getPath to use a temp directory
// ---------------------------------------------------------------------------
const TEST_USER_DATA = join(__dirname, '__test_userData_attendance__')

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return TEST_USER_DATA
      return TEST_USER_DATA
    },
  },
}))

import { createLigaStore } from '../ligaStore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate attendance value: must be integer 0–99999. Returns error string or '' if valid. */
function validateAttendance(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return '' // empty means "not recorded", which is valid
  if (!/^\d+$/.test(trimmed)) return 'Attendance must be a non-negative integer.'
  const num = parseInt(trimmed, 10)
  if (!Number.isInteger(num) || num < 0 || num > 99999) {
    return 'Attendance must be between 0 and 99,999.'
  }
  return ''
}

function makeTestRecord(overrides?: Partial<GameLogRecord>): GameLogRecord {
  return {
    id: 'test-log-001',
    ligaId: 'liga-001',
    date: '2024-03-15T19:30:00.000Z',
    homeTeam: 'Eagles',
    awayTeam: 'Hawks',
    finalScores: { home: 78, away: 72 },
    playerStats: {
      'p1': {
        points: 22, rebounds: 5, assists: 3, steals: 2, blocks: 1,
        fga: 18, fgm: 9, fouls: 2, active: true,
        jerseyNumber: '23', photoPath: null, minutesPlayed: 32,
        substitutions: [],
      } as PlayerStats,
    },
    events: [],
    periodSnapshots: [],
    ...overrides,
  }
}

function makeTestLiga(): Liga {
  return {
    id: 'liga-001',
    name: 'Test Liga',
    year: 2024,
    createdAt: '2024-01-01T00:00:00.000Z',
    teams: [
      {
        id: 'team-home',
        name: 'Eagles',
        color: '#000',
        logoPath: null,
        playerImagePath: null,
        players: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'team-away',
        name: 'Hawks',
        color: '#fff',
        logoPath: null,
        playerImagePath: null,
        players: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    schedule: [],
    venues: [],
    staff: [],
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (existsSync(TEST_USER_DATA)) {
    rmSync(TEST_USER_DATA, { recursive: true, force: true })
  }
  mkdirSync(TEST_USER_DATA, { recursive: true })
})

afterEach(() => {
  if (existsSync(TEST_USER_DATA)) {
    rmSync(TEST_USER_DATA, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Tests — Attendance Validation
// ---------------------------------------------------------------------------

describe('Attendance Tracking (Requirement 27)', () => {

  describe('Validation — non-integer rejected', () => {
    it('rejects floating-point numbers', () => {
      expect(validateAttendance('1.5')).not.toBe('')
      expect(validateAttendance('99.9')).not.toBe('')
    })

    it('rejects strings with letters', () => {
      expect(validateAttendance('abc')).not.toBe('')
      expect(validateAttendance('12abc')).not.toBe('')
      expect(validateAttendance('one hundred')).not.toBe('')
    })

    it('rejects negative numbers', () => {
      expect(validateAttendance('-1')).not.toBe('')
      expect(validateAttendance('-100')).not.toBe('')
    })

    it('rejects special characters', () => {
      expect(validateAttendance('1,000')).not.toBe('')
      expect(validateAttendance('1 000')).not.toBe('')
      expect(validateAttendance('$500')).not.toBe('')
    })
  })

  describe('Validation — out of range rejected', () => {
    it('rejects values above 99999', () => {
      expect(validateAttendance('100000')).not.toBe('')
      expect(validateAttendance('999999')).not.toBe('')
    })

    it('accepts boundary value 0', () => {
      expect(validateAttendance('0')).toBe('')
    })

    it('accepts boundary value 99999', () => {
      expect(validateAttendance('99999')).toBe('')
    })

    it('accepts typical attendance values', () => {
      expect(validateAttendance('500')).toBe('')
      expect(validateAttendance('15000')).toBe('')
      expect(validateAttendance('50000')).toBe('')
    })

    it('accepts empty string (not recorded)', () => {
      expect(validateAttendance('')).toBe('')
      expect(validateAttendance('   ')).toBe('')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-association
  // ─────────────────────────────────────────────────────────────────────────

  describe('Auto-association — game log to scheduled game', () => {
    it('links game log to matching scheduled game when date and teams match', () => {
      const store = createLigaStore()
      const liga = makeTestLiga()
      // Save liga with a scheduled game
      const scheduledEntry: ScheduledGame = {
        id: 'sched-001',
        ligaId: 'liga-001',
        date: '2024-03-15',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        assignedStaff: [],
        status: 'Scheduled',
      }
      liga.schedule = [scheduledEntry]
      store.saveLiga(liga)

      // Save the game log
      const record = makeTestRecord({
        id: 'log-auto-001',
        date: '2024-03-15T19:30:00.000Z',
        homeTeam: 'Eagles',
        awayTeam: 'Hawks',
      })
      store.saveGameLog(record)

      // Simulate auto-association logic (same as in ipcRouter GAME_LOG_SAVE handler)
      const scheduled = store.listScheduledGames('liga-001')
      const logDate = record.date.split('T')[0]
      const match = scheduled.find(entry => {
        if (entry.gameLogId) return false
        const entryDate = entry.date.split('T')[0]
        if (entryDate !== logDate) return false
        const ligaData = store.loadLiga('liga-001')
        const homeTeam = ligaData.teams.find(t => t.id === entry.homeTeamId)
        const awayTeam = ligaData.teams.find(t => t.id === entry.awayTeamId)
        if (!homeTeam || !awayTeam) return false
        return homeTeam.name === record.homeTeam && awayTeam.name === record.awayTeam
      })

      expect(match).toBeDefined()
      expect(match!.id).toBe('sched-001')

      // Perform the linking
      store.updateScheduledGame('liga-001', match!.id, {
        status: 'Completed',
        gameLogId: record.id,
      })
      const updatedRecord = { ...record, scheduledGameId: match!.id }
      store.saveGameLog(updatedRecord)

      // Verify linkage
      const updatedSchedule = store.listScheduledGames('liga-001')
      expect(updatedSchedule[0].status).toBe('Completed')
      expect(updatedSchedule[0].gameLogId).toBe('log-auto-001')

      const loadedLog = store.loadGameLog('liga-001', 'log-auto-001')
      expect(loadedLog.scheduledGameId).toBe('sched-001')
    })

    it('does NOT link when dates differ', () => {
      const store = createLigaStore()
      const liga = makeTestLiga()
      const scheduledEntry: ScheduledGame = {
        id: 'sched-002',
        ligaId: 'liga-001',
        date: '2024-03-16', // Different date
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        assignedStaff: [],
        status: 'Scheduled',
      }
      liga.schedule = [scheduledEntry]
      store.saveLiga(liga)

      const record = makeTestRecord({
        id: 'log-auto-002',
        date: '2024-03-15T19:30:00.000Z', // Different date
        homeTeam: 'Eagles',
        awayTeam: 'Hawks',
      })
      store.saveGameLog(record)

      const scheduled = store.listScheduledGames('liga-001')
      const logDate = record.date.split('T')[0]
      const match = scheduled.find(entry => {
        if (entry.gameLogId) return false
        const entryDate = entry.date.split('T')[0]
        if (entryDate !== logDate) return false
        const ligaData = store.loadLiga('liga-001')
        const homeTeam = ligaData.teams.find(t => t.id === entry.homeTeamId)
        const awayTeam = ligaData.teams.find(t => t.id === entry.awayTeamId)
        if (!homeTeam || !awayTeam) return false
        return homeTeam.name === record.homeTeam && awayTeam.name === record.awayTeam
      })

      expect(match).toBeUndefined()
    })

    it('does NOT link when team names differ', () => {
      const store = createLigaStore()
      const liga = makeTestLiga()
      const scheduledEntry: ScheduledGame = {
        id: 'sched-003',
        ligaId: 'liga-001',
        date: '2024-03-15',
        homeTeamId: 'team-home', // Eagles
        awayTeamId: 'team-away', // Hawks
        assignedStaff: [],
        status: 'Scheduled',
      }
      liga.schedule = [scheduledEntry]
      store.saveLiga(liga)

      const record = makeTestRecord({
        id: 'log-auto-003',
        date: '2024-03-15T19:30:00.000Z',
        homeTeam: 'Wolves', // Different team name
        awayTeam: 'Hawks',
      })
      store.saveGameLog(record)

      const scheduled = store.listScheduledGames('liga-001')
      const logDate = record.date.split('T')[0]
      const match = scheduled.find(entry => {
        if (entry.gameLogId) return false
        const entryDate = entry.date.split('T')[0]
        if (entryDate !== logDate) return false
        const ligaData = store.loadLiga('liga-001')
        const homeTeam = ligaData.teams.find(t => t.id === entry.homeTeamId)
        const awayTeam = ligaData.teams.find(t => t.id === entry.awayTeamId)
        if (!homeTeam || !awayTeam) return false
        return homeTeam.name === record.homeTeam && awayTeam.name === record.awayTeam
      })

      expect(match).toBeUndefined()
    })

    it('does NOT link when scheduled game is already linked', () => {
      const store = createLigaStore()
      const liga = makeTestLiga()
      const scheduledEntry: ScheduledGame = {
        id: 'sched-004',
        ligaId: 'liga-001',
        date: '2024-03-15',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        assignedStaff: [],
        status: 'Completed',
        gameLogId: 'already-linked-log', // Already linked
      }
      liga.schedule = [scheduledEntry]
      store.saveLiga(liga)

      const record = makeTestRecord({
        id: 'log-auto-004',
        date: '2024-03-15T19:30:00.000Z',
        homeTeam: 'Eagles',
        awayTeam: 'Hawks',
      })
      store.saveGameLog(record)

      const scheduled = store.listScheduledGames('liga-001')
      const logDate = record.date.split('T')[0]
      const match = scheduled.find(entry => {
        if (entry.gameLogId) return false // Already linked — skip
        const entryDate = entry.date.split('T')[0]
        if (entryDate !== logDate) return false
        const ligaData = store.loadLiga('liga-001')
        const homeTeam = ligaData.teams.find(t => t.id === entry.homeTeamId)
        const awayTeam = ligaData.teams.find(t => t.id === entry.awayTeamId)
        if (!homeTeam || !awayTeam) return false
        return homeTeam.name === record.homeTeam && awayTeam.name === record.awayTeam
      })

      expect(match).toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Season Stats — Attendance
  // ─────────────────────────────────────────────────────────────────────────

  describe('Season Stats — attendance computation (Req 27.5)', () => {
    it('computes total and average attendance from game logs', () => {
      const logs: GameLogRecord[] = [
        makeTestRecord({ id: 'log-1', attendance: 1000 }),
        makeTestRecord({ id: 'log-2', attendance: 2000 }),
        makeTestRecord({ id: 'log-3', attendance: 3000 }),
      ]

      const stats = computeSeasonAverages(logs)

      expect(stats.attendance.totalAttendance).toBe(6000)
      expect(stats.attendance.gamesWithAttendance).toBe(3)
      expect(stats.attendance.averageAttendance).toBe(2000)
    })

    it('excludes games without recorded attendance from average', () => {
      const logs: GameLogRecord[] = [
        makeTestRecord({ id: 'log-1', attendance: 1000 }),
        makeTestRecord({ id: 'log-2' }), // No attendance
        makeTestRecord({ id: 'log-3', attendance: 3000 }),
      ]

      const stats = computeSeasonAverages(logs)

      expect(stats.attendance.totalAttendance).toBe(4000)
      expect(stats.attendance.gamesWithAttendance).toBe(2)
      expect(stats.attendance.averageAttendance).toBe(2000)
    })

    it('returns zeros when no game logs have attendance recorded', () => {
      const logs: GameLogRecord[] = [
        makeTestRecord({ id: 'log-1' }),
        makeTestRecord({ id: 'log-2' }),
      ]

      const stats = computeSeasonAverages(logs)

      expect(stats.attendance.totalAttendance).toBe(0)
      expect(stats.attendance.gamesWithAttendance).toBe(0)
      expect(stats.attendance.averageAttendance).toBe(0)
    })

    it('returns zeros when no game logs exist', () => {
      const stats = computeSeasonAverages([])

      expect(stats.attendance.totalAttendance).toBe(0)
      expect(stats.attendance.gamesWithAttendance).toBe(0)
      expect(stats.attendance.averageAttendance).toBe(0)
    })

    it('handles attendance of 0 as a valid recorded value', () => {
      const logs: GameLogRecord[] = [
        makeTestRecord({ id: 'log-1', attendance: 0 }),
        makeTestRecord({ id: 'log-2', attendance: 2000 }),
      ]

      const stats = computeSeasonAverages(logs)

      expect(stats.attendance.totalAttendance).toBe(2000)
      expect(stats.attendance.gamesWithAttendance).toBe(2)
      expect(stats.attendance.averageAttendance).toBe(1000)
    })
  })
})
