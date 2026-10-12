# Implementation Plan: Volleyball Support

## Task Summary
Add volleyball as a fully working sport with:
- Best-of-5 sets, rally scoring (25 pts/set, 15 pts for 5th set, win by 2)
- No game clock, no shot clock, no fouls for volleyball
- 2 timeouts per set per team, 6 substitutions per set per team
- Server possession indicator (replaces basketball possession arrow)
- Conditional control panel UI (show/hide controls based on selected sport)
- TV display shows SET number (not PERIOD), hides all clocks
- TV display shows: score, team names, logos, current set, sets won, timeouts, server indicator

## Architecture Decision
The SportSelector already marks volleyball as available, but the rest of the system is hardcoded for basketball. The app will extend GameState with a `sport` field and volleyball-specific state, then conditionally render/hide controls and displays based on the current sport. The gameReducer will route volleyball commands to volleyball-specific logic while preserving the basketball implementation.

---

## Implementation Steps

- [ ] 1. **Extend types.ts with volleyball domain model**
      
      Add sport discriminator and volleyball-specific state types.
      
      **Files:**
      - `src/shared/types.ts`
      
      **Changes:**
      - Add `sport: 'basketball' | 'volleyball'` field to `GameState`
      - Add `VolleyballState` interface with: `currentSet: number`, `setsWon: { home: number; away: number }`, `timeoutsUsed: { home: number; away: number }`, `substitutionsUsed: { home: number; away: number }`, `servingTeam: 'home' | 'away' | null`, `pointsCurrentSet: { home: number; away: number }`
      - Add `volleyball?: VolleyballState` optional field to `GameState`
      - Add new command types to `CommandType` union:
        - `{ type: 'NEW_VOLLEYBALL_GAME'; clearTeams: boolean }`
        - `{ type: 'ADD_VB_POINT'; team: 'home' | 'away' }`
        - `{ type: 'SUBTRACT_VB_POINT'; team: 'home' | 'away' }`
        - `{ type: 'ADVANCE_SET' }`
        - `{ type: 'USE_VB_TIMEOUT'; team: 'home' | 'away' }`
        - `{ type: 'USE_VB_SUBSTITUTION'; team: 'home' | 'away'; playerId: string }`
        - `{ type: 'SET_SERVING_TEAM'; team: 'home' | 'away' | null }`
      
      **Verify:**
      Run `npm run build` — TypeScript must compile with no errors.

- [ ] 2. **Update gameReducer with volleyball command handlers**
      
      Add volleyball logic to gameStore.ts, keeping basketball handlers intact.
      
      **Files:**
      - `src/main/gameStore.ts`
      
      **Changes:**
      - In `DEFAULT_GAME_STATE()`, add `sport: 'basketball'` and `volleyball: undefined`
      - Add `NEW_VOLLEYBALL_GAME` case: reset state with `sport: 'volleyball'`, initialize `volleyball: { currentSet: 1, setsWon: { home: 0, away: 0 }, timeoutsUsed: { home: 0, away: 0 }, substitutionsUsed: { home: 0, away: 0 }, servingTeam: null, pointsCurrentSet: { home: 0, away: 0 } }`, set `gamePhase: 'in-game'`, hide clocks (`gameClock.running: false`, `shotClock.enabled: false`)
      - Add `ADD_VB_POINT` case: increment `volleyball.pointsCurrentSet[team]` and `state[team].score`, check win condition (25+ pts, lead by 2+ OR set 5: 15+ pts, lead by 2+), if won: increment `volleyball.setsWon[team]`, check match win (3 sets won → `gamePhase: 'post-game'`), else advance set. Create `SCORE` event.
      - Add `SUBTRACT_VB_POINT` case: decrement `volleyball.pointsCurrentSet[team]` and `state[team].score` (floor at 0)
      - Add `ADVANCE_SET` case: increment `volleyball.currentSet`, reset `pointsCurrentSet` to `{home: 0, away: 0}`, reset `timeoutsUsed` and `substitutionsUsed` to 0 for both teams, create `PERIOD_START` event with description "Set N starts"
      - Add `USE_VB_TIMEOUT` case: check `volleyball.timeoutsUsed[team] < 2`, if allowed: increment `volleyball.timeoutsUsed[team]`, create `TIMEOUT` event
      - Add `USE_VB_SUBSTITUTION` case: check `volleyball.substitutionsUsed[team] < 6`, if allowed: increment `volleyball.substitutionsUsed[team]`, toggle player active status, create `SUBSTITUTION` event
      - Add `SET_SERVING_TEAM` case: set `volleyball.servingTeam = command.team`, create `POSSESSION_CHANGE` event (reuse existing event type)
      
      **Verify:**
      Run unit tests: `npm test src/main/__tests__/gameStore.test.ts` — all existing basketball tests pass, and new volleyball reducer cases execute without errors.

- [ ] 3. **Update SportSelector to pass selected sport to control panel**
      
      Wire sport selection to App.tsx state.
      
      **Files:**
      - `src/renderer/controlPanel/App.tsx`
      - `src/renderer/controlPanel/components/SportSelector.tsx`
      
      **Changes:**
      - In `SportSelector.tsx`, change `onSelectSport: (sportId: string) => void` prop to pass the sport ID
      - In `AuthenticatedApp` (App.tsx), add `selectedSport` state: `const [selectedSport, setSelectedSport] = useState<'basketball' | 'volleyball'>('basketball')`
      - In sport-selector screen handler, call `setSelectedSport(sportId as 'basketball' | 'volleyball')` before `setScreen('liga-picker')`
      - Pass `selectedSport` down to `ControlPanel` component as prop
      
      **Verify:**
      Run `npm run dev`, select Basketball → verify flow continues. Select Volleyball → verify flow continues and `selectedSport` state is 'volleyball' (check React DevTools).

- [ ] 4. **Create VolleyballScoreTab component (control panel)**
      
      Build volleyball-specific control UI matching ScoreTab layout structure.
      
      **Files:**
      - `src/renderer/controlPanel/components/VolleyballScoreTab.tsx` (new file)
      
      **Changes:**
      - Copy `ScoreTab.tsx` as template, strip out all basketball-specific controls (shot clock, fouls, bonus, quarter controls, FGA/FGM stats)
      - Keep: team names/scores, player lists, +1 point buttons (volleyball scores 1 pt per rally), substitution button, possession buttons (relabel as "Serving"), timeout widgets, undo button, switch sides, TV button, mini scoreboard preview
      - Replace period display with "SET N" display showing `volleyball.currentSet`
      - Add "Sets Won" display: `HOME: X | AWAY: Y`
      - Replace timeout widget display: show `2 - timeoutsUsed[team]` remaining per set, no per-half tracking
      - Replace shot clock / clock displays with empty space or remove entirely
      - Update all `sendCommand()` calls to use new volleyball command types (`ADD_VB_POINT`, `USE_VB_TIMEOUT`, `USE_VB_SUBSTITUTION`, `SET_SERVING_TEAM`, `ADVANCE_SET`)
      - Add "ADVANCE SET" button (replaces "NEXT Q"), only enabled when operator manually advances (not auto on win — operator confirms)
      - Possession buttons relabeled: "◀ SERVE" and "SERVE ▶"
      - Remove: shot clock controls, foul buttons, bonus indicators, FGA/FGM/blocks/steals buttons (keep only +PT, +REB, +AST for volleyball context as generic stats)
      
      **Verify:**
      Run `npm run dev`, manually import and render VolleyballScoreTab in place of ScoreTab — all buttons render and clicking them dispatches volleyball commands (check IPC logs / Redux DevTools).

- [ ] 5. **Update ControlPanel to conditionally render ScoreTab vs VolleyballScoreTab**
      
      Route SCORE tab rendering based on sport.
      
      **Files:**
      - `src/renderer/controlPanel/App.tsx`
      
      **Changes:**
      - Import `VolleyballScoreTab`
      - In `ControlPanel` function, read `gs.sport` from store: `const sport = useControlPanelStore(s => s.gameState.sport)`
      - In SCORE tab rendering block (`if (tab === 'SCORE')`), conditionally render: `{sport === 'volleyball' ? <VolleyballScoreTab ... /> : <ScoreTab ... />}`
      - Pass same props to VolleyballScoreTab as ScoreTab (selectedPlayer, setSelectedPlayer, setShowSubModal, currentTab, onTabChange)
      
      **Verify:**
      Run `npm run dev`, start a basketball game → SCORE tab shows basketball controls. Manually change `gs.sport` to 'volleyball' in the store (via DevTools or add a temp button) → SCORE tab switches to volleyball controls with no errors.

