import React, { useState, useEffect } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { formatClockDisplay } from '@renderer/shared/clockUtils'
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
  const shotSec = shotClock.displayMs > 0 ? Math.ceil(shotClock.displayMs / 1000) : shotClock.configuredDurationSeconds
  const isShotEnabled = shotClock ? (shotClock.enabled !== false) : true

  // Undo state
  const [canUndo, setCanUndo] = useState(false)
  const [undoDesc, setUndoDesc] = useState('')
  const [timeEditInput, setTimeEditInput] = useState('')

  const handleApplyTimeEdit = () => {
    const trimmed = timeEditInput.trim()
    const match = /^(\d{1,3}):(\d{2})$/.exec(trimmed)
    if (!match) return
    const mins = parseInt(match[1], 10)
    const secs = parseInt(match[2], 10)
    if (secs > 59) return
    const seconds = mins * 60 + secs
    sendCommand({ type: 'SET_GAME_CLOCK', seconds })
    setTimeEditInput('')
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

  return (
    <div
      className="bb-score-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#0a0d14',
        padding: '10px 12px 12px 12px',
        gap: '10px',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflow: 'hidden',
        color: '#ffffff',
      }}
    >
      {/* ── TOP FITNESS EXCLUSIVE SPONSOR HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '52px', flexShrink: 0 }}>
        <img
          src={sponsorLogo}
          alt="Fitness Exclusive"
          style={{
            maxHeight: '100%',
            maxWidth: '420px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.8)) drop-shadow(0 0 25px rgba(200,220,255,0.4))'
          }}
        />
      </div>
      {/* ── TOP BANNER: HOME, CLOCK & PERIOD, AWAY (Flex 0.8) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '16px',
          padding: '12px 20px',
          background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)',
          borderRadius: '14px',
          border: '2px solid #2a3447',
          alignItems: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          flexShrink: 0,
        }}
      >
        {/* Home Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.4rem', color: home.config.color || '#4a9eff', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {home.config.name}
          </div>
          <div style={{ fontSize: '4.2rem', color: 'var(--led-red, #ff0000)', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 1 }}>
            {home.score}
          </div>
          <div style={{ fontSize: '1rem', color: '#a0aec0', fontWeight: 700, display: 'flex', gap: '12px' }}>
            <span>Fouls: <strong style={{ color: '#ff4a4a' }}>{home.fouls}</strong></span>
            <span>TO: <strong style={{ color: '#ffcc00' }}>{home.timeouts.fullRemaining}</strong></span>
          </div>
        </div>

        {/* Center: Period & Game Clock Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
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
                padding: '4px 16px',
                borderRadius: '8px',
                border: '2px solid #2a3447',
              }}
            >
              SHOT: {shotSec}s
            </div>
          </div>

          {/* Touch Game Clock Control inline with direct time editor */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.6)', padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '2.5rem', color: gameClock.running ? '#00ff66' : '#ffaa00', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 1, letterSpacing: '0.08em' }}>
                {clockStr}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn"
                  style={{ padding: '10px 16px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '2px solid #34d399', borderRadius: '8px', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', touchAction: 'manipulation' }}
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
                  style={{ padding: '10px 16px', background: 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)', color: '#fff', border: '2px solid #fca5a5', borderRadius: '8px', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', touchAction: 'manipulation' }}
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
                  style={{ padding: '10px 16px', background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)', color: '#fff', border: '2px solid #fbbf24', borderRadius: '8px', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'RESET_GAME_CLOCK' })}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Direct Edit Time Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
              <input
                type="text"
                placeholder="MM:SS (e.g. 10:00)"
                value={timeEditInput}
                onChange={(e) => setTimeEditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyTimeEdit()
                }}
                disabled={gameClock.running}
                style={{
                  width: '140px',
                  padding: '5px 10px',
                  background: '#04070d',
                  color: '#fff',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              />
              <button
                style={{
                  padding: '5px 14px',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  opacity: gameClock.running ? 0.5 : 1,
                }}
                onClick={handleApplyTimeEdit}
                disabled={gameClock.running}
              >
                Set Time
              </button>
            </div>
          </div>
        </div>

        {/* Away Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.4rem', color: away.config.color || '#ff4a4a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {away.config.name}
          </div>
          <div style={{ fontSize: '4.2rem', color: 'var(--led-red, #ff0000)', fontFamily: 'var(--font-led, "Cursed Timer ULiL", monospace)', fontWeight: 900, lineHeight: 1 }}>
            {away.score}
          </div>
          <div style={{ fontSize: '1rem', color: '#a0aec0', fontWeight: 700, display: 'flex', gap: '12px' }}>
            <span>Fouls: <strong style={{ color: '#ff4a4a' }}>{away.fouls}</strong></span>
            <span>TO: <strong style={{ color: '#ffcc00' }}>{away.timeouts.fullRemaining}</strong></span>
          </div>
        </div>
      </div>

      {/* ── ROW 1.5: PLAYER SELECTION & STATS (Flex 0.4) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flex: 0.4, minHeight: 0 }}>
        {/* Home Players */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '10px', borderRadius: '14px', border: '2px solid #2a3447', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#ffcc00', textAlign: 'center' }}>HOME PLAYERS</div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            overflowX: 'hidden',
            display: 'flex', 
            flexDirection: 'column', 
            gap: '4px', 
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#fcd34d #1e2638'
          }}>
            {home.players.filter(p => p.active).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'home', id: p.id })}
                style={{
                  padding: '10px 12px',
                  minHeight: '50px',
                  background: selectedPlayer?.id === p.id ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
                  color: p.fouledOut ? '#666' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2px solid #fcd34d' : '1px solid #3a4866',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.4 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0
                }}
                disabled={p.fouledOut}
              >
                <span>#{p.number} {p.name} {p.fouledOut && '❌'}</span>
                <span style={{ fontSize: '0.75rem', color: p.fouls >= 5 ? '#ff4444' : p.fouls >= 4 ? '#ffaa44' : '#aaa' }}>
                  {p.points}pts | {p.fouls}F
                </span>
              </button>
            ))}
            {home.players.filter(p => p.active).length === 0 && (
              <div style={{ padding: '10px', color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>
                No active players. Add in ROSTER tab.
              </div>
            )}
          </div>
          
          {/* Basketball Stats Buttons for Selected HOME Player */}
          {selectedPlayer?.team === 'home' && (
            <div style={{ borderTop: '1px solid #2a3447', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '0.85rem', color: '#ffcc00', fontWeight: 700 }}>
                  {home.players.find(p => p.id === selectedPlayer.id)?.name}
                </div>
                <button
                  style={{ padding: '4px 12px', background: '#4a5568', color: '#fff', border: '1px solid #718096', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ← Back
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', textAlign: 'center', fontWeight: 600, marginBottom: '4px' }}>
                Stats: {home.players.find(p => p.id === selectedPlayer.id)?.points}pts | 
                {home.players.find(p => p.id === selectedPlayer.id)?.rebounds}reb | 
                {home.players.find(p => p.id === selectedPlayer.id)?.assists}ast | 
                {home.players.find(p => p.id === selectedPlayer.id)?.steals}stl | 
                {home.players.find(p => p.id === selectedPlayer.id)?.blocks}blk
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <button
                  style={{ padding: '6px', background: '#ff4444', color: '#fff', border: '1px solid #ff6666', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '6px', background: '#4CAF50', color: '#fff', border: '1px solid #66BB6A', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  +REB
                </button>
                <button
                  style={{ padding: '6px', background: '#2196F3', color: '#fff', border: '1px solid #42A5F5', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  +AST
                </button>
                <button
                  style={{ padding: '6px', background: '#FF9800', color: '#fff', border: '1px solid #FFA726', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  +STL
                </button>
                <button
                  style={{ padding: '6px', background: '#9C27B0', color: '#fff', border: '1px solid #BA68C8', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  +BLK
                </button>
                <button
                  style={{ padding: '6px', background: '#607D8B', color: '#fff', border: '1px solid #78909C', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'fgm' })}
                >
                  +FGM
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Away Players */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '10px', borderRadius: '14px', border: '2px solid #2a3447', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#ffcc00', textAlign: 'center' }}>AWAY PLAYERS</div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex', 
            flexDirection: 'column', 
            gap: '4px', 
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#fcd34d #1e2638'
          }}>
            {away.players.filter(p => p.active).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'away', id: p.id })}
                style={{
                  padding: '10px 12px',
                  minHeight: '50px',
                  background: selectedPlayer?.id === p.id ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
                  color: p.fouledOut ? '#666' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2px solid #fcd34d' : '1px solid #3a4866',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.4 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0
                }}
                disabled={p.fouledOut}
              >
                <span>#{p.number} {p.name} {p.fouledOut && '❌'}</span>
                <span style={{ fontSize: '0.75rem', color: p.fouls >= 5 ? '#ff4444' : p.fouls >= 4 ? '#ffaa44' : '#aaa' }}>
                  {p.points}pts | {p.fouls}F
                </span>
              </button>
            ))}
            {away.players.filter(p => p.active).length === 0 && (
              <div style={{ padding: '10px', color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>
                No active players. Add in ROSTER tab.
              </div>
            )}
          </div>
          
          {/* Basketball Stats Buttons for Selected AWAY Player */}
          {selectedPlayer?.team === 'away' && (
            <div style={{ borderTop: '1px solid #2a3447', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '0.85rem', color: '#ffcc00', fontWeight: 700 }}>
                  {away.players.find(p => p.id === selectedPlayer.id)?.name}
                </div>
                <button
                  style={{ padding: '4px 12px', background: '#4a5568', color: '#fff', border: '1px solid #718096', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ← Back
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', textAlign: 'center', fontWeight: 600, marginBottom: '4px' }}>
                Stats: {away.players.find(p => p.id === selectedPlayer.id)?.points}pts | 
                {away.players.find(p => p.id === selectedPlayer.id)?.rebounds}reb | 
                {away.players.find(p => p.id === selectedPlayer.id)?.assists}ast | 
                {away.players.find(p => p.id === selectedPlayer.id)?.steals}stl | 
                {away.players.find(p => p.id === selectedPlayer.id)?.blocks}blk
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <button
                  style={{ padding: '6px', background: '#ff4444', color: '#fff', border: '1px solid #ff6666', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '6px', background: '#4CAF50', color: '#fff', border: '1px solid #66BB6A', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  +REB
                </button>
                <button
                  style={{ padding: '6px', background: '#2196F3', color: '#fff', border: '1px solid #42A5F5', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  +AST
                </button>
                <button
                  style={{ padding: '6px', background: '#FF9800', color: '#fff', border: '1px solid #FFA726', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  +STL
                </button>
                <button
                  style={{ padding: '6px', background: '#9C27B0', color: '#fff', border: '1px solid #BA68C8', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  +BLK
                </button>
                <button
                  style={{ padding: '6px', background: '#607D8B', color: '#fff', border: '1px solid #78909C', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'fgm' })}
                >
                  +FGM
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 2: TOUCH SCORE CONTROLS (+3, +2, +1, -1) & POSSESSION (Flex 0.5) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flex: 0.5, minHeight: 0 }}>
        {/* Home Controls Box */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '12px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px', border: '2px solid #2a3447', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          <button
            className="btn"
            style={{
              padding: '12px',
              background: possession === 'home' ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
              color: '#fff',
              border: possession === 'home' ? '3px solid #fcd34d' : '2px solid #3a4866',
              borderRadius: '10px',
              fontSize: '1.2rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: possession === 'home' ? '0 0 16px rgba(253,211,77,0.4)' : 'none',
            }}
            onClick={() => sendCommand({ type: 'SET_POSSESSION', team: possession === 'home' ? null : 'home' })}
          >
            ◀ {possession === 'home' ? 'POSSESSION ON (HOME)' : 'HOME POSSESSION'}
          </button>

          <div style={{ display: 'flex', gap: '10px', flex: 1, minHeight: 0 }}>
            {/* Point Buttons +3, +2, +1 */}
            <button
              className="btn"
              style={{ flex: 1, height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '3px solid #34d399', borderRadius: '10px', fontSize: '2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('home', 3)}
            >
              +3
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '3px solid #34d399', borderRadius: '10px', fontSize: '2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('home', 2)}
            >
              +2
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)', color: '#fff', border: '3px solid #fbbf24', borderRadius: '10px', fontSize: '2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('home', 1)}
            >
              +1
            </button>

            {/* Minus 1 Point */}
            <button
              className="btn"
              style={{ width: '85px', height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff', border: '3px solid #f87171', borderRadius: '10px', fontSize: '2.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'home' })}
              disabled={home.score <= 0}
              title="Minus 1 Home Score"
            >
              −1
            </button>
          </div>
        </div>

        {/* Away Controls Box */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '12px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '10px', border: '2px solid #2a3447', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          <button
            className="btn"
            style={{
              padding: '12px',
              background: possession === 'away' ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)' : '#1e2638',
              color: '#fff',
              border: possession === 'away' ? '3px solid #fcd34d' : '2px solid #3a4866',
              borderRadius: '10px',
              fontSize: '1.2rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: possession === 'away' ? '0 0 16px rgba(253,211,77,0.4)' : 'none',
            }}
            onClick={() => sendCommand({ type: 'SET_POSSESSION', team: possession === 'away' ? null : 'away' })}
          >
            {possession === 'away' ? 'POSSESSION ON (AWAY)' : 'AWAY POSSESSION'} ▶
          </button>

          <div style={{ display: 'flex', gap: '10px', flex: 1, minHeight: 0 }}>
            {/* Point Buttons +3, +2, +1 */}
            <button
              className="btn"
              style={{ flex: 1, height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '3px solid #34d399', borderRadius: '10px', fontSize: '2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('away', 3)}
            >
              +3
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '3px solid #34d399', borderRadius: '10px', fontSize: '2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('away', 2)}
            >
              +2
            </button>
            <button
              className="btn"
              style={{ flex: 1, height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)', color: '#fff', border: '3px solid #fbbf24', borderRadius: '10px', fontSize: '2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => handleAddPoints('away', 1)}
            >
              +1
            </button>

            {/* Minus 1 Point */}
            <button
              className="btn"
              style={{ width: '85px', height: '100%', minHeight: '60px', background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff', border: '3px solid #f87171', borderRadius: '10px', fontSize: '2.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'away' })}
              disabled={away.score <= 0}
              title="Minus 1 Away Score"
            >
              −1
            </button>
          </div>
        </div>
      </div>

      {/* ── ROW 3: SHOT CLOCK & TIMEOUTS BAR (Flex 0.3) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '14px', flex: 0.3, minHeight: 0 }}>
        {/* Shot Clock Controls (24s, 14s, Reset, SHOT ON/OFF) */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '10px', borderRadius: '14px', display: 'flex', gap: '8px', border: '2px solid #2a3447', alignItems: 'center' }}>
          <button
            className="btn"
            style={{ flex: 1, height: '100%', minHeight: '50px', background: '#1e2638', color: '#fff', border: '2px solid #3b82f6', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_DURATION', seconds: 24 })}
          >
            24s
          </button>
          <button
            className="btn"
            style={{ flex: 1, height: '100%', minHeight: '50px', background: '#1e2638', color: '#fff', border: '2px solid #3b82f6', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_DURATION', seconds: 14 })}
          >
            14s
          </button>
          <button
            className="btn"
            style={{ flex: 1.2, height: '100%', minHeight: '50px', background: '#1e2638', color: '#fff', border: '2px solid #8b5cf6', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'RESET_SHOT_CLOCK' })}
          >
            ↺ SHOT
          </button>
          <button
            className="btn"
            style={{
              flex: 1.5,
              height: '100%',
              minHeight: '50px',
              background: isShotEnabled ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)' : 'linear-gradient(180deg, #dc2626 0%, #881337 100%)',
              color: '#fff',
              border: isShotEnabled ? '2px solid #34d399' : '2px solid #f87171',
              borderRadius: '8px',
              fontSize: '1.2rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: isShotEnabled ? '0 0 15px rgba(16,185,129,0.5)' : 'none',
            }}
            onClick={() => sendCommand({ type: 'SET_SHOT_CLOCK_ENABLED', enabled: !isShotEnabled })}
          >
            {isShotEnabled ? '⚡ SHOT: ON' : '🔴 SHOT: OFF'}
          </button>
        </div>

        {/* Home Timeout */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '10px', borderRadius: '14px', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            className="btn"
            style={{ flex: 1, height: '100%', minHeight: '50px', padding: '8px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => {
              sendCommand({ type: 'USE_TIMEOUT', team: 'home', kind: 'full' })
              sendCommand({ type: 'START_TIMEOUT', team: 'home' })
            }}
            disabled={home.timeouts.fullRemaining <= 0}
          >
            ⏸ HOME TIMEOUT ({home.timeouts.fullRemaining} LEFT)
          </button>
        </div>

        {/* Away Timeout */}
        <div style={{ background: 'linear-gradient(180deg, #161b26 0%, #0d111a 100%)', padding: '10px', borderRadius: '14px', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            className="btn"
            style={{ flex: 1, height: '100%', minHeight: '50px', padding: '8px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => {
              sendCommand({ type: 'USE_TIMEOUT', team: 'away', kind: 'full' })
              sendCommand({ type: 'START_TIMEOUT', team: 'away' })
            }}
            disabled={away.timeouts.fullRemaining <= 0}
          >
            ⏸ AWAY TIMEOUT ({away.timeouts.fullRemaining} LEFT)
          </button>
        </div>
      </div>

      {/* ── ROW 4: TOUCH ACTION CONTROLS (Flex 0.4) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', flex: 0.4, minHeight: 0 }}>
        <button
          className="btn"
          style={{ height: '100%', minHeight: '48px', padding: '8px 4px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => sendCommand({ type: 'ADVANCE_PERIOD' })}
        >
          ⏭ NEXT Q
        </button>

        <button
          className="btn"
          style={{ height: '100%', minHeight: '48px', padding: '8px 4px', background: 'linear-gradient(180deg, #f43f5e 0%, #be123c 100%)', color: '#fff', border: '2px solid #fda4af', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
        >
          ⇄ SWITCH
        </button>

        <button
          className="btn"
          style={{ height: '100%', minHeight: '48px', padding: '8px 4px', background: 'linear-gradient(180deg, #78350f 0%, #451a03 100%)', color: '#fbbf24', border: '2px solid #f59e0b', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          disabled={!canUndo}
          title={canUndo ? `Undo last action: ${undoDesc}` : 'Nothing to undo'}
          onClick={() => sendCommand({ type: 'UNDO' })}
        >
          ↶ UNDO
        </button>

        <button
          className="btn"
          style={{ height: '100%', minHeight: '48px', padding: '8px 4px', background: 'linear-gradient(180deg, #0284c7 0%, #075985 100%)', color: '#bae6fd', border: '2px solid #38bdf8', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => setShowSubModal(selectedPlayer?.team ?? 'home')}
        >
          👤 SUB
        </button>

        <button
          className="btn"
          style={{ height: '100%', minHeight: '48px', padding: '8px 4px', background: '#2d3748', color: '#fff', border: '2px solid #4a5568', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}
          title="Open Main Scoreboard TV Display"
        >
          📺 TV
        </button>

        <button
          className="btn"
          style={{ height: '100%', minHeight: '48px', padding: '8px 4px', background: '#047857', color: '#fff', border: '2px solid #10b981', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SHOTCLOCK' })}
          title="Open Shot Clock TV Display"
        >
          ⏱ SHOT TV
        </button>

        <button
          className="btn"
          style={{ height: '100%', minHeight: '48px', padding: '8px 4px', background: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', color: '#fff', border: '2px solid #f87171', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => sendCommand({ type: 'NEW_GAME', clearTeams: false })}
        >
          🔄 RESET
        </button>
      </div>
    </div>
  )
}
