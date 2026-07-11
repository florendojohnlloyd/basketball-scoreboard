import React, { useState, useCallback } from 'react'
import { DraggableWidget, WidgetLayout } from './DraggableWidget'
import { useControlPanelStore, sendCommand } from '../store'
import { formatClockDisplay } from '@renderer/shared/clockUtils'
import './LayoutEditor.css'

// ---- Default layouts for control panel widgets ----
const DEFAULT_CONTROL_LAYOUTS: Record<string, WidgetLayout> = {
  'ctrl-homeScore': { id: 'ctrl-homeScore', x: 10,  y: 10,  w: 220, h: 55 },
  'ctrl-awayScore': { id: 'ctrl-awayScore', x: 530, y: 10,  w: 220, h: 55 },
  'ctrl-clock':     { id: 'ctrl-clock',     x: 260, y: 10,  w: 240, h: 45 },
  'ctrl-clockBtns': { id: 'ctrl-clockBtns', x: 260, y: 60,  w: 240, h: 38 },
  'ctrl-shotClock': { id: 'ctrl-shotClock', x: 260, y: 105, w: 120, h: 38 },
  'ctrl-period':    { id: 'ctrl-period',    x: 390, y: 105, w: 110, h: 38 },
  'ctrl-switch':    { id: 'ctrl-switch',    x: 260, y: 150, w: 240, h: 38 },
  'ctrl-horn':      { id: 'ctrl-horn',      x: 10,  y: 75,  w: 220, h: 45 },
  'ctrl-timeout':   { id: 'ctrl-timeout',   x: 530, y: 75,  w: 220, h: 45 },
  'ctrl-foulHome':  { id: 'ctrl-foulHome',  x: 10,  y: 130, w: 110, h: 38 },
  'ctrl-foulAway':  { id: 'ctrl-foulAway',  x: 640, y: 130, w: 110, h: 38 },
  'ctrl-undo':      { id: 'ctrl-undo',      x: 10,  y: 175, w: 90,  h: 35 },
  'ctrl-newGame':   { id: 'ctrl-newGame',   x: 660, y: 175, w: 90,  h: 35 },
}

const STORAGE_KEY = 'layout-editor-controls'

function loadLayouts(defaults: Record<string, WidgetLayout>): Record<string, WidgetLayout> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return { ...defaults, ...JSON.parse(saved) }
  } catch { /* ignore */ }
  return { ...defaults }
}

