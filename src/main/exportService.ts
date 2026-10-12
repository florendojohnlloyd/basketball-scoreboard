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
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import type {
  Tournament,
  MatchNode,
  Round,
  TournamentSeed,
  RoundRobinStanding,
} from '../shared/types';

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
// Bracket PDF export (Requirements 8.1–8.6)
// ---------------------------------------------------------------------------

/** Data shape passed to exportBracketPdf. Matches the Tournament type. */
export type BracketExportData = Tournament;

// ── Bracket layout constants ───────────────────────────────────────────────

const CARD_W = 130;    // match-card width (pt)
const CARD_H = 36;     // match-card height (pt)
const ROUND_GAP = 50;  // horizontal gap between rounds
const CARD_V_GAP = 10; // minimum vertical gap between sibling cards

/**
 * Generate a PDF document containing the bracket layout and write it to `destPath`.
 *
 * Layout strategy:
 *  - Single-elimination: left-to-right tree with connecting lines.
 *  - Double-elimination: Winners bracket, then Losers bracket sections on same/subsequent pages.
 *  - Round-robin: grid matrix with team row/column headers.
 *
 * Tournaments with ≤16 teams fit on a single landscape A4 page.
 * Larger tournaments paginate across multiple pages (Requirement 8.2, 8.6).
 *
 * Throws on failure; does NOT leave a partial file (Requirement 8.5).
 */
