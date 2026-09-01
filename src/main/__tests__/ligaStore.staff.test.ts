/**
 * Example-based tests for LigaStore staff management (Requirement 26).
 *
 * Tests:
 *  - Duplicate assignment blocked
 *  - Staff deletion removes from all games
 *  - Staff CRUD operations
 *  - Staff name and role validation constraints enforced at store level
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import type { StaffMember, ScheduledGame } from '../../shared/types'

// ---------------------------------------------------------------------------
// Mock electron app.getPath to use a temp directory
// ---------------------------------------------------------------------------
const TEST_USER_DATA = join(__dirname, '__test_userData_staff__')

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

function createTestLiga(store: ReturnType<typeof createLigaStore>) {
  return store.createLiga('Test Liga', 2024)
}

function addTestTeams(store: ReturnType<typeof createLigaStore>, ligaId: string) {
  const home = store.addTeam(ligaId, { name: 'Eagles', color: '#111', logoPath: null, playerImagePath: null, players: [] })
  const away = store.addTeam(ligaId, { name: 'Hawks', color: '#222', logoPath: null, playerImagePath: null, players: [] })
  return { home, away }
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
// Tests
// ---------------------------------------------------------------------------

describe('LigaStore - Staff Management (Requirement 26)', () => {

  describe('addStaff', () => {
    it('creates a staff member with name and role', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)

      const staff = store.addStaff(liga.id, { name: 'John Smith', role: 'Referee' })

      expect(staff.id).toBeTruthy()
      expect(staff.name).toBe('John Smith')
      expect(staff.role).toBe('Referee')
    })

    it('persists staff in the Liga JSON', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)

      store.addStaff(liga.id, { name: 'Jane Doe', role: 'Scorekeeper' })

      const loaded = store.loadLiga(liga.id)
      expect(loaded.staff).toHaveLength(1)
      expect(loaded.staff![0].name).toBe('Jane Doe')
      expect(loaded.staff![0].role).toBe('Scorekeeper')
    })

    it('allows custom roles up to 30 characters', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)

      const customRole = 'Stats Coordinator'
      const staff = store.addStaff(liga.id, { name: 'Bob', role: customRole })

      expect(staff.role).toBe(customRole)
    })

    it('assigns unique IDs to each staff member', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)

      const s1 = store.addStaff(liga.id, { name: 'Staff 1', role: 'Referee' })
      const s2 = store.addStaff(liga.id, { name: 'Staff 2', role: 'Referee' })

      expect(s1.id).not.toBe(s2.id)
    })
  })

  describe('listStaff', () => {
    it('returns all staff members for the Liga', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)

      store.addStaff(liga.id, { name: 'Ref 1', role: 'Referee' })
      store.addStaff(liga.id, { name: 'Score 1', role: 'Scorekeeper' })
      store.addStaff(liga.id, { name: 'Clock 1', role: 'Shot Clock Operator' })

      const list = store.listStaff(liga.id)
      expect(list).toHaveLength(3)
    })

    it('returns empty array when no staff exist', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)

      const list = store.listStaff(liga.id)
      expect(list).toEqual([])
    })
  })

  describe('updateStaff', () => {
    it('updates staff name', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const staff = store.addStaff(liga.id, { name: 'Old Name', role: 'Referee' })

      store.updateStaff(liga.id, staff.id, { name: 'New Name' })

      const list = store.listStaff(liga.id)
      expect(list[0].name).toBe('New Name')
      expect(list[0].role).toBe('Referee') // unchanged
    })

    it('updates staff role', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const staff = store.addStaff(liga.id, { name: 'Staff', role: 'Referee' })

      store.updateStaff(liga.id, staff.id, { role: 'Scorekeeper' })

      const list = store.listStaff(liga.id)
      expect(list[0].role).toBe('Scorekeeper')
    })

    it('throws when staff not found', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)

      expect(() => store.updateStaff(liga.id, 'nonexistent', { name: 'X' }))
        .toThrow(/not found/)
    })
  })

  describe('removeStaff', () => {
    it('removes the staff member from the list', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const s1 = store.addStaff(liga.id, { name: 'Keep', role: 'Referee' })
      const s2 = store.addStaff(liga.id, { name: 'Remove', role: 'Scorekeeper' })

      store.removeStaff(liga.id, s2.id)

      const list = store.listStaff(liga.id)
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(s1.id)
    })

    it('removes staff from all scheduled game entries', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const staff = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })

      // Create two games and assign the staff to both
      const game1 = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })
      const game2 = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-08', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })

      store.assignStaffToGame(liga.id, game1.id, staff.id)
      store.assignStaffToGame(liga.id, game2.id, staff.id)

      // Verify assigned
      let games = store.listScheduledGames(liga.id)
      expect(games[0].assignedStaff).toContain(staff.id)
      expect(games[1].assignedStaff).toContain(staff.id)

      // Delete staff
      const { affectedGameIds } = store.removeStaff(liga.id, staff.id)

      // Verify removed from all games
      expect(affectedGameIds).toHaveLength(2)
      games = store.listScheduledGames(liga.id)
      expect(games[0].assignedStaff).not.toContain(staff.id)
      expect(games[1].assignedStaff).not.toContain(staff.id)
    })

    it('returns affected game count when staff is removed', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const staff = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })

      const game = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })
      store.assignStaffToGame(liga.id, game.id, staff.id)

      const { affectedGameIds } = store.removeStaff(liga.id, staff.id)
      expect(affectedGameIds).toEqual([game.id])
    })

    it('returns empty affectedGameIds when staff has no assignments', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const staff = store.addStaff(liga.id, { name: 'Unassigned', role: 'Referee' })

      const { affectedGameIds } = store.removeStaff(liga.id, staff.id)
      expect(affectedGameIds).toEqual([])
    })
  })

  describe('assignStaffToGame', () => {
    it('assigns a staff member to a game', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const staff = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })

      const game = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })

      store.assignStaffToGame(liga.id, game.id, staff.id)

      const games = store.listScheduledGames(liga.id)
      expect(games[0].assignedStaff).toContain(staff.id)
    })

    it('blocks duplicate assignment of the same staff to the same game', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const staff = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })

      const game = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })

      store.assignStaffToGame(liga.id, game.id, staff.id)

      // Second assignment should throw
      expect(() => store.assignStaffToGame(liga.id, game.id, staff.id))
        .toThrow(/already assigned/)
    })

    it('allows same staff to be assigned to different games', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const staff = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })

      const game1 = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })
      const game2 = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-08', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })

      store.assignStaffToGame(liga.id, game1.id, staff.id)
      store.assignStaffToGame(liga.id, game2.id, staff.id)

      const games = store.listScheduledGames(liga.id)
      expect(games[0].assignedStaff).toContain(staff.id)
      expect(games[1].assignedStaff).toContain(staff.id)
    })

    it('allows multiple different staff to be assigned to the same game', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const ref = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })
      const scorer = store.addStaff(liga.id, { name: 'Scorer', role: 'Scorekeeper' })

      const game = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })

      store.assignStaffToGame(liga.id, game.id, ref.id)
      store.assignStaffToGame(liga.id, game.id, scorer.id)

      const games = store.listScheduledGames(liga.id)
      expect(games[0].assignedStaff).toHaveLength(2)
      expect(games[0].assignedStaff).toContain(ref.id)
      expect(games[0].assignedStaff).toContain(scorer.id)
    })

    it('throws when game not found', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const staff = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })

      expect(() => store.assignStaffToGame(liga.id, 'nonexistent', staff.id))
        .toThrow(/not found/)
    })
  })

  describe('unassignStaffFromGame', () => {
    it('removes a staff member from a game', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const staff = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })

      const game = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })
      store.assignStaffToGame(liga.id, game.id, staff.id)

      store.unassignStaffFromGame(liga.id, game.id, staff.id)

      const games = store.listScheduledGames(liga.id)
      expect(games[0].assignedStaff).not.toContain(staff.id)
    })

    it('does not affect other staff assignments on the same game', () => {
      const store = createLigaStore()
      const liga = createTestLiga(store)
      const { home, away } = addTestTeams(store, liga.id)
      const ref = store.addStaff(liga.id, { name: 'Ref', role: 'Referee' })
      const scorer = store.addStaff(liga.id, { name: 'Scorer', role: 'Scorekeeper' })

      const game = store.addScheduledGame(liga.id, {
        ligaId: liga.id, date: '2024-06-01', homeTeamId: home.id, awayTeamId: away.id,
        assignedStaff: [], status: 'Scheduled',
      })
      store.assignStaffToGame(liga.id, game.id, ref.id)
      store.assignStaffToGame(liga.id, game.id, scorer.id)

      store.unassignStaffFromGame(liga.id, game.id, ref.id)

      const games = store.listScheduledGames(liga.id)
      expect(games[0].assignedStaff).not.toContain(ref.id)
      expect(games[0].assignedStaff).toContain(scorer.id)
    })
  })
})
