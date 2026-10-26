import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeListener: vi.fn(),
    removeHandler: vi.fn(),
  },
  app: {
    getPath: () => '',
  },
}))

import { createIpcRouter } from '../ipcRouter'
import { relayBridgeServer } from '../relayBridgeServer'

describe('Buzzer trigger on 00:00 setting', () => {
  it('triggers period end buzzer when clock expires or is set to 00:00', () => {
    const triggerBuzzSpy = vi.spyOn(relayBridgeServer, 'triggerBuzz').mockImplementation(() => {})

    const mockGameStore: any = {
      getState: () => ({
        gameClock: { running: false, displayMs: 10000, configuredDurationMinutes: 10 },
        shotClock: { running: false, displayMs: 24000, configuredDurationSeconds: 24 },
        home: { score: 0, fouls: 0, players: [] },
        away: { score: 0, fouls: 0, players: [] },
      }),
      dispatch: () => ({
        gameClock: { running: false, displayMs: 0, configuredDurationMinutes: 10 },
        shotClock: { running: false, displayMs: 24000, configuredDurationSeconds: 24 },
        home: { score: 0, fouls: 0, players: [] },
        away: { score: 0, fouls: 0, players: [] },
      }),
      canUndo: () => false,
      getUndoDescription: () => '',
    }

    const mockClockEngine: any = {
      stopGameClock: vi.fn(),
      stopShotClock: vi.fn(),
      startGameClock: vi.fn(),
      startShotClock: vi.fn(),
      startTimeoutClock: vi.fn(),
      stopTimeoutClock: vi.fn(),
    }

    const mockWindowManager: any = {
      getControlPanelWindow: () => null,
      getScoreboardWindow: () => null,
      getShotClockWindow: () => null,
      onDisplayRemoved: vi.fn(),
      onDisplayAdded: vi.fn(),
    }

    const mockLigaStore: any = {}
    const mockPresetStore: any = {}
    const mockAutosaveStore: any = { schedule: vi.fn() }

    const router = createIpcRouter(
      mockGameStore,
      mockClockEngine,
      mockWindowManager,
      mockPresetStore,
      mockLigaStore,
      mockAutosaveStore
    )

    const prevState = {
      gameClock: { running: false, displayMs: 5000 },
      shotClock: { running: false, displayMs: 24000 },
      home: { score: 0, fouls: 0, players: [] },
      away: { score: 0, fouls: 0, players: [] },
    } as any

    const nextState = {
      gameClock: { running: false, displayMs: 0 },
      shotClock: { running: false, displayMs: 24000 },
      home: { score: 0, fouls: 0, players: [] },
      away: { score: 0, fouls: 0, players: [] },
    } as any

    // Test transition from 5000ms to 0ms (even while clock stopped)
    router.broadcastWithBuzzerCheck(prevState, nextState)

    expect(mockClockEngine.stopGameClock).toHaveBeenCalled()
    expect(triggerBuzzSpy).toHaveBeenCalledWith(3.0, 'PERIOD_END')

    triggerBuzzSpy.mockClear()

    // Test shot clock expiration transition from 200ms to 0ms
    const prevShotState = {
      gameClock: { running: true, displayMs: 500000 },
      shotClock: { running: true, displayMs: 200 },
      home: { score: 0, fouls: 0, players: [] },
      away: { score: 0, fouls: 0, players: [] },
    } as any

    const nextShotState = {
      gameClock: { running: false, displayMs: 500000 },
      shotClock: { running: false, displayMs: 0 },
      home: { score: 0, fouls: 0, players: [] },
      away: { score: 0, fouls: 0, players: [] },
    } as any

    router.broadcastWithBuzzerCheck(prevShotState, nextShotState)

    expect(mockClockEngine.stopGameClock).toHaveBeenCalled()
    expect(mockClockEngine.stopShotClock).toHaveBeenCalled()
    expect(triggerBuzzSpy).toHaveBeenCalledWith(1.5, 'SHOT_CLOCK')

    triggerBuzzSpy.mockRestore()
    router.dispose()
  })
})
