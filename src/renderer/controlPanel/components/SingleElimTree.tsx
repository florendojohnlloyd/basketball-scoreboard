/**
 * SingleElimTree — Single-elimination bracket sub-component.
 *
 * Renders a left-to-right tree of match nodes with SVG connecting lines
 * between rounds. Each match node is rendered via a MatchCard.
 *
 * Layout strategy:
 *  - Each round occupies a column of fixed width (CARD_WIDTH + COL_GAP).
 *  - Cards are vertically centred within evenly-spaced slots.
 *    The slot height doubles each round so that lines connect the mid-points
 *    of source cards to the mid-point of the target card.
 *  - SVG lines are drawn as horizontal + vertical connectors sitting between
 *    adjacent column pairs.
 *
 * Requirements: 6.1, 6.4, 6.5, 6.7
 * Task: 8.2
 */

import React, { useRef } from 'react'
import type { Round, MatchNode, TournamentSeed } from '@shared/types'
import MatchCard from './MatchCard'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Rendered width of one MatchCard (px). Must match .match-card max-width. */
const CARD_WIDTH  = 240
/** Rendered height of one MatchCard (px). Approximate — used for vertical spacing. */
const CARD_HEIGHT = 90
/** Horizontal gap between adjacent round columns (px). SVG connectors live here. */
const COL_GAP     = 40
/** Minimum vertical space (top + bottom padding) allocated to each card slot. */
const SLOT_PADDING = 8

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SingleElimTreeProps {
  rounds: Round[]
  matchNodes: MatchNode[]
  seeds: TournamentSeed[]
  teamLogos?: Record<string, string | null>
  /** Optional callback fired when a match card is clicked */
  onMatchClick?: (node: MatchNode) => void
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Returns the height of a single card slot for the given round index.
 * Round 0 has the most matches; each subsequent round has half as many,
 * so the slot height doubles each round to keep cards vertically centred
 * relative to their feeder matches.
 */
function slotHeight(roundIndex: number): number {
  return (CARD_HEIGHT + SLOT_PADDING * 2) * Math.pow(2, roundIndex)
}

/**
 * Returns the vertical centre of a card at `position` in `roundIndex`.
 */
function cardCentreY(roundIndex: number, position: number): number {
  const sh = slotHeight(roundIndex)
  return position * sh + sh / 2
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a single-elimination bracket as a left-to-right tree.
 *
 * The SVG overlay is sized to cover the full layout area and contains
 * horizontal + vertical connector lines between each round pair.
 *
 * Requirements:
 *  - 6.1: Left-to-right tree with connecting lines between rounds
 *  - 6.4: Display team names, seed numbers, scores via MatchCard
 *  - 6.5: Match status visual distinction via MatchCard
 *  - 6.7: BYE rendering via MatchCard
 */
function SingleElimTree({
  rounds,
  matchNodes,
  seeds,
  teamLogos = {},
  onMatchClick,
}: SingleElimTreeProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  // Build teamId → teamName lookup from seeds
  const teamNames: Record<string, string> = {}
  for (const s of seeds) {
    teamNames[s.teamId] = s.teamName
  }

  // Build nodeId → MatchNode lookup for quick access
  const nodeById: Record<string, MatchNode> = {}
  for (const n of matchNodes) {
    nodeById[n.id] = n
  }

  if (rounds.length === 0) {
    return (
      <div className="single-elim-tree single-elim-tree--empty" role="status">
        <p className="single-elim-tree__empty-text">No rounds available.</p>
      </div>
    )
  }

  // ── Layout dimensions ──────────────────────────────────────────────────

  const numRounds  = rounds.length
  const totalWidth = numRounds * CARD_WIDTH + (numRounds - 1) * COL_GAP

  // The first round defines the total height. Subsequent rounds have taller
  // slots but fewer matches so the total height stays the same.
  const firstRoundMatchCount = rounds[0].matchNodeIds.length
  const totalHeight = firstRoundMatchCount * slotHeight(0)

  // ── Connector geometry ─────────────────────────────────────────────────
  //
  // For each match in round R (index > 0), draw two connectors coming from
  // the two feeder matches in round R-1:
  //   1. A horizontal line from the right edge of the feeder card to the
  //      mid-point between columns.
  //   2. A vertical line connecting both feeder mid-points at that x.
  //   3. A horizontal line from that x to the left edge of the target card.
  //
  // This produces the classic bracket "elbow" connector.

  type ConnectorLine = { x1: number; y1: number; x2: number; y2: number }

  const connectors: ConnectorLine[] = []

  for (let ri = 1; ri < rounds.length; ri++) {
    const prevColX = (ri - 1) * (CARD_WIDTH + COL_GAP)
    const curColX  = ri * (CARD_WIDTH + COL_GAP)
    const midX     = prevColX + CARD_WIDTH + COL_GAP / 2

    const round = rounds[ri]
    round.matchNodeIds.forEach((matchId, pos) => {
      const node = nodeById[matchId]
      if (!node) return

      const targetY = cardCentreY(ri, pos)

      // Each match in round R is fed by two matches in round R-1:
      // homeSource and awaySource sit at positions pos*2 and pos*2+1
      const homeSrcPos = pos * 2
      const awaySrcPos = pos * 2 + 1

      const homeSrcY = cardCentreY(ri - 1, homeSrcPos)
      const awaySrcY = cardCentreY(ri - 1, awaySrcPos)

      // Determine if feeder matches exist (some slots may be BYEs already resolved)
      const hasHome = node.homeSourceMatchId != null
      const hasAway = node.awaySourceMatchId != null

      if (hasHome || hasAway) {
        const topY    = hasHome && hasAway ? Math.min(homeSrcY, awaySrcY)
                       : hasHome ? homeSrcY : awaySrcY
        const bottomY = hasHome && hasAway ? Math.max(homeSrcY, awaySrcY)
                       : hasHome ? homeSrcY : awaySrcY

        // Horizontal from home feeder to midX
        if (hasHome) {
          connectors.push({
            x1: prevColX + CARD_WIDTH,
            y1: homeSrcY,
            x2: midX,
            y2: homeSrcY,
          })
        }

        // Horizontal from away feeder to midX
        if (hasAway) {
          connectors.push({
            x1: prevColX + CARD_WIDTH,
            y1: awaySrcY,
            x2: midX,
            y2: awaySrcY,
          })
        }

        // Vertical spine connecting the two feeder lines
        if (hasHome && hasAway) {
          connectors.push({ x1: midX, y1: topY, x2: midX, y2: bottomY })
        }

        // Horizontal from midX to target card
        connectors.push({ x1: midX, y1: targetY, x2: curColX, y2: targetY })
      }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="single-elim-tree"
      ref={containerRef}
      role="region"
      aria-label="Single-elimination bracket"
      style={{ position: 'relative', width: totalWidth, minHeight: totalHeight }}
    >
      {/* SVG connector lines — drawn behind the cards */}
      <svg
        className="single-elim-tree__connectors"
        width={totalWidth}
        height={totalHeight}
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      >
        {connectors.map((line, idx) => (
          <line
            key={idx}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className="single-elim-tree__connector-line"
          />
        ))}
      </svg>

      {/* Round columns */}
      {rounds.map((round, ri) => {
        const colLeft = ri * (CARD_WIDTH + COL_GAP)

        return (
          <div
            key={round.index}
            className="single-elim-tree__round"
            style={{
              position: 'absolute',
              left: colLeft,
              top: 0,
              width: CARD_WIDTH,
              height: totalHeight,
            }}
            role="group"
            aria-label={round.name}
          >
            {/* Round header */}
            <div
              className="single-elim-tree__round-header"
              aria-hidden="true"
            >
              {round.name}
            </div>

            {/* Match cards */}
            {round.matchNodeIds.map((matchId, pos) => {
              const node = nodeById[matchId]
              if (!node) return null

              const sh       = slotHeight(ri)
              const cardTop  = pos * sh + sh / 2 - CARD_HEIGHT / 2

              return (
                <div
                  key={matchId}
                  className="single-elim-tree__card-slot"
                  style={{
                    position: 'absolute',
                    top: cardTop,
                    left: 0,
                    width: CARD_WIDTH,
                  }}
                >
                  <MatchCard
                    node={node}
                    teamNames={teamNames}
                    teamLogos={teamLogos}
                    onClick={onMatchClick}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export default SingleElimTree
