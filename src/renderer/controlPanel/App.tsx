import React from 'react'
import { useControlPanelStore } from './store'
import GameClockControl from './components/GameClockControl'
import ShotClockControl from './components/ShotClockControl'
import PeriodControl from './components/PeriodControl'
import FoulPanel from './components/FoulPanel'
import TimeoutPanel from './components/TimeoutPanel'
import TeamConfigPanel from './components/TeamConfigPanel'
import MonitorSelector from './components/MonitorSelector'
import GameConfigPanel from './components/GameConfigPanel'
import ManualBuzzerButton from './components/ManualBuzzerButton'
import VolumeControl from './components/VolumeControl'
import StatusBar from './components/StatusBar'
import './App.css'

/**
 * Control Panel root component.
 *
 * Layout: two-column grid
 *   Left column  — team / score / foul / timeout controls
 *   Right column — clock and config controls
 */
function App(): React.ReactElement {
  const gameState = useControlPanelStore((s) => s.gameState)
  const { home, away } = gameState

  return (
    <div className="cp-layout">
      {/* ------------------------------------------------------------------ */}
      {/* Left column — team / score / foul / timeout controls                */}
      {/* ------------------------------------------------------------------ */}
      <div className="cp-col cp-col--left">
        <section className="cp-section">
          <h2 className="cp-section__title">Teams &amp; Scores</h2>

          {/* Home team score summary */}
          <div className="cp-team-block">
            <span
              className="cp-team-color-swatch"
              style={{ backgroundColor: home.config.color }}
            />
            <strong className="cp-team-name">{home.config.name}</strong>
            <span className="cp-score">{home.score}</span>
          </div>

          {/* Away team score summary */}
          <div className="cp-team-block">
            <span
              className="cp-team-color-swatch"
              style={{ backgroundColor: away.config.color }}
            />
            <strong className="cp-team-name">{away.config.name}</strong>
            <span className="cp-score">{away.score}</span>
          </div>
        </section>

        <section className="cp-section">
          <h2 className="cp-section__title">Team Configuration</h2>
          <TeamConfigPanel team="home" />
          <TeamConfigPanel team="away" />
        </section>

        <section className="cp-section">
          <h2 className="cp-section__title">Fouls</h2>
          <FoulPanel team="home" />
          <FoulPanel team="away" />
        </section>

        <section className="cp-section">
          <h2 className="cp-section__title">Timeouts</h2>
          <TimeoutPanel team="home" />
          <TimeoutPanel team="away" />
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right column — clock and config controls                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="cp-col cp-col--right">
        <section className="cp-section">
          <h2 className="cp-section__title">Game Clock</h2>
          <GameClockControl />
        </section>

        <section className="cp-section">
          <h2 className="cp-section__title">Shot Clock</h2>
          <ShotClockControl />
        </section>

        <section className="cp-section">
          <h2 className="cp-section__title">Period</h2>
          <PeriodControl />
        </section>

        <section className="cp-section">
          <h2 className="cp-section__title">Config</h2>
          <GameConfigPanel />
          <MonitorSelector />
        </section>

        <section className="cp-section">
          <h2 className="cp-section__title">Audio</h2>
          <ManualBuzzerButton />
          <VolumeControl />
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Status bar — spans both columns at the bottom                       */}
      {/* ------------------------------------------------------------------ */}
      <StatusBar />
    </div>
  )
}

export default App
