import React from 'react'
import { useScoreboardStore } from './store'
import ScoreboardLayout from './components/ScoreboardLayout'
import VolleyballScoreboardLayout from './components/VolleyballScoreboardLayout'

/**
 * Scoreboard Display root component.
 * Renders the full-screen ScoreboardLayout with no operator controls.
 */
function App(): React.ReactElement {
  const sport = useScoreboardStore(s => s.gameState.sport)
  return sport === 'volleyball' ? <VolleyballScoreboardLayout /> : <ScoreboardLayout />
}

export default App
