/**
 * exportService.ts — PDF and Excel export (Requirement 22)
 *
 * Provides two public functions:
 *   exportPdf(data, destinationPath)   — writes a PDF containing Liga name,
 *                                        game date, team names, and all stat rows
 *   exportExcel(data, destinationPath) — writes an XLSX file with one worksheet
 *                                        per team (box score) or one per category
 *                                        (season stats); numeric cells are numbers
 *
 * Both functions clean up partial files on error (Requirement 22.6).
 */

import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { statSync, accessSync, constants as fsConstants } from 'fs';
import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// Data shapes passed from the renderer via IPC
// ---------------------------------------------------------------------------

export interface ExportPlayerRow {
  jerseyNumber: string;
  name: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fgm: number;
  fouls: number;
  fgPct: string; // pre-formatted e.g. "53.3%" or "—"
}

export interface ExportTeamData {
  teamName: string;
  rows: ExportPlayerRow[];
  totals: Omit<ExportPlayerRow, 'jerseyNumber' | 'name' | 'fgPct'> & { fgPct: string };
}

/** Shape for Box Score export */
export interface BoxScoreExportData {
  kind: 'box-score';
  ligaName: string;
  gameDate: string;  // human-readable date string
  homeTeam: ExportTeamData;
  awayTeam: ExportTeamData;
}

export interface ExportPlayerAvgRow {
  jerseyNumber: string;
  name: string;
  gamesPlayed: number;
  ptsPerGame: number;
  rebPerGame: number;
  astPerGame: number;
  stlPerGame: number;
  blkPerGame: number;
  fgPct: string; // "—" or "53.3%"
}

export interface ExportTeamAvgRow {
  teamName: string;
  gamesPlayed: number;
  ppg: number;
  fgPct: string;
  rpg: number;
  apg: number;
  topg: number;
}

/** Shape for Season Stats export */
export interface SeasonStatsExportData {
  kind: 'season-stats';
  ligaName: string;
  playerAverages: ExportPlayerAvgRow[];
  teamAverages: ExportTeamAvgRow[];
}

export type ExportData = BoxScoreExportData | SeasonStatsExportData;

// ---------------------------------------------------------------------------
// Stat column headers (match UI labels)
// ---------------------------------------------------------------------------

