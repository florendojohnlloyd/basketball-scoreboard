import React from 'react'
import { useScoreboardStore } from '../store'
import './TeamSection.css'

export interface TeamSectionProps {
  team: 'home' | 'away'
}

interface TimeoutDotsProps {
  remaining: number
  total: number
  label: string
}

function TimeoutDots({ remaining, total, label }: TimeoutDotsProps): React.ReactElement | null {
  if (total === 0) return null
  return (
    <div className="team-section__timeout-row" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`team-section__timeout-dot${i < remaining ? ' team-section__timeout-dot--filled' : ' team-section__timeout-dot--empty'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

function TeamSection({ team }: TeamSectionProps): React.ReactElement {
  const teamState = useScoreboardStore((s) => s.gameState[team])
  const gameConfig = useScoreboardStore((s) => s.gameState.gameConfig)

  const { config, score, fouls, timeouts } = teamState
  const { bonusThreshold, fullTimeoutsPerTeam, twentySecTimeoutsPerTeam } = gameConfig
  const isBonus = fouls >= bonusThreshold

  return (
    <section
      className="team-section"
      data-team={team}
      style={{ '--team-color': config.color } as React.CSSProperties}
      aria-label={`${team === 'home' ? 'Home' : 'Away'} team`}
    >
      {/* ── Top row: logo + score ── */}
      <div className="team-section__top">
        <div className="team-section__logo-wrap">
          {config.logoPath ? (
            <img
              className="team-section__logo"
              src={`local-file:///${config.logoPath.replace(/\\/g, '/')}`}
              alt={`${config.name} logo`}
              draggable={false}
            />
          ) : (
            <div className="team-section__logo-placeholder" aria-hidden="true" />
          )}
        </div>

        <div
          className="team-section__score"
          aria-label={`Score: ${score}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {score}
        </div>
      </div>

      {/* ── Team name banner ── */}
      <div className="team-section__name-banner">
        <div className="team-section__name" aria-label={`Team: ${config.name}`}>
          {config.name}
        </div>
      </div>

      {/* ── Stats row: timeouts + fouls ── */}
      <div className="team-section__stats">

        {/* Timeouts */}
        <div className="team-section__stat-block">
          <span className="team-section__stat-label">TIME OUTS</span>
          <div className="team-section__timeout-block">
            <TimeoutDots
              remaining={timeouts.fullRemaining}
              total={fullTimeoutsPerTeam}
              label={`${config.name} full timeouts: ${timeouts.fullRemaining} of ${fullTimeoutsPerTeam}`}
            />
            <TimeoutDots
              remaining={timeouts.twentyRemaining}
              total={twentySecTimeoutsPerTeam}
              label={`${config.name} 20s timeouts: ${timeouts.twentyRemaining} of ${twentySecTimeoutsPerTeam}`}
            />
          </div>
        </div>

        {/* Fouls */}
        <div className="team-section__stat-block">
          <span className="team-section__stat-label">FOULS</span>
          <div className="team-section__foul-row">
            <span className="team-section__fouls" aria-label={`Fouls: ${fouls}`}>
              {fouls}
            </span>
            {isBonus && (
              <span className="team-section__bonus" role="status" aria-label="Bonus">
                BONUS
              </span>
            )}
          </div>
        </div>

      </div>
    </section>
  )
}

export default TeamSection
