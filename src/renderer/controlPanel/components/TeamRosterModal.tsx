import React, { useState, useRef } from 'react'
import type { LigaTeam, LigaPlayer } from '@shared/types'
import './TeamRosterModal.css'

interface TeamRosterModalProps {
  team: LigaTeam
  ligaId: string
  onClose: () => void
  onUpdated: () => void
}

export function TeamRosterModal({ team, ligaId, onClose, onUpdated }: TeamRosterModalProps): React.ReactElement {
  const [players, setPlayers] = useState<LigaPlayer[]>(team.players)
  const [newNumber, setNewNumber] = useState('')
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  async function reloadPlayers(): Promise<void> {
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_LOAD',
      id: ligaId,
    }) as any
    if (result?.success) {
      const updatedTeam = result.liga.teams.find((t: LigaTeam) => t.id === team.id)
      if (updatedTeam) setPlayers(updatedTeam.players)
      onUpdated()
    }
  }

  async function handleAddPlayer(): Promise<void> {
    const num = newNumber.trim()
    const name = newName.trim()
    if (!num) { setAddError('Jersey number is required'); return }
    if (!name) { setAddError('Player name is required'); return }
    if (players.some(p => p.number === num)) { setAddError(`#${num} is already taken`); return }

    setSaving(true)
    setAddError('')
    const player: LigaPlayer = {
      id: `${team.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      number: num,
      name: name.toUpperCase(),
    }
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_ADD_PLAYER',
      ligaId,
      teamId: team.id,
      player,
    }) as any
    setSaving(false)
    if (result?.success) {
      setNewNumber('')
      setNewName('')
      await reloadPlayers()
      nameInputRef.current?.focus()
    } else {
      setAddError(result?.error ?? 'Failed to add player')
    }
  }

  async function handleRemovePlayer(playerId: string): Promise<void> {
    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_REMOVE_PLAYER',
      ligaId,
      teamId: team.id,
      playerId,
    }) as any
    if (result?.success) await reloadPlayers()
  }

  async function handleUpdatePlayer(playerId: string, field: 'number' | 'name', value: string): Promise<void> {
    if (!value.trim()) return
    await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'LIGA_UPDATE_PLAYER',
      ligaId,
      teamId: team.id,
      playerId,
      updates: { [field]: field === 'name' ? value.trim().toUpperCase() : value.trim() },
    })
    await reloadPlayers()
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') handleAddPlayer()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="trm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="trm-modal" role="dialog" aria-modal="true" aria-label={`${team.name} Roster`}>

        {/* Header */}
        <div className="trm-header">
          <div className="trm-header__left">
            <div className="trm-header__icon">🏀</div>
            <div>
              <h2 className="trm-header__title">{team.name}</h2>
              <p className="trm-header__sub">{players.length} player{players.length !== 1 ? 's' : ''} registered</p>
            </div>
          </div>
          <button className="trm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Player list */}
        <div className="trm-list">
          {players.length === 0 && (
            <div className="trm-empty">No players yet — add one below</div>
          )}
          {players.map((p, i) => (
            <div key={p.id} className="trm-player">
              <span className="trm-player__idx">{i + 1}</span>
              <input
                className="trm-player__num"
                defaultValue={p.number}
                maxLength={3}
                aria-label="Jersey number"
                onBlur={e => handleUpdatePlayer(p.id, 'number', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <input
                className="trm-player__name"
                defaultValue={p.name}
                aria-label="Player name"
                onBlur={e => handleUpdatePlayer(p.id, 'name', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <button
                className="trm-player__del"
                onClick={() => handleRemovePlayer(p.id)}
                aria-label={`Remove ${p.name}`}
              >✕</button>
            </div>
          ))}
        </div>

        {/* Add player row */}
        <div className="trm-add">
          <div className="trm-add__row">
            <input
              className="trm-add__num"
              placeholder="#"
              maxLength={3}
              value={newNumber}
              onChange={e => { setNewNumber(e.target.value); setAddError('') }}
              onKeyDown={handleKeyDown}
              aria-label="New jersey number"
            />
            <input
              ref={nameInputRef}
              className="trm-add__name"
              placeholder="Player name"
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={handleKeyDown}
              aria-label="New player name"
            />
            <button
              className="trm-add__btn"
              onClick={handleAddPlayer}
              disabled={saving}
            >
              {saving ? '…' : '+ Add'}
            </button>
          </div>
          {addError && <p className="trm-add__error">{addError}</p>}
          <p className="trm-add__hint">Press Enter to quickly add — need at least 5 for a match</p>
        </div>

        {/* Footer */}
        <div className="trm-footer">
          <div className={`trm-footer__count ${players.length >= 5 ? 'trm-footer__count--ok' : 'trm-footer__count--warn'}`}>
            {players.length >= 5 ? `✓ Ready (${players.length} players)` : `⚠ Need ${5 - players.length} more player${5 - players.length !== 1 ? 's' : ''}`}
          </div>
          <button className="trm-footer__done" onClick={onClose}>Done</button>
        </div>

      </div>
    </div>
  )
}
