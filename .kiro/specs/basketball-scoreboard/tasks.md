# Implementation Plan: Basketball Scoreboard

## Overview

39 tasks implementing the Basketball Scoreboard Electron application from project scaffold through packaging. The implementation follows a bottom-up order: shared types → main process core modules → IPC wiring → Control Panel UI → Scoreboard Display UI → property-based tests → example-based tests → E2E tests → build configuration.

## Tasks

- [x] 1. Project scaffold and build configuration
- [x] 2. Core TypeScript types and data models
- [x] 3. GameStore — pure reducer and state management
- [x] 4. ClockEngine — drift-compensated timer
- [x] 5. WindowManager — dual-window and monitor management
- [x] 6. PresetStore — persistence and built-in presets
- [x] 7. IPC wiring — command router and state broadcast
- [x] 8. Control Panel renderer shell and Zustand store
- [x] 9. ScorePanel component
- [x] 10. GameClockControl component
- [x] 11. ShotClockControl component
- [x] 12. PeriodControl component
- [x] 13. FoulPanel component
- [x] 14. TimeoutPanel component
- [x] 15. TeamConfigPanel component
- [x] 16. MonitorSelector component
- [x] 17. GameConfigPanel and preset UI
- [x] 18. ManualBuzzerButton and VolumeControl components
- [x] 19. StatusBar component
- [x] 20. AudioEngine (Web Audio API)
- [x] 21. Scoreboard Display renderer shell and Zustand store
- [x] 22. ScoreboardLayout and TeamSection components
- [x] 23. ClockDisplay component (game clock)
- [x] 24. ShotClockDisplay component
- [x] 25. PeriodDisplay component
- [x] 26. Property-based tests — validation.test.ts (Properties 1, 8, 14, 15, 23)
- [x] 27. Property-based tests — gameReducer.test.ts (Properties 2–5, 7, 10, 12–13, 16, 20–22)
- [x] 28. Property-based tests — clockDisplay.test.ts (Properties 6, 9)
- [x] 29. Property-based tests — periodLabel.test.ts (Property 11)
- [x] 30. Property-based tests — TimeoutIndicator.test.tsx (Property 17)
- [x] 31. Property-based tests — presetStore.test.ts (Properties 18, 19)
- [x] 32. Property-based tests — AudioEngine.test.ts (Property 24)
- [x] 33. Example-based unit tests — GameStore behaviors
- [x] 34. Example-based unit tests — ClockEngine behaviors
- [x] 35. Example-based unit tests — PresetStore behaviors
- [x] 36. Example-based unit tests — Control Panel component behaviors
- [x] 37. Example-based unit tests — Scoreboard Display component behaviors
- [x] 38. E2E tests — Playwright test suite
- [ ] 39. Packaging and production build configuration

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "5", "6"] },
    { "wave": 4, "tasks": ["4", "7"] },
    { "wave": 5, "tasks": ["8", "21"] },
    { "wave": 6, "tasks": ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"] },
    { "wave": 7, "tasks": ["22", "23", "24", "25"] },
    { "wave": 8, "tasks": ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37"] },
    { "wave": 9, "tasks": ["38"] },
    { "wave": 10, "tasks": ["39"] }
  ]
}
```

## Notes

- Tasks 26–32 are property-based test tasks (PBT). Each maps directly to one or more numbered Correctness Properties in design.md and must be updated with `update_pbt_status` after execution.
- All PBT tasks use fast-check with `numRuns: 100` and the `FC_SEED=42` global in CI.
- Tasks 9–20 (Control Panel components) and 22–25 (Scoreboard components) can be implemented in parallel once task 8 (Control Panel shell) and task 21 (Scoreboard shell) are complete.
- Tasks 26–37 (tests) depend on the implementation tasks they test but can be written in parallel with those tasks during TDD.
- Task 38 (E2E) requires a working build and should run last among test tasks.
- Task 39 (packaging) is the final task and depends on all prior tasks passing their tests.

## Task Details

### 1. Project scaffold and build configuration

Set up the Electron + React + TypeScript project using electron-vite. Configure the monorepo structure with separate entry points for the main process and both renderer windows.

- Initialize the project with `electron-vite` and the React + TypeScript template
- Configure `tsconfig.json` for the main process (`src/main`) and two renderer targets (`src/renderer/controlPanel`, `src/renderer/scoreboard`)
- Install runtime dependencies: `electron@30+`, `react@18`, `react-dom@18`, `zustand`, `electron-store`
- Install dev dependencies: `electron-vite`, `typescript`, `vitest`, `fast-check`, `@playwright/test`, `@testing-library/react`, `jsdom`, `@types/react`, `@types/node`
- Create `vitest.config.ts` with `globals: true`, jsdom environment for renderer tests, and a separate node-environment config for main-process tests
- Create `vitest.setup.ts` with `fc.configureGlobal({ seed: 42 })` gated on `process.env.CI`
- Set up `src/main/index.ts`, `src/renderer/controlPanel/index.tsx`, and `src/renderer/scoreboard/index.tsx` entry points with placeholder content
- Add `package.json` scripts: `dev`, `build`, `test`, `test:e2e`, `preview`
- Verify the project compiles and the dev server starts without errors

### 2. Core TypeScript types and data models

Define all shared TypeScript interfaces and types used across the main process and both renderers.

- Create `src/shared/types.ts` exporting all interfaces: `GameState`, `TeamState`, `TeamConfig`, `TimeoutState`, `ClockState`, `ShotClockState`, `PeriodState`, `GameConfig`, `Preset`
- Define the `CommandType` discriminated union with all 22 command variants listed in the design
- Define `ValidationResult` type: `{ valid: boolean; error?: string }`
- Define the built-in preset constants `NBA_RULES` and `FIBA_RULES` as `const` objects matching the design document values
- Define the `DEFAULT_GAME_STATE` factory function that returns a fresh `GameState` using NBA Rules defaults
- Export IPC channel name constants: `SCOREBOARD_COMMAND`, `SCOREBOARD_STATE`, `SCOREBOARD_EVENT`, `SCOREBOARD_QUERY`
- Verify no TypeScript errors across all shared types

### 3. GameStore — pure reducer and state management

Implement the `gameReducer` pure function and the `GameStore` wrapper that holds authoritative game state in the main process.

- Create `src/main/gameStore.ts`
- Implement `gameReducer(state: GameState, command: CommandType): GameState` as a pure function with no side effects
- Handle all 22 command variants:
  - `ADD_SCORE`: add 1, 2, or 3 to the specified team's score (score cannot go negative)
  - `SUBTRACT_SCORE`: decrement score by 1, floored at 0
  - `START_GAME_CLOCK` / `STOP_GAME_CLOCK`: toggle `gameClock.running`
  - `RESET_GAME_CLOCK`: stop clock, set `displayMs` to `configuredDurationMs`
  - `SET_GAME_CLOCK`: validate seconds in [0, 3600], set `displayMs`, reject otherwise
  - `START_SHOT_CLOCK` / `STOP_SHOT_CLOCK`: toggle `shotClock.running`
  - `RESET_SHOT_CLOCK`: stop shot clock, set `displayMs` to `configuredDurationSeconds * 1000`
  - `CLOCK_TICK`: decrement both running clocks by `deltaMs`, clamp at 0, set `running: false` when either reaches 0
  - `ADD_FOUL` / `SUBTRACT_FOUL`: increment/decrement team foul count, floored at 0
  - `USE_TIMEOUT` / `RESTORE_TIMEOUT`: decrement/increment the specified timeout kind, clamped to [0, max]
  - `ADVANCE_PERIOD`: stop game clock, increment period counter, reset game clock, reset both teams' foul counts to 0; handle overtime when advancing past max period
  - `SET_TEAM_CONFIG`: merge partial config into team's config
  - `LOAD_PRESET`: replace `gameConfig` with preset values, preserve team config
  - `NEW_GAME`: reset scores, fouls, period, clocks, and timeouts to configured values; optionally clear team names
  - `SET_SHOT_CLOCK_ENABLED`: toggle `shotClock.enabled`
  - `SET_VOLUME`: validate [0.0, 1.0], update `volume`
- Export a `createGameStore()` factory that holds state and exposes `dispatch(command)` and `getState()` methods
- Ensure the reducer never mutates its input — always return a new state object

### 4. ClockEngine — drift-compensated timer

Implement `ClockEngine` in the main process using the expected-minus-actual drift compensation pattern.

- Create `src/main/clockEngine.ts`
- Implement `createClockEngine(dispatch: (cmd: CommandType) => void): ClockEngine`
- Use two independent `NodeJS.Timer` instances — one for the game clock, one for the shot clock
- Each timer fires every 100 ms and sends `{ type: 'CLOCK_TICK', deltaMs: actualElapsed }` to the provided dispatch function
- Apply the drift-compensation pattern from the design: track `lastTickTime = Date.now()`, compute `actualElapsed = now - lastTickTime`, pass `actualElapsed` as `deltaMs`
- `startGameClock()` / `stopGameClock()`: start or clear the game clock interval
- `startShotClock()` / `stopShotClock()`: start or clear the shot clock interval
- `dispose()`: clear both intervals
- Export the `ClockEngine` interface from `src/shared/types.ts`
- Verify no TypeScript errors

### 5. WindowManager — dual-window and monitor management

Implement `WindowManager` to create and position the Control Panel and Scoreboard Display windows.

- Create `src/main/windowManager.ts`
- Implement `createWindowManager(): WindowManager`
- `createWindows()`: create two `BrowserWindow` instances
  - Control Panel: standard frame, loads `controlPanel` renderer URL, opens on primary display
  - Scoreboard Display: `frame: false`, `fullscreen: true` on the secondary display (or off-screen if only one display); loads `scoreboard` renderer URL
- `getAvailableDisplays()`: return `screen.getAllDisplays()` sorted with primary first
- `assignScoreboardToDisplay(displayId)`: move and resize the scoreboard window to fill the target display bounds using `setBounds`
- `onDisplayAdded(handler)` / `onDisplayRemoved(handler)`: register listeners on Electron's `screen` events
- If only one monitor is present at launch, position the scoreboard window off-screen (x = primary width) and expose `isSingleMonitor: boolean` state
- Implement a 1-second heartbeat that checks whether the scoreboard window's current display is still present; if the display disappears, emit a `DISPLAY_DISCONNECTED` IPC event to the Control Panel
- Store and restore window bounds using `electron-store` so the operator's layout persists across restarts

### 6. PresetStore — persistence and built-in presets

Implement `PresetStore` using `electron-store` to read, write, and validate game configuration presets.

- Create `src/main/presetStore.ts`
- Use `electron-store` to persist user presets as a JSON array under the key `presets`
- Embed the `NBA_RULES` and `FIBA_RULES` built-in presets in the application bundle (not read from disk)
- `list()`: return built-in presets + user presets; validate each user preset against the `GameConfig` schema; remove and log any corrupted entries, sending an IPC error event to the Control Panel
- `load(name)`: return the `GameConfig` for the named preset; throw if not found
- `save(name, config)`: validate the name (1–30 chars, non-whitespace-only, unique or confirmed overwrite); persist to store
- `delete(name)`: reject if `isBuiltIn(name)` returns true; otherwise remove from store
- `isBuiltIn(name)`: return `true` for "NBA Rules" and "FIBA Rules"
- Validate `GameConfig` fields on load: `periodDurationMinutes` [1–60], `periodCount` in {2, 4}, `shotClockDurationSeconds` [14–30], `bonusThreshold` [1–10], `fullTimeoutsPerTeam` [0–10], `twentySecTimeoutsPerTeam` [0–10]

### 7. IPC wiring — command router and state broadcast

Wire together the main process modules: route incoming IPC commands through the GameStore and broadcast the resulting state to both windows.

- Create `src/main/ipcRouter.ts`
- Register a single `ipcMain.on('scoreboard:command', handler)` listener
- In the handler: call `gameStore.dispatch(command)`, then send the updated state to both `BrowserWindow` instances via `webContents.send('scoreboard:state', newState)`
- After each `CLOCK_TICK` command that results in a clock reaching 0, emit `{ type: 'BUZZER_END_PERIOD' }` or `{ type: 'BUZZER_SHOT_CLOCK' }` via `webContents.send('scoreboard:event', event)` to the Control Panel
- Register `ipcMain.handle('scoreboard:query', handler)` for synchronous queries (e.g., `GET_MONITORS`, `GET_STATE`)
- Connect `ClockEngine` so that `START_GAME_CLOCK` / `STOP_GAME_CLOCK` commands also call the corresponding `ClockEngine` methods; same for shot clock commands
- On `DISPLAY_DISCONNECTED` from `WindowManager`, forward the event to the Control Panel renderer
- Update `src/main/index.ts` to instantiate `GameStore`, `ClockEngine`, `WindowManager`, `PresetStore`, and `IpcRouter` in the correct order on `app.whenReady()`

### 8. Control Panel renderer shell and Zustand store

Set up the Control Panel React application entry point and the Zustand state mirror.

- Create `src/renderer/controlPanel/store.ts` with a Zustand store that holds a `GameState` value
- Subscribe to `window.electron.ipcRenderer.on('scoreboard:state', ...)` and update the Zustand store on every received state snapshot
- Expose a `sendCommand(command: CommandType): void` helper that calls `window.electron.ipcRenderer.send('scoreboard:command', command)`
- Create `src/renderer/controlPanel/App.tsx` as the root component; render a two-column layout: left column for team/score/foul/timeout controls, right column for clock and config controls
- Set up React root in `src/renderer/controlPanel/index.tsx`
- Configure Electron's `contextBridge` / `preload.ts` to expose `ipcRenderer.send`, `ipcRenderer.on`, and `ipcRenderer.invoke` safely to the renderer
- Apply global CSS reset and dark base theme via `src/renderer/controlPanel/index.css`
- Verify the app launches and the Control Panel window renders without errors

### 9. ScorePanel component

Implement the score management UI for both teams in the Control Panel.

- Create `src/renderer/controlPanel/components/ScorePanel.tsx`
- Display the current score for a single team (home or away)
- Render buttons: "+1", "+2", "+3" (each dispatches `ADD_SCORE` with the corresponding points)
- Render a "-1" button that dispatches `SUBTRACT_SCORE`; disable this button when `score === 0`
- Accept props: `team: 'home' | 'away'`, `score: number`
- Read `score` from the Zustand store slice for the specified team
- Display the team name above the score
- Ensure buttons are keyboard accessible (focusable, activatable via Enter/Space)
- Write a snapshot or render test confirming the subtract button is disabled at score 0 and enabled above 0

### 10. GameClockControl component

Implement the game clock control UI in the Control Panel.

- Create `src/renderer/controlPanel/components/GameClockControl.tsx`
- Display the current game clock in MM:SS format, updating from the Zustand store
- Implement a `formatClockDisplay(ms: number): string` pure utility in `src/renderer/shared/clockUtils.ts` that zero-pads MM and SS
- Render "Start", "Stop", and "Reset" buttons dispatching `START_GAME_CLOCK`, `STOP_GAME_CLOCK`, and `RESET_GAME_CLOCK` respectively
- "Start" is disabled when the clock is already running; "Stop" is disabled when the clock is already stopped
- Render a manual time-entry input (MM:SS format) that is only enabled when the clock is stopped; on commit, dispatch `SET_GAME_CLOCK` with the parsed seconds value and display a validation error if the value is out of range
- Highlight the clock display in red when `displayMs` is below 10 seconds as a visual urgency cue

### 11. ShotClockControl component

Implement the shot clock control UI in the Control Panel.

- Create `src/renderer/controlPanel/components/ShotClockControl.tsx`
- Display the shot clock value as a whole number of seconds using `Math.ceil(displayMs / 1000)`
- Render "Start", "Stop", and "Reset" buttons dispatching the corresponding shot clock commands
- Render an enable/disable toggle that dispatches `SET_SHOT_CLOCK_ENABLED`
- Render a duration configuration input (integer, 14–30 seconds) that dispatches `LOAD_PRESET` or an inline config update; show a validation error if the value is out of range
- Hide all controls (or visually disable them) when the shot clock is disabled
- Highlight the shot clock display in amber when value is ≤ 5 seconds

### 12. PeriodControl component

Implement the period tracking UI in the Control Panel.

- Create `src/renderer/controlPanel/components/PeriodControl.tsx`
- Display the current period label using the same formatting logic as `PeriodDisplay` (Q1–Q4, 1st Half / 2nd Half, OT, 2OT …)
- Render a "Next Period" button that dispatches `ADVANCE_PERIOD`
- Before dispatching, check: if the game clock is running, show an inline warning "Stop the clock before advancing"; if at the final period with tied scores, show a dialog offering to add OT; if at the final period with unequal scores, show a confirmation dialog
- Render a game format selector (Quarters / Halves) available only in pre-game phase
- Display the total configured period count alongside the current period (e.g., "Q2 of 4")

### 13. FoulPanel component

Implement the team foul tracking UI in the Control Panel.

- Create `src/renderer/controlPanel/components/FoulPanel.tsx`
- Accept props: `team: 'home' | 'away'`
- Display the current foul count for the team
- Render "+" and "−" buttons dispatching `ADD_FOUL` and `SUBTRACT_FOUL`; disable "−" when `fouls === 0`
- Display a "BONUS" badge when `fouls >= gameConfig.bonusThreshold`
- Display the configured bonus threshold next to the foul count (e.g., "3 / 5 fouls")
- Render a numeric input for the bonus threshold configuration (1–10) dispatching a config update; show validation error if out of range

### 14. TimeoutPanel component

Implement the timeout tracking UI in the Control Panel.

- Create `src/renderer/controlPanel/components/TimeoutPanel.tsx`
- Accept props: `team: 'home' | 'away'`
- Render separate rows for full timeouts and 20-second timeouts
- Each row shows the remaining count and "−" / "+" buttons dispatching `USE_TIMEOUT` and `RESTORE_TIMEOUT`
- Disable "−" when `remaining === 0`; disable "+" when `remaining === configuredMax`
- Display the remaining / total counts (e.g., "5 / 7 full")

### 15. TeamConfigPanel component

Implement the team configuration UI in the Control Panel.

- Create `src/renderer/controlPanel/components/TeamConfigPanel.tsx`
- Accept props: `team: 'home' | 'away'`
- Render a text input for the team name (1–30 chars); show an inline error if empty, whitespace-only, or > 30 chars; dispatch `SET_TEAM_CONFIG` with the validated name on blur or Enter
- Render a color picker (HTML `<input type="color">`) that dispatches `SET_TEAM_CONFIG` with the chosen hex color
- Render a file input for logo upload; validate that the selected file is JPEG, PNG, GIF, WebP, or SVG; send the file path via `SET_TEAM_CONFIG`; display an error message if the file is unsupported
- Changes during an active game dispatch immediately and update the Scoreboard Display within 200 ms

### 16. MonitorSelector component

Implement the monitor selection UI in the Control Panel.

- Create `src/renderer/controlPanel/components/MonitorSelector.tsx`
- On mount, query available displays via `ipcRenderer.invoke('scoreboard:query', { type: 'GET_MONITORS' })`
- Render a dropdown listing available displays by index / name
- Render an "Assign" button that dispatches an `assignScoreboardToDisplay` IPC query with the selected display ID
- Disable the dropdown and button when only one monitor is present; show a status message: "A second display is required for the Scoreboard"
- Subscribe to `scoreboard:event` for `DISPLAY_DISCONNECTED` and show a persistent alert: "Display monitor disconnected — scoreboard is no longer visible"
- Re-enable the dropdown when a new display is detected via `DISPLAY_ADDED` event

### 17. GameConfigPanel and preset UI

Implement the game configuration screen and preset save/load controls.

- Create `src/renderer/controlPanel/components/GameConfigPanel.tsx`
- Render inputs for all `GameConfig` fields with the valid ranges from the design (period duration 1–60 min, period count 2 or 4, shot clock duration 14–30 s, bonus threshold 1–10, full timeouts 0–10, 20-second timeouts 0–10)
- Show inline validation errors next to each field when values are out of range
- On save, dispatch `LOAD_PRESET` to apply the configuration to the game state
- Render a preset list panel:
  - Load all presets via `ipcRenderer.invoke('scoreboard:query', { type: 'GET_PRESETS' })`
  - Display built-in presets ("NBA Rules", "FIBA Rules") with a lock icon indicating they are read-only
  - "Load" button per preset populates all config fields and dispatches `LOAD_PRESET`
  - "Save As Preset" button opens a modal with a name field (1–30 chars, unique); on confirm, invoke `SAVE_PRESET`; if name exists, show overwrite confirmation dialog
  - "Delete" button on user presets only; requires confirmation before deleting
  - Display an error toast when a corrupted preset is detected on load

### 18. ManualBuzzerButton and VolumeControl components

Implement the manual buzzer and volume controls in the Control Panel.

- Create `src/renderer/controlPanel/components/ManualBuzzerButton.tsx`
  - A single button labeled "Buzzer" that calls `audioEngine.playEndOfPeriod()` on click
  - Show a brief "pressed" visual state while the sound plays
- Create `src/renderer/controlPanel/components/VolumeControl.tsx`
  - Render an `<input type="range" min="0" max="100">` slider
  - On change, convert the 0–100 integer to 0.0–1.0 and dispatch `SET_VOLUME`; also call `audioEngine.setGain(level)` immediately
  - Display the current percentage value next to the slider
  - Label: "Volume"

### 19. StatusBar component

Implement the status bar shown at the bottom of the Control Panel.

- Create `src/renderer/controlPanel/components/StatusBar.tsx`
- Display the current monitor connection status (e.g., "Scoreboard on Display 2" or "No secondary display")
- Render any active validation errors or system warnings (audio unavailable, logo load error, corrupted preset)
- Render the `DISPLAY_DISCONNECTED` persistent alert when triggered; the alert remains until the operator dismisses it or a display is reconnected
- Ensure the warning text meets WCAG AA contrast ratio against the status bar background

### 20. AudioEngine (Web Audio API)

Implement the `AudioEngine` singleton in the Control Panel renderer using the Web Audio API.

- Create `src/renderer/controlPanel/audio/audioEngine.ts`
- Wrap `new AudioContext()` construction in a try/catch; if construction fails or the context enters `suspended` state, set `audioAvailable = false` and surface a warning event for the `StatusBar`
- Implement `playEndOfPeriod()`: synthesize a buzzer tone ≥ 1.5 seconds using an `OscillatorNode` routed through a `GainNode`; choose a base frequency (e.g., 440 Hz); respect the current gain level
- Implement `playShotClockViolation()`: synthesize a short buzzer ≤ 0.5 seconds at a distinct frequency (e.g., 880 Hz); respect the current gain level
- Implement `setGain(level: number)`: set `gainNode.gain.value = level` for values in [0.0, 1.0]
- Subscribe to `scoreboard:event` in the renderer: play `playEndOfPeriod()` on `BUZZER_END_PERIOD`, play `playShotClockViolation()` on `BUZZER_SHOT_CLOCK`
- When `audioAvailable === false`, all playback methods are silent no-ops

### 21. Scoreboard Display renderer shell and Zustand store

Set up the Scoreboard Display React application.

- Create `src/renderer/scoreboard/store.ts` — same Zustand + IPC subscription pattern as the Control Panel store
- Subscribe to `scoreboard:state` IPC events and update the local Zustand slice
- Create `src/renderer/scoreboard/App.tsx` rendering `<ScoreboardLayout />`
- Set up React root in `src/renderer/scoreboard/index.tsx`
- Apply global CSS: `background: #000`, `margin: 0`, `overflow: hidden`, `user-select: none`
- Ensure no control elements, buttons, or operator tooling are rendered in this window
- Verify the Scoreboard Display window launches and fills the entire display

