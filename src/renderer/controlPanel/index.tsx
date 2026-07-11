import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Initialize audio engine so it subscribes to buzzer IPC events
import './audio/audioEngine'

// Restore player name size CSS variable from localStorage
const savedPlayerSize = localStorage.getItem('player-name-size') || '10'
document.documentElement.style.setProperty('--player-name-cqh', `${savedPlayerSize}cqh`)

/**
 * Control Panel renderer entry point.
 * Placeholder — full implementation in task 8.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
