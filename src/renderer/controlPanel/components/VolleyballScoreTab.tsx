import React from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { TimeoutSettings } from './TimeoutSettings'
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

  if (!volleyball) {
    return <div style={{ padding: '20px', color: '#d0dce8' }}>Volleyball state not initialized</div>
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
        padding: '10px 12px 12px 12px',
        gap: '10px',
        boxSizing: 'border-box',
        userSelect: 'none',
        overflow: 'hidden',
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

      {/* ── ROW 2: TOUCH SCORE CONTROLS (+ / -) & SERVING (Flex 1.3) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flex: 1.3, minHeight: 0 }}>
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

          <div style={{ display: 'flex', gap: '10px', flex: 1, minHeight: 0 }}>
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
              onClick={() => sendCommand({ type: 'ADD_VB_POINT', team: 'home' })}
            >
              <span style={{ fontSize: '2.8rem' }}>+</span>
              <span>POINT HOME</span>
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

          <div style={{ display: 'flex', gap: '10px', flex: 1, minHeight: 0 }}>
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
              onClick={() => sendCommand({ type: 'ADD_VB_POINT', team: 'away' })}
            >
              <span style={{ fontSize: '2.8rem' }}>+</span>
              <span>POINT AWAY</span>
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

      {/* ── ROW 3: TOUCH TIMEOUTS (Flex 1) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flex: 1, minHeight: 0 }}>
        {/* Home Timeout */}
        <div style={{ background: 'var(--cp-panel)', padding: '12px', borderRadius: 'var(--r-md)', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            className="vb-btn vb-btn--timeout"
            style={{ flex: 1, height: '100%', minHeight: '65px', padding: '14px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: 'var(--r-md)', fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'home' })}
            disabled={timeoutsUsed.home >= 2}
          >
            ⏸ HOME TIMEOUT ({2 - timeoutsUsed.home} LEFT)
          </button>
        </div>

        {/* Away Timeout */}
        <div style={{ background: 'var(--cp-panel)', padding: '12px', borderRadius: 'var(--r-md)', display: 'flex', border: '2px solid #6b3fa0', alignItems: 'center' }}>
          <button
            className="vb-btn vb-btn--timeout"
            style={{ flex: 1, height: '100%', minHeight: '65px', padding: '14px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: 'var(--r-md)', fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'away' })}
            disabled={timeoutsUsed.away >= 2}
          >
            ⏸ AWAY TIMEOUT ({2 - timeoutsUsed.away} LEFT)
          </button>
        </div>
      </div>

      {/* ── ROW 4: TOUCH ACTION CONTROLS (Flex 0.9 - NO HORN) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', flex: 0.9, minHeight: 0 }}>
        <button
          className="vb-btn vb-btn--advance"
          style={{ height: '100%', minHeight: '60px', padding: '14px 6px', background: '#6b3fa0', color: '#fff', border: '2px solid #8550c0', borderRadius: 'var(--r-md)', fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => sendCommand({ type: 'ADVANCE_SET' })}
        >
          ⏭ NEXT SET
        </button>

        <button
          className="vb-btn vb-btn--switch"
          style={{ height: '100%', minHeight: '60px', padding: '14px 6px', background: 'var(--btn-switch)', color: '#fff', border: '2px solid #e03818', borderRadius: 'var(--r-md)', fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
        >
          ⇄ SWITCH
        </button>

        <button
          className="vb-btn"
          style={{ height: '100%', minHeight: '60px', padding: '14px 6px', background: 'var(--btn-ctrl)', color: '#fff', border: '2px solid var(--btn-ctrl-bdr)', borderRadius: 'var(--r-md)', fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => sendCommand({ type: 'UNDO' })}
        >
          ↶ UNDO
        </button>

        <button
          className="vb-btn"
          style={{height: '100%', minHeight: '60px', padding: '14px 6px', background: '#2d3748', color: '#fff', border: '2px solid #4a5568', borderRadius: 'var(--r-md)', fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation'}}
          onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}
          title="Open Scoreboard TV Display"
        >
          📺 TV
        </button>

        <button
          className="vb-btn"
          style={{ height: '100%', minHeight: '60px', padding: '14px 6px', background: '#b02020', color: '#fff', border: '2px solid #e03030', borderRadius: 'var(--r-md)', fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', touchAction: 'manipulation' }}
          onClick={() => sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })}
        >
          🔄 RESET
        </button>
      </div>

      {/* Timeout Ads Settings (collapsible at bottom) */}
      <details style={{ background: 'var(--cp-panel)', padding: '6px 12px', borderRadius: 'var(--r-md)', border: '1px solid #334466', flexShrink: 0 }}>
        <summary style={{ cursor: 'pointer', color: '#ffcc00', fontWeight: 700, fontSize: '0.9rem' }}>
          ⚙️ Timeout Screen Ads Settings
        </summary>
        <div style={{ marginTop: '8px' }}>
          <TimeoutSettings />
        </div>
      </details>
    </div>
  )
}
