/**
 * BracketViewer — Tournament bracket visualization container component.
 *
 * Fetches tournament state via IPC query on mount, subscribes to bracket
 * update events for real-time refresh, and delegates rendering to
 * format-specific sub-components based on the tournament format.
 *
 * Requirements: 6.1, 6.6, 6.8
 * Task: 8.1
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { Tournament, BracketFormat, MatchNode, LigaTeam } from '@shared/types'
import { SCOREBOARD_EVENT } from '@shared/types'
import SingleElimTree from './SingleElimTree'
import DoubleElimView from './DoubleElimView'
import RoundRobinGrid from './RoundRobinGrid'
import './BracketViewer.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BracketViewerProps {
  tournamentId: string
  ligaId: string
}

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function BracketViewer({
  tournamentId,
  ligaId,
}: BracketViewerProps): React.ReactElement {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [teamLogos, setTeamLogos] = useState<Record<string, string | null>>({})
  const [teamNamesMap, setTeamNamesMap] = useState<Record<string, string>>({})

  // Match edit modal state
  const [editingMatch, setEditingMatch] = useState<MatchNode | null>(null)
  const [matchHomeScore, setMatchHomeScore] = useState<string>('')
  const [matchAwayScore, setMatchAwayScore] = useState<string>('')
  const [matchScoreError, setMatchScoreError] = useState<string>('')
  const [savingResult, setSavingResult] = useState<boolean>(false)

  // ── Fetch tournament state ───────────────────────────────────────────

  const loadTournament = useCallback(async () => {
    if (!tournamentId) {
      setLoadingState('error')
      setErrorMessage('No tournament ID provided.')
      return
    }

    setLoadingState('loading')
    setErrorMessage('')

    try {
      const result = await window.electron?.ipcRenderer?.invoke?.('scoreboard:query', {
        type: 'TOURNAMENT_LOAD',
        tournamentId,
      }) as { success: boolean; tournament?: Tournament; error?: string } | undefined

      if (result && result.success) {
        setTournament(result.tournament ?? null)
        setLoadingState('loaded')

        // Fetch team logos safely if ligaId exists
        if (ligaId && typeof window !== 'undefined' && window.electron?.ipcRenderer?.invoke) {
          window.electron.ipcRenderer.invoke('scoreboard:query', {
            type: 'LIGA_LOAD',
            id: ligaId,
          }).then((res: any) => {
            if (res && res.success && res.liga) {
              const logoMap: Record<string, string | null> = {}
              const nameMap: Record<string, string> = {}
              for (const team of res.liga.teams) {
                logoMap[team.id] = team.logoPath
                nameMap[team.id] = team.name
              }
              setTeamLogos(logoMap)
              setTeamNamesMap(nameMap)
            }
          }).catch(() => {})
        }
      } else {
        setLoadingState('error')
        setErrorMessage(result?.error ?? 'Failed to load tournament.')
      }
    } catch (err) {
      setLoadingState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred.')
    }
  }, [tournamentId, ligaId])

  // ── Initial load ─────────────────────────────────────────────────────

  useEffect(() => {
    loadTournament()
  }, [loadTournament])

  // ── Subscribe to bracket update events ───────────────────────────────

  useEffect(() => {
    function handleEvent(raw: unknown): void {
      const event = raw as { type: string; tournamentId?: string; [k: string]: unknown }
      if (event.type === 'BRACKET_UPDATE' && event.tournamentId === tournamentId) {
        loadTournament()
      }
    }

    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)
    return () => {
      // Lifecycle cleanup
    }
  }, [tournamentId, loadTournament])

  // ── Match click handler ──────────────────────────────────────────────

  function handleMatchClick(node: MatchNode): void {
    if (node.isBye || !node.homeTeamId) return // Cannot record result for BYE or unresolved slots
    setEditingMatch(node)
    setMatchHomeScore(node.homeScore != null ? String(node.homeScore) : '')
    setMatchAwayScore(node.awayScore != null ? String(node.awayScore) : '')
    setMatchScoreError('')
  }

  async function handleSaveMatchScore(): Promise<void> {
    if (!editingMatch || !tournament) return
    const hs = parseInt(matchHomeScore, 10)
    const as = parseInt(matchAwayScore, 10)

    if (isNaN(hs) || isNaN(as)) {
      setMatchScoreError('Please enter valid numeric scores for both teams.')
      return
    }
    if (hs < 0 || as < 0) {
      setMatchScoreError('Scores cannot be negative.')
      return
    }
    if (hs === as) {
      setMatchScoreError('Tied scores are not allowed in elimination matches.')
      return
    }

    setSavingResult(true)
    setMatchScoreError('')

    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_RECORD_RESULT',
        tournamentId: tournament.id,
        matchNodeId: editingMatch.id,
        homeScore: hs,
        awayScore: as,
      }) as { success: boolean; error?: string }

      if (result.success) {
        setEditingMatch(null)
        await loadTournament()
      } else {
        setMatchScoreError(result.error ?? 'Failed to record match result.')
      }
    } catch (err) {
      setMatchScoreError(err instanceof Error ? err.message : 'Failed to record result.')
    } finally {
      setSavingResult(false)
    }
  }

  async function handleRevertMatchScore(): Promise<void> {
    if (!editingMatch || !tournament) return
    const confirmed = window.confirm('Revert this match result? Downstream bracket progression for this match will be reset.')
    if (!confirmed) return

    setSavingResult(true)
    setMatchScoreError('')

    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_REVERT_RESULT',
        tournamentId: tournament.id,
        matchNodeId: editingMatch.id,
      }) as { success: boolean; error?: string }

      if (result.success) {
        setEditingMatch(null)
        await loadTournament()
      } else {
        setMatchScoreError(result.error ?? 'Failed to revert match result.')
      }
    } catch (err) {
      setMatchScoreError(err instanceof Error ? err.message : 'Failed to revert result.')
    } finally {
      setSavingResult(false)
    }
  }

  // ── Render loading state ─────────────────────────────────────────────

  if (loadingState === 'loading' && !tournament) {
    return (
      <div className="bracket-viewer" role="region" aria-label="Tournament bracket">
        <div className="bracket-viewer__loading">
          <div className="bracket-viewer__spinner" aria-label="Loading bracket" />
          <p className="bracket-viewer__loading-text">Loading bracket...</p>
        </div>
      </div>
    )
  }

  // ── Render error state ───────────────────────────────────────────────

  if (loadingState === 'error' && !tournament) {
    return (
      <div className="bracket-viewer" role="region" aria-label="Tournament bracket">
        <div className="bracket-viewer__error" role="alert">
          <p className="bracket-viewer__error-title">Failed to Load Bracket</p>
          <p className="bracket-viewer__error-message">{errorMessage}</p>
          <button
            className="bracket-viewer__retry-btn"
            onClick={loadTournament}
            aria-label="Retry loading bracket"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Render empty state ───────────────────────────────────────────────

  if (!tournament) {
    return (
      <div className="bracket-viewer" role="region" aria-label="Tournament bracket">
        <div className="bracket-viewer__empty">
          <p className="bracket-viewer__empty-text">No tournament data available.</p>
        </div>
      </div>
    )
  }

  // Resolve team names
  const resolvedNames: Record<string, string> = { ...teamNamesMap }
  for (const seed of tournament.seeds) {
    resolvedNames[seed.teamId] = seed.teamName
  }

  return (
    <div className="bracket-viewer" role="region" aria-label="Tournament bracket">
      <div className="bracket-viewer__header">
        <h2 className="bracket-viewer__title">{tournament.name}</h2>
        <span className="bracket-viewer__format-badge" data-format={tournament.format}>
          {formatLabel(tournament.format)}
        </span>
        <span className="bracket-viewer__status-badge" data-status={tournament.status}>
          {statusLabel(tournament.status)}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#6a7890', marginLeft: 'auto' }}>
          💡 Click any match card to enter scores
        </span>
      </div>

      <div className="bracket-viewer__content">
        {tournament.format === 'single-elimination' && (
          <SingleElimTree
            rounds={tournament.rounds}
            matchNodes={tournament.matchNodes}
            seeds={tournament.seeds}
            teamLogos={teamLogos}
            onMatchClick={handleMatchClick}
          />
        )}
        {tournament.format === 'double-elimination' && (
          <DoubleElimView
            winnersBracket={tournament.winnersBracket ?? []}
            losersBracket={tournament.losersBracket ?? []}
            grandFinal={tournament.grandFinal}
            matchNodes={tournament.matchNodes}
            seeds={tournament.seeds}
            teamLogos={teamLogos}
            onMatchClick={handleMatchClick}
          />
        )}
        {tournament.format === 'round-robin' && (
          <RoundRobinGrid
            matchNodes={tournament.matchNodes}
            seeds={tournament.seeds}
            standings={tournament.standings ?? []}
            teamLogos={teamLogos}
            onMatchClick={handleMatchClick}
          />
        )}
      </div>

      {/* ── Match Score Entry Modal ── */}
      {editingMatch && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={(e) => e.target === e.currentTarget && setEditingMatch(null)}
        >
          <div
            style={{
              background: '#121420',
              border: '1px solid #2a3348',
              borderRadius: 12,
              padding: '24px 28px',
              width: 380,
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
              color: '#dce8f5',
            }}
            role="dialog"
            aria-label="Record match score"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#ffd21c', margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                🏆 Record Match Score
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#8899aa', fontSize: '1.2rem', cursor: 'pointer' }}
                onClick={() => setEditingMatch(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ color: '#88a0c0', fontSize: '0.82rem', marginBottom: 20, textAlign: 'center' }}>
              Round {editingMatch.roundIndex + 1} — {editingMatch.bracketSection.toUpperCase()}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12, marginBottom: 20 }}>
              {/* Home Team */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', marginBottom: 8, textAlign: 'center' }}>
                  {editingMatch.homeTeamId ? (resolvedNames[editingMatch.homeTeamId] ?? 'Home Team') : 'TBD'}
                </span>
                <input
                  type="number"
                  min="0"
                  value={matchHomeScore}
                  onChange={(e) => { setMatchHomeScore(e.target.value); setMatchScoreError('') }}
                  placeholder="0"
                  style={{
                    width: 72,
                    height: 48,
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    textAlign: 'center',
                    background: '#090a10',
                    border: '1px solid #2e3a52',
                    borderRadius: 8,
                    color: '#ffd21c',
                    outline: 'none',
                  }}
                />
              </div>

              <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#4a5a75', marginTop: 20 }}>VS</span>

              {/* Away Team */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', marginBottom: 8, textAlign: 'center' }}>
                  {editingMatch.awayTeamId ? (resolvedNames[editingMatch.awayTeamId] ?? 'Away Team') : 'TBD'}
                </span>
                <input
                  type="number"
                  min="0"
                  value={matchAwayScore}
                  onChange={(e) => { setMatchAwayScore(e.target.value); setMatchScoreError('') }}
                  placeholder="0"
                  style={{
                    width: 72,
                    height: 48,
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    textAlign: 'center',
                    background: '#090a10',
                    border: '1px solid #2e3a52',
                    borderRadius: 8,
                    color: '#ffd21c',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {matchScoreError && (
              <p style={{ color: '#eb5757', fontSize: '0.8rem', background: '#200a0a', padding: '6px 10px', borderRadius: 6, marginBottom: 16 }} role="alert">
                {matchScoreError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              {editingMatch.status === 'completed' && (
                <button
                  className="btn btn--red"
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  onClick={handleRevertMatchScore}
                  disabled={savingResult}
                >
                  ↺ Revert
                </button>
              )}
              <button
                className="btn btn--dark"
                style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                onClick={() => setEditingMatch(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn--green"
                style={{ fontSize: '0.78rem', padding: '6px 16px' }}
                onClick={handleSaveMatchScore}
                disabled={savingResult}
              >
                {savingResult ? 'Saving…' : 'Save Score →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BracketViewer

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function formatLabel(format: BracketFormat): string {
  switch (format) {
    case 'single-elimination':
      return 'Single Elimination'
    case 'double-elimination':
      return 'Double Elimination'
    case 'round-robin':
      return 'Round Robin'
    default:
      return format
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'seeding':
      return 'Seeding'
    case 'in-progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    default:
      return status
  }
}
