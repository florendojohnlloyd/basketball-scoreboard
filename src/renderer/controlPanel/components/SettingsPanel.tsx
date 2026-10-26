import React, { useState } from 'react'
import { useControlPanelStore, sendCommand } from '../store'
import BackupPanel from './BackupPanel'
import CloudSyncPanel from './CloudSyncPanel'
import MobileViewerPanel from './MobileViewerPanel'
import ApiKeysPanel from './ApiKeysPanel'
import SocialSharePanel from './SocialSharePanel'
import LiveStreamingPanel from './LiveStreamingPanel'
import { RelayBuzzerSettings } from './RelayBuzzerSettings'
import './SettingsPanel.css'

const TABS = ['General', 'Design', 'Team/Player', 'Sound', 'Time', 'Display'] as const
type Tab = typeof TABS[number] | 'Backup' | 'Cloud Sync' | 'Live Streaming' | 'Mobile Viewer' | 'API Keys' | 'Social Sharing'

interface SettingsPanelProps {
  onClose: () => void
}

function SettingsPanel({ onClose }: SettingsPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('General')
  const gs = useControlPanelStore((s) => s.gameState)
  const session = useControlPanelStore((s) => s.session)
  const { gameConfig } = gs

  // Build tab list — include Backup tab only for Admin users
  const tabs: Tab[] = ['General', 'Design', 'Team/Player', 'Sound', 'Time', 'Display']
  if (session?.role === 'Admin') {
    tabs.push('Backup')
    tabs.push('Cloud Sync')
    tabs.push('Live Streaming')
    tabs.push('Mobile Viewer')
    tabs.push('API Keys')
  }
  // Social Sharing — available to Admin and Scorekeeper (SHARE capability, Req 35.1)
  if (session?.role === 'Admin' || session?.role === 'Scorekeeper') {
    tabs.push('Social Sharing')
  }

  return (
    <div className="settings">
      {/* Header */}
      <div className="settings__header">
        <span className="settings__title">Settings</span>
        <button className="settings__close" onClick={onClose}>✕ Close</button>
      </div>

      <div className="settings__body">
        {/* Sidebar */}
        <div className="settings__sidebar">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`settings__tab${activeTab === tab ? ' settings__tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings__content">

          {activeTab === 'General' && (
            <div className="settings__section">
              <fieldset className="settings__fieldset">
                <legend>Bonus</legend>
                <div className="settings__row">
                  <label>Bonus Indicator at</label>
                  <span className="settings__val">{gameConfig.bonusThreshold} Fouls</span>
                </div>
              </fieldset>

              <fieldset className="settings__fieldset">
                <legend>Foul</legend>
                <div className="settings__row">
                  <label>Maximum Player Foul</label>
                  <span className="settings__val">5</span>
                </div>
                <div className="settings__row">
                  <label>Maximum Team Foul</label>
                  <span className="settings__val">10</span>
                </div>
              </fieldset>

              <fieldset className="settings__fieldset">
                <legend>Reset</legend>
                <div className="settings__row">
                  <label>Team Foul:</label>
                  <span className="settings__val">quarter</span>
                </div>
                <div className="settings__row">
                  <label>Time-out:</label>
                  <span className="settings__val">quarter</span>
                </div>
              </fieldset>
            </div>
          )}

          {activeTab === 'Time' && (
            <div className="settings__section">
              <fieldset className="settings__fieldset">
                <legend>Game Clock</legend>
                <div className="settings__row">
                  <label>Period Duration (min)</label>
                  <span className="settings__val">{gameConfig.periodDurationMinutes}</span>
                </div>
                <div className="settings__row">
                  <label>Periods</label>
                  <span className="settings__val">{gameConfig.periodCount}</span>
                </div>
                <div className="settings__row">
                  <label>Overtime Duration (min)</label>
                  <span className="settings__val">{gameConfig.overtimeDurationMinutes}</span>
                </div>
              </fieldset>

              <fieldset className="settings__fieldset">
                <legend>Shot Clock</legend>
                <div className="settings__row">
                  <label>Duration (sec)</label>
                  <span className="settings__val">{gameConfig.shotClockDurationSeconds}</span>
                </div>
              </fieldset>

              <fieldset className="settings__fieldset">
                <legend>Timeouts</legend>
                <div className="settings__row">
                  <label>Full Timeouts per Team</label>
                  <span className="settings__val">{gameConfig.fullTimeoutsPerTeam}</span>
                </div>
                <div className="settings__row">
                  <label>20-sec Timeouts per Team</label>
                  <span className="settings__val">{gameConfig.twentySecTimeoutsPerTeam}</span>
                </div>
              </fieldset>
            </div>
          )}

          {activeTab === 'Team/Player' && (
            <div className="settings__section">
              <fieldset className="settings__fieldset">
                <legend>Home Team</legend>
                <div className="settings__row">
                  <label>Name</label>
                  <input className="settings__input" defaultValue={gs.home.config.name} onBlur={(e) => sendCommand({ type: 'SET_TEAM_CONFIG', team: 'home', config: { name: e.target.value } })} />
                </div>
                <div className="settings__row">
                  <label>Color</label>
                  <input className="settings__color" type="color" defaultValue={gs.home.config.color} onChange={(e) => sendCommand({ type: 'SET_TEAM_CONFIG', team: 'home', config: { color: e.target.value } })} />
                </div>
                <div className="settings__row">
                  <label>Logo</label>
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const path = (file as File & { path?: string }).path ?? file.name
                      sendCommand({ type: 'SET_TEAM_CONFIG', team: 'home', config: { logoPath: path } })
                    }
                  }} />
                </div>
                <div className="settings__row">
                  <label>Player Image (PNG)</label>
                  <input type="file" accept=".png" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const path = (file as File & { path?: string }).path ?? file.name
                      sendCommand({ type: 'SET_TEAM_CONFIG', team: 'home', config: { playerImagePath: path } })
                    }
                  }} />
                </div>
              </fieldset>

              {/* Home Players */}
              <div className="pl">
                <div className="pl__title">Home Players</div>
                <div className="pl__header">
                  <span className="pl__col pl__col--num">#</span>
                  <span className="pl__col pl__col--name">PLAYER</span>
                  <span className="pl__col pl__col--stat">PTS</span>
                  <span className="pl__col pl__col--stat">PF</span>
                  <span className="pl__col pl__col--actions"></span>
                </div>
                <div className="pl__list">
                  {gs.home.players.map((p, i) => (
                    <div key={p.id} className="pl__row">
                      <span className="pl__col pl__col--num">{i + 1}</span>
                      <span className="pl__col pl__col--name pl__name">{p.name || 'NEW PLAYER'}</span>
                      <span className="pl__col pl__col--stat pl__pts">{p.points}</span>
                      <span className="pl__col pl__col--stat pl__pf">{p.fouls}</span>
                      <span className="pl__col pl__col--actions">
                        <button className="pl__btn pl__btn--pts" onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: p.id, points: 1 })}>+1</button>
                        <button className="pl__btn pl__btn--pts" onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'home', playerId: p.id, points: 2 })}>+2</button>
                        <button className="pl__btn pl__btn--foul" onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'home', playerId: p.id })}>F+</button>
                        <button className="pl__btn pl__btn--remove" onClick={() => sendCommand({ type: 'REMOVE_PLAYER', team: 'home', playerId: p.id })}>✕</button>
                      </span>
                    </div>
                  ))}
                </div>
                <button className="pl__add-btn" onClick={() => {
                  const player: import('@shared/types').Player = { id: `home-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, number: String(gs.home.players.length + 1), name: 'NEW PLAYER', fouls: 0, points: 0, rebounds: 0, assists: 0, active: true, fouledOut: false, steals: 0, blocks: 0, fga: 0, fgm: 0, minutesPlayed: 0, substitutions: [], photoPath: null }
                  sendCommand({ type: 'ADD_PLAYER', team: 'home', player })
                }}>+ Add Player</button>
              </div>

              <fieldset className="settings__fieldset">
                <legend>Away Team</legend>
                <div className="settings__row">
                  <label>Name</label>
                  <input className="settings__input" defaultValue={gs.away.config.name} onBlur={(e) => sendCommand({ type: 'SET_TEAM_CONFIG', team: 'away', config: { name: e.target.value } })} />
                </div>
                <div className="settings__row">
                  <label>Color</label>
                  <input className="settings__color" type="color" defaultValue={gs.away.config.color} onChange={(e) => sendCommand({ type: 'SET_TEAM_CONFIG', team: 'away', config: { color: e.target.value } })} />
                </div>
                <div className="settings__row">
                  <label>Logo</label>
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const path = (file as File & { path?: string }).path ?? file.name
                      sendCommand({ type: 'SET_TEAM_CONFIG', team: 'away', config: { logoPath: path } })
                    }
                  }} />
                </div>
                <div className="settings__row">
                  <label>Player Image (PNG)</label>
                  <input type="file" accept=".png" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const path = (file as File & { path?: string }).path ?? file.name
                      sendCommand({ type: 'SET_TEAM_CONFIG', team: 'away', config: { playerImagePath: path } })
                    }
                  }} />
                </div>
              </fieldset>

              {/* Away Players */}
              <div className="pl">
                <div className="pl__title">Away Players</div>
                <div className="pl__header">
                  <span className="pl__col pl__col--num">#</span>
                  <span className="pl__col pl__col--name">PLAYER</span>
                  <span className="pl__col pl__col--stat">PTS</span>
                  <span className="pl__col pl__col--stat">PF</span>
                  <span className="pl__col pl__col--actions"></span>
                </div>
                <div className="pl__list">
                  {gs.away.players.map((p, i) => (
                    <div key={p.id} className="pl__row">
                      <span className="pl__col pl__col--num">{i + 1}</span>
                      <span className="pl__col pl__col--name pl__name">{p.name || 'NEW PLAYER'}</span>
                      <span className="pl__col pl__col--stat pl__pts">{p.points}</span>
                      <span className="pl__col pl__col--stat pl__pf">{p.fouls}</span>
                      <span className="pl__col pl__col--actions">
                        <button className="pl__btn pl__btn--pts" onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: p.id, points: 1 })}>+1</button>
                        <button className="pl__btn pl__btn--pts" onClick={() => sendCommand({ type: 'ADD_PLAYER_POINTS', team: 'away', playerId: p.id, points: 2 })}>+2</button>
                        <button className="pl__btn pl__btn--foul" onClick={() => sendCommand({ type: 'ADD_PLAYER_FOUL', team: 'away', playerId: p.id })}>F+</button>
                        <button className="pl__btn pl__btn--remove" onClick={() => sendCommand({ type: 'REMOVE_PLAYER', team: 'away', playerId: p.id })}>✕</button>
                      </span>
                    </div>
                  ))}
                </div>
                <button className="pl__add-btn" onClick={() => {
                  const player: import('@shared/types').Player = { id: `away-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, number: String(gs.away.players.length + 1), name: 'NEW PLAYER', fouls: 0, points: 0, rebounds: 0, assists: 0, active: true, fouledOut: false, steals: 0, blocks: 0, fga: 0, fgm: 0, minutesPlayed: 0, substitutions: [], photoPath: null }
                  sendCommand({ type: 'ADD_PLAYER', team: 'away', player })
                }}>+ Add Player</button>
              </div>
            </div>
          )}

          {activeTab === 'Sound' && (
            <div className="settings__section">
              <fieldset className="settings__fieldset">
                <legend>Volume</legend>
                <div className="settings__row">
                  <label>Master Volume</label>
                  <input type="range" min="0" max="100" defaultValue={Math.round(gs.volume * 100)} onChange={(e) => sendCommand({ type: 'SET_VOLUME', level: parseInt(e.target.value) / 100 })} />
                  <span className="settings__val">{Math.round(gs.volume * 100)}%</span>
                </div>
              </fieldset>
              <fieldset className="settings__fieldset">
                <legend>Test</legend>
                <div className="settings__row">
                  <button className="btn btn--ctrl" onClick={() => { import('../audio/audioEngine').then(m => m.audioEngine.playEndOfPeriod()) }}>Test Horn</button>
                  <button className="btn btn--ctrl" onClick={() => { import('../audio/audioEngine').then(m => m.audioEngine.playShotClockViolation()) }}>Test Shot Clock Buzzer</button>
                </div>
              </fieldset>
              <RelayBuzzerSettings />
            </div>
          )}

          {activeTab === 'Display' && (
            <div className="settings__section">
              <fieldset className="settings__fieldset">
                <legend>Monitor Assignment</legend>
                <div className="settings__row">
                  <label>Scoreboard display is shown on the assigned monitor.</label>
                </div>
                <div className="settings__row">
                  <button className="btn btn--ctrl" onClick={() => {
                    window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'GET_MONITORS' }).then((displays: unknown) => {
                      alert(JSON.stringify(displays, null, 2))
                    })
                  }}>Show Available Displays</button>
                </div>
              </fieldset>
              <fieldset className="settings__fieldset">
                <legend>Shot Clock</legend>
                <div className="settings__row">
                  <label>
                    <input type="checkbox" checked={gs.shotClock.enabled} onChange={(e) => sendCommand({ type: 'SET_SHOT_CLOCK_ENABLED', enabled: e.target.checked })} />
                    {' '}Show Shot Clock on Scoreboard
                  </label>
                </div>
              </fieldset>
              <fieldset className="settings__fieldset">
                <legend>Player Photos</legend>
                <div className="settings__row">
                  <label>
                    <input
                      type="checkbox"
                      checked={gs.showPhotosOnScoreboard}
                      onChange={(e) => sendCommand({ type: 'TOGGLE_SHOW_PHOTOS_ON_SCOREBOARD', enabled: e.target.checked })}
                    />
                    {' '}Show Player Photos on Scoreboard
                  </label>
                </div>
              </fieldset>
            </div>
          )}

          {activeTab === 'Design' && (
            <div className="settings__section">
              <fieldset className="settings__fieldset">
                <legend>Presets</legend>
                <div className="settings__row">
                  <button className="btn btn--ctrl" onClick={() => sendCommand({ type: 'LOAD_PRESET', preset: { periodDurationMinutes: 12, periodCount: 4, overtimeDurationMinutes: 5, shotClockDurationSeconds: 24, bonusThreshold: 5, fullTimeoutsPerTeam: 7, twentySecTimeoutsPerTeam: 1 } })}>NBA Rules</button>
                  <button className="btn btn--ctrl" onClick={() => sendCommand({ type: 'LOAD_PRESET', preset: { periodDurationMinutes: 10, periodCount: 4, overtimeDurationMinutes: 5, shotClockDurationSeconds: 24, bonusThreshold: 4, fullTimeoutsPerTeam: 5, twentySecTimeoutsPerTeam: 0 } })}>FIBA Rules</button>
                </div>
              </fieldset>
              <fieldset className="settings__fieldset">
                <legend>Reset</legend>
                <div className="settings__row">
                  <button className="btn btn--red-sq" style={{ width: 'auto', height: 'auto', padding: '0.4em 1.5em', fontSize: '0.8rem' }} onClick={() => sendCommand({ type: 'NEW_GAME', clearTeams: true })}>Reset to Factory Settings</button>
                </div>
              </fieldset>
            </div>
          )}

          {/* Backup tab — Admin only (Requirement 29, Task 65) */}
          {activeTab === 'Backup' && session?.role === 'Admin' && (
            <div className="settings__section">
              <BackupPanel />
            </div>
          )}

          {/* Cloud Sync tab — Admin only (Requirement 32, Task 69) */}
          {activeTab === 'Cloud Sync' && session?.role === 'Admin' && (
            <div className="settings__section">
              <CloudSyncPanel />
            </div>
          )}

          {/* Live Streaming tab — Admin only (Requirement 33, Task 72) */}
          {activeTab === 'Live Streaming' && session?.role === 'Admin' && (
            <div className="settings__section">
              <LiveStreamingPanel />
            </div>
          )}

          {/* Mobile Viewer tab — Admin only (Requirement 36, Task 78) */}
          {activeTab === 'Mobile Viewer' && session?.role === 'Admin' && (
            <div className="settings__section">
              <MobileViewerPanel />
            </div>
          )}

          {/* API Keys tab — Admin only (Requirement 34, Task 74) */}
          {activeTab === 'API Keys' && session?.role === 'Admin' && (
            <div className="settings__section">
              <ApiKeysPanel />
            </div>
          )}

          {/* Social Sharing tab — Admin + Scorekeeper (Requirement 35, Task 76) */}
          {activeTab === 'Social Sharing' &&
            (session?.role === 'Admin' || session?.role === 'Scorekeeper') && (
            <div className="settings__section">
              <SocialSharePanel />
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
