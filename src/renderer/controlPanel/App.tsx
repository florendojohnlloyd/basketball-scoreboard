import React, { useState, useEffect } from 'react'
import { useControlPanelStore, sendCommand } from './store'
import { formatClockDisplay } from '../shared/clockUtils'
import type { Player, Liga, LigaTeam } from '@shared/types'
import { SportSelector } from './components/SportSelector'
import { TeamRosterModal } from './components/TeamRosterModal'
import TeamStatsPanel from './components/TeamStatsPanel'
import AdvancedMetricsPanel from './components/AdvancedMetricsPanel'
import GameHistoryView from './components/GameHistoryView'
import SeasonStatsView from './components/SeasonStatsView'
import LeaderboardsView from './components/LeaderboardsView'
import BoxScoreView from './components/BoxScoreView'
import './App.css'
import './audio/audioEngine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Tab = 'SCORE' | 'ROSTER' | 'BRANDING' | 'HISTORY' | 'SEASON' | 'LEADERS' | 'SETTINGS'
type AppScreen = 'sport-selector' | 'liga-picker' | 'liga-manage' | 'matchup-picker' | 'control-panel'

interface LigaSummary { id: string; name: string; year: number; teamCount: number }

// ---------------------------------------------------------------------------
// APP WRAPPER (Liga Picker → Matchup → Control Panel)
// ---------------------------------------------------------------------------
function App(): React.ReactElement {
  const [screen, setScreen] = useState<AppScreen>('sport-selector')
  const [ligas, setLigas] = useState<LigaSummary[]>([])
  const [currentLiga, setCurrentLiga] = useState<Liga | null>(null)
  const [newLigaName, setNewLigaName] = useState('')
  const [teamA, setTeamA] = useState<string>('')
  const [teamB, setTeamB] = useState<string>('')
  const [matchError, setMatchError] = useState('')
  const [rosterTeam, setRosterTeam] = useState<LigaTeam | null>(null)

  // Load ligas on mount
  useEffect(() => { refreshLigas() }, [])

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
          <div className="liga-picker__logo">🏀</div>
          <h1 className="liga-picker__title">LigaControl</h1>
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
            <button className="btn btn--dark btn--lg" onClick={() => setScreen('control-panel')}>TRIAL MODE (Quick Game)</button>
            <p style={{ fontSize: '0.65rem', color: '#556', textAlign: 'center' }}>Trial mode: no Liga needed, direct to scoreboard</p>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  // SCREEN: LIGA MANAGE (Add teams)
  // ══════════════════════════════════════════
  if (screen === 'liga-manage' && currentLiga) {
    return (
      <div className="liga-manage">
        <div className="liga-manage__header">
          <h2>{currentLiga.name} ({currentLiga.year})</h2>
          <button className="btn btn--dark" onClick={() => setScreen('matchup-picker')}>→ Start Matchup</button>
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

  return <ControlPanel onBack={() => setScreen(currentLiga ? 'matchup-picker' : 'liga-picker')} />
}

// ---------------------------------------------------------------------------
// CONTROL PANEL
// ---------------------------------------------------------------------------
function ControlPanel({ onBack }: { onBack: () => void }): React.ReactElement {
  const [tab, setTab] = useState<Tab>('SCORE')
  const [showSubModal, setShowSubModal] = useState<'home' | 'away' | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<{ team: 'home' | 'away'; id: string } | null>(null)
  const [showBoxScore, setShowBoxScore] = useState(false)

  // Swipe navigation
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const TABS: Tab[] = ['SCORE', 'ROSTER', 'BRANDING', 'HISTORY', 'SEASON', 'LEADERS', 'SETTINGS']

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
    <div className="cp">

      {/* ── TAB BAR ── */}
      <div className="cp-tabs">
        {TABS.map(t => (
          <button key={t} className={`cp-tabs__btn${tab === t ? ' cp-tabs__btn--active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
        <button className="cp-tabs__btn cp-tabs__btn--right" onClick={() => window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })}>📺 TV</button>
        <button className="cp-tabs__btn cp-tabs__btn--right" onClick={onBack}>← Liga</button>
      </div>

      {/* ── SCORE TAB — No scroll, 3-column: Players left/right vertical ── */}
      {tab === 'SCORE' && (
        <div className="score-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

          {/* LEFT: Home team */}
          <div className="side-col side-col--home">
            <div className="side-col__header">
              <span className="team-label">HOME</span>
            </div>
            <div className="side-col__score-row">
              <button className="btn btn--g btn--sm" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 3 })}>+3</button>
              <button className="btn btn--g btn--sm" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 2 })}>+2</button>
              <button className="btn btn--a btn--sm" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 1 })}>+1</button>
              <div className="led-box"><span className="led-val">{home.score}</span></div>
            </div>
            <div className="side-col__players">
              {home.players.filter(p => p.active && !p.fouledOut).slice(0, 5).map(p => (
                <div key={p.id} className={`side-col__player${selectedPlayer?.id === p.id ? ' side-col__player--sel' : ''}`} onClick={() => setSelectedPlayer({ team: 'home', id: p.id })}>
                  <span className="side-col__player-num">#{p.number}</span>
                  <span className="side-col__player-name">{p.name}</span>
                  <span className="side-col__player-pts">{p.points}</span>
                </div>
              ))}
            </div>
            <div className="side-col__timeout">
              <span className="to-label">TO:</span>
              <div className="led-box"><span className="led-val" style={{ fontSize: '1.8vh' }}>{home.timeouts.fullRemaining}</span></div>
              <button className="btn btn--dark btn--sm" onClick={() => { sendCommand({ type: 'USE_TIMEOUT', team: 'home', kind: 'full' }); sendCommand({ type: 'START_TIMEOUT', team: 'home' }) }}>USE</button>
            </div>
          </div>

          {/* CENTER */}
          <div className="center-col">
            {/* Clock */}
            <div className="center-col__clock-area">
              <div className="clock-panel"><span className="clock-led">{clockStr}</span></div>
              <div className="center-col__clock-btns">
                <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'START_GAME_CLOCK' })} disabled={gameClock.running}>Start</button>
                <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'STOP_GAME_CLOCK' })} disabled={!gameClock.running}>Pause</button>
                <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'RESET_GAME_CLOCK' })}>Reset</button>
              </div>
              <button className="btn btn--sw" onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}>⇄ SWITCH</button>
            </div>

            {/* Shot + Period */}
            <div className="center-col__mid">
              <div className="mini-block">
                <span className="mini-block__lbl">Shot</span>
                <div className="led-box"><span className="led-val">{shotSec}</span></div>
                <div className="mini-block__btns">
                  <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'START_SHOT_CLOCK' })}>▶</button>
                  <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'RESET_SHOT_CLOCK' })}>↺</button>
                </div>
              </div>
              <div className="mini-block">
                <span className="mini-block__lbl">Period</span>
                <div className="led-box"><span className="led-val led-val--big">{period.isOvertime ? `OT${period.overtimeNumber}` : period.current}</span></div>
                <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'ADVANCE_PERIOD' })}>NEXT Q</button>
              </div>
              <div className="mini-block">
                <span className="mini-block__lbl">Bonus H</span>
                <div className="led-box"><span className="led-val">{home.fouls}</span></div>
                <div className="mini-block__btns">
                  <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'ADD_FOUL', team: 'home' })}>+</button>
                  <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'SUBTRACT_FOUL', team: 'home' })}>-</button>
                </div>
              </div>
              <div className="mini-block">
                <span className="mini-block__lbl">Bonus A</span>
                <div className="led-box"><span className="led-val">{away.fouls}</span></div>
                <div className="mini-block__btns">
                  <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'ADD_FOUL', team: 'away' })}>+</button>
                  <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'SUBTRACT_FOUL', team: 'away' })}>-</button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="center-col__stats">
              <button className="btn btn--stat btn--sm" disabled={!selectedPlayer} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_REBOUND', team: selectedPlayer.team, playerId: selectedPlayer.id })}>+REB</button>
              <button className="btn btn--stat btn--sm" disabled={!selectedPlayer} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_ASSIST', team: selectedPlayer.team, playerId: selectedPlayer.id })}>+AST</button>
              <button className="btn btn--foul btn--sm" disabled={!selectedPlayer} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_FOUL', team: selectedPlayer.team, playerId: selectedPlayer.id })}>+FOUL</button>
              <button className="btn btn--stat btn--sm" disabled={!selectedPlayer}>+STL</button>
              <button className="btn btn--stat btn--sm" disabled={!selectedPlayer}>+BLK</button>
              <button className="btn btn--stat btn--sm" disabled={!selectedPlayer}>+TO</button>
              <button className="btn btn--sub btn--sm" onClick={() => setShowSubModal(selectedPlayer?.team ?? 'home')}>SUB</button>
              <button className="btn btn--undo btn--sm" onClick={() => sendCommand({ type: 'UNDO' })}>UNDO</button>
              <button className="btn btn--replay btn--sm" onClick={() => window.electron.ipcRenderer.send('scoreboard:event', { type: 'REPLAY_TRIGGER' })}>⏺</button>
            </div>

            {/* Possession */}
            <div className="center-col__timeout-row">
              <button className={`btn btn--dark btn--sm${gs.possession === 'home' ? ' btn--sw' : ''}`} onClick={() => sendCommand({ type: 'SET_POSSESSION', team: 'home' })}>◀ POSS</button>
              <button className={`btn btn--dark btn--sm${gs.possession === 'away' ? ' btn--sw' : ''}`} onClick={() => sendCommand({ type: 'SET_POSSESSION', team: 'away' })}>POSS ▶</button>
            </div>

            {/* Footer */}
            <div className="center-col__footer">
              <button className="btn btn--horn btn--sm" onClick={() => { import('./audio/audioEngine').then(m => m.audioEngine.playEndOfPeriod()) }}>🔔 Horn</button>
              <button className="btn btn--dark btn--sm" onClick={() => sendCommand({ type: 'NEW_GAME', clearTeams: false })}>RESET</button>
              <button className="btn btn--horn btn--sm" onClick={() => { import('./audio/audioEngine').then(m => m.audioEngine.playShotClockViolation()) }}>🔔 Sub</button>
              {gs.gamePhase === 'post-game' && (
                <button
                  className="btn btn--green btn--sm"
                  onClick={() => setShowBoxScore(true)}
                  aria-label="View box score"
                >
                  📋 Box Score
                </button>
              )}
            </div>

            {/* Team stats (Req 14) */}
            <div className="center-col__team-stats">
              <TeamStatsPanel team="home" />
              <TeamStatsPanel team="away" />
            </div>
          </div>

          {/* RIGHT: Away team */}
          <div className="side-col side-col--away">
            <div className="side-col__header">
              <span className="team-label">AWAY</span>
            </div>
            <div className="side-col__score-row">
              <div className="led-box"><span className="led-val">{away.score}</span></div>
              <button className="btn btn--g btn--sm" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 1 })}>+1</button>
              <button className="btn btn--g btn--sm" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 2 })}>+2</button>
              <button className="btn btn--a btn--sm" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 3 })}>+3</button>
            </div>
            <div className="side-col__players">
              {away.players.filter(p => p.active && !p.fouledOut).slice(0, 5).map(p => (
                <div key={p.id} className={`side-col__player${selectedPlayer?.id === p.id ? ' side-col__player--sel' : ''}`} onClick={() => setSelectedPlayer({ team: 'away', id: p.id })}>
                  <span className="side-col__player-num">#{p.number}</span>
                  <span className="side-col__player-name">{p.name}</span>
                  <span className="side-col__player-pts">{p.points}</span>
                </div>
              ))}
            </div>
            <div className="side-col__timeout">
              <span className="to-label">TO:</span>
              <div className="led-box"><span className="led-val" style={{ fontSize: '1.8vh' }}>{away.timeouts.fullRemaining}</span></div>
              <button className="btn btn--dark btn--sm" onClick={() => { sendCommand({ type: 'USE_TIMEOUT', team: 'away', kind: 'full' }); sendCommand({ type: 'START_TIMEOUT', team: 'away' }) }}>USE</button>
            </div>
          </div>

        </div>
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
                  const pl: Player = { id: `${team}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, number: String(t.players.length + 1), name: 'NEW PLAYER', fouls: 0, points: 0, rebounds: 0, assists: 0, active: t.players.filter(x => x.active).length < 5, fouledOut: false }
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

      {/* ── SETTINGS TAB ── */}
      {tab === 'SETTINGS' && (
        <div className="settings-tab" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <h3>Volume</h3>
          <input type="range" min="0" max="100" defaultValue={Math.round(gs.volume * 100)} onChange={e => sendCommand({ type: 'SET_VOLUME', level: parseInt(e.target.value) / 100 })} />
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

    </div>
  )
}

export default App