- [ ] 6. **Update NEW_GAME / Liga matchup flow to initialize volleyball games**
      
      When sport is volleyball, dispatch NEW_VOLLEYBALL_GAME instead of NEW_GAME.
      
      **Files:**
      - `src/renderer/controlPanel/App.tsx` (matchup-picker screen)
      
      **Changes:**
      - In matchup-picker screen "START GAME" button handler, after `LOAD_LIGA_TEAMS` command, dispatch: `sendCommand({ type: selectedSport === 'volleyball' ? 'NEW_VOLLEYBALL_GAME' : 'NEW_GAME', clearTeams: false })`
      - In "TRIAL MODE" button handler (liga-picker screen), dispatch the appropriate command based on `selectedSport`
      - Ensure all game reset flows check `gs.sport` or `selectedSport` and dispatch the correct NEW_* command
      
      **Verify:**
      Run `npm run dev`, select Volleyball → start a matchup → verify `gs.sport === 'volleyball'` and `gs.volleyball` state is initialized. Control panel renders VolleyballScoreTab.

- [ ] 7. **Create VolleyballScoreboardLayout component (TV display)**
      
      Build volleyball-specific TV display layout.
      
      **Files:**
      - `src/renderer/scoreboard/components/VolleyballScoreboardLayout.tsx` (new file)
      
      **Changes:**
      - Copy `ScoreboardLayout.tsx` as template
      - Remove all clock-related widgets: game clock, shot clock, clock displays
      - Remove period display widget; replace with "SET" display showing `volleyball.currentSet`
      - Add "Sets Won" display widget: two bars or numeric counters showing `volleyball.setsWon.home` and `volleyball.setsWon.away`
      - Replace possession indicator (arrow) with "SERVING" indicator: show arrow or highlight on the serving team's side (`volleyball.servingTeam`)
      - Remove: bonus indicators, foul displays, shot clock countdown
      - Keep: team names, scores, logos, sponsor banners, timeout indicators (show `2 - timeoutsUsed` per team), pre-game and post-game screens (adjust labels: "Set" instead of "Quarter")
      - Update all widget IDs to volleyball-specific IDs (e.g., `vb-set-display`, `vb-serve-indicator`) to avoid layout store conflicts with basketball layout
      - Create volleyball-specific default layout in tvLayoutStore (or use a separate `vbLayoutStore`)
      
      **Verify:**
      Run `npm run dev`, open TV display → manually set `gs.sport = 'volleyball'` → TV display renders volleyball layout with SET display, no clocks, serving indicator visible.

- [ ] 8. **Update scoreboard App.tsx to conditionally render layout based on sport**
      
      Route TV display rendering based on sport.
      
      **Files:**
      - `src/renderer/scoreboard/App.tsx`
      
      **Changes:**
      - Import `VolleyballScoreboardLayout`
      - Read `sport` from store: `const sport = useScoreboardStore(s => s.gameState.sport)`
      - Conditionally render: `{sport === 'volleyball' ? <VolleyballScoreboardLayout /> : <ScoreboardLayout />}`
      
      **Verify:**
      Run `npm run dev`, start volleyball game → open TV display → volleyball layout renders. Switch back to basketball game → TV display shows basketball layout.

- [ ] 9. **Update mini scoreboard preview in VolleyballScoreTab**
      
      Adjust the mini preview widget to show SET and serve indicator instead of period and shot clock.
      
      **Files:**
      - `src/renderer/controlPanel/components/VolleyballScoreTab.tsx`
      
      **Changes:**
      - In mini-scoreboard widget, replace period label with "SET N"
      - Replace shot clock display with "SERVE: HOME" or "SERVE: AWAY" based on `gs.volleyball.servingTeam`
      - Remove possession arrows or repurpose them as serve indicator
      
      **Verify:**
      Run `npm run dev`, start volleyball game → mini scoreboard preview in control panel shows "SET 1" and serving team indicator.

