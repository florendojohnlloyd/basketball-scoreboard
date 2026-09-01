import React, { useState, useEffect } from 'react'
import { useControlPanelStore, sendCommand } from './store'
import type { UserSession } from './store'
import { formatClockDisplay } from '../shared/clockUtils'
import type { Player, Liga, LigaTeam, GameLogRecord, SyncRecord } from '@shared/types'
import { SCOREBOARD_EVENT, SCOREBOARD_QUERY } from '@shared/types'
import { SportSelector } from './components/SportSelector'
import SyncConflictDialog from './components/SyncConflictDialog'
import { TeamRosterModal } from './components/TeamRosterModal'
import { EditableWidget } from './components/EditableWidget'
import { useLayoutStore } from './components/useLayoutStore'
import { ScoreTab } from './components/ScoreTab'
import { LoginScreen } from './components/LoginScreen'
import AdvancedMetricsPanel from './components/AdvancedMetricsPanel'
import GameHistoryView from './components/GameHistoryView'
import SeasonStatsView from './components/SeasonStatsView'
import LeaderboardsView from './components/LeaderboardsView'
import BoxScoreView from './components/BoxScoreView'
import ScheduleManagementView from './components/ScheduleManagementView'
import StaffManagementView from './components/StaffManagementView'
import AuditLogView from './components/AuditLogView'
import UserManagementView from './components/UserManagementView'
import BackupPanel from './components/BackupPanel'
import TournamentManager from './components/TournamentManager'
import sponsorLogo from '../../../pictures/BG.png'
import fitnessLogo from '../../../pictures/red.png'
import './App.css'
import './audio/audioEngine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Tab = 'SCORE' | 'ROSTER' | 'BRANDING' | 'HISTORY' | 'SEASON' | 'LEADERS' | 'AUDIT' | 'SETTINGS' | 'TOURNAMENT'
type AppScreen = 'sport-selector' | 'liga-picker' | 'liga-manage' | 'matchup-picker' | 'control-panel'

interface LigaSummary { id: string; name: string; year: number; teamCount: number }

/** A pending sync conflict waiting for operator resolution. */
interface SyncConflictItem {
  conflictId: string
  local: SyncRecord
  remote: SyncRecord
}

// Helper: Build playerStats map from current GameState for game log record
function buildPlayerStats(gs: import('@shared/types').GameState): Record<string, import('@shared/types').PlayerStats> {
  const stats: Record<string, import('@shared/types').PlayerStats> = {}
  for (const team of ['home', 'away'] as const) {
    for (const p of gs[team].players) {
      stats[p.id] = {
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        steals: p.steals,
        blocks: p.blocks,
        fga: p.fga,
        fgm: p.fgm,
        fouls: p.fouls,
        active: p.active,
        jerseyNumber: p.number || null,
        photoPath: p.photoPath ?? null,
        minutesPlayed: p.minutesPlayed,
        substitutions: p.substitutions ?? [],
      }
    }
  }
  return stats
}

// ---------------------------------------------------------------------------
// APP WRAPPER (Login → Liga Picker → Matchup → Control Panel)
// ---------------------------------------------------------------------------
function App(): React.ReactElement {
  const session = useControlPanelStore(s => s.session)
  const setSession = useControlPanelStore(s => s.setSession)

  function handleLogin(user: { id: string; username: string; role: string }): void {
    setSession(user as UserSession)
  }

  async function handleLogout(): Promise<void> {
    await window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, { type: 'AUTH_LOGOUT' })
    setSession(null)
  }

  if (session === null) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return <AuthenticatedApp session={session} onLogout={handleLogout} />
}