### 22. ScoreboardLayout and TeamSection components

Implement the full-screen scoreboard layout and per-team section.

- Create `src/renderer/scoreboard/components/ScoreboardLayout.tsx`
  - CSS Grid: three columns — home (left 40%), clock center column (20%), away (right 40%)
  - Full viewport height; dark background (`#0a0a0a` or similar)
  - Render `<TeamSection team="home" />`, `<ClockDisplay />`, `<TeamSection team="away" />`
  - Render `<PeriodDisplay />` and `<ShotClockDisplay />` in the center column below `<ClockDisplay />`
- Create `src/renderer/scoreboard/components/TeamSection.tsx`
  - Display team logo (if `logoPath` is set), team name, score, foul count, BONUS indicator (when fouls ≥ bonus threshold), and timeout indicators
  - Score font size: minimum 10% of display height (use `10vh` as a baseline)
  - Apply `--team-color` CSS custom property using the team's configured color as the accent
  - Ensure foreground text color achieves ≥ 4.5:1 contrast ratio against the dark background (use white `#FFFFFF` or compute from team color)
  - Home team aligns left; away team aligns right (passed via prop or CSS modifier)

### 23. ClockDisplay component (game clock)

Implement the centered game clock display on the Scoreboard.

- Create `src/renderer/scoreboard/components/ClockDisplay.tsx`
- Import `formatClockDisplay(ms: number): string` from `src/renderer/shared/clockUtils.ts` (implemented in task 10) and render the value in MM:SS format
- Update every render cycle driven by the Zustand store (which receives state every ≤ 100 ms from the main process)
- Font size: large enough to be legible from 5 meters on a 55-inch display; use `clamp(4rem, 10vw, 10rem)` or equivalent
- Foreground color: white with ≥ 4.5:1 contrast against dark background
- Flash the display (CSS animation) during the last 10 seconds of a period

