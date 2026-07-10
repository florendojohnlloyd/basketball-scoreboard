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



---

## Extended Features Design (Requirements 28–36)

This section extends the existing architecture to cover Requirements 28–36. Every new service lives in the Electron **main process**, following the same pattern as the existing modules: pure logic + file I/O in the main process, state mirrored to renderers via IPC, and Zustand slices in the renderers consuming the pushed data.

### Bootstrap Order (Updated)

The updated bootstrap sequence in `index.ts` adds eight new modules after the existing six:

```
8.  RoleStore         (user accounts + RBAC)
9.  AuditStore        (append-only audit log)
10. BackupService     (zip archive backup/restore)
11. OfflineSyncService (pending-changes queue + conflict resolution)
12. CloudSyncService  (incremental TLS sync to remote endpoint)
13. OverlayServer     (WebSocket + HTTP for OBS browser source)
14. ApiServer         (Express REST API + rate limiter)
15. SocialShareService (OAuth 2.0 token management + posting)
16. MobileViewerServer (mobile web server + QR code)
```

---

### Requirement 28: User Roles and Role-Based Access Control

#### Architectural Approach

A `RoleStore` service in the main process manages user accounts and enforces RBAC. It owns a local credential store (separate `electron-store` file, JSON, bcrypt-hashed passwords) and exposes a `canPerform(role, action)` permission matrix. Every IPC command handler in `ipcRouter.ts` checks the active session's role before dispatching to `GameStore`. The renderer Control Panel has no knowledge of the raw permission table — it only knows the current user's role and renders conditionally based on that.

Sessions are held in memory only (no disk persistence for the active session). On launch, a login screen is shown before the main Control Panel is rendered.

#### New Main-Process Module: `roleStore.ts`

**Responsibilities:**
- CRUD for user accounts (stored with bcrypt hash of password)
- Role assignment and validation
- `canPerform(role: Role, action: ActionCategory): boolean` — the permission matrix
- Account lockout tracking (failed-attempt counter + lockout expiry timestamp, held in memory, cleared on unlock)
- Default Admin setup on first launch (no accounts exist)

```typescript
type Role = 'Admin' | 'Coach' | 'Scorekeeper' | 'Viewer';

type ActionCategory =
  | 'GAME_CONTROL'        // score, clock, fouls, timeouts, player stats
  | 'LIGA_CONFIG'         // create/edit/delete liga, teams, rosters
  | 'USER_MANAGEMENT'     // create/edit/delete users, role changes
  | 'DATA_EXPORT'         // PDF, Excel, CSV exports
  | 'BACKUP_RESTORE'      // backup, restore
  | 'SETTINGS_WRITE'      // app settings, API keys, cloud sync config
  | 'VIEW_STATS'          // season stats, leaderboards, box score (read)
  | 'VIEW_SCOREBOARD'     // scoreboard display, live scores (read)
  | 'AUDIT_VIEW'          // read audit log
  | 'SHARE'               // social media sharing

interface UserAccount {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;      // ISO 8601
  failedAttempts: number;
  lockedUntil: string | null; // ISO 8601 or null
}

interface RoleStore {
  listUsers(): Omit<UserAccount, 'passwordHash'>[];
  createUser(username: string, password: string, role: Role): UserAccount;
  updateUser(id: string, updates: Partial<Pick<UserAccount, 'username' | 'role'>>): void;
  changePassword(id: string, newPassword: string): void;
  deleteUser(id: string): void;      // throws if sole Admin
  authenticate(username: string, password: string): UserAccount | null;
  canPerform(role: Role, action: ActionCategory): boolean;
  validatePassword(password: string): { valid: boolean; reason?: string };
}
```

#### Permission Matrix

| ActionCategory | Admin | Scorekeeper | Coach | Viewer |
|---|:---:|:---:|:---:|:---:|
| GAME_CONTROL | ✓ | ✓ | — | — |
| LIGA_CONFIG | ✓ | — | — | — |
| USER_MANAGEMENT | ✓ | — | — | — |
| DATA_EXPORT | ✓ | ✓ | — | — |
| BACKUP_RESTORE | ✓ | — | — | — |
| SETTINGS_WRITE | ✓ | — | — | — |
| VIEW_STATS | ✓ | ✓ | ✓ | — |
| VIEW_SCOREBOARD | ✓ | ✓ | ✓ | ✓ |
| AUDIT_VIEW | ✓ | ✓ | — | — |
| SHARE | ✓ | ✓ | — | — |

#### IPC Integration

New IPC query types added to `QueryMessage` in `ipcRouter.ts`:

```typescript
| { type: 'AUTH_LOGIN'; username: string; password: string }
| { type: 'AUTH_LOGOUT' }
| { type: 'USER_LIST' }
| { type: 'USER_CREATE'; username: string; password: string; role: Role }
| { type: 'USER_UPDATE'; id: string; updates: Partial<Pick<UserAccount, 'username' | 'role'>> }
| { type: 'USER_DELETE'; id: string }
| { type: 'USER_CHANGE_PASSWORD'; id: string; newPassword: string }
```

