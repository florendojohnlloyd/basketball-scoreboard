import { create } from 'zustand'
import { DEFAULT_GAME_STATE, SCOREBOARD_STATE, SCOREBOARD_COMMAND, SCOREBOARD_QUERY, SCOREBOARD_EVENT } from '@shared/types'
import type { GameState, CommandType } from '@shared/types'

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface ScoreboardStore {
  gameState: GameState
  setGameState: (state: GameState) => void
  replayActive: boolean
  setReplayActive: (v: boolean) => void
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export const useScoreboardStore = create<ScoreboardStore>((set) => ({
  gameState: DEFAULT_GAME_STATE(),
  setGameState: (state: GameState) => set({ gameState: state }),
  replayActive: false,
  setReplayActive: (v: boolean) => set({ replayActive: v }),
}))

// ---------------------------------------------------------------------------
// IPC subscription — subscribe to state snapshots from main process
// Wrapped in a DOMContentLoaded guard so contextBridge is ready.
// ---------------------------------------------------------------------------

function attachIpc(): void {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    // Listen for ongoing state broadcasts
    window.electron.ipcRenderer.on(SCOREBOARD_STATE, (rawState: unknown) => {
      useScoreboardStore.getState().setGameState(rawState as GameState)
    })

    // Listen for events (replay trigger, etc.)
    window.electron.ipcRenderer.on(SCOREBOARD_EVENT, (raw: unknown) => {
      const event = raw as { type: string }
      if (event.type === 'REPLAY_TRIGGER') {
        useScoreboardStore.getState().setReplayActive(true)
        setTimeout(() => {
          useScoreboardStore.getState().setReplayActive(false)
        }, 4000)
      }
    })

    // Request initial state snapshot from main process on load
    window.electron.ipcRenderer.invoke(SCOREBOARD_QUERY, { type: 'GET_STATE' })
      .then((state: unknown) => {
        if (state) useScoreboardStore.getState().setGameState(state as GameState)
      })
      .catch(() => {/* ignore if main not ready yet */})
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