### 24. ShotClockDisplay component

Implement the shot clock display on the Scoreboard.

- Create `src/renderer/scoreboard/components/ShotClockDisplay.tsx`
- Display `Math.ceil(shotClock.displayMs / 1000)` as a whole integer
- Hide the entire element (CSS `display: none` or conditional render) when `shotClock.enabled === false`
- When re-enabled, show the configured duration
- Font size: visually subordinate to the game clock but clearly readable (approximately 50% of game clock size)
- Turn amber/orange when value is ≤ 5 seconds

### 25. PeriodDisplay component

Implement the period label display on the Scoreboard.

- Create `src/renderer/scoreboard/components/PeriodDisplay.tsx`
- Implement a pure `formatPeriodLabel(period: PeriodState, config: GameConfig): string` utility in `src/renderer/shared/periodUtils.ts`:
  - Quarters format: "Q1", "Q2", "Q3", "Q4"
  - Halves format: "1st Half", "2nd Half"
  - Overtime: "OT" when `overtimeNumber === 1`, "2OT" for 2, "3OT" for 3, etc.
- Render the label using the utility
- Position below the game clock in the center column
- Font size: smaller than the game clock; clearly readable at distance

### 26. Property-based tests — validation.test.ts (Properties 1, 8, 14, 15, 23)