A new IPC event `AUTH_STATE` is pushed to the Control Panel after login/logout:
```typescript
{ type: 'AUTH_STATE'; user: { id: string; username: string; role: Role } | null }
```

Every existing `SCOREBOARD_COMMAND` handler in `ipcRouter.ts` is wrapped with a role check:
```typescript
const session = sessionStore.get(event.sender.id);
if (!roleStore.canPerform(session?.role ?? 'Viewer', requiredCategory(command.type))) {
  event.sender.send(SCOREBOARD_EVENT, { type: 'ACCESS_DENIED', required: requiredCategory(command.type) });
  return;
}
```

#### New npm Packages

| Package | Version | Justification |
|---|---|---|
| `bcrypt` | `^5.1.1` | Industry-standard password hashing with configurable work factor |
| `@types/bcrypt` | `^5.0.2` | TypeScript types for bcrypt |

Password hashing uses bcrypt with `saltRounds: 12`. The credential file is stored in a dedicated `electron-store` instance (`users.json`) separate from game presets to avoid cross-contamination.

---

### Requirement 29: Data Backup and Recovery

#### Architectural Approach

A `BackupService` in the main process builds and validates `.zip` archives using the `archiver` library. The archive always contains a `manifest.json` at the root. Automatic scheduling uses `node-cron` with a configurable expression stored in `electron-store`. Restore is a read-then-validate-then-overwrite operation that ends with `app.relaunch()` + `app.exit()`.

#### New Main-Process Module: `backupService.ts`

**Responsibilities:**
- `createBackup(destinationPath: string): Promise<void>` — build zip, write manifest
- `validateArchive(archivePath: string): Promise<{ valid: boolean; error?: string }>` — verify manifest + file presence
- `restoreFromArchive(archivePath: string): Promise<void>` — extract to user-data dir, then relaunch
- `scheduleAutoBackup(config: BackupScheduleConfig): void` — register cron job
- `cancelAutoBackup(): void`

```typescript
interface BackupManifest {
  createdAt: string;         // ISO 8601
  appVersion: string;
  files: string[];           // relative paths of all included files
}

interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  destinationFolder: string;
}
```

Archive contents:
```
backup_<timestamp>.zip
├── manifest.json
├── userData/
│   ├── ligas/         (all Liga JSON files)
│   ├── gameLogs/
│   ├── presets/
│   ├── photos/        (player photos)
│   ├── users.json
│   └── auditLog.db    (or auditLog.json)
```

#### IPC Integration

```typescript
| { type: 'BACKUP_CREATE' }              // opens save dialog in main, creates archive
| { type: 'BACKUP_RESTORE' }             // opens open dialog, validates, prompts, restores
| { type: 'BACKUP_GET_SCHEDULE' }
| { type: 'BACKUP_SET_SCHEDULE'; config: BackupScheduleConfig }
```

Event pushed to Control Panel on auto-backup result:
```typescript
{ type: 'BACKUP_COMPLETE'; success: boolean; path?: string; error?: string }
{ type: 'BACKUP_DESTINATION_INACCESSIBLE'; destinationFolder: string }
```

#### New npm Packages

| Package | Version | Justification |
|---|---|---|
| `archiver` | `^7.0.1` | De-facto Node.js zip creation library; streams-based, no native deps |
| `@types/archiver` | `^6.0.3` | TypeScript types |
| `node-cron` | `^3.0.3` | Cron-expression scheduler that runs in Node without a child process |
| `unzipper` | `^0.12.3` | Extract zip archives for restore validation |

---

### Requirement 30: Offline Mode with Sync

#### Architectural Approach

An `OfflineSyncService` monitors network connectivity using Node's `dns.resolve` against a well-known host (polling every 10 seconds). Connectivity status is pushed to the Control Panel via IPC. All local operations continue uninterrupted regardless of connectivity.

When Cloud Sync is enabled, every state-changing `GameStore.dispatch()` call also writes a lightweight entry to a **pending-changes log** — a SQLite table (via `better-sqlite3`) with columns `(id, timestamp, entityType, entityId, changeType, payload)`. On reconnect, the service replays entries in timestamp order to the cloud endpoint. Conflict resolution is UI-driven: the main process sends a `SYNC_CONFLICT` event to the Control Panel, the renderer displays a modal, and the operator's choice is sent back as a `SYNC_CONFLICT_RESOLVED` command.

#### New Main-Process Module: `offlineSyncService.ts`

**Responsibilities:**
- Connectivity polling and status broadcasting
- `enqueueChange(entry: PendingChange): void` — append to SQLite pending log
- `replayPending(): Promise<void>` — transmit queued entries in order, with 3-retry/60s logic
- `handleConflict(local: SyncRecord, remote: SyncRecord): Promise<'local' | 'remote'>` — IPC round-trip to operator
- `clearSynced(ids: string[]): void` — remove successfully synced entries

```typescript
interface PendingChange {
  id: string;
  timestamp: string;       // ISO 8601
  entityType: 'gameState' | 'liga' | 'gameLog' | 'auditLog' | 'roster';
  entityId: string;
  changeType: 'create' | 'update' | 'delete';
  payload: string;         // JSON-serialized change delta
}
```

The SQLite database (`sync.db`) in user-data serves as both the pending-changes log and the last-sync checkpoint store. A single row in a `sync_meta` table holds `{ lastSyncAt: string }`.

#### IPC Integration

```typescript
// Events pushed to Control Panel
{ type: 'CONNECTIVITY_CHANGED'; online: boolean }
{ type: 'SYNC_STARTED' }
{ type: 'SYNC_COMPLETE'; recordsTransmitted: number }
{ type: 'SYNC_FAILED'; attempt: number; maxAttempts: number; error: string }
{ type: 'SYNC_CONFLICT'; local: SyncRecord; remote: SyncRecord; conflictId: string }

// Commands from Control Panel
| { type: 'SYNC_CONFLICT_RESOLVED'; conflictId: string; choice: 'local' | 'remote' }
```

#### New npm Packages

| Package | Version | Justification |
|---|---|---|
| `better-sqlite3` | `^9.6.0` | Synchronous SQLite3 bindings; ideal for append-heavy logs in Electron main process |
| `@types/better-sqlite3` | `^7.6.11` | TypeScript types |

---

### Requirement 31: Audit Logs

#### Architectural Approach

`AuditStore` wraps a `better-sqlite3` database (`audit.db` in user-data). Every write is synchronous and append-only — no `UPDATE` or `DELETE` SQL is ever issued on the `audit_log` table. A separate `audit_meta` table holds the purge-last-run timestamp. The store is injected into the IpcRouter alongside the existing services, and `ipcRouter.ts` calls `auditStore.append(entry)` after every successful state-changing dispatch.

#### New Main-Process Module: `auditStore.ts`

**Responsibilities:**
- `append(entry: AuditEntry): void` — INSERT to `audit_log` table (synchronous, non-blocking to game ops even on failure)
- `query(filter: AuditFilter): AuditEntry[]` — SELECT with optional date range, user, actionType filters
- `exportCsv(filter: AuditFilter, destinationPath: string): void`
- `purgeOldEntries(): void` — DELETE WHERE timestamp < 12 months ago; called at app launch

```typescript
interface AuditEntry {
  id: string;
  timestamp: string;       // ISO 8601 UTC
  username: string;
  role: Role;
  actionType: string;      // e.g. 'ADD_SCORE', 'ROSTER_ADD_PLAYER', 'BACKUP_CREATED'
  entityId: string;        // Liga ID, game log ID, user ID, 'GAME', etc.
  previousValue: string;   // JSON-serialized or empty string
  newValue: string;        // JSON-serialized or empty string
}

interface AuditFilter {
  fromDate?: string;       // ISO 8601
  toDate?: string;
  username?: string;
  actionType?: string;
}
```

The SQLite schema:
```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  previous_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_username   ON audit_log(username);
CREATE INDEX idx_audit_action     ON audit_log(action_type);
```

#### IPC Integration

```typescript
| { type: 'AUDIT_QUERY'; filter: AuditFilter }        // returns AuditEntry[]
| { type: 'AUDIT_EXPORT_CSV'; filter: AuditFilter }   // opens save dialog, writes CSV
```

Audit log writes are fire-and-forget inside `ipcRouter.ts` — if `auditStore.append` throws, a `AUDIT_WRITE_FAILED` event is sent to the Control Panel but the main command response is unaffected.

---

### Requirement 32: Cloud Sync

#### Architectural Approach

`CloudSyncService` wraps the Node `https` module (no extra HTTP client needed beyond what Node provides, though `node-fetch` is acceptable for ergonomics). The service reads sync configuration from `electron-store` and is disabled by default. Sync is incremental: it compares each record's `lastModified` timestamp to the stored `lastSyncAt` checkpoint in `sync.db` and transmits only newer records.

A 5-minute full-poll timer (`setInterval`) and a 30-second debounced trigger (started after any local change via `OfflineSyncService.enqueueChange`) coexist. Both feed into a single `syncQueue` that serializes operations so two syncs never run in parallel.

All HTTP requests use `https://` URLs — the endpoint configuration validator rejects `http://` URLs. Node's built-in TLS stack (OpenSSL) enforces TLS 1.2+ by default on modern Node versions bundled with Electron 30.

#### New Main-Process Module: `cloudSyncService.ts`

**Responsibilities:**
- `configure(config: CloudSyncConfig): void`
- `testConnection(): Promise<{ ok: boolean; error?: string }>`
- `syncNow(): Promise<SyncResult>`
- `startPeriodicSync(): void` / `stopPeriodicSync(): void`

```typescript
interface CloudSyncConfig {
  enabled: boolean;
  endpointUrl: string;     // must start with https://
  apiKey: string;          // stored encrypted in electron-store
}

interface SyncResult {
  success: boolean;
  recordsTransmitted: number;
  startedAt: string;
  completedAt: string;
  error?: string;
}
```

The sync payload format for each record type is a JSON envelope:
```typescript
interface SyncEnvelope {
  entityType: 'liga' | 'gameLog' | 'auditLog' | 'roster';
  entityId: string;
  lastModified: string;
  operation: 'upsert' | 'delete';
  data: unknown;           // entity-specific payload
}
```

#### IPC Integration

```typescript
| { type: 'CLOUD_SYNC_GET_CONFIG' }
| { type: 'CLOUD_SYNC_SET_CONFIG'; config: CloudSyncConfig }
| { type: 'CLOUD_SYNC_TEST_CONNECTION' }
| { type: 'CLOUD_SYNC_TRIGGER_NOW' }

// Events pushed to Control Panel
{ type: 'CLOUD_SYNC_STATUS'; status: 'idle' | 'syncing' | 'error'; lastSyncAt?: string }
{ type: 'CLOUD_SYNC_AUTH_ERROR' }
```

#### New npm Packages

No additional packages beyond `better-sqlite3` (already listed under Req 30) and Node built-ins. If a more ergonomic fetch API is preferred:

| Package | Version | Justification |
|---|---|---|
| `node-fetch` | `^3.3.2` | Ergonomic Fetch API in Node; well-maintained; used only if native `https` is too verbose |

---

### Requirement 33: Live Streaming Integration

#### Architectural Approach

`OverlayServer` runs two things in the same module: a lightweight `express` HTTP server (serves the overlay HTML page and static assets) and a `ws` WebSocket server attached to the same Node `http.Server` instance. When `GameStore` state changes, the IpcRouter calls `overlayServer.broadcast(state)`, which serializes the relevant fields and pushes to all connected WebSocket clients.

The RTMP output is handled by `fluent-ffmpeg` which spawns an `ffmpeg` child process to screen-capture the Scoreboard Display window and pipe to the RTMP endpoint. The scoreboard window's position/dimensions are read from `WindowManager`.

The overlay HTML page is a static file bundled under `resources/overlay/index.html` and served by Express from `__dirname`. It connects to `ws://localhost:<port>/ws` and updates the DOM on every received message.

#### New Main-Process Module: `overlayServer.ts`

**Responsibilities:**
- `start(port: number): Promise<void>` — bind HTTP + WebSocket server
- `stop(): Promise<void>`
- `broadcast(state: GameState): void` — push reduced state to all WS clients
- `updateConfig(config: OverlayConfig): void` — push config update to all WS clients
- `startRtmp(config: RtmpConfig): void` — spawn ffmpeg child process
- `stopRtmp(): void` — kill ffmpeg child process
- `getRtmpStatus(): RtmpStatus`

```typescript
interface OverlayConfig {
  visibleElements: {
    score: boolean; clock: boolean; period: boolean;
    teamFouls: boolean; timeouts: boolean;
  };
  fontScaleFactor: number;   // 0.5 – 2.0
  backgroundAlpha: number;   // 0.0 – 1.0
}

interface RtmpConfig {
  destinationUrl: string;    // must start with rtmp:// or rtmps://
  streamKey: string;
}

interface RtmpStatus {
  active: boolean;
  elapsedSeconds: number;
  error: string | null;
}
```

#### IPC Integration

```typescript
| { type: 'OVERLAY_START'; port: number }
| { type: 'OVERLAY_STOP' }
| { type: 'OVERLAY_GET_CONFIG' }
| { type: 'OVERLAY_SET_CONFIG'; config: OverlayConfig }
| { type: 'RTMP_START'; config: RtmpConfig }
| { type: 'RTMP_STOP' }
| { type: 'RTMP_GET_STATUS' }

// Events pushed to Control Panel
{ type: 'OVERLAY_PORT_CONFLICT'; port: number }
{ type: 'RTMP_STATUS_UPDATE'; status: RtmpStatus }
{ type: 'RTMP_RECONNECT_ATTEMPT'; attempt: number; maxAttempts: number }
{ type: 'RTMP_FAILED' }
```

#### New npm Packages

| Package | Version | Justification |
|---|---|---|
| `express` | `^4.19.2` | Minimal HTTP server with static file middleware for the overlay page |
| `@types/express` | `^4.17.21` | TypeScript types |
| `ws` | `^8.17.1` | WebSocket server; attaches to the existing `http.Server` from Express |
| `@types/ws` | `^8.5.11` | TypeScript types |
| `fluent-ffmpeg` | `^2.1.3` | Fluent API for ffmpeg child process; handles RTMP output and reconnect logic |
| `@types/fluent-ffmpeg` | `^2.1.24` | TypeScript types |

---

### Requirement 34: External REST API

