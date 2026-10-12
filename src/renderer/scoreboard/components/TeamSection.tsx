import React, { useState, useEffect } from 'react'
import { useScoreboardStore } from '../store'
import { SCOREBOARD_EVENT } from '@shared/types'
import { getImageUrl } from '../../shared/imageUtils'
import './TeamSection.css'

export interface TeamSectionProps {
  team: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// Placeholder silhouette — inline SVG data URI (no external file needed)
// ---------------------------------------------------------------------------
const SILHOUETTE_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="#4a6080">
      <circle cx="20" cy="13" r="7"/>
      <path d="M4 38c0-8.8 7.2-16 16-16s16 7.2 16 16"/>
    </svg>`
  )

/**
 * PlayerPhoto — renders a player's photo thumbnail on the Scoreboard Display.
 * If the file is missing or unreadable it falls back to the silhouette SVG
 * and reports a warning via the IPC event channel (Req 16.5).
 */
function PlayerPhoto({
  photoPath,
  playerName,
}: {
  photoPath: string | null
  playerName: string
}): React.ReactElement {
  const [src, setSrc] = useState<string>(() =>
    photoPath ? getImageUrl(photoPath) : SILHOUETTE_SRC
  )

  useEffect(() => {
    setSrc(
      photoPath ? getImageUrl(photoPath) : SILHOUETTE_SRC
    )
  }, [photoPath])

  function handleError(): void {
    setSrc(SILHOUETTE_SRC)
    // Log warning to the Control Panel status area (Req 16.5)
    if (typeof window !== 'undefined' && window.electron?.ipcRenderer && photoPath) {
      window.electron.ipcRenderer.send(SCOREBOARD_EVENT, {
        type: 'PLAYER_PHOTO_MISSING',
        playerName,
        photoPath,
        message: `Photo for ${playerName} is missing or unreadable — showing silhouette.`,
      })
    }
  }

  return (
    <img
      className="ts__player-photo"
      src={src}
      alt={photoPath ? `${playerName} photo` : `${playerName} silhouette`}
      width={32}
      height={32}
      draggable={false}
      onError={handleError}
    />
  )
}

function TeamSection({ team }: TeamSectionProps): React.ReactElement {
  const teamState          = useScoreboardStore((s) => s.gameState[team])
  const gameConfig         = useScoreboardStore((s) => s.gameState.gameConfig)
  const showPhotos         = useScoreboardStore((s) => s.gameState.showPhotosOnScoreboard)

  const { config, score, fouls, timeouts } = teamState
  const { bonusThreshold, fullTimeoutsPerTeam, twentySecTimeoutsPerTeam } = gameConfig
  const isBonus = fouls >= bonusThreshold
  const isAway  = team === 'away'

  // Listen for photo-missing warnings from the scoreboard display itself and
  // forward them to the Control Panel (they are already sent in PlayerPhoto.handleError).
  // No local state needed — warnings are forwarded via IPC.

  return (
    <section
      className={`ts ts--${team}`}
      style={{ '--tc': config.color } as React.CSSProperties}
      aria-label={`${isAway ? 'Away' : 'Home'} team`}
    >

      {/* ── LABEL ── */}
      <div className="ts__label">{isAway ? 'AWAY' : 'HOME'}</div>

      {/* ── LOGO + SCORE ── */}
      <div className="ts__top">
        {/* Logo */}
        <div className="ts__logo-wrap">
          {config.logoPath ? (
            <img
              className="ts__logo"
              src={getImageUrl(config.logoPath)}
              alt={`${config.name} logo`}
              draggable={false}
            />
          ) : (
            <div className="ts__logo-placeholder" aria-hidden="true" />
          )}
        </div>

        {/* Score */}
        <div
          className="ts__score"
          aria-label={`Score: ${score}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {score}
        </div>
      </div>

      {/* ── NAME BANNER ── */}
      <div className="ts__name-banner">
        <span className="ts__name">{config.name}</span>
      </div>

      {/* ── STATS ── */}
      <div className="ts__stats">

        {/* Timeouts */}
        <div className="ts__stat-block">
          <span className="ts__stat-lbl">TIME OUTS</span>
          <div className="ts__timeout-row">
            {fullTimeoutsPerTeam > 0 && (
              <span className="ts__timeout-count">
                F: <strong>{timeouts.fullRemaining}</strong>
              </span>
            )}
            {twentySecTimeoutsPerTeam > 0 && (
              <span className="ts__timeout-count">
                Q: <strong>{timeouts.twentyRemaining}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Fouls */}
        <div className="ts__stat-block">
          <span className="ts__stat-lbl">FOULS</span>
          <div className="ts__foul-row">
            <span className="ts__fouls">{fouls}</span>
            {isBonus && (
              <span className="ts__bonus" role="status" aria-label="Bonus">BONUS</span>
            )}
          </div>
        </div>

      </div>

      {/* ── PLAYER LIST (Req 15 + 16.4) ── */}
      {teamState.players.filter(p => p.active).length > 0 && (
        <div className="ts__player-list" aria-label={`${config.name} active players`}>
          {teamState.players
            .filter(p => p.active)
            .map(p => (
              <div key={p.id} className="ts__player-row">
                {/* Photo thumbnail on scoreboard — only when showPhotosOnScoreboard is true (Req 16.4) */}
                {showPhotos && (
                  <PlayerPhoto photoPath={p.photoPath ?? null} playerName={p.name} />
                )}
                <span className="ts__player-num" aria-label={`Jersey number ${p.number}`}>
                  {p.number || ''}
                </span>
                <span className="ts__player-name">{p.name}</span>
                <span className="ts__player-pts">{p.points}</span>
              </div>
            ))
          }
        </div>
      )}

    </section>
  )
}

export default TeamSection
