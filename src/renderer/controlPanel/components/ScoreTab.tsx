import React, { useState, useEffect, useRef } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { formatClockDisplay } from '@renderer/shared/clockUtils'
import type { Player } from '@shared/types'
import { relayBuzzerService, type RelayBuzzerState } from '../hardware/relayBuzzerService'
import sponsorLogo from '../../../../pictures/white.png'

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

  const handleAdjustMinutes = (deltaMinutes: number) => {
    const currentSeconds = Math.floor(gameClock.displayMs / 1000)
    const newSeconds = Math.max(0, currentSeconds + deltaMinutes * 60)
    if (gameClock.running) {
      sendCommand({ type: 'STOP_GAME_CLOCK' })
      sendCommand({ type: 'STOP_SHOT_CLOCK' })
    }
    sendCommand({ type: 'SET_GAME_CLOCK', seconds: newSeconds })
  }

  const handleResetAll = () => {
    setShowResetModal(true)
  }

  const confirmResetAll = async () => {
    setShowResetModal(false)
    try {
      // 1. Stop all clocks immediately
      sendCommand({ type: 'STOP_GAME_CLOCK' })
      sendCommand({ type: 'STOP_SHOT_CLOCK' })

      // 2. Reset game state based on sport
      if (gs.sport === 'volleyball') {
        sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })
      } else {
        // Send NEW_GAME with forceReset: true to bypass save prompt
        sendCommand({ type: 'NEW_GAME', clearTeams: false, forceReset: true })
        // Also call query NEW_GAME_CONFIRMED to guarantee immediate dispatch
        await window.electron.ipcRenderer.invoke('scoreboard:query', {
          type: 'NEW_GAME_CONFIRMED',
          clearTeams: false,
        }).catch(() => {})
      }

      // 3. Reset game clock and shot clock to configured full durations
      sendCommand({ type: 'RESET_GAME_CLOCK' })
      sendCommand({ type: 'RESET_SHOT_CLOCK' })

      // 4. Reset any active buzzer
      if (relayBuzzerService.getState().isBuzzing) {
        relayBuzzerService.saveConfig({})
      }

      // 5. Explicitly focus the Set Time input box
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

  // Helper for points dispatch (if player selected, add to player; else add to team)
  const handleAddPoints = (team: 'home' | 'away', points: 1 | 2 | 3) => {
    if (selectedPlayer && selectedPlayer.team === team) {
      sendCommand({ type: 'ADD_PLAYER_POINTS', team, playerId: selectedPlayer.id, points })
    } else {
      sendCommand({ type: 'ADD_SCORE', team, points })
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

  // Auto-initialize 5 default players if team has no players
  useEffect(() => {
    if (home.players.length === 0) {
      handleQuickAddStartingFive('home')
    }
    if (away.players.length === 0) {
      handleQuickAddStartingFive('away')
    }
  }, [home.players.length, away.players.length])

  // Auto-activate first 5 players if none active
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

  return (
    <div
      className="bb-score-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: '100%',
        background: '#0a0d14',
        padding: '8px 12px 28px 12px',
        gap: '8px',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflowY: 'auto',
        overflowX: 'hidden',
        color: '#ffffff',
        scrollbarWidth: 'thin',
        scrollbarColor: '#f59e0b #161b26',
      }}
    >
      {/* ── TOP FITNESS EXCLUSIVE SPONSOR HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '36px', flexShrink: 0 }}>
        <img
          src={sponsorLogo}
          alt="Fitness Exclusive"
          style={{
            maxHeight: '100%',
            maxWidth: '380px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.8)) drop-shadow(0 0 25px rgba(200,220,255,0.4))'
          }}
        />
      </div>

      {/* ── BASKETBALL SPORT LABEL (BELOW LOGO) ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '22px', flexShrink: 0, marginTop: '-6px' }}>
        <div style={{ 
          fontSize: '0.95rem', 
          fontWeight: 900, 
          color: '#ff6600', 
          letterSpacing: '0.15em', 
          textTransform: 'uppercase',
          textShadow: '0 0 10px rgba(255,102,0,0.5), 0 0 20px rgba(255,102,0,0.3)'
        }}>
          🏀 BASKETBALL
        </div>
      </div>
      {/* ── TOP BANNER: HOME, CLOCK & PERIOD, AWAY (Flex 0.8) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '14px',
          padding: '8px 16px',
          background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
          borderRadius: '12px',
          border: '2px solid #2a3447',
          alignItems: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          flexShrink: 0,
        }}
      >
        {/* Home Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.25rem', color: home.config.color || '#4a9eff', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {home.config.name}
          </div>
          <div style={{ fontSize: '3.6rem', color: 'var(--led-red, #ff0000)', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 1 }}>
            {home.score}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#a0aec0', fontWeight: 700, display: 'flex', gap: '10px' }}>
            <span>Fouls: <strong style={{ color: '#ff4a4a' }}>{home.fouls}</strong></span>
            <span>TO: <strong style={{ color: '#ffcc00' }}>{home.timeouts.fullRemaining}</strong></span>
          </div>
        </div>

        {/* Center: Period & Game Clock Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                fontSize: '2rem',
                color: '#ffaa00',
                fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)',
                fontWeight: 900,
                background: '#04070d',
                padding: '4px 20px',
                borderRadius: '8px',
                border: '2px solid #ffaa00',
                lineHeight: 1.1,
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {period.isOvertime ? `OT${period.overtimeNumber}` : `Q${period.current}`}
            </div>
            <div
              style={{
                fontSize: '1.8rem',
                color: shotSec <= 5 ? '#ff3d00' : '#00ff66',
                fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)',
                fontWeight: 900,
                background: '#04070d',
                padding: '4px 18px',
                borderRadius: '8px',
                border: '2px solid #2a3447',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              SHOT: {shotSec}s
            </div>
          </div>

          {/* Touch Game Clock Control inline with direct time editor */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.6)', padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ fontSize: '2.8rem', color: gameClock.running ? '#00ff66' : '#ffaa00', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 1, letterSpacing: '0.08em' }}>
                {clockStr}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn"
                  style={{ height: '48px', minHeight: '48px', minWidth: '92px', padding: '0 18px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '2px solid #34d399', borderRadius: '8px', fontWeight: 900, fontSize: '1.05rem', cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => {
                    sendCommand({ type: 'START_GAME_CLOCK' })
                    if (isShotEnabled) sendCommand({ type: 'START_SHOT_CLOCK' })
                  }}
                  disabled={gameClock.running}
                >
                  Start
                </button>
                <button
                  className="btn"
                  style={{ height: '48px', minHeight: '48px', minWidth: '92px', padding: '0 18px', background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)', color: '#fff', border: '2px solid #fca5a5', borderRadius: '8px', fontWeight: 900, fontSize: '1.05rem', cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => {
                    sendCommand({ type: 'STOP_GAME_CLOCK' })
                    sendCommand({ type: 'STOP_SHOT_CLOCK' })
                  }}
                  disabled={!gameClock.running}
                >
                  Stop
                </button>
                <button
                  className="btn"
                  style={{ height: '48px', minHeight: '48px', minWidth: '92px', padding: '0 18px', background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)', color: '#fff', border: '2px solid #fbbf24', borderRadius: '8px', fontWeight: 900, fontSize: '1.05rem', cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => {
                    sendCommand({ type: 'RESET_GAME_CLOCK' })
                    setTimeout(() => {
                      timeInputRef.current?.focus()
                      timeInputRef.current?.select()
                    }, 50)
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Direct Edit Time Input & Quick Presets */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              background: 'rgba(15, 23, 42, 0.85)',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              userSelect: 'auto',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 10,
              boxSizing: 'border-box',
            }}>
              {/* Input Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', justifyContent: 'center' }}>
                <input
                  ref={timeInputRef}
                  id="game-clock-time-input"
                  type="text"
                  placeholder="10:00"
                  value={timeEditInput}
                  onChange={(e) => setTimeEditInput(e.target.value)}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    e.currentTarget.focus()
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation()
                    e.currentTarget.focus()
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    e.currentTarget.focus()
                  }}
                  onClick={(e) => {
                    e.currentTarget.focus()
                    ;(e.target as HTMLInputElement).select()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyTimeEdit()
                  }}
                  style={{
                    width: '140px',
                    height: '46px',
                    minHeight: '46px',
                    padding: '2px 10px',
                    background: '#030712',
                    color: '#38bdf8',
                    border: '2px solid #38bdf8',
                    borderRadius: '8px',
                    fontSize: '1.35rem',
                    fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)',
                    fontWeight: 900,
                    textAlign: 'center',
                    letterSpacing: '0.08em',
                    outline: 'none',
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8), 0 0 10px rgba(56, 189, 248, 0.25)',
                    cursor: 'text',
                    pointerEvents: 'auto',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                    touchAction: 'manipulation',
                  }}
                  title="Type MM:SS (e.g. 10:00, 12:00, 5:00) or minutes (e.g. 10, 12)"
                />
                <button
                  type="button"
                  style={{
                    height: '46px',
                    minHeight: '46px',
                    padding: '0 20px',
                    background: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: '2px solid #38bdf8',
                    borderRadius: '8px',
                    fontWeight: 900,
                    fontSize: '1.05rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 10px rgba(2, 132, 199, 0.45)',
                    touchAction: 'manipulation',
                  }}
                  onClick={() => handleApplyTimeEdit()}
                  title="Apply entered time to Game Clock"
                >
                  ⏱ Set Time
                </button>
              </div>

              {/* Quick Preset Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.88rem', color: '#94a3b8', fontWeight: 800, marginRight: '4px' }}>Quick:</span>
                {[
                  { label: '12m', sec: 720 },
                  { label: '10m', sec: 600 },
                  { label: '8m', sec: 480 },
                  { label: '5m', sec: 300 },
                  { label: '00:00', sec: 0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    style={{
                      height: '40px',
                      minHeight: '40px',
                      padding: '0 16px',
                      background: preset.sec === 0 ? '#450a0a' : '#1e293b',
                      color: preset.sec === 0 ? '#fca5a5' : '#e2e8f0',
                      border: preset.sec === 0 ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.22)',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                    onClick={() => {
                      if (gameClock.running) {
                        sendCommand({ type: 'STOP_GAME_CLOCK' })
                        sendCommand({ type: 'STOP_SHOT_CLOCK' })
                      }
                      sendCommand({ type: 'SET_GAME_CLOCK', seconds: preset.sec })
                    }}
                    title={`Set game clock to ${preset.label}`}
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  style={{
                    height: '40px',
                    minHeight: '40px',
                    padding: '0 16px',
                    background: '#1e293b',
                    color: '#34d399',
                    border: '2px solid rgba(52, 211, 153, 0.5)',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                  onClick={() => handleAdjustMinutes(1)}
                  title="Add 1 minute"
                >
                  +1m
                </button>
                <button
                  type="button"
                  style={{
                    height: '40px',
                    minHeight: '40px',
                    padding: '0 16px',
                    background: '#1e293b',
                    color: '#f87171',
                    border: '2px solid rgba(248, 113, 113, 0.5)',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                  onClick={() => handleAdjustMinutes(-1)}
                  title="Subtract 1 minute"
                >
                  -1m
                </button>
              </div>
            </div>

            {/* ── REAL-TIME RELAY & BUZZER ACTION BAR ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              width: '100%',
              marginTop: '4px',
              padding: '6px 12px',
              minHeight: '46px',
              background: relayState.isBuzzing ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255,255,255,0.04)',
              borderRadius: '8px',
              border: relayState.isBuzzing ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.12)',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
              transition: 'all 0.2s ease',
            }}>
              {/* Status Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: (relayState.connected || relayState.bridgeConnected) ? '#10b981' : '#64748b',
                  boxShadow: (relayState.connected || relayState.bridgeConnected) ? '0 0 10px #10b981' : 'none'
                }} />
                <span style={{
                  color: (relayState.connected || relayState.bridgeConnected) ? '#34d399' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  whiteSpace: 'nowrap'
                }}>
                  {relayState.connected
                    ? `USB: ${relayState.portInfo || 'Connected'}`
                    : (relayState.bridgeConnected ? `Vercel: Synced (${relayState.bridgeClientsCount})` : 'Relay: Standby')}
                </span>
              </div>

              {/* Action Buttons: Connect / Mode / Test */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {relayState.connected ? (
                  <button
                    type="button"
                    style={{
                      height: '38px',
                      minHeight: '38px',
                      padding: '0 14px',
                      background: '#1e293b',
                      color: '#f87171',
                      border: '1px solid #ef4444',
                      borderRadius: '6px',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                    onClick={() => relayBuzzerService.disconnect('Operator disconnected')}
                    title="Disconnect USB Relay port"
                  >
                    ✕ Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    style={{
                      height: '38px',
                      minHeight: '38px',
                      padding: '0 14px',
                      background: '#0f172a',
                      color: '#38bdf8',
                      border: '1px solid #38bdf8',
                      borderRadius: '6px',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                    onClick={() => relayBuzzerService.connect()}
                    title="Connect directly to physical USB Relay COM port in Scoreboard"
                  >
                    🔌 Connect USB
                  </button>
                )}

                {/* Wiring Mode Toggle: NO vs NC */}
                <button
                  type="button"
                  style={{
                    height: '38px',
                    minHeight: '38px',
                    padding: '0 14px',
                    background: relayState.config.wiringMode === 'NO' ? '#065f46' : '#7f1d1d',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                  onClick={() => {
                    const newMode = relayState.config.wiringMode === 'NO' ? 'NC' : 'NO'
                    relayBuzzerService.saveConfig({ wiringMode: newMode })
                  }}
                  title="Toggle between NO (Normally Open — Standard) and NC (Normally Closed — Inverted) wiring"
                >
                  Mode: {relayState.config.wiringMode}
                </button>

                {/* Test Buzzer Button */}
                <button
                  type="button"
                  style={{
                    height: '38px',
                    minHeight: '38px',
                    padding: '0 16px',
                    background: relayState.isBuzzing
                      ? 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)'
                      : 'linear-gradient(180deg, #f97316 0%, #c2410c 100%)',
                    color: '#fff',
                    border: '1px solid #fdba74',
                    borderRadius: '6px',
                    fontWeight: 900,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    boxShadow: relayState.isBuzzing ? '0 0 14px #ef4444' : 'none',
                    touchAction: 'manipulation',
                  }}
                  onClick={() => relayBuzzerService.pulse(3.0, 'MANUAL')}
                  title="Manually test physical buzzer relay (3.0 seconds)"
                >
                  {relayState.isBuzzing ? '🚨 BUZZING...' : '⚡ Test Buzzer'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Away Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.25rem', color: away.config.color || '#ff4a4a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {away.config.name}
          </div>
          <div style={{ fontSize: '3.6rem', color: 'var(--led-red, #ff0000)', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 1 }}>
            {away.score}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#a0aec0', fontWeight: 700, display: 'flex', gap: '10px' }}>
            <span>Fouls: <strong style={{ color: '#ff4a4a' }}>{away.fouls}</strong></span>
            <span>TO: <strong style={{ color: '#ffcc00' }}>{away.timeouts.fullRemaining}</strong></span>
          </div>
        </div>
      </div>

      {/* ── ROW 1.5: PLAYER SELECTION & STATS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: '1 1 auto', minHeight: '340px' }}>
        {/* Home Players */}
        <div style={{
          background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '2px solid #2a3447',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: '320px',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          scrollbarColor: '#fcd34d #161b26',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffcc00', letterSpacing: '0.08em' }}>🏀 HOME PLAYERS</span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 700 }}>
              {home.players.filter(p => p.active).length} Active on Floor
            </span>
          </div>

          <div style={{
            flex: selectedPlayer?.team === 'home' ? '0 0 auto' : 1,
            maxHeight: selectedPlayer?.team === 'home' ? '190px' : 'none',
            minHeight: selectedPlayer?.team === 'home' ? '130px' : '200px',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#ffcc00 #1a2030',
            paddingRight: '2px',
          }}>
            {homeDisplayPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'home', id: p.id })}
                style={{
                  padding: '10px 14px',
                  minHeight: '54px',
                  background: selectedPlayer?.id === p.id ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
                  color: p.fouledOut ? '#666' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2.5px solid #fcd34d' : '1.5px solid #3a4866',
                  borderRadius: '10px',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.4 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0,
                  boxShadow: selectedPlayer?.id === p.id ? '0 0 16px rgba(252,211,77,0.45)' : 'none',
                }}
                disabled={p.fouledOut}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    background: 'rgba(255, 204, 0, 0.22)',
                    color: '#ffcc00',
                    border: '1.5px solid rgba(255, 204, 0, 0.6)',
                    borderRadius: '8px',
                    padding: '3px 10px',
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    minWidth: '34px',
                    textAlign: 'center',
                  }}>
                    #{p.number}
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.02em' }}>{p.name} {p.fouledOut && '❌'}</span>
                </div>
                <div style={{
                  fontSize: '0.95rem',
                  fontWeight: 900,
                  padding: '4px 10px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.55)',
                  color: p.fouls >= 5 ? '#ff4444' : p.fouls >= 4 ? '#ffaa44' : '#4ade80',
                  display: 'flex',
                  gap: '8px',
                }}>
                  <span>{p.points} PTS</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{p.fouls} FL</span>
                </div>
              </button>
            ))}

            {homeDisplayPlayers.length === 0 && (
              <div style={{
                padding: '20px 14px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
                border: '1px dashed #3a4866',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'center',
              }}>
                <div style={{ color: '#94a3b8', fontSize: '0.95rem', fontWeight: 700 }}>
                  {home.players.length === 0 ? 'No players added yet for Home' : 'Players exist but none are active'}
                </div>
                {home.players.length === 0 ? (
                  <button
                    onClick={() => handleQuickAddStartingFive('home')}
                    style={{
                      padding: '8px 20px',
                      background: 'linear-gradient(180deg, #d97706 0%, #b45309 100%)',
                      color: '#fff',
                      border: '1px solid #fbbf24',
                      borderRadius: '8px',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                    }}
                  >
                    + Quick Load Starting 5
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivateAllPlayers('home')}
                    style={{
                      padding: '8px 20px',
                      background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                      color: '#fff',
                      border: '1px solid #34d399',
                      borderRadius: '8px',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                    }}
                  >
                    + Activate 5 Players
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Basketball Stats Buttons for Selected HOME Player */}
          {selectedPlayer?.team === 'home' && (
            <div style={{
              borderTop: '2px solid #2a3447',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
              background: 'rgba(12, 18, 28, 0.98)',
              borderRadius: '10px',
              border: '1.5px solid #3b4c68',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#ffcc00', color: '#000', padding: '2px 8px', borderRadius: '5px', fontWeight: 900, fontSize: '0.95rem' }}>
                    #{home.players.find(p => p.id === selectedPlayer.id)?.number}
                  </span>
                  <span style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 900 }}>
                    {home.players.find(p => p.id === selectedPlayer.id)?.name}
                  </span>
                  <span style={{ fontSize: '0.88rem', color: '#94a3b8', fontWeight: 700 }}>
                    ({home.players.find(p => p.id === selectedPlayer.id)?.points || 0}pts · {home.players.find(p => p.id === selectedPlayer.id)?.fouls || 0}fl · {home.players.find(p => p.id === selectedPlayer.id)?.rebounds || 0}reb · {home.players.find(p => p.id === selectedPlayer.id)?.assists || 0}ast · {home.players.find(p => p.id === selectedPlayer.id)?.steals || 0}stl · {home.players.find(p => p.id === selectedPlayer.id)?.blocks || 0}blk)
                  </span>
                </div>
                <button
                  style={{ padding: '6px 14px', background: '#374151', color: '#fff', border: '1px solid #6b7280', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)', color: '#fff', border: '1px solid #f87171', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: '#374151', color: '#fca5a5', border: '1px solid #4b5563', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}
                  disabled={(home.players.find(p => p.id === selectedPlayer.id)?.fouls ?? 0) <= 0}
                >
                  −FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '1px solid #34d399', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  +REB
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)', color: '#fff', border: '1px solid #60a5fa', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  +AST
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)', color: '#fff', border: '1px solid #fbbf24', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  +STL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)', color: '#fff', border: '1px solid #a78bfa', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  +BLK
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #64748b 0%, #334155 100%)', color: '#fff', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'fgm' })}
                >
                  +FGM
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Away Players */}
        <div style={{
          background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '2px solid #2a3447',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: '320px',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          scrollbarColor: '#fcd34d #161b26',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffcc00', letterSpacing: '0.08em' }}>🏀 AWAY PLAYERS</span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 700 }}>
              {away.players.filter(p => p.active).length} Active on Floor
            </span>
          </div>

          <div style={{
            flex: selectedPlayer?.team === 'away' ? '0 0 auto' : 1,
            maxHeight: selectedPlayer?.team === 'away' ? '190px' : 'none',
            minHeight: selectedPlayer?.team === 'away' ? '130px' : '200px',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#ffcc00 #1a2030',
            paddingRight: '2px',
          }}>
            {awayDisplayPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'away', id: p.id })}
                style={{
                  padding: '10px 14px',
                  minHeight: '54px',
                  background: selectedPlayer?.id === p.id ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
                  color: p.fouledOut ? '#666' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2.5px solid #fcd34d' : '1.5px solid #3a4866',
                  borderRadius: '10px',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.4 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0,
                  boxShadow: selectedPlayer?.id === p.id ? '0 0 16px rgba(252,211,77,0.45)' : 'none',
                }}
                disabled={p.fouledOut}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    background: 'rgba(255, 204, 0, 0.22)',
                    color: '#ffcc00',
                    border: '1.5px solid rgba(255, 204, 0, 0.6)',
                    borderRadius: '8px',
                    padding: '3px 10px',
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    minWidth: '34px',
                    textAlign: 'center',
                  }}>
                    #{p.number}
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.02em' }}>{p.name} {p.fouledOut && '❌'}</span>
                </div>
                <div style={{
                  fontSize: '0.95rem',
                  fontWeight: 900,
                  padding: '4px 10px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.55)',
                  color: p.fouls >= 5 ? '#ff4444' : p.fouls >= 4 ? '#ffaa44' : '#4ade80',
                  display: 'flex',
                  gap: '8px',
                }}>
                  <span>{p.points} PTS</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{p.fouls} FL</span>
                </div>
              </button>
            ))}

            {awayDisplayPlayers.length === 0 && (
              <div style={{
                padding: '20px 14px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
                border: '1px dashed #3a4866',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'center',
              }}>
                <div style={{ color: '#94a3b8', fontSize: '0.95rem', fontWeight: 700 }}>
                  {away.players.length === 0 ? 'No players added yet for Away' : 'Players exist but none are active'}
                </div>
                {away.players.length === 0 ? (
                  <button
                    onClick={() => handleQuickAddStartingFive('away')}
                    style={{
                      padding: '8px 20px',
                      background: 'linear-gradient(180deg, #d97706 0%, #b45309 100%)',
                      color: '#fff',
                      border: '1px solid #fbbf24',
                      borderRadius: '8px',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                    }}
                  >
                    + Quick Load Starting 5
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivateAllPlayers('away')}
                    style={{
                      padding: '8px 20px',
                      background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)',
                      color: '#fff',
                      border: '1px solid #34d399',
                      borderRadius: '8px',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                    }}
                  >
                    + Activate 5 Players
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Basketball Stats Buttons for Selected AWAY Player */}
          {selectedPlayer?.team === 'away' && (
            <div style={{
              borderTop: '2px solid #2a3447',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
              background: 'rgba(12, 18, 28, 0.98)',
              borderRadius: '10px',
              border: '1.5px solid #3b4c68',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#ffcc00', color: '#000', padding: '2px 8px', borderRadius: '5px', fontWeight: 900, fontSize: '0.95rem' }}>
                    #{away.players.find(p => p.id === selectedPlayer.id)?.number}
                  </span>
                  <span style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 900 }}>
                    {away.players.find(p => p.id === selectedPlayer.id)?.name}
                  </span>
                  <span style={{ fontSize: '0.88rem', color: '#94a3b8', fontWeight: 700 }}>
                    ({away.players.find(p => p.id === selectedPlayer.id)?.points || 0}pts · {away.players.find(p => p.id === selectedPlayer.id)?.fouls || 0}fl · {away.players.find(p => p.id === selectedPlayer.id)?.rebounds || 0}reb · {away.players.find(p => p.id === selectedPlayer.id)?.assists || 0}ast · {away.players.find(p => p.id === selectedPlayer.id)?.steals || 0}stl · {away.players.find(p => p.id === selectedPlayer.id)?.blocks || 0}blk)
                  </span>
                </div>
                <button
                  style={{ padding: '6px 14px', background: '#374151', color: '#fff', border: '1px solid #6b7280', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)', color: '#fff', border: '1px solid #f87171', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: '#374151', color: '#fca5a5', border: '1px solid #4b5563', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}
                  disabled={(away.players.find(p => p.id === selectedPlayer.id)?.fouls ?? 0) <= 0}
                >
                  −FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '1px solid #34d399', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  +REB
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)', color: '#fff', border: '1px solid #60a5fa', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  +AST
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)', color: '#fff', border: '1px solid #fbbf24', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  +STL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)', color: '#fff', border: '1px solid #a78bfa', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  +BLK
                </button>
                <button
                  style={{ padding: '6px 2px', height: '42px', minHeight: '42px', background: 'linear-gradient(180deg, #64748b 0%, #334155 100%)', color: '#fff', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'fgm' })}
                >
                  +FGM
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 2: TOUCH SCORE CONTROLS (+3, +2, +1, -1) & POSSESSION ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flexShrink: 0 }}>
        {/* Home Controls Box */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '8px 10px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', border: '2px solid #2a3447', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          <button
            className="btn"
            style={{
              height: '48px',
              minHeight: '48px',
              padding: '0 12px',
              background: possession === 'home' ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
              color: '#fff',
              border: possession === 'home' ? '2px solid #fcd34d' : '2px solid #3a4866',
              borderRadius: '10px',
              fontSize: '1.1rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: possession === 'home' ? '0 0 16px rgba(253,211,77,0.4)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onClick={() => sendCommand({ type: 'SET_POSSESSION', team: possession === 'home' ? null : 'home' })}
          >
            ◀ {possession === 'home' ? 'POSSESSION ON (HOME)' : 'HOME POSSESSION'}
          </button>

          <div style={{ display: 'flex', gap: '8px', height: '56px' }}>
            {/* Point Buttons +3, +2, +1 */}
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '2px solid #34d399', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('home', 3)}
            >
              +3
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '2px solid #34d399', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('home', 2)}
            >
              +2
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)', color: '#fff', border: '2px solid #fbbf24', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('home', 1)}
            >
              +1
            </button>

            {/* Minus 1 Point */}
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff', border: '2px solid #f87171', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'home' })}
              disabled={home.score <= 0}
              title="Minus 1 Home Score"
            >
              −1
            </button>
          </div>
        </div>

        {/* Away Controls Box */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '8px 10px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', border: '2px solid #2a3447', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          <button
            className="btn"
            style={{
              height: '48px',
              minHeight: '48px',
              padding: '0 12px',
              background: possession === 'away' ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
              color: '#fff',
              border: possession === 'away' ? '2px solid #fcd34d' : '2px solid #3a4866',
              borderRadius: '10px',
              fontSize: '1.1rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: possession === 'away' ? '0 0 16px rgba(253,211,77,0.4)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onClick={() => sendCommand({ type: 'SET_POSSESSION', team: possession === 'away' ? null : 'away' })}
          >
            {possession === 'away' ? 'POSSESSION ON (AWAY)' : 'AWAY POSSESSION'} ▶
          </button>

          <div style={{ display: 'flex', gap: '8px', height: '56px' }}>
            {/* Point Buttons +3, +2, +1 */}
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '2px solid #34d399', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('away', 3)}
            >
              +3
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '2px solid #34d399', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('away', 2)}
            >
              +2
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)', color: '#fff', border: '2px solid #fbbf24', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('away', 1)}
            >
              +1
            </button>

            {/* Minus 1 Point */}
            <button
              className="btn"
              style={{ flex: 1, height: '56px', minHeight: '56px', background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff', border: '2px solid #f87171', borderRadius: '10px', fontSize: '1.75rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'away' })}
              disabled={away.score <= 0}
              title="Minus 1 Away Score"
            >
              −1
            </button>
          </div>
        </div>
      </div>

      {/* ── ROW 3: SHOT CLOCK & TIMEOUTS BAR ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px', flexShrink: 0 }}>
        {/* Shot Clock Controls (24s, 14s, Reset, SHOT ON/OFF) */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '8px 10px', borderRadius: '12px', display: 'flex', gap: '8px', border: '2px solid #2a3447', alignItems: 'center' }}>
          <button
            className="btn"
            style={{ flex: 1, height: '52px', minHeight: '52px', background: '#1e2638', color: '#fff', border: '2px solid #3b82f6', borderRadius: '10px', fontSize: '1.15rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_DURATION', seconds: 24 })}
          >
            24s
          </button>
          <button
            className="btn"
            style={{ flex: 1, height: '52px', minHeight: '52px', background: '#1e2638', color: '#fff', border: '2px solid #3b82f6', borderRadius: '10px', fontSize: '1.15rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_DURATION', seconds: 14 })}
          >
            14s
          </button>
          <button
            className="btn"
            style={{ flex: 1, height: '52px', minHeight: '52px', background: '#1e2638', color: '#fff', border: '2px solid #8b5cf6', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'RESET_SHOT_CLOCK' })}
          >
            ↺ SHOT
          </button>
          <button
            className="btn"
            style={{
              flex: 1,
              height: '52px',
              minHeight: '52px',
              background: isShotEnabled ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)' : 'linear-gradient(180deg, #dc2626 0%, #881337 100%)',
              color: '#fff',
              border: isShotEnabled ? '2px solid #34d399' : '2px solid #f87171',
              borderRadius: '10px',
              fontSize: '1.05rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: isShotEnabled ? '0 0 12px rgba(16,185,129,0.4)' : 'none',
              whiteSpace: 'nowrap',
            }}
            onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_ENABLED', enabled: !isShotEnabled })}
          >
            {isShotEnabled ? '⚡ SHOT ON' : '🔴 SHOT OFF'}
          </button>
        </div>

        {/* Home Timeout */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '8px 10px', borderRadius: '12px', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            style={{ flex: 1, height: '52px', minHeight: '52px', padding: '6px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            onClick={() => {
              sendCommand({ type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
              sendCommand({ type: 'START_TIMEOUT', team: 'home' })
            }}
            disabled={home.timeouts.fullRemaining <= 0}
          >
            <span>⏸ HOME TIMEOUT</span>
            <span style={{ fontSize: '0.92rem', opacity: 0.9 }}>({home.timeouts.fullRemaining} LEFT)</span>
          </button>
        </div>

        {/* Away Timeout */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '8px 10px', borderRadius: '12px', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            style={{ flex: 1, height: '52px', minHeight: '52px', padding: '6px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            onClick={() => {
              sendCommand({ type: 'USE_TIMEOUT', team: 'away', kind: 'full' })
              sendCommand({ type: 'START_TIMEOUT', team: 'away' })
            }}
            disabled={away.timeouts.fullRemaining <= 0}
          >
            <span>⏸ AWAY TIMEOUT</span>
            <span style={{ fontSize: '0.92rem', opacity: 0.9 }}>({away.timeouts.fullRemaining} LEFT)</span>
          </button>
        </div>
      </div>

      {/* ── ROW 4: TOUCH ACTION CONTROLS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px', flexShrink: 0 }}>
        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'ADVANCE_PERIOD' })}
        >
          ⏭ NEXT Q
        </button>

        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: 'linear-gradient(180deg, #f43f5e 0%, #be123c 100%)', color: '#fff', border: '2px solid #fda4af', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
        >
          ⇄ SWITCH
        </button>

        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: 'linear-gradient(180deg, #78350f 0%, #451a03 100%)', color: '#fbbf24', border: '2px solid #f59e0b', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          disabled={!canUndo}
          title={canUndo ? `Undo last action: ${undoDesc}` : 'Nothing to undo'}
          onClick={() => sendCommand({ type: 'UNDO' })}
        >
          ↶ UNDO
        </button>

        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: 'linear-gradient(180deg, #0284c7 0%, #075985 100%)', color: '#bae6fd', border: '2px solid #38bdf8', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          onClick={() => setShowSubModal(selectedPlayer?.team ?? 'home')}
        >
          👤 SUB
        </button>

        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: '#2d3748', color: '#fff', border: '2px solid #4a5568', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}
          title="Open Main Scoreboard TV Display"
        >
          📺 TV
        </button>

        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: '#047857', color: '#fff', border: '2px solid #10b981', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SHOTCLOCK' })}
          title="Open Shot Clock TV Display"
        >
          ⏱ SHOT TV
        </button>

        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)', color: '#fff', border: '2px solid #a78bfa', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          onClick={() => onTabChange('BOXSCORE')}
          title="View Player Statistics & Export"
        >
          📊 STATS
        </button>

        <button
          className="btn"
          style={{ height: '52px', minHeight: '52px', padding: '4px 2px', background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff', border: '2px solid #f87171', borderRadius: '10px', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}
          onClick={handleResetAll}
          title="Reset All: Scores to 0, Fouls to 0, Period to 1, and Clocks to full duration"
        >
          🔄 RESET
        </button>
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
            {/* Header */}
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

            {/* Description Card */}
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

            <div
              style={{
                fontSize: '0.78rem',
                color: '#94a3b8',
                fontStyle: 'italic',
                padding: '0 4px',
              }}
            >
              Note: Team names, players, rosters, and configured settings will remain saved.
            </div>

            {/* Buttons */}
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
                  transition: 'background 0.15s ease',
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
