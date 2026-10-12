/**
 * RoundRobinGrid — Round-robin tournament bracket display.
 *
 * Renders two sections:
 *   1. A matrix grid where rows = home team, columns = away team.
 *      Each cell shows "homeScore–awayScore" for completed matches or "—"
 *      for pending ones. Diagonal cells (team vs itself) are greyed out.
 *   2. A standings table ranked by wins (desc), then point differential (desc),
 *      showing: rank, team name, played, wins, losses, point differential.
 *
 * Requirements: 6.3, 6.4
 * Task: 8.4
 */

import React, { useMemo } from 'react'
import type { MatchNode, TournamentSeed, RoundRobinStanding } from '@shared/types'
import './RoundRobinGrid.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RoundRobinGridProps {
  /** All match nodes for the round-robin tournament */
  matchNodes: MatchNode[]
  /** Seeded teams in seed-number order (determines row/column order) */
  seeds: TournamentSeed[]
  /** Standings data to render below the grid */
  standings: RoundRobinStanding[]
  /** Optional team logos */
  teamLogos?: Record<string, string | null>
  /** Optional callback when a match cell is clicked */
  onMatchClick?: (node: MatchNode) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup map: "homeTeamId|awayTeamId" → MatchNode
 * so we can find the cell value for any (row, col) pair in O(1).
 */
function buildMatchLookup(matchNodes: MatchNode[]): Map<string, MatchNode> {
  const map = new Map<string, MatchNode>()
  for (const node of matchNodes) {
    if (node.homeTeamId && node.awayTeamId) {
      map.set(`${node.homeTeamId}|${node.awayTeamId}`, node)
    }
  }
  return map
}

/** Format a cell's score string, e.g. "84–76". Returns "—" for non-completed. */
function cellScore(node: MatchNode | undefined): string {
  if (!node) return '—'
  if (node.status === 'completed' && node.homeScore != null && node.awayScore != null) {
    return `${node.homeScore}–${node.awayScore}`
  }
  return '—'
}

/** Determine CSS class for a cell based on match status and whether it is diagonal. */
function cellClass(
  rowTeamId: string,
  colTeamId: string,
  node: MatchNode | undefined,
): string {
  if (rowTeamId === colTeamId) return 'rr-grid__cell rr-grid__cell--diagonal'
  if (!node) return 'rr-grid__cell rr-grid__cell--pending'
  if (node.status === 'completed') return 'rr-grid__cell rr-grid__cell--completed'
  if (node.status === 'in-progress') return 'rr-grid__cell rr-grid__cell--in-progress'
  return 'rr-grid__cell rr-grid__cell--pending'
}

/** Sort standings: wins desc, point differential desc. */
function sortedStandings(standings: RoundRobinStanding[]): RoundRobinStanding[] {
  return [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.pointDifferential - a.pointDifferential
  })
}

/** Format point differential with leading + for positive numbers. */
function formatDiff(diff: number): string {
  if (diff > 0) return `+${diff}`
  return String(diff)
}

// ---------------------------------------------------------------------------
// Matrix Grid
// ---------------------------------------------------------------------------

interface MatrixGridProps {
  seeds: TournamentSeed[]
  matchLookup: Map<string, MatchNode>
  onMatchClick?: (node: MatchNode) => void
}

