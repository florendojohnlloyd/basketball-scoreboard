import React from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import { formatClockDisplay } from '@renderer/shared/clockUtils'

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
}: VolleyballScoreTabProps): React.ReactElement {
  const gs = useControlPanelStore(s => s.gameState)
  const { home, away, volleyball } = gs

  if (!volleyball) {
    return <div style={{ padding: '20px', color: '#d0dce8' }}>Volleyball state not initialized</div>
  }

  const { currentSet, setsWon, timeoutsUsed, substitutionsUsed, servingTeam, pointsCurrentSet } = volleyball

  // Get active non-fouled-out players (up to 5)
  const homePlayers = home.players.filter(p => p.active && !p.fouledOut).slice(0, 5)
  const awayPlayers = away.players.filter(p => p.active && !p.fouledOut).slice(0, 5)

  return (
    <div
      className="vb-score-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--cp-bg)',
        padding: '8px',
        gap: '6px',
        boxSizing: 'border-box',
      }}
    >
      {/* ROW 1 — Header strip (set info) */}
      <div
        className="vb-header"
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          padding: '8px',
          background: 'var(--cp-panel)',
          borderRadius: 'var(--r-md)',
        }}
      >
        {/* Home side */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ fontSize: '1.2rem', color: home.config.color || '#1a4fd6', fontWeight: 700 }}>
            {home.config.name}
          </div>
          <div
            style={{
              fontSize: '3rem',
              color: 'var(--led-amber)',
              fontFamily: 'Orbitron, monospace',
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {home.score}
          </div>
        </div>

        {/* Center — SET display */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div
            style={{
              fontSize: '2.5rem',
              color: 'var(--led-amber)',
              fontFamily: 'Orbitron, monospace',
              fontWeight: 900,
              background: 'var(--cp-led-bg)',
              padding: '8px 16px',
              borderRadius: 'var(--r-sm)',
            }}
          >
            SET {currentSet}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-label)' }}>Sets Won:</div>
            <div style={{ fontSize: '1.2rem', color: 'var(--led-amber)', fontFamily: 'Orbitron' }}>
              {setsWon.home} - {setsWon.away}
            </div>
          </div>
        </div>

        {/* Away side */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '1.2rem', color: away.config.color || '#c0392b', fontWeight: 700 }}>
            {away.config.name}
          </div>
          <div
            style={{
              fontSize: '3rem',
              color: 'var(--led-amber)',
              fontFamily: 'Orbitron, monospace',
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {away.score}
          </div>
        </div>
      </div>

      {/* ROW 2 — Serving indicator */}
      <div
        className="vb-serve-bar"
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          padding: '6px',
          background: 'var(--cp-panel)',
          borderRadius: 'var(--r-sm)',
        }}
      >
        <button
          className="btn"
          style={{
            minHeight: '48px',
            padding: '8px 16px',
            background: servingTeam === 'home' ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: 'home' })}
        >
          ◄ HOME SERVE
        </button>
        <div
          style={{
            fontSize: '1rem',
            color: 'var(--led-amber)',
            fontFamily: 'Orbitron',
            background: 'var(--cp-led-bg)',
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          SERVING: {servingTeam ? servingTeam.toUpperCase() : '---'}
        </div>
        <button
          className="btn"
          style={{
            minHeight: '48px',
            padding: '8px 16px',
            background: servingTeam === 'away' ? 'var(--btn-amber)' : 'var(--btn-ctrl)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => sendCommand({ type: 'SET_SERVING_TEAM', team: 'away' })}
        >
          AWAY SERVE ►
        </button>
      </div>

      {/* ROW 3 — Score controls (main action row) */}
      <div
        className="vb-score-row"
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: '12px',
          flex: 1,
        }}
      >
        {/* Home column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            className="btn btn--g"
            style={{
              minHeight: '64px',
              background: 'var(--btn-green)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1.5rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'ADD_VB_POINT', team: 'home' })}
          >
            +1 HOME
          </button>
          <button
            className="btn btn--r"
            style={{
              minHeight: '64px',
              background: 'var(--btn-switch)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1.2rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'home' })}
            disabled={home.score <= 0}
          >
            -1 HOME
          </button>

          {/* Home player list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-label)', marginBottom: '4px' }}>
              HOME PLAYERS:
            </div>
            {homePlayers.map(p => (
              <div
                key={p.id}
                style={{
                  padding: '6px 8px',
                  background:
                    selectedPlayer?.id === p.id ? 'var(--accent-orange)' : 'var(--cp-bg2)',
                  color: '#fff',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
                onClick={() => setSelectedPlayer({ team: 'home', id: p.id })}
              >
                <span>
                  #{p.number} {p.name}
                </span>
                <span>{p.points}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center column */}
        <div
          style={{
            flex: 0.6,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <button
            className="btn"
            style={{
              minHeight: '80px',
              width: '100%',
              background: '#6b3fa0',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-md)',
              fontSize: '1.5rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'ADVANCE_SET' })}
          >
            ADVANCE SET
          </button>
          <button
            className="btn"
            style={{
              minHeight: '64px',
              width: '100%',
              background: '#6b3fa0',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1.2rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => {
              import('../audio/audioEngine').then(m => m.audioEngine.playEndOfPeriod())
            }}
          >
            <svg
              viewBox="0 0 512 512"
              fill="currentColor"
              style={{ width: '1.2em', height: '1.2em', marginRight: '4px' }}
            >
              <path d="M160 288h-16c-35.3 0-64-28.7-64-64V128L0 64v384l80-64v-32c0-35.3 28.7-64 64-64h16zm256-64V96c88.4 0 160 71.6 160 160s-71.6 160-160 160V288zm32-64c53 0 96 43 96 96s-43 96-96 96V224zM256 64l-96 64v256l96 64V64z" />
            </svg>
            HORN
          </button>
          <button
            className="btn btn--sw"
            style={{
              minHeight: '64px',
              width: '100%',
              background: 'var(--btn-switch)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}
          >
            SWITCH
          </button>
          <button
            className="btn"
            style={{
              minHeight: '64px',
              width: '100%',
              background: 'var(--btn-ctrl)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'UNDO' })}
          >
            ↶ UNDO
          </button>

          {/* Mini scoreboard preview */}
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background: 'var(--cp-led-bg)',
              borderRadius: 'var(--r-sm)',
              width: '100%',
              fontSize: '0.85rem',
              color: 'var(--led-amber)',
              fontFamily: 'Orbitron',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>{home.config.name}</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{home.score}</span>
              <span>VS</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{away.score}</span>
              <span>{away.config.name}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              SET {currentSet} | SERVE: {servingTeam?.toUpperCase() ?? '---'}
            </div>
          </div>
        </div>

        {/* Away column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            className="btn btn--g"
            style={{
              minHeight: '64px',
              background: 'var(--btn-green)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1.5rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'ADD_VB_POINT', team: 'away' })}
          >
            +1 AWAY
          </button>
          <button
            className="btn btn--r"
            style={{
              minHeight: '64px',
              background: 'var(--btn-switch)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1.2rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'away' })}
            disabled={away.score <= 0}
          >
            -1 AWAY
          </button>

          {/* Away player list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-label)', marginBottom: '4px' }}>
              AWAY PLAYERS:
            </div>
            {awayPlayers.map(p => (
              <div
                key={p.id}
                style={{
                  padding: '6px 8px',
                  background:
                    selectedPlayer?.id === p.id ? 'var(--accent-orange)' : 'var(--cp-bg2)',
                  color: '#fff',
                  borderRadius: 'var(--r-sm)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
                onClick={() => setSelectedPlayer({ team: 'away', id: p.id })}
              >
                <span>
                  #{p.number} {p.name}
                </span>
                <span>{p.points}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 4 — Timeouts */}
      <div
        className="vb-stats-row"
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '8px',
        }}
      >
        {/* Home timeouts */}
        <div
          style={{
            flex: 1,
            background: 'var(--cp-panel)',
            padding: '12px',
            borderRadius: 'var(--r-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--text-label)' }}>TIMEOUTS (HOME)</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {Array.from({ length: 2 - timeoutsUsed.home }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: 'var(--led-amber)',
                }}
              />
            ))}
            <span style={{ marginLeft: '8px', color: 'var(--led-amber)', fontSize: '1.2rem' }}>
              {2 - timeoutsUsed.home} / 2
            </span>
          </div>
          <button
            className="btn"
            style={{
              minHeight: '48px',
              background: 'var(--btn-amber)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'home' })}
            disabled={timeoutsUsed.home >= 2}
          >
            USE TIMEOUT
          </button>
        </div>

        {/* Center — RESET */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            className="btn"
            style={{
              minHeight: '64px',
              padding: '12px 24px',
              background: 'var(--btn-ctrl)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-md)',
              fontSize: '1.2rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'NEW_VOLLEYBALL_GAME', clearTeams: false })}
          >
            RESET
          </button>
        </div>

        {/* Away timeouts */}
        <div
          style={{
            flex: 1,
            background: 'var(--cp-panel)',
            padding: '12px',
            borderRadius: 'var(--r-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--text-label)' }}>TIMEOUTS (AWAY)</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {Array.from({ length: 2 - timeoutsUsed.away }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: 'var(--led-amber)',
                }}
              />
            ))}
            <span style={{ marginLeft: '8px', color: 'var(--led-amber)', fontSize: '1.2rem' }}>
              {2 - timeoutsUsed.away} / 2
            </span>
          </div>
          <button
            className="btn"
            style={{
              minHeight: '48px',
              background: 'var(--btn-amber)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => sendCommand({ type: 'USE_VB_TIMEOUT', team: 'away' })}
            disabled={timeoutsUsed.away >= 2}
          >
            USE TIMEOUT
          </button>
        </div>
      </div>

      {/* ROW 5 — Substitutions */}
      <div
        className="vb-subs-row"
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '8px',
        }}
      >
        {/* Home subs */}
        <div
          style={{
            flex: 1,
            background: 'var(--cp-panel)',
            padding: '12px',
            borderRadius: 'var(--r-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <button
            className="btn"
            style={{
              minHeight: '56px',
              flex: 1,
              background: 'var(--accent-cyan)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setShowSubModal('home')}
          >
            SUB HOME
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Remaining</div>
            <div style={{ fontSize: '1.5rem', color: 'var(--led-amber)', fontFamily: 'Orbitron' }}>
              {6 - substitutionsUsed.home}
            </div>
          </div>
        </div>

        {/* Away subs */}
        <div
          style={{
            flex: 1,
            background: 'var(--cp-panel)',
            padding: '12px',
            borderRadius: 'var(--r-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Remaining</div>
            <div style={{ fontSize: '1.5rem', color: 'var(--led-amber)', fontFamily: 'Orbitron' }}>
              {6 - substitutionsUsed.away}
            </div>
          </div>
          <button
            className="btn"
            style={{
              minHeight: '56px',
              flex: 1,
              background: 'var(--accent-cyan)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => setShowSubModal('away')}
          >
            SUB AWAY
          </button>
        </div>
      </div>
    </div>
  )
}
