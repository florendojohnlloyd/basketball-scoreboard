import React, { useEffect, useState } from 'react'
import type { GameState } from '../../shared/types'

export function ShotClockDisplay(): React.ReactElement {
  const [gameState, setGameState] = useState<GameState | null>(null)

  useEffect(() => {
    // Subscribe to game state updates
    const unsub = window.electron.ipcRenderer.on('gameState:update', (state: GameState) => {
      setGameState(state)
    })

    // Request initial state
    window.electron.ipcRenderer
      .invoke('scoreboard:query', { type: 'GET_STATE' })
      .then((state: GameState) => {
        setGameState(state)
      })
      .catch(console.error)

    return unsub
  }, [])

  if (!gameState) {
    return (
      <div className="shotclock-container">
        <div className="shotclock-loading">Connecting...</div>
      </div>
    )
  }

  const { shotClock } = gameState
  const shotSec = shotClock.displayMs > 0 
    ? Math.ceil(shotClock.displayMs / 1000) 
    : shotClock.configuredDurationSeconds
  const isLow = shotSec <= 5
  const isRunning = shotClock.running

  return (
    <div className="shotclock-container">
      <div className={`shotclock-display ${isLow ? 'shotclock-low' : ''} ${isRunning ? 'shotclock-running' : ''}`}>
        <div className="shotclock-label">SHOT CLOCK</div>
        <div className="shotclock-time">{shotSec}</div>
      </div>
    </div>
  )
}