function MatrixGrid({ seeds, matchLookup, onMatchClick }: MatrixGridProps): React.ReactElement {
  if (seeds.length === 0) {
    return (
      <p className="rr-grid__empty-text" role="status">
        No teams seeded yet.
      </p>
    )
  }

  return (
    <div className="rr-grid__matrix-wrapper" role="region" aria-label="Round-robin results grid">
      <table className="rr-grid__matrix" aria-label="Match results">
        <thead>
          <tr>
            {/* Top-left corner cell */}
            <th className="rr-grid__corner" scope="col" aria-label="Team names" />
            {/* Column headers — away teams */}
            {seeds.map((seed) => (
              <th
                key={seed.teamId}
                scope="col"
                className="rr-grid__col-header"
                title={seed.teamName}
                aria-label={`Away team: ${seed.teamName} (seed ${seed.seedNumber})`}
              >
                <span className="rr-grid__header-seed">#{seed.seedNumber}</span>
                <span className="rr-grid__header-name">{seed.teamName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seeds.map((rowSeed) => (
            <tr key={rowSeed.teamId}>
              {/* Row header — home team */}
              <th
                scope="row"
                className="rr-grid__row-header"
                title={rowSeed.teamName}
                aria-label={`Home team: ${rowSeed.teamName} (seed ${rowSeed.seedNumber})`}
              >
                <span className="rr-grid__header-seed">#{rowSeed.seedNumber}</span>
                <span className="rr-grid__header-name">{rowSeed.teamName}</span>
              </th>
              {/* Data cells — one per away team */}
              {seeds.map((colSeed) => {
                const isDiagonal = rowSeed.teamId === colSeed.teamId
                const node = matchLookup.get(`${rowSeed.teamId}|${colSeed.teamId}`)
                const score = isDiagonal ? '' : cellScore(node)
                const cls = cellClass(rowSeed.teamId, colSeed.teamId, node)

                return (
                  <td
                    key={colSeed.teamId}
                    className={`${cls}${node && onMatchClick ? ' rr-grid__cell--clickable' : ''}`}
                    onClick={() => { if (node && onMatchClick) onMatchClick(node) }}
                    aria-label={
                      isDiagonal
                        ? `${rowSeed.teamName} vs ${rowSeed.teamName} — N/A`
                        : `${rowSeed.teamName} vs ${colSeed.teamName}: ${score}`
                    }
                    data-status={isDiagonal ? 'diagonal' : (node?.status ?? 'pending')}
                  >
                    {score}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standings Table
// ---------------------------------------------------------------------------

interface StandingsTableProps {
  sorted: RoundRobinStanding[]
}

function StandingsTable({ sorted }: StandingsTableProps): React.ReactElement {
  if (sorted.length === 0) {
    return (
      <p className="rr-grid__empty-text" role="status">
        No standings available yet.
      </p>
    )
  }

  return (
    <div className="rr-grid__standings-wrapper" role="region" aria-label="Standings table">
      <table className="rr-grid__standings" aria-label="Round-robin standings">
        <thead>
          <tr>
            <th scope="col" className="rr-grid__standings-th rr-grid__standings-th--rank" aria-label="Rank">
              #
            </th>
            <th scope="col" className="rr-grid__standings-th rr-grid__standings-th--team">
              Team
            </th>
            <th scope="col" className="rr-grid__standings-th rr-grid__standings-th--num" aria-label="Games played">
              GP
            </th>
            <th scope="col" className="rr-grid__standings-th rr-grid__standings-th--num" aria-label="Wins">
              W
            </th>
            <th scope="col" className="rr-grid__standings-th rr-grid__standings-th--num" aria-label="Losses">
              L
            </th>
            <th scope="col" className="rr-grid__standings-th rr-grid__standings-th--num" aria-label="Point differential">
              +/−
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, index) => (
            <tr
              key={entry.teamId}
              className={index === 0 ? 'rr-grid__standings-row rr-grid__standings-row--leader' : 'rr-grid__standings-row'}
            >
              <td className="rr-grid__standings-td rr-grid__standings-td--rank" aria-label={`Rank ${index + 1}`}>
                {index + 1}
              </td>
              <td className="rr-grid__standings-td rr-grid__standings-td--team">
                {entry.teamName}
              </td>
              <td className="rr-grid__standings-td rr-grid__standings-td--num">
                {entry.played}
              </td>
              <td className="rr-grid__standings-td rr-grid__standings-td--num">
                {entry.wins}
              </td>
              <td className="rr-grid__standings-td rr-grid__standings-td--num">
                {entry.losses}
              </td>
              <td
                className={`rr-grid__standings-td rr-grid__standings-td--num rr-grid__standings-td--diff ${entry.pointDifferential >= 0 ? 'rr-grid__standings-td--pos' : 'rr-grid__standings-td--neg'}`}
              >
                {formatDiff(entry.pointDifferential)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RoundRobinGrid — Main Component
// ---------------------------------------------------------------------------

/**
 * Renders the full round-robin view:
 *   - Score matrix: rows = home team, columns = away team
 *   - Standings table sorted by wins then point differential
 *
 * Requirements:
 * - 6.3: Render round-robin as a matrix grid (cell = score or "—")
 * - 6.4: Display team names, seed numbers, and scores
 */
function RoundRobinGrid({
  matchNodes,
  seeds,
  standings,
}: RoundRobinGridProps): React.ReactElement {
  // Build lookup once per render
  const matchLookup = useMemo(() => buildMatchLookup(matchNodes), [matchNodes])
  const sortedStandingsData = useMemo(() => sortedStandings(standings), [standings])

  // Sort seeds by seed number for consistent row/column ordering
  const orderedSeeds = useMemo(
    () => [...seeds].sort((a, b) => a.seedNumber - b.seedNumber),
    [seeds],
  )

  return (
    <div className="rr-grid">
      {/* ── Results Matrix ─────────────────────────────────────────── */}
      <section className="rr-grid__section" aria-labelledby="rr-grid-matrix-heading">
        <h3 id="rr-grid-matrix-heading" className="rr-grid__section-title">
          Results
        </h3>
        <p className="rr-grid__matrix-legend">
          Row = home team &nbsp;·&nbsp; Column = away team &nbsp;·&nbsp; Score shown as home–away
        </p>
        <MatrixGrid seeds={orderedSeeds} matchLookup={matchLookup} />
      </section>

      {/* ── Standings ──────────────────────────────────────────────── */}
      <section className="rr-grid__section" aria-labelledby="rr-grid-standings-heading">
        <h3 id="rr-grid-standings-heading" className="rr-grid__section-title">
          Standings
        </h3>
        <StandingsTable sorted={sortedStandingsData} />
      </section>
    </div>
  )
}

export default RoundRobinGrid
