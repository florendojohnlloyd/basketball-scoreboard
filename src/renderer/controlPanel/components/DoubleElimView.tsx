/**
 * DoubleElimView — Double-elimination bracket visualization sub-component.
 *
 * Renders the three structural sections of a double-elimination tournament:
 *   1. Winners Bracket — teams that have not yet lost
 *   2. Losers Bracket — teams that have lost exactly once
 *   3. Grand Final — Winners champion vs Losers champion
 *
 * Each section uses a left-to-right tree layout with SVG connecting lines
 * drawn between rounds, matching the pattern used by SingleElimTree.
 * MatchCard renders each individual match node.
 *
 * Requirements: 6.2, 6.4, 6.5
 * Task: 8.3
 */

import React from 'react'
import type { MatchNode, Round, TournamentSeed } from '@shared/types'
import MatchCard from './MatchCard'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Width of a single MatchCard in pixels. */
const CARD_WIDTH = 220
/** Height of a single MatchCard in pixels. */
const CARD_HEIGHT = 88
/** Vertical gap between match cards within the same round. */
const CARD_V_GAP = 24
/** Horizontal gap between rounds. */
const ROUND_H_GAP = 60
/** Horizontal padding inside each section container. */
const SECTION_PADDING = 16

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoubleElimViewProps {
  winnersBracket: Round[]
  losersBracket: Round[]
  grandFinal: MatchNode | undefined
  matchNodes: MatchNode[]
  seeds: TournamentSeed[]
}

/** Computed position of a card within a bracket section. */
interface CardPosition {
  x: number
  y: number
  matchNodeId: string
}

/** A connector line description (SVG path). */
interface Connector {
  /** Unique key for React reconciliation. */
  key: string
  d: string
}

// ---------------------------------------------------------------------------
// Helper: build teamNames lookup
// ---------------------------------------------------------------------------

function buildTeamNames(seeds: TournamentSeed[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const seed of seeds) {
    map[seed.teamId] = seed.teamName
  }
  return map
}

// ---------------------------------------------------------------------------
// Helper: build matchNode lookup
// ---------------------------------------------------------------------------

function buildNodeMap(matchNodes: MatchNode[]): Map<string, MatchNode> {
  const map = new Map<string, MatchNode>()
  for (const n of matchNodes) {
    map.set(n.id, n)
  }
  return map
}

// ---------------------------------------------------------------------------
// Layout computation
// ---------------------------------------------------------------------------

/**
 * Computes card positions for a set of rounds in a left-to-right tree.
 *
 * The first round fills all slots with equal vertical spacing.
 * Each subsequent round spaces cards to vertically center them between their
 * two feeder matches from the previous round — giving the classic bracket look.
 *
 * Returns an array of CardPosition objects for every match node in the rounds
 * and the total canvas dimensions needed.
 */
function computeLayout(
  rounds: Round[],
  nodeMap: Map<string, MatchNode>
): { positions: CardPosition[]; totalWidth: number; totalHeight: number } {
  if (rounds.length === 0) {
    return { positions: [], totalWidth: 0, totalHeight: 0 }
  }

  const positions: CardPosition[] = []

  // First round — space cards evenly
  const firstRound = rounds[0]
  const firstCount = firstRound.matchNodeIds.length

  // Round 0 y-positions
  const round0Ys: number[] = []
  for (let i = 0; i < firstCount; i++) {
    round0Ys.push(SECTION_PADDING + i * (CARD_HEIGHT + CARD_V_GAP))
  }

  // Lay out each round column
  const roundYMap: Map<string, number> = new Map() // nodeId → center-y

  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r]
    const x = SECTION_PADDING + r * (CARD_WIDTH + ROUND_H_GAP)

    if (r === 0) {
      for (let i = 0; i < round.matchNodeIds.length; i++) {
        const id = round.matchNodeIds[i]
        const y = round0Ys[i]
        positions.push({ x, y, matchNodeId: id })
        roundYMap.set(id, y + CARD_HEIGHT / 2)
      }
    } else {
      // Center each card between its two source matches
      for (const id of round.matchNodeIds) {
        const node = nodeMap.get(id)
        let y: number

        if (node && node.homeSourceMatchId && node.awaySourceMatchId) {
          const topY = roundYMap.get(node.homeSourceMatchId)
          const botY = roundYMap.get(node.awaySourceMatchId)
          if (topY !== undefined && botY !== undefined) {
            y = (topY + botY) / 2 - CARD_HEIGHT / 2
          } else {
            // Fallback: stack below previous entry
            const lastPos = positions.findLast(p => {
              const col = Math.round((p.x - SECTION_PADDING) / (CARD_WIDTH + ROUND_H_GAP))
              return col === r
            })
            y = lastPos ? lastPos.y + CARD_HEIGHT + CARD_V_GAP : SECTION_PADDING
          }
        } else {
          // Single-source or no source — center vertically among all current round cards
          const roundIndex = round.matchNodeIds.indexOf(id)
          const total = round.matchNodeIds.length
          // Distribute over the same vertical span as round 0
          const span = firstCount * (CARD_HEIGHT + CARD_V_GAP) - CARD_V_GAP
          y = SECTION_PADDING + (roundIndex / Math.max(total - 1, 1)) * (span - CARD_HEIGHT)
          if (total === 1) y = SECTION_PADDING
        }

        positions.push({ x, y, matchNodeId: id })
        roundYMap.set(id, y + CARD_HEIGHT / 2)
      }
    }
  }

  const totalWidth =
    rounds.length * (CARD_WIDTH + ROUND_H_GAP) - ROUND_H_GAP + SECTION_PADDING * 2
  const allYs = positions.map(p => p.y + CARD_HEIGHT)
  const totalHeight = Math.max(...allYs) + SECTION_PADDING

  return { positions, totalWidth, totalHeight }
}

