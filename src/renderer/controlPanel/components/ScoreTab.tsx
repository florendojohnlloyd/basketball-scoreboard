import React, { useState, useEffect, useRef } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { formatClockDisplay } from '@renderer/shared/clockUtils'
import type { Player } from '@shared/types'
import { relayBuzzerService, type RelayBuzzerState } from '../hardware/relayBuzzerService'
import { JerseyWithNumber, PlayerStatsTable, IconLabel, JERSEYS, playerCardClass } from './PlayerCardParts'
import { sb, sbGrad, sbTint } from '../colorLayout'
import './GlossyButtons.css'
import attackSound from '../../shared/sounds/attack.mp3'
import buzzerSound from '../../shared/sounds/buzzer.mp3'

interface ScoreTabProps {
  selectedPlayer: { team: 'home' | 'away'; id: string } | null
  setSelectedPlayer: (p: { team: 'home' | 'away'; id: string } | null) => void
  setShowSubModal: (t: 'home' | 'away' | null) => void
  currentTab: string
  onTabChange: (tab: string) => void
}

export function ScoreTab({
  selectedPlayer,
  setSelectedPlayer,
  setShowSubModal,
  onTabChange,
}: ScoreTabProps): React.ReactElement {
  const gs = useControlPanelStore(s => s.gameState)
  const controlsLocked = useControlPanelStore(s => s.controlsLocked)
  const setControlsLocked = useControlPanelStore(s => s.setControlsLocked)
  const { home, away, gameClock, shotClock, period, possession } = gs

  const clockStr = formatClockDisplay(gameClock.displayMs)
  const shotSec = Math.ceil((shotClock?.displayMs ?? 0) / 1000)
  const isShotEnabled = shotClock ? (shotClock.enabled !== false) : true

  // Undo state
  const [canUndo, setCanUndo] = useState(false)
  const [undoDesc, setUndoDesc] = useState('')
  const [timeEditInput, setTimeEditInput] = useState('')
  const [showResetModal, setShowResetModal] = useState(false)
  const [relayState, setRelayState] = useState<RelayBuzzerState>(() => relayBuzzerService.getState())
  const timeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = relayBuzzerService.subscribe((s) => setRelayState(s))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!showResetModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowResetModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showResetModal])

  const handleApplyTimeEdit = (customVal?: string) => {
    const val = (customVal !== undefined ? customVal : timeEditInput).trim()
    if (!val) return

    let seconds = 0
    if (val.includes(':')) {
      const parts = val.split(':')
      const mins = parseInt(parts[0], 10) || 0
      const secs = parseInt(parts[1], 10) || 0
      seconds = mins * 60 + Math.min(59, secs)
    } else {
      const num = parseInt(val, 10)
      if (!isNaN(num)) {
        seconds = num * 60
      }
    }

    if (seconds >= 0) {
      if (gameClock.running) {
        sendCommand({ type: 'STOP_GAME_CLOCK' })
        sendCommand({ type: 'STOP_SHOT_CLOCK' })
      }
      sendCommand({ type: 'SET_GAME_CLOCK', seconds })
      setTimeEditInput('')
    }
  }

  const handleResetAll = () => {
    setShowResetModal(true)
  }

  const confirmResetAll = async () => {
    setShowResetModal(false)
    try {
      sendCommand({ type: 'STOP_GAME_CLOCK' })
      sendCommand({ type: 'STOP_SHOT_CLOCK' })

      if (gs.sport === 'volleyball') {
        sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })
      } else {
        sendCommand({ type: 'NEW_GAME', clearTeams: false, forceReset: true })
        await window.electron.ipcRenderer.invoke('scoreboard:query', {
          type: 'NEW_GAME_CONFIRMED',
          clearTeams: false,
        }).catch(() => {})
      }

      sendCommand({ type: 'RESET_GAME_CLOCK' })
      sendCommand({ type: 'RESET_SHOT_CLOCK' })

      if (relayBuzzerService.getState().isBuzzing) {
        relayBuzzerService.saveConfig({})
      }

      setTimeout(() => {
        if (timeInputRef.current) {
          timeInputRef.current.focus()
          timeInputRef.current.select()
        }
      }, 60)
    } catch (err) {
      console.error('[ScoreTab] Error during Reset All:', err)
    }
  }

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('scoreboard:query', { type: 'CAN_UNDO' })
      .then((r: any) => {
        setCanUndo(r?.canUndo ?? false)
        setUndoDesc(r?.description ?? '')
      })
      .catch(() => {})
  }, [home.score, away.score, period.current, gs.gamePhase])

  const handleAddPoints = (team: 'home' | 'away', points: 1 | 2 | 3) => {
    if (selectedPlayer && selectedPlayer.team === team) {
      sendCommand({ type: 'ADD_PLAYER_POINTS', team, playerId: selectedPlayer.id, points })
      
      // Auto-increment FGM for 2-point and 3-point shots (FGA is auto-incremented with FGM in gameStore)
      if (points === 2 || points === 3) {
        sendCommand({ type: 'ADD_PLAYER_STAT', team, playerId: selectedPlayer.id, stat: 'fgm' })
      }
      
      // Auto-increment FTM for 1-point (free throw) (FTA is auto-incremented with FTM in gameStore)
      if (points === 1) {
        sendCommand({ type: 'ADD_PLAYER_STAT', team, playerId: selectedPlayer.id, stat: 'ftm' })
      }
    } else {
      sendCommand({ type: 'ADD_SCORE', team, points })
    }
  }

  // Play attack sound
  function playAttackSound(): void {
    try {
      const audio = new Audio(attackSound)
      audio.volume = 0.7
      audio.play().catch(err => console.warn('Attack sound playback failed:', err))
    } catch (err) {
      console.warn('Failed to create attack sound audio:', err)
    }
  }

  // Play buzzer sound
  function playBuzzerSound(): void {
    try {
      const audio = new Audio(buzzerSound)
      audio.volume = 0.8
      audio.play().catch(err => console.warn('Buzzer sound playback failed:', err))
    } catch (err) {
      console.warn('Failed to create buzzer sound audio:', err)
    }
  }

  const handleQuickAddStartingFive = (team: 'home' | 'away') => {
    const teamState = team === 'home' ? home : away
    for (let i = 1; i <= 5; i++) {
      const pl: Player = {
        id: `${team}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        number: String(teamState.players.length + i),
        name: `Player ${teamState.players.length + i}`,
        fouls: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        fga: 0,
        fgm: 0,
        fta: 0,
        ftm: 0,
        minutesPlayed: 0,
        substitutions: [],
        photoPath: null,
        active: true,
        fouledOut: false,
      }
      sendCommand({ type: 'ADD_PLAYER', team, player: pl })
    }
  }

  const handleActivateAllPlayers = (team: 'home' | 'away') => {
    const list = team === 'home' ? home.players : away.players
    list.slice(0, 5).forEach(p => {
      if (!p.active) {
        sendCommand({ type: 'TOGGLE_PLAYER_ACTIVE', team, playerId: p.id })
      }
    })
  }

  useEffect(() => {
    if (home.players.length === 0) {
      handleQuickAddStartingFive('home')
    }
    if (away.players.length === 0) {
      handleQuickAddStartingFive('away')
    }
  }, [home.players.length, away.players.length])

  useEffect(() => {
    if (home.players.length > 0 && home.players.filter(p => p.active).length === 0) {
      handleActivateAllPlayers('home')
    }
    if (away.players.length > 0 && away.players.filter(p => p.active).length === 0) {
      handleActivateAllPlayers('away')
    }
  }, [home.players, away.players])

  const homeDisplayPlayers = home.players.filter(p => p.active).length > 0
    ? home.players.filter(p => p.active)
    : home.players
  const awayDisplayPlayers = away.players.filter(p => p.active).length > 0
    ? away.players.filter(p => p.active)
    : away.players

  const homeColor = home.config.color || '#4a9eff'
  const awayColor = away.config.color || '#ff4a4a'

  return (
    <div
      className="bb-score-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        background: '#0a0d14',
        padding: '6px 8px',
        gap: '6px',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
        color: '#ffffff',
        pointerEvents: controlsLocked ? 'none' : 'auto',
      }}
    >
      {/* ── TOP BANNER: FULL WIDTH HEADER WITH SCORE CLOSE TO TEAM NAME & LARGE F/TO ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '12px',
          padding: '6px 14px 8px 14px',
          background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
          borderRadius: '10px',
          border: '1.5px solid #2a3447',
          borderBottom: '2.5px solid #334155',
          alignItems: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          flexShrink: 0,
        }}
      >
        {/* Home Info & Score - Score is RIGHT BESIDE Team Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '1.55rem', color: homeColor, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.1 }}>
              {home.config.name}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '3px' }}>
              <span style={{ fontSize: '1.1rem', color: '#cbd5e1', fontWeight: 800 }}>
                F: <strong style={{ color: '#ff4a4a', fontSize: '1.3rem', fontWeight: 900 }}>{home.fouls}</strong>
              </span>
              <span style={{ fontSize: '1.1rem', color: '#cbd5e1', fontWeight: 800 }}>
                TO: <strong style={{ color: '#ffcc00', fontSize: '1.3rem', fontWeight: 900 }}>{home.timeouts.fullRemaining}</strong>
              </span>
            </div>
          </div>
          <div style={{ fontSize: '3.8rem', color: 'var(--led-red, #ff0000)', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 0.9 }}>
            {home.score}
          </div>
        </div>

        {/* Center: Quarter, Game Time & Shot Clock Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <div
            style={{
              fontSize: '1.5rem',
              color: '#ffaa00',
              fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)',
              fontWeight: 900,
              background: '#04070d',
              padding: '4px 14px',
              borderRadius: '8px',
              border: '2px solid #ffaa00',
              lineHeight: 1.1,
              boxShadow: '0 0 12px rgba(255, 170, 0, 0.35)',
              letterSpacing: '0.04em',
            }}
          >
            {period.isOvertime ? `OT${period.overtimeNumber}` : `Q${period.current}`}
          </div>
          <div
            style={{
              fontSize: '4.2rem',
              color: gameClock.running ? '#00ff66' : '#ffaa00',
              fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)',
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: '0.08em',
              textShadow: gameClock.running ? '0 0 20px rgba(0, 255, 102, 0.45)' : '0 0 20px rgba(255, 170, 0, 0.45)',
            }}
          >
            {clockStr}
          </div>
          <div
            style={{
              fontSize: '2rem',
              color: !isShotEnabled ? '#475569' : (shotSec <= 5 ? '#ff3d00' : '#ffaa00'),
              fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)',
              fontWeight: 900,
              background: '#04070d',
              padding: '4px 12px',
              borderRadius: '8px',
              border: `2px solid ${shotSec <= 5 && isShotEnabled ? '#ef4444' : isShotEnabled ? '#f59e0b' : '#334155'}`,
              lineHeight: 1.1,
              boxShadow: isShotEnabled ? (shotSec <= 5 ? '0 0 12px rgba(239, 68, 68, 0.4)' : '0 0 12px rgba(245, 158, 11, 0.35)') : 'none',
              letterSpacing: '0.04em',
              minWidth: '48px',
              textAlign: 'center',
            }}
            title="Shot Clock"
          >
            {isShotEnabled ? (shotSec < 10 ? `0${shotSec}` : shotSec) : '--'}
          </div>
        </div>

        {/* Away Info & Score - Score is RIGHT BESIDE Team Name */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px' }}>
          <div style={{ fontSize: '3.8rem', color: 'var(--led-red, #ff0000)', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 0.9 }}>
            {away.score}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.55rem', color: awayColor, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.1 }}>
              {away.config.name}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '3px' }}>
              <span style={{ fontSize: '1.1rem', color: '#cbd5e1', fontWeight: 800 }}>
                TO: <strong style={{ color: '#ffcc00', fontSize: '1.3rem', fontWeight: 900 }}>{away.timeouts.fullRemaining}</strong>
              </span>
              <span style={{ fontSize: '1.1rem', color: '#cbd5e1', fontWeight: 800 }}>
                F: <strong style={{ color: '#ff4a4a', fontSize: '1.3rem', fontWeight: 900 }}>{away.fouls}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN 3-COLUMN PLAY AREA: HOME | CENTER CONSOLE | AWAY ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1.15fr 1.2fr',
          gap: '8px',
          flex: '1 1 0',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* ══════════ LEFT COLUMN: HOME CARD ══════════ */}
        <div
          style={{
            background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
            padding: '8px 10px',
            borderRadius: '12px',
            border: '1.5px solid #2a3447',
            borderTop: `3.5px solid ${homeColor}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {/* Roster Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingBottom: '2px' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: homeColor, letterSpacing: '0.06em' }}>🏀 HOME ROSTER</span>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>
              {home.players.filter(p => p.active).length} Active on Floor
            </span>
          </div>

          {/* Side-by-Side: Players on Left (155px) | Controls on Right (1fr) */}
          <div style={{ display: 'grid', gridTemplateColumns: '155px 1fr', gap: '8px', flex: '1 1 0', minHeight: 0 }}>
            {/* Players Roster Column */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                flex: '1 1 0',
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarWidth: 'thin',
                scrollbarColor: `${homeColor} #1a2030`,
                paddingRight: '2px',
              }}
            >
              {homeDisplayPlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'home', id: p.id })}
                  style={{
                    padding: '6px 8px',
                    flex: '1 1 0',
                    minHeight: '70px',
                    background: selectedPlayer?.id === p.id ? 'var(--btn-amber, #78350f)' : '#182030',
                    color: p.fouledOut ? '#888' : '#fff',
                    border: selectedPlayer?.id === p.id ? '2px solid #ffd700' : '1px solid #2d3748',
                    borderRadius: '8px',
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    opacity: p.fouledOut ? 0.5 : 1,
                    touchAction: 'manipulation',
                    userSelect: 'none',
                    boxShadow: selectedPlayer?.id === p.id ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
                  }}
                  disabled={p.fouledOut}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Basketball jersey with number */}
                    <div style={{ width: '42px', height: '52px', flexShrink: 0 }}>
                      <JerseyWithNumber src={JERSEYS.basketball.home} number={p.number} />
                    </div>
                    
                    {/* Player Name */}
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    </div>
                  </div>

                  {/* Stats Table */}
                  <PlayerStatsTable points={p.points} fouls={p.fouls} foulLabel="FOU" warnAt={4} dangerAt={5} />
                </button>
              ))}

              {homeDisplayPlayers.length === 0 && (
                <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <button
                    onClick={() => handleQuickAddStartingFive('home')}
                    style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
                  >
                    + Load Starting 5
                  </button>
                </div>
              )}
            </div>

            {/* Controls Column: Target Player Bar, Points (+3,+2,+1,-1), Actions (+FL,+REB,+STL,+FGM), Special (-FL,+AST,+BLK,TIMEOUT) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 0', minHeight: 0 }}>
              {/* Target Player Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0d131f',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '0.78rem',
                flexShrink: 0,
                minHeight: '26px',
              }}>
                <span style={{ fontWeight: 800, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  🎯 {selectedPlayer?.team === 'home'
                    ? `#${home.players.find(p => p.id === selectedPlayer.id)?.number} ${home.players.find(p => p.id === selectedPlayer.id)?.name}`
                    : (homeDisplayPlayers[0] ? `#${homeDisplayPlayers[0].number} ${homeDisplayPlayers[0].name} (Tap player to change)` : 'Select Player')}
                </span>
                {selectedPlayer?.team === 'home' && (
                  <button
                    onClick={() => setSelectedPlayer(null)}
                    style={{ background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}
                    title="Clear selected player"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 4-Row x 3-Col Grid: Points (Col 1) | Actions (Col 2) | Defense & Timeout (Col 3) - WIDE RECTANGLES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', gap: '6px', flex: '1 1 0', minHeight: 0 }}>
                {/* Row 1: +3 | +FL | −FL */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                    color: '#fff',
                    border: '2px solid #34d399',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  }}
                  onClick={() => handleAddPoints('home', 3)}
                  title="Add 3 Points Home"
                >
                  🏀 +3
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                    color: '#fff',
                    border: '1.5px solid #ef4444',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'home', playerId: targetId })
                  }}
                  title="Add Foul"
                >
                  🚫 +FL
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #64748b 0%, #475569 100%)',
                    color: '#fff',
                    border: '1.5px solid #94a3b8',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'home', playerId: targetId })
                  }}
                  disabled={(home.players.find(p => p.id === (selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id))?.fouls ?? 0) <= 0}
                  title="Subtract Foul"
                >
                  ↩️ −FL
                </button>

                {/* Row 2: +2 | +REB | +AST */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                    color: '#fff',
                    border: '2px solid #34d399',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  }}
                  onClick={() => handleAddPoints('home', 2)}
                  title="Add 2 Points Home"
                >
                  🏀 +2
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#fff',
                    border: '1.5px solid #3b82f6',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) {
                      sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: targetId, stat: 'rebounds' })
                      // Defensive rebound = got the ball from opponent = change possession + reset shot clock
                      if (possession !== 'home') {
                        sendCommand({ type: 'SET_POSSESSION', team: 'home' })
                        sendCommand({ type: 'RESET_SHOT_CLOCK' })
                      }
                      // Offensive rebound = same team kept the ball = no change
                    }
                  }}
                  title="Add Rebound"
                >
                  🔄 +REB
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                    color: '#fff',
                    border: '1.5px solid #60a5fa',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: targetId, stat: 'assists' })
                  }}
                  title="Add Assist"
                >
                  🤝 +AST
                </button>

                {/* Row 3: +1 | +STL | +BLK */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    border: '2px solid #34d399',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  }}
                  onClick={() => handleAddPoints('home', 1)}
                  title="Add 1 Point Home"
                >
                  🏀 +1
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #d97706 0%, #b45309 100%)',
                    color: '#fff',
                    border: '1.5px solid #f59e0b',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) {
                      sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: targetId, stat: 'steals' })
                      // Steal = took the ball from opponent = change possession + reset shot clock
                      sendCommand({ type: 'SET_POSSESSION', team: 'home' })
                      sendCommand({ type: 'RESET_SHOT_CLOCK' })
                    }
                  }}
                  title="Add Steal"
                >
                  ⚡ +STL
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
                    color: '#fff',
                    border: '1.5px solid #fbbf24',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: targetId, stat: 'blocks' })
                  }}
                  title="Add Block"
                >
                  🛡️ +BLK
                </button>

                {/* Row 4: −1 | +FGM | ⏸ TIMEOUT */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)',
                    color: '#fff',
                    border: '2px solid #f87171',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(185, 28, 28, 0.35)',
                  }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'home' })}
                  disabled={home.score <= 0}
                  title="Minus 1 Home Score"
                >
                  🏀 −1
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                    color: '#fff',
                    border: '1.5px solid #ef4444',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: targetId, stat: 'fga' })
                  }}
                  title="Missed Field Goal (2pt/3pt miss - FGA only)"
                >
                  ✖️ MISS FG
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)',
                    color: '#fff',
                    border: '1.5px solid #dc2626',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(185, 28, 28, 0.35)',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'home' ? selectedPlayer.id : homeDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: targetId, stat: 'fta' })
                  }}
                  title="Missed Free Throw (1pt miss - FTA only)"
                >
                  ✖️ MISS FT
                </button>
              </div>

              {/* Row 5: TIMEOUT (full width spanning 3 columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', flex: '0 0 auto', minHeight: '50px', maxHeight: '60px' }}>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: home.timeouts.fullRemaining <= 0 ? '#1e293b' : 'linear-gradient(180deg, #7c3aed 0%, #581c87 100%)',
                    color: '#fff',
                    border: home.timeouts.fullRemaining <= 0 ? '1.5px solid #475569' : '2px solid #a855f7',
                    borderRadius: '8px',
                    fontSize: '0.92rem',
                    fontWeight: 900,
                    cursor: home.timeouts.fullRemaining <= 0 ? 'not-allowed' : 'pointer',
                    touchAction: 'manipulation',
                    boxShadow: home.timeouts.fullRemaining > 0 ? '0 0 14px rgba(168,85,247,0.45)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    padding: '2px',
                  }}
                  onClick={() => {
                    playBuzzerSound()
                    relayBuzzerService.triggerBuzzer('MANUAL')
                    sendCommand({ type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
                    sendCommand({ type: 'START_TIMEOUT', team: 'home' })
                  }}
                  disabled={home.timeouts.fullRemaining <= 0}
                  title="Call Home Timeout"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontSize: '1rem' }}>⏸</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 900 }}>TO</span>
                  </div>
                  <span style={{
                    fontSize: '0.78rem',
                    color: '#ffd700',
                    fontWeight: 900,
                    background: 'rgba(0,0,0,0.5)',
                    padding: '1px 8px',
                    borderRadius: '4px',
                  }}>
                    {home.timeouts.fullRemaining} REM
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════ CENTER COLUMN: CONTROLS CONSOLE (100% FILLED, ZERO EMPTY GAPS) ══════════ */}
        <div
          style={{
            background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
            padding: '8px',
            borderRadius: '12px',
            border: '1.5px solid #2a3447',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            overflow: 'hidden',
            minHeight: 0,
            flex: '1.15 1 0',
          }}
        >
          {/* Row 1: Modern Shot Clock Controls Module (SA TAAS SA GITNA NG STOP BUTTON) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.3fr 1fr',
              gap: '6px',
              flex: '1.25 1 0',
              minHeight: '52px',
              background: '#0d131f',
              padding: '4px 6px',
              borderRadius: '10px',
              border: '1.5px solid #1e293b',
              alignItems: 'center',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            {/* Col 1 (above START): 24s & 14s Quick Reset Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', height: '100%' }}>
              <button
                className="btn"
                style={{
                  height: '100%',
                  background: 'linear-gradient(180deg, #1e3a8a 0%, #172554 100%)',
                  color: '#fff',
                  border: '1.5px solid #3b82f6',
                  borderRadius: '8px',
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                }}
                onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_DURATION', seconds: 24 })}
                title="Set Shot Clock to 24s"
              >
                <span>24s</span>
                <span style={{ fontSize: '0.62rem', color: '#93c5fd', fontWeight: 700 }}>RESET</span>
              </button>
              <button
                className="btn"
                style={{
                  height: '100%',
                  background: 'linear-gradient(180deg, #1e3a8a 0%, #172554 100%)',
                  color: '#fff',
                  border: '1.5px solid #3b82f6',
                  borderRadius: '8px',
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                }}
                onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_DURATION', seconds: 14 })}
                title="Set Shot Clock to 14s (Offensive Rebound)"
              >
                <span>14s</span>
                <span style={{ fontSize: '0.62rem', color: '#93c5fd', fontWeight: 700 }}>OFF. REB</span>
              </button>
            </div>

            {/* Col 2 (CENTER, REPLACES SHOT CLOCK): Dual POSS (Home & Away) Toggle Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', height: '100%' }}>
              <button
                className="btn"
                style={{
                  height: '100%',
                  background: possession === 'home' ? 'linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%)' : '#1e293b',
                  color: '#fff',
                  border: possession === 'home' ? '2px solid #60a5fa' : '1.5px solid #475569',
                  borderRadius: '8px',
                  fontSize: '0.98rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  boxShadow: possession === 'home' ? '0 0 14px rgba(59, 130, 246, 0.5)' : 'none',
                }}
                onClick={() => sendCommand({ type: 'SET_POSSESSION', team: possession === 'home' ? null : 'home' })}
                title="Toggle Home Possession"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ fontSize: '1.1rem' }}>◀</span>
                  <span>POSS</span>
                </div>
                <span style={{ fontSize: '0.66rem', color: possession === 'home' ? '#93c5fd' : '#64748b', fontWeight: 800 }}>
                  {possession === 'home' ? 'HOME' : 'OFF'}
                </span>
              </button>

              <button
                className="btn"
                style={{
                  height: '100%',
                  background: possession === 'away' ? 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)' : '#1e293b',
                  color: '#fff',
                  border: possession === 'away' ? '2px solid #f87171' : '1.5px solid #475569',
                  borderRadius: '8px',
                  fontSize: '0.98rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  boxShadow: possession === 'away' ? '0 0 14px rgba(239, 68, 68, 0.5)' : 'none',
                }}
                onClick={() => sendCommand({ type: 'SET_POSSESSION', team: possession === 'away' ? null : 'away' })}
                title="Toggle Away Possession"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>POSS</span>
                  <span style={{ fontSize: '1.1rem' }}>▶</span>
                </div>
                <span style={{ fontSize: '0.66rem', color: possession === 'away' ? '#fca5a5' : '#64748b', fontWeight: 800 }}>
                  {possession === 'away' ? 'AWAY' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Col 3 (above RESET): Reload & ON/OFF Toggle Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', height: '100%' }}>
              <button
                className="btn"
                style={{
                  height: '100%',
                  background: 'linear-gradient(180deg, #6b21a8 0%, #4c1d95 100%)',
                  color: '#fff',
                  border: '1.5px solid #a855f7',
                  borderRadius: '8px',
                  fontSize: '0.98rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.3)',
                }}
                onClick={() => sendCommand({ type: 'RESET_SHOT_CLOCK' })}
                title="Reset Shot Clock to default"
              >
                <span>↺ SHOT</span>
                <span style={{ fontSize: '0.62rem', color: '#d8b4fe', fontWeight: 700 }}>RELOAD</span>
              </button>
              <button
                className="btn"
                style={{
                  height: '100%',
                  background: isShotEnabled
                    ? 'linear-gradient(180deg, #059669 0%, #064e3b 100%)'
                    : 'linear-gradient(180deg, #475569 0%, #1e293b 100%)',
                  color: '#fff',
                  border: isShotEnabled ? '1.5px solid #34d399' : '1.5px solid #64748b',
                  borderRadius: '8px',
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isShotEnabled ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                }}
                onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_ENABLED', enabled: !isShotEnabled })}
                title={isShotEnabled ? 'Disable Shot Clock' : 'Enable Shot Clock'}
              >
                <span>{isShotEnabled ? '⚡ ON' : '⚪ OFF'}</span>
                <span style={{ fontSize: '0.62rem', color: isShotEnabled ? '#a7f3d0' : '#94a3b8', fontWeight: 700 }}>ENABLE</span>
              </button>
            </div>
          </div>

          {/* Row 2: Primary Game Clock Buttons (START / STOP / RESET - STOP IS DIRECTLY BELOW SHOT CLOCK) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '6px', flex: '1.2 1 0', minHeight: '46px' }}>
            <button
              className="btn"
              style={{
                height: '100%',
                background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                color: '#fff',
                border: '2px solid #34d399',
                borderRadius: '8px',
                fontWeight: 900,
                fontSize: '1.15rem',
                cursor: 'pointer',
                touchAction: 'manipulation',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
              onClick={() => {
                sendCommand({ type: 'START_GAME_CLOCK' })
                if (isShotEnabled) sendCommand({ type: 'START_SHOT_CLOCK' })
              }}
              disabled={gameClock.running}
            >
              ▶ START
            </button>
            <button
              className="btn"
              style={{
                height: '100%',
                background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
                color: '#fff',
                border: '2px solid #fca5a5',
                borderRadius: '8px',
                fontWeight: 900,
                fontSize: '1.15rem',
                cursor: 'pointer',
                touchAction: 'manipulation',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
              onClick={() => {
                sendCommand({ type: 'STOP_GAME_CLOCK' })
                sendCommand({ type: 'STOP_SHOT_CLOCK' })
              }}
              disabled={!gameClock.running}
            >
              ⏸ STOP
            </button>
            <button
              className="btn"
              style={{
                height: '100%',
                background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)',
                color: '#fff',
                border: '2px solid #fbbf24',
                borderRadius: '8px',
                fontWeight: 900,
                fontSize: '1.05rem',
                cursor: 'pointer',
                touchAction: 'manipulation',
                boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
              onClick={() => {
                sendCommand({ type: 'RESET_GAME_CLOCK' })
                setTimeout(() => {
                  timeInputRef.current?.focus()
                  timeInputRef.current?.select()
                }, 50)
              }}
            >
              ↺ RESET
            </button>
          </div>

          {/* Row 3: Direct Time Editor */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '6px', flex: '0.9 1 0', minHeight: '40px' }}>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: '#94a3b8', fontWeight: 800, whiteSpace: 'nowrap', paddingLeft: '4px' }}>
              SET CLOCK:
            </span>
            <input
              ref={timeInputRef}
              id="game-clock-time-input"
              type="text"
              placeholder="10:00"
              value={timeEditInput}
              onChange={(e) => setTimeEditInput(e.target.value)}
              onClick={(e) => {
                e.currentTarget.focus()
                ;(e.target as HTMLInputElement).select()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyTimeEdit()
              }}
              style={{
                width: '120px',
                height: '100%',
                padding: '2px 8px',
                background: '#030712',
                color: '#38bdf8',
                border: '1.5px solid #38bdf8',
                borderRadius: '7px',
                fontSize: '1.35rem',
                fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)',
                fontWeight: 900,
                textAlign: 'center',
                letterSpacing: '0.08em',
                outline: 'none',
                cursor: 'text',
                touchAction: 'manipulation',
                boxSizing: 'border-box',
              }}
              title="Type MM:SS (e.g. 10:00, 12:00, 5:00)"
            />
            <button
              type="button"
              style={{
                flex: 1,
                height: '100%',
                padding: '0 14px',
                background: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: '1.5px solid #38bdf8',
                borderRadius: '7px',
                fontWeight: 900,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                touchAction: 'manipulation',
              }}
              onClick={() => handleApplyTimeEdit()}
              title="Apply entered time"
            >
              ⏱ Set Time
            </button>
          </div>

          {/* Row 5: Action Controls (4x2 Grid, 100% Filled, ZERO Gap) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: '5px', flex: '2.8 1 0', minHeight: 0 }}>
            <button
              className="btn"
              style={{
                height: '100%',
                minHeight: '38px',
                padding: '2px',
                background: controlsLocked ? 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)' : '#1e293b',
                color: controlsLocked ? '#ffffff' : '#4ade80',
                border: controlsLocked ? '2px solid #f87171' : '1.5px solid #22c55e',
                borderRadius: '7px',
                fontSize: '0.92rem',
                fontWeight: 900,
                cursor: 'pointer',
                touchAction: 'manipulation',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                boxShadow: controlsLocked ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none',
              }}
              onClick={() => setControlsLocked(!controlsLocked)}
              title={controlsLocked ? 'Click to Unlock Control Panel' : 'Click to Lock Control Panel against accidental touches'}
            >
              {controlsLocked ? '🔒 LOCKED' : '🔒 LOCK'}
            </button>

            <button
              className="btn"
              style={{ height: '100%', minHeight: '38px', padding: '2px', background: '#6b3fa0', color: '#fff', border: '1.5px solid #8550c0', borderRadius: '7px', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
              onClick={() => sendCommand({ type: 'ADVANCE_PERIOD' })}
            >
              ⏭ NEXT Q
            </button>

            <button
              className="btn"
              style={{ height: '100%', minHeight: '38px', padding: '2px', background: 'linear-gradient(180deg, #f43f5e 0%, #be123c 100%)', color: '#fff', border: '1.5px solid #fda4af', borderRadius: '7px', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
              onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
            >
              ⇄ SWITCH
            </button>

            <button
              className="btn"
              style={{ height: '100%', minHeight: '38px', padding: '2px', background: 'linear-gradient(180deg, #78350f 0%, #451a03 100%)', color: '#fbbf24', border: '1.5px solid #f59e0b', borderRadius: '7px', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
              disabled={!canUndo}
              title={canUndo ? `Undo last action: ${undoDesc}` : 'Nothing to undo'}
              onClick={() => sendCommand({ type: 'UNDO' })}
            >
              ↶ UNDO
            </button>

            <button
              className="btn"
              style={{ height: '100%', minHeight: '38px', padding: '2px', background: 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)', color: '#fff', border: '1.5px solid #a78bfa', borderRadius: '7px', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
              onClick={() => onTabChange('BOXSCORE')}
              title="View Player Statistics & Export"
            >
              📊 STATS
            </button>

            <button
              className="btn"
              style={{ height: '100%', minHeight: '38px', padding: '2px', background: '#2d3748', color: '#fff', border: '1.5px solid #4a5568', borderRadius: '7px', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
              onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}
              title="Open Main Scoreboard TV Display"
            >
              📺 TV
            </button>

            <button
              className="btn"
              style={{ height: '100%', minHeight: '38px', padding: '2px', background: '#047857', color: '#fff', border: '1.5px solid #10b981', borderRadius: '7px', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
              onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SHOTCLOCK' })}
              title="Open Shot Clock TV Display"
            >
              ⏱ SHOT TV
            </button>

            <button
              className="btn"
              style={{ height: '100%', minHeight: '38px', padding: '2px', background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff', border: '1.5px solid #f87171', borderRadius: '7px', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
              onClick={handleResetAll}
              title="Reset Game"
            >
              🔄 RESET
            </button>
          </div>

          {/* Row 6: Real-Time Relay & Buzzer Action Bar (Clean Grid, No Text Overflow) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr 0.9fr 1fr 1fr',
              alignItems: 'center',
              gap: '5px',
              width: '100%',
              padding: '2px 6px',
              flex: '0.85 1 0',
              minHeight: '34px',
              background: relayState.isBuzzing ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.04)',
              borderRadius: '7px',
              border: relayState.isBuzzing ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 4px', whiteSpace: 'nowrap' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: (relayState.connected || relayState.bridgeConnected) ? '#10b981' : '#64748b',
                boxShadow: (relayState.connected || relayState.bridgeConnected) ? '0 0 6px #10b981' : 'none',
                flexShrink: 0,
              }} />
              <span style={{ color: relayState.isBuzzing ? '#f87171' : '#cbd5e1', fontWeight: 800, fontSize: '0.76rem' }}>
                {relayState.isBuzzing ? 'BUZZING' : (relayState.connected || relayState.bridgeConnected) ? 'Relay OK' : 'Standby'}
              </span>
            </div>

            <button
              type="button"
              className="btn"
              style={{
                height: '100%',
                maxHeight: '30px',
                padding: '0 4px',
                background: (relayState.connected || relayState.bridgeConnected) ? '#064e3b' : '#0369a1',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '5px',
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
                touchAction: 'manipulation',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onClick={() => {
                if (!relayState.connected && !relayState.bridgeConnected) {
                  relayBuzzerService.connect().catch(() => {})
                } else {
                  relayBuzzerService.disconnect().catch(() => {})
                }
              }}
            >
              {(relayState.connected || relayState.bridgeConnected) ? '🔌 DISCONN' : '🔌 USB'}
            </button>

            <button
              type="button"
              className="btn"
              style={{
                height: '100%',
                maxHeight: '30px',
                padding: '0 4px',
                background: (relayBuzzerService.getConfig().polarity || relayBuzzerService.getConfig().wiringMode) === 'NO' ? '#78350f' : '#450a0a',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '5px',
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
                touchAction: 'manipulation',
                whiteSpace: 'nowrap',
              }}
              onClick={() => {
                const cur = relayBuzzerService.getConfig().polarity || relayBuzzerService.getConfig().wiringMode || 'NC'
                const next = cur === 'NC' ? 'NO' : 'NC'
                relayBuzzerService.saveConfig({ wiringMode: next, polarity: next })
              }}
              title="Toggle Relay Polarity Mode (Normally Closed vs Normally Open)"
            >
              MODE: {relayBuzzerService.getConfig().polarity || relayBuzzerService.getConfig().wiringMode || 'NC'}
            </button>

            <button
              type="button"
              className="btn"
              style={{
                height: '100%',
                maxHeight: '30px',
                padding: '0 6px',
                background: 'linear-gradient(180deg, #ea580c 0%, #c2410c 100%)',
                color: '#fff',
                border: '1px solid #fb923c',
                borderRadius: '5px',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                touchAction: 'manipulation',
                whiteSpace: 'nowrap',
              }}
              onClick={() => {
                playBuzzerSound()
                relayBuzzerService.triggerManual(1500)
              }}
            >
              ⚡ BUZZER
            </button>

            <button
              type="button"
              className="btn"
              style={{
                height: '100%',
                maxHeight: '30px',
                padding: '0 6px',
                background: 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)',
                color: '#fff',
                border: '1px solid #fbbf24',
                borderRadius: '5px',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                touchAction: 'manipulation',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.4)',
              }}
              onClick={() => playAttackSound()}
              title="Play Attack Sound (NBA Sound)"
            >
              🔊 ATTACK
            </button>
          </div>
        </div>

        {/* ══════════ RIGHT COLUMN: AWAY CARD (CONTROLS ON LEFT, PLAYERS ON RIGHT!) ══════════ */}
        <div
          style={{
            background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
            padding: '8px 10px',
            borderRadius: '12px',
            border: '1.5px solid #2a3447',
            borderTop: `3.5px solid ${awayColor}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {/* Roster Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingBottom: '2px' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>
              {away.players.filter(p => p.active).length} Active on Floor
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: awayColor, letterSpacing: '0.06em' }}>🏀 AWAY ROSTER</span>
          </div>

          {/* Side-by-Side: Controls on Left (1fr) | Players on Right (155px) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 155px', gap: '8px', flex: '1 1 0', minHeight: 0 }}>
            {/* Controls Column: Target Player Bar, Points (+3,+2,+1,-1), Actions (+FL,+REB,+STL,+FGM), Special (-FL,+AST,+BLK,TIMEOUT) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 0', minHeight: 0 }}>
              {/* Target Player Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0d131f',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '0.78rem',
                flexShrink: 0,
                minHeight: '26px',
              }}>
                <span style={{ fontWeight: 800, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  🎯 {selectedPlayer?.team === 'away'
                    ? `#${away.players.find(p => p.id === selectedPlayer.id)?.number} ${away.players.find(p => p.id === selectedPlayer.id)?.name}`
                    : (awayDisplayPlayers[0] ? `#${awayDisplayPlayers[0].number} ${awayDisplayPlayers[0].name} (Tap player to change)` : 'Select Player')}
                </span>
                {selectedPlayer?.team === 'away' && (
                  <button
                    onClick={() => setSelectedPlayer(null)}
                    style={{ background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}
                    title="Clear selected player"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 4-Row x 3-Col Grid: Points (Col 1) | Actions (Col 2) | Defense & Timeout (Col 3) - WIDE RECTANGLES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', gap: '6px', flex: '1 1 0', minHeight: 0 }}>
                {/* Row 1: +3 | +FL | −FL */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                    color: '#fff',
                    border: '2px solid #34d399',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  }}
                  onClick={() => handleAddPoints('away', 3)}
                  title="Add 3 Points Away"
                >
                  🏀 +3
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                    color: '#fff',
                    border: '1.5px solid #ef4444',
                    borderRadius: '8px',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'away', playerId: targetId })
                  }}
                  title="Add Foul"
                >
                  🚫 +FL
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #64748b 0%, #475569 100%)',
                    color: '#fca5a5',
                    border: '1.5px solid #94a3b8',
                    borderRadius: '8px',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'away', playerId: targetId })
                  }}
                  disabled={(away.players.find(p => p.id === (selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id))?.fouls ?? 0) <= 0}
                  title="Subtract Foul"
                >
                  ↩️ −FL
                </button>

                {/* Row 2: +2 | +REB | +AST */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                    color: '#fff',
                    border: '2px solid #34d399',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  }}
                  onClick={() => handleAddPoints('away', 2)}
                  title="Add 2 Points Away"
                >
                  🏀 +2
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#fff',
                    border: '1.5px solid #3b82f6',
                    borderRadius: '8px',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) {
                      sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: targetId, stat: 'rebounds' })
                      // Defensive rebound = got the ball from opponent = change possession + reset shot clock
                      if (possession !== 'away') {
                        sendCommand({ type: 'SET_POSSESSION', team: 'away' })
                        sendCommand({ type: 'RESET_SHOT_CLOCK' })
                      }
                      // Offensive rebound = same team kept the ball = no change
                    }
                  }}
                  title="Add Rebound"
                >
                  🔄 +REB
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                    color: '#fff',
                    border: '1.5px solid #60a5fa',
                    borderRadius: '8px',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: targetId, stat: 'assists' })
                  }}
                  title="Add Assist"
                >
                  🤝 +AST
                </button>

                {/* Row 3: +1 | +STL | +BLK */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    border: '2px solid #34d399',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  }}
                  onClick={() => handleAddPoints('away', 1)}
                  title="Add 1 Point Away"
                >
                  🏀 +1
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
                    color: '#fff',
                    border: '1.5px solid #fbbf24',
                    borderRadius: '8px',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) {
                      sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: targetId, stat: 'steals' })
                      // Steal = took the ball from opponent = change possession + reset shot clock
                      sendCommand({ type: 'SET_POSSESSION', team: 'away' })
                      sendCommand({ type: 'RESET_SHOT_CLOCK' })
                    }
                  }}
                  title="Add Steal"
                >
                  ⚡ +STL
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
                    color: '#fff',
                    border: '1.5px solid #fbbf24',
                    borderRadius: '8px',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: targetId, stat: 'blocks' })
                  }}
                  title="Add Block"
                >
                  🛡️ +BLK
                </button>

                {/* Row 4: −1 | +FGM | ⏸ TIMEOUT */}
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)',
                    color: '#fff',
                    border: '2px solid #f87171',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(185, 28, 28, 0.35)',
                  }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'away' })}
                  disabled={away.score <= 0}
                  title="Minus 1 Away Score"
                >
                  🏀 −1
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                    color: '#fff',
                    border: '1.5px solid #ef4444',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.35)',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: targetId, stat: 'fga' })
                  }}
                  title="Missed Field Goal (2pt/3pt) - adds FGA only"
                >
                  ❌ MISS FG
                </button>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                    color: '#fff',
                    border: '1.5px solid #ef4444',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.35)',
                  }}
                  onClick={() => {
                    const targetId = selectedPlayer?.team === 'away' ? selectedPlayer.id : awayDisplayPlayers[0]?.id
                    if (targetId) sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: targetId, stat: 'fta' })
                  }}
                  title="Missed Free Throw - adds FTA only"
                >
                  ❌ MISS FT
                </button>
              </div>

              {/* Row 5: TIMEOUT */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                <button
                  className="btn"
                  style={{
                    height: '100%',
                    background: away.timeouts.fullRemaining <= 0 ? '#1e293b' : 'linear-gradient(180deg, #7c3aed 0%, #581c87 100%)',
                    color: '#fff',
                    border: away.timeouts.fullRemaining <= 0 ? '1.5px solid #475569' : '2px solid #a855f7',
                    borderRadius: '8px',
                    fontSize: '0.92rem',
                    fontWeight: 900,
                    cursor: away.timeouts.fullRemaining <= 0 ? 'not-allowed' : 'pointer',
                    touchAction: 'manipulation',
                    boxShadow: away.timeouts.fullRemaining > 0 ? '0 0 14px rgba(168,85,247,0.45)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    padding: '2px',
                  }}
                  onClick={() => {
                    playBuzzerSound()
                    relayBuzzerService.triggerBuzzer('MANUAL')
                    sendCommand({ type: 'USE_TIMEOUT', team: 'away', kind: 'full' })
                    sendCommand({ type: 'START_TIMEOUT', team: 'away' })
                  }}
                  disabled={away.timeouts.fullRemaining <= 0}
                  title="Call Away Timeout"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontSize: '1rem' }}>⏸</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 900 }}>TO</span>
                  </div>
                  <span style={{
                    fontSize: '0.78rem',
                    color: '#ffd700',
                    fontWeight: 900,
                    background: 'rgba(0,0,0,0.5)',
                    padding: '1px 8px',
                    borderRadius: '4px',
                  }}>
                    {away.timeouts.fullRemaining} REM
                  </span>
                </button>
              </div>
            </div>

            {/* Players Roster Column (ON THE RIGHT SIDE OF AWAY!) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                flex: '1 1 0',
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarWidth: 'thin',
                scrollbarColor: `${awayColor} #1a2030`,
                paddingRight: '2px',
              }}
            >
              {awayDisplayPlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'away', id: p.id })}
                  style={{
                    padding: '6px 8px',
                    flex: '1 1 0',
                    minHeight: '70px',
                    background: selectedPlayer?.id === p.id ? 'var(--btn-amber, #78350f)' : '#182030',
                    color: p.fouledOut ? '#888' : '#fff',
                    border: selectedPlayer?.id === p.id ? '2px solid #ffd700' : '1px solid #2d3748',
                    borderRadius: '8px',
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    opacity: p.fouledOut ? 0.5 : 1,
                    touchAction: 'manipulation',
                    userSelect: 'none',
                    boxShadow: selectedPlayer?.id === p.id ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
                  }}
                  disabled={p.fouledOut}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Basketball jersey with number */}
                    <div style={{ width: '42px', height: '52px', flexShrink: 0 }}>
                      <JerseyWithNumber src={JERSEYS.basketball.away} number={p.number} />
                    </div>
                    
                    {/* Player Name */}
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    </div>
                  </div>

                  {/* Stats Table */}
                  <PlayerStatsTable points={p.points} fouls={p.fouls} foulLabel="FOU" warnAt={4} dangerAt={5} />
                </button>
              ))}

              {awayDisplayPlayers.length === 0 && (
                <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <button
                    onClick={() => handleQuickAddStartingFive('away')}
                    style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
                  >
                    + Load Starting 5
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── CUSTOM IN-APP RESET ALL CONFIRMATION MODAL ── */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
            pointerEvents: 'auto',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowResetModal(false)
            }
          }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #182030 0%, #0d121c 100%)',
              border: '2px solid #ef4444',
              borderRadius: '14px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(239, 68, 68, 0.25)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              color: '#ffffff',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0,
                }}
              >
                ⚠️
              </div>
              <div style={{ flex: 1 }}>
                <h2
                  id="reset-modal-title"
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    color: '#f87171',
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  Reset Game to Start?
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Confirmation required for scoreboard reset
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: 1,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.84rem',
                color: '#cbd5e1',
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: '2px' }}>
                This will reset the following game statistics:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>●</span> Scores to <strong>0 - 0</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>●</span> Fouls to <strong>0 - 0</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>●</span> Period back to <strong>1</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>●</span> Timeouts restored
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', gridColumn: 'span 2' }}>
                  <span style={{ color: '#38bdf8' }}>●</span> Game &amp; Shot Clock to <strong>start duration</strong>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', padding: '0 4px' }}>
              Note: Team names, players, rosters, and configured settings will remain saved.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                style={{
                  padding: '9px 18px',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  borderRadius: '7px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕ Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmResetAll()}
                style={{
                  padding: '9px 20px',
                  background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)',
                  color: '#ffffff',
                  border: '1px solid #f87171',
                  borderRadius: '7px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                🔄 Yes, Reset All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScoreTab
