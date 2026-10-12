# Implementation Plan: Volleyball UI Components

## Context Summary

**Backend Status**: ✅ COMPLETE — All volleyball commands and state types are implemented in types.ts:
- `VolleyballState` interface with currentSet, setsWon, timeoutsUsed, substitutionsUsed, servingTeam, pointsCurrentSet
- Commands: NEW_VOLLEYBALL_GAME, ADD_VB_POINT, SUBTRACT_VB_POINT, ADVANCE_SET, USE_VB_TIMEOUT, USE_VB_SUBSTITUTION, SET_SERVING_TEAM
- `GameState.sport` field: 'basketball' | 'volleyball'
- `GameState.volleyball?: VolleyballState`

**What Needs to be Built**: Only UI components. The backend reducer and state management are done.

**Key Design Requirements** (from AGENTS.md):
- Dark background: #0c0f14, #141820
- LED amber (#ffcc00) for scores/numeric displays
- Buttons: min 64px height, color-coded:
  - Green (#2d9420): +1 point actions
  - Red (#c03010): subtract/dangerous
  - Amber (#b06010): serve indicator
  - Purple (#6b3fa0): ADVANCE SET
  - Teal (#17a2b8): substitutions
- Orbitron font for LED displays
- No scrollbars (fit in 100vh)
- Team colors: Blue border home (#1a4fd6), Red border away (#c0392b)

---

## Implementation Steps

- [ ] 1. **Create VolleyballScoreTab.tsx — Control Panel UI**
      
      File: `src/renderer/controlPanel/components/VolleyballScoreTab.tsx`
      
      Copy structure from `ScoreTab.tsx` but adapt for volleyball rules:
      - **Remove**: game clock, shot clock, fouls/bonus displays, period selector buttons (NEXT Q), possession buttons, REPLAY button
      - **Keep**: player lists (home/away), SUB button, UNDO button, SWITCH button, TV button (📺 in tab bar — NOT duplicated here), mini scoreboard preview, team labels/scores, HORN button, RESET button
      - **Add volleyball-specific elements**:
        - SET display (currentSet) — LED amber style, large
        - Sets Won bar (home.setsWon / away.setsWon) — visual dots or numbers, 0-3 range
        - Serving team indicator with SET_SERVING_TEAM button (amber color #b06010)
        - +1 point buttons for each team (ADD_VB_POINT) — green (#2d9420)
        - -1 point buttons (SUBTRACT_VB_POINT) — red (#c03010)
        - Timeouts remaining display (2 - timeoutsUsed) with USE_VB_TIMEOUT button
        - Substitutions remaining (6 - substitutionsUsed) — display only, actual sub action uses existing SUB button
        - ADVANCE SET button (purple #6b3fa0)
      - Mini scoreboard preview: show 'SET N' instead of period, show 'SERVE: HOME/AWAY' instead of shot clock
      - Use fixed layout (not EditableWidget drag system) — simpler and more reliable
      - Props: same as ScoreTab (selectedPlayer, setSelectedPlayer, setShowSubModal, currentTab, onTabChange)
      - Import: useControlPanelStore, sendCommand, formatClockDisplay (not used but keep for consistency)
      
      Verify: `npm run dev` — control panel opens, volleyball tab renders without errors, buttons are clickable

- [ ] 2. **Update App.tsx (control panel) — Sport Selection and Conditional Rendering**
      
      File: `src/renderer/controlPanel/App.tsx`
      
      Changes needed:
      a. Add state to track selected sport:
         ```typescript
         const [selectedSport, setSelectedSport] = useState<'basketball' | 'volleyball'>('basketball')
         ```
      
      b. Update sport-selector screen:
         - SportSelector already shows volleyball as available and calls `onSelectSport(sportId)`
         - Capture sportId in the selectedSport state BEFORE navigating to liga-picker:
         ```typescript
         <SportSelector onSelectSport={(sportId) => { 
           setSelectedSport(sportId as 'basketball' | 'volleyball'); 
           setScreen('liga-picker'); 
         }} />
         ```
      
      c. Update NEW_GAME dispatch logic (in "TRIAL MODE" button and matchup-picker):
         - Use NEW_VOLLEYBALL_GAME when selectedSport === 'volleyball'
         - Use NEW_GAME when selectedSport === 'basketball'
         Example:
         ```typescript
         sendCommand({ 
           type: selectedSport === 'volleyball' ? 'NEW_VOLLEYBALL_GAME' : 'NEW_GAME', 
           clearTeams: false 
         })
         ```
      
      d. Import VolleyballScoreTab at top:
         ```typescript
         import { VolleyballScoreTab } from './components/VolleyballScoreTab'
         ```
      
      e. In ControlPanel component, read sport from game state:
         ```typescript
         const sport = useControlPanelStore(s => s.gameState.sport)
         ```
      
      f. In SCORE tab block, conditionally render based on sport:
         ```typescript
         {tab === 'SCORE' && (
           sport === 'volleyball' 
             ? <VolleyballScoreTab selectedPlayer={selectedPlayer} setSelectedPlayer={setSelectedPlayer} setShowSubModal={setShowSubModal} currentTab={tab} onTabChange={setTab} />
             : <ScoreTab selectedPlayer={selectedPlayer} setSelectedPlayer={setSelectedPlayer} setShowSubModal={setShowSubModal} currentTab={tab} onTabChange={setTab} />
         )}
         ```
      
      Verify: `npm run dev` — select volleyball in sport selector, start a game, control panel shows volleyball UI with correct buttons and displays

- [ ] 3. **Create VolleyballScoreboardLayout.tsx — TV Display Component**
      
      File: `src/renderer/scoreboard/components/VolleyballScoreboardLayout.tsx`
      
      Based on ScoreboardLayout.tsx but volleyball-specific:
      - **Remove**: game clock widget, shot clock widget, period label
      - **Keep**: team names, team scores (use home.score/away.score — these are populated by ADD_VB_POINT), team logos, sponsor area, edit mode toggle, fullscreen toggle
      - **Add volleyball-specific widgets**:
        - SET N display (large, center) — read from gs.volleyball.currentSet
        - Sets Won indicators (home/away setsWon as dots or numbers) — visual representation, 0-3 range
        - Serving team indicator (triangle/arrow pointing to serving team) — read gs.volleyball.servingTeam
        - Timeouts remaining per team (2 - gs.volleyball.timeoutsUsed.home/away)
      - Use FIXED layout (not EditableWidget) — clean, simple, reliable for volleyball
      - Dark background (#0c0f14), LED amber scores (#ffcc00), Orbitron font for numbers
      - Structure: Return early if sport !== 'volleyball' with a message or fallback
      - Import: useScoreboardStore, getImageUrl, formatClockDisplay (not used but available)
      
      Verify: `npm run dev`, start volleyball game, click TV button (📺) — scoreboard window opens showing volleyball layout with SET, sets won, serving indicator, timeouts

- [ ] 4. **Update Scoreboard App.tsx — Conditional Rendering Based on Sport**
      
      File: `src/renderer/scoreboard/App.tsx`
      
      Currently it just renders `<ScoreboardLayout />` with no sport awareness.
      
      Changes:
      a. Import useScoreboardStore:
         ```typescript
         import { useScoreboardStore } from './store'
         ```
      
      b. Import VolleyballScoreboardLayout:
         ```typescript
         import VolleyballScoreboardLayout from './components/VolleyballScoreboardLayout'
         ```
      
      c. Read sport from store:
         ```typescript
         const sport = useScoreboardStore(s => s.gameState.sport)
         ```
      
      d. Conditionally render:
         ```typescript
         return sport === 'volleyball' 
           ? <VolleyballScoreboardLayout /> 
           : <ScoreboardLayout />
         ```
      
      Verify: `npm run dev`, start volleyball game, open TV display — VolleyballScoreboardLayout renders; start basketball game, open TV display — ScoreboardLayout renders

- [ ] 5. **Final Integration Test — End-to-End Volleyball Workflow**
      
      Test the complete volleyball flow:
      1. Start app with `npm run dev`
      2. Select "Volleyball" in sport selector
      3. Create or load a liga
      4. Select teams and start a volleyball game
      5. Control panel shows VolleyballScoreTab with:
         - SET display showing "1"
         - +1 point buttons for home/away (green)
         - -1 point buttons (red)
         - Serving team button (amber)
         - Sets won: 0 - 0
         - Timeouts: 2/2 remaining
         - ADVANCE SET button (purple)
      6. Click +1 for home — score updates in mini preview
      7. Click TV button (📺) — scoreboard window opens
      8. Scoreboard shows:
         - Team names and logos
         - SET 1 (large, center)
         - Scores in LED amber
         - Sets won: 0 - 0
         - Serving indicator
         - Timeouts remaining
      9. Back in control panel, add points until 25
      10. Click ADVANCE SET — currentSet becomes 2, pointsCurrentSet resets, setsWon increments
      11. Scoreboard updates live via IPC
      12. Use timeout — timeoutsUsed increments, display updates
      13. Click SWITCH — teams swap sides
      14. Click RESET — confirm new volleyball game starts fresh
      
      All commands dispatch correctly, state updates, UI reflects changes.
      
      Verify: Complete workflow test passes, no console errors, volleyball game plays correctly from start to finish

---

## Technical Notes

- **No backend changes needed** — all commands (NEW_VOLLEYBALL_GAME, ADD_VB_POINT, SUBTRACT_VB_POINT, ADVANCE_SET, USE_VB_TIMEOUT, USE_VB_SUBSTITUTION, SET_SERVING_TEAM) already exist and are handled by the reducer in main process
- **State structure** — GameState.volleyball is populated when sport === 'volleyball', contains: currentSet, setsWon {home, away}, timeoutsUsed {home, away}, substitutionsUsed {home, away}, servingTeam ('home'|'away'|null), pointsCurrentSet {home, away}
- **IPC flow** — Control panel dispatches commands via sendCommand() → main process reducer updates GameState → broadcasts to scoreboard via SCOREBOARD_STATE channel → scoreboard store updates → UI re-renders
- **CSS variables** — Use theme.css variables (--led-amber, --btn-green, --btn-switch, etc.) for all styling, never hardcode colors
- **Fixed layout for volleyball** — Unlike basketball's EditableWidget drag system, volleyball UI uses simpler fixed CSS Grid/Flexbox layout for faster implementation and better reliability
- **Mini scoreboard preview** — Essential operator feedback; must show SET number and serving indicator so operator doesn't need to look at TV screen
- **TV button** — Already exists in tab bar, do NOT duplicate in VolleyballScoreTab
- **Player substitutions** — Volleyball tracks substitutions per set (6 max), but the UI action uses the existing SUB button/modal; just display the count "6 - substitutionsUsed"
- **Undo support** — Keep UNDO button, it works via existing UNDO command (last action reversal)

---

## Design Specs

### VolleyballScoreTab Layout (Control Panel)

```
┌─────────────────────────────────────────────────────────────┐
│ TAB BAR: [SCORE] ROSTER BRANDING ... SETTINGS  [📺 TV] [EDIT]│
├─────────────────────────────────────────────────────────────┤
│  HOME TEAM              SET 1           AWAY TEAM            │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐         │
│  │ SCORE   │        │   SET   │        │  SCORE  │         │
│  │   15    │        │    1    │        │   12    │         │
│  └─────────┘        └─────────┘        └─────────┘         │
│                                                              │
│  Sets Won: ⚫⚫⚪      SERVING: HOME      Sets Won: ⚫⚪⚪      │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ +1 HOME    │  │ SET SERVE  │  │ +1 AWAY    │           │
│  │  (GREEN)   │  │  (AMBER)   │  │  (GREEN)   │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ -1 HOME    │  │ADVANCE SET │  │ -1 AWAY    │           │
│  │   (RED)    │  │  (PURPLE)  │  │   (RED)    │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                              │
│  HOME PLAYERS           CONTROLS           AWAY PLAYERS     │
│  #12 Player A   25pts   ┌─────────┐       #5 Player X  18pts│
│  #8  Player B   10pts   │  HORN   │       #9 Player Y  12pts│
│  #4  Player C    8pts   │ (PURPLE)│       #11 Player Z 8pts │
│  #15 Player D    2pts   └─────────┘       #7 Player W  5pts │
│  #3  Player E    0pts   ┌─────────┐       #2 Player V  0pts │
│                          │  SUB    │                          │
│  ┌──────────────────┐   │ (TEAL)  │   ┌──────────────────┐  │
│  │ Timeouts:  2/2   │   └─────────┘   │ Timeouts:  2/2   │  │
│  │ Subs Rem:  6/6   │   ┌─────────┐   │ Subs Rem:  6/6   │  │
│  └──────────────────┘   │ SWITCH  │   └──────────────────┘  │
│                          │  (RED)  │                          │
│                          └─────────┘                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          MINI SCOREBOARD PREVIEW                     │   │
│  │  HOME 15  │  SET 1  │  SERVE: HOME  │  12 AWAY      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │  UNDO   │  │  RESET  │  │  HORN   │  │  (other)│       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### VolleyballScoreboardLayout (TV Display)

```
┌───────────────────────────────────────────────────────────┐
│                    VOLLEYBALL SCOREBOARD                  │
│                                                           │
│   ┌──────────────┐         SET 1         ┌──────────────┐│
│   │              │                        │              ││
│   │  HOME LOGO   │      ⚫ ⚫ ⚪         │  AWAY LOGO   ││
│   │              │                        │              ││
│   └──────────────┘                        └──────────────┘│
│                                                           │
│      HOME TEAM           ◄ SERVE           AWAY TEAM      │
│                                                           │
│   ┌──────────────┐                        ┌──────────────┐│
│   │              │                        │              ││
│   │      15      │                        │      12      ││
│   │              │                        │              ││
│   └──────────────┘                        └──────────────┘│
│                                                           │
│   Timeouts: 2                              Timeouts: 2   │
│                                                           │
│   ┌─────────────────────────────────────────────────────┐│
│   │              SPONSOR LOGOS AREA                     ││
│   └─────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

---

## Success Criteria

✅ **Step 1 Complete**: VolleyballScoreTab.tsx created, imports correctly, renders in control panel
✅ **Step 2 Complete**: Sport selection works, NEW_VOLLEYBALL_GAME dispatches when volleyball selected
✅ **Step 3 Complete**: VolleyballScoreboardLayout.tsx created, renders volleyball-specific widgets
✅ **Step 4 Complete**: Scoreboard App.tsx conditionally renders correct layout based on sport
✅ **Step 5 Complete**: Full workflow test passes — volleyball game can be played start to finish with all features working

**Definition of Done**: User can select volleyball, start a game, score points, advance sets, use timeouts, see live updates on TV display, and complete a full match following volleyball rules.
