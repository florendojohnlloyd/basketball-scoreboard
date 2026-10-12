import React from 'react'
import type { MatchNode, MatchNodeStatus } from '@shared/types'
import { getImageUrl } from '../../shared/imageUtils'
import './MatchCard.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MatchCardProps {
  /** The match node data to display */
  node: MatchNode
  /** Optional map of teamId → team name for display */
  teamNames?: Record<string, string>
  /** Optional map of teamId → team logo URL for display */
  teamLogos?: Record<string, string | null>
  /** Called when the card is clicked (e.g. to open match detail) */
  onClick?: (node: MatchNode) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the CSS modifier class for a given match status. */
function statusModifier(status: MatchNodeStatus): string {
  switch (status) {
    case 'in-progress': return 'match-card--in-progress'
    case 'completed':   return 'match-card--completed'
    case 'bye':         return 'match-card--bye'
    default:            return 'match-card--pending'
  }
}

/** Returns a human-readable status label. */
function statusLabel(status: MatchNodeStatus): string {
  switch (status) {
    case 'in-progress': return 'In Progress'
    case 'completed':   return 'Final'
    case 'bye':         return 'BYE'
    case 'scheduled':   return 'Scheduled'
    default:            return 'Pending'
  }
}

// ---------------------------------------------------------------------------
// Sub-component: one team row (seed + name + score)
// ---------------------------------------------------------------------------

interface TeamRowProps {
  /** Raw team ID (null = TBD / no team yet) */
  teamId: string | null
  /** Seed number (null = not yet seeded / TBD) */
  seed: number | null
  /** Score to display (null = not played) */
  score: number | null
  /** Pre-resolved display name (falls back to teamId, then "TBD") */
  teamName?: string
  /** Pre-resolved team logo URL */
  teamLogo?: string | null
  /** Whether this team is the winning side */
  isWinner: boolean
  /** Whether this is the "absent" slot in a BYE match */
  isByeSlot: boolean
}

function TeamRow({ teamId, seed, score, teamName, teamLogo, isWinner, isByeSlot }: TeamRowProps): React.ReactElement {
  const displayName = isByeSlot
    ? 'BYE'
    : teamId
      ? (teamName ?? teamId)
      : 'TBD'

  const rowClass = [
    'match-card__team-row',
    isWinner ? 'match-card__team-row--winner' : '',
    isByeSlot ? 'match-card__team-row--bye' : '',
    !teamId && !isByeSlot ? 'match-card__team-row--tbd' : '',
  ].filter(Boolean).join(' ')

  const logoUrl = teamLogo ? getImageUrl(teamLogo) : null

  return (
    <div className={rowClass} aria-label={isByeSlot ? 'BYE' : `${displayName}${seed != null ? `, seed ${seed}` : ''}${score != null ? `, score ${score}` : ''}`}>
      {/* Seed badge */}
      <span className="match-card__seed" aria-hidden="true">
        {seed != null && !isByeSlot ? `#${seed}` : ''}
      </span>

      {/* Team logo thumbnail */}
      {logoUrl && !isByeSlot ? (
        <img
          src={logoUrl}
          alt=""
          className="match-card__logo-img"
          style={{ width: 16, height: 16, objectFit: 'contain', marginRight: 4, flexShrink: 0 }}
        />
      ) : null}

      {/* Team name */}
      <span className="match-card__team-name">{displayName}</span>

      {/* Score */}
      <span className="match-card__score" aria-hidden={score == null}>
        {score != null && !isByeSlot ? score : ''}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MatchCard component
// ---------------------------------------------------------------------------

function MatchCard({ node, teamNames = {}, teamLogos = {}, onClick }: MatchCardProps): React.ReactElement {
  const {
    homeTeamId,
    awayTeamId,
    homeSeed,
    awaySeed,
    homeScore,
    awayScore,
    winnerTeamId,
    status,
    isBye,
  } = node

  // In a BYE match the away slot is absent
  const awayIsByeSlot = isBye && awayTeamId == null

  const homeIsWinner = winnerTeamId != null && winnerTeamId === homeTeamId
  const awayIsWinner = winnerTeamId != null && winnerTeamId === awayTeamId

  const cardClass = ['match-card', statusModifier(status)].join(' ')

  const isClickable = typeof onClick === 'function'

  return (
    <div
      className={cardClass}
      role={isClickable ? 'button' : 'group'}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={`Match: ${homeTeamId ? (teamNames[homeTeamId] ?? homeTeamId) : 'TBD'} vs ${awayIsByeSlot ? 'BYE' : (awayTeamId ? (teamNames[awayTeamId] ?? awayTeamId) : 'TBD')} — ${statusLabel(status)}`}
      onClick={isClickable ? () => onClick(node) : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(node) } } : undefined}
      data-match-id={node.id}
      data-status={status}
    >
      {/* Home team row */}
      <TeamRow
        teamId={homeTeamId}
        seed={homeSeed}
        score={homeScore}
        teamName={homeTeamId ? teamNames[homeTeamId] : undefined}
        teamLogo={homeTeamId ? teamLogos[homeTeamId] : undefined}
        isWinner={homeIsWinner}
        isByeSlot={false}
      />

      {/* Divider */}
      <div className="match-card__divider" aria-hidden="true" />

      {/* Away team row */}
      <TeamRow
        teamId={awayTeamId}
        seed={awaySeed}
        score={awayScore}
        teamName={awayTeamId ? teamNames[awayTeamId] : undefined}
        teamLogo={awayTeamId ? teamLogos[awayTeamId] : undefined}
        isWinner={awayIsWinner}
        isByeSlot={awayIsByeSlot}
      />

      {/* Status badge — shown for non-pending statuses */}
      {status !== 'pending' && status !== 'scheduled' && (
        <div className="match-card__status-badge" aria-hidden="true">
          {statusLabel(status)}
        </div>
      )}
    </div>
  )
}

export default MatchCard
