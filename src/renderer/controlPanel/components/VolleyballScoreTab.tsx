import React, { useState, useEffect } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import VolleyballBoxScore from './VolleyballBoxScore'
import sponsorLogo from '../../../../pictures/white.png'
import type { Player } from '@shared/types'

interface VolleyballScoreTabProps {
  selectedPlayer: { team: 'home' | 'away'; id: string } | null
  setSelectedPlayer: (p: { team: 'home' | 'away'; id: string } | null) => void
  setShowSubModal?: (t: 'home' | 'away' | null) => void
  currentTab?: string
  onTabChange?: (tab: string) => void
}

export function VolleyballScoreTab({
  selectedPlayer,
  setSelectedPlayer,
}: VolleyballScoreTabProps): React.ReactElement {
  const gs = useControlPanelStore(s => s.gameState)
  const { home, away, volleyball } = gs
  const [showBoxScore, setShowBoxScore] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)

  const handleQuickAddStartingSix = (team: 'home' | 'away') => {
    const teamState = team === 'home' ? home : away
    for (let i = 1; i <= 6; i++) {
      const pl: Player = {
        id: `${team}-vb-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
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
    list.slice(0, 6).forEach(p => {
      if (!p.active) {
        sendCommand({ type: 'TOGGLE_PLAYER_ACTIVE', team, playerId: p.id })
      }
    })
  }

  // Auto-initialize 6 default players if team has no players
  useEffect(() => {
    if (home.players.length === 0) {
      handleQuickAddStartingSix('home')
    }
    if (away.players.length === 0) {
      handleQuickAddStartingSix('away')
    }
  }, [home.players.length, away.players.length])

  // Auto-activate first 6 players if none active
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
        flex: 1,
        minHeight: 0,
        width: '100%',
        background: 'var(--cp-bg)',
        padding: '8px 12px 28px 12px',
        gap: '8px',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: '#ffd700 #161b26',
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

      {/* ── VOLLEYBALL SPORT LABEL (BELOW LOGO) ── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '22px', flexShrink: 0, marginTop: '-6px' }}>
        <div style={{ 
          fontSize: '0.95rem', 
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
          gap: '14px',
          padding: '8px 16px',
          background: 'var(--cp-panel)',
          borderRadius: '12px',
          border: '2px solid var(--accent-orange)',
          alignItems: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          flexShrink: 0,
        }}
      >
        {/* Home Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.25rem', color: home.config.color || '#1a4fd6', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {home.config.name}
          </div>
          <div style={{ fontSize: '3.6rem', color: 'var(--led-red)', fontFamily: 'var(--font-led)', fontWeight: 900, lineHeight: 1 }}>
            {home.score}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            Sets: <span style={{ color: 'var(--led-amber)', fontWeight: 900, fontSize: '1.15rem' }}>{setsWon.home}</span>
          </div>
        </div>

        {/* Center: SET Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              fontSize: '2.5rem',
              color: 'var(--led-amber)',
              fontFamily: 'var(--font-led)',
              fontWeight: 900,
              background: 'var(--cp-led-bg)',
              padding: '4px 22px',
              borderRadius: '8px',
              border: '2px solid var(--accent-orange)',
              lineHeight: 1.1,
              boxShadow: '0 0 15px rgba(255,170,0,0.3)',
            }}
          >
            SET {currentSet}
          </div>
        </div>

        {/* Away Info */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ fontSize: '1.25rem', color: away.config.color || '#c0392b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {away.config.name}
          </div>
          <div style={{ fontSize: '3.6rem', color: 'var(--led-red)', fontFamily: 'var(--font-led)', fontWeight: 900, lineHeight: 1 }}>
            {away.score}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            Sets: <span style={{ color: 'var(--led-amber)', fontWeight: 900, fontSize: '1.15rem' }}>{setsWon.away}</span>
          </div>
        </div>
      </div>

      {/* ── ROW 2: PLAYER SELECTION & STATS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: '1 1 auto', minHeight: '340px' }}>
        {/* Home Players */}
        <div style={{
          background: 'var(--cp-panel)',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '2px solid #2a3a50',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: '320px',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          scrollbarColor: '#ffd700 #161b26',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--led-amber)', letterSpacing: '0.08em' }}>🏐 HOME PLAYERS</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              {home.players.filter(p => p.active).length} Active on Court
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
            scrollbarColor: '#ffd700 #1a2030',
            paddingRight: '2px',
          }}>
            {homeDisplayPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'home', id: p.id })}
                style={{
                  padding: '12px 14px',
                  minHeight: '58px',
                  background: selectedPlayer?.id === p.id ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
                  color: p.fouledOut ? '#888' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2.5px solid var(--accent-gold)' : '1.5px solid var(--btn-ctrl-bdr)',
                  borderRadius: '12px',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.5 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0,
                  boxShadow: selectedPlayer?.id === p.id ? '0 0 16px rgba(255,215,0,0.45)' : 'none',
                }}
                disabled={p.fouledOut}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    background: 'rgba(255, 215, 0, 0.22)',
                    color: '#ffd700',
                    border: '1.5px solid rgba(255, 215, 0, 0.6)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '1.28rem',
                    fontWeight: 900,
                    minWidth: '38px',
                    textAlign: 'center',
                  }}>
                    #{p.number}
                  </span>
                  <span style={{ fontSize: '1.18rem', fontWeight: 900, letterSpacing: '0.02em' }}>{p.name} {p.fouledOut && '❌'}</span>
                </div>
                <div style={{
                  fontSize: '1rem',
                  fontWeight: 900,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.55)',
                  color: p.fouls >= 4 ? '#ff6b6b' : p.fouls >= 3 ? '#ffaa44' : '#4ade80',
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
                <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 700 }}>
                  {home.players.length === 0 ? 'No players added yet for Home' : 'Players exist but none are active'}
                </div>
                {home.players.length === 0 ? (
                  <button
                    onClick={() => handleQuickAddStartingSix('home')}
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
                    + Quick Load Starting 6
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
                    + Activate 6 Players
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Foul & Stats Buttons for Selected HOME Player */}
          {selectedPlayer?.team === 'home' && (
            <div style={{
              borderTop: '2px solid #334466',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
              background: 'rgba(10, 20, 35, 0.98)',
              borderRadius: '10px',
              border: '1.5px solid #334466',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: 'var(--led-amber)', color: '#000', padding: '2px 8px', borderRadius: '5px', fontWeight: 900, fontSize: '0.95rem' }}>
                    #{home.players.find(p => p.id === selectedPlayer.id)?.number}
                  </span>
                  <span style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 900 }}>
                    {home.players.find(p => p.id === selectedPlayer.id)?.name}
                  </span>
                  <span style={{ fontSize: '0.88rem', color: '#aaa', fontWeight: 700 }}>
                    ({home.players.find(p => p.id === selectedPlayer.id)?.points || 0}pts · {home.players.find(p => p.id === selectedPlayer.id)?.fouls || 0}fl · {home.players.find(p => p.id === selectedPlayer.id)?.rebounds || 0}dig · {home.players.find(p => p.id === selectedPlayer.id)?.assists || 0}ace · {home.players.find(p => p.id === selectedPlayer.id)?.blocks || 0}blk)
                  </span>
                </div>
                <button
                  style={{ padding: '8px 16px', minHeight: '44px', background: '#4a5568', color: '#fff', border: '1px solid #718096', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation' }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #ff6b6b 0%, #e53e3e 100%)', color: '#fff', border: '1px solid #ff4444', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: '#374151', color: '#fca5a5', border: '1px solid #4b5563', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}
                  disabled={home.players.find(p => p.id === selectedPlayer.id)?.fouls === 0}
                >
                  −FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #4CAF50 0%, #2e7d32 100%)', color: '#fff', border: '1px solid #45a049', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  🛡 BLK
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #2196F3 0%, #1565c0 100%)', color: '#fff', border: '1px solid #1976D2', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  🏐 ACE
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #FF9800 0%, #e65100 100%)', color: '#fff', border: '1px solid #F57C00', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  ⛏ DIG
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #9C27B0 0%, #6a1b9a 100%)', color: '#fff', border: '1px solid #7B1FA2', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  🤝 AST
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '1px solid #34d399', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 1 })}
                >
                  +1 PT
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Away Players */}
        <div style={{
          background: 'var(--cp-panel)',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '2px solid #2a3a50',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: '320px',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          scrollbarColor: '#ffd700 #161b26',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--led-amber)', letterSpacing: '0.08em' }}>🏐 AWAY PLAYERS</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              {away.players.filter(p => p.active).length} Active on Court
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
            scrollbarColor: '#ffd700 #1a2030',
            paddingRight: '2px',
          }}>
            {awayDisplayPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'away', id: p.id })}
                style={{
                  padding: '12px 14px',
                  minHeight: '58px',
                  background: selectedPlayer?.id === p.id ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
                  color: p.fouledOut ? '#888' : '#fff',
                  border: selectedPlayer?.id === p.id ? '2.5px solid var(--accent-gold)' : '1.5px solid var(--btn-ctrl-bdr)',
                  borderRadius: '12px',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  cursor: p.fouledOut ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: p.fouledOut ? 0.5 : 1,
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  flexShrink: 0,
                  boxShadow: selectedPlayer?.id === p.id ? '0 0 16px rgba(255,215,0,0.45)' : 'none',
                }}
                disabled={p.fouledOut}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    background: 'rgba(255, 215, 0, 0.22)',
                    color: '#ffd700',
                    border: '1.5px solid rgba(255, 215, 0, 0.6)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '1.28rem',
                    fontWeight: 900,
                    minWidth: '38px',
                    textAlign: 'center',
                  }}>
                    #{p.number}
                  </span>
                  <span style={{ fontSize: '1.18rem', fontWeight: 900, letterSpacing: '0.02em' }}>{p.name} {p.fouledOut && '❌'}</span>
                </div>
                <div style={{
                  fontSize: '1rem',
                  fontWeight: 900,
                  padding: '5px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.55)',
                  color: p.fouls >= 4 ? '#ff6b6b' : p.fouls >= 3 ? '#ffaa44' : '#4ade80',
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
                <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 700 }}>
                  {away.players.length === 0 ? 'No players added yet for Away' : 'Players exist but none are active'}
                </div>
                {away.players.length === 0 ? (
                  <button
                    onClick={() => handleQuickAddStartingSix('away')}
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
                    + Quick Load Starting 6
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
                    + Activate 6 Players
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Foul & Stats Buttons for Selected AWAY Player */}
          {selectedPlayer?.team === 'away' && (
            <div style={{
              borderTop: '2px solid #334466',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
              background: 'rgba(10, 20, 35, 0.98)',
              borderRadius: '10px',
              border: '1.5px solid #334466',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: 'var(--led-amber)', color: '#000', padding: '2px 8px', borderRadius: '5px', fontWeight: 900, fontSize: '0.95rem' }}>
                    #{away.players.find(p => p.id === selectedPlayer.id)?.number}
                  </span>
                  <span style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 900 }}>
                    {away.players.find(p => p.id === selectedPlayer.id)?.name}
                  </span>
                  <span style={{ fontSize: '0.88rem', color: '#aaa', fontWeight: 700 }}>
                    ({away.players.find(p => p.id === selectedPlayer.id)?.points || 0}pts · {away.players.find(p => p.id === selectedPlayer.id)?.fouls || 0}fl · {away.players.find(p => p.id === selectedPlayer.id)?.rebounds || 0}dig · {away.players.find(p => p.id === selectedPlayer.id)?.assists || 0}ace · {away.players.find(p => p.id === selectedPlayer.id)?.blocks || 0}blk)
                  </span>
                </div>
                <button
                  style={{ padding: '8px 16px', minHeight: '44px', background: '#4a5568', color: '#fff', border: '1px solid #718096', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation' }}
                  onClick={() => setSelectedPlayer(null)}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #ff6b6b 0%, #e53e3e 100%)', color: '#fff', border: '1px solid #ff4444', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}
                >
                  +FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: '#374151', color: '#fca5a5', border: '1px solid #4b5563', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}
                  disabled={away.players.find(p => p.id === selectedPlayer.id)?.fouls === 0}
                >
                  −FOUL
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #4CAF50 0%, #2e7d32 100%)', color: '#fff', border: '1px solid #45a049', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'blocks' })}
                >
                  🛡 BLK
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #2196F3 0%, #1565c0 100%)', color: '#fff', border: '1px solid #1976D2', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'assists' })}
                >
                  🏐 ACE
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #FF9800 0%, #e65100 100%)', color: '#fff', border: '1px solid #F57C00', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'rebounds' })}
                >
                  ⛏ DIG
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #9C27B0 0%, #6a1b9a 100%)', color: '#fff', border: '1px solid #7B1FA2', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'steals' })}
                >
                  🤝 AST
                </button>
                <button
                  style={{ padding: '6px 2px', height: '50px', minHeight: '50px', background: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', color: '#fff', border: '1px solid #34d399', borderRadius: '8px', fontSize: '0.96rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
                  onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 1 })}
                >
                  +1 PT
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: TOUCH SCORE CONTROLS (+ / -) & SERVING ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flexShrink: 0 }}>
        {/* Home Controls Box */}
        <div style={{ background: 'var(--cp-panel)', padding: '10px 12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px', border: '2px solid #2a3a50', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          <button
            className="vb-btn vb-btn--serve"
            style={{
              height: '52px',
              minHeight: '52px',
              padding: '0 12px',
              background: servingTeam === 'home' ? 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)' : 'var(--btn-ctrl)',
              color: '#fff',
              border: servingTeam === 'home' ? '2.5px solid var(--accent-gold)' : '2px solid var(--btn-ctrl-bdr)',
              borderRadius: '10px',
              fontSize: '1.15rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: servingTeam === 'home' ? '0 0 18px rgba(255,170,0,0.5)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: servingTeam === 'home' ? null : 'home' })}
          >
            ◀ {servingTeam === 'home' ? 'SERVE ON (TAP TO TOGGLE)' : 'HOME SERVE'}
          </button>

          <div style={{ display: 'flex', gap: '10px', height: '58px' }}>
            <button
              className="vb-btn vb-btn--score"
              style={{
                flex: 1,
                height: '58px',
                minHeight: '58px',
                padding: '0 14px',
                background: 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)',
                color: '#fff',
                border: '2px solid #22c55e',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                touchAction: 'manipulation',
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)',
              }}
              onClick={() => {
                if (selectedPlayer && selectedPlayer.team === 'home') {
                  sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 1 })
                } else {
                  sendCommand({ type: 'ADD_VB_POINT', team: 'home' })
                }
              }}
            >
              <span style={{ fontSize: '1.8rem', fontWeight: 900, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                {selectedPlayer?.team === 'home' ? 'POINT ' + home.players.find(p => p.id === selectedPlayer.id)?.name?.split(' ')[0] : 'POINT HOME'}
              </span>
            </button>
            <button
              className="vb-btn vb-btn--subtract"
              style={{
                flex: 1,
                height: '58px',
                minHeight: '58px',
                padding: '0 14px',
                background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                color: '#fff',
                border: '2px solid #ef4444',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                touchAction: 'manipulation',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
              }}
              onClick={() => {
                if (selectedPlayer && selectedPlayer.team === 'home') {
                  const p = home.players.find(x => x.id === selectedPlayer.id)
                  if (p && p.points > 0) {
                    sendCommand({ type: 'SUBTRACT_PLAYER_STAT', team: 'home', playerId: selectedPlayer.id, stat: 'points' })
                  }
                }
                sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'home' })
              }}
              disabled={home.score <= 0}
              title="Minus Point Home"
            >
              <span style={{ fontSize: '1.8rem', fontWeight: 900, lineHeight: 1 }}>−</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>MINUS</span>
            </button>
          </div>
        </div>

        {/* Away Controls Box */}
        <div style={{ background: 'var(--cp-panel)', padding: '10px 12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px', border: '2px solid #2a3a50', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          <button
            className="vb-btn vb-btn--serve"
            style={{
              height: '52px',
              minHeight: '52px',
              padding: '0 12px',
              background: servingTeam === 'away' ? 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)' : 'var(--btn-ctrl)',
              color: '#fff',
              border: servingTeam === 'away' ? '2.5px solid var(--accent-gold)' : '2px solid var(--btn-ctrl-bdr)',
              borderRadius: '10px',
              fontSize: '1.15rem',
              fontWeight: 900,
              cursor: 'pointer',
              touchAction: 'manipulation',
              boxShadow: servingTeam === 'away' ? '0 0 18px rgba(255,170,0,0.5)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: servingTeam === 'away' ? null : 'away' })}
          >
            {servingTeam === 'away' ? 'SERVE ON (TAP TO TOGGLE)' : 'AWAY SERVE'} ▶
          </button>

          <div style={{ display: 'flex', gap: '10px', height: '58px' }}>
            <button
              className="vb-btn vb-btn--score"
              style={{
                flex: 1,
                height: '58px',
                minHeight: '58px',
                padding: '0 14px',
                background: 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)',
                color: '#fff',
                border: '2px solid #22c55e',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                touchAction: 'manipulation',
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)',
              }}
              onClick={() => {
                if (selectedPlayer && selectedPlayer.team === 'away') {
                  sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 1 })
                } else {
                  sendCommand({ type: 'ADD_VB_POINT', team: 'away' })
                }
              }}
            >
              <span style={{ fontSize: '1.8rem', fontWeight: 900, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                {selectedPlayer?.team === 'away' ? 'POINT ' + away.players.find(p => p.id === selectedPlayer.id)?.name?.split(' ')[0] : 'POINT AWAY'}
              </span>
            </button>
            <button
              className="vb-btn vb-btn--subtract"
              style={{
                flex: 1,
                height: '58px',
                minHeight: '58px',
                padding: '0 14px',
                background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                color: '#fff',
                border: '2px solid #ef4444',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                touchAction: 'manipulation',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
              }}
              onClick={() => {
                if (selectedPlayer && selectedPlayer.team === 'away') {
                  const p = away.players.find(x => x.id === selectedPlayer.id)
                  if (p && p.points > 0) {
                    sendCommand({ type: 'SUBTRACT_PLAYER_STAT', team: 'away', playerId: selectedPlayer.id, stat: 'points' })
                  }
                }
                sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'away' })
              }}
              disabled={away.score <= 0}
              title="Minus Point Away"
            >
              <span style={{ fontSize: '1.8rem', fontWeight: 900, lineHeight: 1 }}>−</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>MINUS</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── ROW 4: TOUCH TIMEOUTS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flexShrink: 0 }}>
        {/* Home Timeout */}
        <button
          className="vb-btn vb-btn--timeout"
          style={{
            height: '54px',
            minHeight: '54px',
            padding: '8px 14px',
            background: timeoutsUsed.home >= 2 ? '#222630' : 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)',
            color: '#fff',
            border: timeoutsUsed.home >= 2 ? '2px solid #444b5a' : '2px solid #a78bfa',
            borderRadius: '10px',
            fontSize: '1.12rem',
            fontWeight: 900,
            cursor: timeoutsUsed.home >= 2 ? 'not-allowed' : 'pointer',
            touchAction: 'manipulation',
            textTransform: 'uppercase',
            boxShadow: timeoutsUsed.home >= 2 ? 'none' : '0 4px 14px rgba(124, 58, 237, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'home' })}
          disabled={timeoutsUsed.home >= 2}
        >
          ⏱️ HOME TIMEOUT ({2 - timeoutsUsed.home} LEFT)
        </button>

        {/* Away Timeout */}
        <button
          className="vb-btn vb-btn--timeout"
          style={{
            height: '54px',
            minHeight: '54px',
            padding: '8px 14px',
            background: timeoutsUsed.away >= 2 ? '#222630' : 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)',
            color: '#fff',
            border: timeoutsUsed.away >= 2 ? '2px solid #444b5a' : '2px solid #a78bfa',
            borderRadius: '10px',
            fontSize: '1.12rem',
            fontWeight: 900,
            cursor: timeoutsUsed.away >= 2 ? 'not-allowed' : 'pointer',
            touchAction: 'manipulation',
            textTransform: 'uppercase',
            boxShadow: timeoutsUsed.away >= 2 ? 'none' : '0 4px 14px rgba(124, 58, 237, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'away' })}
          disabled={timeoutsUsed.away >= 2}
        >
          ⏱️ AWAY TIMEOUT ({2 - timeoutsUsed.away} LEFT)
        </button>
      </div>

      {/* ── ROW 5: TOUCH ACTION CONTROLS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', flexShrink: 0 }}>
        <button
          className="vb-btn vb-btn--advance"
          style={{ height: '54px', minHeight: '54px', padding: '6px 4px', background: 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)', color: '#fff', border: '2px solid #a78bfa', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'ADVANCE_SET' })}
        >
          ⏭ NEXT SET
        </button>

        <button
          className="vb-btn vb-btn--switch"
          style={{ height: '54px', minHeight: '54px', padding: '6px 4px', background: 'linear-gradient(180deg, #ea580c 0%, #c2410c 100%)', color: '#fff', border: '2px solid #fb923c', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
        >
          ⇄ SWITCH
        </button>

        <button
          className="vb-btn"
          style={{ height: '54px', minHeight: '54px', padding: '6px 4px', background: '#1e293b', color: '#f1f5f9', border: '2px solid #475569', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
          onClick={() => sendCommand({ type: 'UNDO' })}
        >
          ↶ UNDO
        </button>

        <button
          className="vb-btn"
          style={{ height: '54px', minHeight: '54px', padding: '6px 4px', background: '#2d3748', color: '#fff', border: '2px solid #4a5568', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
          onClick={() => setShowBoxScore(true)}
          title="View Player Statistics Box Score"
        >
          📊 STATS
        </button>

        <button
          className="vb-btn"
          style={{ height: '54px', minHeight: '54px', padding: '6px 4px', background: '#2d3748', color: '#fff', border: '2px solid #4a5568', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
          onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}
          title="Open Scoreboard TV Display"
        >
          📺 TV
        </button>

        <button
          className="vb-btn"
          style={{ height: '54px', minHeight: '54px', padding: '6px 4px', background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)', color: '#fff', border: '2px solid #ef4444', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap' }}
          onClick={() => setShowResetModal(true)}
        >
          🔄 RESET
        </button>
      </div>

      {/* ── RESET VOLLEYBALL CONFIRMATION MODAL ── */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vb-reset-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowResetModal(false)
          }}
        >
          <div
            style={{
              backgroundColor: '#121824',
              border: '2px solid rgba(239, 68, 68, 0.65)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(239, 68, 68, 0.3)',
              borderRadius: '16px',
              padding: '28px 32px',
              maxWidth: '480px',
              width: '100%',
              color: '#ffffff',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            <div style={{ fontSize: '2.6rem', lineHeight: 1 }}>🔄</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h2 id="vb-reset-title" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', letterSpacing: '0.5px' }}>
                Reset Volleyball Match?
              </h2>
              <p style={{ margin: 0, fontSize: '1rem', color: '#94a3b8', lineHeight: 1.5 }}>
                Select how you would like to reset. Current set scores, timeouts, and stats will be refreshed.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                style={{
                  minHeight: '52px',
                  background: 'linear-gradient(180deg, #d97706 0%, #b45309 100%)',
                  border: '1px solid #f59e0b',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(217, 119, 6, 0.4)',
                  touchAction: 'manipulation',
                }}
                onClick={() => {
                  sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })
                  setShowResetModal(false)
                }}
              >
                Reset Match Scores (Keep Players)
              </button>
              <button
                type="button"
                style={{
                  minHeight: '52px',
                  background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)',
                  border: '1px solid #ef4444',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
                  touchAction: 'manipulation',
                }}
                onClick={() => {
                  sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: true })
                  setShowResetModal(false)
                }}
              >
                Reset All (Clear Rosters & Start New)
              </button>
              <button
                type="button"
                style={{
                  minHeight: '50px',
                  backgroundColor: '#242f42',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  color: '#cbd5e1',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  marginTop: '4px',
                }}
                onClick={() => setShowResetModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