Write property-based tests for all pure validation functions using fast-check.

- Create `src/renderer/controlPanel/__tests__/validation.test.ts`
- Implement and export the following pure functions in `src/renderer/shared/validation.ts` (if not already present from other tasks):
  - `validateTeamName(name: string): ValidationResult`
  - `validateShotClockDuration(seconds: number): ValidationResult`
  - `validateBonusThreshold(value: number): ValidationResult`
  - `validateTimeoutCount(value: number): ValidationResult`
  - `getContrastTextColor(hexColor: string): string` — returns white or black ensuring ≥ 4.5:1 contrast
- **Property 1** — Team name validation accepts valid names and rejects invalid ones (`fc.string({ minLength: 0, maxLength: 50 })`) — **Validates: Requirements 2.3**
- **Property 8** — Shot clock duration accepts [14, 30] and rejects outside (`fc.integer(0, 50)`) — **Validates: Requirements 5.4**
- **Property 14** — Bonus threshold accepts [1, 10] and rejects outside (`fc.integer(-5, 15)`) — **Validates: Requirements 7.6**
- **Property 15** — Timeout count accepts [0, 10] and rejects outside (`fc.integer(-5, 15)`) — **Validates: Requirements 8.1**
- **Property 23** — WCAG AA contrast met for any team accent color; for each generated hex color `C`, `getContrastTextColor('#' + C)` returns a color whose contrast ratio with `#0a0a0a` is ≥ 4.5 (`fc.hexaString({ minLength: 6, maxLength: 6 })`) — **Validates: Requirements 11.2**
- Use `numRuns: 100` for all properties
- Run the tests and confirm all pass

