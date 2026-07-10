import React from 'react'
import { useScoreboardStore } from '../store'
import { formatClockPrecise } from '@renderer/shared/clockUtils'
import { formatPeriodLabel } from '@renderer/shared/periodUtils'
import './ScoreboardLayout.css'

function ScoreboardLayout(): React.ReactElement {
  const gs = useScoreboardStore(s => s.gameState)
  const replayActive = useScoreboardStore(s => s.replayActive)
  const { home, away, gameClock, shotClock, period, gameConfig, possession, gamePhase } = gs

  const clockDisplay = formatClockPrecise(gameClock.displayMs)
  const shotSec = Math.ceil(shotClock.displayMs / 1000)
  const periodLabel = formatPeriodLabel(period, gameConfig)
  const isFlashing = gameClock.displayMs <= 10000 && (gameClock.running || gameClock.displayMs === 0)
  const homeBonus = home.fouls >= gameConfig.bonusThreshold
  const awayBonus = away.fouls >= gameConfig.bonusThreshold

  // Top 2 scorers per team
  const homeScorers = home.players.filter(p => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 2)
  const awayScorers = away.players.filter(p => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 2)

  // MVP
  const allP = [...home.players, ...away.players].sort((a, b) => b.points - a.points)
  const mvp = allP[0]?.points > 0 ? allP[0] : null

  // Timeout used/remaining
  const homeToUsed = gameConfig.fullTimeoutsPerTeam - home.timeouts.fullRemaining
  const awayToUsed = gameConfig.fullTimeoutsPerTeam - away.timeouts.fullRemaining

  // ═══ PRE-GAME ═══
  if (gamePhase === 'pre-game') {
    return (
      <div className="tv tv--pregame">
        <div className="tv-pre">
          <div className="tv-pre__liga">{gs.ligaName ?? 'BASKETBALL SCOREBOARD'}</div>
          <div className="tv-pre__matchup">
            <div className="tv-pre__team">
              <div className="tv-pre__logo-circle">{home.config.logoPath ? <img src={`local-file:///${home.config.logoPath.replace(/\\/g, '/')}`} alt="" /> : <span>A</span>}</div>
              <div className="tv-pre__name">{home.config.name}</div>
              <div className="tv-pre__players">{home.players.filter(p => p.active).slice(0, 5).map(p => <div key={p.id}>#{p.number} {p.name}</div>)}</div>
            </div>
            <div className="tv-pre__vs">VS</div>
            <div className="tv-pre__team">
              <div className="tv-pre__logo-circle">{away.config.logoPath ? <img src={`local-file:///${away.config.logoPath.replace(/\\/g, '/')}`} alt="" /> : <span>B</span>}</div>
              <div className="tv-pre__name">{away.config.name}</div>
              <div className="tv-pre__players">{away.players.filter(p => p.active).slice(0, 5).map(p => <div key={p.id}>#{p.number} {p.name}</div>)}</div>
            </div>
          </div>
          {home.config.playerImagePath && <img className="tv-pre__cutout tv-pre__cutout--left" src={`local-file:///${home.config.playerImagePath.replace(/\\/g, '/')}`} alt="" />}
          {away.config.playerImagePath && <img className="tv-pre__cutout tv-pre__cutout--right" src={`local-file:///${away.config.playerImagePath.replace(/\\/g, '/')}`} alt="" />}
        </div>
      </div>
    )
  }

  // ═══ GAME OVER ═══
  if (gamePhase === 'post-game') {
    const winner = home.score > away.score ? home : away.score > home.score ? away : null
    return (
      <div className="tv tv--gameover">
        <div className="tv-go__title">GAME OVER</div>
        <div className="tv-go__scores">
          <div><div className="tv-go__name" style={{ color: home.config.color }}>{home.config.name}</div><div className="tv-go__score">{home.score}</div></div>
          <div className="tv-go__sep">—</div>
          <div><div className="tv-go__name" style={{ color: away.config.color }}>{away.config.name}</div><div className="tv-go__score">{away.score}</div></div>
        </div>
        {winner && <div className="tv-go__winner">🏆 {winner.config.name} WINS!</div>}
        {mvp && <div className="tv-go__mvp">⭐ MVP: #{mvp.number} {mvp.name} — {mvp.points} PTS</div>}
      </div>
    )
  }

  // ═══ LIVE ═══
  return (
    <div className="tv tv--live">

      {/* ROW 1: Header */}
      <div className="tv-hdr">
        <span className="tv-hdr__text">{gs.ligaName ?? 'BASKETBALL SCOREBOARD'} • SEASON {new Date().getFullYear()}</span>
      </div>

      {/* ROW 2: Main scoreboard */}
      <div className="tv-board">

        {/* Away (left) */}
        <div className="tv-side tv-side--away">
          <div className="tv-side__top">
            <span className="tv-side__label">AWAY</span>
            <div className="tv-side__logo-badge">
              {home.config.logoPath ? <img src={`local-file:///${home.config.logoPath.replace(/\\/g, '/')}`} alt="" /> : <div className="tv-side__logo-placeholder" />}
            </div>
            <div className="tv-side__score">{home.score}</div>
          </div>
          <div className="tv-side__banner" style={{ '--team-clr': home.config.color } as React.CSSProperties}>{home.config.name}</div>
          <div className="tv-side__timeouts">TIME OUTS | F: {homeToUsed} Q: {home.timeouts.fullRemaining}</div>
          <div className="tv-side__scorers">
            {homeScorers.map(p => <div key={p.id} className="tv-side__scorer"><span>{p.name}</span><span className="tv-side__scorer-pts">{p.points}</span></div>)}
          </div>
        </div>

        {/* Center */}
        <div className="tv-mid">
          <div className="tv-mid__period">{periodLabel}</div>
          {shotClock.enabled && <div className={`tv-mid__shot${shotSec <= 5 ? ' tv-mid__shot--warn' : ''}`}>{shotSec}</div>}
          <div className="tv-mid__clock-label">GAME CLOCK</div>
          <div className={`tv-mid__clock${isFlashing ? ' tv-mid__clock--flash' : ''}`}>{clockDisplay}</div>
          {possession && <div className="tv-mid__poss">{possession === 'home' ? '◀' : '▶'} POSSESSION</div>}
        </div>

        {/* Home (right) */}
        <div className="tv-side tv-side--home">
          <div className="tv-side__top">
            <span className="tv-side__label">HOME</span>
            <div className="tv-side__score">{away.score}</div>
            <div className="tv-side__logo-badge">
              {away.config.logoPath ? <img src={`local-file:///${away.config.logoPath.replace(/\\/g, '/')}`} alt="" /> : <div className="tv-side__logo-placeholder" />}
            </div>
          </div>
          <div className="tv-side__banner tv-side__banner--right" style={{ '--team-clr': away.config.color } as React.CSSProperties}>{away.config.name}</div>
          <div className="tv-side__timeouts tv-side__timeouts--right">TIME OUTS | F: {awayToUsed} Q: {away.timeouts.fullRemaining}</div>
          <div className="tv-side__scorers tv-side__scorers--right">
            {awayScorers.map(p => <div key={p.id} className="tv-side__scorer"><span>{p.name}</span><span className="tv-side__scorer-pts">{p.points}</span></div>)}
          </div>
        </div>
      </div>

      {/* ROW 3: Event info */}
      <div className="tv-event">
        <span className="tv-event__label">EVENT</span>
        <span className="tv-event__item">Venue: <strong>Arena</strong></span>
        <span className="tv-event__sep">|</span>
        <span className="tv-event__item">Date: <strong>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</strong></span>
      </div>

      {/* ROW 4: Partners strip */}
      <div className="tv-partners">
        <span className="tv-partners__label">PARTNERS</span>
        <div className="tv-partners__logos">
          {(gs.sponsorLogos || []).length > 0
            ? (gs.sponsorLogos || []).map((path, i) => (
                <img key={i} className="tv-partners__img" src={`local-file:///${path.replace(/\\/g, '/')}`} alt={`Sponsor ${i + 1}`} />
              ))
            : <span className="tv-partners__placeholder">No sponsors uploaded</span>
          }
        </div>
      </div>

      {/* Corner bug */}
      <div className="tv-bug">{home.config.logoPath ? <img src={`local-file:///${home.config.logoPath.replace(/\\/g, '/')}`} alt="" /> : <span>LIGA</span>}</div>

      {/* Timeout overlay */}
      {gs.timeout && (
        <div className="tv-timeout">
          <div className="tv-timeout__flash">TIMEOUT</div>
          <div className="tv-timeout__team">{gs[gs.timeout.team].config.name}</div>
          <div className="tv-timeout__countdown">{Math.ceil(gs.timeout.remainingMs / 1000)}</div>
        </div>
      )}

      {/* Replay overlay */}
      {replayActive && (
        <div className="tv-replay">
          <div className="tv-replay__bg" />
          <div className="tv-replay__content">
            <div className="tv-replay__label">REPLAY</div>
            {homeScorers[0] && <div className="tv-replay__name">#{homeScorers[0].number} {homeScorers[0].name} — {homeScorers[0].points} PTS</div>}
          </div>
        </div>
      )}

    </div>
  )
}

export default ScoreboardLayout
