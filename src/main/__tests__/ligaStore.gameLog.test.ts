/**
 * Example-based tests for LigaStore game log persistence (Requirement 18).
 *
 * Tests:
 *  - Saved record loads identically
 *  - Corrupted file excluded from list
 *  - Delete removes file from disk
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { GameLogRecord, PlayerStats, GameEvent, PeriodSnapshot } from '../../shared/types'

// ---------------------------------------------------------------------------
// Mock electron app.getPath to use a temp directory
// ---------------------------------------------------------------------------
const TEST_USER_DATA = join(__dirname, '__test_userData_gameLogs__')

// We need to mock electron's `app` module before importing ligaStore
import { vi } from 'vitest'
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
      'p2': {
        points: 15, rebounds: 8, assists: 1, steals: 0, blocks: 3,
        fga: 12, fgm: 6, fouls: 4, active: true,
        jerseyNumber: '11', photoPath: null, minutesPlayed: 28,
        substitutions: [],
      } as PlayerStats,
    },
    events: [
      {
        id: 'ev1',
        timestamp: '2024-03-15T19:31:00.000Z',
        clockMs: 710000,
        period: 1,
        type: 'SCORE' as const,
        team: 'home',
        playerId: 'p1',
        playerName: 'Smith',
        points: 3,
        description: 'Smith +3',
      } as GameEvent,
    ],
    periodSnapshots: [
      {
        period: 1,
        teamId: 'home',
        playerSnapshots: [{
          points: 10, rebounds: 2, assists: 1, steals: 1, blocks: 0,
          fga: 8, fgm: 4, fouls: 1, active: true,
          jerseyNumber: '23', photoPath: null, minutesPlayed: 12,
          substitutions: [],
        }],
      } as PeriodSnapshot,
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Create clean test directory
  if (existsSync(TEST_USER_DATA)) {
    rmSync(TEST_USER_DATA, { recursive: true, force: true })
  }
  mkdirSync(TEST_USER_DATA, { recursive: true })
})

afterEach(() => {
  // Clean up
  if (existsSync(TEST_USER_DATA)) {
    rmSync(TEST_USER_DATA, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LigaStore - Game Log Persistence (Requirement 18)', () => {

  describe('saveGameLog + loadGameLog round-trip', () => {
    it('saved record loads identically', () => {
      const store = createLigaStore()
      const record = makeTestRecord()

      store.saveGameLog(record)

      const loaded = store.loadGameLog(record.ligaId, record.id)
      expect(loaded).toEqual(record)
    })

    it('preserves all fields including nested objects', () => {
      const store = createLigaStore()
      const record = makeTestRecord({
        id: 'log-002',
        scheduledGameId: 'sched-001',
        attendance: 1500,
      })

      store.saveGameLog(record)
      const loaded = store.loadGameLog(record.ligaId, record.id)

      expect(loaded.id).toBe('log-002')
      expect(loaded.ligaId).toBe('liga-001')
      expect(loaded.date).toBe('2024-03-15T19:30:00.000Z')
      expect(loaded.homeTeam).toBe('Eagles')
      expect(loaded.awayTeam).toBe('Hawks')
      expect(loaded.finalScores).toEqual({ home: 78, away: 72 })
      expect(loaded.playerStats['p1'].points).toBe(22)
      expect(loaded.playerStats['p2'].blocks).toBe(3)
      expect(loaded.events).toHaveLength(1)
      expect(loaded.events[0].description).toBe('Smith +3')
      expect(loaded.periodSnapshots).toHaveLength(1)
      expect(loaded.periodSnapshots[0].period).toBe(1)
      expect(loaded.scheduledGameId).toBe('sched-001')
      expect(loaded.attendance).toBe(1500)
    })

    it('saves to the correct directory structure: gameLogs/<ligaId>/<id>.json', () => {
      const store = createLigaStore()
      const record = makeTestRecord()

      store.saveGameLog(record)

      const expectedPath = join(TEST_USER_DATA, 'gameLogs', 'liga-001', 'test-log-001.json')
      expect(existsSync(expectedPath)).toBe(true)
    })
  })

  describe('listGameLogs', () => {
    it('returns all valid logs sorted by date descending', () => {
      const store = createLigaStore()

      store.saveGameLog(makeTestRecord({ id: 'log-a', date: '2024-01-10T10:00:00.000Z', homeTeam: 'A', awayTeam: 'B' }))
      store.saveGameLog(makeTestRecord({ id: 'log-b', date: '2024-03-15T10:00:00.000Z', homeTeam: 'C', awayTeam: 'D' }))
      store.saveGameLog(makeTestRecord({ id: 'log-c', date: '2024-02-20T10:00:00.000Z', homeTeam: 'E', awayTeam: 'F' }))

      const list = store.listGameLogs('liga-001')

      expect(list).toHaveLength(3)
      // Sorted date descending
      expect(list[0].id).toBe('log-b')
      expect(list[1].id).toBe('log-c')
      expect(list[2].id).toBe('log-a')
    })

    it('returns summary fields correctly', () => {
      const store = createLigaStore()
      store.saveGameLog(makeTestRecord())

      const list = store.listGameLogs('liga-001')
      expect(list[0].id).toBe('test-log-001')
      expect(list[0].date).toBe('2024-03-15T19:30:00.000Z')
      expect(list[0].homeTeam).toBe('Eagles')
      expect(list[0].awayTeam).toBe('Hawks')
      expect(list[0].finalScores).toEqual({ home: 78, away: 72 })
    })

    it('excludes corrupted files from list (does not delete them)', () => {
      const store = createLigaStore()
      store.saveGameLog(makeTestRecord({ id: 'good-log' }))

      // Write a corrupted file
      const logsDir = join(TEST_USER_DATA, 'gameLogs', 'liga-001')
      writeFileSync(join(logsDir, 'corrupt.json'), 'NOT VALID JSON {{{', 'utf-8')

      const list = store.listGameLogs('liga-001')
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('good-log')

      // Verify corrupted file still exists (not deleted)
      expect(existsSync(join(logsDir, 'corrupt.json'))).toBe(true)
    })

    it('excludes files with missing required fields', () => {
      const store = createLigaStore()
      store.saveGameLog(makeTestRecord({ id: 'valid-log' }))

      // Write a JSON file with missing 'date' field
      const logsDir = join(TEST_USER_DATA, 'gameLogs', 'liga-001')
      writeFileSync(join(logsDir, 'incomplete.json'), JSON.stringify({ id: 'incomplete' }), 'utf-8')

      const list = store.listGameLogs('liga-001')
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('valid-log')
    })

    it('returns empty array for non-existent liga', () => {
      const store = createLigaStore()
      const list = store.listGameLogs('non-existent-liga')
      expect(list).toEqual([])
    })
  })

  describe('deleteGameLog', () => {
    it('removes the JSON file from disk', () => {
      const store = createLigaStore()
      const record = makeTestRecord()
      store.saveGameLog(record)

      const filePath = join(TEST_USER_DATA, 'gameLogs', 'liga-001', 'test-log-001.json')
      expect(existsSync(filePath)).toBe(true)

      store.deleteGameLog('liga-001', 'test-log-001')
      expect(existsSync(filePath)).toBe(false)
    })

    it('log no longer appears in listing after deletion', () => {
      const store = createLigaStore()
      store.saveGameLog(makeTestRecord({ id: 'log-to-delete' }))
      store.saveGameLog(makeTestRecord({ id: 'log-to-keep', date: '2024-01-01T00:00:00.000Z' }))

      store.deleteGameLog('liga-001', 'log-to-delete')

      const list = store.listGameLogs('liga-001')
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('log-to-keep')
    })

    it('does not throw when file does not exist', () => {
      const store = createLigaStore()
      expect(() => store.deleteGameLog('liga-001', 'nonexistent')).not.toThrow()
    })
  })

  describe('loadGameLog error handling', () => {
    it('throws when log file does not exist', () => {
      const store = createLigaStore()
      expect(() => store.loadGameLog('liga-001', 'nonexistent')).toThrow(/not found or is corrupted/)
    })

    it('throws when log file is corrupted JSON', () => {
      const store = createLigaStore()
      const logsDir = join(TEST_USER_DATA, 'gameLogs', 'liga-001')
      mkdirSync(logsDir, { recursive: true })
      writeFileSync(join(logsDir, 'bad-record.json'), '{{invalid json!!', 'utf-8')

      expect(() => store.loadGameLog('liga-001', 'bad-record')).toThrow(/not found or is corrupted/)
    })
  })
})
