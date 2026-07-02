import { create } from 'zustand'
import { DEFAULT_GAME_STATE, SCOREBOARD_STATE, SCOREBOARD_COMMAND } from '@shared/types'
import type { GameState, CommandType } from '@shared/types'

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface ControlPanelStore {
  gameState: GameState
  setGameState: (state: GameState) => void
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export const useControlPanelStore = create<ControlPanelStore>((set) => ({
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
      useControlPanelStore.getState().setGameState(rawState as GameState)
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
// ---------------------------------------------------------------------------

export function sendCommand(command: CommandType): void {
  window.electron.ipcRenderer.send(SCOREBOARD_COMMAND, command)
}
