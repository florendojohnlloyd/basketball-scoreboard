import React from 'react'
import { useControlPanelStore, sendCommand } from '../store'

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

  if (!volleyball) {
    return <div style={{ padding: '20px', color: '#d0dce8' }}>Volleyball state not initialized</div>
  }

  const { currentSet, setsWon, timeoutsUsed, substitutionsUsed, servingTeam } = volleyball

  // Get active non-fouled-out players (up to 6 for volleyball)
  const homePlayers = home.players.filter(p => p.active && !p.fouledOut).slice(0, 6)
  const awayPlayers = away.players.filter(p => p.active && !p.fouledOut).slice(0, 6)

  return (
    <div
      className="vb-score-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
        background: 'var(--cp-bg)',
        padding: '12px',
        gap: '16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header - Game Info */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '16px',
          padding: '16px',
          background: 'var(--cp-panel)',
          borderRadius: 'var(--r-md)',
          border: '2px solid var(--accent-orange)',
        }}
      >
        {/* Home Team */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ fontSize: '1.1rem', color: home.config.color || '#1a4fd6', fontWeight: 700 }}>
            {home.config.name}
          </div>
          <div
            style={{
              fontSize: '4rem',
              color: 'var(--led-red)',
              fontFamily: 'var(--font-led)',
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {home.score}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Sets: <span style={{ color: 'var(--led-amber)', fontWeight: 700 }}>{setsWon.home}</span>
          </div>
        </div>

        {/* Center - SET */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <div
            style={{
              fontSize: '3rem',
              color: 'var(--led-amber)',
              fontFamily: 'var(--font-led)',
              fontWeight: 900,
              background: 'var(--cp-led-bg)',
              padding: '12px 24px',
              borderRadius: 'var(--r-md)',
              border: '2px solid var(--accent-orange)',
            }}
          >
            SET {currentSet}
          </div>
        </div>

        {/* Away Team */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ fontSize: '1.1rem', color: away.config.color || '#c0392b', fontWeight: 700 }}>
            {away.config.name}
          </div>
          <div
            style={{
              fontSize: '4rem',
              color: 'var(--led-red)',
              fontFamily: 'var(--font-led)',
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {away.score}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Sets: <span style={{ color: 'var(--led-amber)', fontWeight: 700 }}>{setsWon.away}</span>
          </div>
        </div>
      </div>

      {/* Serving Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '16px',
          alignItems: 'center',
        }}
      >
        <button
          className="vb-btn vb-btn--serve"
          style={{
            minHeight: '80px',
            padding: '16px',
            background: servingTeam === 'home' ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
            color: '#fff',
            border: servingTeam === 'home' ? '3px solid var(--accent-gold)' : '2px solid var(--btn-ctrl-bdr)',
            borderRadius: 'var(--r-md)',
            fontSize: '1.3rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: 'home' })}
        >
          <span style={{ fontSize: '2rem' }}>◀</span>
          <span>HOME SERVE</span>
        </button>

        <div
          style={{
            fontSize: '1rem',
            color: 'var(--led-amber)',
            fontFamily: 'var(--font-led)',
            background: 'var(--cp-led-bg)',
            padding: '12px 16px',
            borderRadius: 'var(--r-md)',
            textAlign: 'center',
            border: '2px solid var(--accent-orange)',
            fontWeight: 700,
          }}
        >
          SERVING:<br/>
          {servingTeam ? servingTeam.toUpperCase() : '---'}
        </div>

        <button
          className="vb-btn vb-btn--serve"
          style={{
            minHeight: '80px',
            padding: '16px',
            background: servingTeam === 'away' ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
            color: '#fff',
            border: servingTeam === 'away' ? '3px solid var(--accent-gold)' : '2px solid var(--btn-ctrl-bdr)',
            borderRadius: 'var(--r-md)',
            fontSize: '1.3rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: 'away' })}
        >
          <span style={{ fontSize: '2rem' }}>▶</span>
          <span>AWAY SERVE</span>
        </button>
      </div>

      {/* Score Controls Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
        }}
      >
        {/* Home Score Buttons */}
        <button
          className="vb-btn vb-btn--score"
          style={{
            minHeight: '100px',
            padding: '20px',
            background: 'var(--btn-green)',
            color: '#fff',
            border: '3px solid var(--btn-green-dk)',
            borderRadius: 'var(--r-md)',
            fontSize: '2rem',
            fontWeight: 900,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'ADD_VB_POINT', team: 'home' })}
        >
          <span style={{ fontSize: '2.5rem' }}>+</span>
          <span>POINT HOME</span>
        </button>

        {/* Away Score Buttons */}
        <button
          className="vb-btn vb-btn--score"
          style={{
            minHeight: '100px',
            padding: '20px',
            background: 'var(--btn-green)',
            color: '#fff',
            border: '3px solid var(--btn-green-dk)',
            borderRadius: 'var(--r-md)',
            fontSize: '2rem',
            fontWeight: 900,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'ADD_VB_POINT', team: 'away' })}
        >
          <span style={{ fontSize: '2.5rem' }}>+</span>
          <span>POINT AWAY</span>
        </button>

        {/* Home Subtract */}
        <button
          className="vb-btn vb-btn--subtract"
          style={{
            minHeight: '80px',
            padding: '16px',
            background: 'var(--btn-switch)',
            color: '#fff',
            border: '2px solid #801000',
            borderRadius: 'var(--r-md)',
            fontSize: '1.5rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'home' })}
          disabled={home.score <= 0}
        >
          <span>−</span>
          <span>HOME</span>
        </button>

        {/* Away Subtract */}
        <button
          className="vb-btn vb-btn--subtract"
          style={{
            minHeight: '80px',
            padding: '16px',
            background: 'var(--btn-switch)',
            color: '#fff',
            border: '2px solid #801000',
            borderRadius: 'var(--r-md)',
            fontSize: '1.5rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'away' })}
          disabled={away.score <= 0}
        >
          <span>−</span>
          <span>AWAY</span>
        </button>
      </div>

      {/* Timeouts Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
        }}
      >
        {/* Home Timeout */}
        <div
          style={{
            background: 'var(--cp-panel)',
            padding: '16px',
            borderRadius: 'var(--r-md)',
            border: '2px solid #6b3fa0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-label)', fontWeight: 700 }}>HOME TIMEOUTS</div>
            <div style={{ fontSize: '2rem', color: 'var(--led-amber)', fontFamily: 'var(--font-led)' }}>
              {2 - timeoutsUsed.home}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {Array.from({ length: 2 - timeoutsUsed.home }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'var(--led-amber)',
                  boxShadow: '0 0 10px var(--led-glow)',
                }}
              />
            ))}
          </div>
          <button
            className="vb-btn vb-btn--timeout"
            style={{
              minHeight: '80px',
              padding: '16px',
              background: '#6b3fa0',
              color: '#fff',
              border: '2px solid #4a2870',
              borderRadius: 'var(--r-md)',
              fontSize: '1.3rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'home' })}
            disabled={timeoutsUsed.home >= 2}
          >
            <span style={{ fontSize: '1.5rem' }}>⏸</span>
            <span>USE TIMEOUT</span>
          </button>
        </div>

        {/* Away Timeout */}
        <div
          style={{
            background: 'var(--cp-panel)',
            padding: '16px',
            borderRadius: 'var(--r-md)',
            border: '2px solid #6b3fa0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-label)', fontWeight: 700 }}>AWAY TIMEOUTS</div>
            <div style={{ fontSize: '2rem', color: 'var(--led-amber)', fontFamily: 'var(--font-led)' }}>
              {2 - timeoutsUsed.away}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {Array.from({ length: 2 - timeoutsUsed.away }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'var(--led-amber)',
                  boxShadow: '0 0 10px var(--led-glow)',
                }}
              />
            ))}
          </div>
          <button
            className="vb-btn vb-btn--timeout"
            style={{
              minHeight: '80px',
              padding: '16px',
              background: '#6b3fa0',
              color: '#fff',
              border: '2px solid #4a2870',
              borderRadius: 'var(--r-md)',
              fontSize: '1.3rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'away' })}
            disabled={timeoutsUsed.away >= 2}
          >
            <span style={{ fontSize: '1.5rem' }}>⏸</span>
            <span>USE TIMEOUT</span>
          </button>
        </div>
      </div>

      {/* Substitutions Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
        }}
      >
        {/* Home Subs */}
        <div
          style={{
            background: 'var(--cp-panel)',
            padding: '16px',
            borderRadius: 'var(--r-md)',
            border: '2px solid var(--accent-cyan)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-label)', fontWeight: 700 }}>HOME SUBS</div>
            <div style={{ fontSize: '2rem', color: 'var(--led-amber)', fontFamily: 'var(--font-led)' }}>
              {6 - substitutionsUsed.home}
            </div>
          </div>
          <button
            className="vb-btn vb-btn--sub"
            style={{
              minHeight: '80px',
              padding: '16px',
              background: 'var(--accent-cyan)',
              color: '#fff',
              border: '2px solid #0d7a8a',
              borderRadius: 'var(--r-md)',
              fontSize: '1.3rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onClick={() => setShowSubModal('home')}
          >
            <span style={{ fontSize: '1.5rem' }}>⇄</span>
            <span>SUBSTITUTE</span>
          </button>
        </div>

        {/* Away Subs */}
        <div
          style={{
            background: 'var(--cp-panel)',
            padding: '16px',
            borderRadius: 'var(--r-md)',
            border: '2px solid var(--accent-cyan)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-label)', fontWeight: 700 }}>AWAY SUBS</div>
            <div style={{ fontSize: '2rem', color: 'var(--led-amber)', fontFamily: 'var(--font-led)' }}>
              {6 - substitutionsUsed.away}
            </div>
          </div>
          <button
            className="vb-btn vb-btn--sub"
            style={{
              minHeight: '80px',
              padding: '16px',
              background: 'var(--accent-cyan)',
              color: '#fff',
              border: '2px solid #0d7a8a',
              borderRadius: 'var(--r-md)',
              fontSize: '1.3rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onClick={() => setShowSubModal('away')}
          >
            <span style={{ fontSize: '1.5rem' }}>⇄</span>
            <span>SUBSTITUTE</span>
          </button>
        </div>
      </div>

      {/* Control Buttons Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
        }}
      >
        <button
          className="vb-btn vb-btn--advance"
          style={{
            minHeight: '100px',
            padding: '20px',
            background: '#6b3fa0',
            color: '#fff',
            border: '3px solid #4a2870',
            borderRadius: 'var(--r-md)',
            fontSize: '1.5rem',
            fontWeight: 900,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'ADVANCE_SET' })}
        >
          <span style={{ fontSize: '2rem' }}>⏭</span>
          <span>NEXT SET</span>
        </button>

        <button
          className="vb-btn vb-btn--horn"
          style={{
            minHeight: '100px',
            padding: '20px',
            background: '#6b3fa0',
            color: '#fff',
            border: '3px solid #4a2870',
            borderRadius: 'var(--r-md)',
            fontSize: '1.5rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => {
            import('../audio/audioEngine').then(m => m.audioEngine.playEndOfPeriod())
          }}
        >
          <span style={{ fontSize: '2rem' }}>📢</span>
          <span>HORN</span>
        </button>

        <button
          className="vb-btn vb-btn--switch"
          style={{
            minHeight: '100px',
            padding: '20px',
            background: 'var(--btn-switch)',
            color: '#fff',
            border: '3px solid #801000',
            borderRadius: 'var(--r-md)',
            fontSize: '1.5rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
        >
          <span style={{ fontSize: '2rem' }}>⇄</span>
          <span>SWITCH</span>
        </button>
      </div>

      {/* Bottom Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
        }}
      >
        <button
          className="vb-btn vb-btn--undo"
          style={{
            minHeight: '80px',
            padding: '16px',
            background: 'var(--btn-ctrl)',
            color: '#fff',
            border: '2px solid var(--btn-ctrl-bdr)',
            borderRadius: 'var(--r-md)',
            fontSize: '1.3rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'UNDO' })}
        >
          <span style={{ fontSize: '1.5rem' }}>↶</span>
          <span>UNDO</span>
        </button>

        <button
          className="vb-btn vb-btn--reset"
          style={{
            minHeight: '80px',
            padding: '16px',
            background: 'var(--btn-ctrl)',
            color: '#fff',
            border: '2px solid var(--btn-ctrl-bdr)',
            borderRadius: 'var(--r-md)',
            fontSize: '1.3rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })}
        >
          <span style={{ fontSize: '1.5rem' }}>🔄</span>
          <span>RESET</span>
        </button>
      </div>

      {/* Player Lists */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
        }}
      >
        {/* Home Players */}
        <div
          style={{
            background: 'var(--cp-panel)',
            padding: '16px',
            borderRadius: 'var(--r-md)',
            border: '2px solid #1a4fd6',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: 'var(--text-label)', fontWeight: 700, marginBottom: '12px' }}>
            HOME PLAYERS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {homePlayers.map(p => (
              <div
                key={p.id}
                style={{
                  padding: '12px',
                  background:
                    selectedPlayer?.id === p.id ? 'var(--accent-orange)' : 'var(--cp-bg2)',
                  color: '#fff',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  border: selectedPlayer?.id === p.id ? '2px solid var(--accent-gold)' : '1px solid #2a3040',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => setSelectedPlayer({ team: 'home', id: p.id })}
              >
                <span>
                  #{p.number} {p.name}
                </span>
                <span style={{ color: 'var(--led-amber)' }}>{p.points}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Away Players */}
        <div
          style={{
            background: 'var(--cp-panel)',
            padding: '16px',
            borderRadius: 'var(--r-md)',
            border: '2px solid #c0392b',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: 'var(--text-label)', fontWeight: 700, marginBottom: '12px' }}>
            AWAY PLAYERS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {awayPlayers.map(p => (
              <div
                key={p.id}
                style={{
                  padding: '12px',
                  background:
                    selectedPlayer?.id === p.id ? 'var(--accent-orange)' : 'var(--cp-bg2)',
                  color: '#fff',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  border: selectedPlayer?.id === p.id ? '2px solid var(--accent-gold)' : '1px solid #2a3040',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => setSelectedPlayer({ team: 'away', id: p.id })}
              >
                <span>
                  #{p.number} {p.name}
                </span>
                <span style={{ color: 'var(--led-amber)' }}>{p.points}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
