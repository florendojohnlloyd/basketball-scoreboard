/**
 * LeaderboardsView — Requirement 20
 *
 * Displays top-10 ranked leaderboards for five per-game stat categories.
 * Refreshes whenever the Liga changes (ligaId from game state).
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useControlPanelStore } from '../store'
import type { Leaderboards, LeaderboardEntry, LeaderboardCategory } from '../../../main/analytics'
import './LeaderboardsView.css'

// ---------------------------------------------------------------------------
// Category display config
// ---------------------------------------------------------------------------

const CATEGORIES: Array<{ key: LeaderboardCategory; label: string; shortLabel: string }> = [
  { key: 'pointsPerGame',   label: 'Points Per Game',   shortLabel: 'PTS' },
  { key: 'reboundsPerGame', label: 'Rebounds Per Game', shortLabel: 'REB' },
  { key: 'assistsPerGame',  label: 'Assists Per Game',  shortLabel: 'AST' },
  { key: 'stealsPerGame',   label: 'Steals Per Game',   shortLabel: 'STL' },
  { key: 'blocksPerGame',   label: 'Blocks Per Game',   shortLabel: 'BLK' },
]

// ---------------------------------------------------------------------------
// LeaderboardsView
// ---------------------------------------------------------------------------

function LeaderboardsView(): React.ReactElement {
  const ligaId = useControlPanelStore(s => s.gameState.ligaId)
  const [data, setData] = useState<Leaderboards | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<LeaderboardCategory>('pointsPerGame')

  const loadLeaderboards = useCallback(async () => {
    if (!ligaId) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'LEADERBOARDS_LOAD',
        ligaId,
      }) as { success: boolean; leaderboards?: Leaderboards; error?: string }

      if (result.success && result.leaderboards) {
        setData(result.leaderboards)
      } else {
        setError(result.error ?? 'Failed to load leaderboards.')
      }
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load leaderboards.')
    } finally {
      setLoading(false)
    }
  }, [ligaId])

  // Reload whenever Liga switches (ligaId changes) or view first mounts
  useEffect(() => {
    loadLeaderboards()
  }, [loadLeaderboards])

  // ── States ───────────────────────────────────────────────────────────────

  if (!ligaId) {
    return (
      <div className="leaderboards" role="region" aria-label="Leaderboards">
        <h2 className="leaderboards__title">Leaderboards</h2>
        <p className="leaderboards__empty">No Liga loaded. Load a Liga to see leaderboards.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="leaderboards" role="region" aria-label="Leaderboards">
        <h2 className="leaderboards__title">Leaderboards</h2>
        <p className="leaderboards__empty">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="leaderboards" role="region" aria-label="Leaderboards">
        <h2 className="leaderboards__title">Leaderboards</h2>
        <div className="leaderboards__warning" role="alert">{error}</div>
        <button className="leaderboards__refresh-btn" onClick={loadLeaderboards}>Retry</button>
      </div>
    )
  }

  // Requirement 20.3 — show available entries only when fewer than 10 qualify
  const noData =
    data === null ||
    Object.values(data).every(entries => (entries as LeaderboardEntry[]).length === 0)

  if (noData) {
    return (
      <div className="leaderboards" role="region" aria-label="Leaderboards">
        <h2 className="leaderboards__title">Leaderboards</h2>
        <p className="leaderboards__empty" data-testid="no-games-message">
          No games recorded for this season
        </p>
      </div>
    )
  }

  const currentEntries = data![activeCategory]
  const activeCategoryConfig = CATEGORIES.find(c => c.key === activeCategory)!

  return (
    <div className="leaderboards" role="region" aria-label="Leaderboards">
      <div className="leaderboards__header">
        <h2 className="leaderboards__title">Leaderboards</h2>
        <button
          className="leaderboards__refresh-btn"
          onClick={loadLeaderboards}
          aria-label="Refresh leaderboards"
        >
          ↺ Refresh
        </button>
      </div>

      {/* ── Category tabs (Req 20.1) ── */}
      <div className="leaderboards__tabs" role="tablist" aria-label="Stat categories">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            role="tab"
            aria-selected={activeCategory === cat.key}
            aria-controls={`leaderboard-panel-${cat.key}`}
            className={`leaderboards__tab${activeCategory === cat.key ? ' leaderboards__tab--active' : ''}`}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.shortLabel}
          </button>
        ))}
      </div>

      {/* ── Leaderboard table (Req 20.2) ── */}
      <section
        id={`leaderboard-panel-${activeCategory}`}
        role="tabpanel"
        aria-label={`${activeCategoryConfig.label} leaderboard`}
        className="leaderboards__panel"
      >
        <h3 className="leaderboards__category-title">{activeCategoryConfig.label}</h3>
        {currentEntries.length === 0 ? (
          <p className="leaderboards__empty">No qualifying players for this category.</p>
        ) : (
          <div className="leaderboards__table-wrapper">
            <table className="leaderboards__table" aria-label={`${activeCategoryConfig.label} top ${currentEntries.length}`}>
              <thead>
                <tr>
                  <th scope="col" className="leaderboards__rank-col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Team</th>
                  <th scope="col" className="leaderboards__value-col">{activeCategoryConfig.shortLabel}</th>
                </tr>
              </thead>
              <tbody>
                {currentEntries.map(entry => (
                  <tr
                    key={entry.playerId}
                    className={entry.rank <= 3 ? `leaderboards__row leaderboards__row--top${entry.rank}` : 'leaderboards__row'}
                  >
                    <td className="leaderboards__rank">{entry.rank}</td>
                    <td className="leaderboards__player-name">{entry.playerName}</td>
                    <td className="leaderboards__team-name">{entry.teamName || '—'}</td>
                    <td className="leaderboards__value">{entry.value.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default LeaderboardsView
