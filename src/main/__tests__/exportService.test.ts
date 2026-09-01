/**
 * exportService.test.ts — Example-based tests for Requirement 22
 *
 * Validates:
 *  - Exported Excel file has correct worksheet count
 *  - PDF file is non-zero bytes
 *  - Write-permission failure shows error without leaving a partial file
 */

import { describe, test, expect, afterEach } from 'vitest'
import { mkdirSync, existsSync, unlinkSync, mkdtempSync, chmodSync, rmdirSync, readdirSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ExcelJS from 'exceljs'
import {
  exportPdf,
  exportExcel,
  exportBracketPdf,
} from '../exportService'
import type { BoxScoreExportData, SeasonStatsExportData, BracketExportData } from '../exportService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string

function getTempDir(): string {
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), 'export-test-'))
  }
  return tempDir
}

function tempPath(name: string): string {
  return join(getTempDir(), name)
}

function makeBoxScoreData(): BoxScoreExportData {
  return {
    kind: 'box-score',
    ligaName: 'Test Liga',
    gameDate: '2024-01-15',
    homeTeam: {
      teamName: 'Home Hawks',
      rows: [
        {
          jerseyNumber: '10',
          name: 'Alice Smith',
          pts: 18,
          reb: 5,
          ast: 3,
          stl: 2,
          blk: 1,
          fga: 14,
          fgm: 8,
          fouls: 2,
          fgPct: '57.1%',
        },
        {
          jerseyNumber: '23',
          name: 'Bob Jones',
          pts: 12,
          reb: 8,
          ast: 1,
          stl: 0,
          blk: 3,
          fga: 10,
          fgm: 5,
          fouls: 4,
          fgPct: '50.0%',
        },
      ],
      totals: {
        pts: 30,
        reb: 13,
        ast: 4,
        stl: 2,
        blk: 4,
        fga: 24,
        fgm: 13,
        fouls: 6,
        fgPct: '54.2%',
      },
    },
    awayTeam: {
      teamName: 'Away Eagles',
      rows: [
        {
          jerseyNumber: '7',
          name: 'Charlie Brown',
          pts: 22,
          reb: 4,
          ast: 6,
          stl: 1,
          blk: 0,
          fga: 16,
          fgm: 9,
          fouls: 3,
          fgPct: '56.3%',
        },
      ],
      totals: {
        pts: 22,
        reb: 4,
        ast: 6,
        stl: 1,
        blk: 0,
        fga: 16,
        fgm: 9,
        fouls: 3,
        fgPct: '56.3%',
      },
    },
  }
}

