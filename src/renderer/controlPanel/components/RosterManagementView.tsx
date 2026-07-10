/**
 * RosterManagementView — Requirement 23
 *
 * Full roster management for a Liga team:
 *  - List players with name, jersey number (#1–99), photo thumbnail
 *  - Add player: name (1–50 chars) + jersey number (1–99, unique within team)
 *  - Edit player in place: same validation, persisted via IPC
 *  - Remove player: confirm dialog → delete from Liga JSON
 *  - Assign/replace photo: JPEG/PNG, max 5 MB (same as Req 16)
 */

import React, { useState, useCallback, useRef } from 'react'
import type { LigaPlayer, LigaTeam } from '@shared/types'
import './RosterManagementView.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RosterManagementViewProps {
  /** The Liga team whose roster is being managed. */
  team: LigaTeam
  /** The ID of the parent Liga. */
  ligaId: string
  /** Called when roster data changes so the parent can reload. */
  onUpdated: (updatedTeam: LigaTeam) => void
  /** Called when the user wants to close/go back. */
  onClose?: () => void
}

interface PlayerRow extends LigaPlayer {
  _editing: boolean
  _editName: string
  _editNumber: string
  _editError: string
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Returns an error message or empty string if valid. */
function validateName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Player name is required.'
  if (trimmed.length > 50) return 'Name must be 50 characters or fewer.'
  return ''
}

/** Returns an error message or empty string if valid.
 *  @param number   raw input
 *  @param existingNumbers jersey numbers already in use (exclude the player's own)
 */
function validateNumber(number: string, existingNumbers: string[]): string {
  const trimmed = number.trim()
  if (trimmed === '') return 'Jersey number is required.'
  const n = parseInt(trimmed, 10)
  if (isNaN(n) || !Number.isInteger(n)) return 'Jersey number must be a whole number.'
  if (n < 1 || n > 99) return 'Jersey number must be between 1 and 99.'
  if (existingNumbers.includes(trimmed)) return `#${trimmed} is already taken by another player.`
  return ''
}

// ---------------------------------------------------------------------------
// Photo thumbnail helper
// ---------------------------------------------------------------------------

