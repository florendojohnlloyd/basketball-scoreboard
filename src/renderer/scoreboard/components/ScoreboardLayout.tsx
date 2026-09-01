import React from 'react'
import { useScoreboardStore } from '../store'
import { useTvLayoutStore } from '../tvLayoutStore'
import { EditableWidget } from './EditableWidget'
import { formatClockDisplay, formatClockPrecise } from '@renderer/shared/clockUtils'
import { formatPeriodLabel } from '@renderer/shared/periodUtils'
import './ScoreboardLayout.css'
import timeoutVideo from '../../shared/vid/FitnessExclusive.mp4'

function ScoreboardLayout(): React.ReactElement {
  const gs = useScoreboardStore(s => s.gameState)
  const replayActive = useScoreboardStore(s => s.replayActive)
  const videoSrc = timeoutVideo
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

  // TV Layout store (must be called before any conditional returns — Rules of Hooks)
  const { layouts: tvLayouts, editing: tvEditing, setEditing: setTvEditing, updateWidget: updateTvWidget, resetLayout: resetTvLayout } = useTvLayoutStore()

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
    <div className={`tv tv--live${tvEditing ? ' tv--editing' : ''}`}>

      {/* Edit toggle button (top-right corner) */}
      <div className="tv-edit-toggle">
        <button className={`tv-edit-toggle__btn${tvEditing ? ' tv-edit-toggle__btn--active' : ''}`} onClick={() => setTvEditing(!tvEditing)}>
          {tvEditing ? '🔓 Lock' : '✏️ Edit'}
        </button>
        {tvEditing && <button className="tv-edit-toggle__btn tv-edit-toggle__btn--warn" onClick={resetTvLayout}>↺</button>}
      </div>

      {/* Header */}
      <EditableWidget id="tv-header" rect={tvLayouts['tv-header']} editing={tvEditing} onUpdate={updateTvWidget} label="Header">
        <div className="tv-hdr" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span className="tv-hdr__text">{gs.ligaName ?? 'BASKETBALL SCOREBOARD'} • SEASON {new Date().getFullYear()}</span>
        </div>
      </EditableWidget>

      {/* Home Score */}
      <EditableWidget id="tv-home-score" rect={tvLayouts['tv-home-score']} editing={tvEditing} onUpdate={updateTvWidget} label="Home Score">
        <div className="tv-side__score" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>{home.score}</div>
      </EditableWidget>

      {/* Home Logo */}
      <EditableWidget id="tv-home-logo" rect={tvLayouts['tv-home-logo']} editing={tvEditing} onUpdate={updateTvWidget} label="Home Logo">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          {home.config.logoPath
            ? <img src={`local-file:///${home.config.logoPath.replace(/\\/g, '/')}`} alt="" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:'8px'}} />
            : <div style={{width:'60%',height:'60%',background:'rgba(255,255,255,0.05)',borderRadius:'50%',border:'2px solid rgba(255,255,255,0.15)'}} />
          }
        </div>
      </EditableWidget>

      {/* Away Score */}
      <EditableWidget id="tv-away-score" rect={tvLayouts['tv-away-score']} editing={tvEditing} onUpdate={updateTvWidget} label="Away Score">
        <div className="tv-side__score" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>{away.score}</div>
      </EditableWidget>

      {/* Away Logo */}
      <EditableWidget id="tv-away-logo" rect={tvLayouts['tv-away-logo']} editing={tvEditing} onUpdate={updateTvWidget} label="Away Logo">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          {away.config.logoPath
            ? <img src={`local-file:///${away.config.logoPath.replace(/\\/g, '/')}`} alt="" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:'8px'}} />
            : <div style={{width:'60%',height:'60%',background:'rgba(255,255,255,0.05)',borderRadius:'50%',border:'2px solid rgba(255,255,255,0.15)'}} />
          }
        </div>
      </EditableWidget>

      {/* Home Name */}
      <EditableWidget id="tv-home-name" rect={tvLayouts['tv-home-name']} editing={tvEditing} onUpdate={updateTvWidget} label="Home Name">
        <div className="tv-side__banner" style={{'--team-clr': home.config.color, width:'100%',height:'100%',display:'flex',alignItems:'center'} as React.CSSProperties}>{home.config.name}</div>
      </EditableWidget>

      {/* Away Name */}
      <EditableWidget id="tv-away-name" rect={tvLayouts['tv-away-name']} editing={tvEditing} onUpdate={updateTvWidget} label="Away Name">
        <div className="tv-side__banner tv-side__banner--right" style={{'--team-clr': away.config.color, width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'flex-end'} as React.CSSProperties}>{away.config.name}</div>
      </EditableWidget>

      {/* Home Timeouts */}
      <EditableWidget id="tv-home-to" rect={tvLayouts['tv-home-to']} editing={tvEditing} onUpdate={updateTvWidget} label="Home TO">
        <div className="tv-side__timeouts" style={{width:'100%',height:'100%',display:'flex',alignItems:'center'}}>TIME OUTS | F: {homeToUsed} Q: {home.timeouts.fullRemaining}</div>
      </EditableWidget>

      {/* Away Timeouts */}
      <EditableWidget id="tv-away-to" rect={tvLayouts['tv-away-to']} editing={tvEditing} onUpdate={updateTvWidget} label="Away TO">
        <div className="tv-side__timeouts tv-side__timeouts--right" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'flex-end'}}>TIME OUTS | F: {awayToUsed} Q: {away.timeouts.fullRemaining}</div>
      </EditableWidget>

      {/* Home Scorers */}
      <EditableWidget id="tv-home-scorers" rect={tvLayouts['tv-home-scorers']} editing={tvEditing} onUpdate={updateTvWidget} label="Home Scorers">
        <div className="tv-side__scorers" style={{width:'100%',height:'100%'}}>
          {homeScorers.map(p => <div key={p.id} className="tv-side__scorer"><span>{p.name}</span><span className="tv-side__scorer-pts">{p.points}</span></div>)}
        </div>
      </EditableWidget>

      {/* Away Scorers */}
      <EditableWidget id="tv-away-scorers" rect={tvLayouts['tv-away-scorers']} editing={tvEditing} onUpdate={updateTvWidget} label="Away Scorers">
        <div className="tv-side__scorers tv-side__scorers--right" style={{width:'100%',height:'100%'}}>
          {awayScorers.map(p => <div key={p.id} className="tv-side__scorer"><span>{p.name}</span><span className="tv-side__scorer-pts">{p.points}</span></div>)}
        </div>
      </EditableWidget>

      {/* Clock */}
      <EditableWidget id="tv-clock" rect={tvLayouts['tv-clock']} editing={tvEditing} onUpdate={updateTvWidget} label="Clock">
        <div className={`tv-mid__clock${isFlashing ? ' tv-mid__clock--flash' : ''}`} style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'50cqh'}}>{clockDisplay}</div>
      </EditableWidget>

      {/* Period */}
      <EditableWidget id="tv-period" rect={tvLayouts['tv-period']} editing={tvEditing} onUpdate={updateTvWidget} label="Period">
        <div className="tv-mid__period" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>{periodLabel}</div>
      </EditableWidget>

      {/* Shot Clock */}
      <EditableWidget id="tv-shot-clock" rect={tvLayouts['tv-shot-clock']} editing={tvEditing} onUpdate={updateTvWidget} label="Shot Clock">
        <div className={`tv-mid__shot${shotSec <= 5 ? ' tv-mid__shot--warn' : ''}`} style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'55cqh'}}>{shotClock.enabled ? shotSec : ''}</div>
      </EditableWidget>

      {/* Possession */}
      <EditableWidget id="tv-possession" rect={tvLayouts['tv-possession']} editing={tvEditing} onUpdate={updateTvWidget} label="Possession">
        <div className="tv-mid__poss" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>{possession ? (possession === 'home' ? '◀' : '▶') + ' POSSESSION' : ''}</div>
      </EditableWidget>

      {/* Event Row */}
      <EditableWidget id="tv-event" rect={tvLayouts['tv-event']} editing={tvEditing} onUpdate={updateTvWidget} label="Event">
        <div className="tv-event" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'1.5vw'}}>
          <span className="tv-event__label">EVENT</span>
          <span className="tv-event__item">Date: <strong>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</strong></span>
        </div>
      </EditableWidget>

      {/* Sponsors */}
      <EditableWidget id="tv-sponsors" rect={tvLayouts['tv-sponsors']} editing={tvEditing} onUpdate={updateTvWidget} label="Sponsors">
        <div className="tv-partners" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'2vw'}}>
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
      </EditableWidget>

      {/* Timeout overlay — split layout with video on right + bottom bar */}
      {gs.timeout && (
        <div className="tv-timeout tv-timeout--split">
          <div className="tv-timeout__top">
            <div className="tv-timeout__left">
              <div className="tv-timeout__flash">TIMEOUT</div>
              <div className="tv-timeout__team">{gs.timeout.team === 'home' ? 'HOME' : 'AWAY'}: {gs[gs.timeout.team].config.name}</div>
              <div className="tv-timeout__ring">
                <svg className="tv-timeout__ring-svg" viewBox="0 0 200 200">
                  <circle className="tv-timeout__ring-bg" cx="100" cy="100" r="90" />
                  <circle
                    className="tv-timeout__ring-progress"
                    cx="100" cy="100" r="90"
                    strokeDasharray={2 * Math.PI * 90}
                    strokeDashoffset={2 * Math.PI * 90 * (1 - (gs.timeout.remainingMs / 60000))}
                  />
                </svg>
                <div className="tv-timeout__ring-time">
                  {String(Math.floor(gs.timeout.remainingMs / 60000)).padStart(2, '0')}:{String(Math.ceil((gs.timeout.remainingMs % 60000) / 1000)).padStart(2, '0')}
                </div>
              </div>
              <div className="tv-timeout__remaining-label">TIME REMAINING</div>
            </div>
            <div className="tv-timeout__right">
              <video
                className="tv-timeout__video"
                autoPlay
                loop
                muted
                playsInline
                src={videoSrc}
              />
            </div>
          </div>
          <div className="tv-timeout__bar">
            <div className="tv-timeout__bar-team tv-timeout__bar-team--home">
              {home.config.logoPath && <img className="tv-timeout__bar-logo" src={`local-file:///${home.config.logoPath.replace(/\\/g, '/')}`} alt="" />}
              <span>{home.config.name}</span>
              <span className="tv-timeout__bar-score">{home.score}</span>
            </div>
            <div className="tv-timeout__bar-center">
              <span className="tv-timeout__bar-period">Q{period.current}</span>
              <span className="tv-timeout__bar-clock">{formatClockDisplay(gameClock.displayMs)}</span>
            </div>
            <div className="tv-timeout__bar-team tv-timeout__bar-team--away">
              <span className="tv-timeout__bar-score">{away.score}</span>
              <span>{away.config.name}</span>
              {away.config.logoPath && <img className="tv-timeout__bar-logo" src={`local-file:///${away.config.logoPath.replace(/\\/g, '/')}`} alt="" />}
            </div>
          </div>
        </div>
      )}

      {/* Replay overlay */}
      {replayActive && (
        <div className="tv-replay">
          <div className="tv-replay__bg" />
          <div className="tv-replay__content">
            <div className="tv-replay__label">REPLAY</div>
          </div>
        </div>
      )}

    </div>
  )
}

export default ScoreboardLayout