#### Architectural Approach

`ApiServer` is an Express application that starts on a configurable port (default 3000). It is a **read-only** API — no endpoints mutate game state. All endpoints read from `GameStore.getState()`, the Liga file system, and the game log directory.

Authentication is Bearer-token middleware that checks the token against an in-memory set of active API Keys (loaded from `electron-store` at boot, updated immediately on key generation/revocation). Rate limiting uses the `express-rate-limit` middleware keyed by API Key value (not by IP, since all requests are local). OpenAPI 3.0 documentation is served at `/docs` using `swagger-ui-express` with a bundled spec file.

#### New Main-Process Module: `apiServer.ts`

**Responsibilities:**
- `start(port: number): Promise<void>` / `stop(): Promise<void>`
- Express route registration for all endpoints
- API Key CRUD (`generateKey`, `revokeKey`, `listKeys`) backed by `electron-store`
- Rate-limit state management (in-memory, reset on app restart)

**REST Endpoints:**

```
GET  /api/v1/game/state            Current game state (scores, clocks, period, fouls, timeouts)
GET  /api/v1/game/players          Active player stats for current game
GET  /api/v1/gamelogs?page=1       Paginated saved game logs (20/page)
GET  /api/v1/season/averages       Season averages for current Liga
GET  /docs                         OpenAPI 3.0 spec (swagger-ui-express)
```

All responses follow:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
}
```

```typescript
interface ApiKey {
  id: string;
  label: string;             // 1–50 chars
  key: string;               // UUID v4, shown once at generation
  keyHash: string;           // SHA-256 hash used for comparison at runtime
  createdAt: string;
  active: boolean;
}
```

#### IPC Integration

```typescript
| { type: 'API_START'; port: number }
| { type: 'API_STOP' }
| { type: 'API_KEY_LIST' }
| { type: 'API_KEY_GENERATE'; label: string }
| { type: 'API_KEY_REVOKE'; id: string }
| { type: 'API_GET_STATUS' }   // returns { running: boolean; port: number }

// Events
{ type: 'API_PORT_CONFLICT'; port: number }
```

#### New npm Packages

| Package | Version | Justification |
|---|---|---|
| `express-rate-limit` | `^7.3.1` | Minimal, well-maintained rate limiter middleware for Express |
| `swagger-ui-express` | `^5.0.1` | Serves OpenAPI/Swagger UI at `/docs` with zero configuration |
| `@types/swagger-ui-express` | `^4.1.6` | TypeScript types |
| `uuid` | `^10.0.0` | UUID v4 for API key generation |
| `@types/uuid` | `^10.0.0` | TypeScript types |

(`express` and `ws` are already listed under Req 33.)

---

### Requirement 35: Social Media Sharing

#### Architectural Approach

`SocialShareService` handles OAuth 2.0 flows and post dispatch for Twitter/X and Facebook. OAuth tokens are stored using Electron's `safeStorage` API (AES-256 encryption backed by the OS credential store on Windows). Token refresh is attempted silently using the stored refresh token before any share action.

The OAuth callback is received via a custom URL scheme (`ligacontrol://oauth-callback`) registered at app startup with `app.setAsDefaultProtocolClient`. When the OS opens the app with this scheme after browser authorization, the main process captures the `open-url` event and completes the PKCE exchange.

Screenshot generation uses Electron's `capturePage()` method on the scoreboard `BrowserWindow` — this works whether or not the Display Monitor is connected, since the window exists in memory. The PNG buffer is then attached to the share post via the platform API's multipart upload endpoint.

#### New Main-Process Module: `socialShareService.ts`

**Responsibilities:**
- `initiateOAuth(platform: SocialPlatform): void` — opens browser, registers PKCE state
- `handleOAuthCallback(url: string): Promise<void>` — complete code exchange, store tokens
- `generateShareText(state: GameState): string` — format game summary
- `captureScreenshot(): Promise<Buffer>` — `BrowserWindow.capturePage()` → PNG Buffer
- `sharePost(platform: SocialPlatform, text: string, imagePng?: Buffer): Promise<void>`
- `getTokenStatus(platform: SocialPlatform): 'valid' | 'expired' | 'missing'`

```typescript
type SocialPlatform = 'twitter' | 'facebook';

interface SharePost {
  platform: SocialPlatform;
  text: string;             // editable by operator before posting
  imagePng?: Buffer;        // optional screenshot attachment
}
```

Share text format (generated by `generateShareText`):
```
[LigaName] | [Date]
[HomeTeam] [HomeScore] – [AwayScore] [AwayTeam]
[Period or "Final"]
```

#### IPC Integration

