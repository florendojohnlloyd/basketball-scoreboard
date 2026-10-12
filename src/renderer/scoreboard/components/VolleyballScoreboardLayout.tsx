import React, { useState, useEffect } from 'react'
import { useScoreboardStore } from '../store'
import { useTimeoutLayoutStore } from '../timeoutLayoutStore'
import type { TimeoutLayoutStore } from '../timeoutLayoutStore'
import { getImageUrl } from '../../shared/imageUtils'
import { formatClockPrecise } from '../../shared/clockUtils'
import './VolleyballScoreboardLayout.css'
import timeoutVideo from '../../shared/vid/FitnessExclusive.mp4'

const TO_CUSTOM_IMG_KEY = 'scoreboard-timeout-img'

// ---------------------------------------------------------------------------
// ScoreboardName — auto-fitting pixel-perfect multi-line text measurement
// (Identical algorithm to Basketball Scoreboard for consistent high-impact names)
// ---------------------------------------------------------------------------
const SCOREBOARD_FONT_FAMILY = "'Arial Black', Impact, sans-serif"
const SCOREBOARD_BASE_FONT_PX = 500

function measureTextWidth(text: string, fontPx: number): number {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 9999
    ctx.font = `900 ${fontPx}px ${SCOREBOARD_FONT_FAMILY}`
    const letterSpacingPx = fontPx * 0.06
    const metrics = ctx.measureText(text.toUpperCase())
    return metrics.width + letterSpacingPx * text.length
  } catch {
    return 9999
  }
}

function ScoreboardName({
  text,
  color,
  align = 'left',
}: {
  text: string
  color: string
  align?: 'left' | 'right' | 'center'
}): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = React.useState(120)
  const [lines, setLines] = React.useState<string[]>([text])

  const MAX_FONT_PX = 180

  const splitIntoLines = React.useCallback((words: string[], n: number): string[] => {
    if (n >= words.length) return words.map(w => w)
    if (n === 1) return [words.join(' ')]
    if (n === 2) {
      let bestSplit = 1, bestDiff = Infinity
      for (let i = 1; i < words.length; i++) {
        const d = Math.abs(
          measureTextWidth(words.slice(0, i).join(' '), 1) -
          measureTextWidth(words.slice(i).join(' '), 1)
        )
        if (d < bestDiff) { bestDiff = d; bestSplit = i }
      }
      return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')]
    }
    let best: string[] = [words.join(' ')]
    let bestMax = Infinity
    for (let i = 1; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const l1 = words.slice(0, i).join(' ')
        const l2 = words.slice(i, j).join(' ')
        const l3 = words.slice(j).join(' ')
        const maxW = Math.max(
          measureTextWidth(l1, 1),
          measureTextWidth(l2, 1),
          measureTextWidth(l3, 1)
        )
        if (maxW < bestMax) { bestMax = maxW; best = [l1, l2, l3] }
      }
    }
    return best
  }, [])

  const compute = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const containerW = el.clientWidth
    const containerH = el.clientHeight
    if (containerW <= 0 || containerH <= 0) { requestAnimationFrame(compute); return }

    const words = text.trim().toUpperCase().split(/\s+/)
    let bestScore = -1
    let bestFontSize = 36
    let bestLines: string[] = [text]

    const maxN = Math.min(2, words.length)
    for (let n = 1; n <= maxN; n++) {
      const ls = splitIntoLines(words, n)
      const maxLineW = Math.max(...ls.map(l => measureTextWidth(l, SCOREBOARD_BASE_FONT_PX)))
      const widthPx = Math.floor((SCOREBOARD_BASE_FONT_PX * (containerW - 12)) / maxLineW)
      const heightPx = Math.floor((containerH - (n - 1) * 6) / (n * 1.05))
      const px = Math.min(widthPx, heightPx, MAX_FONT_PX)

      let score = px
      if (n === 1 && words.length > 1) {
        score = px * 0.65
      }

      if (score > bestScore) {
        bestScore = score
        bestFontSize = px
        bestLines = ls
      }
    }

    setFontSize(Math.max(bestFontSize, 24))
    setLines(bestLines)
  }, [text, splitIntoLines])

  React.useLayoutEffect(() => { compute() }, [compute])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compute])

  const isWrapped = lines.length > 1

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '0 4px',
        boxSizing: 'border-box',
        gap: isWrapped ? '0.02em' : 0,
      }}
    >
      {lines.map((line, i) => (
        <span key={i} style={{
          fontFamily: SCOREBOARD_FONT_FAMILY,
          fontSize: `${fontSize}px`,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          lineHeight: 1.05,
          color,
          display: 'block',
          textAlign: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
          width: '100%',
        }}>
          {line}
        </span>
      ))}
    </div>
  )
}