// ---------------------------------------------------------------------------
// AUTHENTICATED APP (Liga Picker → Matchup → Control Panel)
// ---------------------------------------------------------------------------
function AuthenticatedApp({ session, onLogout }: { session: UserSession; onLogout: () => void }): React.ReactElement {
  const [screen, setScreen] = useState<AppScreen>('sport-selector')
  const [ligas, setLigas] = useState<LigaSummary[]>([])
  const [currentLiga, setCurrentLiga] = useState<Liga | null>(null)
  const [newLigaName, setNewLigaName] = useState('')
  const [teamA, setTeamA] = useState<string>('')
  const [teamB, setTeamB] = useState<string>('')
  const [matchError, setMatchError] = useState('')
  const [rosterTeam, setRosterTeam] = useState<LigaTeam | null>(null)
  const [showScheduleView, setShowScheduleView] = useState(false)
  const [showStaffView, setShowStaffView] = useState(false)
  const [savePrompt, setSavePrompt] = useState<{
    homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; ligaId: string | null
  } | null>(null)

  // Sync conflict queue (Requirement 30, Task 67)
  // Multiple conflicts can arrive before the first is resolved; queue them.
  const [syncConflicts, setSyncConflicts] = useState<SyncConflictItem[]>([])

  // Load ligas on mount
  useEffect(() => { refreshLigas() }, [])



  // Listen for SAVE_GAME_LOG_PROMPT event from main process (Requirement 18)
  // Also listens for SYNC_CONFLICT events (Requirement 30, Task 67)
  useEffect(() => {
    function handleEvent(raw: unknown): void {
      const event = raw as { type: string; [k: string]: unknown }
      if (event.type === 'SAVE_GAME_LOG_PROMPT') {
        setSavePrompt({
          homeTeam: event.homeTeam as string,
          awayTeam: event.awayTeam as string,
          homeScore: event.homeScore as number,
          awayScore: event.awayScore as number,
          ligaId: event.ligaId as string | null,
        })
      }
      // Sync conflict: queue so operator can resolve one at a time (Req 30.6)
      if (event.type === 'SYNC_CONFLICT') {
        const item: SyncConflictItem = {
          conflictId: event.conflictId as string,
          local: event.local as SyncRecord,
          remote: event.remote as SyncRecord,
        }
        setSyncConflicts(prev => [...prev, item])
      }
    }
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, handleEvent)
    return () => { /* cleanup handled by renderer lifecycle */ }
  }, [])

  async function handleSaveAndNewGame(): Promise<void> {
    if (!savePrompt) return
    const gs = useControlPanelStore.getState().gameState
    // Build game log record from current state
    const record: GameLogRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ligaId: gs.ligaId ?? '',
      date: new Date().toISOString(),
      homeTeam: gs.home.config.name,
      awayTeam: gs.away.config.name,
      finalScores: { home: gs.home.score, away: gs.away.score },
      playerStats: buildPlayerStats(gs),
      events: gs.events,
      periodSnapshots: gs.periodSnapshots ?? [],
    }
    if (gs.ligaId) {
      await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'GAME_LOG_SAVE',
        record,
      })
    }
    // Now confirm the new game
    await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'NEW_GAME_CONFIRMED',
      clearTeams: false,
    })
    setSavePrompt(null)
  }

  async function handleDiscardAndNewGame(): Promise<void> {
    await window.electron.ipcRenderer.invoke('scoreboard:query', {
      type: 'NEW_GAME_CONFIRMED',
      clearTeams: false,
    })
    setSavePrompt(null)
  }

  function handleCancelNewGame(): void {
    setSavePrompt(null)
  }

  // Sync conflict resolution: remove the resolved conflict from the queue (Req 30, Task 67)
  function handleSyncConflictResolved(conflictId: string, _choice: 'local' | 'remote'): void {
    setSyncConflicts(prev => prev.filter(c => c.conflictId !== conflictId))
  }

  function refreshLigas(): void {
    window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'LIGA_LIST' })
      .then((result: unknown) => setLigas(result as LigaSummary[]))
      .catch(() => {})
  }

  // ══════════════════════════════════════════
  // SCREEN: SPORT SELECTOR
  // ══════════════════════════════════════════
  if (screen === 'sport-selector') {
    return (
      <SportSelector onSelectSport={() => setScreen('liga-picker')} />
    )
  }

  // ══════════════════════════════════════════
  // SCREEN: LIGA PICKER
  // ══════════════════════════════════════════
  if (screen === 'liga-picker') {
    return (
      <div className="liga-picker">
        <div className="liga-picker__card">
          <div className="liga-picker__logo-img">
            <img src={fitnessLogo} alt="Fitness Exclusive" className="liga-picker__brand-img" />
          </div>
          <p className="liga-picker__sub">Basketball Scoreboard System</p>

          <div className="liga-picker__actions">
            {/* NEW LIGA */}
            <div className="liga-picker__new">
              <input className="liga-picker__inp" placeholder="Liga Name (e.g. MCBL 2026)" value={newLigaName} onChange={e => setNewLigaName(e.target.value)} />
              <button className="btn btn--green btn--lg" disabled={!newLigaName.trim()} onClick={async () => {
                const result = await window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'LIGA_CREATE', name: newLigaName.trim(), year: new Date().getFullYear() }) as any
                if (result?.success) {
                  setCurrentLiga(result.liga)
                  setNewLigaName('')
                  setScreen('liga-manage')
                  refreshLigas()
                }
              }}>+ NEW LIGA</button>
            </div>

            {/* LOAD LIGA */}
            {ligas.length > 0 && (
              <div className="liga-picker__list">
                <h3>Load Existing Liga</h3>
                {ligas.map(l => (
                  <button key={l.id} className="liga-picker__liga-btn" onClick={async () => {
                    const result = await window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'LIGA_LOAD', id: l.id }) as any
                    if (result?.success) {
                      setCurrentLiga(result.liga)
                      setScreen('matchup-picker')
                    } else {
                      alert(result?.error ?? 'Failed to load liga')
                    }
                  }}>
                    <span className="liga-picker__liga-name">{l.name} ({l.year})</span>
                    <span className="liga-picker__liga-teams">{l.teamCount} teams</span>
                  </button>
                ))}
              </div>
            )}

            {/* TRIAL MODE */}
            <button className="btn btn--dark btn--lg" onClick={() => {
              sendCommand({ type: 'NEW_GAME', clearTeams: false })
              setScreen('control-panel')
            }}>TRIAL MODE (Quick Game)</button>
            <p style={{ fontSize: '0.65rem', color: '#556', textAlign: 'center' }}>Trial mode: keeps teams, resets scores</p>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  // SCREEN: LIGA MANAGE (Add teams)
  // ══════════════════════════════════════════
  if (screen === 'liga-manage' && currentLiga) {
    // Staff Management full-screen view (Requirement 26)
    if (showStaffView) {
      return (
        <StaffManagementView
          ligaId={currentLiga.id}
          ligaName={currentLiga.name}
          onClose={() => setShowStaffView(false)}
        />
      )
    }

    // Schedule Management full-screen view (Requirement 24)
    if (showScheduleView) {
      return (
        <ScheduleManagementView
          ligaId={currentLiga.id}
          ligaName={currentLiga.name}
          teams={currentLiga.teams}
          onClose={() => setShowScheduleView(false)}
        />
      )
    }

    return (
      <div className="liga-manage">
        <div className="liga-manage__header">
          <h2>{currentLiga.name} ({currentLiga.year})</h2>
          <button className="btn btn--dark" onClick={() => setScreen('matchup-picker')}>→ Start Matchup</button>
          <button className="btn btn--dark" onClick={() => setShowScheduleView(true)}>📅 Schedule</button>
          <button className="btn btn--dark" onClick={() => setShowStaffView(true)}>👥 Staff</button>
          <button className="btn btn--dark" onClick={() => { setCurrentLiga(null); setScreen('liga-picker'); refreshLigas() }}>← Back</button>
        </div>

        <div className="liga-manage__teams">
          <h3>Registered Teams ({currentLiga.teams.length})</h3>
          {currentLiga.teams.map(t => (
            <div
              key={t.id}
              className="liga-manage__team-row liga-manage__team-row--clickable"
              onClick={() => setRosterTeam(t)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setRosterTeam(t)}
              aria-label={`Edit ${t.name} roster`}
            >
              <span className="liga-manage__team-name">{t.name}</span>
              <span className="liga-manage__team-players">
                {t.players.length > 0
                  ? `${t.players.length} player${t.players.length !== 1 ? 's' : ''}`
                  : '0 players'}
                <span className="liga-manage__team-arrow">›</span>
              </span>
            </div>
          ))}

          <div className="liga-manage__add">
            <input
              id="new-team-name"
              className="liga-picker__inp"
              placeholder="New Team Name"
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const nameEl = e.currentTarget
                  const name = nameEl.value.trim()
                  if (!name) return
                  const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
                    type: 'LIGA_ADD_TEAM',
                    ligaId: currentLiga.id,
                    team: { name, color: '#1D428A', logoPath: null, playerImagePath: null, players: [] }
                  }) as any
                  if (result?.success) {
                    const reload = await window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'LIGA_LOAD', id: currentLiga.id }) as any
                    if (reload?.success) setCurrentLiga(reload.liga)
                    nameEl.value = ''
                  }
                }
              }}
            />
            <button className="btn btn--green" onClick={async () => {
              const nameEl = document.getElementById('new-team-name') as HTMLInputElement
              const name = nameEl.value.trim()
              if (!name) return
              const result = await window.electron.ipcRenderer.invoke('scoreboard:query', {
                type: 'LIGA_ADD_TEAM',
                ligaId: currentLiga.id,
                team: { name, color: '#1D428A', logoPath: null, playerImagePath: null, players: [] }
              }) as any
              if (result?.success) {
                // Reload liga
                const reload = await window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'LIGA_LOAD', id: currentLiga.id }) as any
                if (reload?.success) setCurrentLiga(reload.liga)
                nameEl.value = ''
              }
            }}>+ Add Team</button>
          </div>
        </div>

        {/* Roster modal */}
        {rosterTeam && currentLiga && (
          <TeamRosterModal
            team={rosterTeam}
            ligaId={currentLiga.id}
            onClose={() => setRosterTeam(null)}
            onUpdated={async () => {
              const reload = await window.electron.ipcRenderer.invoke('scoreboard:query', {
                type: 'LIGA_LOAD', id: currentLiga.id
              }) as any
              if (reload?.success) {
                setCurrentLiga(reload.liga)
                // Keep rosterTeam in sync with fresh data
                const fresh = reload.liga.teams.find((t: LigaTeam) => t.id === rosterTeam.id)
                if (fresh) setRosterTeam(fresh)
              }
            }}
          />
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════
  // SCREEN: MATCHUP PICKER (Team A vs Team B)
  // ══════════════════════════════════════════
  if (screen === 'matchup-picker' && currentLiga) {
    const teams = currentLiga.teams
    return (
      <div className="matchup">
        <div className="matchup__card">
          <h2 className="matchup__title">{currentLiga.name}</h2>
          <p className="matchup__sub">Select today's matchup</p>

          <div className="matchup__pickers">
            <div className="matchup__pick">
              <label>Team A (Home)</label>
              <select className="matchup__select" value={teamA} onChange={e => { setTeamA(e.target.value); setMatchError('') }}>
                <option value="">— Select Team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="matchup__vs">VS</div>

            <div className="matchup__pick">
              <label>Team B (Away)</label>
              <select className="matchup__select" value={teamB} onChange={e => { setTeamB(e.target.value); setMatchError('') }}>
                <option value="">— Select Team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {matchError && <div className="matchup__error">{matchError}</div>}

          <button className="btn btn--green btn--lg matchup__start" onClick={() => {
            // Validation
            if (!teamA || !teamB) { setMatchError('Please select both teams'); return }
            if (teamA === teamB) { setMatchError('Team A and Team B cannot be the same team'); return }
            const tA = teams.find(t => t.id === teamA)!
            const tB = teams.find(t => t.id === teamB)!
            if (tA.players.length < 5) { setMatchError(`${tA.name} needs at least 5 players`); return }
            if (tB.players.length < 5) { setMatchError(`${tB.name} needs at least 5 players`); return }

            // Load teams into game state
            const makePlayers = (lp: typeof tA.players): Player[] =>
              lp.map((p, i) => ({
                id: p.id, number: p.number, name: p.name,
                fouls: 0, points: 0, rebounds: 0, assists: 0,
                steals: 0, blocks: 0, fga: 0, fgm: 0,
                minutesPlayed: 0, substitutions: [], photoPath: null,
                active: i < 5, fouledOut: false,
              }))

            sendCommand({
              type: 'LOAD_LIGA_TEAMS',
              home: {
                config: { name: tA.name, color: tA.color, logoPath: tA.logoPath, playerImagePath: tA.playerImagePath },
                players: makePlayers(tA.players),
              },
              away: {
                config: { name: tB.name, color: tB.color, logoPath: tB.logoPath, playerImagePath: tB.playerImagePath },
                players: makePlayers(tB.players),
              },
              ligaId: currentLiga.id,
              ligaName: currentLiga.name,
            })

            setScreen('control-panel')
          }}>🏀 START GAME</button>

          <div className="matchup__back-row">
            <button className="btn btn--dark" onClick={() => setScreen('liga-manage')}>⚙ Manage Teams</button>
            <button className="btn btn--dark" onClick={() => { setCurrentLiga(null); setScreen('liga-picker') }}>← Back</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <ControlPanel onBack={() => setScreen(currentLiga ? 'matchup-picker' : 'liga-picker')} ligaId={currentLiga?.id ?? null} />
      {/* Save Game Log Prompt (Requirement 18) */}
      {savePrompt && (
        <div className="sub-modal" role="dialog" aria-label="Save game log">
          <div className="sub-modal__content" style={{ maxWidth: 380 }}>
            <h3 style={{ color: '#e0a800', marginBottom: 12 }}>Save Game Log?</h3>
            <p style={{ color: '#dce8f5', fontSize: '0.85rem', marginBottom: 16 }}>
              {savePrompt.homeTeam} {savePrompt.homeScore} — {savePrompt.awayScore} {savePrompt.awayTeam}
            </p>
            <p style={{ color: '#7aaed4', fontSize: '0.78rem', marginBottom: 16 }}>
              Would you like to save this game log before starting a new game?
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn--green" onClick={handleSaveAndNewGame}>Save &amp; New Game</button>
              <button className="btn btn--dark" onClick={handleDiscardAndNewGame}>Discard</button>
              <button className="btn btn--red" onClick={handleCancelNewGame}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Conflict Resolution Dialog (Requirement 30, Task 67)
          Shows the first queued conflict; subsequent conflicts wait until this is resolved.
          While this dialog is open, the OfflineSyncService continues syncing non-conflicting records. */}
      {syncConflicts.length > 0 && (
        <SyncConflictDialog
          conflictId={syncConflicts[0].conflictId}
          local={syncConflicts[0].local}
          remote={syncConflicts[0].remote}
          onResolved={handleSyncConflictResolved}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// CONTROL PANEL
// ---------------------------------------------------------------------------
function ControlPanel({ onBack, ligaId }: { onBack: () => void; ligaId: string | null }): React.ReactElement {
  const [tab, setTab] = useState<Tab>('SCORE')
  const [showSubModal, setShowSubModal] = useState<'home' | 'away' | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<{ team: 'home' | 'away'; id: string } | null>(null)
  const [showBoxScore, setShowBoxScore] = useState(false)
  const [showUserManagement, setShowUserManagement] = useState(false)
  const [templateInput, setTemplateInput] = useState<'save' | 'load' | null>(null)
  const [templateName, setTemplateName] = useState('')
  const { editing: layoutEditing, setEditing: setLayoutEditing, resetLayout, saveTemplate, loadTemplate, getTemplateNames, currentTemplate } = useLayoutStore()
  const session = useControlPanelStore(s => s.session)

  // Swipe navigation
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const ALL_TABS: Tab[] = ['SCORE', 'ROSTER', 'BRANDING', 'HISTORY', 'SEASON', 'LEADERS', 'AUDIT', 'SETTINGS', 'TOURNAMENT']
  // AUDIT tab only visible to Admin/Scorekeeper (Requirement 31)
  const canViewAudit = session?.role === 'Admin' || session?.role === 'Scorekeeper'
  const TABS = canViewAudit ? ALL_TABS : ALL_TABS.filter(t => t !== 'AUDIT')

  function handleTouchStart(e: React.TouchEvent): void {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function handleTouchEnd(e: React.TouchEvent): void {
    if (!touchStartRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
      const idx = TABS.indexOf(tab)
      if (dx < 0 && idx < TABS.length - 1) setTab(TABS[idx + 1]) // swipe left → next
      if (dx > 0 && idx > 0) setTab(TABS[idx - 1])               // swipe right → prev
    }
  }

  const gs = useControlPanelStore(s => s.gameState)
  const { home, away, gameClock, shotClock, period, gameConfig } = gs
  const clockStr = formatClockDisplay(gameClock.displayMs)
  const shotSec = Math.ceil(shotClock.displayMs / 1000)

  return (
    <div className="cp" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* ── TAB BAR ── */}
      <div className="cp-tabs">
        {TABS.map(t => (
          <button key={t} className={`cp-tabs__btn${tab === t ? ' cp-tabs__btn--active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
        <button className={`cp-tabs__btn cp-tabs__btn--right${layoutEditing ? ' cp-tabs__btn--active' : ''}`} onClick={() => setLayoutEditing(!layoutEditing)}>
          {layoutEditing ? '🔓 Lock' : '✏️ Edit'}
        </button>
        {layoutEditing && <button className="cp-tabs__btn cp-tabs__btn--right" style={{ color: '#f88' }} onClick={resetLayout}>↺ Reset</button>}
        {layoutEditing && currentTemplate && <button className="cp-tabs__btn cp-tabs__btn--right" style={{ color: '#8f8' }} onClick={() => saveTemplate(currentTemplate)}>💾 Save</button>}
        {layoutEditing && <button className="cp-tabs__btn cp-tabs__btn--right" style={{ color: '#adf' }} onClick={() => { setTemplateName(''); setTemplateInput('save') }}>💾 Save As</button>}
        {layoutEditing && <button className="cp-tabs__btn cp-tabs__btn--right" style={{ color: '#8cf' }} onClick={() => { setTemplateName(''); setTemplateInput('load') }}>📂 Load</button>}
        <button className="cp-tabs__btn cp-tabs__btn--right" onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}>📺 TV</button>
        <button className="cp-tabs__btn cp-tabs__btn--right" onClick={onBack}>← Liga</button>
      </div>

      {/* ── SCORE TAB — per-button editable ── */}
      {tab === 'SCORE' && (
        <ScoreTab selectedPlayer={selectedPlayer} setSelectedPlayer={setSelectedPlayer} setShowSubModal={setShowSubModal} currentTab={tab} onTabChange={setTab} />
      )}

      {/* ── ROSTER TAB ── */}
      {tab === 'ROSTER' && (
        <div className="roster-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {(['home', 'away'] as const).map(team => {
            const t = gs[team]
            return (
              <div key={team} className="roster-tab__team">
                <h3>{t.config.name} Roster</h3>
                <div className="roster-tab__list">
                  {t.players.map(p => (
                    <div key={p.id} className={`roster-row${p.fouledOut ? ' roster-row--out' : ''}`}>
                      <input className="roster-row__num" defaultValue={p.number}
                        onBlur={e => sendCommand({ type: 'UPDATE_PLAYER_NUMBER', team, playerId: p.id, number: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                      <input className="roster-row__name" defaultValue={p.name}
                        onBlur={e => sendCommand({ type: 'UPDATE_PLAYER_NAME', team, playerId: p.id, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                      <span className="roster-row__stats">F:{p.fouls} P:{p.points}</span>
                      <button className="btn btn--xs btn--dark" onClick={() => sendCommand({ type: 'TOGGLE_PLAYER_ACTIVE', team, playerId: p.id })}>{p.active ? '🟢' : '⚪'}</button>
                      <button className="btn btn--xs btn--red" onClick={() => sendCommand({ type: 'REMOVE_PLAYER', team, playerId: p.id })}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn--dark btn--lg" onClick={() => {
                  const pl: Player = { id: `${team}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, number: String(t.players.length + 1), name: 'NEW PLAYER', fouls: 0, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fga: 0, fgm: 0, minutesPlayed: 0, substitutions: [], photoPath: null, active: t.players.filter(x => x.active).length < 5, fouledOut: false }
                  sendCommand({ type: 'ADD_PLAYER', team, player: pl })
                }}>+ Add Player</button>
              </div>
            )
          })}

          {/* Advanced Metrics Panel (Req 21) */}
          <AdvancedMetricsPanel />
        </div>
      )}

      {/* ── BRANDING TAB ── */}
      {tab === 'BRANDING' && (        <div className="brand-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {(['home', 'away'] as const).map(team => (
            <div key={team} className="brand-tab__team">
              <h3>{team === 'home' ? 'Home' : 'Away'} Team</h3>
              <label>Name: <input defaultValue={gs[team].config.name} onBlur={e => sendCommand({ type: 'SET_TEAM_CONFIG', team, config: { name: e.target.value } })} /></label>
              <label>Color: <input type="color" defaultValue={gs[team].config.color} onChange={e => sendCommand({ type: 'SET_TEAM_CONFIG', team, config: { color: e.target.value } })} /></label>
              <label>Logo: <input type="file" accept="image/*" onChange={e => {
                const f = e.target.files?.[0]
                if (f) sendCommand({ type: 'SET_TEAM_CONFIG', team, config: { logoPath: (f as any).path ?? f.name } })
              }} /></label>
              <label>Player Image (PNG): <input type="file" accept=".png" onChange={e => {
                const f = e.target.files?.[0]
                if (f) sendCommand({ type: 'SET_TEAM_CONFIG', team, config: { playerImagePath: (f as any).path ?? f.name } })
              }} /></label>
            </div>
          ))}
          {/* Sponsor Logos Section */}
          <div className="brand-tab__sponsors">
            <h3>Sponsor / Partner Logos (up to 5)</h3>
            <p style={{ fontSize: '0.65rem', color: '#888', marginBottom: '8px' }}>Upload sponsor images — they appear on the TV Display.</p>
            {[0, 1, 2, 3, 4].map(i => (
              <label key={i} className="brand-tab__sponsor-row">
                Sponsor {i + 1}: <input type="file" accept="image/*" onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    const path = (f as any).path ?? f.name
                    const current = [...(gs.sponsorLogos || [])]
                    current[i] = path
                    sendCommand({ type: 'SET_SPONSOR_LOGOS', logos: current.filter(Boolean) })
                  }
                }} />
                {(gs.sponsorLogos || [])[i] && <span style={{ fontSize: '0.55rem', color: '#4a4' }}>✓ loaded</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── HISTORY TAB (Game History — Req 18) ── */}
      {tab === 'HISTORY' && (
        <div className="history-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <GameHistoryView />
        </div>
      )}

      {/* ── SEASON TAB (Season Stats — Req 19) ── */}
      {tab === 'SEASON' && (
        <div className="season-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <SeasonStatsView />
        </div>
      )}

      {/* ── LEADERS TAB (Leaderboards — Req 20) ── */}
      {tab === 'LEADERS' && (
        <div className="leaders-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <LeaderboardsView />
        </div>
      )}

      {/* ── AUDIT TAB (Audit Log — Req 31) ── */}
      {tab === 'AUDIT' && (
        <div className="audit-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <AuditLogView />
        </div>
      )}

      {/* ── TOURNAMENT TAB ── */}
      {tab === 'TOURNAMENT' && (
        <div className="tournament-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {ligaId
            ? <TournamentManager ligaId={ligaId} />
            : <p style={{ color: '#888', padding: '24px', textAlign: 'center' }}>Load a Liga to manage tournaments.</p>
          }
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === 'SETTINGS' && (
        <div className="settings-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {/* User Management — Admin only (Req 28, Task 60) */}
          {useControlPanelStore.getState().session?.role === 'Admin' && (
            <>
              <h3>Admin</h3>
              <button className="btn btn--dark" onClick={() => setShowUserManagement(true)}>👥 User Management</button>

              {/* Backup & Restore — Admin only (Req 29, Task 65) */}
              <h3>Backup &amp; Restore</h3>
              <BackupPanel />
            </>
          )}
          <h3>Volume</h3>
          <input type="range" min="0" max="100" defaultValue={Math.round(gs.volume * 100)} onChange={e => sendCommand({ type: 'SET_VOLUME', level: parseInt(e.target.value) / 100 })} />
          <h3>Player Name Size</h3>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <input type="range" min="6" max="20" defaultValue={parseInt(localStorage.getItem('player-name-size') || '10')} onChange={e => {
              const val = e.target.value
              localStorage.setItem('player-name-size', val)
              document.documentElement.style.setProperty('--player-name-cqh', `${val}cqh`)
            }} />
            <span style={{color:'#aaa',fontSize:'0.75rem'}}>{localStorage.getItem('player-name-size') || '10'} (drag to resize)</span>
          </div>


          <h3>Presets</h3>
          <button className="btn btn--dark" onClick={() => sendCommand({ type: 'LOAD_PRESET', preset: { periodDurationMinutes: 12, periodCount: 4, overtimeDurationMinutes: 5, shotClockDurationSeconds: 24, bonusThreshold: 5, foulOutLimit: 6, fullTimeoutsPerTeam: 7, twentySecTimeoutsPerTeam: 1, timeoutDurationSeconds: 60 } })}>NBA Rules</button>
          <button className="btn btn--dark" onClick={() => sendCommand({ type: 'LOAD_PRESET', preset: { periodDurationMinutes: 10, periodCount: 4, overtimeDurationMinutes: 5, shotClockDurationSeconds: 24, bonusThreshold: 4, foulOutLimit: 5, fullTimeoutsPerTeam: 5, twentySecTimeoutsPerTeam: 0, timeoutDurationSeconds: 60 } })}>FIBA Rules</button>
          <h3>Display</h3>
          <button className="btn btn--dark" onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}>Open TV Display</button>
          <h3>Game Event Log ({gs.events.length} events)</h3>
          <div className="settings-tab__log">
            {gs.events.slice(-20).reverse().map(ev => (
              <div key={ev.id} className="log-entry"><small>{ev.timestamp.slice(11, 19)}</small> {ev.description}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── TEMPLATE MODAL ── */}
      {templateInput && (
        <div className="sub-modal" onClick={e => e.target === e.currentTarget && setTemplateInput(null)}>
          <div className="sub-modal__content" style={{ maxWidth: 320 }}>
            <h3 style={{ color: '#e0a800', marginBottom: 12 }}>
              {templateInput === 'save' ? '💾 Save Layout Template' : '📂 Load Layout Template'}
            </h3>
            {templateInput === 'save' && (
              <>
                <input
                  className="liga-picker__inp"
                  placeholder="Template name (e.g. Game1)"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && templateName.trim()) {
                      saveTemplate(templateName.trim())
                      setTemplateInput(null)
                    }
                  }}
                  autoFocus
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn--green" disabled={!templateName.trim()} onClick={() => { saveTemplate(templateName.trim()); setTemplateInput(null) }}>Save</button>
                  <button className="btn btn--dark" onClick={() => setTemplateInput(null)}>Cancel</button>
                </div>
              </>
            )}
            {templateInput === 'load' && (
              <>
                {getTemplateNames().length === 0
                  ? <p style={{ color: '#888', fontSize: '0.8rem' }}>No saved templates yet.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {getTemplateNames().map(name => (
                        <button key={name} className="btn btn--dark" style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                          onClick={() => { loadTemplate(name); setTemplateInput(null) }}>
                          📐 {name}
                        </button>
                      ))}
                    </div>
                }
                <button className="btn btn--dark" style={{ marginTop: 12 }} onClick={() => setTemplateInput(null)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SUBSTITUTION MODAL ── */}
      {showSubModal && (
        <div className="sub-modal">
          <div className="sub-modal__content">
            <h3>Substitution — {gs[showSubModal].config.name}</h3>
            <div className="sub-modal__lists">
              <div>
                <h4>On Court</h4>
                {gs[showSubModal].players.filter(p => p.active).map(p => (
                  <button key={p.id} className="btn btn--sub-player btn--green" onClick={() => { sendCommand({ type: 'TOGGLE_PLAYER_ACTIVE', team: showSubModal, playerId: p.id }); }}>
                    #{p.number} {p.name} ➡ BENCH
                  </button>
                ))}
              </div>
              <div>
                <h4>Bench</h4>
                {gs[showSubModal].players.filter(p => !p.active && !p.fouledOut).map(p => (
                  <button key={p.id} className="btn btn--sub-player btn--dark" onClick={() => { sendCommand({ type: 'TOGGLE_PLAYER_ACTIVE', team: showSubModal, playerId: p.id }); }}>
                    #{p.number} {p.name} ➡ COURT
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn--red btn--lg sub-modal__close" onClick={() => setShowSubModal(null)}>CLOSE</button>
          </div>
        </div>
      )}



      {/* ── BOX SCORE MODAL — shown when gamePhase is post-game (Req 17) ── */}
      {showBoxScore && (
        <div
          className="box-score-modal"
          role="dialog"
          aria-label="Box Score"
          aria-modal="true"
        >
          <div className="box-score-modal__content">
            <button
              className="box-score-modal__close"
              onClick={() => setShowBoxScore(false)}
              aria-label="Close box score"
            >
              ✕ Close Box Score
            </button>
            <BoxScoreView />
          </div>
        </div>
      )}

      {/* ── USER MANAGEMENT — Admin only (Req 28, Task 60) ── */}
      {showUserManagement && (
        <div
          className="box-score-modal"
          role="dialog"
          aria-label="User Management"
          aria-modal="true"
        >
          <div className="box-score-modal__content">
            <UserManagementView onClose={() => setShowUserManagement(false)} />
          </div>
        </div>
      )}

    </div>
  )
}

export default App
