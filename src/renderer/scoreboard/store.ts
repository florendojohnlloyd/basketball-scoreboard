import { create } from 'zustand'
import { DEFAULT_GAME_STATE, SCOREBOARD_STATE, SCOREBOARD_COMMAND } from '@shared/types'
import type { GameState, CommandType } from '@shared/types'

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface ScoreboardStore {
  gameState: GameState
  setGameState: (state: GameState) => void
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export const useScoreboardStore = create<ScoreboardStore>((set) => ({
  gameState: DEFAULT_GAME_STATE(),
  setGameState: (state: GameState) => set({ gameState: state }),
}))

// ---------------------------------------------------------------------------
// IPC subscription — subscribe to state snapshots from main process
// Wrapped in a DOMContentLoaded guard so contextBridge is ready.
// ---------------------------------------------------------------------------

function attachIpc(): void {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on(SCOREBOARD_STATE, (rawState: unknown) => {
      useScoreboardStore.getState().setGameState(rawState as GameState)
    })
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachIpc)
} else {
  attachIpc()
}

// ---------------------------------------------------------------------------
// sendCommand — dispatch a command to the main process
// (included for parity with Control Panel; scoreboard display is read-only
//  in normal usage but may need to query initial state)
// ---------------------------------------------------------------------------

export function sendCommand(command: CommandType): void {
  window.electron.ipcRenderer.send(SCOREBOARD_COMMAND, command)
}
