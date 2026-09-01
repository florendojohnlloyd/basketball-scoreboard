/**
 * ScheduleManagementView — Requirements 24 & 25
 *
 * Create and track scheduled games for a Liga:
 *  - Create: date (valid calendar date), home team, away team (must differ)
 *  - Venue management: create venue records with name (1–80) and optional address (≤200)
 *  - Assign venue & court to scheduled games (court only when venue assigned)
 *  - List: sorted by date ascending; shows date, teams, venue/court, status
 *  - Mark Completed: link to a saved game log; stores scheduledGameId in the log
 *  - Delete: confirm dialog; does NOT delete the associated game log
 *  - Venue deletion: clears venue/court from affected games with warning
 *  - Persisted in Liga JSON under `schedule` and `venues` arrays
 */

import React, { useState, useEffect, useCallback } from 'react'
import type { ScheduledGame, ScheduledGameStatus, LigaTeam, Venue, StaffMember } from '@shared/types'
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

/** Validate attendance value: must be integer 0–99999. Returns error string or '' if valid. */
function validateAttendance(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return '' // empty means "not recorded", which is valid
  if (!/^\d+$/.test(trimmed)) return 'Attendance must be a non-negative integer.'
  const num = parseInt(trimmed, 10)
  if (!Number.isInteger(num) || num < 0 || num > 99999) {
    return 'Attendance must be between 0 and 99,999.'
  }
  return ''
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
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)

  // Add form state
  const [newDate, setNewDate] = useState('')
  const [newHome, setNewHome] = useState('')
  const [newAway, setNewAway] = useState('')
  const [newVenueId, setNewVenueId] = useState('')
  const [newCourt, setNewCourt] = useState('')
  const [addErrors, setAddErrors] = useState<{ date?: string; home?: string; away?: string; court?: string }>({})
  const [addSaving, setAddSaving] = useState(false)

  // Venue form state
  const [venueName, setVenueName] = useState('')
  const [venueAddress, setVenueAddress] = useState('')
  const [venueErrors, setVenueErrors] = useState<{ name?: string; address?: string }>({})
  const [venueSaving, setVenueSaving] = useState(false)

  // Link-log dialog state
  const [linkingGameId, setLinkingGameId] = useState<string | null>(null)
  const [selectedLogId, setSelectedLogId] = useState('')

  // Staff state (Requirement 26)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [detailGameId, setDetailGameId] = useState<string | null>(null)
  const [staffAssignId, setStaffAssignId] = useState('')

  // Attendance state (Requirement 27)
  const [attendanceInput, setAttendanceInput] = useState('')
  const [attendanceError, setAttendanceError] = useState('')
  const [attendanceSaving, setAttendanceSaving] = useState(false)

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

  // ── Load venues ──────────────────────────────────────────────────────────

  const loadVenues = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'VENUE_LIST',
        ligaId,
      }) as { success: boolean; venues?: Venue[] }
      if (result.success) setVenues(result.venues ?? [])
    } catch {
      // ignore
    }
  }, [ligaId])

  // ── Load staff (Requirement 26) ─────────────────────────────────────────

  const loadStaff = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'STAFF_LIST',
        ligaId,
      }) as { success: boolean; staff?: StaffMember[] }
      if (result.success) setStaffList(result.staff ?? [])
    } catch {
      // ignore
    }
  }, [ligaId])

  useEffect(() => {
    loadEntries()
    loadGameLogs()
    loadVenues()
    loadStaff()
  }, [loadEntries, loadGameLogs, loadVenues, loadStaff])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function teamName(teamId: string): string {
    return teams.find(t => t.id === teamId)?.name ?? teamId
  }

  function venueName_lookup(venueId: string | undefined): string {
    if (!venueId) return ''
    return venues.find(v => v.id === venueId)?.name ?? ''
  }

  // ── Add venue ─────────────────────────────────────────────────────────────

  async function handleAddVenue(): Promise<void> {
    const errors: typeof venueErrors = {}
    const trimmedName = venueName.trim()
    if (trimmedName.length < 1 || trimmedName.length > 80) {
      errors.name = 'Venue name must be between 1 and 80 characters.'
    }
    const trimmedAddress = venueAddress.trim()
    if (trimmedAddress.length > 200) {
      errors.address = 'Address must be 200 characters or fewer.'
    }
    if (Object.keys(errors).length > 0) {
      setVenueErrors(errors)
      return
    }
    setVenueSaving(true)
    setVenueErrors({})
    try {
      const venue: Omit<Venue, 'id'> = {
        name: trimmedName,
        ...(trimmedAddress ? { address: trimmedAddress } : {}),
      }
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'VENUE_ADD',
        ligaId,
        venue,
      }) as { success: boolean; error?: string }
      if (result.success) {
        setVenueName('')
        setVenueAddress('')
        await loadVenues()
      } else {
        setVenueErrors({ name: result.error ?? 'Failed to save venue.' })
      }
    } finally {
      setVenueSaving(false)
    }
  }

  // ── Delete venue ──────────────────────────────────────────────────────────

  async function handleDeleteVenue(venue: Venue): Promise<void> {
    // Find affected games
    const affectedGames = entries.filter(e => e.venueId === venue.id)
    let msg = `Delete venue "${venue.name}"?`
    if (affectedGames.length > 0) {
      msg += `\n\nWarning: ${affectedGames.length} scheduled game${affectedGames.length > 1 ? 's' : ''} use this venue and will have their venue/court cleared:`
      for (const g of affectedGames) {
        msg += `\n  • ${teamName(g.homeTeamId)} vs ${teamName(g.awayTeamId)} on ${g.date}`
      }
    }
    const confirmed = window.confirm(msg)
    if (!confirmed) return

    await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'VENUE_REMOVE',
      ligaId,
      venueId: venue.id,
    })
    await loadVenues()
    await loadEntries()
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
    // Court validation: only valid when venue is assigned
    if (newCourt && !newVenueId) {
      errors.court = 'A venue must be assigned before specifying a court.'
    }
    if (newCourt && newVenueId) {
      const trimmedCourt = newCourt.trim()
      if (trimmedCourt.length < 1 || trimmedCourt.length > 20) {
        errors.court = 'Court identifier must be between 1 and 20 characters.'
      }
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
        ...(newVenueId ? { venueId: newVenueId } : {}),
        ...(newVenueId && newCourt.trim() ? { courtId: newCourt.trim() } : {}),
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
        setNewVenueId('')
        setNewCourt('')
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

  // ── Staff assignment (Requirement 26) ─────────────────────────────────────

  function staffName(staffId: string): string {
    return staffList.find(s => s.id === staffId)?.name ?? staffId
  }

  function staffRole(staffId: string): string {
    return staffList.find(s => s.id === staffId)?.role ?? ''
  }

  async function handleAssignStaff(): Promise<void> {
    if (!detailGameId || !staffAssignId) return
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'STAFF_ASSIGN_TO_GAME',
      ligaId,
      gameId: detailGameId,
      staffId: staffAssignId,
    }) as { success: boolean; error?: string }
    if (result.success) {
      setStaffAssignId('')
      await loadEntries()
    } else {
      alert(result.error ?? 'Failed to assign staff member.')
    }
  }

  async function handleUnassignStaff(gameId: string, staffId: string): Promise<void> {
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'STAFF_UNASSIGN_FROM_GAME',
      ligaId,
      gameId,
      staffId,
    }) as { success: boolean; error?: string }
    if (result.success) {
      await loadEntries()
    } else {
      alert(result.error ?? 'Failed to unassign staff member.')
    }
  }

  function getDetailGame(): ScheduledGame | undefined {
    return entries.find(e => e.id === detailGameId)
  }

  // ── Save attendance (Requirement 27) ────────────────────────────────────

  async function handleSaveAttendance(): Promise<void> {
    const err = validateAttendance(attendanceInput)
    if (err) {
      setAttendanceError(err)
      return
    }
    if (!detailGameId) return
    setAttendanceSaving(true)
    setAttendanceError('')
    try {
      const trimmed = attendanceInput.trim()
      const attendanceValue = trimmed === '' ? undefined : parseInt(trimmed, 10)
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'SCHEDULE_UPDATE',
        ligaId,
        gameId: detailGameId,
        updates: { attendance: attendanceValue },
      }) as { success: boolean; error?: string }
      if (result.success) {
        await loadEntries()
      } else {
        setAttendanceError(result.error ?? 'Failed to save attendance.')
      }
    } finally {
      setAttendanceSaving(false)
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

          <div className="smv__field">
            <label className="smv__label" htmlFor="smv-venue">Venue</label>
            <select
              id="smv-venue"
              className="smv__select"
              value={newVenueId}
              onChange={e => {
                setNewVenueId(e.target.value)
                if (!e.target.value) setNewCourt('')
                setAddErrors(prev => ({ ...prev, court: undefined }))
              }}
              aria-label="Venue"
            >
              <option value="">— None —</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="smv__field">
            <label className="smv__label" htmlFor="smv-court">Court</label>
            <input
              id="smv-court"
              type="text"
              className={`smv__input${addErrors.court ? ' smv__input--error' : ''}`}
              value={newCourt}
              onChange={e => { setNewCourt(e.target.value); setAddErrors(prev => ({ ...prev, court: undefined })) }}
              disabled={!newVenueId}
              placeholder={newVenueId ? '1–20 chars' : 'Select venue first'}
              maxLength={20}
              aria-label="Court identifier"
              aria-describedby={addErrors.court ? 'smv-court-err' : undefined}
            />
            {addErrors.court && (
              <span id="smv-court-err" className="smv__field-error" role="alert">{addErrors.court}</span>
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

      {/* Venue Management section */}
      <div className="smv__venue-section" aria-label="Venue Management">
        <h3 className="smv__add-title">Venue Management</h3>
        <div className="smv__venue-add-row">
          <div className="smv__field">
            <label className="smv__label" htmlFor="smv-venue-name">Venue Name</label>
            <input
              id="smv-venue-name"
              type="text"
              className={`smv__input${venueErrors.name ? ' smv__input--error' : ''}`}
              value={venueName}
              onChange={e => { setVenueName(e.target.value); setVenueErrors(prev => ({ ...prev, name: undefined })) }}
              placeholder="1–80 characters"
              maxLength={80}
              aria-label="Venue name"
              aria-describedby={venueErrors.name ? 'smv-venue-name-err' : undefined}
            />
            {venueErrors.name && (
              <span id="smv-venue-name-err" className="smv__field-error" role="alert">{venueErrors.name}</span>
            )}
          </div>
          <div className="smv__field">
            <label className="smv__label" htmlFor="smv-venue-address">Address (optional)</label>
            <input
              id="smv-venue-address"
              type="text"
              className={`smv__input${venueErrors.address ? ' smv__input--error' : ''}`}
              value={venueAddress}
              onChange={e => { setVenueAddress(e.target.value); setVenueErrors(prev => ({ ...prev, address: undefined })) }}
              placeholder="Up to 200 characters"
              maxLength={200}
              aria-label="Venue address"
              aria-describedby={venueErrors.address ? 'smv-venue-addr-err' : undefined}
            />
            {venueErrors.address && (
              <span id="smv-venue-addr-err" className="smv__field-error" role="alert">{venueErrors.address}</span>
            )}
          </div>
          <button
            className="smv__btn smv__btn--add"
            onClick={handleAddVenue}
            disabled={venueSaving}
            aria-label="Add venue"
          >
            {venueSaving ? '…' : '+ Add Venue'}
          </button>
        </div>

        {venues.length > 0 && (
          <ul className="smv__venue-list" aria-label="Saved venues">
            {venues.map(v => (
              <li key={v.id} className="smv__venue-item">
                <span className="smv__venue-item-name">{v.name}</span>
                {v.address && <span className="smv__venue-item-address">{v.address}</span>}
                <button
                  className="smv__btn smv__btn--delete smv__btn--small"
                  onClick={() => handleDeleteVenue(v)}
                  aria-label={`Delete venue ${v.name}`}
                  title="Delete venue"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
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
                <th className="smv__th">Staff</th>
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
                    {entry.venueId ? (
                      <>
                        {venueName_lookup(entry.venueId)}
                        {entry.courtId && <span className="smv__court-label"> / {entry.courtId}</span>}
                      </>
                    ) : <span className="smv__none">—</span>}
                  </td>
                  <td className="smv__td smv__td--staff">
                    <button
                      className="smv__staff-count-btn"
                      onClick={() => {
                        setDetailGameId(entry.id)
                        setStaffAssignId('')
                        setAttendanceInput(entry.attendance != null ? String(entry.attendance) : '')
                        setAttendanceError('')
                      }}
                      aria-label={`View staff for ${teamName(entry.homeTeamId)} vs ${teamName(entry.awayTeamId)}`}
                      title="View / assign staff"
                    >
                      {entry.assignedStaff.length}
                    </button>
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

      {/* Game Detail / Staff Assignment dialog (Requirement 26 & 27) */}
      {detailGameId && (() => {
        const game = getDetailGame()
        if (!game) return null
        const assignedStaffMembers = game.assignedStaff
          .map(id => staffList.find(s => s.id === id))
          .filter((s): s is StaffMember => s != null)
        const unassignedStaff = staffList.filter(s => !game.assignedStaff.includes(s.id))
        return (
          <div className="smv__overlay" role="dialog" aria-modal="true" aria-label="Game detail and staff assignment">
            <div className="smv__dialog">
              <h3 className="smv__dialog-title">Game Detail</h3>
              <p className="smv__dialog-desc">
                {teamName(game.homeTeamId)} vs {teamName(game.awayTeamId)} — {new Date(game.date + 'T00:00:00').toLocaleDateString()}
              </p>

              {/* Attendance input (Requirement 27) */}
              <div className="smv__attendance-section">
                <h4 className="smv__staff-heading">Attendance</h4>
                <div className="smv__attendance-row">
                  <input
                    type="text"
                    className={`smv__input smv__input--attendance${attendanceError ? ' smv__input--error' : ''}`}
                    value={attendanceInput}
                    onChange={e => {
                      setAttendanceInput(e.target.value)
                      setAttendanceError('')
                    }}
                    placeholder="0–99,999 (optional)"
                    aria-label="Attendance"
                    aria-describedby={attendanceError ? 'smv-attendance-err' : undefined}
                  />
                  <button
                    className="smv__btn smv__btn--add"
                    onClick={handleSaveAttendance}
                    disabled={attendanceSaving}
                    aria-label="Save attendance"
                  >
                    {attendanceSaving ? '…' : 'Save'}
                  </button>
                </div>
                {attendanceError && (
                  <span id="smv-attendance-err" className="smv__field-error" role="alert">{attendanceError}</span>
                )}
                {game.attendance != null && !attendanceError && (
                  <span className="smv__attendance-current">
                    Current: {game.attendance.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Assigned staff list */}
              <div className="smv__staff-section">
                <h4 className="smv__staff-heading">Assigned Staff ({assignedStaffMembers.length})</h4>
                {assignedStaffMembers.length === 0 ? (
                  <p className="smv__dialog-empty">No staff assigned.</p>
                ) : (
                  <ul className="smv__staff-list" aria-label="Assigned staff members">
                    {assignedStaffMembers.map(s => (
                      <li key={s.id} className="smv__staff-item">
                        <span className="smv__staff-item-name">{s.name}</span>
                        <span className="smv__staff-item-role">{s.role}</span>
                        <button
                          className="smv__btn smv__btn--delete smv__btn--small"
                          onClick={() => handleUnassignStaff(game.id, s.id)}
                          aria-label={`Remove ${s.name} from game`}
                          title="Remove from game"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Assign new staff */}
              {unassignedStaff.length > 0 && (
                <div className="smv__staff-assign">
                  <select
                    className="smv__select smv__select--full"
                    value={staffAssignId}
                    onChange={e => setStaffAssignId(e.target.value)}
                    aria-label="Select staff member to assign"
                  >
                    <option value="">— Assign staff member —</option>
                    {unassignedStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                  <button
                    className="smv__btn smv__btn--add"
                    onClick={handleAssignStaff}
                    disabled={!staffAssignId}
                    aria-label="Assign staff member"
                  >
                    Assign
                  </button>
                </div>
              )}

              <div className="smv__dialog-actions">
                <button
                  className="smv__btn smv__btn--cancel"
                  onClick={() => { setDetailGameId(null); setStaffAssignId(''); setAttendanceInput(''); setAttendanceError('') }}
                  aria-label="Close detail view"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default ScheduleManagementView