- [ ] 10. **Update game log and event system to handle volleyball events**
       
       Ensure volleyball games can be saved and events are logged correctly.
       
       **Files:**
       - `src/main/gameStore.ts` (event creation)
       - `src/renderer/controlPanel/App.tsx` (game log save flow)
       
       **Changes:**
       - Volleyball events already use existing event types (`SCORE`, `TIMEOUT`, `SUBSTITUTION`, `POSSESSION_CHANGE`, `PERIOD_START`), so event log is compatible
       - In game log save flow (`handleSaveAndNewGame`), ensure `GameLogRecord` includes sport field if needed (optional enhancement; not strictly required if events/snapshots are self-descriptive)
       - No breaking changes needed — volleyball events integrate with existing event log system
       
       **Verify:**
       Run `npm run dev`, play a volleyball game with scoring/timeouts/subs → trigger game end → save game log → verify events are recorded correctly in the database and viewable in HISTORY tab.

- [ ] 11. **Add volleyball-specific validation and constraints**
       
       Enforce volleyball rules in the reducer (win by 2, max timeouts/subs per set).
       
       **Files:**
       - `src/main/gameStore.ts`
       
       **Changes:**
       - In `ADD_VB_POINT` case, add win condition logic:
         ```typescript
         const currentSet = state.volleyball!.currentSet
         const maxPoints = currentSet === 5 ? 15 : 25
         const homePoints = newPointsCurrentSet.home
         const awayPoints = newPointsCurrentSet.away
         const setWon = (homePoints >= maxPoints && homePoints - awayPoints >= 2) || (awayPoints >= maxPoints && awayPoints - homePoints >= 2)
         if (setWon) {
           // determine winner, increment setsWon, check match win (first to 3 sets), auto-advance set or end match
         }
         ```
       - In `USE_VB_TIMEOUT` case, block if `timeoutsUsed[team] >= 2`
       - In `USE_VB_SUBSTITUTION` case, block if `substitutionsUsed[team] >= 6`
       - In `ADVANCE_SET` case, reset `pointsCurrentSet`, `timeoutsUsed`, `substitutionsUsed` for next set
       
       **Verify:**
       Run `npm test src/main/__tests__/gameStore.test.ts` — add new unit tests for volleyball win conditions, timeout/sub limits. All tests pass.

- [ ] 12. **Test end-to-end volleyball game flow**
       
       Full integration test: sport selection → matchup → scoring → set advance → match win.
       
       **Files:**
       - Manual testing (or add E2E test in `e2e/volleyball.spec.ts`)
       
       **Changes:**
       - Launch app, select Volleyball → create liga → add 2 teams → start matchup
       - Score points for home team until 25-0 → verify set 1 won, set 2 starts, timeouts/subs reset
       - Use 2 timeouts for home → verify 3rd timeout blocked
       - Use 6 substitutions for away → verify 7th sub blocked
       - Play through 3 sets → verify match ends, post-game screen shows winner
       - Check TV display throughout: no clocks visible, SET display updates, serve indicator works, sets won tracker updates
       - Save game log → verify saved correctly, reload in HISTORY tab
       
       **Verify:**
       All flows work without errors. Volleyball game behaves as specified (rally scoring, best-of-5, win by 2, timeouts/subs per set).

---

## Verification Commands
- **Build:** `npm run build` — no TypeScript errors
- **Unit tests:** `npm test` — all tests pass (existing + new volleyball tests)
- **Dev mode:** `npm run dev` — app launches, volleyball selectable, game playable
- **E2E test:** `npm run test:e2e` — (optional) add volleyball E2E spec

## Notes
- Basketball functionality remains untouched — all basketball games continue to work as before
- Volleyball and basketball share the same team/player roster structures, event log, and game log system
- The `sport` field in GameState is the single source of truth for conditional rendering
- TV display layout uses separate widget IDs for volleyball to allow independent layout customization (operators can save different layouts for basketball vs volleyball)
- Server indicator for volleyball reuses the `possession` field in GameState (conceptually equivalent: possession = team that has the ball/serve)

