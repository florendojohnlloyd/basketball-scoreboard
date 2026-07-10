/**
 * ScheduleManagementView — Requirement 24
 *
 * Create and track scheduled games for a Liga:
 *  - Create: date (valid calendar date), home team, away team (must differ)
 *  - List: sorted by date ascending; shows date, teams, venue, status
 *  - Mark Completed: link to a saved game log; stores scheduledGameId in the log
 *  - Delete: confirm dialog; does NOT delete the associated game log
 *  - Persisted in Liga JSON under `schedule` array
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { ScheduledGame, ScheduledGameStatus, LigaTeam } from '@shared/types'
import './ScheduleManagementView.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleManagementViewProps {
  ligaId: string
  ligaName: string
  teams: LigaTeam[]
  onClose?: () => void
}

interface GameLogSummary {
  id: string
  date: string
  homeTeam: string
  awayTeam: string
  finalScores: { home: number; away: number }
  fileName: string
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Returns an error message or empty string if valid ISO date string. */
function validateDate(value: string): string {
  if (!value || value.trim() === '') return 'Date is required.'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Date is not a valid calendar date.'
  // Ensure it parses as a real calendar date (yyyy-mm-dd)
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return 'Date must be in YYYY-MM-DD format.'
  const check = new Date(year, month - 1, day)
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return 'Date is not a valid calendar date.'
  }
  return ''
}

function statusLabel(status: ScheduledGameStatus): string {
  if (status === 'InProgress') return 'In Progress'
  return status
}