// ---------------------------------------------------------------------------
// Helper: build SVG connector paths between rounds
// ---------------------------------------------------------------------------

/**
 * For each round after the first, draw connector lines from the right edge
 * of a source match card to the left edge of the destination match card.
 *
 * Each connector is an S-curve (cubic bezier) for a polished look.
 */
function buildConnectors(
  rounds: Round[],
  positions: CardPosition[],
  nodeMap: Map<string, MatchNode>
): Connector[] {
  const posMap = new Map<string, CardPosition>()
  for (const pos of positions) {
    posMap.set(pos.matchNodeId, pos)
  }

  const connectors: Connector[] = []

  for (let r = 1; r < rounds.length; r++) {
    for (const id of rounds[r].matchNodeIds) {
      const node = nodeMap.get(id)
      if (!node) continue

      const destPos = posMap.get(id)
      if (!destPos) continue

      const destX = destPos.x
      const destMidY = destPos.y + CARD_HEIGHT / 2

      // Wire both home and away source matches
      const sources: Array<{ sourceId: string; isLoser: boolean }> = []
      if (node.homeSourceMatchId) {
        sources.push({ sourceId: node.homeSourceMatchId, isLoser: node.homeSourceIsLoser })
      }
      if (node.awaySourceMatchId) {
        sources.push({ sourceId: node.awaySourceMatchId, isLoser: node.awaySourceIsLoser })
      }

      for (const { sourceId } of sources) {
        const srcPos = posMap.get(sourceId)
        if (!srcPos) continue

        const srcX = srcPos.x + CARD_WIDTH
        const srcMidY = srcPos.y + CARD_HEIGHT / 2

        // Cubic bezier: exit right from source, enter left at destination
        const cp1x = srcX + ROUND_H_GAP * 0.5
        const cp2x = destX - ROUND_H_GAP * 0.5

        const d = `M ${srcX} ${srcMidY} C ${cp1x} ${srcMidY}, ${cp2x} ${destMidY}, ${destX} ${destMidY}`
        connectors.push({ key: `${sourceId}-${id}`, d })
      }
    }
  }

  return connectors
}

// ---------------------------------------------------------------------------
// BracketSection — renders one labeled section (Winners/Losers/Grand Final)
// ---------------------------------------------------------------------------

interface BracketSectionProps {
  label: string
  labelMod: string  // CSS modifier for the header color accent
  rounds: Round[]
  extraNodes?: MatchNode[]  // e.g. grandFinal passed as a single-node round
  matchNodes: MatchNode[]
  teamNames: Record<string, string>
}