function VolleyballScoreboardLayout(): React.ReactElement {
  const gs = useScoreboardStore(s => s.gameState)
  const { home, away, gamePhase, volleyball, timeout } = gs

  const toLayout = useTimeoutLayoutStore() as TimeoutLayoutStore

  // Custom uploaded timeout ad image from localStorage
  const [customImg] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TO_CUSTOM_IMG_KEY)
    } catch {
      return null
    }
  })

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

  const remainingMs = timeout?.remainingMs ?? 0
  const timeoutTeamName = timeout ? gs[timeout.team].config.name : ''
  const ringPct = remainingMs / 30000
  const ringCircum = 2 * Math.PI * 90
  const timeoutTimeStr = formatClockPrecise(remainingMs)

  // ═══ LIVE SCOREBOARD ═══
  return (
    <div className="vb-tv vb-tv--live">

      {/* Outer Scoreboard Hardware Frame */}
      <div className="vb-board-frame">

        {/* ── TOP ROW: BADGES (TEAM NAMES) & SET DISPLAY (ON TOP) ── */}
        <div className="vb-board__top-row">

          {/* AWAY BADGE */}
          <div className="vb-badge-container vb-badge-container--away">
            <div className="vb-badge vb-badge--away" style={{ width: '100%', height: '100%' }}>
              <ScoreboardName
                text={away.config.name || 'AWAY'}
                color={away.config.color || '#00a2ff'}
                align="left"
                maxFontSize={300}
              />
              {servingTeam === 'away' && (
                <span className="vb-serve-arrow" title="Away Serving">◀</span>
              )}
            </div>
          </div>

          {/* SET DISPLAY (TOP CENTER) */}
          <div className="vb-set-top-box">
            <span className="vb-set-label">SET</span>
            <span className="vb-led-amber">{currentSet}</span>
          </div>

          {/* HOME BADGE */}
          <div className="vb-badge-container vb-badge-container--home">
            <div className="vb-badge vb-badge--home" style={{ width: '100%', height: '100%' }}>
              {servingTeam === 'home' && (
                <span className="vb-serve-arrow" title="Home Serving">▶</span>
              )}
              <ScoreboardName
                text={home.config.name || 'HOME'}
                color={home.config.color || '#ff3333'}
                align="right"
                maxFontSize={300}
              />
            </div>
          </div>

        </div>

        {/* ── MIDDLE ROW: SCORES ── */}
        <div className="vb-board__score-row">

          {/* AWAY SCORE */}
          <div className="vb-score-box vb-score-box--away">
            <span className="vb-led-red">{away.score}</span>
          </div>

          {/* HOME SCORE */}
          <div className="vb-score-box vb-score-box--home">
            <span className="vb-led-red">{home.score}</span>
          </div>

        </div>

        {/* ── BOTTOM ROW: INDICATORS ("T" WITH DIGITAL LED NUMBER - NO CIRCLES, NO BOXES) ── */}
        <div className="vb-board__bottom-row">

          {/* AWAY INDICATORS */}
          <div className="vb-indicators-group vb-indicators-group--away">
            <div className="vb-indicator-block">
              <span className="vb-indicator-label">T</span>
              <span className="vb-indicator-number">{2 - (timeoutsUsed.away || 0)}</span>
            </div>
          </div>

          {/* HOME INDICATORS */}
          <div className="vb-indicators-group vb-indicators-group--home">
            <div className="vb-indicator-block">
              <span className="vb-indicator-label">T</span>
              <span className="vb-indicator-number">{2 - (timeoutsUsed.home || 0)}</span>
            </div>
          </div>

        </div>

      </div>

      {/* ── TIMEOUT OVERLAY WITH ADS (CLEAN DISPLAY) ── */}
      {timeout && (
        <div className="tv-timeout tv-timeout--split">
          {/* Left Info Panel */}
          <div className="tv-timeout__info-panel" style={{ paddingBottom: toLayout.showScoreBar ? '120px' : '40px' }}>
            <div className="tv-timeout__flash" style={{ color: toLayout.flashColor || '#ffd700' }}>
              TIMEOUT
            </div>
            {timeoutTeamName && (
              <div className="tv-timeout__team-badge">
                {timeoutTeamName}
              </div>
            )}

            {/* Countdown Display without circle */}
            <div className="tv-timeout__ring">
              <div className="tv-timeout__ring-time">
                {timeoutTimeStr}
              </div>
            </div>

            <div className="tv-timeout__remaining-label">
              TIME REMAINING
            </div>
          </div>

          {/* Right Video / Custom Ad Image Panel */}
          <div className="tv-timeout__video-panel">
            {customImg ? (
              <img src={getImageUrl(customImg)} alt="Timeout Ad" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <video className="tv-timeout__video" autoPlay loop muted playsInline src={timeoutVideo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>

          {/* Bottom Score Bar */}
          {toLayout.showScoreBar && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 110, background: 'linear-gradient(180deg, #0a1020 0%, #0d1530 100%)', borderTop: '5px solid #17a2b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 60px', zIndex: 10, boxShadow: '0 -5px 30px rgba(0,0,0,0.8)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
                <span style={{ fontSize: '4.2rem', fontWeight: 900, color: '#ff4a4a', textTransform: 'uppercase', textShadow: '0 2px 10px rgba(255,74,74,0.5)' }}>{away.config.name}</span>
                <span style={{ fontSize: '4.2rem', fontWeight: 900, color: '#ffffff', fontFamily: "'Cursed Timer ULiL', monospace", textShadow: '0 0 15px rgba(255,255,255,0.3)' }}>{away.score}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#ffffff', fontFamily: "'Oswald', sans-serif" }}>
                <span style={{ fontSize: '3.2rem', fontWeight: 900, color: '#ffcc00', textShadow: '0 0 10px rgba(255,204,0,0.5)' }}>SET {currentSet}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
                <span style={{ fontSize: '4.2rem', fontWeight: 900, color: '#ffffff', fontFamily: "'Cursed Timer ULiL', monospace", textShadow: '0 0 15px rgba(255,255,255,0.3)' }}>{home.score}</span>
                <span style={{ fontSize: '4.2rem', fontWeight: 900, color: '#4a9eff', textTransform: 'uppercase', textShadow: '0 2px 10px rgba(74,158,255,0.5)' }}>{home.config.name}</span>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export default VolleyballScoreboardLayout
