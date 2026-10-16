import React, { useState } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { TimeoutSettings } from './TimeoutSettings'
import VolleyballBoxScore from './VolleyballBoxScore'
import sponsorLogo from '../../../../pictures/white.png'

interface VolleyballScoreTabProps {
  selectedPlayer: { team: 'home' | 'away'; id: string } | null
  setSelectedPlayer: (p: { team: 'home' | 'away'; id: string } | null) => void
  setShowSubModal: (t: 'home' | 'away' | null) => void
  currentTab: string
  onTabChange: (tab: string) => void
}

export function VolleyballScoreTab({
  selectedPlayer,
  setSelectedPlayer,
  setShowSubModal,
  onTabChange,
}: VolleyballScoreTabProps): React.ReactElement {
  const gs = useControlPanelStore(s => s.gameState)
  const { home, away, volleyball } = gs
  const [showBoxScore, setShowBoxScore] = useState(false)

  if (!volleyball) {
    return <div style={{ padding: '20px', color: '#d0dce8' }}>Volleyball state not initialized</div>
  }

  if (showBoxScore) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cp-bg)', padding: '10px' }}>
        <button
          style={{
            alignSelf: 'flex-start',
            padding: '10px 20px',
            background: 'var(--btn-ctrl)',
            color: '#fff',
            border: '2px solid var(--btn-ctrl-bdr)',
            borderRadius: 'var(--r-md)',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: '10px',
          }}
          onClick={() => setShowBoxScore(false)}
        >
          ← BACK TO SCORE PANEL
        </button>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <VolleyballBoxScore />
        </div>
      </div>
    )
  }

  const { currentSet, setsWon, timeoutsUsed, servingTeam } = volleyball

  return (
    <div
      className="vb-score-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--cp-bg)',
        padding: '10px 14px 16px 14px',
        gap: '14px',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflowY: 'auto',
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

      {/* ── VOLLEYBALL SPORT LABEL (BELOW LOGO) ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '28px', flexShrink: 0, marginTop: '-8px' }}>
        <div style={{ 
          fontSize: '1.1rem', 
          fontWeight: 900, 
          color: '#ffaa00', 
          letterSpacing: '0.15em', 
          textTransform: 'uppercase',
          textShadow: '0 0 10px rgba(255,170,0,0.5), 0 0 20px rgba(255,170,0,0.3)'
        }}>
          🏐 VOLLEYBALL
        </div>
      </div>

      {/* ── TOP BANNER: HOME, SET & CLOCK, AWAY (Flex 0.8) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '16px',
          padding: '12px 20px',
          background: 'var(--cp-panel)',
          borderRadius: 'var(--r-md)',
          border: '2px solid var(--accent-orange)',
          alignItems: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          flexShrink: 0,
        }}
      >
        {/* Home Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.4rem', color: home.config.color || '#1a4fd6', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {home.config.name}
          </div>
          <div style={{ fontSize: '4.2rem', color: 'var(--led-red)', fontFamily: 'var(--font-led)', fontWeight: 900, lineHeight: 1 }}>
            {home.score}
          </div>
          <div style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            Sets: <span style={{ color: 'var(--led-amber)', fontWeight: 900, fontSize: '1.2rem' }}>{setsWon.home}</span>
          </div>
        </div>

        {/* Center: SET Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              fontSize: '4.5rem',
              color: 'var(--led-amber)',
              fontFamily: 'var(--font-led)',
              fontWeight: 900,
              background: 'var(--cp-led-bg)',
              padding: '10px 32px',
              borderRadius: 'var(--r-md)',
              border: '3px solid var(--accent-orange)',
              lineHeight: 1.1,
              boxShadow: '0 0 15px rgba(255,170,0,0.3)',
              marginTop: '10px',
            }}
          >
            SET {currentSet}
          </div>
        </div>

        {/* Away Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.4rem', color: away.config.color || '#c0392b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {away.config.name}
          </div>
          <div style={{ fontSize: '4.2rem', color: 'var(--led-red)', fontFamily: 'var(--font-led)', fontWeight: 900, lineHeight: 1 }}>
            {away.score}
          </div>
          <div style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            Sets: <span style={{ color: 'var(--led-amber)', fontWeight: 900, fontSize: '1.2rem' }}>{setsWon.away}</span>
          </div>
        </div>
      </div>

      {/* ── ROW 2: PLAYER SELECTION & STATS (Flex 0.35) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flex: 0.35, minHeight: 0 }}>
        {/* Home Players */}
        <div style={{ background: 'var(--cp-panel)', padding: '12px', borderRadius: 'var(--r-md)', border: '2px solid #2a3a50', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--led-amber)', textAlign: 'center' }}>HOME PLAYERS</div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex', 
            flexDirection: 'column', 
            gap: '4px', 
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thick',
            scrollbarColor: '#ffcc00 #1a2030'
          }}>
            {home.players.filter(p => p.active).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'home', id: p.id })}
                style={{
                  padding: '10px 12px',
                  minHeight: '50px',
                  background: selectedPlayer?.id === p.id ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
                  color: p.fouledOut ? '#888' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2px solid var(--accent-gold)' : '1px solid var(--btn-ctrl-bdr)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.5 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
                disabled={p.fouledOut}
              >
                <span>#{p.number} {p.name} {p.fouledOut && '❌'}</span>
                <span style={{ fontSize: '0.85rem', color: p.fouls >= 4 ? '#ff6b6b' : p.fouls >= 3 ? '#ffaa44' : 'var(--text-muted)' }}>
                  {p.points}pts | {p.fouls}F
                </span>
              </button>
            ))}
            {home.players.filter(p => p.active).length === 0 && (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                No active players. Add players in ROSTER tab.
              </div>
            )}
          </div>
          
          {/* Foul & Stats Buttons for Selected HOME Player */}
          {selectedPlayer?.team === 'home' && (
            <div style={{ borderTop: '1px solid #334466', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--led-amber)', fontWeight: 700 }}>
                  {home.players.find(p => p.id === selectedPlayer.id)?.name}
                </div>
                <button
                  style={{ padding: '4px 12px', background: '#4a5568', color: '#fff', border: '1px solid #718096', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ← Back
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#ff6b6b', color: '#fff', border: '1px solid #ff4444', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#666', color: '#fff', border: '1px solid #555', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}
                  disabled={home.players.find(p => p.id === selectedPlayer.id)?.fouls === 0}
                >
                  -FOUL
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#4CAF50', color: '#fff', border: '1px solid #45a049', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  🛡 BLOCK
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#2196F3', color: '#fff', border: '1px solid #1976D2', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  🏐 ACE
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#FF9800', color: '#fff', border: '1px solid #F57C00', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  ⛏ DIG
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#9C27B0', color: '#fff', border: '1px solid #7B1FA2', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  🤝 ASSIST
                </button>
              </div>
              
              {/* Stats Summary */}
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: 'var(--cp-led-bg)',
                border: '1px solid var(--accent-gold)',
                borderRadius: 'var(--r-sm)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                fontWeight: 700,
              }}>
                Stats: <span style={{ color: 'var(--led-amber)' }}>
                  {home.players.find(p => p.id === selectedPlayer.id)?.points || 0}pts
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {home.players.find(p => p.id === selectedPlayer.id)?.rebounds || 0}reb
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {home.players.find(p => p.id === selectedPlayer.id)?.assists || 0}ast
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {home.players.find(p => p.id === selectedPlayer.id)?.steals || 0}stl
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {home.players.find(p => p.id === selectedPlayer.id)?.blocks || 0}blk
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Away Players */}
        <div style={{ background: 'var(--cp-panel)', padding: '12px', borderRadius: 'var(--r-md)', border: '2px solid #2a3a50', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--led-amber)', textAlign: 'center' }}>AWAY PLAYERS</div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex', 
            flexDirection: 'column', 
            gap: '4px', 
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thick',
            scrollbarColor: '#ffcc00 #1a2030'
          }}>
            {away.players.filter(p => p.active).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'away', id: p.id })}
                style={{
                  padding: '10px 12px',
                  minHeight: '50px',
                  background: selectedPlayer?.id === p.id ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
                  color: p.fouledOut ? '#888' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2px solid var(--accent-gold)' : '1px solid var(--btn-ctrl-bdr)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.5 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
                disabled={p.fouledOut}
              >
                <span>#{p.number} {p.name} {p.fouledOut && '❌'}</span>
                <span style={{ fontSize: '0.85rem', color: p.fouls >= 4 ? '#ff6b6b' : p.fouls >= 3 ? '#ffaa44' : 'var(--text-muted)' }}>
                  {p.points}pts | {p.fouls}F
                </span>
              </button>
            ))}
            {away.players.filter(p => p.active).length === 0 && (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                No active players. Add players in ROSTER tab.
              </div>
            )}
          </div>
          
          {/* Foul & Stats Buttons for Selected AWAY Player */}
          {selectedPlayer?.team === 'away' && (
            <div style={{ borderTop: '1px solid #334466', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--led-amber)', fontWeight: 700 }}>
                  {away.players.find(p => p.id === selectedPlayer.id)?.name}
                </div>
                <button
                  style={{ padding: '4px 12px', background: '#4a5568', color: '#fff', border: '1px solid #718096', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ← Back
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#ff6b6b', color: '#fff', border: '1px solid #ff4444', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#666', color: '#fff', border: '1px solid #555', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}
                  disabled={away.players.find(p => p.id === selectedPlayer.id)?.fouls === 0}
                >
                  -FOUL
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#4CAF50', color: '#fff', border: '1px solid #45a049', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  🛡 BLOCK
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#2196F3', color: '#fff', border: '1px solid #1976D2', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  🏐 ACE
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#FF9800', color: '#fff', border: '1px solid #F57C00', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  ⛏ DIG
                </button>
                <button
                  style={{ padding: '7px 4px', minHeight: '34px', background: '#9C27B0', color: '#fff', border: '1px solid #7B1FA2', borderRadius: 'var(--r-sm)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  🤝 ASSIST
                </button>
              </div>
              
              {/* Stats Summary */}
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: 'var(--cp-led-bg)',
                border: '1px solid var(--accent-gold)',
                borderRadius: 'var(--r-sm)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                fontWeight: 700,
              }}>
                Stats: <span style={{ color: 'var(--led-amber)' }}>
                  {away.players.find(p => p.id === selectedPlayer.id)?.points || 0}pts
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {away.players.find(p => p.id === selectedPlayer.id)?.rebounds || 0}reb
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {away.players.find(p => p.id === selectedPlayer.id)?.assists || 0}ast
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {away.players.find(p => p.id === selectedPlayer.id)?.steals || 0}stl
                </span> | <span style={{ color: 'var(--led-amber)' }}>
                  {away.players.find(p => p.id === selectedPlayer.id)?.blocks || 0}blk
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: TOUCH SCORE CONTROLS (+ / -) & SERVING (Flex 0.40) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flex: 0.40, minHeight: 0 }}>
        {/* Home Controls Box */}
        <div style={{ background: 'var(--cp-panel)', padding: '12px', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', gap: '10px', border: '2px solid #2a3a50', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          <button
            className="vb-btn vb-btn--serve"
            style={{
              padding: '14px',
              background: servingTeam === 'home' ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
              color: '#fff',
              border: servingTeam === 'home' ? '3px solid var(--accent-gold)' : '2px solid var(--btn-ctrl-bdr)',
              borderRadius: 'var(--r-md)',
              fontSize: '1.2rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: servingTeam === 'home' ? '0 0 15px rgba(255,170,0,0.4)' : 'none',
            }}
            onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: servingTeam === 'home' ? null : 'home' })}
          >
            ◀ {servingTeam === 'home' ? 'SERVE ON (TAP TO TOGGLE)' : 'HOME SERVE'}
          </button>

          <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
            <button
              className="vb-btn vb-btn--score"
              style={{
                flex: 1,
                height: '100%',
                minHeight: '80px',
                padding: '16px',
                background: 'var(--btn-green)',
                color: '#fff',
                border: '3px solid var(--btn-green-dk)',
                borderRadius: 'var(--r-md)',
                fontSize: '2.2rem',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                touchAction: 'manipulation',
                boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
              }}
              onClick={() => {
                if (selectedPlayer && selectedPlayer.team === 'home') {
                  sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 1 })
                }
                sendCommand({ type: 'ADD_VB_POINT', team: 'home' })
              }}
            >
              <span style={{ fontSize: '2.8rem' }}>+</span>
              <span>{selectedPlayer?.team === 'home' ? 'POINT ' + home.players.find(p => p.id === selectedPlayer.id)?.name?.split(' ')[0] : 'POINT HOME'}</span>
            </button>
            <button
              className="vb-btn vb-btn--subtract"
              style={{
                width: '110px',
                height: '100%',
                minHeight: '80px',
                padding: '16px',
                background: '#b02020',
                color: '#fff',
                border: '3px solid #e03030',
                borderRadius: 'var(--r-md)',
                fontSize: '2.8rem',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
                boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
              }}
              onClick={() => sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'home' })}
              disabled={home.score <= 0}
              title="Minus Point Home"
            >
              −
            </button>
          </div>
        </div>

        {/* Away Controls Box */}
        <div style={{ background: 'var(--cp-panel)', padding: '12px', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', gap: '10px', border: '2px solid #2a3a50', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          <button
            className="vb-btn vb-btn--serve"
            style={{
              padding: '14px',
              background: servingTeam === 'away' ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
              color: '#fff',
              border: servingTeam === 'away' ? '3px solid var(--accent-gold)' : '2px solid var(--btn-ctrl-bdr)',
              borderRadius: 'var(--r-md)',
              fontSize: '1.2rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: servingTeam === 'away' ? '0 0 15px rgba(255,170,0,0.4)' : 'none',
            }}
            onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: servingTeam === 'away' ? null : 'away' })}
          >
            {servingTeam === 'away' ? 'SERVE ON (TAP TO TOGGLE)' : 'AWAY SERVE'} ▶
          </button>

          <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
            <button
              className="vb-btn vb-btn--score"
              style={{
                flex: 1,
                height: '100%',
                minHeight: '80px',
                padding: '16px',
                background: 'var(--btn-green)',
                color: '#fff',
                border: '3px solid var(--btn-green-dk)',
                borderRadius: 'var(--r-md)',
                fontSize: '2.2rem',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                touchAction: 'manipulation',
                boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
              }}
              onClick={() => {
                if (selectedPlayer && selectedPlayer.team === 'away') {
                  sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 1 })
                }
                sendCommand({ type: 'ADD_VB_POINT', team: 'away' })
              }}
            >
              <span style={{ fontSize: '2.8rem' }}>+</span>
              <span>{selectedPlayer?.team === 'away' ? 'POINT ' + away.players.find(p => p.id === selectedPlayer.id)?.name?.split(' ')[0] : 'POINT AWAY'}</span>
            </button>
            <button
              className="vb-btn vb-btn--subtract"
              style={{
                width: '110px',
                height: '100%',
                minHeight: '80px',
                padding: '16px',
                background: '#b02020',
                color: '#fff',
                border: '3px solid #e03030',
                borderRadius: 'var(--r-md)',
                fontSize: '2.8rem',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
                boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
              }}
              onClick={() => sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'away' })}
              disabled={away.score <= 0}
              title="Minus Point Away"
            >
              −
            </button>
          </div>
        </div>
      </div>

      {/* ── ROW 3: TOUCH TIMEOUTS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flexShrink: 0 }}>
        {/* Home Timeout */}
        <div style={{ background: 'var(--cp-panel)', padding: '10px 14px', borderRadius: 'var(--r-md)', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            className="vb-btn vb-btn--timeout"
            style={{ flex: 1, minHeight: '50px', padding: '10px 14px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: 'var(--r-md)', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', lineHeight: 1.3, textTransform: 'uppercase' }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'home' })}
            disabled={timeoutsUsed.home >= 2}
          >
            ⏱️ HOME TIMEOUT ({2 - timeoutsUsed.home} LEFT)
          </button>
        </div>

        {/* Away Timeout */}
        <div style={{ background: 'var(--cp-panel)', padding: '10px 14px', borderRadius: 'var(--r-md)', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            className="vb-btn vb-btn--timeout"
            style={{ flex: 1, minHeight: '50px', padding: '10px 14px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: 'var(--r-md)', fontSize: '0.92rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', lineHeight: 1.3, textTransform: 'uppercase' }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'away' })}
            disabled={timeoutsUsed.away >= 2}
          >
            ⏱️ AWAY TIMEOUT ({2 - timeoutsUsed.away} LEFT)
          </button>
        </div>
      </div>

      {/* ── ROW 4: TOUCH ACTION CONTROLS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px', flexShrink: 0 }}>
        <button
          className="vb-btn vb-btn--advance"
          style={{ minHeight: '70px', padding: '16px 12px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: 'var(--r-md)', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'ADVANCE_SET' })}
        >
          ⏭ NEXT SET
        </button>

        <button
          className="vb-btn vb-btn--switch"
          style={{ minHeight: '70px', padding: '16px 12px', background: 'var(--btn-switch)', color: '#fff', border: '2px solid #e03818', borderRadius: 'var(--r-md)', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
        >
          ⇄ SWITCH
        </button>

        <button
          className="vb-btn"
          style={{ minHeight: '70px', padding: '16px 12px', background: 'var(--btn-ctrl)', color: '#fff', border: '2px solid var(--btn-ctrl-bdr)', borderRadius: 'var(--r-md)', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'UNDO' })}
        >
          ↶ UNDO
        </button>

        <button
          className="vb-btn"
          style={{ minHeight: '70px', padding: '16px 12px', background: '#2d3748', color: '#fff', border: '2px solid #4a5568', borderRadius: 'var(--r-md)', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          onClick={() => setShowBoxScore(true)}
          title="View Player Statistics Box Score"
        >
          📊 STATS
        </button>

        <button
          className="vb-btn"
          style={{ minHeight: '70px', padding: '16px 12px', background: '#2d3748', color: '#fff', border: '2px solid #4a5568', borderRadius: 'var(--r-md)', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}
          title="Open Scoreboard TV Display"
        >
          📺 TV
        </button>

        <button
          className="vb-btn"
          style={{ minHeight: '70px', padding: '16px 12px', background: '#b02020', color: '#fff', border: '2px solid #e03030', borderRadius: 'var(--r-md)', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })}
        >
          🔄 RESET
        </button>
      </div>


    </div>
  )
}