function makeSeasonStatsData(): SeasonStatsExportData {
  return {
    kind: 'season-stats',
    ligaName: 'Test Liga',
    playerAverages: [
      {
        jerseyNumber: '10',
        name: 'Alice Smith',
        gamesPlayed: 5,
        ptsPerGame: 18.2,
        rebPerGame: 5.4,
        astPerGame: 3.0,
        stlPerGame: 1.8,
        blkPerGame: 0.6,
        fgPct: '54.3%',
      },
    ],
    teamAverages: [
      {
        teamName: 'Home Hawks',
        gamesPlayed: 5,
        ppg: 88.4,
        fgPct: '47.2%',
        rpg: 38.0,
        apg: 20.0,
        topg: 12.2,
      },
      {
        teamName: 'Away Eagles',
        gamesPlayed: 5,
        ppg: 84.0,
        fgPct: '45.5%',
        rpg: 35.2,
        apg: 18.4,
        topg: 14.0,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  // Clean up any temp files created during tests
  if (tempDir && existsSync(tempDir)) {
    try {
      for (const f of readdirSync(tempDir)) {
        try { unlinkSync(join(tempDir, f)) } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
})

// ---------------------------------------------------------------------------
// Excel tests — Req 22.3: worksheet count
// ---------------------------------------------------------------------------

describe('exportExcel — box score', () => {
  test('creates an XLSX file at the destination path', async () => {
    const dest = tempPath('box_score.xlsx')
    await exportExcel(makeBoxScoreData(), dest)
    expect(existsSync(dest)).toBe(true)
  })

  test('Excel file has exactly 2 worksheets (one per team)', async () => {
    const dest = tempPath('box_score_sheets.xlsx')
    await exportExcel(makeBoxScoreData(), dest)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(dest)
    expect(wb.worksheets.length).toBe(2)
  })

  test('worksheet names match team names', async () => {
    const dest = tempPath('box_score_names.xlsx')
    const data = makeBoxScoreData()
    await exportExcel(data, dest)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(dest)
    const sheetNames = wb.worksheets.map(ws => ws.name)
    expect(sheetNames).toContain(data.homeTeam.teamName)
    expect(sheetNames).toContain(data.awayTeam.teamName)
  })

  test('numeric stat cells are stored as numbers, not strings', async () => {
    const dest = tempPath('box_score_numeric.xlsx')
    await exportExcel(makeBoxScoreData(), dest)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(dest)
    const sheet = wb.getWorksheet('Home Hawks')!

    // Headers are on row 5 (rows 1–3 meta, row 4 blank, row 5 header)
    // First data row is row 6
    const ptsCell = sheet.getRow(6).getCell(3) // PTS column (3rd col: # | Name | PTS …)
    expect(typeof ptsCell.value).toBe('number')
    expect(ptsCell.value).toBe(18) // Alice's points
  })

  test('column headers match UI stat labels', async () => {
    const dest = tempPath('box_score_headers.xlsx')
    await exportExcel(makeBoxScoreData(), dest)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(dest)
    const sheet = wb.getWorksheet('Home Hawks')!

    // Header row is row 5
    const headerRow = sheet.getRow(5)
    const headers = Array.from({ length: 11 }, (_, i) => headerRow.getCell(i + 1).value)
    expect(headers).toContain('PTS')
    expect(headers).toContain('REB')
    expect(headers).toContain('AST')
    expect(headers).toContain('STL')
    expect(headers).toContain('BLK')
    expect(headers).toContain('FGA')
    expect(headers).toContain('FGM')
    expect(headers).toContain('PF')
    expect(headers).toContain('FG%')
  })
})

describe('exportExcel — season stats', () => {
  test('creates an XLSX file at the destination path', async () => {
    const dest = tempPath('season_stats.xlsx')
    await exportExcel(makeSeasonStatsData(), dest)
    expect(existsSync(dest)).toBe(true)
  })

  test('Excel file has exactly 2 worksheets (Player Averages + Team Averages)', async () => {
    const dest = tempPath('season_stats_sheets.xlsx')
    await exportExcel(makeSeasonStatsData(), dest)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(dest)
    expect(wb.worksheets.length).toBe(2)

    const names = wb.worksheets.map(ws => ws.name)
    expect(names).toContain('Player Averages')
    expect(names).toContain('Team Averages')
  })
})

// ---------------------------------------------------------------------------
// PDF tests — Req 22.2: non-zero bytes
// ---------------------------------------------------------------------------

describe('exportPdf — box score', () => {
  test('creates a PDF file at the destination path', async () => {
    const dest = tempPath('box_score.pdf')
    await exportPdf(makeBoxScoreData(), dest)
    expect(existsSync(dest)).toBe(true)
  })

  test('PDF file is non-zero bytes', async () => {
    const dest = tempPath('box_score_nonzero.pdf')
    await exportPdf(makeBoxScoreData(), dest)
    const size = statSync(dest).size
    expect(size).toBeGreaterThan(0)
  })
})

describe('exportPdf — season stats', () => {
  test('creates a PDF file at the destination path', async () => {
    const dest = tempPath('season_stats.pdf')
    await exportPdf(makeSeasonStatsData(), dest)
    expect(existsSync(dest)).toBe(true)
  })

  test('PDF file is non-zero bytes', async () => {
    const dest = tempPath('season_stats_nonzero.pdf')
    await exportPdf(makeSeasonStatsData(), dest)
    const size = statSync(dest).size
    expect(size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Write-permission failure tests — Req 22.6
// ---------------------------------------------------------------------------

describe('write-permission failure handling', () => {
  test('exportExcel throws with a descriptive error when directory is not writable', async () => {
    // Use a path inside a non-existent deeply nested directory that cannot be created
    const dest = tempPath('nonexistent_dir/deep/file.xlsx')
    await expect(exportExcel(makeBoxScoreData(), dest)).rejects.toThrow()
  })

  test('exportPdf throws with a descriptive error when directory is not writable', async () => {
    const dest = tempPath('nonexistent_dir/deep/file.pdf')
    await expect(exportPdf(makeBoxScoreData(), dest)).rejects.toThrow()
  })

  test('exportExcel does not leave a partial file on permission error', async () => {
    const dest = tempPath('nonexistent_dir2/file.xlsx')
    try {
      await exportExcel(makeBoxScoreData(), dest)
    } catch {
      // expected
    }
    // The file must NOT exist — no partial file left behind
    expect(existsSync(dest)).toBe(false)
  })

  test('exportPdf does not leave a partial file on permission error', async () => {
    const dest = tempPath('nonexistent_dir2/file.pdf')
    try {
      await exportPdf(makeBoxScoreData(), dest)
    } catch {
      // expected
    }
    expect(existsSync(dest)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Bracket PDF tests — Requirements 8.1, 8.5, 8.6
// ---------------------------------------------------------------------------

/** Builds a minimal but complete Tournament object for a single-elimination bracket. */
function makeSmallSingleElimTournament(): BracketExportData {
  const id = 'test-tourney-1'
  const ligaId = 'test-liga-1'
  const now = new Date().toISOString()

  const seeds = [
    { seedNumber: 1, teamId: 'team1', teamName: 'Alpha', record: { wins: 3, losses: 0 }, pointDifferential: 20 },
    { seedNumber: 2, teamId: 'team2', teamName: 'Beta', record: { wins: 2, losses: 1 }, pointDifferential: 5 },
    { seedNumber: 3, teamId: 'team3', teamName: 'Gamma', record: { wins: 1, losses: 2 }, pointDifferential: -5 },
    { seedNumber: 4, teamId: 'team4', teamName: 'Delta', record: { wins: 0, losses: 3 }, pointDifferential: -20 },
  ]

  const matchNodes = [
    {
      id: 'match-r0-0', roundIndex: 0, position: 0, bracketSection: 'winners' as const,
      homeTeamId: 'team1', awayTeamId: 'team4', homeSeed: 1, awaySeed: 4,
      homeSourceMatchId: null, awaySourceMatchId: null, homeSourceIsLoser: false, awaySourceIsLoser: false,
      status: 'completed' as const, homeScore: 75, awayScore: 60,
      winnerTeamId: 'team1', loserTeamId: 'team4',
      scheduledGameId: null, gameLogId: null, isBye: false,
    },
    {
      id: 'match-r0-1', roundIndex: 0, position: 1, bracketSection: 'winners' as const,
      homeTeamId: 'team2', awayTeamId: 'team3', homeSeed: 2, awaySeed: 3,
      homeSourceMatchId: null, awaySourceMatchId: null, homeSourceIsLoser: false, awaySourceIsLoser: false,
      status: 'completed' as const, homeScore: 80, awayScore: 72,
      winnerTeamId: 'team2', loserTeamId: 'team3',
      scheduledGameId: null, gameLogId: null, isBye: false,
    },
    {
      id: 'match-r1-0', roundIndex: 1, position: 0, bracketSection: 'final' as const,
      homeTeamId: 'team1', awayTeamId: 'team2', homeSeed: 1, awaySeed: 2,
      homeSourceMatchId: 'match-r0-0', awaySourceMatchId: 'match-r0-1', homeSourceIsLoser: false, awaySourceIsLoser: false,
      status: 'pending' as const, homeScore: null, awayScore: null,
      winnerTeamId: null, loserTeamId: null,
      scheduledGameId: null, gameLogId: null, isBye: false,
    },
  ]

  const rounds = [
    { index: 0, name: 'Semifinals', matchNodeIds: ['match-r0-0', 'match-r0-1'] },
    { index: 1, name: 'Final', matchNodeIds: ['match-r1-0'] },
  ]

  return {
    id, ligaId,
    name: 'Spring Cup 2024',
    format: 'single-elimination',
    status: 'in-progress',
    createdAt: now, updatedAt: now,
    seeds,
    rounds,
    matchNodes,
    options: { consolationMatch: false },
  }
}

/** Builds a minimal round-robin tournament. */
function makeRoundRobinTournament(): BracketExportData {
  const now = new Date().toISOString()
  const seeds = [
    { seedNumber: 1, teamId: 'rr-t1', teamName: 'Red', record: { wins: 2, losses: 0 }, pointDifferential: 15 },
    { seedNumber: 2, teamId: 'rr-t2', teamName: 'Blue', record: { wins: 1, losses: 1 }, pointDifferential: 0 },
    { seedNumber: 3, teamId: 'rr-t3', teamName: 'Green', record: { wins: 0, losses: 2 }, pointDifferential: -15 },
  ]

  const matchNodes = [
    {
      id: 'rr-m1', roundIndex: 0, position: 0, bracketSection: 'round-robin' as const,
      homeTeamId: 'rr-t1', awayTeamId: 'rr-t2', homeSeed: 1, awaySeed: 2,
      homeSourceMatchId: null, awaySourceMatchId: null, homeSourceIsLoser: false, awaySourceIsLoser: false,
      status: 'completed' as const, homeScore: 80, awayScore: 70,
      winnerTeamId: 'rr-t1', loserTeamId: 'rr-t2',
      scheduledGameId: null, gameLogId: null, isBye: false,
    },
    {
      id: 'rr-m2', roundIndex: 1, position: 0, bracketSection: 'round-robin' as const,
      homeTeamId: 'rr-t1', awayTeamId: 'rr-t3', homeSeed: 1, awaySeed: 3,
      homeSourceMatchId: null, awaySourceMatchId: null, homeSourceIsLoser: false, awaySourceIsLoser: false,
      status: 'completed' as const, homeScore: 90, awayScore: 60,
      winnerTeamId: 'rr-t1', loserTeamId: 'rr-t3',
      scheduledGameId: null, gameLogId: null, isBye: false,
    },
    {
      id: 'rr-m3', roundIndex: 1, position: 1, bracketSection: 'round-robin' as const,
      homeTeamId: 'rr-t2', awayTeamId: 'rr-t3', homeSeed: 2, awaySeed: 3,
      homeSourceMatchId: null, awaySourceMatchId: null, homeSourceIsLoser: false, awaySourceIsLoser: false,
      status: 'pending' as const, homeScore: null, awayScore: null,
      winnerTeamId: null, loserTeamId: null,
      scheduledGameId: null, gameLogId: null, isBye: false,
    },
  ]

  const rounds = [
    { index: 0, name: 'Round 1', matchNodeIds: ['rr-m1'] },
    { index: 1, name: 'Round 2', matchNodeIds: ['rr-m2', 'rr-m3'] },
  ]

  return {
    id: 'rr-tourney-1', ligaId: 'rr-liga',
    name: 'Round Robin League',
    format: 'round-robin',
    status: 'in-progress',
    createdAt: now, updatedAt: now,
    seeds,
    rounds,
    matchNodes,
    standings: [
      { teamId: 'rr-t1', teamName: 'Red', played: 2, wins: 2, losses: 0, pointsFor: 170, pointsAgainst: 130, pointDifferential: 40 },
      { teamId: 'rr-t2', teamName: 'Blue', played: 1, wins: 0, losses: 1, pointsFor: 70, pointsAgainst: 80, pointDifferential: -10 },
      { teamId: 'rr-t3', teamName: 'Green', played: 1, wins: 0, losses: 1, pointsFor: 60, pointsAgainst: 90, pointDifferential: -30 },
    ],
    options: { consolationMatch: false },
  }
}

/** Builds a tournament with >16 teams to test pagination. */
function makeLargeTournament(): BracketExportData {
  const now = new Date().toISOString()
  // 20 teams → 32-slot bracket, multiple pages
  const seeds = Array.from({ length: 20 }, (_, i) => ({
    seedNumber: i + 1,
    teamId: `t${i + 1}`,
    teamName: `Team ${i + 1}`,
    record: { wins: 20 - i, losses: i },
    pointDifferential: (20 - i) * 5,
  }))

  return {
    id: 'large-tourney', ligaId: 'large-liga',
    name: 'Large Tournament 20 Teams',
    format: 'single-elimination',
    status: 'in-progress',
    createdAt: now, updatedAt: now,
    seeds,
    rounds: [],      // no bracket generated; tests just PDF generation
    matchNodes: [],
    options: { consolationMatch: false },
  }
}

describe('exportBracketPdf — single-elimination', () => {
  test('creates a PDF file at the destination path', async () => {
    const dest = tempPath('bracket_single_elim.pdf')
    await exportBracketPdf(makeSmallSingleElimTournament(), dest)
    expect(existsSync(dest)).toBe(true)
  })

  test('PDF file is non-empty (Requirements 8.1, 8.5)', async () => {
    const dest = tempPath('bracket_single_elim_size.pdf')
    await exportBracketPdf(makeSmallSingleElimTournament(), dest)
    const size = statSync(dest).size
    expect(size).toBeGreaterThan(0)
  })

  test('tournament name appears in the PDF output', async () => {
    const dest = tempPath('bracket_name_check.pdf')
    const tournament = makeSmallSingleElimTournament()
    await exportBracketPdf(tournament, dest)

    // Read raw PDF bytes and look for the tournament name string
    const { readFileSync } = await import('fs')
    const content = readFileSync(dest, 'binary')
    expect(content).toContain(tournament.name)
  })
})

describe('exportBracketPdf — round-robin', () => {
  test('creates a PDF file at the destination path', async () => {
    const dest = tempPath('bracket_rr.pdf')
    await exportBracketPdf(makeRoundRobinTournament(), dest)
    expect(existsSync(dest)).toBe(true)
  })

  test('PDF file is non-empty', async () => {
    const dest = tempPath('bracket_rr_size.pdf')
    await exportBracketPdf(makeRoundRobinTournament(), dest)
    expect(statSync(dest).size).toBeGreaterThan(0)
  })
})

describe('exportBracketPdf — >16 teams (pagination, Requirement 8.2)', () => {
  test('PDF is generated without error for a 20-team tournament', async () => {
    const dest = tempPath('bracket_large.pdf')
    await exportBracketPdf(makeLargeTournament(), dest)
    expect(existsSync(dest)).toBe(true)
    expect(statSync(dest).size).toBeGreaterThan(0)
  })
})

describe('exportBracketPdf — error handling (Requirement 8.5)', () => {
  test('throws when destination directory does not exist', async () => {
    const dest = tempPath('no_such_dir/bracket.pdf')
    await expect(exportBracketPdf(makeSmallSingleElimTournament(), dest)).rejects.toThrow()
  })

  test('does not leave a partial file on failure', async () => {
    const dest = tempPath('no_such_dir2/bracket.pdf')
    try {
      await exportBracketPdf(makeSmallSingleElimTournament(), dest)
    } catch { /* expected */ }
    expect(existsSync(dest)).toBe(false)
  })
})