```typescript
| { type: 'SHARE_GENERATE_TEXT' }                        // returns { text: string }
| { type: 'SHARE_CAPTURE_SCREENSHOT' }                   // returns { png: string } (base64)
| { type: 'SHARE_POST'; platform: SocialPlatform; text: string; attachScreenshot: boolean }
| { type: 'SHARE_OAUTH_INITIATE'; platform: SocialPlatform }
| { type: 'SHARE_TOKEN_STATUS'; platform: SocialPlatform } // returns 'valid' | 'expired' | 'missing'
| { type: 'SHARE_TOKEN_REVOKE'; platform: SocialPlatform }

// Events
{ type: 'SHARE_OAUTH_COMPLETE'; platform: SocialPlatform }
{ type: 'SHARE_OAUTH_FAILED'; platform: SocialPlatform; error: string }
{ type: 'SHARE_POST_COMPLETE'; platform: SocialPlatform; success: boolean; error?: string }
```

#### New npm Packages

No large OAuth client library is needed — the PKCE flow is straightforward with Node's `https` and `crypto` modules. Electron's `safeStorage` is a built-in API. The only addition needed is a multipart form builder for image upload:

| Package | Version | Justification |
|---|---|---|
| `form-data` | `^4.0.0` | Constructs multipart/form-data payloads for image attachment uploads to Twitter/Facebook APIs |
| `@types/form-data` | `^2.5.0` | TypeScript types |

---

### Requirement 36: Mobile-Friendly Viewer Interface

#### Architectural Approach

`MobileViewerServer` reuses the `express` + `ws` combination already present in `OverlayServer`, but as a separate server instance on a separate port (default 8081). It serves a self-contained responsive HTML page (bundled under `resources/viewer/`) that connects to its own WebSocket endpoint.

The "Scoreboard Offline" page is a static fallback served by Express's error handler when the server is stopped — Express is configured with a single `GET /*` catch-all that returns the offline HTML when the server is in a disabled state. When disabled, the server process does not bind the port at all; instead `net.createServer` briefly opens the port, immediately responds with the offline HTML, and closes the connection — keeping the user experience intact without a full Express startup.

The QR code is generated server-side using the `qrcode` package and served as a base64 PNG data URI via IPC query. The local IPv4 address is obtained via Node's `os.networkInterfaces()`.

#### New Main-Process Module: `mobileViewerServer.ts`

**Responsibilities:**
- `start(port: number): Promise<void>` / `stop(): Promise<void>`
- `broadcast(state: GameState): void` — push to all connected WS clients (reuses same pattern as `OverlayServer`)
- `getLocalUrl(): string` — `http://<localIPv4>:<port>`
- `generateQrCode(): Promise<string>` — returns base64 PNG data URI

```typescript
interface MobileViewerStatus {
  running: boolean;
  port: number;
  localUrl: string | null;
  qrCodeDataUri: string | null;
}
```

The mobile viewer WebSocket message schema reuses the same `GameState` type already pushed to renderer windows, keeping the serialization layer consistent. The viewer HTML page receives the full `GameState` and renders a subset: scores, clocks, period, team fouls, timeouts, and the box score tab.

#### IPC Integration

```typescript
| { type: 'MOBILE_VIEWER_START'; port: number }
| { type: 'MOBILE_VIEWER_STOP' }
| { type: 'MOBILE_VIEWER_GET_STATUS' }     // returns MobileViewerStatus
| { type: 'MOBILE_VIEWER_GET_QR' }         // returns { qrDataUri: string; url: string }

// Events
{ type: 'MOBILE_VIEWER_PORT_CONFLICT'; port: number }
{ type: 'MOBILE_VIEWER_STATUS_CHANGED'; status: MobileViewerStatus }
```

The `StatusBar` component in the Control Panel renderer subscribes to `MOBILE_VIEWER_STATUS_CHANGED` and renders the QR code (`<img src={qrDataUri}>`) and URL link when the server is active.

#### New npm Packages

| Package | Version | Justification |
|---|---|---|
| `qrcode` | `^1.5.4` | Generates QR codes as PNG buffers or SVG strings; zero native dependencies |
| `@types/qrcode` | `^1.5.5` | TypeScript types |

(`express` and `ws` are already listed under Req 33.)

---

### Extended Features: Correctness Properties (Requirements 28–36)

*The following properties extend the main Correctness Properties section above. They are numbered starting at 25 to avoid conflicts with Properties 1–24.*

**Property Reflection (Requirements 28–36):**
- 28.2–28.5 all test the same `canPerform` function for different role/action combinations. Rather than four separate properties, they are consolidated into one property that covers the entire permission matrix.
- 28.7 (sole Admin deletion) and 28.8 (password validation) are independent and kept separate.
- 28.10 (user persistence) and 29.1 (backup manifest) are kept separate — different systems.
- 31.1 (audit log entry completeness) and 31.7 (CSV export row count) test different aspects of the same store, kept separate.
- 32.6 (incremental sync filtering) and 30.7/8 (pending-changes ordering) are independent, kept separate.
- 34.3 (API auth) and 34.8 (rate limiting) test different middleware concerns, kept separate.

---

### Property 25: RBAC permission matrix is complete and consistent

