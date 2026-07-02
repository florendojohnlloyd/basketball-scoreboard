import React from 'react'
import { useScoreboardStore } from '../store'
import TeamSection from './TeamSection'
import ClockDisplay from './ClockDisplay'
import ShotClockDisplay from './ShotClockDisplay'
import PeriodDisplay from './PeriodDisplay'
import './ScoreboardLayout.css'

/**
 * ScoreboardLayout — professional sports scoreboard design.
 *
 * Rows:
 *   Header  (9vh)  — league name / season
 *   Main   (flex)  — away team | center clocks | home team
 *   Footer  (8vh)  — "GAME CLOCK" label row
 */
function ScoreboardLayout(): React.ReactElement {
  const gameConfig = useScoreboardStore((s) => s.gameState.gameConfig)

  // Use periodDurationMinutes as a proxy to show something in the header.
  // In a future update this could come from a dedicated leagueName field.
  const leagueName = 'BASKETBALL SCOREBOARD'
  const season = `${new Date().getFullYear()}`

  return (
    <div className="scoreboard-layout" role="main" aria-label="Basketball Scoreboard">

      {/* ── HEADER ── */}
      <div className="scoreboard-layout__header">
        <span className="scoreboard-layout__league">
          {leagueName}
          <span className="scoreboard-layout__league-dot"> • </span>
          SEASON {season}
        </span>
      </div>

      {/* ── MAIN ROW ── */}
      <div className="scoreboard-layout__main">

        {/* Away — left */}
        <div className="scoreboard-layout__team" aria-label="Away team">
          <TeamSection team="away" />
        </div>

        {/* Center — clocks */}
        <div className="scoreboard-layout__center" aria-label="Game clocks and period">
          <span className="scoreboard-layout__center-label">
            <PeriodDisplay />
          </span>
          <ShotClockDisplay />
          <span className="scoreboard-layout__center-label">GAME CLOCK</span>
          <ClockDisplay />
        </div>

        {/* Home — right */}
        <div className="scoreboard-layout__team" aria-label="Home team">
          <TeamSection team="home" />
        </div>

      </div>

      {/* ── FOOTER ── */}
      <div className="scoreboard-layout__footer">
        <span className="scoreboard-layout__footer-text">
          PERIOD DURATION:
          <span>{gameConfig.periodDurationMinutes} MIN</span>
        </span>
        <span className="scoreboard-layout__footer-sep">|</span>
        <span className="scoreboard-layout__footer-text">
          SHOT CLOCK:
          <span>{gameConfig.shotClockDurationSeconds}s</span>
        </span>
        <span className="scoreboard-layout__footer-sep">|</span>
        <span className="scoreboard-layout__footer-text">
          PERIODS:
          <span>{gameConfig.periodCount}</span>
        </span>
      </div>

    </div>
  )
}

export default ScoreboardLayout
