/**
 * TournamentManager — Tournament lifecycle management component.
 *
 * Provides three views:
 *  - list:    Browse tournaments for a Liga, create new ones, delete existing.
 *  - seeding: Auto-seed or manually seed teams (drag-reorder), then generate bracket.
 *  - bracket: View the active bracket (delegates to BracketViewer) with export controls.
 *
 * Requirements: 1.1, 2.1, 2.2, 8.1, 8.2
 * Tasks: 9.1, 9.2
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type {
  TournamentSummary,
  Tournament,
  BracketFormat,
  BracketOptions,
  TournamentSeed,
  LigaTeam,
} from '@shared/types'
import BracketViewer from './BracketViewer'
import './TournamentManager.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TournamentManagerProps {
  ligaId: string
}

type View = 'list' | 'seeding' | 'bracket'

interface CreateForm {
  name: string
  format: BracketFormat
}

interface CreateErrors {
  name?: string
  format?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(format: BracketFormat): string {
  switch (format) {
    case 'single-elimination': return 'Single Elim'
    case 'double-elimination': return 'Double Elim'
    case 'round-robin':        return 'Round Robin'
    default:                   return format
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':     return 'Pending'
    case 'seeding':     return 'Seeding'
    case 'in-progress': return 'In Progress'
    case 'completed':   return 'Completed'
    default:            return status
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'pending':     return 'tm__status--pending'
    case 'seeding':     return 'tm__status--seeding'
    case 'in-progress': return 'tm__status--inprogress'
    case 'completed':   return 'tm__status--completed'
    default:            return ''
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function TournamentManager({ ligaId }: TournamentManagerProps): React.ReactElement {
  // ── View state ────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('list')
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null)

  // ── List view state ───────────────────────────────────────────────────
  const [summaries, setSummaries] = useState<TournamentSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')

  // ── Create form state ─────────────────────────────────────────────────
  const [createForm, setCreateForm] = useState<CreateForm>({ name: '', format: 'single-elimination' })
  const [createErrors, setCreateErrors] = useState<CreateErrors>({})
  const [createSaving, setCreateSaving] = useState(false)

  // ── Seeding view state ────────────────────────────────────────────────
  const [ligaTeams, setLigaTeams] = useState<LigaTeam[]>([])
  const [seedMode, setSeedMode] = useState<'auto' | 'manual'>('auto')
  const [manualOrder, setManualOrder] = useState<LigaTeam[]>([])
  const [seedingBusy, setSeedingBusy] = useState(false)
  const [seedingError, setSeedingError] = useState('')
  const [generatingBracket, setGeneratingBracket] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [consolationMatch, setConsolationMatch] = useState(false)
  const [currentSeeds, setCurrentSeeds] = useState<TournamentSeed[]>([])

  // ── Drag state for manual seeding ─────────────────────────────────────
  const dragIndexRef = useRef<number | null>(null)

  // ── Export state ──────────────────────────────────────────────────────
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState('')
  const [printBusy, setPrintBusy] = useState(false)

  // ── Load tournament list ──────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_LIST',
        ligaId,
      }) as { success: boolean; tournaments?: TournamentSummary[]; error?: string }
      if (result.success) {
        setSummaries(result.tournaments ?? [])
      } else {
        setListError(result.error ?? 'Failed to load tournaments.')
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unknown error.')
    } finally {
      setListLoading(false)
    }
  }, [ligaId])

  // ── Load liga teams for seeding ───────────────────────────────────────
  const loadLigaTeams = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'LIGA_LOAD',
        id: ligaId,
      }) as { success: boolean; liga?: { teams: LigaTeam[] }; error?: string }
      if (result.success && result.liga) {
        setLigaTeams(result.liga.teams)
        setManualOrder(result.liga.teams)
      }
    } catch {
      // non-fatal; user will see empty seed list
    }
  }, [ligaId])

  useEffect(() => {
    loadList()
  }, [loadList])

  // ── Navigate to seeding view ──────────────────────────────────────────
  async function openSeeding(tournamentId: string): Promise<void> {
    setActiveTournamentId(tournamentId)
    setSeedingError('')
    setGenerateError('')
    setCurrentSeeds([])
    await loadLigaTeams()

    // Load existing tournament to pick up any already-saved seeds
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_LOAD',
        tournamentId,
      }) as { success: boolean; tournament?: Tournament; error?: string }
      if (result.success && result.tournament) {
        setActiveTournament(result.tournament)
        if (result.tournament.seeds.length > 0) {
          setCurrentSeeds(result.tournament.seeds)
        }
      }
    } catch {
      // ignore — start fresh
    }
    setView('seeding')
  }

  // ── Navigate to bracket view ──────────────────────────────────────────
  async function openBracket(tournamentId: string): Promise<void> {
    setActiveTournamentId(tournamentId)
    setExportError('')
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_LOAD',
        tournamentId,
      }) as { success: boolean; tournament?: Tournament; error?: string }
      if (result.success && result.tournament) {
        setActiveTournament(result.tournament)
      }
    } catch {
      // BracketViewer will handle its own error state
    }
    setView('bracket')
  }

  // ── Open tournament (route by status) ────────────────────────────────
  async function handleOpen(summary: TournamentSummary): Promise<void> {
    if (summary.status === 'pending' || summary.status === 'seeding') {
      await openSeeding(summary.id)
    } else {
      await openBracket(summary.id)
    }
  }

  // ── Create tournament ─────────────────────────────────────────────────
  async function handleCreate(): Promise<void> {
    const errors: CreateErrors = {}
    const trimmedName = createForm.name.trim()
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      errors.name = 'Name must be 1–100 characters.'
    }
    if (!createForm.format) {
      errors.format = 'Please select a format.'
    }
    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors)
      return
    }

    setCreateSaving(true)
    setCreateErrors({})
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_CREATE',
        ligaId,
        name: trimmedName,
        format: createForm.format,
      }) as { success: boolean; tournament?: Tournament; error?: string }
      if (result.success && result.tournament) {
        setCreateForm({ name: '', format: 'single-elimination' })
        await loadList()
        await openSeeding(result.tournament.id)
      } else {
        setCreateErrors({ name: result.error ?? 'Failed to create tournament.' })
      }
    } catch (err) {
      setCreateErrors({ name: err instanceof Error ? err.message : 'Unknown error.' })
    } finally {
      setCreateSaving(false)
    }
  }

  // ── Delete tournament ─────────────────────────────────────────────────
  async function handleDelete(summary: TournamentSummary): Promise<void> {
    const confirmed = window.confirm(
      `Delete tournament "${summary.name}"?\n\nThis will permanently remove the bracket and all match data. This cannot be undone.`
    )
    if (!confirmed) return

    try {
      await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_DELETE',
        tournamentId: summary.id,
      })
      if (activeTournamentId === summary.id) {
        setActiveTournamentId(null)
        setActiveTournament(null)
        setView('list')
      }
      await loadList()
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  // ── Auto-seed ─────────────────────────────────────────────────────────
  async function handleAutoSeed(): Promise<void> {
    if (!activeTournamentId) return
    setSeedingBusy(true)
    setSeedingError('')
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_AUTO_SEED',
        tournamentId: activeTournamentId,
      }) as { success: boolean; seeds?: TournamentSeed[]; error?: string }
      if (result.success && result.seeds) {
        setCurrentSeeds(result.seeds)
        // Sync manual order to reflect auto-seed result
        const seedOrder = result.seeds.map(s =>
          ligaTeams.find(t => t.id === s.teamId)
        ).filter((t): t is LigaTeam => t != null)
        setManualOrder(seedOrder)
      } else {
        setSeedingError(result.error ?? 'Auto-seed failed.')
      }
    } catch (err) {
      setSeedingError(err instanceof Error ? err.message : 'Auto-seed failed.')
    } finally {
      setSeedingBusy(false)
    }
  }

  // ── Manual-seed ───────────────────────────────────────────────────────
  async function handleManualSeed(): Promise<void> {
    if (!activeTournamentId) return
    if (manualOrder.length < 2) {
      setSeedingError('At least 2 teams are required.')
      return
    }
    setSeedingBusy(true)
    setSeedingError('')
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_MANUAL_SEED',
        tournamentId: activeTournamentId,
        teamIds: manualOrder.map(t => t.id),
      }) as { success: boolean; seeds?: TournamentSeed[]; error?: string }
      if (result.success && result.seeds) {
        setCurrentSeeds(result.seeds)
      } else {
        setSeedingError(result.error ?? 'Manual seed failed.')
      }
    } catch (err) {
      setSeedingError(err instanceof Error ? err.message : 'Manual seed failed.')
    } finally {
      setSeedingBusy(false)
    }
  }

  // ── Generate bracket ──────────────────────────────────────────────────
  async function handleGenerateBracket(): Promise<void> {
    if (!activeTournamentId) return
    if (currentSeeds.length < 2) {
      setGenerateError('Seed the teams first before generating the bracket.')
      return
    }
    setGeneratingBracket(true)
    setGenerateError('')
    const options: BracketOptions = { consolationMatch }
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_GENERATE_BRACKET',
        tournamentId: activeTournamentId,
        options,
      }) as { success: boolean; tournament?: Tournament; error?: string }
      if (result.success && result.tournament) {
        setActiveTournament(result.tournament)
        await loadList()
        setView('bracket')
      } else {
        setGenerateError(result.error ?? 'Bracket generation failed.')
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Bracket generation failed.')
    } finally {
      setGeneratingBracket(false)
    }
  }

  // ── Reset tournament ──────────────────────────────────────────────────
  async function handleReset(): Promise<void> {
    if (!activeTournamentId) return
    const confirmed = window.confirm(
      'Reset this tournament? All match results will be cleared and the bracket will return to the seeding stage.'
    )
    if (!confirmed) return
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_RESET',
        tournamentId: activeTournamentId,
      }) as { success: boolean; tournament?: Tournament; error?: string }
      if (result.success && result.tournament) {
        setActiveTournament(result.tournament)
        await loadList()
        await openSeeding(activeTournamentId)
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Reset failed.')
    }
  }

  // ── Export PDF ────────────────────────────────────────────────────────
  async function handleExportPdf(): Promise<void> {
    if (!activeTournamentId) return
    setExportBusy(true)
    setExportError('')
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_EXPORT_PDF',
        tournamentId: activeTournamentId,
      }) as { success: boolean; error?: string }
      if (!result.success) {
        setExportError(result.error ?? 'PDF export failed.')
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PDF export failed.')
    } finally {
      setExportBusy(false)
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────
  async function handlePrint(): Promise<void> {
    if (!activeTournamentId) return
    setPrintBusy(true)
    setExportError('')
    try {
      const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'TOURNAMENT_PRINT',
        tournamentId: activeTournamentId,
      }) as { success: boolean; error?: string }
      if (result.success) {
        // Trigger the system print dialog with the bracket visible
        window.print()
      } else {
        setExportError(result.error ?? 'Print failed.')
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Print failed.')
    } finally {
      setPrintBusy(false)
    }
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────────
  function handleDragStart(index: number): void {
    dragIndexRef.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number): void {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    const reordered = [...manualOrder]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(index, 0, moved)
    dragIndexRef.current = index
    setManualOrder(reordered)
    // Clear seeds on reorder so user must re-apply
    setCurrentSeeds([])
  }

  function handleDragEnd(): void {
    dragIndexRef.current = null
  }

  // ── Computed helpers ──────────────────────────────────────────────────
  const activeFormatSupportsConsolation =
    activeTournament?.format === 'single-elimination' ||
    (summaries.find(s => s.id === activeTournamentId)?.format === 'single-elimination')

  const activeName = activeTournament?.name
    ?? summaries.find(s => s.id === activeTournamentId)?.name
    ?? ''

  // ── Render: List View ─────────────────────────────────────────────────
  function renderListView(): React.ReactElement {
    return (
      <div className="tm__list-view">
        {/* Create form */}
        <section className="tm__create-section" aria-label="Create new tournament">
          <h3 className="tm__section-title">New Tournament</h3>
          <div className="tm__create-row">
            <div className="tm__field">
              <label className="tm__label" htmlFor="tm-name">Name</label>
              <input
                id="tm-name"
                type="text"
                className={`tm__input${createErrors.name ? ' tm__input--error' : ''}`}
                value={createForm.name}
                maxLength={100}
                placeholder="1–100 characters"
                onChange={e => {
                  setCreateForm(f => ({ ...f, name: e.target.value }))
                  setCreateErrors(prev => ({ ...prev, name: undefined }))
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                aria-label="Tournament name"
                aria-describedby={createErrors.name ? 'tm-name-err' : undefined}
              />
              {createErrors.name && (
                <span id="tm-name-err" className="tm__field-error" role="alert">{createErrors.name}</span>
              )}
            </div>

            <div className="tm__field">
              <label className="tm__label" htmlFor="tm-format">Format</label>
              <select
                id="tm-format"
                className={`tm__select${createErrors.format ? ' tm__input--error' : ''}`}
                value={createForm.format}
                onChange={e => {
                  setCreateForm(f => ({ ...f, format: e.target.value as BracketFormat }))
                  setCreateErrors(prev => ({ ...prev, format: undefined }))
                }}
                aria-label="Tournament format"
              >
                <option value="single-elimination">Single Elimination</option>
                <option value="double-elimination">Double Elimination</option>
                <option value="round-robin">Round Robin</option>
              </select>
              {createErrors.format && (
                <span className="tm__field-error" role="alert">{createErrors.format}</span>
              )}
            </div>

            <button
              className="tm__btn tm__btn--create"
              onClick={handleCreate}
              disabled={createSaving}
              aria-label="Create tournament"
            >
              {createSaving ? '…' : '+ Create'}
            </button>
          </div>
        </section>

        {/* Tournament list */}
        <section className="tm__tournament-list" aria-label="Tournament list">
          <h3 className="tm__section-title">
            Tournaments
            <span className="tm__count">{summaries.length}</span>
          </h3>

          {listLoading && <p className="tm__empty">Loading…</p>}
          {!listLoading && listError && (
            <p className="tm__error" role="alert">{listError}</p>
          )}
          {!listLoading && !listError && summaries.length === 0 && (
            <p className="tm__empty">No tournaments yet. Create one above.</p>
          )}

          {!listLoading && summaries.length > 0 && (
            <ul className="tm__list" aria-label="Tournaments">
              {summaries.map(s => (
                <li key={s.id} className="tm__list-item">
                  <button
                    className="tm__list-item-main"
                    onClick={() => handleOpen(s)}
                    aria-label={`Open tournament ${s.name}`}
                  >
                    <span className="tm__list-item-name">{s.name}</span>
                    <span className="tm__list-item-meta">
                      <span className="tm__format-badge">{formatLabel(s.format)}</span>
                      <span className={`tm__status tm__status--inline ${statusClass(s.status)}`}>
                        {statusLabel(s.status)}
                      </span>
                      {s.teamCount > 0 && (
                        <span className="tm__list-item-teams">{s.teamCount} teams</span>
                      )}
                    </span>
                  </button>
                  <button
                    className="tm__btn tm__btn--delete"
                    onClick={e => { e.stopPropagation(); handleDelete(s) }}
                    aria-label={`Delete tournament ${s.name}`}
                    title="Delete tournament"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  }

  // ── Render: Seeding View ──────────────────────────────────────────────
  function renderSeedingView(): React.ReactElement {
    const hasSeeds = currentSeeds.length >= 2
    const showManualList = seedMode === 'manual' && ligaTeams.length > 0

    return (
      <div className="tm__seeding-view">
        {/* Seed mode selector */}
        <section className="tm__seed-mode-section" aria-label="Seeding mode">
          <h3 className="tm__section-title">Seeding Mode</h3>
          <div className="tm__seed-mode-row" role="radiogroup" aria-label="Select seeding mode">
            <label className="tm__radio-label">
              <input
                type="radio"
                name="seedMode"
                value="auto"
                checked={seedMode === 'auto'}
                onChange={() => setSeedMode('auto')}
                aria-label="Auto-seed by win-loss record"
              />
              <span className="tm__radio-text">
                <strong>Auto-seed</strong>
                <span className="tm__radio-desc">Ranked by win-loss record, then point differential, then name</span>
              </span>
            </label>
            <label className="tm__radio-label">
              <input
                type="radio"
                name="seedMode"
                value="manual"
                checked={seedMode === 'manual'}
                onChange={() => setSeedMode('manual')}
                aria-label="Manual seed with drag-reorder"
              />
              <span className="tm__radio-text">
                <strong>Manual seed</strong>
                <span className="tm__radio-desc">Drag teams into desired seed order</span>
              </span>
            </label>
          </div>
        </section>

        {/* Auto-seed controls */}
        {seedMode === 'auto' && (
          <section className="tm__auto-seed-section" aria-label="Auto-seed controls">
            <button
              className="tm__btn tm__btn--primary"
              onClick={handleAutoSeed}
              disabled={seedingBusy}
              aria-label="Run auto-seed"
            >
              {seedingBusy ? 'Seeding…' : 'Run Auto-Seed'}
            </button>
            {hasSeeds && !seedingBusy && (
              <div className="tm__seed-preview" aria-label="Seed preview">
                <h4 className="tm__seed-preview-title">Seed Order Preview</h4>
                <ol className="tm__seed-list" aria-label="Seeded teams">
                  {currentSeeds.map(s => (
                    <li key={s.seedNumber} className="tm__seed-item">
                      <span className="tm__seed-num">#{s.seedNumber}</span>
                      <span className="tm__seed-name">{s.teamName}</span>
                      <span className="tm__seed-record">{s.record.wins}W–{s.record.losses}L</span>
                      <span className="tm__seed-diff" title="Point differential">
                        {s.pointDifferential >= 0 ? '+' : ''}{s.pointDifferential}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        {/* Manual seed controls */}
        {seedMode === 'manual' && (
          <section className="tm__manual-seed-section" aria-label="Manual seed order">
            {ligaTeams.length === 0 && (
              <p className="tm__empty">No teams found in this Liga.</p>
            )}
            {showManualList && (
              <>
                <p className="tm__manual-hint">Drag teams to set seed order (top = seed #1)</p>
                <ol className="tm__drag-list" aria-label="Drag to reorder teams">
                  {manualOrder.map((team, index) => (
                    <li
                      key={team.id}
                      className="tm__drag-item"
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={e => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      aria-label={`Seed ${index + 1}: ${team.name}, drag to reorder`}
                    >
                      <span className="tm__drag-handle" aria-hidden="true">⠿</span>
                      <span className="tm__drag-seed-num">#{index + 1}</span>
                      <span className="tm__drag-team-name">{team.name}</span>
                    </li>
                  ))}
                </ol>
                <button
                  className="tm__btn tm__btn--primary"
                  onClick={handleManualSeed}
                  disabled={seedingBusy || manualOrder.length < 2}
                  aria-label="Apply manual seed order"
                >
                  {seedingBusy ? 'Saving…' : 'Apply Seed Order'}
                </button>
                {hasSeeds && !seedingBusy && (
                  <p className="tm__seed-saved-note" role="status">
                    ✓ Seed order saved — {currentSeeds.length} teams seeded
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {seedingError && (
          <p className="tm__error" role="alert">
            {seedingError.includes('At least 2 teams')
              ? '⚠ No teams found in this Liga. Go back to the Liga screen and add teams under "Registered Teams" before seeding.'
              : seedingError}
          </p>
        )}

        {/* Bracket options */}
        {activeFormatSupportsConsolation && (
          <section className="tm__bracket-options" aria-label="Bracket options">
            <h3 className="tm__section-title">Bracket Options</h3>
            <label className="tm__checkbox-label">
              <input
                type="checkbox"
                checked={consolationMatch}
                onChange={e => setConsolationMatch(e.target.checked)}
                aria-label="Include 3rd place consolation match"
              />
              <span>Include 3rd place consolation match</span>
            </label>
          </section>
        )}

        {/* Generate bracket */}
        <section className="tm__generate-section" aria-label="Generate bracket">
          <button
            className="tm__btn tm__btn--generate"
            onClick={handleGenerateBracket}
            disabled={generatingBracket || !hasSeeds}
            aria-label="Generate bracket"
            title={!hasSeeds ? 'Seed teams first' : undefined}
          >
            {generatingBracket ? 'Generating…' : 'Generate Bracket →'}
          </button>
          {!hasSeeds && (
            <p className="tm__generate-hint">Seed teams before generating the bracket.</p>
          )}
          {generateError && (
            <p className="tm__error" role="alert">{generateError}</p>
          )}
        </section>
      </div>
    )
  }

  // ── Render: Bracket View ──────────────────────────────────────────────
  function renderBracketView(): React.ReactElement {
    if (!activeTournamentId) return <div className="tm__empty">No tournament selected.</div>

    return (
      <div className="tm__bracket-view">
        {/* Export panel */}
        <div className="tm__export-panel" aria-label="Export controls">
          <span className="tm__export-label">Export</span>
          <button
            className="tm__btn tm__btn--export"
            onClick={handleExportPdf}
            disabled={exportBusy}
            aria-label="Export bracket as PDF"
          >
            {exportBusy ? 'Exporting…' : '⬇ Export PDF'}
          </button>
          <button
            className="tm__btn tm__btn--print"
            onClick={handlePrint}
            disabled={printBusy}
            aria-label="Print bracket"
          >
            {printBusy ? 'Printing…' : '🖨 Print'}
          </button>
          <button
            className="tm__btn tm__btn--secondary"
            onClick={handleReset}
            aria-label="Reset tournament bracket"
            title="Clears all match results and returns to seeding"
          >
            ↺ Reset
          </button>
          {exportError && (
            <span className="tm__export-error" role="alert">{exportError}</span>
          )}
        </div>

        {/* Bracket viewer */}
        <div className="tm__bracket-container">
          <BracketViewer
            tournamentId={activeTournamentId}
            ligaId={ligaId}
          />
        </div>
      </div>
    )
  }

  // ── Top-level render ──────────────────────────────────────────────────
  return (
    <div className="tm" role="region" aria-label="Tournament Manager">
      {/* Header with nav */}
      <div className="tm__header">
        <div className="tm__nav">
          <button
            className={`tm__nav-btn${view === 'list' ? ' tm__nav-btn--active' : ''}`}
            onClick={() => { setView('list'); loadList() }}
            aria-label="Tournament list"
            aria-current={view === 'list' ? 'page' : undefined}
          >
            Tournaments
          </button>
          {activeTournamentId && (
            <>
              <span className="tm__nav-sep">›</span>
              <span className="tm__nav-name">{activeName}</span>
              <span className="tm__nav-sep">›</span>
              <button
                className={`tm__nav-btn${view === 'seeding' ? ' tm__nav-btn--active' : ''}`}
                onClick={() => { if (activeTournamentId) openSeeding(activeTournamentId) }}
                aria-label="Seeding panel"
                aria-current={view === 'seeding' ? 'page' : undefined}
              >
                Seeding
              </button>
              {(activeTournament?.status === 'in-progress' || activeTournament?.status === 'completed') && (
                <>
                  <span className="tm__nav-sep">›</span>
                  <button
                    className={`tm__nav-btn${view === 'bracket' ? ' tm__nav-btn--active' : ''}`}
                    onClick={() => { if (activeTournamentId) openBracket(activeTournamentId) }}
                    aria-label="Bracket view"
                    aria-current={view === 'bracket' ? 'page' : undefined}
                  >
                    Bracket
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* View content */}
      <div className="tm__content">
        {view === 'list'    && renderListView()}
        {view === 'seeding' && renderSeedingView()}
        {view === 'bracket' && renderBracketView()}
      </div>
    </div>
  )
}

export default TournamentManager