### 27. Property-based tests — gameReducer.test.ts (Properties 2–5, 7, 10, 12–13, 16, 20–22)

Write property-based tests covering the core GameStore reducer invariants.

- Create `src/main/__tests__/gameReducer.test.ts`
- **Property 2** — Score subtract disabled at zero: for `fc.nat()` score, after `SUBTRACT_SCORE` the score is `Math.max(0, score - 1)` — **Validates: Requirements 3.4**
- **Property 3** — Game clock reset returns to configured duration: for arbitrary clock state and duration in [60000, 3600000] ms, after `RESET_GAME_CLOCK` the `displayMs` equals `configuredDurationMs` and `running` is false — **Validates: Requirements 4.4**
- **Property 4** — Game clock stop freezes value: for `fc.integer(0, 3600000)` clock value T with `running: true`, after `STOP_GAME_CLOCK` the value is still T and `running` is false — **Validates: Requirements 4.3**
- **Property 5** — Game clock manual set accepts [0, 3600] seconds, rejects outside: for `fc.integer(-100, 3700)` seconds S, `SET_GAME_CLOCK` succeeds and sets `displayMs = S * 1000` when S ∈ [0, 3600] and produces an unchanged state or error when outside — **Validates: Requirements 4.6**
- **Property 7** — Shot clock reset returns to configured duration: for `fc.integer(14, 30)` + arbitrary shot clock state, after `RESET_SHOT_CLOCK` the `displayMs` equals `configuredDurationSeconds * 1000` and `running` is false — **Validates: Requirements 5.2**
- **Property 10** — Period advance increments period and resets game clock: for game states where `period.current < maxPeriods`, after `ADVANCE_PERIOD` the period is exactly one greater and the game clock equals `configuredDurationMs` — **Validates: Requirements 6.2, 7.3**
- **Property 12** — Foul decrement floored at zero: for `fc.nat()` foul count, after `SUBTRACT_FOUL` the foul count is `Math.max(0, fouls - 1)` — **Validates: Requirements 7.2**
- **Property 13** — BONUS indicator logic: for `fc.nat()` foul count F and `fc.integer(1, 10)` threshold T, `F >= T` is the bonus condition — **Validates: Requirements 7.5**
- **Property 16** — Timeout decrement floored at 0; increment capped at configured max: for `fc.integer(0, 10)` remaining R and `fc.integer(0, 10)` max M with R ≤ M, `USE_TIMEOUT` never goes below 0 and `RESTORE_TIMEOUT` never exceeds M — **Validates: Requirements 8.3, 8.4**
- **Property 20** — New Game resets all counters: for arbitrary `GameState`, after `NEW_GAME` all scores are 0, fouls are 0, period is 1, clocks equal configured durations, timeout counts equal configured maxima — **Validates: Requirements 10.1**
- **Property 21** — Cancel New Game leaves state unchanged: since `NEW_GAME` is only dispatched after confirmation, test that an arbitrary `GameState` S with no `NEW_GAME` command dispatched is identical to itself — model the "cancel" path by asserting the reducer does not dispatch when cancelled — **Validates: Requirements 10.3**
- **Property 22** — New Game preserves team config and game settings: for arbitrary team config and `GameConfig`, after `NEW_GAME` the team names, colors, logo paths, and all `GameConfig` values are unchanged — **Validates: Requirements 10.4**
- Use `numRuns: 100` for all properties
- Run the tests and confirm all pass

