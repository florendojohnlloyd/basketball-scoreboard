import React, { useState, useRef } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import './TeamConfigPanel.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_NAME_MAX = 30

/** MIME types and file extensions accepted for logo upload */
const ACCEPTED_LOGO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'])
const ACCEPTED_LOGO_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateTeamName(value: string): string {
  if (value.trim().length === 0) {
    return 'Team name cannot be empty or whitespace-only'
  }
  if (value.length > TEAM_NAME_MAX) {
    return `Team name must be ${TEAM_NAME_MAX} characters or fewer`
  }
  return ''
}

function isLogoFileValid(file: File): boolean {
  // Check MIME type first, then fall back to extension
  if (ACCEPTED_LOGO_MIME.includes(file.type)) return true
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  return ACCEPTED_LOGO_EXTENSIONS.has(ext)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TeamConfigPanelProps {
  /** Which team this panel configures */
  team: 'home' | 'away'
}

// ---------------------------------------------------------------------------
// TeamConfigPanel component
// ---------------------------------------------------------------------------

/**
 * Renders team configuration controls for a single team:
 *   - Text input for team name (1–30 chars, non-whitespace-only)
 *   - Color picker for accent color
 *   - File input for logo upload (JPEG, PNG, GIF, WebP, SVG)
 *
 * All changes dispatch SET_TEAM_CONFIG immediately, which the Scoreboard
 * Display reflects within 200 ms via the IPC state broadcast.
 */
function TeamConfigPanel({ team }: TeamConfigPanelProps): React.ReactElement {
  const teamConfig = useControlPanelStore((s) => s.gameState[team].config)

  // ---- Team name state ----
  const [nameInput, setNameInput] = useState<string>(teamConfig.name)
  const [nameError, setNameError] = useState<string>('')

  // ---- Logo state ----
  const [logoError, setLogoError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- Player image state ----
  const [playerImgError, setPlayerImgError] = useState<string>('')
  const playerFileInputRef = useRef<HTMLInputElement>(null)

  // ---- Handlers: team name ----

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value
    setNameInput(value)
    // Live validation feedback while typing
    setNameError(validateTeamName(value))
  }

  function commitName(): void {
    const error = validateTeamName(nameInput)
    if (error) {
      setNameError(error)
      return
    }
    setNameError('')
    sendCommand({
      type: 'SET_TEAM_CONFIG',
      team,
      config: { name: nameInput.trim() },
    })
  }

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      ;(e.target as HTMLInputElement).blur()
      commitName()
    }
  }

  function handleNameBlur(): void {
    commitName()
  }

  // ---- Handlers: color picker ----

  function handleColorChange(e: React.ChangeEvent<HTMLInputElement>): void {
    sendCommand({
      type: 'SET_TEAM_CONFIG',
      team,
      config: { color: e.target.value },
    })
  }

  // ---- Handlers: logo file input ----

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isLogoFileValid(file)) {
      setLogoError('Unsupported file type. Please use JPEG, PNG, GIF, WebP, or SVG.')
      // Reset the file input so the same invalid file can trigger onChange again
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setLogoError('')
    // In Electron's renderer the File object has a non-standard `.path` property
    // containing the absolute filesystem path. We access it via a cast since it
    // is not part of the standard Web File API typings.
    const filePath = (file as File & { path?: string }).path ?? file.name
    sendCommand({
      type: 'SET_TEAM_CONFIG',
      team,
      config: { logoPath: filePath },
    })
  }

  // ---- Render ----

  const teamLabel = team === 'home' ? 'Home' : 'Away'

  return (
    <div className="team-config-panel" data-team={team}>
      {/* Panel heading */}
      <div className="team-config-panel__heading">{teamLabel} Team</div>

      {/* ---- Team Name ---- */}
      <div className="team-config-panel__field">
        <label
          className="team-config-panel__label"
          htmlFor={`team-name-${team}`}
        >
          Team Name
        </label>
        <input
          id={`team-name-${team}`}
          className={`team-config-panel__text-input${nameError ? ' team-config-panel__text-input--error' : ''}`}
          type="text"
          value={nameInput}
          maxLength={TEAM_NAME_MAX + 1} // allow one extra so user sees the error
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          onKeyDown={handleNameKeyDown}
          aria-label={`${teamLabel} team name`}
          aria-describedby={nameError ? `team-name-${team}-error` : undefined}
          aria-invalid={nameError ? 'true' : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {nameError && (
          <div
            id={`team-name-${team}-error`}
            className="team-config-panel__error"
            role="alert"
          >
            {nameError}
          </div>
        )}
      </div>

      {/* ---- Accent Color ---- */}
      <div className="team-config-panel__field">
        <label
          className="team-config-panel__label"
          htmlFor={`team-color-${team}`}
        >
          Team Color
        </label>
        <div className="team-config-panel__color-row">
          <input
            id={`team-color-${team}`}
            className="team-config-panel__color-input"
            type="color"
            defaultValue={teamConfig.color}
            onChange={handleColorChange}
            aria-label={`${teamLabel} team accent color`}
          />
          <span className="team-config-panel__color-value" aria-hidden="true">
            {teamConfig.color}
          </span>
        </div>
      </div>

      {/* ---- Logo Upload ---- */}
      <div className="team-config-panel__field">
        <label
          className="team-config-panel__label"
          htmlFor={`team-logo-${team}`}
        >
          Team Logo
        </label>
        <input
          id={`team-logo-${team}`}
          ref={fileInputRef}
          className="team-config-panel__file-input"
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp,.svg,image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          onChange={handleFileChange}
          aria-label={`${teamLabel} team logo (JPEG, PNG, GIF, WebP, or SVG)`}
          aria-describedby={logoError ? `team-logo-${team}-error` : undefined}
          aria-invalid={logoError ? 'true' : undefined}
        />
        {teamConfig.logoPath && !logoError && (
          <div className="team-config-panel__logo-name" aria-live="polite">
            {teamConfig.logoPath.split(/[\\/]/).pop()}
          </div>
        )}
        {logoError && (
          <div
            id={`team-logo-${team}-error`}
            className="team-config-panel__error"
            role="alert"
          >
            {logoError}
          </div>
        )}
      </div>

      {/* ---- Player Image Upload ---- */}
      <div className="team-config-panel__field">
        <label
          className="team-config-panel__label"
          htmlFor={`team-player-${team}`}
        >
          Featured Player (PNG cutout)
        </label>
        <input
          id={`team-player-${team}`}
          ref={playerFileInputRef}
          className="team-config-panel__file-input"
          type="file"
          accept=".png,image/png"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
            if (ext !== '.png' && file.type !== 'image/png') {
              setPlayerImgError('Only PNG files are supported for player cutouts.')
              if (playerFileInputRef.current) playerFileInputRef.current.value = ''
              return
            }
            setPlayerImgError('')
            const filePath = (file as File & { path?: string }).path ?? file.name
            sendCommand({
              type: 'SET_TEAM_CONFIG',
              team,
              config: { playerImagePath: filePath },
            })
          }}
          aria-label={`${teamLabel} featured player image (PNG)`}
          aria-describedby={playerImgError ? `team-player-${team}-error` : undefined}
          aria-invalid={playerImgError ? 'true' : undefined}
        />
        {teamConfig.playerImagePath && !playerImgError && (
          <div className="team-config-panel__logo-name" aria-live="polite">
            {teamConfig.playerImagePath.split(/[\\/]/).pop()}
          </div>
        )}
        {playerImgError && (
          <div
            id={`team-player-${team}-error`}
            className="team-config-panel__error"
            role="alert"
          >
            {playerImgError}
          </div>
        )}
      </div>
    </div>
  )
}

export default TeamConfigPanel
