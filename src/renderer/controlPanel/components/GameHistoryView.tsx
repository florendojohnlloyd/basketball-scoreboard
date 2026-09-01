import React, { useState, useEffect, useCallback } from 'react'
import { useControlPanelStore } from '../store'
import type { GameLogRecord } from '@shared/types'
import BoxScoreView from './BoxScoreView'
import './GameHistoryView.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GameLogSummary {
  id: string
  date: string
  homeTeam: string
  awayTeam: string
  finalScores: { home: number; away: number }
  fileName: string
}

// ---------------------------------------------------------------------------
// GameHistoryView — Requirement 18
// ---------------------------------------------------------------------------

function GameHistoryView(): React.ReactElement {
  const ligaId = useControlPanelStore(s => s.gameState.ligaId)
  const [logs, setLogs] = useState<GameLogSummary[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [selectedLog, setSelectedLog] = useState<GameLogRecord | null>(null)
  const [loading, setLoading] = useState(false)

  const loadLogs = useCallback(async () => {
    if (!ligaId) return
    setLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'GAME_LOG_LIST',
        ligaId,
      }) as { logs: GameLogSummary[]; warnings: string[] }
      setLogs(result.logs ?? [])
      setWarnings(result.warnings ?? [])
    } catch {
      setWarnings(['Failed to load game history.'])
    } finally {
      setLoading(false)
    }
  }, [ligaId])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  async function handleViewLog(id: string): Promise<void> {
    if (!ligaId) return
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'GAME_LOG_LOAD',
        ligaId,
        logId: id,
      }) as { success: boolean; record?: GameLogRecord; error?: string }
      if (result.success && result.record) {
        setSelectedLog(result.record)
      }
    } catch {
      // ignore
    }
  }

  async function handleDeleteLog(id: string): Promise<void> {
    if (!ligaId) return
    const confirmed = window.confirm('Delete this game log? This cannot be undone.')
    if (!confirmed) return
    try {
      await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'GAME_LOG_DELETE',
        ligaId,
        logId: id,
      })
      await loadLogs()
      if (selectedLog?.id === id) setSelectedLog(null)
    } catch {
      // ignore
    }
  }

  if (selectedLog) {
    return (
      <div className="game-history">
        <button
          className="game-history__back-btn"
          onClick={() => setSelectedLog(null)}
          aria-label="Back to game history list"
        >
          ← Back to History
        </button>
        <div className="game-history__detail-header">
          <span className="game-history__detail-date">{new Date(selectedLog.date).toLocaleDateString()}</span>
          <span className="game-history__detail-teams">
            {selectedLog.homeTeam} {selectedLog.finalScores.home} — {selectedLog.finalScores.away} {selectedLog.awayTeam}
          </span>
          <span className="game-history__detail-attendance" data-testid="game-history-attendance">
            Attendance: {selectedLog.attendance != null ? selectedLog.attendance.toLocaleString() : '—'}
          </span>
        </div>
        {/* Reuse BoxScoreView by injecting the game log into a synthetic state is complex;
            render a simplified table directly from the log record */}
        <LogDetailView record={selectedLog} />
      </div>
    )
  }

  return (
    <div className="game-history" role="region" aria-label="Game History">
      <h2 className="game-history__title">Game History</h2>

      {warnings.map((w, i) => (
        <div key={i} className="game-history__warning" role="alert">{w}</div>
      ))}

      {!ligaId && (
        <p className="game-history__empty">No Liga loaded. Load a Liga to see game history.</p>
      )}

      {ligaId && loading && (
        <p className="game-history__empty">Loading…</p>
      )}

      {ligaId && !loading && logs.length === 0 && (
        <p className="game-history__empty">No games recorded for this season.</p>
      )}

      {ligaId && !loading && logs.length > 0 && (
        <ul className="game-history__list" aria-label="Saved game logs">
          {logs.map(log => (
            <li key={log.id} className="game-history__item">
              <div className="game-history__item-info">
                <span className="game-history__item-date">{new Date(log.date).toLocaleDateString()}</span>
                <span className="game-history__item-teams">
                  {log.homeTeam} <strong>{log.finalScores.home}</strong>
                  {' — '}
                  <strong>{log.finalScores.away}</strong> {log.awayTeam}
                </span>
              </div>
              <div className="game-history__item-actions">
                <button
                  className="game-history__btn game-history__btn--view"
                  onClick={() => handleViewLog(log.id)}
                  aria-label={`View ${log.homeTeam} vs ${log.awayTeam} box score`}
                >
                  View
                </button>
                <button
                  className="game-history__btn game-history__btn--delete"
                  onClick={() => handleDeleteLog(log.id)}
                  aria-label={`Delete ${log.homeTeam} vs ${log.awayTeam} log`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LogDetailView — read-only detail for a saved GameLogRecord
// ---------------------------------------------------------------------------

function LogDetailView({ record }: { record: GameLogRecord }): React.ReactElement {
  return (
    <div className="game-history__detail">
      <h3 className="game-history__detail-title">Box Score</h3>
      {(['home', 'away'] as const).map(side => {
        const teamName = side === 'home' ? record.homeTeam : record.awayTeam
        const players = Object.entries(record.playerStats)
          .filter(([, s]) => s.points + s.rebounds + s.assists + s.steals + s.blocks + s.fga > 0)
        return (
          <div key={side} className="game-history__team-section">
            <h4 className="game-history__team-name">{teamName}</h4>
            <table className="game-history__table" aria-label={`${teamName} stats`}>
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>PTS</th><th>REB</th><th>AST</th>
                  <th>STL</th><th>BLK</th><th>FGA</th><th>FGM</th><th>PF</th>
                </tr>
              </thead>
              <tbody>
                {players.map(([pid, s]) => (
                  <tr key={pid}>
                    <td>{s.jerseyNumber ?? ''}</td>
                    <td>{pid}</td>
                    <td>{s.points}</td><td>{s.rebounds}</td><td>{s.assists}</td>
                    <td>{s.steals}</td><td>{s.blocks}</td><td>{s.fga}</td>
                    <td>{s.fgm}</td><td>{s.fouls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
      <h3 className="game-history__detail-title" style={{ marginTop: '1.5rem' }}>Event Log</h3>
      <ul className="game-history__events">
        {record.events.slice(-30).map(ev => (
          <li key={ev.id} className="game-history__event">
            <span className="game-history__event-clock">
              {String(Math.floor(ev.clockMs / 60000)).padStart(2, '0')}:{String(Math.floor((ev.clockMs % 60000) / 1000)).padStart(2, '0')}
            </span>
            <span className="game-history__event-desc">{ev.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default GameHistoryView