### 28. Property-based tests — clockDisplay.test.ts (Properties 6, 9)

Write property-based tests for the clock display formatting utilities.

- Create `src/renderer/controlPanel/__tests__/clockDisplay.test.ts`
- **Property 6** — Game clock MM:SS format: for `fc.integer(0, 3600000)` ms value, `formatClockDisplay(ms)` returns a string matching `/^\d{2}:\d{2}$/` where MM is in [00, 60] and SS is in [00, 59] — **Validates: Requirements 4.7**
- **Property 9** — Shot clock whole seconds: for `fc.integer(0, 30000)` ms value V, `formatShotClock(V)` returns `Math.ceil(V / 1000)` as an integer with no fractional part — **Validates: Requirements 5.5**
- Implement `formatShotClock(ms: number): number` in `src/renderer/shared/clockUtils.ts` if not already present
- Use `numRuns: 100` for both properties
- Run the tests and confirm all pass

### 29. Property-based tests — periodLabel.test.ts (Property 11)

Write a property-based test for the period label formatting utility.

- Create `src/renderer/scoreboard/__tests__/periodLabel.test.ts`
- **Property 11** — Period label format correct for all valid period numbers: use `fc.integer(1, 4)` for period number N, `fc.oneof(fc.constant('quarters'), fc.constant('halves'))` for format, and `fc.integer(0, 10)` for overtime number K
  - When K = 0 (not OT): quarters → "Q{N}"; halves → "1st Half" / "2nd Half" (N ∈ {1, 2})
  - When K = 1: label is "OT"
  - When K > 1: label is "{K}OT"
  - **Validates: Requirements 6.3, 6.7**
- Use `numRuns: 100`
- Run the tests and confirm all pass

### 30. Property-based tests — TimeoutIndicator.test.tsx (Property 17)

Write a property-based test for the timeout indicator rendering.

- Create `src/renderer/scoreboard/__tests__/TimeoutIndicator.test.tsx`
- Create `src/renderer/scoreboard/components/TimeoutIndicator.tsx` that renders `remaining` filled indicators and `(max - remaining)` unfilled indicators given props `remaining: number` and `max: number`
- **Property 17** — Indicator counts match remaining and total: for `fc.integer(0, 10)` R and `fc.integer(0, 10)` M with `R <= M`, render `<TimeoutIndicator remaining={R} max={M} />` and assert that the count of elements with `data-filled="true"` equals R and `data-filled="false"` equals `M - R` — **Validates: Requirements 8.5**
- Use `numRuns: 100`
- Run the tests and confirm all pass

### 31. Property-based tests — presetStore.test.ts (Properties 18, 19)

Write property-based tests for the PresetStore save/load round trip and name validation.

- Create `src/main/__tests__/presetStore.test.ts`
- Mock `electron-store` to use an in-memory store for testing
- **Property 18** — Preset save/load round trip: for an `fc.record` generating a valid `GameConfig` (all fields in valid ranges), save the config with a unique name and load it back; assert deep equality — **Validates: Requirements 9.4**
- **Property 19** — Preset name validation: for `fc.string()` name S and `fc.array(fc.string())` existing names E, `validatePresetName(S, E)` accepts S when `S.trim().length` is in [1, 30] and S is not in E, and rejects otherwise — **Validates: Requirements 9.3**
- Use `numRuns: 100` for both properties
- Run the tests and confirm all pass

### 32. Property-based tests — AudioEngine.test.ts (Property 24)

Write a property-based test for the AudioEngine volume/gain mapping.

- Create `src/renderer/controlPanel/__tests__/AudioEngine.test.ts`
- Mock the Web Audio API (`AudioContext`, `GainNode`, `OscillatorNode`) using Vitest mocks
- **Property 24** — Volume level maps to gain linearly: for `fc.float({ min: 0, max: 1 })` level V, calling `audioEngine.setGain(V)` sets `gainNode.gain.value === V` exactly — **Validates: Requirements 12.4**
- Use `numRuns: 100`
- Run the tests and confirm all pass
  - [x] 32.1 Write property test for AudioEngine volume/gain mapping (Property 24)

### 33. Example-based unit tests — GameStore behaviors

Write example-based tests for specific GameStore / GameReducer behaviors not fully covered by properties.

- Add to `src/main/__tests__/gameReducer.test.ts` (or create a companion `gameStore.integration.test.ts`)
- Game clock auto-stops when `CLOCK_TICK` drives `displayMs` to 0: verify `running` becomes false and the reducer produces a state where `displayMs === 0`
- Shot clock auto-stops at 0, holds at 0 (never goes negative): dispatch `CLOCK_TICK` with `deltaMs` larger than the remaining shot clock value; verify `displayMs === 0` and `running === false`
- `ADVANCE_PERIOD` at the final regular period with tied scores produces an OT period (`isOvertime: true`, `overtimeNumber: 1`)
- `ADVANCE_PERIOD` at OT1 produces OT2 (`overtimeNumber: 2`)
- `LOAD_PRESET` replaces all `GameConfig` fields while preserving `home` and `away` team configs
- `NEW_GAME` with `clearTeams: true` resets both team names to empty strings
- `SET_GAME_CLOCK` with a value outside [0, 3600] seconds leaves state unchanged
- `SET_VOLUME` with a value outside [0.0, 1.0] leaves `volume` unchanged

### 34. Example-based unit tests — ClockEngine behaviors

Write example-based integration tests for `ClockEngine`.

- Create `src/main/__tests__/clockEngine.test.ts`
- Use Vitest's fake timers (`vi.useFakeTimers()`)
- Starting the game clock and advancing fake time by 1000 ms produces approximately 10 `CLOCK_TICK` dispatches (one per 100 ms interval), each with `deltaMs ≈ 100`
- Stopping the game clock after starting it results in no further dispatches when time advances
- Starting and stopping the shot clock independently does not affect the game clock dispatch count
- `dispose()` clears both timers and produces no further dispatches
- Game clock drift: advance fake time by 600,000 ms (10 minutes); verify the total `deltaMs` sum is within 1000 ms (1 second) of 600,000 ms

### 35. Example-based unit tests — PresetStore behaviors

Write example-based tests for `PresetStore`.

- Create `src/main/__tests__/presetStore.test.ts` (or extend the PBT file)
- Built-in presets ("NBA Rules", "FIBA Rules") are always present in `list()`
- `delete('NBA Rules')` throws an error and does not modify the store
- `save('NBA Rules', config)` throws an error (built-in preset cannot be overwritten)
- Corrupted preset entry (invalid JSON schema) is removed from the list on `list()` and triggers an error callback
- `save` followed by `delete` removes the preset from `list()`
- Duplicate name detection: `save` with an existing user preset name returns a conflict result; after overwrite confirmation, the new config replaces the old one

### 36. Example-based unit tests — Control Panel component behaviors

Write example-based React component tests for the Control Panel.

- Create test files co-located with components under `src/renderer/controlPanel/__tests__/`
- Use `@testing-library/react` and `vitest`; mock `ipcRenderer` via `vi.mock`
- **ScorePanel**: subtract button is disabled at score 0; clicking "+3" dispatches `{ type: 'ADD_SCORE', team: 'home', points: 3 }`; score updates when store value changes
- **GameClockControl**: Start button dispatches `START_GAME_CLOCK`; Stop button dispatches `STOP_GAME_CLOCK`; Reset button dispatches `RESET_GAME_CLOCK`; manual entry with "12:30" dispatches `SET_GAME_CLOCK` with 750 seconds; invalid entry "99:99" shows a validation error and does not dispatch
- **ShotClockControl**: enable/disable toggle dispatches `SET_SHOT_CLOCK_ENABLED`; duration input rejects values outside [14, 30] with inline error
- **FoulPanel**: BONUS badge appears when fouls meet the threshold and disappears when below; decrement button disabled at 0
- **TimeoutPanel**: decrement disabled at 0; increment disabled at configured max; both timeout types managed independently
- **MonitorSelector**: single-monitor state disables the dropdown and shows the "second display required" message; `DISPLAY_DISCONNECTED` event shows the persistent alert
- **PeriodControl**: Next Period button shows a warning when game clock is running; confirmation dialog appears when advancing past final period with unequal scores

### 37. Example-based unit tests — Scoreboard Display component behaviors

Write example-based tests for the Scoreboard Display components.

- Create test files under `src/renderer/scoreboard/__tests__/`
- **TeamSection**: BONUS label present when `fouls >= bonusThreshold`, absent when below; team color applied as `--team-color` CSS variable; logo rendered when `logoPath` is set, absent when null
- **ClockDisplay**: renders "12:34" for `displayMs = 754000`; renders "00:00" for `displayMs = 0`; flash CSS class applied when `displayMs < 10000`
- **ShotClockDisplay**: renders "24" for `displayMs = 24000`; renders "1" for `displayMs = 500` (ceil); hidden (`display: none` or unmounted) when `enabled === false`; visible when `enabled === true`
- **PeriodDisplay**: renders "Q1" for quarters period 1 (not OT); "2nd Half" for halves period 2; "OT" for OT1; "3OT" for OT3
- **ScoreboardLayout**: no buttons or interactive controls are present in the rendered output

### 38. E2E tests — Playwright test suite

Write end-to-end tests using Playwright covering the key integration flows.

- Create `e2e/scoreboard.spec.ts`
- Configure Playwright in `playwright.config.ts` to launch the Electron app using `electron.launch`
- **E2E Flow 1 — Full game flow**: launch app, enter team names "Lakers" and "Celtics", click "+3 Home" three times, verify scoreboard shows "9" for home, advance to Q2, verify period label shows "Q2", click New Game and confirm, verify all scores are 0 and period shows "Q1"
- **E2E Flow 2 — Dual-window state sync**: add score in Control Panel, capture timestamp before and after using `performance.now()` within the scoreboard renderer; assert the scoreboard score updates within 200 ms
- **E2E Flow 3 — Clock precision**: start the game clock, wait 10 real seconds using `page.waitForTimeout(10000)`, stop the clock; read the displayed MM:SS value; assert the elapsed time is within ±1 second of 10 seconds
- **E2E Flow 4 — Preset round-trip**: open GameConfigPanel, set period duration to 15 minutes, save as "Test Preset", close the app, re-launch, load "Test Preset", verify period duration shows 15 minutes
- Add Playwright config for the Electron executable path using the `electron` package (`_electron` API)
- Run the E2E tests and confirm all pass (may require a built app; document any required build step in the test config)

### 39. Packaging and production build configuration

Configure `electron-builder` to produce a distributable Windows installer.

- Install `electron-builder` as a dev dependency with a pinned version
- Create `electron-builder.yml` (or add `build` config to `package.json`) with:
  - `appId`: `com.basketball-scoreboard.app`
  - `productName`: `Basketball Scoreboard`
  - `win`: `nsis` target for an NSIS installer and `portable` target for a single-exe portable build
  - `directories.output`: `dist-app`
  - Include only the compiled `out/` directory and necessary assets; exclude `node_modules` source, test files, and spec documents
  - Set `asar: true` to package source files into an Electron archive
- Add `package.json` scripts: `build:win` (runs `electron-vite build` then `electron-builder --win`) and `dist` (alias for `build:win`)
- Verify the production build completes without errors by running `npm run build:win`
- Confirm the installer launches the application and both windows open on a test machine
- Document minimum system requirements in `README.md`: Windows 10+, 1920×1080 primary display recommended, HDMI output for secondary display