*For any* role R and action category A, `canPerform(R, A)` SHALL return `true` if and only if R is in the set of roles authorized for A as defined in the permission matrix table; in particular, Admin SHALL be authorized for every action category, and Viewer SHALL only be authorized for `VIEW_SCOREBOARD`.

**Validates: Requirements 28.2, 28.3, 28.4, 28.5**

---

### Property 26: Deleting the sole Admin account is always rejected

*For any* list of user accounts in which exactly one account has the Admin role, attempting to delete that account SHALL return a failure result and leave the user list unchanged.

**Validates: Requirements 28.7**

---

### Property 27: Password validation accepts strong passwords and rejects weak ones

*For any* string P, `validatePassword(P)` SHALL return `valid: true` if and only if P has length ≥ 8, contains at least one uppercase letter, at least one digit, and at least one special character (any character that is not alphanumeric); otherwise it SHALL return `valid: false` with a non-empty reason string.

**Validates: Requirements 28.8**

---

### Property 28: User account store round-trip preserves all fields

*For any* valid list of `UserAccount` records (with valid usernames, hashed passwords, and roles), saving them to the credential store and then reloading the store SHALL produce a list that is deeply equal to the saved list (same accounts, same roles, same IDs, same `createdAt` values).

**Validates: Requirements 28.10**

---

### Property 29: Backup manifest lists every file included in the archive

*For any* set of application data files F, after `createBackup()` completes, the resulting archive SHALL contain a `manifest.json` whose `files` array lists every file in F (no omissions), and every file listed in the manifest SHALL be present in the archive (no phantom entries).

**Validates: Requirements 29.1, 29.10**

---

### Property 30: Restore rejects archives with missing manifest or missing files

*For any* zip archive A, `validateArchive(A)` SHALL return `valid: false` if: (a) the archive does not contain `manifest.json`, or (b) any filename listed in the manifest is not present in the archive's entries. It SHALL return `valid: true` only when the manifest is present and all listed files are found.

**Validates: Requirements 29.6, 29.9**

---

### Property 31: Pending-changes log preserves insertion order under replay

*For any* ordered sequence of `PendingChange` entries E₁, E₂, …, Eₙ enqueued while offline, when the sync service replays them, the outbound HTTP payloads SHALL be transmitted in the same chronological order (E₁ before E₂ before … before Eₙ) as determined by their `timestamp` fields.

**Validates: Requirements 30.7, 30.8**

---

### Property 32: Audit log entry contains all required fields for every state-changing operation

*For any* state-changing command dispatched through `ipcRouter.ts`, the `AuditStore` SHALL receive an `append` call with an entry containing: a non-empty `id`, a valid ISO 8601 `timestamp`, a non-empty `username`, a valid `role`, a non-empty `actionType` matching the command type, a non-empty `entityId`, and string-serialized `previousValue` and `newValue` fields.

**Validates: Requirements 31.1, 31.2**

---

### Property 33: Audit log purge removes only entries older than 12 months

*For any* collection of `AuditEntry` records with arbitrary `timestamp` values, after calling `purgeOldEntries()`, every entry whose timestamp is more than 12 months before the current UTC time SHALL be absent from the store, and every entry whose timestamp is within 12 months SHALL be present and unchanged.

**Validates: Requirements 31.5**

---

### Property 34: Audit log CSV export contains one row per filtered entry with correct headers

*For any* filtered list of `AuditEntry` records (zero or more entries), the generated CSV file SHALL contain exactly `entries.length` data rows (excluding the header row), the header row SHALL contain the field names `id`, `timestamp`, `username`, `role`, `actionType`, `entityId`, `previousValue`, `newValue`, and each data row SHALL correspond to exactly one entry in the same order as the filter result.

**Validates: Requirements 31.7**

---

### Property 35: Incremental sync transmits only records newer than the last sync checkpoint

*For any* collection of data records with arbitrary `lastModified` timestamps and any `lastSyncAt` checkpoint timestamp T, the sync payload computed by `CloudSyncService` SHALL include exactly those records whose `lastModified` > T and SHALL exclude all records whose `lastModified` ≤ T.

**Validates: Requirements 32.6**

---

### Property 36: REST API returns 401 for any request with missing or invalid API Key

*For any* endpoint path and any Authorization header value that is either absent, not in the `Bearer <key>` format, or contains a key string that does not match any active API Key, the API server SHALL respond with HTTP status 401 and a JSON body with `success: false`.

**Validates: Requirements 34.3**

---

### Property 37: Rate limiter returns 429 with Retry-After header after limit exceeded

*For any* API Key K and any sequence of N > 60 requests within a 60-second window attributed to K, the (61st) and all subsequent requests in that window SHALL receive HTTP status 429 with a `Retry-After` header containing a positive integer value representing the number of seconds until the window resets.

**Validates: Requirements 34.8**

---

### Property 38: Share text summary contains all required fields for any game state

