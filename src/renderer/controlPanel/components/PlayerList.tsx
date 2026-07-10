import React, { useState, useEffect } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import type { Player } from '@shared/types'
import { SCOREBOARD_EVENT } from '@shared/types'
import './PlayerList.css'

interface PlayerListProps {
  team: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// Placeholder silhouette SVG (inline) for players with no photo
// ---------------------------------------------------------------------------
const SILHOUETTE_SVG_DATA =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="#4a6080">
      <circle cx="20" cy="13" r="7"/>
      <path d="M4 38c0-8.8 7.2-16 16-16s16 7.2 16 16"/>
    </svg>`
  )

function PlayerList({ team }: PlayerListProps): React.ReactElement {
  const players = useControlPanelStore((s) => s.gameState[team].players)
  const teamName = useControlPanelStore((s) => s.gameState[team].config.name)

  const [newNumber, setNewNumber] = useState('')
  const [newName, setNewName] = useState('')
  const [photoError, setPhotoError] = useState<string | null>(null)

  // Listen for photo validation error events from main process
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.ipcRenderer) return
    const handler = (event: unknown): void => {
      const ev = event as { type: string; fileName?: string; reason?: string }
      if (ev.type === 'PLAYER_PHOTO_ERROR') {
        setPhotoError(`Photo error — ${ev.fileName ?? 'file'}: ${ev.reason ?? 'Unknown error'}`)
        setTimeout(() => setPhotoError(null), 6000)
      }
    }
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handler)
    return () => {
      // Cleanup is handled by the renderer lifecycle
    }
  }, [])

  function handleAddPlayer(): void {
    if (!newName.trim() || !newNumber.trim()) return
    const player: Player = {
      id: `${team}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      number: newNumber.trim(),
      name: newName.trim(),
      fouls: 0,
      points: 0,
      rebounds: 0,
      assists: 0,
      active: true,
      fouledOut: false,
      steals: 0,
      blocks: 0,
      fga: 0,
      fgm: 0,
      minutesPlayed: 0,
      substitutions: [],
      photoPath: null,
    }
    sendCommand({ type: 'ADD_PLAYER', team, player })
    setNewNumber('')
    setNewName('')
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') handleAddPlayer()
  }

  /**
   * Handles photo file selection for a player.
   * Sends ASSIGN_PLAYER_PHOTO command with the file path;
   * main process validates JPEG/PNG magic bytes and 5 MB limit.
   */
  function handlePhotoSelect(playerId: string, e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const filePath = (file as File & { path?: string }).path ?? file.name
    sendCommand({ type: 'ASSIGN_PLAYER_PHOTO', team, playerId, photoPath: filePath })
    // Reset the input so the same file can be re-selected after an error
    e.target.value = ''
  }

  /**
   * Resolves a photoPath stored relative to userData (or absolute) into a
   * src URL usable by <img>. The custom protocol `local-file:///` is already
   * registered by the main process for serving local files.
   */
  function resolvePhotoSrc(photoPath: string): string {
    return `local-file:///${photoPath.replace(/\\/g, '/')}`
  }

  return (
    <div className="player-list" data-team={team}>
      <div className="player-list__header">{teamName} — Players</div>

      {/* Photo error banner */}
      {photoError && (
        <div className="player-list__photo-error" role="alert" aria-live="assertive">
          {photoError}
        </div>
      )}

      {/* Add player form */}
      <div className="player-list__add-row">
        <input
          className="player-list__input player-list__input--num"
          type="text"
          placeholder="#"
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={3}
          aria-label="Jersey number"
        />
        <input
          className="player-list__input player-list__input--name"
          type="text"
          placeholder="Player name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={30}
          aria-label="Player name"
        />
        <button
          className="player-list__add-btn"
          onClick={handleAddPlayer}
          disabled={!newName.trim() || !newNumber.trim()}
          aria-label="Add player"
        >
          +
        </button>
      </div>

      {/* Player rows */}
      {players.length === 0 && (
        <div className="player-list__empty">No players added yet</div>
      )}

      <div className="player-list__rows">
        {players.map((p) => (
          <div key={p.id} className="player-list__row">
            {/* Photo thumbnail / silhouette (Req 16.2) */}
            <div className="player-list__photo-wrap">
              <img
                className="player-list__photo"
                src={p.photoPath ? resolvePhotoSrc(p.photoPath) : SILHOUETTE_SVG_DATA}
                alt={p.photoPath ? `${p.name} photo` : `${p.name} silhouette`}
                width={40}
                height={40}
                onError={(ev) => {
                  // If the photo file is unreadable, fall back to silhouette
                  ;(ev.currentTarget as HTMLImageElement).src = SILHOUETTE_SVG_DATA
                }}
              />
              {/* Hidden file input for photo assignment */}
              <label
                className="player-list__photo-label"
                aria-label={`Assign photo to ${p.name}`}
                title="Click to assign a photo (JPEG or PNG, max 5 MB)"
              >
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  className="player-list__photo-input"
                  onChange={(e) => handlePhotoSelect(p.id, e)}
                  aria-label={`Upload photo for ${p.name}`}
                />
                📷
              </label>
            </div>

            <span className="player-list__num">#{p.number}</span>
            <span className="player-list__name">{p.name}</span>
            <span className="player-list__pts">{p.points} pts</span>

            {/* Fouls */}
            <div className="player-list__fouls">
              <button
                className="player-list__foul-btn"
                onClick={() => sendCommand({ type: 'SUBTRACT_PLAYER_FOUL', team, playerId: p.id })}
                disabled={p.fouls === 0}
                aria-label={`Subtract foul from ${p.name}`}
              >
                −
              </button>
              <span className={`player-list__foul-count${p.fouls >= 5 ? ' player-list__foul-count--max' : ''}`}>
                {p.fouls}F
              </span>
              <button
                className="player-list__foul-btn"
                onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team, playerId: p.id })}
                aria-label={`Add foul to ${p.name}`}
              >
                +
              </button>
            </div>

            {/* Points */}
            <div className="player-list__pts-btns">
              <button className="player-list__pt-btn" onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team, playerId: p.id, points: 1 })}>+1</button>
              <button className="player-list__pt-btn" onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team, playerId: p.id, points: 2 })}>+2</button>
              <button className="player-list__pt-btn" onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team, playerId: p.id, points: 3 })}>+3</button>
            </div>

            {/* Remove */}
            <button
              className="player-list__remove-btn"
              onClick={() => sendCommand({ type: 'REMOVE_PLAYER', team, playerId: p.id })}
              aria-label={`Remove ${p.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PlayerList
