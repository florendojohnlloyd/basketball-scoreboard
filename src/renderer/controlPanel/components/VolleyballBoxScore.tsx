import React, { useState, useCallback } from 'react'
import { useControlPanelStore } from '../store'
import './BoxScoreView.css'

// ---------------------------------------------------------------------------
// VolleyballBoxScore — Per-player stats for volleyball
// ---------------------------------------------------------------------------

function VolleyballBoxScore(): React.ReactElement {
  const gameState = useControlPanelStore(s => s.gameState)
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  const handleExportCSV = useCallback(() => {
    setExporting(true)
    setExportStatus(null)
    
    try {
      const { home, away, volleyball } = gameState
      if (!volleyball) {
        setExportStatus({ type: 'error', message: 'Volleyball state not available' })
        return
      }

      // Build CSV content
      let csv = 'Volleyball Match - Box Score\n'
      csv += `Date: ${new Date().toLocaleDateString()}\n`
      csv += `${home.config.name} ${home.score} - ${away.score} ${away.config.name}\n`
      csv += `Sets: ${volleyball.setsWon.home} - ${volleyball.setsWon.away}\n\n`

      // Home team
      csv += `${home.config.name}\n`
      csv += '#,Name,Points,Blocks,Aces (Assists),Digs (Rebounds),Serve Assists (Steals),Fouls\n'
      home.players.filter(p => p.active).forEach(p => {
        csv += `${p.number},${p.name},${p.points},${p.blocks},${p.assists},${p.rebounds},${p.steals},${p.fouls}\n`
      })
      csv += '\n'

      // Away team
      csv += `${away.config.name}\n`
      csv += '#,Name,Points,Blocks,Aces (Assists),Digs (Rebounds),Serve Assists (Steals),Fouls\n'
      away.players.filter(p => p.active).forEach(p => {
        csv += `${p.number},${p.name},${p.points},${p.blocks},${p.assists},${p.rebounds},${p.steals},${p.fouls}\n`
      })

      // Create download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `volleyball-boxscore-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)

      setExportStatus({ type: 'success', message: 'CSV exported successfully!' })
    } catch (e) {
      setExportStatus({ type: 'error', message: (e as Error).message ?? 'Export failed.' })
    } finally {
      setExporting(false)
    }
  }, [gameState])

  const { home, away, volleyball } = gameState

  if (!volleyball) {
    return <div style={{ padding: '20px', color: '#d0dce8' }}>Volleyball state not initialized</div>
  }

  const statCols = [
    { key: 'points', label: 'PTS' },
    { key: 'blocks', label: 'BLK' },
    { key: 'assists', label: 'ACE' },
    { key: 'rebounds', label: 'DIG' },
    { key: 'steals', label: 'AST' },
    { key: 'fouls', label: 'F' },
  ]

  function renderTeamTable(team: 'home' | 'away'): React.ReactElement {
    const ts = gameState[team]
    const teamName = ts.config.name
    const players = ts.players.filter(p => p.active)

    // Calculate team totals
    const teamTotals = players.reduce(
      (acc, p) => ({
        points: acc.points + p.points,
        blocks: acc.blocks + p.blocks,
        assists: acc.assists + p.assists,
        rebounds: acc.rebounds + p.rebounds,
        steals: acc.steals + p.steals,
        fouls: acc.fouls + p.fouls,
      }),
      { points: 0, blocks: 0, assists: 0, rebounds: 0, steals: 0, fouls: 0 }
    )

    return (
      <div className="box-score__team-section" key={team}>
        <h3 className="box-score__team-name">{teamName}</h3>
        <div className="box-score__table-wrap">
          <table className="box-score__table" aria-label={`${teamName} box score`}>
            <thead>
              <tr>
                <th className="box-score__th box-score__th--num">#</th>
                <th className="box-score__th box-score__th--name">Name</th>
                {statCols.map(c => (
                  <th key={c.key} className="box-score__th">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id} className="box-score__row">
                  <td className="box-score__td box-score__td--num">{p.number}</td>
                  <td className="box-score__td box-score__td--name">
                    {p.name} {p.fouledOut && <span style={{ color: '#ff6b6b' }}>❌</span>}
                  </td>
                  <td className="box-score__td">{p.points}</td>
                  <td className="box-score__td">{p.blocks}</td>
                  <td className="box-score__td">{p.assists}</td>
                  <td className="box-score__td">{p.rebounds}</td>
                  <td className="box-score__td">{p.steals}</td>
                  <td className="box-score__td">{p.fouls}</td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    No active players
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="box-score__totals-row">
                <td className="box-score__td" colSpan={2}><strong>TEAM</strong></td>
                <td className="box-score__td"><strong>{teamTotals.points}</strong></td>
                <td className="box-score__td"><strong>{teamTotals.blocks}</strong></td>
                <td className="box-score__td"><strong>{teamTotals.assists}</strong></td>
                <td className="box-score__td"><strong>{teamTotals.rebounds}</strong></td>
                <td className="box-score__td"><strong>{teamTotals.steals}</strong></td>
                <td className="box-score__td"><strong>{teamTotals.fouls}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="box-score" role="region" aria-label="Volleyball Box Score">
      <div className="box-score__header">
        <h2 className="box-score__title">Volleyball Box Score</h2>
        <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
          SET {volleyball.currentSet} | {home.config.name} {volleyball.setsWon.home} - {volleyball.setsWon.away} {away.config.name}
        </div>
        <div className="box-score__controls">
          <button
            className="box-score__btn box-score__btn--export"
            onClick={handleExportCSV}
            disabled={exporting}
            aria-label="Export volleyball box score as CSV"
          >
            📊 Export CSV
          </button>
        </div>
      </div>

      {exportStatus && (
        <div
          className={`box-score__export-status box-score__export-status--${exportStatus.type}`}
          role={exportStatus.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {exportStatus.message}
          <button
            className="box-score__export-status-close"
            onClick={() => setExportStatus(null)}
            aria-label="Dismiss export message"
          >
            ✕
          </button>
        </div>
      )}

      <div className="box-score__legend" style={{ marginBottom: '15px', padding: '10px', background: 'var(--cp-panel)', borderRadius: '8px' }}>
        <strong>Stats Legend:</strong> PTS = Points, BLK = Blocks, ACE = Aces (Assists), DIG = Digs (Rebounds), AST = Serve Assists (Steals), F = Fouls
      </div>

      {renderTeamTable('home')}
      {renderTeamTable('away')}
    </div>
  )
}

export default VolleyballBoxScore