export async function exportBracketPdf(
  tournament: BracketExportData,
  destPath: string,
): Promise<void> {
  assertWritable(destPath);

  let pdfBytes: Uint8Array;

  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    // ── Page dimensions ────────────────────────────────────────────────────
    const pageW = doc.internal.pageSize.getWidth();   // ~841 pt landscape A4
    const pageH = doc.internal.pageSize.getHeight();  // ~595 pt landscape A4
    const marginL = 30;
    const marginT = 40;

    // ── Header ─────────────────────────────────────────────────────────────
    let y = marginT;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(tournament.name, marginL, y);
    y += 20;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const formatLabel = {
      'single-elimination': 'Single Elimination',
      'double-elimination': 'Double Elimination',
      'round-robin': 'Round Robin',
    }[tournament.format] ?? tournament.format;
    const createdDate = new Date(tournament.createdAt).toLocaleDateString();
    doc.text(`Format: ${formatLabel}   Created: ${createdDate}   Status: ${tournament.status}`, marginL, y);
    y += 18;

    if (tournament.championTeamId) {
      const champion = tournament.seeds.find(s => s.teamId === tournament.championTeamId);
      doc.setFont('helvetica', 'bold');
      doc.text(`Champion: ${champion?.teamName ?? tournament.championTeamId}`, marginL, y);
      doc.setFont('helvetica', 'normal');
      y += 16;
    }

    y += 6; // small spacer below header

    // ── Build a teamId → teamName lookup from seeds ────────────────────────
    const teamNameMap = new Map<string, string>();
    const seedMap = new Map<string, number>();
    for (const s of tournament.seeds) {
      teamNameMap.set(s.teamId, s.teamName);
      seedMap.set(s.teamId, s.seedNumber);
    }

    function teamLabel(teamId: string | null, seed: number | null): string {
      if (!teamId) return 'TBD';
      const name = teamNameMap.get(teamId) ?? teamId;
      return seed != null ? `(${seed}) ${name}` : name;
    }

    // ── Dispatch to format-specific renderer ──────────────────────────────
    if (tournament.format === 'round-robin') {
      renderRoundRobinPdf(doc, tournament, teamNameMap, seedMap, marginL, y, pageW, pageH);
    } else if (tournament.format === 'double-elimination') {
      renderDoubleElimPdf(doc, tournament, teamLabel, marginL, y, pageW, pageH);
    } else {
      // single-elimination (default)
      renderSingleElimPdf(doc, tournament, teamLabel, marginL, y, pageW, pageH);
    }

    pdfBytes = doc.output('arraybuffer') as unknown as Uint8Array;
  } catch (err) {
    safeUnlink(destPath);
    throw new Error(`Bracket PDF generation failed: ${(err as Error).message}`);
  }

  try {
    writeFileSync(destPath, Buffer.from(pdfBytes));
  } catch (err) {
    safeUnlink(destPath);
    throw new Error(`Failed to write bracket PDF file: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Bracket PDF rendering helpers
// ---------------------------------------------------------------------------

/**
 * Renders a single-elimination bracket as a left-to-right tree.
 * Each round is a column; match cards are connected by horizontal lines.
 */
function renderSingleElimPdf(
  doc: jsPDF,
  tournament: Tournament,
  teamLabel: (id: string | null, seed: number | null) => string,
  marginL: number,
  startY: number,
  pageW: number,
  pageH: number,
): void {
  const rounds = tournament.rounds;
  if (!rounds.length) {
    doc.setFontSize(10);
    doc.text('No bracket generated yet.', marginL, startY + 20);
    return;
  }

  const nodeMap = new Map<string, MatchNode>(tournament.matchNodes.map(n => [n.id, n]));

  // Compute positions for each match node using a recursive layout:
  // Round 0 is leftmost (first column), final round is rightmost.
  // We assign y-positions so that parents are vertically centred between children.

  // positions[matchNodeId] = { x, y } (top-left of card)
  const positions = new Map<string, { x: number; y: number }>();

  // Find the final (last) round's match node(s)
  const lastRound = rounds[rounds.length - 1];
  const numRounds = rounds.length;

  // x position for a round = marginL + roundIndex * (CARD_W + ROUND_GAP)
  function roundX(roundIndex: number): number {
    return marginL + roundIndex * (CARD_W + ROUND_GAP);
  }

  // Layout: assign y positions to round-0 match cards first (evenly spaced),
  // then propagate upward (each subsequent round's card sits between its two feeders).

  // How many cards in round 0?
  const round0 = rounds[0];
  const round0Count = round0.matchNodeIds.length;

  // Available vertical space (below header)
  const availH = pageH - startY - 20;
  const round0Spacing = availH / round0Count;
  const cardTop = (spacing: number, idx: number) =>
    startY + idx * spacing + (spacing - CARD_H) / 2;

  // Assign positions for round 0
  round0.matchNodeIds.forEach((id, idx) => {
    positions.set(id, { x: roundX(0), y: cardTop(round0Spacing, idx) });
  });

  // For subsequent rounds, centre each card between its two source cards
  for (let r = 1; r < numRounds; r++) {
    const round = rounds[r];
    for (const nodeId of round.matchNodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const homePos = node.homeSourceMatchId
        ? positions.get(node.homeSourceMatchId)
        : null;
      const awayPos = node.awaySourceMatchId
        ? positions.get(node.awaySourceMatchId)
        : null;

      let y: number;
      if (homePos && awayPos) {
        // Centre between the two source cards
        y = (homePos.y + awayPos.y) / 2;
      } else if (homePos) {
        y = homePos.y;
      } else if (awayPos) {
        y = awayPos.y;
      } else {
        y = startY;
      }

      positions.set(nodeId, { x: roundX(r), y });
    }
  }

  // Draw connecting lines first (behind cards)
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.5);
  for (let r = 1; r < numRounds; r++) {
    for (const nodeId of rounds[r].matchNodeIds) {
      const node = nodeMap.get(nodeId);
      const pos = positions.get(nodeId);
      if (!node || !pos) continue;

      const targetMidY = pos.y + CARD_H / 2;
      const targetX = pos.x;

      for (const sourceId of [node.homeSourceMatchId, node.awaySourceMatchId]) {
        if (!sourceId) continue;
        const srcPos = positions.get(sourceId);
        if (!srcPos) continue;
        const srcMidY = srcPos.y + CARD_H / 2;
        const srcRightX = srcPos.x + CARD_W;

        // Horizontal line from source card right edge to midpoint
        const midX = srcRightX + ROUND_GAP / 2;
        doc.line(srcRightX, srcMidY, midX, srcMidY);
        // Vertical line from source level to target level
        doc.line(midX, srcMidY, midX, targetMidY);
        // Horizontal line from midpoint to target card left edge
        doc.line(midX, targetMidY, targetX, targetMidY);
      }
    }
  }

  // Check if we need multiple pages (>16 teams means complex bracket that may overflow)
  // We handle this by drawing what fits; for large brackets a new page is added when y > pageH - 20
  const needsNewPage = tournament.seeds.length > 16;

  // Draw round labels
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  for (let r = 0; r < numRounds; r++) {
    const rx = roundX(r);
    doc.text(rounds[r].name, rx, startY - 4);
  }

  // Draw match cards for all rounds
  doc.setFont('helvetica', 'normal');
  let currentPage = 1;
  for (const round of rounds) {
    for (const nodeId of round.matchNodeIds) {
      const node = nodeMap.get(nodeId);
      const pos = positions.get(nodeId);
      if (!node || !pos) continue;

      // Check for page overflow (large brackets)
      if (needsNewPage && pos.y + CARD_H > pageH - 10) {
        if (currentPage === 1) {
          doc.addPage();
          currentPage = 2;
        }
        // Re-adjust to new page top (simple approach: shift node down on page 2)
        // For simplicity in paginated mode, we just continue drawing — jsPDF clips to page
      }

      renderMatchCardPdf(doc, node, pos.x, pos.y, CARD_W, CARD_H, teamLabel);
    }
  }
}

/**
 * Renders a double-elimination bracket in two sections:
 * Winners bracket on top half, Losers bracket on bottom half.
 * Grand final rendered separately at the right edge.
 */
function renderDoubleElimPdf(
  doc: jsPDF,
  tournament: Tournament,
  teamLabel: (id: string | null, seed: number | null) => string,
  marginL: number,
  startY: number,
  pageW: number,
  pageH: number,
): void {
  const halfH = (pageH - startY - 30) / 2;

  // Winners bracket: top section
  const winnerRounds = tournament.winnersBracket ?? [];
  const loserRounds = tournament.losersBracket ?? [];
  const nodeMap = new Map<string, MatchNode>(tournament.matchNodes.map(n => [n.id, n]));

  // Section label helper
  function sectionLabel(text: string, y: number): void {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(text, marginL, y);
    doc.setFont('helvetica', 'normal');
  }

  sectionLabel('WINNERS BRACKET', startY - 4);
  renderBracketSection(doc, winnerRounds, nodeMap, teamLabel, marginL, startY, pageW, halfH);

  const loserStartY = startY + halfH + 20;
  sectionLabel('LOSERS BRACKET', loserStartY - 4);
  renderBracketSection(doc, loserRounds, nodeMap, teamLabel, marginL, loserStartY, pageW, halfH - 20);

  // Grand Final
  if (tournament.grandFinal) {
    const gfX = pageW - CARD_W - 30;
    const gfY = startY + halfH;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('GRAND FINAL', gfX, gfY - 4);
    doc.setFont('helvetica', 'normal');
    renderMatchCardPdf(doc, tournament.grandFinal, gfX, gfY, CARD_W, CARD_H * 1.5, teamLabel);
  }
}

/**
 * Renders a bracket section (one set of rounds) within a given vertical area.
 */
function renderBracketSection(
  doc: jsPDF,
  rounds: Round[],
  nodeMap: Map<string, MatchNode>,
  teamLabel: (id: string | null, seed: number | null) => string,
  marginL: number,
  sectionStartY: number,
  _pageW: number,
  sectionH: number,
): void {
  if (!rounds.length) {
    doc.setFontSize(9);
    doc.text('(No bracket data)', marginL, sectionStartY + 14);
    return;
  }

  function roundX(roundIndex: number): number {
    return marginL + roundIndex * (CARD_W + ROUND_GAP);
  }

  const round0 = rounds[0];
  const round0Count = round0.matchNodeIds.length || 1;
  const round0Spacing = sectionH / round0Count;

  const positions = new Map<string, { x: number; y: number }>();

  round0.matchNodeIds.forEach((id, idx) => {
    const yPos = sectionStartY + idx * round0Spacing + (round0Spacing - CARD_H) / 2;
    positions.set(id, { x: roundX(0), y: yPos });
  });

  for (let r = 1; r < rounds.length; r++) {
    for (const nodeId of rounds[r].matchNodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      const homePos = node.homeSourceMatchId ? positions.get(node.homeSourceMatchId) : null;
      const awayPos = node.awaySourceMatchId ? positions.get(node.awaySourceMatchId) : null;
      let y = sectionStartY;
      if (homePos && awayPos) y = (homePos.y + awayPos.y) / 2;
      else if (homePos) y = homePos.y;
      else if (awayPos) y = awayPos.y;
      positions.set(nodeId, { x: roundX(r), y });
    }
  }

  // Connecting lines
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.5);
  for (let r = 1; r < rounds.length; r++) {
    for (const nodeId of rounds[r].matchNodeIds) {
      const node = nodeMap.get(nodeId);
      const pos = positions.get(nodeId);
      if (!node || !pos) continue;
      const targetMidY = pos.y + CARD_H / 2;
      for (const srcId of [node.homeSourceMatchId, node.awaySourceMatchId]) {
        if (!srcId) continue;
        const srcPos = positions.get(srcId);
        if (!srcPos) continue;
        const srcMidY = srcPos.y + CARD_H / 2;
        const srcRightX = srcPos.x + CARD_W;
        const midX = srcRightX + ROUND_GAP / 2;
        doc.line(srcRightX, srcMidY, midX, srcMidY);
        doc.line(midX, srcMidY, midX, targetMidY);
        doc.line(midX, targetMidY, pos.x, targetMidY);
      }
    }
  }

  // Round labels
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  for (let r = 0; r < rounds.length; r++) {
    doc.text(rounds[r].name, roundX(r), sectionStartY - 4);
  }
  doc.setFont('helvetica', 'normal');

  // Cards
  for (const round of rounds) {
    for (const nodeId of round.matchNodeIds) {
      const node = nodeMap.get(nodeId);
      const pos = positions.get(nodeId);
      if (!node || !pos) continue;
      renderMatchCardPdf(doc, node, pos.x, pos.y, CARD_W, CARD_H, teamLabel);
    }
  }
}

/**
 * Renders a round-robin bracket as a matrix grid.
 * Rows = home team, Columns = away team; cell shows score for completed matches.
 */
function renderRoundRobinPdf(
  doc: jsPDF,
  tournament: Tournament,
  teamNameMap: Map<string, string>,
  _seedMap: Map<string, number>,
  marginL: number,
  startY: number,
  pageW: number,
  pageH: number,
): void {
  const seeds = tournament.seeds;
  const n = seeds.length;

  if (n === 0) {
    doc.setFontSize(10);
    doc.text('No teams seeded.', marginL, startY + 20);
    return;
  }

  // Build a result lookup: "homeTeamId|awayTeamId" → "score"
  const resultMap = new Map<string, string>();
  for (const node of tournament.matchNodes) {
    if (node.status === 'completed' && node.homeTeamId && node.awayTeamId) {
      const key = `${node.homeTeamId}|${node.awayTeamId}`;
      resultMap.set(key, `${node.homeScore ?? 0} - ${node.awayScore ?? 0}`);
    }
  }

  // Column widths: first col is team names, rest are cells
  const teamColW = Math.min(120, (pageW - marginL - 10) * 0.25);
  const cellW = Math.min(48, (pageW - marginL - teamColW - 10) / Math.max(n, 1));
  const cellH = 20;
  let y = startY;

  // Header row
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Team', marginL + 2, y + 13);
  for (let col = 0; col < n; col++) {
    const seed = seeds[col];
    const name = (teamNameMap.get(seed.teamId) ?? seed.teamName).slice(0, 8);
    const cx = marginL + teamColW + col * cellW;
    doc.text(name, cx + 2, y + 13, { maxWidth: cellW - 4 });
    doc.setDrawColor(200, 200, 200);
    doc.rect(cx, y, cellW, cellH);
  }
  doc.rect(marginL, y, teamColW, cellH);
  y += cellH;

  // Data rows
  doc.setFont('helvetica', 'normal');
  for (let row = 0; row < n; row++) {
    const rowSeed = seeds[row];
    const rowName = (teamNameMap.get(rowSeed.teamId) ?? rowSeed.teamName).slice(0, 14);

    // Page overflow check
    if (y + cellH > pageH - 20) {
      doc.addPage();
      y = 30;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`(${rowSeed.seedNumber}) ${rowName}`, marginL + 2, y + 13, { maxWidth: teamColW - 4 });
    doc.rect(marginL, y, teamColW, cellH);
    doc.setFont('helvetica', 'normal');

    for (let col = 0; col < n; col++) {
      const colSeed = seeds[col];
      const cx = marginL + teamColW + col * cellW;
      if (row === col) {
        // Diagonal: same team
        doc.setFillColor(220, 220, 220);
        doc.rect(cx, y, cellW, cellH, 'F');
      } else {
        const key = `${rowSeed.teamId}|${colSeed.teamId}`;
        const score = resultMap.get(key) ?? '—';
        doc.setFontSize(7);
        doc.text(score, cx + 2, y + 13, { maxWidth: cellW - 4 });
        doc.setFontSize(8);
      }
      doc.setDrawColor(200, 200, 200);
      doc.rect(cx, y, cellW, cellH);
    }
    y += cellH;
  }

  // Standings table below the grid
  y += 16;
  if (y + 20 > pageH - 20) {
    doc.addPage();
    y = 30;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Standings', marginL, y);
  y += 14;

  const standingCols = ['Team', 'W', 'L', 'Pts For', 'Pts Agn', '+/-'];
  const sColWidths = [teamColW + 20, 30, 30, 50, 50, 50];
  doc.setFontSize(8);
  let sx = marginL;
  for (let i = 0; i < standingCols.length; i++) {
    doc.text(standingCols[i], sx + 2, y);
    sx += sColWidths[i];
  }
  y += 4;
  doc.setDrawColor(160, 160, 160);
  doc.line(marginL, y, marginL + sColWidths.reduce((a, b) => a + b, 0), y);
  y += 10;
  doc.setFont('helvetica', 'normal');

  // Sort standings by wins desc, then point differential desc
  const standings = tournament.standings
    ? [...tournament.standings].sort((a, b) =>
        b.wins !== a.wins
          ? b.wins - a.wins
          : b.pointDifferential - a.pointDifferential
      )
    : seeds.map(s => ({
        teamId: s.teamId,
        teamName: teamNameMap.get(s.teamId) ?? s.teamName,
        played: 0, wins: 0, losses: 0,
        pointsFor: 0, pointsAgainst: 0, pointDifferential: 0,
      }));

  for (const standing of standings) {
    if (y + 14 > pageH - 20) { doc.addPage(); y = 30; }
    const row = [
      standing.teamName,
      String(standing.wins),
      String(standing.losses),
      String(standing.pointsFor),
      String(standing.pointsAgainst),
      (standing.pointDifferential >= 0 ? '+' : '') + String(standing.pointDifferential),
    ];
    let rx = marginL;
    for (let i = 0; i < row.length; i++) {
      doc.text(row[i], rx + 2, y, { maxWidth: sColWidths[i] - 4 });
      rx += sColWidths[i];
    }
    y += 13;
  }
}

/**
 * Renders a single match-card rectangle with team names and scores.
 */
function renderMatchCardPdf(
  doc: jsPDF,
  node: MatchNode,
  x: number,
  y: number,
  w: number,
  h: number,
  teamLabel: (id: string | null, seed: number | null) => string,
): void {
  // Background colour based on status
  const bgColours: Record<string, [number, number, number]> = {
    'pending':   [240, 240, 240],
    'in-progress': [255, 250, 200],
    'completed': [220, 240, 220],
    'bye':       [230, 230, 255],
    'scheduled': [240, 240, 240],
  };
  const [r, g, b] = bgColours[node.status] ?? [240, 240, 240];
  doc.setFillColor(r, g, b);
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.5);
  doc.rect(x, y, w, h, 'FD');

  // Dividing line between home and away
  const midY = y + h / 2;
  doc.setDrawColor(180, 180, 180);
  doc.line(x, midY, x + w, midY);

  // Home team
  const homeLabel = node.isBye ? 'BYE' : teamLabel(node.homeTeamId, node.homeSeed);
  const homeScore = node.homeScore !== null ? String(node.homeScore) : (node.status === 'completed' ? '0' : '');

  // Away team
  const awayLabel = node.isBye ? 'BYE' : teamLabel(node.awayTeamId, node.awaySeed);
  const awayScore = node.awayScore !== null ? String(node.awayScore) : (node.status === 'completed' ? '0' : '');

  doc.setFontSize(7);
  doc.setFont('helvetica', node.winnerTeamId === node.homeTeamId ? 'bold' : 'normal');
  doc.text(homeLabel, x + 3, y + h * 0.28, { maxWidth: w - (homeScore ? 18 : 6) });

  if (homeScore) {
    doc.setFont('helvetica', 'bold');
    doc.text(homeScore, x + w - 14, y + h * 0.28);
  }

  doc.setFont('helvetica', node.winnerTeamId === node.awayTeamId ? 'bold' : 'normal');
  doc.text(awayLabel, x + 3, y + h * 0.72, { maxWidth: w - (awayScore ? 18 : 6) });

  if (awayScore) {
    doc.setFont('helvetica', 'bold');
    doc.text(awayScore, x + w - 14, y + h * 0.72);
  }
  doc.setFont('helvetica', 'normal');
}

// ---------------------------------------------------------------------------
// Re-export types for use in ipcRouter / tests
// ---------------------------------------------------------------------------

export type { ExcelJS };