function PhotoThumb({ photoPath, playerName }: { photoPath?: string | null; playerName: string }): React.ReactElement {
  if (!photoPath) {
    return (
      <div className="rmv-player__photo rmv-player__photo--placeholder" title="No photo assigned" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
          <circle cx="20" cy="15" r="8" fill="#404055" />
          <path d="M4 38 Q20 22 36 38 Z" fill="#404055" />
        </svg>
      </div>
    )
  }

  // Build a file:// URL if path is absolute, otherwise use it directly as a data-src
  const src = photoPath.startsWith('http') || photoPath.startsWith('data:')
    ? photoPath
    : `file:///${photoPath.replace(/\\/g, '/')}`

  return (
    <img
      className="rmv-player__photo"
      src={src}
      alt={`${playerName} photo`}
      width="40"
      height="40"
      onError={(e) => {
        // Replace broken image with placeholder on error
        const img = e.currentTarget as HTMLImageElement
        img.style.display = 'none'
        const placeholder = img.nextElementSibling as HTMLElement | null
        if (placeholder) placeholder.style.display = 'flex'
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function RosterManagementView({
  team,
  ligaId,
  onUpdated,
  onClose,
}: RosterManagementViewProps): React.ReactElement {
  // Derive mutable rows from team.players
  const toRows = (players: LigaPlayer[]): PlayerRow[] =>
    players.map(p => ({
      ...p,
      _editing: false,
      _editName: p.name,
      _editNumber: p.number,
      _editError: '',
    }))

  const [rows, setRows] = useState<PlayerRow[]>(() => toRows(team.players))
  const [addName, setAddName] = useState('')
  const [addNumber, setAddNumber] = useState('')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)
  const addNameRef = useRef<HTMLInputElement>(null)

  // ── IPC helper ──────────────────────────────────────────────────────────

  async function reloadTeam(): Promise<LigaTeam | null> {
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_LOAD',
      id: ligaId,
    }) as { success: boolean; liga?: { teams: LigaTeam[] }; error?: string }
    if (result?.success && result.liga) {
      const fresh = result.liga.teams.find(t => t.id === team.id) ?? null
      if (fresh) {
        setRows(toRows(fresh.players))
        onUpdated(fresh)
        return fresh
      }
    }
    return null
  }

  // ── Add player ──────────────────────────────────────────────────────────

  async function handleAdd(): Promise<void> {
    const nameErr = validateName(addName)
    if (nameErr) { setAddError(nameErr); return }
    const existingNums = rows.map(r => r.number)
    const numErr = validateNumber(addNumber, existingNums)
    if (numErr) { setAddError(numErr); return }

    setSaving(true)
    setAddError('')
    const player: LigaPlayer = {
      id: `${team.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      number: addNumber.trim(),
      name: addName.trim(),
      photoPath: null,
    }
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_ADD_PLAYER',
      ligaId,
      teamId: team.id,
      player,
    }) as { success: boolean; error?: string }
    setSaving(false)
    if (result?.success) {
      setAddName('')
      setAddNumber('')
      await reloadTeam()
      addNameRef.current?.focus()
    } else {
      setAddError(result?.error ?? 'Failed to add player.')
    }
  }

  // ── Edit in-place ────────────────────────────────────────────────────────

  function startEdit(playerId: string): void {
    setRows(prev => prev.map(r =>
      r.id === playerId ? { ...r, _editing: true, _editName: r.name, _editNumber: r.number, _editError: '' } : r
    ))
  }

  function cancelEdit(playerId: string): void {
    setRows(prev => prev.map(r =>
      r.id === playerId ? { ...r, _editing: false, _editError: '' } : r
    ))
  }

  const handleEditChange = useCallback((playerId: string, field: 'name' | 'number', value: string) => {
    setRows(prev => prev.map(r =>
      r.id === playerId
        ? { ...r, [field === 'name' ? '_editName' : '_editNumber']: value, _editError: '' }
        : r
    ))
  }, [])

  async function commitEdit(playerId: string): Promise<void> {
    const row = rows.find(r => r.id === playerId)
    if (!row) return

    const nameErr = validateName(row._editName)
    if (nameErr) { setRows(prev => prev.map(r => r.id === playerId ? { ...r, _editError: nameErr } : r)); return }

    // exclude this player's current number from duplicate check
    const otherNums = rows.filter(r => r.id !== playerId).map(r => r.number)
    const numErr = validateNumber(row._editNumber, otherNums)
    if (numErr) { setRows(prev => prev.map(r => r.id === playerId ? { ...r, _editError: numErr } : r)); return }

    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_UPDATE_PLAYER',
      ligaId,
      teamId: team.id,
      playerId,
      updates: { name: row._editName.trim(), number: row._editNumber.trim() },
    }) as { success: boolean; error?: string }

    if (result?.success) {
      await reloadTeam()
    } else {
      setRows(prev => prev.map(r =>
        r.id === playerId ? { ...r, _editError: result?.error ?? 'Save failed.' } : r
      ))
    }
  }

  // ── Remove player ────────────────────────────────────────────────────────

  async function handleRemove(player: LigaPlayer): Promise<void> {
    const confirmed = window.confirm(
      `Remove ${player.name} (#${player.number}) from the roster? This cannot be undone.`
    )
    if (!confirmed) return

    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_REMOVE_PLAYER',
      ligaId,
      teamId: team.id,
      playerId: player.id,
    }) as { success: boolean; error?: string }

    if (result?.success) {
      await reloadTeam()
    }
  }

  // ── Photo assign ─────────────────────────────────────────────────────────

  async function handlePhotoAssign(player: LigaPlayer, files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return
    const file = files[0]
    // In Electron the file object has a .path property
    const filePath = (file as File & { path?: string }).path
    if (!filePath) {
      alert('Unable to get file path. Please try again.')
      return
    }

    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_ASSIGN_PLAYER_PHOTO',
      ligaId,
      teamId: team.id,
      playerId: player.id,
      filePath,
    }) as { success: boolean; photoPath?: string; error?: string; fileName?: string }

    if (result?.success) {
      await reloadTeam()
    } else {
      alert(`Photo error: ${result?.error ?? 'Unknown error'}`)
    }
  }

  // ── Key handlers ─────────────────────────────────────────────────────────

  function handleAddKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') handleAdd()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="rmv" role="region" aria-label={`${team.name} Roster Management`}>

      {/* Header */}
      <div className="rmv__header">
        {onClose && (
          <button className="rmv__back-btn" onClick={onClose} aria-label="Back">
            ← Back
          </button>
        )}
        <div className="rmv__header-info">
          <h2 className="rmv__title">{team.name} — Roster</h2>
          <span className="rmv__subtitle">{rows.length} player{rows.length !== 1 ? 's' : ''} registered</span>
        </div>
      </div>

      {/* Player list */}
      <div className="rmv__list" role="list" aria-label="Player roster">
        {rows.length === 0 && (
          <div className="rmv__empty">No players yet. Add one below.</div>
        )}

        {rows.map((row) => (
          <div key={row.id} className="rmv__player" role="listitem">
            {/* Photo */}
            <label className="rmv__photo-label" aria-label={`Assign photo to ${row.name}`} title="Click to assign photo">
              <PhotoThumb photoPath={row.photoPath} playerName={row.name} />
              {/* Invisible fallback placeholder — shown via JS when img errors */}
              <div className="rmv-player__photo rmv-player__photo--placeholder rmv-player__photo--hidden" aria-hidden="true">
                <svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="15" r="8" fill="#404055" /><path d="M4 38 Q20 22 36 38 Z" fill="#404055" /></svg>
              </div>
              <input
                type="file"
                accept=".jpg,.jpeg,.png"
                className="rmv__photo-input"
                aria-label={`Upload photo for ${row.name}`}
                onChange={e => handlePhotoAssign(row, e.target.files)}
              />
            </label>

            {/* Editable fields or display */}
            {row._editing ? (
              <div className="rmv__player-edit">
                <input
                  className="rmv__input rmv__input--num"
                  value={row._editNumber}
                  maxLength={2}
                  aria-label="Jersey number"
                  onChange={e => handleEditChange(row.id, 'number', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(row.id); if (e.key === 'Escape') cancelEdit(row.id) }}
                />
                <input
                  className="rmv__input rmv__input--name"
                  value={row._editName}
                  maxLength={50}
                  aria-label="Player name"
                  autoFocus
                  onChange={e => handleEditChange(row.id, 'name', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(row.id); if (e.key === 'Escape') cancelEdit(row.id) }}
                />
                {row._editError && (
                  <span className="rmv__field-error" role="alert">{row._editError}</span>
                )}
                <div className="rmv__edit-actions">
                  <button className="rmv__btn rmv__btn--save" onClick={() => commitEdit(row.id)} aria-label="Save changes">✓</button>
                  <button className="rmv__btn rmv__btn--cancel" onClick={() => cancelEdit(row.id)} aria-label="Cancel edit">✕</button>
                </div>
              </div>
            ) : (
              <div className="rmv__player-info">
                <span className="rmv__player-number" aria-label="Jersey number">#{row.number}</span>
                <span className="rmv__player-name">{row.name}</span>
              </div>
            )}

            {/* Row actions (only show when NOT editing) */}
            {!row._editing && (
              <div className="rmv__player-actions">
                <button
                  className="rmv__btn rmv__btn--edit"
                  onClick={() => startEdit(row.id)}
                  aria-label={`Edit ${row.name}`}
                  title="Edit player"
                >
                  ✎
                </button>
                <button
                  className="rmv__btn rmv__btn--delete"
                  onClick={() => handleRemove(row)}
                  aria-label={`Remove ${row.name}`}
                  title="Remove player"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add player form */}
      <div className="rmv__add-section" aria-label="Add new player">
        <h3 className="rmv__add-title">Add Player</h3>
        <div className="rmv__add-row">
          <input
            className="rmv__input rmv__input--num"
            type="text"
            placeholder="#"
            value={addNumber}
            maxLength={2}
            onChange={e => { setAddNumber(e.target.value); setAddError('') }}
            onKeyDown={handleAddKeyDown}
            aria-label="New jersey number"
          />
          <input
            ref={addNameRef}
            className="rmv__input rmv__input--name"
            type="text"
            placeholder="Player name (1–50 chars)"
            value={addName}
            maxLength={50}
            onChange={e => { setAddName(e.target.value); setAddError('') }}
            onKeyDown={handleAddKeyDown}
            aria-label="New player name"
          />
          <button
            className="rmv__btn rmv__btn--add"
            onClick={handleAdd}
            disabled={saving}
            aria-label="Add player"
          >
            {saving ? '…' : '+ Add'}
          </button>
        </div>
        {addError && (
          <p className="rmv__add-error" role="alert">{addError}</p>
        )}
        <p className="rmv__add-hint">Jersey numbers must be 1–99 and unique within the team.</p>
      </div>
    </div>
  )
}

export default RosterManagementView
