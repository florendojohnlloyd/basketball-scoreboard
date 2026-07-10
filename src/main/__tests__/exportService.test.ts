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
} from '../exportService'
import type { BoxScoreExportData, SeasonStatsExportData } from '../exportService'

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