function BracketSection({
  label,
  labelMod,
  rounds,
  matchNodes,
  teamNames,
}: BracketSectionProps): React.ReactElement {
  const nodeMap = buildNodeMap(matchNodes)
  const { positions, totalWidth, totalHeight } = computeLayout(rounds, nodeMap)
  const connectors = buildConnectors(rounds, positions, nodeMap)
  const posMap = new Map<string, CardPosition>()
  for (const pos of positions) {
    posMap.set(pos.matchNodeId, pos)
  }

  // Measure actual rendered card heights via a ref (cards are fixed height per constant)
  // We use a fixed SVG overlay sized to the computed canvas dimensions.

  return (
    <section className="double-elim-section" aria-label={label}>
      <h3 className={`double-elim-section__header double-elim-section__header--${labelMod}`}>
        {label}
      </h3>

      <div
        className="double-elim-section__canvas"
        style={{ position: 'relative', width: totalWidth, minHeight: totalHeight }}
      >
        {/* SVG connector lines — rendered behind the cards */}
        {connectors.length > 0 && (
          <svg
            className="double-elim-section__connectors"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: totalWidth,
              height: totalHeight,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            {connectors.map(c => (
              <path
                key={c.key}
                d={c.d}
                className="double-elim-section__connector-path"
                fill="none"
              />
            ))}
          </svg>
        )}

        {/* Round column headers */}
        {rounds.map((round, r) => {
          const x = SECTION_PADDING + r * (CARD_WIDTH + ROUND_H_GAP)
          return (
            <div
              key={round.index}
              className="double-elim-section__round-label"
              style={{
                position: 'absolute',
                top: 0,
                left: x,
                width: CARD_WIDTH,
                textAlign: 'center',
              }}
              aria-label={`Round: ${round.name}`}
            >
              {round.name}
            </div>
          )
        })}

        {/* Match cards */}
        {positions.map(pos => {
          const node = nodeMap.get(pos.matchNodeId)
          if (!node) return null

          // Offset cards below the round-label row (24px label height)
          const LABEL_H = 24
          return (
            <div
              key={pos.matchNodeId}
              className="double-elim-section__card-wrapper"
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y + LABEL_H,
                width: CARD_WIDTH,
              }}
            >
              <MatchCard node={node} teamNames={teamNames} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// DoubleElimView
// ---------------------------------------------------------------------------

/**
 * Renders a complete double-elimination bracket in three visually separated
 * sections: Winners Bracket, Losers Bracket, and Grand Final.
 *
 * Each section uses a left-to-right tree layout with SVG connecting lines
 * between rounds. MatchCard provides per-node display (names, seeds, scores,
 * status-based background color).
 *
 * Requirements:
 * - 6.2: Render double-elimination with Winners, Losers, and Grand Final sections
 * - 6.4: Show team names, seeds, scores in every MatchNode
 * - 6.5: Visually distinguish pending / in-progress / completed MatchNodes
 */
function DoubleElimView({
  winnersBracket,
  losersBracket,
  grandFinal,
  matchNodes,
  seeds,
}: DoubleElimViewProps): React.ReactElement {
  const teamNames = buildTeamNames(seeds)

  // Build a synthetic single-round "bracket" for the Grand Final
  const grandFinalRounds: Round[] = grandFinal
    ? [
        {
          index: 0,
          name: 'Grand Final',
          matchNodeIds: [grandFinal.id],
        },
      ]
    : []

  const hasWinners = winnersBracket.length > 0
  const hasLosers = losersBracket.length > 0
  const hasGrandFinal = grandFinal !== undefined

  if (!hasWinners && !hasLosers && !hasGrandFinal) {
    return (
      <div className="double-elim-view double-elim-view--empty" role="region" aria-label="Double elimination bracket">
        <p className="double-elim-view__empty-text">No bracket data available.</p>
      </div>
    )
  }

  return (
    <div className="double-elim-view" role="region" aria-label="Double elimination bracket">
      {hasWinners && (
        <BracketSection
          label="Winners Bracket"
          labelMod="winners"
          rounds={winnersBracket}
          matchNodes={matchNodes}
          teamNames={teamNames}
        />
      )}

      {hasLosers && (
        <BracketSection
          label="Losers Bracket"
          labelMod="losers"
          rounds={losersBracket}
          matchNodes={matchNodes}
          teamNames={teamNames}
        />
      )}

      {hasGrandFinal && (
        <BracketSection
          label="Grand Final"
          labelMod="final"
          rounds={grandFinalRounds}
          matchNodes={matchNodes}
          teamNames={teamNames}
        />
      )}
    </div>
  )
}

export default DoubleElimView