function saveLayouts(layouts: Record<string, WidgetLayout>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

interface LayoutEditorProps {
  onBack: () => void
}

export function LayoutEditor({ onBack }: LayoutEditorProps): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [ctrlLayouts, setCtrlLayouts] = useState(() => loadLayouts(DEFAULT_CONTROL_LAYOUTS))

  const gs = useControlPanelStore(s => s.gameState)
  const { home, away, gameClock, shotClock, period } = gs
  const clockStr = formatClockDisplay(gameClock.displayMs)
  const shotSec = Math.ceil(shotClock.displayMs / 1000)

  const handleControlChange = useCallback((id: string, partial: Partial<WidgetLayout>) => {
    setCtrlLayouts(prev => {
      const updated = { ...prev, [id]: { ...prev[id], ...partial } }
      saveLayouts(updated)
      return updated
    })
  }, [])

  function resetLayouts(): void {
    setCtrlLayouts({ ...DEFAULT_CONTROL_LAYOUTS })
    saveLayouts(DEFAULT_CONTROL_LAYOUTS)
  }

  return (
    <div className="le">
      {/* Toolbar */}
      <div className="le-toolbar">
        <button className="le-toolbar__btn" onClick={onBack}>← Back</button>
        <span className="le-toolbar__title">Layout Editor</span>
        <button
          className={`le-toolbar__btn ${editing ? 'le-toolbar__btn--active' : ''}`}
          onClick={() => setEditing(!editing)}
        >
          {editing ? '🔓 Lock Layout' : '✏️ Edit Layout'}
        </button>
        {editing && <button className="le-toolbar__btn le-toolbar__btn--warn" onClick={resetLayouts}>↺ Reset</button>}
      </div>

      {/* ═══ UPPER: STATIC TV DISPLAY (non-editable) ═══ */}
      <div className="le-display">
        <div className="le-display__bar">
          <span className="le-display__label">📺 TV DISPLAY (Preview Only)</span>
        </div>
        <div className="le-display__content">
          {/* Clock */}
          <div className="le-tv__clock">{clockStr}</div>
          <div className="le-tv__period">Q{period.isOvertime ? `OT${period.overtimeNumber}` : period.current}</div>

          {/* Scores */}
          <div className="le-tv__scores">
            <div className="le-tv__team le-tv__team--home">
              <span className="le-tv__team-name">{home.config.name}</span>
              <span className="le-tv__team-score">{home.score}</span>
            </div>
            <span className="le-tv__vs">:</span>
            <div className="le-tv__team le-tv__team--away">
              <span className="le-tv__team-score">{away.score}</span>
              <span className="le-tv__team-name">{away.config.name}</span>
            </div>
          </div>

          {/* Players */}
          <div className="le-tv__players">
            <div className="le-tv__player-list le-tv__player-list--home">
              {home.players.filter(p => p.active).slice(0, 5).map(p => (
                <div key={p.id} className="le-tv__player-row">
                  <span>{p.name}</span>
                  <span className="le-tv__pts">{p.points}</span>
                </div>
              ))}
            </div>
            <div className="le-tv__player-list le-tv__player-list--away">
              {away.players.filter(p => p.active).slice(0, 5).map(p => (
                <div key={p.id} className="le-tv__player-row">
                  <span>{p.name}</span>
                  <span className="le-tv__pts">{p.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ LOWER: EDITABLE CONTROL PANEL ═══ */}
      <div className="le-controls">
        <div className="le-controls__bar">
          <span className="le-controls__label">🎮 CONTROLS {editing ? '(Drag & Resize)' : ''}</span>
        </div>
        <div className="le-controls__canvas">

          {/* Home Score Buttons */}
          <DraggableWidget id="ctrl-homeScore" layout={ctrlLayouts['ctrl-homeScore']} editing={editing} onLayoutChange={handleControlChange} label="Home Score">
            <div className="le-c-score">
              <span className="le-c-score__team">{home.config.name}</span>
              <button className="le-c-btn le-c-btn--g" onClick={() => sendCommand({ type: 'ADD_SCORE', team: 'home', points: 3 })}>+3</button>
              <button className="le-c-btn le-c-btn--g" onClick={() => sendCommand({ type: 'ADD_SCORE', team: 'home', points: 2 })}>+2</button>
              <button className="le-c-btn le-c-btn--a" onClick={() => sendCommand({ type: 'ADD_SCORE', team: 'home', points: 1 })}>+1</button>
              <button className="le-c-btn le-c-btn--r" onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'home' })}>-1</button>
            </div>
          </DraggableWidget>

          {/* Away Score Buttons */}
          <DraggableWidget id="ctrl-awayScore" layout={ctrlLayouts['ctrl-awayScore']} editing={editing} onLayoutChange={handleControlChange} label="Away Score">
            <div className="le-c-score">
              <span className="le-c-score__team">{away.config.name}</span>
              <button className="le-c-btn le-c-btn--g" onClick={() => sendCommand({ type: 'ADD_SCORE', team: 'away', points: 3 })}>+3</button>
              <button className="le-c-btn le-c-btn--g" onClick={() => sendCommand({ type: 'ADD_SCORE', team: 'away', points: 2 })}>+2</button>
              <button className="le-c-btn le-c-btn--a" onClick={() => sendCommand({ type: 'ADD_SCORE', team: 'away', points: 1 })}>+1</button>
              <button className="le-c-btn le-c-btn--r" onClick={() => sendCommand({ type: 'SUBTRACT_SCORE', team: 'away' })}>-1</button>
            </div>
          </DraggableWidget>

          {/* Clock Display */}
          <DraggableWidget id="ctrl-clock" layout={ctrlLayouts['ctrl-clock']} editing={editing} onLayoutChange={handleControlChange} label="Clock">
            <div className="le-c-clock">{clockStr}</div>
          </DraggableWidget>

          {/* Clock Buttons */}
          <DraggableWidget id="ctrl-clockBtns" layout={ctrlLayouts['ctrl-clockBtns']} editing={editing} onLayoutChange={handleControlChange} label="Clock Controls">
            <div className="le-c-btns">
              <button className="le-c-btn le-c-btn--g" onClick={() => sendCommand({ type: 'START_GAME_CLOCK' })} disabled={gameClock.running}>Start</button>
              <button className="le-c-btn le-c-btn--r" onClick={() => sendCommand({ type: 'STOP_GAME_CLOCK' })} disabled={!gameClock.running}>Pause</button>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'RESET_GAME_CLOCK' })}>Reset</button>
            </div>
          </DraggableWidget>

          {/* Shot Clock */}
          <DraggableWidget id="ctrl-shotClock" layout={ctrlLayouts['ctrl-shotClock']} editing={editing} onLayoutChange={handleControlChange} label="Shot Clock">
            <div className="le-c-btns">
              <span className="le-c-shot-val">{shotSec}</span>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'START_SHOT_CLOCK' })}>▶</button>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'RESET_SHOT_CLOCK' })}>↺</button>
            </div>
          </DraggableWidget>

          {/* Period */}
          <DraggableWidget id="ctrl-period" layout={ctrlLayouts['ctrl-period']} editing={editing} onLayoutChange={handleControlChange} label="Period">
            <div className="le-c-btns">
              <span className="le-c-period-val">Q{period.current}</span>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'ADVANCE_PERIOD' })}>Next Q</button>
            </div>
          </DraggableWidget>

          {/* Switch */}
          <DraggableWidget id="ctrl-switch" layout={ctrlLayouts['ctrl-switch']} editing={editing} onLayoutChange={handleControlChange} label="Switch Sides">
            <button className="le-c-btn le-c-btn--sw" onClick={() => sendCommand({ type: 'SWITCH_SIDES' })}>⇄ SWITCH SIDES</button>
          </DraggableWidget>

          {/* Horn */}
          <DraggableWidget id="ctrl-horn" layout={ctrlLayouts['ctrl-horn']} editing={editing} onLayoutChange={handleControlChange} label="Buzzer">
            <div className="le-c-btns">
              <button className="le-c-btn le-c-btn--horn" onClick={() => { import('../audio/audioEngine').then(m => m.audioEngine.playEndOfPeriod()) }}>🔔 Horn</button>
              <button className="le-c-btn le-c-btn--horn" onClick={() => { import('../audio/audioEngine').then(m => m.audioEngine.playShotClockViolation()) }}>🔔 Sub</button>
            </div>
          </DraggableWidget>

          {/* Timeout */}
          <DraggableWidget id="ctrl-timeout" layout={ctrlLayouts['ctrl-timeout']} editing={editing} onLayoutChange={handleControlChange} label="Timeout">
            <div className="le-c-btns">
              <button className="le-c-btn le-c-btn--d" onClick={() => { sendCommand({ type: 'USE_TIMEOUT', team: 'home', kind: 'full' }); sendCommand({ type: 'START_TIMEOUT', team: 'home' }) }}>TO Home</button>
              <button className="le-c-btn le-c-btn--d" onClick={() => { sendCommand({ type: 'USE_TIMEOUT', team: 'away', kind: 'full' }); sendCommand({ type: 'START_TIMEOUT', team: 'away' }) }}>TO Away</button>
            </div>
          </DraggableWidget>

          {/* Foul Home */}
          <DraggableWidget id="ctrl-foulHome" layout={ctrlLayouts['ctrl-foulHome']} editing={editing} onLayoutChange={handleControlChange} label="Fouls Home">
            <div className="le-c-btns">
              <span className="le-c-foul-val">{home.fouls}F</span>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'ADD_FOUL', team: 'home' })}>+</button>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'SUBTRACT_FOUL', team: 'home' })}>-</button>
            </div>
          </DraggableWidget>

          {/* Foul Away */}
          <DraggableWidget id="ctrl-foulAway" layout={ctrlLayouts['ctrl-foulAway']} editing={editing} onLayoutChange={handleControlChange} label="Fouls Away">
            <div className="le-c-btns">
              <span className="le-c-foul-val">{away.fouls}F</span>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'ADD_FOUL', team: 'away' })}>+</button>
              <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'SUBTRACT_FOUL', team: 'away' })}>-</button>
            </div>
          </DraggableWidget>

          {/* Undo */}
          <DraggableWidget id="ctrl-undo" layout={ctrlLayouts['ctrl-undo']} editing={editing} onLayoutChange={handleControlChange} label="Undo">
            <button className="le-c-btn le-c-btn--d" onClick={() => sendCommand({ type: 'UNDO' })}>↩ Undo</button>
          </DraggableWidget>

          {/* New Game */}
          <DraggableWidget id="ctrl-newGame" layout={ctrlLayouts['ctrl-newGame']} editing={editing} onLayoutChange={handleControlChange} label="New Game">
            <button className="le-c-btn le-c-btn--r" onClick={() => sendCommand({ type: 'NEW_GAME', clearTeams: false })}>New Game</button>
          </DraggableWidget>

        </div>
      </div>
    </div>
  )
}
