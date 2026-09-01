import React, { useState } from 'react'
import { EditableWidget } from './EditableWidget'
import { useLayoutStore } from './useLayoutStore'
import { useControlPanelStore, sendCommand } from '../store'
import { formatClockDisplay } from '@renderer/shared/clockUtils'
import sponsorRedLogo from '../../../../pictures/white.png'

interface ScoreTabProps {
  selectedPlayer: { team: 'home' | 'away'; id: string } | null
  setSelectedPlayer: (p: { team: 'home' | 'away'; id: string } | null) => void
  setShowSubModal: (t: 'home' | 'away' | null) => void
  currentTab: Tab
  onTabChange: (tab: Tab) => void
}

type Tab = 'SCORE' | 'ROSTER' | 'BRANDING' | 'HISTORY' | 'SEASON' | 'LEADERS' | 'SETTINGS'

export function ScoreTab({ selectedPlayer, setSelectedPlayer, setShowSubModal, currentTab, onTabChange }: ScoreTabProps): React.ReactElement {
  const { layouts, editing, updateWidget } = useLayoutStore()
  const gs = useControlPanelStore(s => s.gameState)
  const { home, away, gameClock, shotClock, period } = gs
  const clockStr = formatClockDisplay(gameClock.displayMs)
  const shotSec = shotClock.displayMs > 0 ? Math.ceil(shotClock.displayMs / 1000) : shotClock.configuredDurationSeconds
  const [homePlayerPage, setHomePlayerPage] = useState(0)
  const [awayPlayerPage, setAwayPlayerPage] = useState(0)
  const PLAYERS_PER_PAGE = 5
  const TABS: Tab[] = ['SCORE', 'ROSTER', 'BRANDING', 'HISTORY', 'SEASON', 'LEADERS', 'SETTINGS']

  return (
    <div className={`score-tab${editing ? ' score-tab--editing' : ''}`}>
      {/* Score displays */}
      <EditableWidget id="home-label" rect={layouts['home-label']} editing={editing} onUpdate={updateWidget} label="Home">
        <span className="console-score__label">{home.config.name}:</span>
      </EditableWidget>
      <EditableWidget id="home-score" rect={layouts['home-score']} editing={editing} onUpdate={updateWidget} label="Score">
        <div className="console-score__value-wrap">
          {home.config.logoPath && <img className="console-score__logo" src={`local-file:///${home.config.logoPath.replace(/\\/g, '/')}`} alt="" />}
          <span className="console-score__value">{home.score}</span>
        </div>
      </EditableWidget>

      {/* Sponsor banner */}
      <EditableWidget id="sponsor-banner" rect={layouts['sponsor-banner']} editing={editing} onUpdate={updateWidget} label="Sponsor">
        <div className="sponsor-banner">
          <img src={sponsorRedLogo} alt="Fitness Exclusive" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}} />
        </div>
      </EditableWidget>

      <EditableWidget id="away-label" rect={layouts['away-label']} editing={editing} onUpdate={updateWidget} label="Away">
        <span className="console-score__label">{away.config.name}:</span>
      </EditableWidget>
      <EditableWidget id="away-score" rect={layouts['away-score']} editing={editing} onUpdate={updateWidget} label="Score">
        <div className="console-score__value-wrap">
          {away.config.logoPath && <img className="console-score__logo" src={`local-file:///${away.config.logoPath.replace(/\\/g, '/')}`} alt="" />}
          <span className="console-score__value">{away.score}</span>
        </div>
      </EditableWidget>

      {/* Score buttons */}
      <EditableWidget id="home-plus3" rect={layouts['home-plus3']} editing={editing} onUpdate={updateWidget} label="+3"><button className="btn btn--g btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 3 })}>+3</button></EditableWidget>
      <EditableWidget id="home-plus2" rect={layouts['home-plus2']} editing={editing} onUpdate={updateWidget} label="+2"><button className="btn btn--g btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 2 })}>+2</button></EditableWidget>
      <EditableWidget id="home-plus1" rect={layouts['home-plus1']} editing={editing} onUpdate={updateWidget} label="+1"><button className="btn btn--a btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: selectedPlayer.id, points: 1 })}>+1</button></EditableWidget>
      <EditableWidget id="away-plus1" rect={layouts['away-plus1']} editing={editing} onUpdate={updateWidget} label="+1"><button className="btn btn--a btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 1 })}>+1</button></EditableWidget>
      <EditableWidget id="away-plus2" rect={layouts['away-plus2']} editing={editing} onUpdate={updateWidget} label="+2"><button className="btn btn--g btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 2 })}>+2</button></EditableWidget>
      <EditableWidget id="away-plus3" rect={layouts['away-plus3']} editing={editing} onUpdate={updateWidget} label="+3"><button className="btn btn--g btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: selectedPlayer.id, points: 3 })}>+3</button></EditableWidget>

      {/* Info displays */}
      <EditableWidget id="shot-clock" rect={layouts['shot-clock']} editing={editing} onUpdate={updateWidget} label="Shot"><div className="mini-block" style={{height:'100%',justifyContent:'center'}}><span className="mini-block__lbl">Shot</span><div className="led-box"><span className="led-val">{shotSec}</span></div></div></EditableWidget>
      <EditableWidget id="period" rect={layouts['period']} editing={editing} onUpdate={updateWidget} label="Period"><div className="mini-block" style={{height:'100%',justifyContent:'center'}}><span className="mini-block__lbl">Period</span><div className="led-box"><span className="led-val led-val--big">{period.isOvertime ? `OT${period.overtimeNumber}` : period.current}</span></div></div></EditableWidget>
      <EditableWidget id="bonus-h" rect={layouts['bonus-h']} editing={editing} onUpdate={updateWidget} label="Bonus H">
        <div className="bonus-display" style={{height:'100%',width:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'4px'}}>
          <div className="bonus-display__dots">
            {home.fouls >= 5 && <div className="bonus-display__dot" />}
            {home.fouls >= 10 && <div className="bonus-display__dot" />}
          </div>
          {home.fouls >= 5 && <div className="bonus-display__text">{home.fouls >= 10 ? 'DOUBLE BONUS' : 'BONUS'}</div>}
        </div>
      </EditableWidget>
      <EditableWidget id="bonus-h-foul" rect={layouts['bonus-h-foul']} editing={editing} onUpdate={updateWidget} label="Team Foul H">
        <div className="foul-display" style={{height:'100%',width:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
          <div className="foul-display__label">Team Foul</div>
          <div className="foul-display__num">{home.fouls}</div>
        </div>
      </EditableWidget>

      <EditableWidget id="bonus-a" rect={layouts['bonus-a']} editing={editing} onUpdate={updateWidget} label="Bonus A">
        <div className="bonus-display" style={{height:'100%',width:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'4px'}}>
          <div className="bonus-display__dots">
            {away.fouls >= 5 && <div className="bonus-display__dot" />}
            {away.fouls >= 10 && <div className="bonus-display__dot" />}
          </div>
          {away.fouls >= 5 && <div className="bonus-display__text">{away.fouls >= 10 ? 'DOUBLE BONUS' : 'BONUS'}</div>}
        </div>
      </EditableWidget>
      <EditableWidget id="bonus-a-foul" rect={layouts['bonus-a-foul']} editing={editing} onUpdate={updateWidget} label="Team Foul A">
        <div className="foul-display" style={{height:'100%',width:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
          <div className="foul-display__label">Team Foul</div>
          <div className="foul-display__num">{away.fouls}</div>
        </div>
      </EditableWidget>

      {/* Info buttons */}

      <EditableWidget id="shot-reset" rect={layouts['shot-reset']} editing={editing} onUpdate={updateWidget} label="Shot Reset"><button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'RESET_SHOT_CLOCK' })}>↺ Shot</button></EditableWidget>
      <EditableWidget id="next-q" rect={layouts['next-q']} editing={editing} onUpdate={updateWidget} label="Next Q"><button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'ADVANCE_PERIOD' })}>NEXT Q</button></EditableWidget>
      <EditableWidget id="bonus-h-plus" rect={layouts['bonus-h-plus']} editing={editing} onUpdate={updateWidget} label="Foul H +"><button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'ADD_FOUL', team: 'home' })}>+Foul H</button></EditableWidget>
      <EditableWidget id="bonus-h-minus" rect={layouts['bonus-h-minus']} editing={editing} onUpdate={updateWidget} label="Foul H -"><button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'SUBTRACT_FOUL', team: 'home' })}>-Foul H</button></EditableWidget>
      <EditableWidget id="bonus-a-plus" rect={layouts['bonus-a-plus']} editing={editing} onUpdate={updateWidget} label="Foul A +"><button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'ADD_FOUL', team: 'away' })}>+Foul A</button></EditableWidget>
      <EditableWidget id="bonus-a-minus" rect={layouts['bonus-a-minus']} editing={editing} onUpdate={updateWidget} label="Foul A -"><button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'SUBTRACT_FOUL', team: 'away' })}>-Foul A</button></EditableWidget>

      {/* Clock */}
      <EditableWidget id="clock" rect={layouts['clock']} editing={editing} onUpdate={updateWidget} label="Clock"><div className="clock-panel clock-panel--clickable" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}} onClick={() => { if (gameClock.running) { sendCommand({ type: 'STOP_GAME_CLOCK' }); sendCommand({ type: 'STOP_SHOT_CLOCK' }) } else { sendCommand({ type: 'START_GAME_CLOCK' }); sendCommand({ type: 'START_SHOT_CLOCK' }) } }}><span className="clock-led">{clockStr}</span></div></EditableWidget>
      <EditableWidget id="btn-start" rect={layouts['btn-start']} editing={editing} onUpdate={updateWidget} label="Start/Pause"><button className={`btn btn--fill ${gameClock.running ? 'btn--pause' : 'btn--start'}`} onClick={() => { if (gameClock.running) { sendCommand({ type: 'STOP_GAME_CLOCK' }); sendCommand({ type: 'STOP_SHOT_CLOCK' }) } else { sendCommand({ type: 'START_GAME_CLOCK' }); sendCommand({ type: 'START_SHOT_CLOCK' }) } }}>{gameClock.running ? 'PAUSE' : 'START'}</button></EditableWidget>
      <EditableWidget id="btn-reset" rect={layouts['btn-reset']} editing={editing} onUpdate={updateWidget} label="Reset"><button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'RESET_GAME_CLOCK' })}>RESET</button></EditableWidget>
      <EditableWidget id="btn-switch" rect={layouts['btn-switch']} editing={editing} onUpdate={updateWidget} label="Switch"><button className="btn btn--sw btn--fill" onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}>SWITCH</button></EditableWidget>

      {/* Players */}
      <EditableWidget id="home-players" rect={layouts['home-players']} editing={editing} onUpdate={updateWidget} label="Home Players">
        <div className="side-col side-col--home" style={{height:'100%'}}>
          {(() => {
            const activePlayers = home.players.filter(p => p.active && !p.fouledOut)
            const totalPages = Math.max(1, Math.ceil(activePlayers.length / PLAYERS_PER_PAGE))
            const page = Math.min(homePlayerPage, totalPages - 1)
            const pagePlayers = activePlayers.slice(page * PLAYERS_PER_PAGE, (page + 1) * PLAYERS_PER_PAGE)
            return (
              <div className="side-col__players">
                {pagePlayers.map(p => (
                  <div key={p.id} className={`side-col__player${selectedPlayer?.id === p.id ? ' side-col__player--sel' : ''}`} onClick={() => setSelectedPlayer({team:'home',id:p.id})}>
                    <span className="side-col__player-num">{p.number}</span>
                    <span className="side-col__player-name">{p.name}</span>
                    <span className="side-col__player-pts">{p.points}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </EditableWidget>
      <EditableWidget id="away-players" rect={layouts['away-players']} editing={editing} onUpdate={updateWidget} label="Away Players">
        <div className="side-col side-col--away" style={{height:'100%'}}>
          {(() => {
            const activePlayers = away.players.filter(p => p.active && !p.fouledOut)
            const totalPages = Math.max(1, Math.ceil(activePlayers.length / PLAYERS_PER_PAGE))
            const page = Math.min(awayPlayerPage, totalPages - 1)
            const pagePlayers = activePlayers.slice(page * PLAYERS_PER_PAGE, (page + 1) * PLAYERS_PER_PAGE)
            return (
              <div className="side-col__players">
                {pagePlayers.map(p => (
                  <div key={p.id} className={`side-col__player${selectedPlayer?.id === p.id ? ' side-col__player--sel' : ''}`} onClick={() => setSelectedPlayer({team:'away',id:p.id})}>
                    <span className="side-col__player-num">{p.number}</span>
                    <span className="side-col__player-name">{p.name}</span>
                    <span className="side-col__player-pts">{p.points}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </EditableWidget>



      {/* Stats buttons - HOME */}
      <EditableWidget id="btn-reb" rect={layouts['btn-reb']} editing={editing} onUpdate={updateWidget} label="H REB"><button className="btn btn--stat-reb btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_REBOUND', team: 'home', playerId: selectedPlayer.id })}>+REB</button></EditableWidget>
      <EditableWidget id="btn-ast" rect={layouts['btn-ast']} editing={editing} onUpdate={updateWidget} label="H AST"><button className="btn btn--stat-ast btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_ASSIST', team: 'home', playerId: selectedPlayer.id })}>+AST</button></EditableWidget>
      <EditableWidget id="btn-foul" rect={layouts['btn-foul']} editing={editing} onUpdate={updateWidget} label="H FOUL"><button className="btn btn--foul btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'home', playerId: selectedPlayer.id })}>+FOUL</button></EditableWidget>
      <EditableWidget id="btn-stl" rect={layouts['btn-stl']} editing={editing} onUpdate={updateWidget} label="H STL"><button className="btn btn--stat-stl btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer!.id, stat: 'steals' })}>+STL</button></EditableWidget>
      <EditableWidget id="btn-blk" rect={layouts['btn-blk']} editing={editing} onUpdate={updateWidget} label="H BLK"><button className="btn btn--stat-blk btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_STAT', team: 'home', playerId: selectedPlayer!.id, stat: 'blocks' })}>+BLK</button></EditableWidget>
      <EditableWidget id="btn-to" rect={layouts['btn-to']} editing={editing} onUpdate={updateWidget} label="H TO"><button className="btn btn--stat-to btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'home'} onClick={() => sendCommand({ type: 'ADD_TURNOVER', team: 'home' })}>+TO</button></EditableWidget>

      {/* Stats buttons - AWAY */}
      <EditableWidget id="btn-reb-a" rect={layouts['btn-reb-a']} editing={editing} onUpdate={updateWidget} label="A REB"><button className="btn btn--stat-reb btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_REBOUND', team: 'away', playerId: selectedPlayer.id })}>+REB</button></EditableWidget>
      <EditableWidget id="btn-ast-a" rect={layouts['btn-ast-a']} editing={editing} onUpdate={updateWidget} label="A AST"><button className="btn btn--stat-ast btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_ASSIST', team: 'away', playerId: selectedPlayer.id })}>+AST</button></EditableWidget>
      <EditableWidget id="btn-foul-a" rect={layouts['btn-foul-a']} editing={editing} onUpdate={updateWidget} label="A FOUL"><button className="btn btn--foul btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'away', playerId: selectedPlayer.id })}>+FOUL</button></EditableWidget>
      <EditableWidget id="btn-stl-a" rect={layouts['btn-stl-a']} editing={editing} onUpdate={updateWidget} label="A STL"><button className="btn btn--stat-stl btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer!.id, stat: 'steals' })}>+STL</button></EditableWidget>
      <EditableWidget id="btn-blk-a" rect={layouts['btn-blk-a']} editing={editing} onUpdate={updateWidget} label="A BLK"><button className="btn btn--stat-blk btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => selectedPlayer && sendCommand({ type: 'ADD_PLAYER_STAT', team: 'away', playerId: selectedPlayer!.id, stat: 'blocks' })}>+BLK</button></EditableWidget>
      <EditableWidget id="btn-to-a" rect={layouts['btn-to-a']} editing={editing} onUpdate={updateWidget} label="A TO"><button className="btn btn--stat-to btn--fill" disabled={!selectedPlayer || selectedPlayer.team !== 'away'} onClick={() => sendCommand({ type: 'ADD_TURNOVER', team: 'away' })}>+TO</button></EditableWidget>
      <EditableWidget id="btn-sub" rect={layouts['btn-sub']} editing={editing} onUpdate={updateWidget} label="SUB"><button className="btn btn--sub btn--fill" onClick={() => setShowSubModal(selectedPlayer?.team ?? 'home')}>SUB</button></EditableWidget>
      <EditableWidget id="btn-undo" rect={layouts['btn-undo']} editing={editing} onUpdate={updateWidget} label="UNDO"><button className="btn btn--undo btn--fill" onClick={() => sendCommand({ type: 'UNDO' })}>UNDO SCORE</button></EditableWidget>

      {/* Possession & Timeouts */}
      <EditableWidget id="btn-poss-home" rect={layouts['btn-poss-home']} editing={editing} onUpdate={updateWidget} label="◀POSS"><button className={`btn btn--poss btn--fill${gs.possession === 'home' ? ' btn--sw' : ''}`} onClick={() => sendCommand({ type: 'SET_POSSESSION', team: 'home' })}>◀ POSS</button></EditableWidget>
      <EditableWidget id="btn-poss-away" rect={layouts['btn-poss-away']} editing={editing} onUpdate={updateWidget} label="POSS▶"><button className={`btn btn--poss btn--fill${gs.possession === 'away' ? ' btn--sw' : ''}`} onClick={() => sendCommand({ type: 'SET_POSSESSION', team: 'away' })}>POSS ▶</button></EditableWidget>
      <EditableWidget id="home-timeout" rect={layouts['home-timeout']} editing={editing} onUpdate={updateWidget} label="Home TO">
        <div className="timeout-widget">
          <div className="timeout-widget__header">TIMEOUT</div>
          <div className="timeout-widget__body">
            <div className="timeout-widget__dots">
              {Array.from({length: home.timeouts.fullRemaining}).map((_, i) => (
                <div key={i} className="timeout-widget__dot" />
              ))}
            </div>
            <span className="timeout-widget__count">{home.timeouts.fullRemaining}</span>
          </div>
          <div className="timeout-widget__phase">
            {period.isOvertime
              ? `OT: ${1 - (home.timeouts.overtimeUsed ?? 0)} left`
              : (period.current ?? 1) <= 2
                ? `1st Half: ${2 - (home.timeouts.firstHalfUsed ?? 0)}/2`
                : `2nd Half: ${3 - (home.timeouts.secondHalfUsed ?? 0)}/3`
            }
          </div>
          <button className="btn btn--dark btn--sm" style={{marginTop:2}} onClick={() => { sendCommand({ type: 'USE_TIMEOUT', team: 'home', kind: 'full' }); sendCommand({ type: 'START_TIMEOUT', team: 'home' }) }}>USE</button>
        </div>
      </EditableWidget>
      <EditableWidget id="away-timeout" rect={layouts['away-timeout']} editing={editing} onUpdate={updateWidget} label="Away TO">
        <div className="timeout-widget">
          <div className="timeout-widget__header">TIMEOUT</div>
          <div className="timeout-widget__body">
            <div className="timeout-widget__dots">
              {Array.from({length: away.timeouts.fullRemaining}).map((_, i) => (
                <div key={i} className="timeout-widget__dot" />
              ))}
            </div>
            <span className="timeout-widget__count">{away.timeouts.fullRemaining}</span>
          </div>
          <div className="timeout-widget__phase">
            {period.isOvertime
              ? `OT: ${1 - (away.timeouts.overtimeUsed ?? 0)} left`
              : (period.current ?? 1) <= 2
                ? `1st Half: ${2 - (away.timeouts.firstHalfUsed ?? 0)}/2`
                : `2nd Half: ${3 - (away.timeouts.secondHalfUsed ?? 0)}/3`
            }
          </div>
          <button className="btn btn--dark btn--sm" style={{marginTop:2}} onClick={() => { sendCommand({ type: 'USE_TIMEOUT', team: 'away', kind: 'full' }); sendCommand({ type: 'START_TIMEOUT', team: 'away' }) }}>USE</button>
        </div>
      </EditableWidget>

      {/* Footer */}
      <EditableWidget id="btn-horn" rect={layouts['btn-horn']} editing={editing} onUpdate={updateWidget} label="Buzzer">
        <button className="btn btn--horn btn--fill" onClick={() => { import('../audio/audioEngine').then(m => m.audioEngine.playEndOfPeriod()) }}>
          <svg viewBox="0 0 512 512" fill="currentColor" style={{width:'1.2em',height:'1.2em',marginRight:'4px'}}><path d="M160 288h-16c-35.3 0-64-28.7-64-64V128L0 64v384l80-64v-32c0-35.3 28.7-64 64-64h16zm256-64V96c88.4 0 160 71.6 160 160s-71.6 160-160 160V288zm32-64c53 0 96 43 96 96s-43 96-96 96V224zM256 64l-96 64v256l96 64V64z"/></svg> BUZZER
        </button>
      </EditableWidget>
      <EditableWidget id="btn-game-reset" rect={layouts['btn-game-reset']} editing={editing} onUpdate={updateWidget} label="Reset">
        <button className="btn btn--dark btn--fill" onClick={() => sendCommand({ type: 'NEW_GAME', clearTeams: false })}>RESET</button>
      </EditableWidget>
      <EditableWidget id="btn-replay" rect={layouts['btn-replay']} editing={editing} onUpdate={updateWidget} label="Replay">
        <button className="btn btn--replay btn--fill" onClick={() => window.electron.ipcRenderer.send('scoreboard:event', { type: 'REPLAY_TRIGGER' })}>REPLAY</button>
      </EditableWidget>

      {/* Tab Navigation — draggable/resizable */}
      <EditableWidget id="tab-nav" rect={layouts['tab-nav']} editing={editing} onUpdate={updateWidget} label="Tab Nav">
        <div className="cp-bottom-nav" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'flex-start',gap:'2px'}}>
          {TABS.map((t, i) => (
            <button key={t} className={`cp-bottom-nav__btn${currentTab === t ? ' cp-bottom-nav__btn--active' : ''}`} onClick={() => onTabChange(t)}>{i + 1}</button>
          ))}
        </div>
      </EditableWidget>
    </div>
  )
}
