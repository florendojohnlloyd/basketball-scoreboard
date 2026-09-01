/**
 * SeasonStatsView — Requirement 19
 *
 * Displays per-player and per-team season averages computed from all saved
 * game logs for the currently loaded Liga.  Averages are recomputed each time
 * this view is opened (no cached aggregate).
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useControlPanelStore } from '../store'
import type { PlayerSeasonAvg, TeamSeasonAvg, AttendanceStats } from '../../../main/analytics'
import type {
  SeasonStatsExportData,
  ExportPlayerAvgRow,
  ExportTeamAvgRow,
} from '../../../../main/exportService'
import './SeasonStatsView.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeasonStatsResult {
  playerAverages: PlayerSeasonAvg[]
  homeTeamAverages: TeamSeasonAvg
  awayTeamAverages: TeamSeasonAvg
  attendance: AttendanceStats
}

// ---------------------------------------------------------------------------
// SeasonStatsView
// ---------------------------------------------------------------------------

function SeasonStatsView(): React.ReactElement {
  const ligaId = useControlPanelStore(s => s.gameState.ligaId)
  const ligaName = useControlPanelStore(s => s.gameState.ligaName)
  const [data, setData] = useState<SeasonStatsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  // Fetch season stats — recomputed each time view opens (Req 19.5)
  const loadStats = useCallback(async () => {
    if (!ligaId) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'SEASON_STATS_LOAD',
        ligaId,
      }) as { success: boolean; stats?: SeasonStatsResult; error?: string }

      if (result.success && result.stats) {
        setData(result.stats)
      } else {
        setError(result.error ?? 'Failed to load season stats.')
      }
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load season stats.')
    } finally {
      setLoading(false)
    }
  }, [ligaId])

  // Load on mount / whenever ligaId changes (view re-opened)
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // ── Build export payload ────────────────────────────────────────────────
  const buildExportData = useCallback((): SeasonStatsExportData => {
    const playerAverages: ExportPlayerAvgRow[] = (data?.playerAverages ?? []).map(p => ({
      jerseyNumber: p.jerseyNumber ?? '—',
      name: p.playerName,
      gamesPlayed: p.gamesPlayed,
      ptsPerGame: p.pointsPerGame,
      rebPerGame: p.reboundsPerGame,
      astPerGame: p.assistsPerGame,
      stlPerGame: p.stealsPerGame,
      blkPerGame: p.blocksPerGame,
      fgPct: p.fgPct === null ? '—' : `${p.fgPct.toFixed(1)}%`,
    }))

    const teamAverages: ExportTeamAvgRow[] = [
      data?.homeTeamAverages,
      data?.awayTeamAverages,
    ]
      .filter((t): t is TeamSeasonAvg => !!t?.teamName)
      .map(t => ({
        teamName: t.teamName,
        gamesPlayed: t.gamesPlayed,
        ppg: t.pointsPerGame,
        fgPct: t.fgPct === null ? '—' : `${t.fgPct.toFixed(1)}%`,
        rpg: t.reboundsPerGame,
        apg: t.assistsPerGame,
        topg: t.turnoversPerGame,
      }))

    return {
      kind: 'season-stats',
      ligaName: ligaName ?? 'Liga',
      playerAverages,
      teamAverages,
    }
  }, [data, ligaName])

  const handleExport = useCallback(async (format: 'pdf' | 'excel') => {
    setExporting(true)
    setExportStatus(null)
    try {
      const exportData = buildExportData()
      const queryType = format === 'pdf' ? 'EXPORT_PDF' : 'EXPORT_EXCEL'
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: queryType,
        data: exportData,
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

  // ── Render helpers ───────────────────────────────────────────────────────

  const hasNoLiga = !ligaId
  const hasNoLogs = data !== null && data.playerAverages.length === 0

  function fmtFgPct(v: number | null): string {
    return v === null ? '—' : `${v.toFixed(1)}%`
  }

  function fmtStat(v: number): string {
    return v.toFixed(1)
  }

  // ── Empty / loading states ───────────────────────────────────────────────

  if (hasNoLiga) {
    return (
      <div className="season-stats" role="region" aria-label="Season Stats">
        <h2 className="season-stats__title">Season Stats</h2>
        <p className="season-stats__empty">No Liga loaded. Load a Liga to see season stats.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="season-stats" role="region" aria-label="Season Stats">
        <h2 className="season-stats__title">Season Stats</h2>
        <p className="season-stats__empty">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="season-stats" role="region" aria-label="Season Stats">
        <h2 className="season-stats__title">Season Stats</h2>
        <div className="season-stats__warning" role="alert">{error}</div>
        <button className="season-stats__refresh-btn" onClick={loadStats}>Retry</button>
      </div>
    )
  }

  // Requirement 19.4 — "No games recorded for this season" message
  if (hasNoLogs || data === null) {
    return (
      <div className="season-stats" role="region" aria-label="Season Stats">
        <h2 className="season-stats__title">Season Stats</h2>
        <p className="season-stats__empty" data-testid="no-games-message">
          No games recorded for this season
        </p>
      </div>
    )
  }

  const { playerAverages, homeTeamAverages, awayTeamAverages, attendance } = data

  return (
    <div className="season-stats" role="region" aria-label="Season Stats">
      <h2 className="season-stats__title">Season Stats</h2>

      <div className="season-stats__toolbar">
        <button
          className="season-stats__refresh-btn"
          onClick={loadStats}
          aria-label="Refresh season stats"
        >
          ↺ Refresh
        </button>
        <button
          className="season-stats__export-btn"
          onClick={() => handleExport('pdf')}
          disabled={exporting}
          aria-label="Export season stats as PDF"
        >
          Export PDF
        </button>
        <button
          className="season-stats__export-btn"
          onClick={() => handleExport('excel')}
          disabled={exporting}
          aria-label="Export season stats as Excel"
        >
          Export Excel
        </button>
      </div>

      {exportStatus && (
        <div
          className={`season-stats__export-status season-stats__export-status--${exportStatus.type}`}
          role={exportStatus.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {exportStatus.message}
          <button
            className="season-stats__export-status-close"
            onClick={() => setExportStatus(null)}
            aria-label="Dismiss export message"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Per-Player Averages (Req 19.1 & 19.2) ── */}
      <section className="season-stats__section" aria-labelledby="player-avg-heading">
        <h3 id="player-avg-heading" className="season-stats__section-title">Player Averages</h3>
        <div className="season-stats__table-wrapper">
          <table className="season-stats__table" aria-label="Player season averages">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">GP</th>
                <th scope="col">PTS</th>
                <th scope="col">REB</th>
                <th scope="col">AST</th>
                <th scope="col">STL</th>
                <th scope="col">BLK</th>
                <th scope="col">FG%</th>
              </tr>
            </thead>
            <tbody>
              {playerAverages.map(p => (
                <tr key={p.playerId}>
                  <td>{p.jerseyNumber ?? '—'}</td>
                  <td className="season-stats__player-name">{p.playerName}</td>
                  <td>{p.gamesPlayed}</td>
                  <td>{fmtStat(p.pointsPerGame)}</td>
                  <td>{fmtStat(p.reboundsPerGame)}</td>
                  <td>{fmtStat(p.assistsPerGame)}</td>
                  <td>{fmtStat(p.stealsPerGame)}</td>
                  <td>{fmtStat(p.blocksPerGame)}</td>
                  <td>{fmtFgPct(p.fgPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Per-Team Averages (Req 19.3) ── */}
      <section className="season-stats__section" aria-labelledby="team-avg-heading">
        <h3 id="team-avg-heading" className="season-stats__section-title">Team Averages</h3>
        <div className="season-stats__table-wrapper">
          <table className="season-stats__table" aria-label="Team season averages">
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">GP</th>
                <th scope="col">PPG</th>
                <th scope="col">FG%</th>
                <th scope="col">RPG</th>
                <th scope="col">APG</th>
                <th scope="col">TOPG</th>
              </tr>
            </thead>
            <tbody>
              {[homeTeamAverages, awayTeamAverages]
                .filter(t => t.teamName)
                .map(t => (
                  <tr key={t.teamName}>
                    <td className="season-stats__player-name">{t.teamName}</td>
                    <td>{t.gamesPlayed}</td>
                    <td>{fmtStat(t.pointsPerGame)}</td>
                    <td>{fmtFgPct(t.fgPct)}</td>
                    <td>{fmtStat(t.reboundsPerGame)}</td>
                    <td>{fmtStat(t.assistsPerGame)}</td>
                    <td>{fmtStat(t.turnoversPerGame)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Attendance Stats (Req 27.5) ── */}
      <section className="season-stats__section" aria-labelledby="attendance-heading">
        <h3 id="attendance-heading" className="season-stats__section-title">Attendance</h3>
        <div className="season-stats__attendance" data-testid="season-attendance">
          <div className="season-stats__attendance-item">
            <span className="season-stats__attendance-label">Total Season Attendance</span>
            <span className="season-stats__attendance-value" data-testid="total-attendance">
              {attendance.gamesWithAttendance > 0 ? attendance.totalAttendance.toLocaleString() : '—'}
            </span>
          </div>
          <div className="season-stats__attendance-item">
            <span className="season-stats__attendance-label">Average per Game</span>
            <span className="season-stats__attendance-value" data-testid="avg-attendance">
              {attendance.gamesWithAttendance > 0 ? attendance.averageAttendance.toLocaleString() : '—'}
            </span>
          </div>
          <div className="season-stats__attendance-item">
            <span className="season-stats__attendance-label">Games with Recorded Attendance</span>
            <span className="season-stats__attendance-value" data-testid="games-with-attendance">
              {attendance.gamesWithAttendance}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SeasonStatsView
