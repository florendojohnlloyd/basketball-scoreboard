import React, { useState, useCallback } from 'react'
import { useControlPanelStore } from '../store'
import type { PeriodSnapshot, PlayerStats } from '@shared/types'
import type {
  BoxScoreExportData,
  ExportTeamData,
  ExportPlayerRow,
} from '../../../../main/exportService'
import './BoxScoreView.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fgPct(fgm: number, fga: number): string {
  if (fga === 0) return '—'
  return `${((fgm / fga) * 100).toFixed(1)}%`
}

/** Get per-period increment: snap[period] - snap[period-1], or raw for period 1 */
function periodIncrement(
  snapshots: PeriodSnapshot[],
  teamId: string,
  playerId: string,
  period: number,
  stat: keyof Pick<PlayerStats, 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'fga' | 'fgm' | 'fouls'>
): number {
  const currentSnap = snapshots.find(s => s.period === period && s.teamId === teamId)
  const prevSnap = snapshots.find(s => s.period === period - 1 && s.teamId === teamId)

  const currentPlayer = currentSnap?.playerSnapshots[Number(playerId)]
  const prevPlayer = prevSnap?.playerSnapshots[Number(playerId)]

  const current = (currentPlayer?.[stat] as number | undefined) ?? 0
  const prev = (prevPlayer?.[stat] as number | undefined) ?? 0
  return Math.max(0, current - prev)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlayerRow {
  id: string
  jerseyNumber: string
  name: string
  totals: PlayerStats
}

// ---------------------------------------------------------------------------
// BoxScoreView — Requirement 17
// ---------------------------------------------------------------------------

function BoxScoreView(): React.ReactElement {
  const gameState = useControlPanelStore(s => s.gameState)
  const [expandPeriods, setExpandPeriods] = useState(false)
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  // ── Build export payload from current game state ─────────────────────────
  const buildExportData = useCallback((): BoxScoreExportData => {
    const buildTeam = (team: 'home' | 'away'): ExportTeamData => {
      const ts = gameState[team]
      const rows: ExportPlayerRow[] = ts.players.map(p => {
        const pct = p.fga === 0 ? '—' : `${((p.fgm / p.fga) * 100).toFixed(1)}%`
        return {
          jerseyNumber: p.number,
          name: p.name,
          pts: p.points,
          reb: p.rebounds,
          ast: p.assists,
          stl: p.steals,
          blk: p.blocks,
          fga: p.fga,
          fgm: p.fgm,
          fouls: p.fouls,
          fgPct: pct,
        }
      })
      const totals = rows.reduce(
        (acc, r) => ({
          pts: acc.pts + r.pts,
          reb: acc.reb + r.reb,
          ast: acc.ast + r.ast,
          stl: acc.stl + r.stl,
          blk: acc.blk + r.blk,
          fga: acc.fga + r.fga,
          fgm: acc.fgm + r.fgm,
          fouls: acc.fouls + r.fouls,
        }),
        { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fga: 0, fgm: 0, fouls: 0 }
      )
      const totalFgPct = totals.fga === 0 ? '—' : `${((totals.fgm / totals.fga) * 100).toFixed(1)}%`
      return {
        teamName: ts.config.name,
        rows,
        totals: { ...totals, fgPct: totalFgPct },
      }
    }

    return {
      kind: 'box-score',
      ligaName: gameState.ligaName ?? 'Liga',
      gameDate: new Date().toLocaleDateString(),
      homeTeam: buildTeam('home'),
      awayTeam: buildTeam('away'),
    }
  }, [gameState])

  const handleExport = useCallback(async (format: 'pdf' | 'excel') => {
    setExporting(true)
    setExportStatus(null)
    try {
      const data = buildExportData()
      const queryType = format === 'pdf' ? 'EXPORT_PDF' : 'EXPORT_EXCEL'
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: queryType,
        data,
      }) as { success: boolean; cancelled?: boolean; filePath?: string; error?: string }

      if (result.cancelled) {
        // User closed dialog — no feedback needed
      } else if (result.success && result.filePath) {
        setExportStatus({ type: 'success', message: `Saved to: ${result.filePath}` })
      } else {
        setExportStatus({ type: 'error', message: result.error ?? 'Export failed.' })
      }
    } catch (e) {
      setExportStatus({ type: 'error', message: (e as Error).message ?? 'Export failed.' })
    } finally {
      setExporting(false)
    }
  }, [buildExportData])

  const periods = gameState.period.current > 1
    ? Array.from({ length: gameState.period.current - 1 }, (_, i) => i + 1)
    : []

  function renderTeamTable(team: 'home' | 'away'): React.ReactElement {
    const ts = gameState[team]
    const teamName = ts.config.name
    const players = ts.players

    // Build totals from current player state
    const rows: PlayerRow[] = players.map(p => ({
      id: p.id,
      jerseyNumber: p.number,
      name: p.name,
      totals: {
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        steals: p.steals,
        blocks: p.blocks,
        fga: p.fga,
        fgm: p.fgm,
        fouls: p.fouls,
        active: p.active,
        jerseyNumber: p.number || null,
        photoPath: p.photoPath ?? null,
        minutesPlayed: p.minutesPlayed,
        substitutions: p.substitutions,
      },
    }))

    // Team totals row
    const teamTotals = rows.reduce(
      (acc, r) => ({
        points: acc.points + r.totals.points,
        rebounds: acc.rebounds + r.totals.rebounds,
        assists: acc.assists + r.totals.assists,
        steals: acc.steals + r.totals.steals,
        blocks: acc.blocks + r.totals.blocks,
        fga: acc.fga + r.totals.fga,
        fgm: acc.fgm + r.totals.fgm,
        fouls: acc.fouls + r.totals.fouls,
      }),
      { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fga: 0, fgm: 0, fouls: 0 }
    )

    const statCols: Array<{ key: keyof typeof teamTotals; label: string }> = [
      { key: 'points', label: 'PTS' },
      { key: 'rebounds', label: 'REB' },
      { key: 'assists', label: 'AST' },
      { key: 'steals', label: 'STL' },
      { key: 'blocks', label: 'BLK' },
      { key: 'fga', label: 'FGA' },
      { key: 'fgm', label: 'FGM' },
      { key: 'fouls', label: 'PF' },
    ]

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
                <th className="box-score__th">FG%</th>
                {expandPeriods && periods.map(p => (
                  <th key={p} className="box-score__th box-score__th--period" colSpan={3}>
                    {gameState.period.format === 'halves' ? `H${p}` : `Q${p}`}
                  </th>
                ))}
              </tr>
              {expandPeriods && periods.length > 0 && (
                <tr>
                  <th colSpan={2} />
                  {statCols.map(() => <th key={Math.random()} />)}
                  <th />
                  {periods.map(p => (
                    <React.Fragment key={p}>
                      <th className="box-score__th box-score__th--period-sub">PTS</th>
                      <th className="box-score__th box-score__th--period-sub">REB</th>
                      <th className="box-score__th box-score__th--period-sub">AST</th>
                    </React.Fragment>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="box-score__row">
                  <td className="box-score__td box-score__td--num">{row.jerseyNumber}</td>
                  <td className="box-score__td box-score__td--name">{row.name}</td>
                  {statCols.map(c => (
                    <td key={c.key} className="box-score__td">{row.totals[c.key as keyof typeof teamTotals]}</td>
                  ))}
                  <td className="box-score__td">{fgPct(row.totals.fgm, row.totals.fga)}</td>
                  {expandPeriods && periods.map(p => {
                    const idx = players.findIndex(pl => pl.id === row.id)
                    const snaps = gameState.periodSnapshots
                    const getInc = (stat: 'points' | 'rebounds' | 'assists') =>
                      periodIncrement(snaps, team, String(idx), p, stat)
                    return (
                      <React.Fragment key={p}>
                        <td className="box-score__td box-score__td--period">{getInc('points')}</td>
                        <td className="box-score__td box-score__td--period">{getInc('rebounds')}</td>
                        <td className="box-score__td box-score__td--period">{getInc('assists')}</td>
                      </React.Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="box-score__totals-row">
                <td className="box-score__td" colSpan={2}><strong>TEAM</strong></td>
                {statCols.map(c => (
                  <td key={c.key} className="box-score__td"><strong>{teamTotals[c.key]}</strong></td>
                ))}
                <td className="box-score__td"><strong>{fgPct(teamTotals.fgm, teamTotals.fga)}</strong></td>
                {expandPeriods && periods.map(p => (
                  <React.Fragment key={p}>
                    <td className="box-score__td box-score__td--period" colSpan={3} />
                  </React.Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="box-score" role="region" aria-label="Box Score">
      <div className="box-score__header">
        <h2 className="box-score__title">Box Score</h2>
        <div className="box-score__controls">
          <button
            className="box-score__btn"
            onClick={() => setExpandPeriods(v => !v)}
            aria-pressed={expandPeriods}
          >
            {expandPeriods ? 'Collapse Periods' : 'Expand Periods'}
          </button>
          <button
            className="box-score__btn box-score__btn--export"
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            aria-label="Export box score as PDF"
          >
            Export PDF
          </button>
          <button
            className="box-score__btn box-score__btn--export"
            onClick={() => handleExport('excel')}
            disabled={exporting}
            aria-label="Export box score as Excel"
          >
            Export Excel
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
            ×
          </button>
        </div>
      )}
      {renderTeamTable('home')}
      {renderTeamTable('away')}
    </div>
  )
}

export default BoxScoreView
