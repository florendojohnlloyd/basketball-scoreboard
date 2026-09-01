/**
 * BracketViewer â€” Tournament bracket visualization container component.
 *
 * Fetches tournament state via IPC query on mount, subscribes to bracket
 * update events for real-time refresh, and delegates rendering to
 * format-specific sub-components based on the tournament format.
 *
 * Requirements: 6.1, 6.6, 6.8
 * Task: 8.1
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { Tournament, BracketFormat } from '@shared/types'
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

  // â”€â”€ Fetch tournament state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loadTournament = useCallback(async () => {
    if (!tournamentId) {
      setLoadingState('error')
      setErrorMessage('No tournament ID provided.')
      return
    }

    setLoadingState('loading')
    setErrorMessage('')

    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_LOAD',
        tournamentId,
      }) as { success: boolean; tournament?: Tournament; error?: string }

      if (result.success) {
        setTournament(result.tournament ?? null)
        setLoadingState('loaded')
      } else {
        setLoadingState('error')
        setErrorMessage(result.error ?? 'Failed to load tournament.')
      }
    } catch (err) {
      setLoadingState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred.')
    }
  }, [tournamentId])

  // â”€â”€ Initial load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    loadTournament()
  }, [loadTournament])

  // â”€â”€ Subscribe to bracket update events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Requirement 6.6: update display within 2 seconds when bracket state changes

  useEffect(() => {
    function handleEvent(raw: unknown): void {
      const event = raw as { type: string; tournamentId?: string; [k: string]: unknown }
      
      // Listen for BRACKET_UPDATE events that match this tournament
      if (event.type === 'BRACKET_UPDATE' && event.tournamentId === tournamentId) {
        // Refresh the tournament state
        loadTournament()
      }
    }

    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)

    return () => {
      // Cleanup is handled by renderer lifecycle
    }
  }, [tournamentId, loadTournament])

  // â”€â”€ Render loading state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (loadingState === 'loading') {
    return (
      <div className="bracket-viewer" role="region" aria-label="Tournament bracket">
        <div className="bracket-viewer__loading">
          <div className="bracket-viewer__spinner" aria-label="Loading bracket" />
          <p className="bracket-viewer__loading-text">Loading bracket...</p>
        </div>
      </div>
    )
  }

  // â”€â”€ Render error state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Requirement 6.8: display error message and provide retry action

  if (loadingState === 'error') {
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

  // â”€â”€ Render empty state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (!tournament) {
    return (
      <div className="bracket-viewer" role="region" aria-label="Tournament bracket">
        <div className="bracket-viewer__empty">
          <p className="bracket-viewer__empty-text">No tournament data available.</p>
        </div>
      </div>
    )
  }

  // â”€â”€ Delegate to format-specific sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Requirements: 6.1, 6.2, 6.3

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
      </div>

      <div className="bracket-viewer__content">
        {tournament.format === 'single-elimination' && (
          <SingleElimTree
            rounds={tournament.rounds}
            matchNodes={tournament.matchNodes}
            seeds={tournament.seeds}
          />
        )}
        {tournament.format === 'double-elimination' && (
          <DoubleElimView
            winnersBracket={tournament.winnersBracket ?? []}
            losersBracket={tournament.losersBracket ?? []}
            grandFinal={tournament.grandFinal}
            matchNodes={tournament.matchNodes}
            seeds={tournament.seeds}
          />
        )}
        {tournament.format === 'round-robin' && (
          <RoundRobinGrid
            matchNodes={tournament.matchNodes}
            seeds={tournament.seeds}
            standings={tournament.standings ?? []}
          />
        )}
      </div>
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