function statusClass(status: ScheduledGameStatus): string {
  if (status === 'Completed') return 'smv__status--completed'
  if (status === 'InProgress') return 'smv__status--inprogress'
  return 'smv__status--scheduled'
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ScheduleManagementView({
  ligaId,
  ligaName,
  teams,
  onClose,
}: ScheduleManagementViewProps): React.ReactElement {
  const [entries, setEntries] = useState<ScheduledGame[]>([])
  const [gameLogs, setGameLogs] = useState<GameLogSummary[]>([])
  const [loading, setLoading] = useState(false)

  // Add form state
  const [newDate, setNewDate] = useState('')
  const [newHome, setNewHome] = useState('')
  const [newAway, setNewAway] = useState('')
  const [addErrors, setAddErrors] = useState<{ date?: string; home?: string; away?: string }>({})
  const [addSaving, setAddSaving] = useState(false)

  // Link-log dialog state
  const [linkingGameId, setLinkingGameId] = useState<string | null>(null)
  const [selectedLogId, setSelectedLogId] = useState('')

  // ── Load schedule entries ──────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'SCHEDULE_LIST',
        ligaId,
      }) as { success: boolean; entries?: ScheduledGame[]; error?: string }
      if (result.success) setEntries(result.entries ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [ligaId])

  // ── Load game logs (for linking) ─────────────────────────────────────────

  const loadGameLogs = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'GAME_LOG_LIST',
        ligaId,
      }) as { logs: GameLogSummary[]; warnings: string[] }
      setGameLogs(result.logs ?? [])
    } catch {
      // ignore
    }
  }, [ligaId])

  useEffect(() => {
    loadEntries()
    loadGameLogs()
  }, [loadEntries, loadGameLogs])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function teamName(teamId: string): string {
    return teams.find(t => t.id === teamId)?.name ?? teamId
  }

  // ── Add scheduled game ───────────────────────────────────────────────────

  async function handleAdd(): Promise<void> {
    const errors: typeof addErrors = {}
    const dateErr = validateDate(newDate)
    if (dateErr) errors.date = dateErr
    if (!newHome) errors.home = 'Home team is required.'
    if (!newAway) errors.away = 'Away team is required.'
    if (newHome && newAway && newHome === newAway) {
      errors.home = 'Home and away teams must be different.'
      errors.away = 'Home and away teams must be different.'
    }
    if (Object.keys(errors).length > 0) {
      setAddErrors(errors)
      return
    }

    setAddSaving(true)
    setAddErrors({})
    try {
      const entry: Omit<ScheduledGame, 'id'> = {
        ligaId,
        date: newDate,
        homeTeamId: newHome,
        awayTeamId: newAway,
        assignedStaff: [],
        status: 'Scheduled',
      }
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'SCHEDULE_ADD',
        ligaId,
        entry,
      }) as { success: boolean; error?: string }
      if (result.success) {
        setNewDate('')
        setNewHome('')
        setNewAway('')
        await loadEntries()
      } else {
        setAddErrors({ date: result.error ?? 'Failed to save.' })
      }
    } finally {
      setAddSaving(false)
    }
  }

  // ── Delete scheduled game ─────────────────────────────────────────────────

  async function handleDelete(entry: ScheduledGame): Promise<void> {
    const homeN = teamName(entry.homeTeamId)
    const awayN = teamName(entry.awayTeamId)
    const confirmed = window.confirm(
      `Delete the scheduled game "${homeN} vs ${awayN}" on ${entry.date}?\n\nThis will NOT delete any linked game log.`
    )
    if (!confirmed) return

    await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'SCHEDULE_REMOVE',
      ligaId,
      gameId: entry.id,
    })
    await loadEntries()
  }

  // ── Link game log ─────────────────────────────────────────────────────────

  async function handleLinkLog(): Promise<void> {
    if (!linkingGameId || !selectedLogId) return
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'SCHEDULE_LINK_LOG',
      ligaId,
      gameId: linkingGameId,
      gameLogId: selectedLogId,
    }) as { success: boolean; error?: string }
    if (result.success) {
      setLinkingGameId(null)
      setSelectedLogId('')
      await loadEntries()
    } else {
      alert(result.error ?? 'Failed to link game log.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="smv" role="region" aria-label="Schedule Management">

      {/* Header */}
      <div className="smv__header">
        {onClose && (
          <button className="smv__back-btn" onClick={onClose} aria-label="Back">
            ← Back
          </button>
        )}
        <div className="smv__header-info">
          <h2 className="smv__title">{ligaName} — Schedule</h2>
          <span className="smv__subtitle">{entries.length} game{entries.length !== 1 ? 's' : ''} scheduled</span>
        </div>
      </div>

      {/* Add form */}
      <div className="smv__add-section" aria-label="Schedule a new game">
        <h3 className="smv__add-title">Schedule a Game</h3>
        <div className="smv__add-row">
          <div className="smv__field">
            <label className="smv__label" htmlFor="smv-date">Date</label>
            <input
              id="smv-date"
              type="date"
              className={`smv__input${addErrors.date ? ' smv__input--error' : ''}`}
              value={newDate}
              onChange={e => { setNewDate(e.target.value); setAddErrors(prev => ({ ...prev, date: undefined })) }}
              aria-label="Game date"
              aria-describedby={addErrors.date ? 'smv-date-err' : undefined}
            />
            {addErrors.date && (
              <span id="smv-date-err" className="smv__field-error" role="alert">{addErrors.date}</span>
            )}
          </div>

          <div className="smv__field">
            <label className="smv__label" htmlFor="smv-home">Home Team</label>
            <select
              id="smv-home"
              className={`smv__select${addErrors.home ? ' smv__input--error' : ''}`}
              value={newHome}
              onChange={e => { setNewHome(e.target.value); setAddErrors(prev => ({ ...prev, home: undefined, away: undefined })) }}
              aria-label="Home team"
            >
              <option value="">— Select —</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {addErrors.home && (
              <span className="smv__field-error" role="alert">{addErrors.home}</span>
            )}
          </div>

          <div className="smv__field">
            <label className="smv__label" htmlFor="smv-away">Away Team</label>
            <select
              id="smv-away"
              className={`smv__select${addErrors.away ? ' smv__input--error' : ''}`}
              value={newAway}
              onChange={e => { setNewAway(e.target.value); setAddErrors(prev => ({ ...prev, home: undefined, away: undefined })) }}
              aria-label="Away team"
            >
              <option value="">— Select —</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {addErrors.away && (
              <span className="smv__field-error" role="alert">{addErrors.away}</span>
            )}
          </div>

          <button
            className="smv__btn smv__btn--add"
            onClick={handleAdd}
            disabled={addSaving}
            aria-label="Add scheduled game"
          >
            {addSaving ? '…' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Schedule list */}
      <div className="smv__list-section">
        {loading && <p className="smv__empty">Loading…</p>}
        {!loading && entries.length === 0 && (
          <p className="smv__empty">No games scheduled yet.</p>
        )}

        {!loading && entries.length > 0 && (
          <table className="smv__table" aria-label="Scheduled games">
            <thead>
              <tr>
                <th className="smv__th">Date</th>
                <th className="smv__th">Home</th>
                <th className="smv__th">Away</th>
                <th className="smv__th">Venue</th>
                <th className="smv__th">Status</th>
                <th className="smv__th smv__th--actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="smv__row">
                  <td className="smv__td smv__td--date">
                    {new Date(entry.date + 'T00:00:00').toLocaleDateString()}
                  </td>
                  <td className="smv__td">{teamName(entry.homeTeamId)}</td>
                  <td className="smv__td">{teamName(entry.awayTeamId)}</td>
                  <td className="smv__td smv__td--venue">
                    {entry.venueId ? entry.venueId : <span className="smv__none">—</span>}
                  </td>
                  <td className="smv__td">
                    <span className={`smv__status ${statusClass(entry.status)}`}>
                      {statusLabel(entry.status)}
                    </span>
                    {entry.gameLogId && (
                      <span className="smv__log-badge" title={`Linked to log ${entry.gameLogId}`}>📋</span>
                    )}
                  </td>
                  <td className="smv__td smv__td--actions">
                    {entry.status !== 'Completed' && (
                      <button
                        className="smv__btn smv__btn--complete"
                        onClick={() => { setLinkingGameId(entry.id); setSelectedLogId('') }}
                        aria-label={`Mark ${teamName(entry.homeTeamId)} vs ${teamName(entry.awayTeamId)} as completed`}
                        title="Mark as Completed"
                      >
                        ✓ Complete
                      </button>
                    )}
                    <button
                      className="smv__btn smv__btn--delete"
                      onClick={() => handleDelete(entry)}
                      aria-label={`Delete scheduled game ${teamName(entry.homeTeamId)} vs ${teamName(entry.awayTeamId)}`}
                      title="Delete (does not delete linked game log)"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Link-Log dialog */}
      {linkingGameId && (
        <div className="smv__overlay" role="dialog" aria-modal="true" aria-label="Link game log">
          <div className="smv__dialog">
            <h3 className="smv__dialog-title">Mark Game as Completed</h3>
            <p className="smv__dialog-desc">
              Select the saved game log to link to this scheduled game. The game log
              will store this schedule entry's ID.
            </p>

            {gameLogs.length === 0 ? (
              <p className="smv__dialog-empty">No saved game logs found for this Liga.</p>
            ) : (
              <select
                className="smv__select smv__select--full"
                value={selectedLogId}
                onChange={e => setSelectedLogId(e.target.value)}
                aria-label="Select game log"
              >
                <option value="">— Select a game log —</option>
                {gameLogs.map(log => (
                  <option key={log.id} value={log.id}>
                    {new Date(log.date).toLocaleDateString()} — {log.homeTeam} {log.finalScores.home} vs {log.finalScores.away} {log.awayTeam}
                  </option>
                ))}
              </select>
            )}

            <div className="smv__dialog-actions">
              <button
                className="smv__btn smv__btn--confirm"
                onClick={handleLinkLog}
                disabled={!selectedLogId}
                aria-label="Confirm link game log"
              >
                ✓ Confirm
              </button>
              <button
                className="smv__btn smv__btn--cancel"
                onClick={() => { setLinkingGameId(null); setSelectedLogId('') }}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScheduleManagementView
