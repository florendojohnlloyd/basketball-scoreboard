# Design Document: Basketball Scoreboard

## Overview

The Basketball Scoreboard is a Windows PC desktop application built with **Electron**, **React**, and **TypeScript**. It renders two independent windows — a full-screen **Scoreboard Display** shown on a secondary monitor (TV via HDMI) and an **operator Control Panel** shown on the primary monitor. A single authoritative game state object lives in the Electron main process and is broadcast to both renderer windows via IPC, ensuring the display is always synchronized with the operator's actions.

### Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Desktop shell | **Electron 30+** | Native Windows app, multi-monitor window management, `screen` API, Web Audio API in renderer |
| UI framework | **React 18 + TypeScript** | Component model well-suited to the panel/display split; strong typing prevents state bugs |
| Build tooling | **electron-vite** | Fast HMR for development, optimized production bundles, first-class Electron + React support |
| Styling | **CSS Modules + CSS custom properties** | Scoped styles; team colors injected as CSS variables without a runtime CSS-in-JS overhead |
| State management | **Zustand (renderer)** + main-process authoritative store | Lightweight; Zustand slice mirrors the canonical state pushed from main via IPC |
| Audio | **Web Audio API** (in Control Panel renderer) | Built into Chromium; allows programmatic tone synthesis and gain control without external deps |
| Persistence | **electron-store** (JSON, encrypted-optional) | Simple key-value persistence for presets and window positions |
| Testing | **Vitest** (unit/property) + **Playwright** (E2E) | Vitest runs in Node; fast-check for property-based testing |
| PBT library | **fast-check** | Mature, TypeScript-native, integrates with Vitest |

### Key Design Decisions

1. **Main process owns state.** All game state mutations happen in the main process. Renderer windows send command messages ("ADD_SCORE", "START_CLOCK") via `ipcRenderer.send`; the main process applies the mutation, then broadcasts the new state to all renderer windows via `BrowserWindow.webContents.send`. This eliminates state divergence between windows.

2. **Clock ticks run in the main process.** Using `setInterval` in a renderer is subject to throttling when the window loses focus. A `NodeJS.Timer` in the main process is not throttled and offers better precision for the drift requirement (≤1 s per 10 min).

3. **Audio plays in the Control Panel renderer.** The `AudioContext` API is available in Electron's Chromium renderer. Buzzer sounds are triggered by IPC events received in the Control Panel renderer so that audio output routes through the PC's default audio device.

4. **Scoreboard window is chrome-free.** The scoreboard `BrowserWindow` is created with `frame: false`, `kiosk: false`, `fullscreen: true` on the target display, ensuring no OS title bar is visible.


---

## Architecture

### Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│                                                             │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────────┐  │
│  │  GameStore   │   │  ClockEngine   │   │ WindowManager│  │
│  │  (canonical  │◄──│  (game clock,  │   │ (create,     │  │
│  │   state)     │   │  shot clock)   │   │  place, move │  │
│  └──────┬───────┘   └────────────────┘   │  windows)    │  │
│         │ broadcast state                └──────────────┘  │
│         ▼                                                   │
│  ipcMain handlers (receive commands from renderers)         │
└──────────────┬────────────────────────────────┬────────────┘
               │ IPC                            │ IPC
               ▼                                ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│  Control Panel Renderer  │     │  Scoreboard Renderer      │
│                          │     │                           │
│  React UI (operator)     │     │  React UI (display)       │
│  - Score buttons         │     │  - Score display          │
│  - Clock controls        │     │  - Clock display          │
│  - Foul / timeout btns   │     │  - Period / foul counts   │
│  - Config / presets      │     │  - Timeout indicators     │
│  - AudioEngine           │     │  - Team names / logos     │
│  - MonitorSelector       │     │                           │
└──────────────────────────┘     └──────────────────────────┘
```

### IPC Channel Conventions

| Direction | Pattern | Example |
|---|---|---|
| Renderer → Main (command) | `scoreboard:command` | `{ type: 'ADD_SCORE', team: 'home', points: 3 }` |
| Main → Renderer (state push) | `scoreboard:state` | Full `GameState` snapshot |
| Main → Renderer (event) | `scoreboard:event` | `{ type: 'BUZZER_END_PERIOD' }` |
| Renderer → Main (query) | `scoreboard:query` (invoke) | `{ type: 'GET_MONITORS' }` |

All commands flow through a single channel with a discriminated union `CommandType`. The main process handles each in a command handler and emits the updated state. State snapshots are complete (not deltas) to keep renderer synchronization simple and reliable.

### State Flow Diagram

```
Operator clicks "+3 Home" in Control Panel
        │
        ▼
ipcRenderer.send('scoreboard:command', { type: 'ADD_SCORE', team: 'home', points: 3 })
        │
        ▼
Main process CommandRouter receives command
        │
        ▼
GameStore.dispatch(command) → mutates authoritative state
        │
        ├──► BrowserWindow[controlPanel].webContents.send('scoreboard:state', newState)
        │
        └──► BrowserWindow[scoreboard].webContents.send('scoreboard:state', newState)
                │
                ▼
        Both renderers receive state, update Zustand store, React re-renders
        (< 200ms round-trip on local IPC)
```


---

## Components and Interfaces

### Main Process Modules

#### `GameStore`

Holds and mutates the single canonical `GameState`. Accepts typed commands and returns the updated state. Implemented as a pure reducer to facilitate testing.

```typescript
type CommandType =
  | { type: 'ADD_SCORE'; team: 'home' | 'away'; points: 1 | 2 | 3 }
  | { type: 'SUBTRACT_SCORE'; team: 'home' | 'away' }
  | { type: 'START_GAME_CLOCK' }
  | { type: 'STOP_GAME_CLOCK' }
  | { type: 'RESET_GAME_CLOCK' }
  | { type: 'SET_GAME_CLOCK'; seconds: number }
  | { type: 'START_SHOT_CLOCK' }
  | { type: 'STOP_SHOT_CLOCK' }
  | { type: 'RESET_SHOT_CLOCK' }
  | { type: 'CLOCK_TICK'; deltaMs: number }
  | { type: 'ADD_FOUL'; team: 'home' | 'away' }
  | { type: 'SUBTRACT_FOUL'; team: 'home' | 'away' }
  | { type: 'USE_TIMEOUT'; team: 'home' | 'away'; kind: 'full' | 'twenty' }
  | { type: 'RESTORE_TIMEOUT'; team: 'home' | 'away'; kind: 'full' | 'twenty' }
  | { type: 'ADVANCE_PERIOD' }
  | { type: 'SET_TEAM_CONFIG'; team: 'home' | 'away'; config: Partial<TeamConfig> }
  | { type: 'LOAD_PRESET'; preset: GameConfig }
  | { type: 'NEW_GAME'; clearTeams: boolean }
  | { type: 'SET_SHOT_CLOCK_ENABLED'; enabled: boolean }
  | { type: 'SET_VOLUME'; level: number };

function gameReducer(state: GameState, command: CommandType): GameState;
```

#### `ClockEngine`

Manages `NodeJS.Timer` intervals for the game clock and shot clock. Sends `CLOCK_TICK` commands to `GameStore` every 100 ms when running.

```typescript
interface ClockEngine {
  startGameClock(): void;
  stopGameClock(): void;
  startShotClock(): void;
  stopShotClock(): void;
  dispose(): void;
}
```

#### `WindowManager`

Creates and positions the two `BrowserWindow` instances, handles monitor enumeration and reassignment.

```typescript
interface WindowManager {
  createWindows(): void;
  getAvailableDisplays(): Electron.Display[];
  assignScoreboardToDisplay(displayId: number): void;
  onDisplayAdded(handler: (display: Electron.Display) => void): void;
  onDisplayRemoved(handler: (display: Electron.Display) => void): void;
}
```

#### `PresetStore`

Reads and writes presets to disk using `electron-store`. Validates preset data on load.

```typescript
interface PresetStore {
  list(): Preset[];
  load(name: string): GameConfig;
  save(name: string, config: GameConfig): void;
  delete(name: string): void;
  isBuiltIn(name: string): boolean;
}
```

### Control Panel Components (React)

| Component | Responsibility |
|---|---|
| `ScorePanel` | +1/+2/+3 and -1 buttons per team, displays current score |
| `GameClockControl` | Start/Stop/Reset, manual time entry, MM:SS display |
| `ShotClockControl` | Start/Stop/Reset, duration config, enable/disable toggle |
| `PeriodControl` | Current period display, Next Period button, format selection |
| `FoulPanel` | Increment/decrement fouls per team, bonus threshold indicator |
| `TimeoutPanel` | Increment/decrement full and 20s timeouts per team |
| `TeamConfigPanel` | Name fields, color picker, logo upload |
| `MonitorSelector` | Dropdown of available displays, assignment button |
| `GameConfigPanel` | All game configuration fields, preset save/load |
| `ManualBuzzerButton` | Plays end-of-period buzzer on click |
| `VolumeControl` | Slider controlling AudioEngine gain |
| `StatusBar` | Monitor connection status, validation errors |

### Scoreboard Display Components (React)

| Component | Responsibility |
|---|---|
| `TeamSection` | Name, logo, score, foul count, BONUS indicator, timeout indicators |
| `ClockDisplay` | Game clock in MM:SS, centered between teams |
| `ShotClockDisplay` | Shot clock as whole seconds, shown/hidden based on enabled state |
| `PeriodDisplay` | Current period label (Q1, 2nd Half, OT, etc.) |
| `ScoreboardLayout` | Full-screen layout grid: home left, away right, clock center |


---

## Data Models

### `GameState`

The single canonical state object shared across all processes.

```typescript
interface GameState {
  // Game metadata
  gamePhase: 'pre-game' | 'in-game' | 'post-game';
  gameConfig: GameConfig;

  // Teams
  home: TeamState;
  away: TeamState;

  // Clocks
  gameClock: ClockState;
  shotClock: ShotClockState;

  // Period
  period: PeriodState;

  // Audio
  volume: number; // 0.0 – 1.0
}

interface TeamState {
  config: TeamConfig;
  score: number;          // >= 0
  fouls: number;          // >= 0
  timeouts: TimeoutState;
}

interface TeamConfig {
  name: string;           // 1–30 chars, non-whitespace-only
  color: string;          // CSS hex color, e.g. "#1D428A"
  logoPath: string | null;
}

interface TimeoutState {
  fullRemaining: number;  // 0 to gameConfig.fullTimeoutsPerTeam
  twentyRemaining: number; // 0 to gameConfig.twentySecTimeoutsPerTeam
}

interface ClockState {
  displayMs: number;      // current value in milliseconds
  running: boolean;
  configuredDurationMs: number;
}

interface ShotClockState {
  displayMs: number;      // current value in milliseconds
  running: boolean;
  configuredDurationSeconds: number; // 14–30
  enabled: boolean;
}

interface PeriodState {
  current: number;        // 1-indexed
  format: 'quarters' | 'halves';
  isOvertime: boolean;
  overtimeNumber: number; // 0 if not OT, 1 for first OT, etc.
}

interface GameConfig {
  periodDurationMinutes: number; // 1–60
  periodCount: 2 | 4;
  overtimeDurationMinutes: number;
  shotClockDurationSeconds: number; // 14–30
  bonusThreshold: number; // 1–10
  fullTimeoutsPerTeam: number; // 0–10
  twentySecTimeoutsPerTeam: number; // 0–10
}
```

### `Preset`

```typescript
interface Preset {
  name: string;         // 1–30 chars, unique
  config: GameConfig;
  builtIn: boolean;     // true for NBA Rules, FIBA Rules
  createdAt: string;    // ISO 8601
}
```

### Built-in Preset Values

```typescript
const NBA_RULES: GameConfig = {
  periodDurationMinutes: 12,
  periodCount: 4,
  overtimeDurationMinutes: 5,
  shotClockDurationSeconds: 24,
  bonusThreshold: 5,
  fullTimeoutsPerTeam: 7,
  twentySecTimeoutsPerTeam: 1,
};

const FIBA_RULES: GameConfig = {
  periodDurationMinutes: 10,
  periodCount: 4,
  overtimeDurationMinutes: 5,
  shotClockDurationSeconds: 24,
  bonusThreshold: 4,
  fullTimeoutsPerTeam: 5,
  twentySecTimeoutsPerTeam: 0,
};
```

### Validation Constraints

| Field | Valid Range | Rejection Condition |
|---|---|---|
| Team name | 1–30 chars | Empty, whitespace-only, or > 30 chars |
| Period duration | 1–60 minutes | Outside range |
| Period count | 2 or 4 | Any other value |
| Shot clock duration | 14–30 seconds | Outside range |
| Bonus threshold | 1–10 | Outside range |
| Full timeouts | 0–10 | Outside range |
| 20-second timeouts | 0–10 | Outside range |
| Game clock manual set | 00:00–60:00 | Outside range or non-integer seconds |
| Preset name | 1–30 chars, unique | Empty, > 30 chars, duplicate (with confirmation) |
| Volume | 0.0–1.0 | Outside range |


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property Reflection:** After reviewing all testable criteria in the prework, the following consolidations were made:
- Properties 7 (foul decrement disabled) and 11 (timeout decrement disabled) are identical in structure to Property 3 (score subtract disabled) — all three are combined into a single "counter decrement boundary" family, but kept separate because they test distinct counters and state paths.
- Property 6 (shot clock reset) is structurally identical to Property 4 (game clock reset) — both are kept because they test independent clock subsystems.
- Properties 14 (cancel preserves state) and 15 (New Game preserves team config) are closely related but test different aspects of New Game behavior — kept separate.
- Properties 8 (volume) and WCAG contrast (11.2) are kept separate since they test different pure functions.

---

### Property 1: Team name validation accepts valid names and rejects invalid ones

*For any* string, the team name validator SHALL accept it if and only if its trimmed length is between 1 and 30 characters inclusive and it is not composed entirely of whitespace.

**Validates: Requirements 2.3**

---

### Property 2: Score subtract button is disabled when and only when score is zero

*For any* non-negative integer score value, the subtract button for that team SHALL be disabled when the score is 0 and enabled when the score is greater than 0.

**Validates: Requirements 3.4**

---

### Property 3: Game clock reset returns to configured period duration

*For any* game clock state (running or stopped, any displayed time) and any configured period duration in the valid range, after a reset command the game clock value SHALL equal the configured period duration and the clock SHALL be stopped.

**Validates: Requirements 4.4**

---

### Property 4: Game clock stop freezes the displayed value

*For any* running game clock at any time value T, after a stop command the clock SHALL hold exactly at value T and SHALL NOT decrement further until a start command is issued.

**Validates: Requirements 4.3**

---

### Property 5: Game clock manual set accepts valid values and rejects invalid ones

*For any* integer seconds value S, the manual-set command SHALL succeed and update the clock to S when S is in [0, 3600] (0:00–60:00), and SHALL be rejected with an error when S is outside that range.

**Validates: Requirements 4.6**

---

### Property 6: Game clock display is always formatted as MM:SS

*For any* valid clock value in milliseconds, the formatted display string SHALL match the pattern `MM:SS` where MM and SS are zero-padded integers, MM is in [00, 60], and SS is in [00, 59].

**Validates: Requirements 4.7**

---

### Property 7: Shot clock reset returns to configured duration

*For any* shot clock state and any configured duration in [14, 30] seconds, after a reset command the shot clock value SHALL equal the configured duration in seconds and the clock SHALL be stopped.

**Validates: Requirements 5.2**

---

### Property 8: Shot clock duration configuration accepts valid values and rejects invalid ones

*For any* integer seconds value S, the shot clock duration configuration SHALL accept S when S is in [14, 30] and SHALL reject S when S is outside [14, 30].

**Validates: Requirements 5.4**

---

### Property 9: Shot clock display shows whole seconds only

*For any* shot clock internal millisecond value V, the displayed value SHALL be `Math.ceil(V / 1000)` as a whole integer with no decimal or fractional part shown.

**Validates: Requirements 5.5**

---

### Property 10: Period advance increments period and resets game clock

*For any* valid game state where the current period is less than the maximum configured period count, after an advance-period command the period counter SHALL be exactly one greater than before and the game clock SHALL be reset to the configured period duration.

**Validates: Requirements 6.2, 7.3**

---

### Property 11: Period label format is correct for all valid period numbers

*For any* period number N in [1, configured period count] and game format (quarters or halves), the period label SHALL be "Q{N}" for quarters and "{ordinal} Half" for halves; for any overtime period OT number K ≥ 1, the label SHALL be "OT" when K = 1 and "{K}OT" when K > 1.

**Validates: Requirements 6.3, 6.7**

---

### Property 12: Foul decrement button is disabled when and only when foul count is zero

*For any* non-negative integer foul count, the decrement button for that team's fouls SHALL be disabled when the count is 0 and enabled when the count is greater than 0.

**Validates: Requirements 7.2**

---

### Property 13: BONUS indicator is shown when and only when foul count meets or exceeds the bonus threshold

*For any* non-negative integer foul count F and any bonus threshold T in [1, 10], the BONUS indicator SHALL be displayed when F ≥ T and SHALL NOT be displayed when F < T.

**Validates: Requirements 7.5**

---

### Property 14: Bonus threshold configuration accepts valid values and rejects invalid ones

*For any* integer threshold value T, the bonus threshold configuration SHALL accept T when T is in [1, 10] and SHALL reject T when T is outside [1, 10].

**Validates: Requirements 7.6**

---

### Property 15: Timeout count configuration accepts values in valid range

*For any* integer value V, the timeout count configuration (full or 20-second) SHALL accept V when V is in [0, 10] and SHALL reject V when V is outside [0, 10].

**Validates: Requirements 8.1**

---

### Property 16: Timeout decrement disabled at zero; increment disabled at configured maximum

*For any* remaining timeout count R and configured maximum M (both in [0, 10]), the decrement button SHALL be disabled when R = 0 and the increment button SHALL be disabled when R = M.

**Validates: Requirements 8.3, 8.4**

---

### Property 17: Timeout indicator rendering reflects remaining and total counts

*For any* remaining count R and maximum M where 0 ≤ R ≤ M ≤ 10, the rendered timeout indicators SHALL show exactly R filled indicators and exactly (M − R) unfilled indicators.

**Validates: Requirements 8.5**

---

### Property 18: Preset save and load is a round trip

*For any* valid `GameConfig` value C, saving it as a preset with a valid unique name and then loading that preset SHALL produce a `GameConfig` that is deeply equal to C.

**Validates: Requirements 9.4**

---

### Property 19: Preset name validation accepts valid names and rejects invalid or duplicate names

*For any* string S and set of existing preset names E, the preset name validator SHALL accept S when S has trimmed length in [1, 30] and S is not in E, and SHALL reject S when S is empty, whitespace-only, longer than 30 characters, or already in E.

**Validates: Requirements 9.3**

---

### Property 20: New Game reset clears all dynamic counters to initial configured values

*For any* game state (arbitrary scores, fouls, period, timeouts, clock values), after a confirmed New Game command all scores SHALL be 0, all foul counts SHALL be 0, the period counter SHALL be 1, all timeout counts SHALL equal their configured maxima, and all clocks SHALL equal their configured durations.

**Validates: Requirements 10.1**

---

### Property 21: Cancelling New Game leaves game state completely unchanged

*For any* game state S, initiating a New Game then cancelling the confirmation dialog SHALL leave the game state identical to S.

**Validates: Requirements 10.3**

---

### Property 22: New Game preserves team configuration and game settings

*For any* team configuration (names, colors, logo paths) and `GameConfig`, after a confirmed New Game the team configuration and `GameConfig` values SHALL be identical to those before the reset.

**Validates: Requirements 10.4**

---

### Property 23: WCAG AA contrast is met for any configured team accent color

*For any* CSS hex color C chosen as a team accent color, the system SHALL derive a text foreground color such that the contrast ratio between the text and background meets at least 4.5:1 as computed by the WCAG relative luminance formula.

**Validates: Requirements 11.2**

---

### Property 24: Volume control maps level to audio gain linearly

*For any* volume level V in [0.0, 1.0], setting the volume SHALL update the `AudioContext` gain node's gain value to V.

**Validates: Requirements 12.4**


---

## Error Handling

### Monitor Disconnection

When Electron's `screen.on('display-removed')` fires:

1. The `WindowManager` detects the event within its next poll cycle (≤5 seconds via a 1-second heartbeat on the secondary display's bounds).
2. If the removed display was hosting the scoreboard window, the main process emits a `DISPLAY_DISCONNECTED` event to the Control Panel renderer.
3. The Control Panel renders a persistent `StatusBar` alert: "Display monitor disconnected — scoreboard is no longer visible."
4. The scoreboard `BrowserWindow` reference is retained but the window is hidden. The operator can reassign to a new display once reconnected.

### Single Monitor at Launch

If `screen.getAllDisplays()` returns exactly one display at startup, the `WindowManager` creates the scoreboard window off-screen (at coordinates the size of the primary monitor to the right) and the Control Panel's `MonitorSelector` is disabled with a status message.

### Audio Device Unavailable

The `AudioEngine` wraps `AudioContext` creation in a try/catch. If construction fails or the `AudioContext` enters `suspended` state and resume fails:

1. A flag `audioAvailable: false` is set in component state.
2. A non-blocking warning toast is shown in the Control Panel.
3. All audio playback calls become no-ops. The application continues normally.

### Team Logo File Errors

If the operator selects a logo file that is not a recognized image format (JPEG, PNG, GIF, WebP, SVG) or the file cannot be read:

1. The main process catches the file I/O error.
2. An `IPC_ERROR` event is sent to the Control Panel renderer with message: "Logo file could not be loaded. Unsupported format or file is unreadable."
3. The `TeamConfig.logoPath` remains `null`; the scoreboard continues without a logo.

### Corrupted Preset Files

On preset list load, each preset file is validated against the `GameConfig` JSON schema. If validation fails:

1. The `PresetStore` removes the corrupted entry from the in-memory list.
2. An error message is sent to the Control Panel: "Preset '{name}' could not be loaded and has been removed."
3. The built-in presets (NBA Rules, FIBA Rules) are embedded in the application bundle and are never read from disk, so they are immune to corruption.

### Input Validation Errors

All validation errors in the Control Panel are shown inline next to the relevant field using a red border and text message. The following conditions prevent game start:

- Either team name is empty or whitespace-only.
- Period duration is outside [1, 60] minutes.
- Shot clock duration is outside [14, 30] seconds.
- Bonus threshold is outside [1, 10].

### Clock Drift Management

The `ClockEngine` uses the "expected minus actual" pattern: each `setInterval` callback computes `drift = actualElapsed − expectedElapsed` and adjusts the next interval accordingly, keeping cumulative drift well within the 1 s / 10 min requirement.

```typescript
// Pseudo-code for drift-compensated tick
const expectedInterval = 100; // ms
let lastTickTime = Date.now();

setInterval(() => {
  const now = Date.now();
  const actual = now - lastTickTime;
  lastTickTime = now;
  store.dispatch({ type: 'CLOCK_TICK', deltaMs: actual });
}, expectedInterval);
```


---

## Testing Strategy

### Overview

Testing uses a **dual-layer approach**: property-based tests for universal logic properties and example-based unit/integration tests for specific behaviors. Both layers are run with **Vitest**. Property-based tests use **fast-check**.

```
src/
  main/
    __tests__/
      gameReducer.test.ts      ← property + example (pure reducer)
      clockEngine.test.ts      ← example + integration (clock behavior)
      presetStore.test.ts      ← property + example (preset CRUD)
      windowManager.test.ts    ← example (Electron mocked)
  renderer/
    controlPanel/
      __tests__/
        ScorePanel.test.tsx    ← example (button interactions)
        ClockDisplay.test.ts   ← property (format function)
        validation.test.ts     ← property (validation functions)
        AudioEngine.test.ts    ← example (Web Audio API mocked)
    scoreboard/
      __tests__/
        TimeoutIndicator.test.tsx  ← property (indicator count)
        periodLabel.test.ts        ← property (label formatting)
e2e/
  scoreboard.spec.ts           ← Playwright E2E (full flow)
```

### Property-Based Tests

Each property-based test maps directly to a Correctness Property in this document. Tests use fast-check's `fc.assert(fc.property(...))` with a minimum of **100 runs** (fast-check default is 100; configured via `numRuns: 100` in `fc.property` options).

**Tag format used in test comments:**
```
// Feature: basketball-scoreboard, Property {N}: {property_text}
```

**Example property test:**

```typescript
// Feature: basketball-scoreboard, Property 1: Team name validation
import * as fc from 'fast-check';
import { validateTeamName } from '../validation';

test('accepts valid names and rejects invalid names', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 0, maxLength: 50 }),
      (name) => {
        const result = validateTeamName(name);
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed.length > 30) {
          expect(result.valid).toBe(false);
        } else {
          expect(result.valid).toBe(true);
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

**Properties to implement as property-based tests:**

| Property # | Test File | fast-check Arbitraries |
|---|---|---|
| 1 | `validation.test.ts` | `fc.string()` |
| 2 | `gameReducer.test.ts` | `fc.nat()` (score values) |
| 3 | `gameReducer.test.ts` | `fc.record({ running: fc.boolean(), displayMs: fc.nat(), durationMs: fc.integer(60000, 3600000) })` |
| 4 | `gameReducer.test.ts` | `fc.integer(0, 3600000)` (ms values) |
| 5 | `gameReducer.test.ts` | `fc.integer(-100, 3700)` (seconds, some invalid) |
| 6 | `clockDisplay.test.ts` | `fc.integer(0, 3600000)` |
| 7 | `gameReducer.test.ts` | `fc.integer(14, 30)` + arbitrary shot clock state |
| 8 | `validation.test.ts` | `fc.integer(0, 50)` (some invalid) |
| 9 | `clockDisplay.test.ts` | `fc.integer(0, 30000)` (ms) |
| 10 | `gameReducer.test.ts` | Arbitrary period state |
| 11 | `periodLabel.test.ts` | `fc.integer(1, 4)`, `fc.oneof(fc.constant('quarters'), fc.constant('halves'))`, `fc.integer(0, 10)` |
| 12 | `gameReducer.test.ts` | `fc.nat()` (foul counts) |
| 13 | `gameReducer.test.ts` | `fc.nat()` × `fc.integer(1, 10)` |
| 14 | `validation.test.ts` | `fc.integer(-5, 15)` |
| 15 | `validation.test.ts` | `fc.integer(-5, 15)` |
| 16 | `gameReducer.test.ts` | `fc.integer(0, 10)` × `fc.integer(0, 10)` (R ≤ M) |
| 17 | `TimeoutIndicator.test.tsx` | `fc.integer(0, 10)` × `fc.integer(0, 10)` (R ≤ M) |
| 18 | `presetStore.test.ts` | `fc.record({ periodDurationMinutes: fc.integer(1,60), ... })` |
| 19 | `presetStore.test.ts` | `fc.string()` × `fc.array(fc.string())` |
| 20 | `gameReducer.test.ts` | Arbitrary full `GameState` |
| 21 | `gameReducer.test.ts` | Arbitrary full `GameState` |
| 22 | `gameReducer.test.ts` | Arbitrary full `GameState` |
| 23 | `validation.test.ts` | `fc.hexaString({ minLength: 6, maxLength: 6 })` (hex colors) |
| 24 | `AudioEngine.test.ts` | `fc.float({ min: 0, max: 1 })` |

### Example-Based Unit Tests

These cover specific scenarios not captured by universal properties:

- Game clock auto-stops and fires buzzer at 00:00
- Shot clock auto-stops, holds at 0, fires distinct buzzer at 0
- Period advance stops running clock and notifies operator
- OT period offered when scores are tied at end of regulation
- Confirmation dialog shown when advancing past final period with unequal scores
- Monitor selector disabled with single display
- Monitor disconnection alert appears in Control Panel
- New Game confirmation dialog appears before reset
- New Game with clear-team-names option clears both name fields
- Built-in presets cannot be deleted or overwritten
- Corrupted preset removed from list with error message
- Team logo error shows message, continues without logo
- Manual buzzer button triggers end-of-period sound
- Audio unavailable warning shown, app continues
- Team color applied as CSS custom property on scoreboard

### Integration / E2E Tests (Playwright)

Key E2E flows:

1. **Full game flow**: Launch → configure teams → start game → add scores → advance periods → new game
2. **Dual-window sync**: Score change in Control Panel reflects on Scoreboard within 200 ms (measured with `performance.now()`)
3. **Clock precision**: Game clock runs for 60 seconds of wall time; verify displayed value is within ±1 second of expected
4. **Preset round-trip**: Create preset, reload app, load preset, verify all fields match
5. **Monitor assignment**: Mock secondary display, assign, verify scoreboard moves to display bounds

### Test Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',    // renderer tests
    // main-process tests run in 'node' environment via separate config
  },
});
```

Fast-check is configured project-wide to use a fixed seed in CI environments for reproducibility:

```typescript
// vitest.setup.ts
import * as fc from 'fast-check';
if (process.env.CI) {
  fc.configureGlobal({ seed: 42 });
}
```

