import React, { useEffect } from 'react'
import { useScoreboardStore } from '../store'
import { getImageUrl } from '../../shared/imageUtils'
import './VolleyballScoreboardLayout.css'
import timeoutVideo from '../../shared/vid/FitnessExclusive.mp4'

function VolleyballScoreboardLayout(): React.ReactElement {
  const gs = useScoreboardStore(s => s.gameState)
  const { home, away, gamePhase, volleyball, timeout } = gs

  // ESC key handler to close window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Early return if not volleyball mode
  if (gs.sport !== 'volleyball') {
    return (
      <div className="vb-tv-fallback">
        <p>Volleyball mode not active</p>
      </div>
    )
  }

  if (!volleyball) {
    return (
      <div className="vb-tv-fallback">
        <p>Volleyball state not initialized</p>
      </div>
    )
  }

  const { currentSet, setsWon, timeoutsUsed, servingTeam } = volleyball

  // ═══ PRE-GAME ═══
  if (gamePhase === 'pre-game') {
    return (
      <div className="vb-tv vb-tv--pregame">
        <div className="vb-pre">
          <div className="vb-pre__title">VOLLEYBALL</div>
          <div className="vb-pre__matchup">
            <div className="vb-pre__team">
              <div className="vb-pre__logo-circle">
                {home.config.logoPath ? (
                  <img src={getImageUrl(home.config.logoPath)} alt="" />
                ) : (
                  <span>H</span>
                )}
              </div>
              <div className="vb-pre__name" style={{ color: home.config.color }}>
                {home.config.name}
              </div>
            </div>
            <div className="vb-pre__vs">VS</div>
            <div className="vb-pre__team">
              <div className="vb-pre__logo-circle">
                {away.config.logoPath ? (
                  <img src={getImageUrl(away.config.logoPath)} alt="" />
                ) : (
                  <span>A</span>
                )}
              </div>
              <div className="vb-pre__name" style={{ color: away.config.color }}>
                {away.config.name}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══ GAME OVER ═══
  if (gamePhase === 'post-game') {
    const winner = setsWon.home > setsWon.away ? home : setsWon.away > setsWon.home ? away : null
    return (
      <div className="vb-tv vb-tv--gameover">
        <div className="vb-go__title">GAME OVER</div>
        <div className="vb-go__scores">
          <div>
            <div className="vb-go__name" style={{ color: home.config.color }}>
              {home.config.name}
            </div>
            <div className="vb-go__sets">{setsWon.home} Sets</div>
          </div>
          <div className="vb-go__sep">—</div>
          <div>
            <div className="vb-go__name" style={{ color: away.config.color }}>
              {away.config.name}
            </div>
            <div className="vb-go__sets">{setsWon.away} Sets</div>
          </div>
        </div>
        {winner && <div className="vb-go__winner">🏆 {winner.config.name} WINS!</div>}
      </div>
    )
  }

  // ═══ LIVE ═══
  return (
    <div className="vb-tv vb-tv--live">
      {/* Main content area */}
      <div className="vb-tv__main">
        {/* Left panel — Home team */}
        <div className="vb-tv__side vb-tv__side--home">
          {/* Serving indicator (home) */}
          {servingTeam === 'home' && (
            <div className="vb-tv__serve-arrow vb-tv__serve-arrow--home">▶</div>
          )}

          {/* Team name */}
          <div className="vb-tv__team-name" style={{ color: home.config.color || '#1a4fd6' }}>
            {home.config.name}
          </div>

          {/* Logo */}
          <div className="vb-tv__logo">
            {home.config.logoPath ? (
              <img src={getImageUrl(home.config.logoPath)} alt="Home Logo" />
            ) : (
              <svg viewBox="0 0 100 100" className="vb-tv__logo-placeholder">
                <circle cx="50" cy="50" r="45" fill="rgba(3,10,20,0.85)" stroke={home.config.color || '#1a4fd6'} strokeWidth="4" />
                <circle cx="50" cy="50" r="38" fill="none" stroke={home.config.color || '#1a4fd6'} strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />
                <circle cx="50" cy="50" r="25" fill="none" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
                <path d="M 25 50 L 75 50" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
                <path d="M 50 25 L 50 75" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              </svg>
            )}
          </div>

          {/* Score */}
          <div className="vb-tv__score">{home.score}</div>

          {/* Sets won */}
          <div className="vb-tv__sets-won">
            <div className="vb-tv__sets-label">Sets Won</div>
            <div className="vb-tv__sets-dots">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={`vb-tv__sets-dot${i < setsWon.home ? ' vb-tv__sets-dot--filled' : ''}`}
                />
              ))}
            </div>
            <div className="vb-tv__sets-count">{setsWon.home}</div>
          </div>

          {/* Timeouts */}
          <div className="vb-tv__timeouts">
            <div className="vb-tv__timeouts-label">Timeouts</div>
            <div className="vb-tv__timeouts-dots">
              {Array.from({ length: 2 - timeoutsUsed.home }).map((_, i) => (
                <div key={i} className="vb-tv__timeout-dot" />
              ))}
            </div>
            <div className="vb-tv__timeouts-count">{2 - timeoutsUsed.home}</div>
          </div>
        </div>

        {/* Center panel */}
        <div className="vb-tv__center">
          <div className="vb-tv__center-set">
            <div className="vb-tv__center-set-label">SET</div>
            <div className="vb-tv__center-set-number">{currentSet}</div>
          </div>
          {servingTeam && (
            <div className="vb-tv__center-serve">
              <div className="vb-tv__center-serve-arrow">
                {servingTeam === 'home' ? '◄' : '►'}
              </div>
              <div className="vb-tv__center-serve-text">SERVE</div>
            </div>
          )}
        </div>

        {/* Right panel — Away team */}
        <div className="vb-tv__side vb-tv__side--away">
          {/* Serving indicator (away) */}
          {servingTeam === 'away' && (
            <div className="vb-tv__serve-arrow vb-tv__serve-arrow--away">◀</div>
          )}

          {/* Team name */}
          <div className="vb-tv__team-name" style={{ color: away.config.color || '#c0392b' }}>
            {away.config.name}
          </div>

          {/* Logo */}
          <div className="vb-tv__logo">
            {away.config.logoPath ? (
              <img src={getImageUrl(away.config.logoPath)} alt="Away Logo" />
            ) : (
              <svg viewBox="0 0 100 100" className="vb-tv__logo-placeholder">
                <circle cx="50" cy="50" r="45" fill="rgba(3,10,20,0.85)" stroke={away.config.color || '#c0392b'} strokeWidth="4" />
                <circle cx="50" cy="50" r="38" fill="none" stroke={away.config.color || '#c0392b'} strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />
                <circle cx="50" cy="50" r="25" fill="none" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
                <path d="M 25 50 L 75 50" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
                <path d="M 50 25 L 50 75" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              </svg>
            )}
          </div>

          {/* Score */}
          <div className="vb-tv__score">{away.score}</div>

          {/* Sets won */}
          <div className="vb-tv__sets-won">
            <div className="vb-tv__sets-label">Sets Won</div>
            <div className="vb-tv__sets-dots">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={`vb-tv__sets-dot${i < setsWon.away ? ' vb-tv__sets-dot--filled' : ''}`}
                />
              ))}
            </div>
            <div className="vb-tv__sets-count">{setsWon.away}</div>
          </div>

          {/* Timeouts */}
          <div className="vb-tv__timeouts">
            <div className="vb-tv__timeouts-label">Timeouts</div>
            <div className="vb-tv__timeouts-dots">
              {Array.from({ length: 2 - timeoutsUsed.away }).map((_, i) => (
                <div key={i} className="vb-tv__timeout-dot" />
              ))}
            </div>
            <div className="vb-tv__timeouts-count">{2 - timeoutsUsed.away}</div>
          </div>
        </div>
      </div>

      {/* Bottom bar — Sponsor area */}
      <div className="vb-tv__bottombar">
        <div className="vb-tv__sponsor">Powered by LigaControl</div>
      </div>

      {/* Timeout Overlay with Video/Ads */}
      {timeout && (
        <div className="vb-tv-timeout">
          <div className="vb-tv-timeout__content">
            {/* Video/Ad */}
            <div className="vb-tv-timeout__video-container">
              <video 
                className="vb-tv-timeout__video" 
                autoPlay 
                loop 
                muted 
                playsInline 
                src={timeoutVideo} 
              />
            </div>

            {/* Timeout Info Overlay */}
            <div className="vb-tv-timeout__overlay">
              <div className="vb-tv-timeout__flash">TIMEOUT</div>
              <div className="vb-tv-timeout__team" style={{ color: gs[timeout.team].config.color }}>
                {gs[timeout.team].config.name}
              </div>
              
              {/* Countdown Circle */}
              <div className="vb-tv-timeout__countdown">
                <svg className="vb-tv-timeout__ring" viewBox="0 0 200 200">
                  <circle 
                    className="vb-tv-timeout__ring-bg" 
                    cx="100" cy="100" r="90" 
                    fill="none" 
                    stroke="rgba(100,180,255,0.15)" 
                    strokeWidth="8"
                  />
                  <circle 
                    className="vb-tv-timeout__ring-progress" 
                    cx="100" cy="100" r="90"
                    fill="none"
                    stroke="#4dc9f6"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 90}`}
                    strokeDashoffset={`${2 * Math.PI * 90 * (1 - timeout.remainingMs / 30000)}`}
                    transform="rotate(-90 100 100)"
                  />
                </svg>
                <div className="vb-tv-timeout__time">
                  {Math.ceil(timeout.remainingMs / 1000)}
                </div>
              </div>
              
              <div className="vb-tv-timeout__label">TIME REMAINING</div>

              {/* Score Bar */}
              <div className="vb-tv-timeout__scorebar">
                <div className="vb-tv-timeout__score-team" style={{ color: home.config.color }}>
                  <span className="vb-tv-timeout__score-name">{home.config.name}</span>
                  <span className="vb-tv-timeout__score-num">{home.score}</span>
                </div>
                <div className="vb-tv-timeout__score-center">
                  <div>SET {volleyball.currentSet}</div>
                  <div style={{ fontSize: '0.7em', color: '#bbb' }}>
                    {setsWon.home} - {setsWon.away}
                  </div>
                </div>
                <div className="vb-tv-timeout__score-team" style={{ color: away.config.color }}>
                  <span className="vb-tv-timeout__score-num">{away.score}</span>
                  <span className="vb-tv-timeout__score-name">{away.config.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VolleyballScoreboardLayout
