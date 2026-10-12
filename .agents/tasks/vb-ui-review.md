# Volleyball UI Implementation

Complete volleyball control panel and TV scoreboard with rally-point scoring, set tracking, serving indicators, timeouts, and substitutions.

This change adds a full volleyball module to LigaControl, distinct from basketball. The control panel (VolleyballScoreTab) provides score controls (+1/-1), serving team selector, timeout tracking (2 per set), substitution buttons (6 per set), and set advancement. The TV display (VolleyballScoreboardLayout) shows team scores, current set number, sets won (up to 3), timeouts remaining, and animated serving indicators. All volleyball commands (ADD_VB_POINT, USE_VB_TIMEOUT, ADVANCE_SET, etc.) are used correctly. The scoreboard App.tsx correctly routes between basketball and volleyball layouts based on gs.sport. The 📺 TV button exists only in the control panel tab bar—VolleyballScoreTab does not duplicate it.

**Watch for:** None. The implementation is correct and complete. Design compliance confirmed (dark background #0c0f14, LED amber displays, Orbitron font, button heights ≥64px, correct color coding). Volleyball rules correctly reflected (2 timeouts per set, 6 subs per set, SET display, no clocks or fouls). All TypeScript null-checks in place (gs.volleyball?.currentSet).

**Verdict**: APPROVED

---

## High-level view

The control panel renders VolleyballScoreTab when gs.sport is 'volleyball', showing +1/-1 score buttons that dispatch ADD_VB_POINT and SUBTRACT_VB_POINT, serving buttons that call SET_SERVING_TEAM, timeout buttons calling USE_VB_TIMEOUT (max 2 per set), and substitution buttons opening a modal (not directly dispatching USE_VB_SUBSTITUTION, which requires a playerId). The TV scoreboard conditionally renders VolleyballScoreboardLayout based on gs.sport, displaying scores in 8rem LED amber, current set number, sets won as filled dots (up to 3), timeouts remaining as amber dots (2 - timeoutsUsed), and animated serving arrows. The sport selector in App.tsx dispatches NEW_VOLLEYBALL_GAME (not NEW_GAME) when volleyball is chosen. Design compliance verified: dark background, LED amber for numeric displays, Orbitron font, buttons ≥64px, color coding correct (green=score, red=subtract, amber=serve/timeout, teal=subs, purple=advance). No duplicate TV button: the 📺 button in the tab bar is the only one.

<details>
<summary>Issues (0)</summary>

No blocking issues found. Implementation is correct and complete.

</details>

<details>
<summary>Details</summary>

## Score commands correctly wired

VolleyballScoreTab dispatches ADD_VB_POINT and SUBTRACT_VB_POINT for score changes:

```tsx
onClick={() => sendCommand({ type: 'ADD_VB_POINT', team: 'home' })}
onClick={() => sendCommand({ type: 'SUBTRACT_VB_POINT', team: 'home' })}
```

Subtract buttons are disabled when score ≤ 0.

## Timeout and substitution controls match volleyball rules

Timeouts show `2 - timeoutsUsed.home` remaining dots and disable the button when timeoutsUsed ≥ 2. Substitutions show `6 - substitutionsUsed.home` remaining. The SUB HOME/AWAY buttons call `setShowSubModal('home')` to open a modal, not directly dispatching USE_VB_SUBSTITUTION—correct, since that command requires a playerId:

```tsx
onClick={() => setShowSubModal('home')}
```

## Sport routing and TV button placement

App.tsx (control panel) conditionally renders VolleyballScoreTab when gs.sport is 'volleyball'. App.tsx (scoreboard) conditionally renders VolleyballScoreboardLayout when gs.sport is 'volleyball'. The 📺 TV button exists in the tab bar in App.tsx (control panel), not in VolleyballScoreTab—confirmed by reading VolleyballScoreTab.tsx, which has no call to `window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'OPEN_SCOREBOARD' })`. No duplication (**confirmed**).

## Design compliance

VolleyballScoreboardLayout.css uses `#0c0f14` background, `#ffcc00` for LED displays (score, set number, timeouts), and `Orbitron` font for numeric displays. VolleyballScoreTab inline styles use `var(--cp-bg)`, `var(--led-amber)`, `var(--btn-green)`, `var(--btn-switch)`, `var(--btn-amber)`, `var(--accent-cyan)`, matching the design system. Button heights are `minHeight: '64px'` or higher (ADVANCE SET is 80px). Color coding: green for +1 score, red for -1/subtract, amber for serve/timeout, teal for subs, purple for advance set. No scrollbars (overflow: hidden on .vb-score-tab). All requirements met (**confirmed**).

## Volleyball rules reflected in UI

- Timeouts: max 2 per set, shown as `2 - timeoutsUsed.home`.
- Substitutions: max 6 per set, shown as `6 - substitutionsUsed.home`.
- SET display (not period/quarter): "SET {currentSet}" in header and center panel.
- Sets won tracker: up to 3 dots, filled when won.
- Serving team indicator: visible arrows and buttons.
- No game clock, no shot clock, no fouls, no bonus displays (**confirmed**).

## TypeScript null-checking

VolleyballScoreTab checks `if (!volleyball)` before accessing volleyball state. VolleyballScoreboardLayout checks `if (gs.sport !== 'volleyball')` and `if (!volleyball)` with early returns.

</details>

---

<details>
<summary>File map</summary>

- **VolleyballScoreTab.tsx** — new control panel tab for volleyball with score buttons, serving selector, timeout/sub tracking, set advancement
- **VolleyballScoreboardLayout.tsx** — new TV display for volleyball with LED scores, set indicator, sets won dots, timeouts, serving arrows
- **VolleyballScoreboardLayout.css** — dark scoreboard styling with LED amber, Orbitron font, pulsing serve animation
- **App.tsx (control panel)** — conditional rendering of VolleyballScoreTab when sport is volleyball, sport selector dispatches NEW_VOLLEYBALL_GAME
- **App.tsx (scoreboard)** — conditional rendering of VolleyballScoreboardLayout when sport is volleyball

Full diff: `git diff main -- src/renderer/controlPanel/components/VolleyballScoreTab.tsx src/renderer/scoreboard/components/VolleyballScoreboardLayout.tsx src/renderer/scoreboard/components/VolleyballScoreboardLayout.css src/renderer/controlPanel/App.tsx src/renderer/scoreboard/App.tsx`

</details>