*For any* `GameState` value (pre-game, in-game, or post-game, with arbitrary team names, scores, period, and Liga name), the string returned by `generateShareText(state)` SHALL contain all of: the Liga name, both team names, both scores as integers, and either the current period label or the string "Final" if `gamePhase` is `'post-game'`.

**Validates: Requirements 35.2**

---

### Property 39: QR code round-trip encodes the correct mobile viewer URL

*For any* valid local IPv4 address and port number in the range [1024, 65535], the QR code generated by `mobileViewerServer.generateQrCode()` SHALL encode a URL that, when decoded, exactly matches `http://<ipv4>:<port>`.

**Validates: Requirements 36.8**

---

### Extended Features: Testing Strategy (Requirements 28–36)

This section supplements the existing Testing Strategy with guidance for the eight new modules.

#### New Property-Based Tests

Each property 25–39 above maps to a fast-check test in a new test file under `src/main/__tests__/`:

| Property # | Test File | fast-check Arbitraries |
|---|---|---|
| 25 | `roleStore.test.ts` | `fc.constantFrom('Admin','Coach','Scorekeeper','Viewer')` × `fc.constantFrom(...ActionCategories)` |
| 26 | `roleStore.test.ts` | `fc.array(fc.record({...}))` filtered to exactly one Admin |
| 27 | `roleStore.test.ts` | `fc.string({ minLength: 0, maxLength: 50 })` |
| 28 | `roleStore.test.ts` | `fc.array(fc.record({ username: fc.string(), role: fc.constantFrom(...) }))` |
| 29 | `backupService.test.ts` | `fc.array(fc.string())` (file paths) |
| 30 | `backupService.test.ts` | `fc.record({ hasManifest: fc.boolean(), missingFiles: fc.array(fc.string()) })` |
| 31 | `offlineSyncService.test.ts` | `fc.array(fc.record({ timestamp: fc.date(), payload: fc.jsonValue() }))` |
| 32 | `auditStore.test.ts` | `fc.record({ actionType: fc.string(), entityId: fc.string(), ... })` |
| 33 | `auditStore.test.ts` | `fc.array(fc.record({ timestamp: fc.date() }))` with some older than 12 months |
| 34 | `auditStore.test.ts` | `fc.array(fc.record({ ...auditEntryFields }))` |
| 35 | `cloudSyncService.test.ts` | `fc.array(fc.record({ lastModified: fc.date() }))` × `fc.date()` (checkpoint) |
| 36 | `apiServer.test.ts` | `fc.string()` (invalid keys), `fc.constantFrom(...endpoints)` |
| 37 | `apiServer.test.ts` | `fc.integer(61, 200)` (request counts above limit) |
| 38 | `socialShareService.test.ts` | Arbitrary `GameState` with random team names, scores, phases |
| 39 | `mobileViewerServer.test.ts` | `fc.ipV4()` × `fc.integer(1024, 65535)` |

Minimum **100 runs** per property test (`numRuns: 100` in `fc.property` options), consistent with the existing test suite configuration.

**Tag format:**
```typescript
// Feature: basketball-scoreboard, Property {N}: {property_text}
```

#### Example-Based Unit Tests

Additional example tests required for behaviors not captured by properties:

- `roleStore.test.ts` — account lockout triggers at exactly 3 failed attempts; lockout clears after 5 minutes (mocked timer)
- `backupService.test.ts` — scheduled backup next-run date computed correctly for daily/weekly/monthly
- `offlineSyncService.test.ts` — conflict resolution retains local version on cancel
- `offlineSyncService.test.ts` — retry count capped at 3 attempts with 60-second intervals (mocked timer)
- `overlayServer.test.ts` — WebSocket client receives state update after `broadcast()` call
- `overlayServer.test.ts` — port conflict returns descriptive error (mocked `net.createServer`)
- `apiServer.test.ts` — `GET /api/v1/game/state` returns current game state with correct Content-Type header
- `apiServer.test.ts` — revoked API Key rejected within 5 seconds (in-memory set updated synchronously)
- `socialShareService.test.ts` — OAuth token stored via `safeStorage`, not plain text on disk
- `mobileViewerServer.test.ts` — "Scoreboard Offline" response served when server is stopped

#### Integration Tests

The following behaviors require a live server instance and are tested with Supertest (for HTTP) and a `ws` client (for WebSocket):

- Overlay WebSocket push arrives within 500ms of `broadcast()` call
- Mobile viewer WebSocket push arrives within 500ms of state change
- REST API paginated game log endpoint returns correct `page`/`totalPages` metadata
- Cloud Sync test-connection endpoint returns success/failure correctly (mocked HTTP server)

#### E2E Tests (Playwright additions)

New Playwright test scenarios in `e2e/scoreboard.spec.ts`:

- Login screen displayed on first launch; Admin setup flow completes successfully
- Admin can create a Scorekeeper account; Scorekeeper cannot access Liga config
- Backup created successfully; manifest file present in archive
- REST API returns current game state after score change via Control Panel