const BOX_SCORE_HEADERS = ['#', 'Name', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FGA', 'FGM', 'PF', 'FG%'];
const PLAYER_AVG_HEADERS = ['#', 'Player', 'GP', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%'];
const TEAM_AVG_HEADERS = ['Team', 'GP', 'PPG', 'FG%', 'RPG', 'APG', 'TOPG'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check that the parent directory of the destination is writable.
 * Throws if not writable.
 */
function assertWritable(destinationPath: string): void {
  const dir = dirname(destinationPath);
  try {
    accessSync(dir, fsConstants.W_OK);
  } catch {
    throw new Error(`Destination directory is not writable: ${dir}`);
  }
}

/**
 * Remove a partially written file, swallowing any unlink error.
 */
function safeUnlink(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

/**
 * Generate a PDF document and write it to `destinationPath`.
 *
 * Content:
 *  - Liga name, game date, both team names (box score)
 *    OR Liga name (season stats)
 *  - All stat rows visible in the source view
 *
 * Throws on write failure; does NOT leave a partial file (Req 22.6).
 */
export async function exportPdf(data: ExportData, destinationPath: string): Promise<void> {
  assertWritable(destinationPath);

  let pdfBytes: Uint8Array;

  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 40;
    const marginR = 40;
    const contentW = pageW - marginL - marginR;
    let y = 40;

    // ── Header ──────────────────────────────────────────────────────────────
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(data.ligaName || 'Liga', marginL, y);
    y += 24;

    if (data.kind === 'box-score') {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.homeTeam.teamName}  vs  ${data.awayTeam.teamName}`, marginL, y);
      y += 18;
      doc.text(`Date: ${data.gameDate}`, marginL, y);
      y += 30;

      // ── Render each team ──────────────────────────────────────────────────
      for (const team of [data.homeTeam, data.awayTeam]) {
        y = renderBoxScoreTeamPdf(doc, team, marginL, contentW, y, pageW);
        y += 20;
      }
    } else {
      // season stats
      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.text('Season Stats', marginL, y);
      y += 30;

      y = renderPlayerAveragesPdf(doc, data.playerAverages, marginL, contentW, y, pageW);
      y += 20;
      y = renderTeamAveragesPdf(doc, data.teamAverages, marginL, contentW, y, pageW);
    }

    pdfBytes = doc.output('arraybuffer') as unknown as Uint8Array;
  } catch (err) {
    safeUnlink(destinationPath);
    throw new Error(`PDF generation failed: ${(err as Error).message}`);
  }

  try {
    writeFileSync(destinationPath, Buffer.from(pdfBytes));
  } catch (err) {
    safeUnlink(destinationPath);
    throw new Error(`Failed to write PDF file: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// PDF rendering helpers
// ---------------------------------------------------------------------------

function renderBoxScoreTeamPdf(
  doc: jsPDF,
  team: ExportTeamData,
  marginL: number,
  contentW: number,
  y: number,
  pageW: number,
): number {
  const colWidths = computeBoxScoreColWidths(contentW);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(team.teamName, marginL, y);
  y += 16;

  y = renderTableHeaderPdf(doc, BOX_SCORE_HEADERS, colWidths, marginL, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const row of team.rows) {
    if (y > 530) { doc.addPage(); y = 40; }
    const cells = boxScoreRowToCells(row);
    y = renderTableRowPdf(doc, cells, colWidths, marginL, y);
  }

  // Totals row
  if (y > 530) { doc.addPage(); y = 40; }
  doc.setFont('helvetica', 'bold');
  const totalsCells = ['', 'TEAM', ...boxScoreTotalsToCells(team.totals)];
  y = renderTableRowPdf(doc, totalsCells, colWidths, marginL, y);
  doc.setFont('helvetica', 'normal');

  return y;
}

function renderPlayerAveragesPdf(
  doc: jsPDF,
  rows: ExportPlayerAvgRow[],
  marginL: number,
  contentW: number,
  y: number,
  _pageW: number,
): number {
  const colWidths = computePlayerAvgColWidths(contentW);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Player Averages', marginL, y);
  y += 16;

  y = renderTableHeaderPdf(doc, PLAYER_AVG_HEADERS, colWidths, marginL, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const row of rows) {
    if (y > 530) { doc.addPage(); y = 40; }
    const cells = [
      row.jerseyNumber ?? '—',
      row.name,
      String(row.gamesPlayed),
      row.ptsPerGame.toFixed(1),
      row.rebPerGame.toFixed(1),
      row.astPerGame.toFixed(1),
      row.stlPerGame.toFixed(1),
      row.blkPerGame.toFixed(1),
      row.fgPct,
    ];
    y = renderTableRowPdf(doc, cells, colWidths, marginL, y);
  }
  return y;
}

function renderTeamAveragesPdf(
  doc: jsPDF,
  rows: ExportTeamAvgRow[],
  marginL: number,
  contentW: number,
  y: number,
  _pageW: number,
): number {
  const colWidths = computeTeamAvgColWidths(contentW);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Team Averages', marginL, y);
  y += 16;

  y = renderTableHeaderPdf(doc, TEAM_AVG_HEADERS, colWidths, marginL, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const row of rows) {
    if (y > 530) { doc.addPage(); y = 40; }
    const cells = [
      row.teamName,
      String(row.gamesPlayed),
      row.ppg.toFixed(1),
      row.fgPct,
      row.rpg.toFixed(1),
      row.apg.toFixed(1),
      row.topg.toFixed(1),
    ];
    y = renderTableRowPdf(doc, cells, colWidths, marginL, y);
  }
  return y;
}

function renderTableHeaderPdf(
  doc: jsPDF,
  headers: string[],
  colWidths: number[],
  marginL: number,
  y: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setDrawColor(180, 180, 180);
  let x = marginL;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 2, y);
    x += colWidths[i];
  }
  y += 4;
  doc.line(marginL, y, marginL + colWidths.reduce((a, b) => a + b, 0), y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  return y;
}

function renderTableRowPdf(
  doc: jsPDF,
  cells: string[],
  colWidths: number[],
  marginL: number,
  y: number,
): number {
  let x = marginL;
  for (let i = 0; i < cells.length; i++) {
    doc.text(cells[i] ?? '', x + 2, y);
    x += colWidths[i];
  }
  return y + 13;
}

// ── Column width computations ──────────────────────────────────────────────

function computeBoxScoreColWidths(contentW: number): number[] {
  // 11 cols: # | Name | PTS REB AST STL BLK FGA FGM PF FG%
  const nameW = contentW * 0.22;
  const numW = contentW * 0.035;
  const statW = (contentW - nameW - numW) / 9;
  return [numW, nameW, statW, statW, statW, statW, statW, statW, statW, statW, statW];
}

function computePlayerAvgColWidths(contentW: number): number[] {
  // 9 cols: # | Player | GP | PTS | REB | AST | STL | BLK | FG%
  const nameW = contentW * 0.22;
  const numW = contentW * 0.035;
  const statW = (contentW - nameW - numW) / 7;
  return [numW, nameW, statW, statW, statW, statW, statW, statW, statW];
}

function computeTeamAvgColWidths(contentW: number): number[] {
  // 7 cols: Team | GP | PPG | FG% | RPG | APG | TOPG
  const nameW = contentW * 0.24;
  const statW = (contentW - nameW) / 6;
  return [nameW, statW, statW, statW, statW, statW, statW];
}

// ── Cell value helpers ─────────────────────────────────────────────────────

function boxScoreRowToCells(row: ExportPlayerRow): string[] {
  return [
    row.jerseyNumber,
    row.name,
    String(row.pts),
    String(row.reb),
    String(row.ast),
    String(row.stl),
    String(row.blk),
    String(row.fga),
    String(row.fgm),
    String(row.fouls),
    row.fgPct,
  ];
}

function boxScoreTotalsToCells(
  totals: ExportTeamData['totals'],
): string[] {
  return [
    String(totals.pts),
    String(totals.reb),
    String(totals.ast),
    String(totals.stl),
    String(totals.blk),
    String(totals.fga),
    String(totals.fgm),
    String(totals.fouls),
    totals.fgPct,
  ];
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

/**
 * Generate an XLSX file and write it to `destinationPath`.
 *
 * Box score: one worksheet per team.
 * Season stats: one worksheet for player averages + one for team averages.
 * Numeric cells are typed as numbers (not strings) (Req 22.5).
 *
 * Throws on failure; does NOT leave a partial file (Req 22.6).
 */
export async function exportExcel(data: ExportData, destinationPath: string): Promise<void> {
  assertWritable(destinationPath);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LigaControl';
  workbook.created = new Date();

  try {
    if (data.kind === 'box-score') {
      buildBoxScoreWorkbook(workbook, data);
    } else {
      buildSeasonStatsWorkbook(workbook, data);
    }
  } catch (err) {
    safeUnlink(destinationPath);
    throw new Error(`Excel generation failed: ${(err as Error).message}`);
  }

  try {
    await workbook.xlsx.writeFile(destinationPath);
  } catch (err) {
    safeUnlink(destinationPath);
    throw new Error(`Failed to write Excel file: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Excel building helpers
// ---------------------------------------------------------------------------

/**
 * Box score: one worksheet per team.
 */
function buildBoxScoreWorkbook(workbook: ExcelJS.Workbook, data: BoxScoreExportData): void {
  for (const team of [data.homeTeam, data.awayTeam]) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(team.teamName));

    // Meta rows
    sheet.addRow([data.ligaName]);
    sheet.addRow([`${data.homeTeam.teamName}  vs  ${data.awayTeam.teamName}`]);
    sheet.addRow([`Date: ${data.gameDate}`]);
    sheet.addRow([]); // blank separator

    // Column headers row
    const headerRow = sheet.addRow(BOX_SCORE_HEADERS);
    styleHeaderRow(headerRow);

    // Data rows
    for (const row of team.rows) {
      const dataRow = sheet.addRow([
        row.jerseyNumber,
        row.name,
        row.pts,      // number
        row.reb,      // number
        row.ast,      // number
        row.stl,      // number
        row.blk,      // number
        row.fga,      // number
        row.fgm,      // number
        row.fouls,    // number
        row.fgPct,    // string ("—" or "53.3%")
      ]);
      // Ensure numeric cells are typed as numbers (Req 22.5)
      enforceNumericCells(dataRow, [3, 4, 5, 6, 7, 8, 9, 10]);
    }

    // Totals row
    const totalsRow = sheet.addRow([
      '',
      'TEAM',
      team.totals.pts,
      team.totals.reb,
      team.totals.ast,
      team.totals.stl,
      team.totals.blk,
      team.totals.fga,
      team.totals.fgm,
      team.totals.fouls,
      team.totals.fgPct,
    ]);
    totalsRow.font = { bold: true };
    enforceNumericCells(totalsRow, [3, 4, 5, 6, 7, 8, 9, 10]);

    autoFitColumns(sheet);
  }
}

/**
 * Season stats: one worksheet for player averages, one for team averages.
 */
function buildSeasonStatsWorkbook(workbook: ExcelJS.Workbook, data: SeasonStatsExportData): void {
  // ── Player Averages worksheet ────────────────────────────────────────────
  const playerSheet = workbook.addWorksheet('Player Averages');
  playerSheet.addRow([data.ligaName]);
  playerSheet.addRow([]);

  const playerHeader = playerSheet.addRow(PLAYER_AVG_HEADERS);
  styleHeaderRow(playerHeader);

  for (const row of data.playerAverages) {
    const dataRow = playerSheet.addRow([
      row.jerseyNumber ?? '—',
      row.name,
      row.gamesPlayed,     // number
      row.ptsPerGame,      // number
      row.rebPerGame,      // number
      row.astPerGame,      // number
      row.stlPerGame,      // number
      row.blkPerGame,      // number
      row.fgPct,           // string
    ]);
    enforceNumericCells(dataRow, [3, 4, 5, 6, 7, 8]);
  }
  autoFitColumns(playerSheet);

  // ── Team Averages worksheet ──────────────────────────────────────────────
  const teamSheet = workbook.addWorksheet('Team Averages');
  teamSheet.addRow([data.ligaName]);
  teamSheet.addRow([]);

  const teamHeader = teamSheet.addRow(TEAM_AVG_HEADERS);
  styleHeaderRow(teamHeader);

  for (const row of data.teamAverages) {
    const dataRow = teamSheet.addRow([
      row.teamName,
      row.gamesPlayed,   // number
      row.ppg,           // number
      row.fgPct,         // string
      row.rpg,           // number
      row.apg,           // number
      row.topg,          // number
    ]);
    enforceNumericCells(dataRow, [2, 3, 5, 6, 7]);
  }
  autoFitColumns(teamSheet);
}

// ── Worksheet styling helpers ──────────────────────────────────────────────

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };
}

/**
 * Force cells at the given 1-indexed column positions to be numeric.
 * ExcelJS sometimes stores numbers as strings; this ensures they are numbers.
 */
function enforceNumericCells(row: ExcelJS.Row, colIndices: number[]): void {
  for (const idx of colIndices) {
    const cell = row.getCell(idx);
    const v = cell.value;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      if (!isNaN(n)) cell.value = n;
    }
  }
}

/**
 * Auto-fit column widths based on header text length.
 */
function autoFitColumns(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach(col => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, cell => {
      const cellLen = String(cell.value ?? '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    });
    col.width = Math.min(maxLen + 4, 40);
  });
}

/**
 * Excel sheet names must be ≤ 31 chars and cannot contain: \ / * ? : [ ]
 */
function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31);
}

// ---------------------------------------------------------------------------
// Re-export types for use in ipcRouter / tests
// ---------------------------------------------------------------------------

export type { ExcelJS };
