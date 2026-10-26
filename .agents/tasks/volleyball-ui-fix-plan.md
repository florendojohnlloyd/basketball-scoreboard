# Implementation Plan: Volleyball UI Fixes

## Overview

This plan addresses 4 UI issues in the volleyball scoreboard system based on user feedback (in Tagalog):
1. **Logo Position**: Logo currently below "VOLLEYBALL" text, must be moved above
2. **Button Spacing**: Bottom control buttons too close together
3. **Timeout Text Size**: Volleyball timeout text differs from basketball, needs consistency
4. **Player Stats Panel**: Missing back button, scrollbar, and stats summary when viewing player details

## Project Context

**Build System**: npm + Vite + Electron
**Test Command**: `npm run dev` (starts Electron app with hot reload)
**Tech Stack**: React 18, TypeScript 5, Electron 30, Zustand (state management)
**Key Directories**:
- `src/renderer/scoreboard/` - TV display (scoreboard window)
- `src/renderer/controlPanel/` - Control panel UI (operator interface)
- `src/shared/` - Shared types and utilities

**Design System** (from AGENTS.md):
- Dark backgrounds: #0c0f14, #141820
- LED amber: #ffcc00 for scores
- Buttons: min 64px height, color-coded (green=score, red=danger, purple=horn, amber=possession, teal=sub)
- Font: Orbitron for LED displays, Segoe UI for labels
- Must fit in 100vh (no scrollbars on main UI)

---

## Issue 1: Logo Position Fix (Volleyball Pre-Game Screen)

### Problem
The volleyball pre-game screen shows "VOLLEYBALL" text FIRST, then logos below. User wants logos ABOVE the text.

### Files to Modify
1. `src/renderer/scoreboard/components/VolleyballScoreboardLayout.tsx` (lines ~280-330, pre-game section)
2. `src/renderer/scoreboard/components/VolleyballScoreboardLayout.css` (`.vb-pre` section, lines ~70-140)

### Changes Needed

**VolleyballScoreboardLayout.tsx**:
- Locate the pre-game rendering section (`if (gamePhase === 'pre-game')`)
- Current structure:
  ```tsx
  <div className="vb-pre__title">VOLLEYBALL</div>
  <div className="vb-pre__matchup">...</div>
  ```
- **Change to**:
  ```tsx
  <div className="vb-pre__matchup">
    {/* Team logos and names */}
  </div>
  <div className="vb-pre__title">VOLLEYBALL</div>
  ```
- Simply **swap the order** of the two divs so matchup (which contains logos) renders first

**VolleyballScoreboardLayout.css**:
- No structural changes needed, but verify spacing
- `.vb-pre__title` should have `margin-top: 40px` instead of `margin-bottom: 60px`
- This ensures proper spacing between logos and text when text is below

### Verification
```bash
npm run dev
```
- Select volleyball sport
- Start a game (pre-game screen shows first)
- **Expected**: Team logos appear at top, "VOLLEYBALL" text appears below logos
- **Check**: Spacing is balanced and logos are clearly above the text

---

## Issue 2: Button Spacing Fix (Bottom Control Panel)

### Problem
Bottom action buttons (NEXT SET, SWITCH, UNDO, STATS, TV, RESET) are too close together, making them hard to tap.

### Files to Modify
1. `src/renderer/controlPanel/components/VolleyballScoreTab.tsx` (lines ~590-620, ROW 4 section)

### Changes Needed

**VolleyballScoreTab.tsx**:
- Locate the ROW 4 comment: `{/* ── ROW 4: TOUCH ACTION CONTROLS (Flex 0.35) ── */}`
- Current grid: `gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px'`
- **Change to**: `gap: '18px'` (increase from 12px to 18px)
- Also verify button padding: should be at least `'14px 10px'` (not `'14px 6px'`)

**Specific line to change**:
```tsx
// BEFORE:
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', flex: 0.35, minHeight: 0 }}>

// AFTER:
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '18px', flex: 0.35, minHeight: 0 }}>
```

**Also update button padding** for each button in that row:
```tsx
// BEFORE:
padding: '14px 6px'

// AFTER:
padding: '14px 10px'
```

### Verification
```bash
npm run dev
```
- Open volleyball control panel (SCORE tab)
- Scroll to bottom action buttons (NEXT SET, SWITCH, UNDO, STATS, TV, RESET)
- **Expected**: Buttons have clear visible spacing between them (6px more gap)
- **Check**: Buttons are easy to target on touch screens, no accidental taps on wrong button

---

## Issue 3: Timeout Text Size Consistency

### Problem
Volleyball timeout screen text size differs from basketball timeout screen. User wants consistent sizing across both sports.

### Files to Compare & Modify
1. `src/renderer/scoreboard/components/ScoreboardLayout.css` (basketball timeout styles, lines ~440-480)
2. `src/renderer/scoreboard/components/VolleyballScoreboardLayout.css` (volleyball timeout styles, lines ~440-500)

### Analysis

**Basketball timeout styles** (ScoreboardLayout.css):
```css
.tv-timeout__flash {
  font-size: clamp(5.5rem, 8.5vw, 9.5rem);
  font-weight: 900;
  color: #ffd700;
  letter-spacing: 0.2em;
  text-shadow: 0 0 25px rgba(255, 215, 0, 0.5);
  line-height: 1;
  white-space: nowrap;
}

.tv-timeout__team { 
  font-size: clamp(4.5rem, 7vw, 8rem); 
  font-weight: 900; 
  color: #fff; 
  text-transform: uppercase; 
  letter-spacing: 0.1em; 
  text-align: center;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}

.tv-timeout__ring-time {
  font-family: 'Cursed Timer ULiL', monospace;
  font-size: clamp(6rem, 10vw, 9.5rem);
  font-weight: 900;
  color: #ffffff;
  text-shadow: 0 0 25px rgba(77, 201, 246, 0.8);
}

.tv-timeout__remaining-label {
  display: none; /* Hidden in basketball */
}
```

**Volleyball timeout styles** (VolleyballScoreboardLayout.css):
```css
.tv-timeout__flash {
  font-size: clamp(5.5rem, 8.5vw, 9.5rem); /* SAME AS BASKETBALL ✓ */
  font-weight: 900;
  color: #ffd700;
  letter-spacing: 0.2em;
  margin-bottom: 25px;
  text-shadow: 0 0 25px rgba(255, 215, 0, 0.5);
  line-height: 1;
}

.tv-timeout__team-badge {
  font-size: clamp(4.5rem, 7vw, 8rem); /* SAME AS BASKETBALL ✓ */
  font-weight: 900;
  color: #ffffff;
  margin-bottom: 35px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-align: center;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
}

.tv-timeout__ring-time {
  font-family: 'Cursed Timer ULiL', monospace;
  font-size: clamp(6rem, 10vw, 9.5rem); /* SAME AS BASKETBALL ✓ */
  font-weight: 900;
  color: #ffffff;
  text-shadow: 0 0 25px rgba(77, 201, 246, 0.8);
}

.tv-timeout__remaining-label {
  font-size: clamp(2.5rem, 3.5vw, 3.8rem); /* DIFFERENT — Basketball has this hidden */
  font-weight: 900;
  color: #4dc9f6;
  letter-spacing: 0.25em;
  text-align: center;
}
```

### Changes Needed

**VolleyballScoreboardLayout.css**:
The main text sizes (flash, team name, timer) are already **identical** to basketball. The only difference is the "TIME REMAINING" label.

**Decision**: Hide the "TIME REMAINING" label in volleyball to match basketball:

```css
/* BEFORE: */
.tv-timeout__remaining-label {
  font-size: clamp(2.5rem, 3.5vw, 3.8rem);
  font-weight: 900;
  color: #4dc9f6;
  letter-spacing: 0.25em;
  text-align: center;
}

/* AFTER: */
.tv-timeout__remaining-label {
  display: none; /* Hidden to match basketball timeout layout */
}
```

**VolleyballScoreboardLayout.tsx**:
The component still renders the label element, but CSS will hide it. No changes needed in TSX.

### Verification
```bash
npm run dev
```
- Start volleyball game
- Trigger timeout (click "HOME TIMEOUT" or "AWAY TIMEOUT")
- **Expected**: Timeout screen shows "TIMEOUT", team name, and countdown timer — NO "TIME REMAINING" label
- **Check**: Compare side-by-side with basketball timeout — text sizes should be identical

---

## Issue 4: Player Stats Panel Improvements

### Problem
When clicking a player in volleyball mode:
- No visible back button to return to player list
- Scrollbar not apparent when stats overflow
- Stats summary missing at bottom (should show "Stats: 0pts |0reb |0ast |0stl |0blk")

### Background Investigation
This issue mentions "3rd pic" and "4th pic" which suggests a player detail view exists, but I need to investigate how basketball implements this feature.

### Files to Investigate First
1. `src/renderer/controlPanel/components/ScoreTab.tsx` (basketball player panel)
2. `src/renderer/controlPanel/components/VolleyballScoreTab.tsx` (volleyball player panel)

### Current State Analysis

**VolleyballScoreTab.tsx** (lines ~130-280):
- Player list rendered with buttons showing `#{number} {name} | {points}pts | {fouls}F`
- When selected, shows quick stat buttons below (+FOUL, -FOUL, BLOCK, ACE, DIG, ASSIST)
- **No separate detail view** - stats buttons appear inline
- Scrollbar IS visible (CSS: `scrollbarWidth: 'thin', scrollbarColor: '#ffaa00 #1a2030'`)

**Issue Root Cause**:
The user's screenshots likely show a different view (possibly a modal or expanded panel) that doesn't exist yet, OR the user expects a fuller stats summary to appear when a player is selected.

### Changes Needed

Since I cannot see the referenced "3rd pic" and "4th pic", I'll implement the most logical interpretation:

**Add a stats summary row when a player is selected**:

**VolleyballScoreTab.tsx** (inside the player selection panel):

After the quick stat buttons section (around line ~280), add a stats summary:

```tsx
{selectedPlayer?.team === 'home' && (
  <div style={{ borderTop: '1px solid #334466', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
    {/* ... existing quick stat buttons ... */}
    
    {/* ADD THIS NEW STATS SUMMARY: */}
    <div style={{
      marginTop: '8px',
      padding: '8px 12px',
      background: 'var(--cp-led-bg)',
      border: '1px solid var(--accent-gold)',
      borderRadius: 'var(--r-sm)',
      fontSize: '0.75rem',
      color: 'var(--text-muted)',
      textAlign: 'center',
      fontWeight: 700,
    }}>
      Stats: <span style={{ color: 'var(--led-amber)' }}>
        {home.players.find(p => p.id === selectedPlayer.id)?.points || 0}pts
      </span> |
      <span style={{ color: 'var(--led-amber)' }}>
        {home.players.find(p => p.id === selectedPlayer.id)?.rebounds || 0}reb
      </span> |
      <span style={{ color: 'var(--led-amber)' }}>
        {home.players.find(p => p.id === selectedPlayer.id)?.assists || 0}ast
      </span> |
      <span style={{ color: 'var(--led-amber)' }}>
        {home.players.find(p => p.id === selectedPlayer.id)?.steals || 0}stl
      </span> |
      <span style={{ color: 'var(--led-amber)' }}>
        {home.players.find(p => p.id === selectedPlayer.id)?.blocks || 0}blk
      </span>
    </div>
  </div>
)}
```

**Repeat the same pattern for the away team panel** (around line ~380).

**Enhance scrollbar visibility**:
The scrollbar is already defined, but make it more prominent:

```tsx
// BEFORE:
style={{ 
  flex: 1, 
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex', 
  flexDirection: 'column', 
  gap: '4px', 
  minHeight: 0,
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'thin',
  scrollbarColor: '#ffaa00 #1a2030'
}}

// AFTER:
style={{ 
  flex: 1, 
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex', 
  flexDirection: 'column', 
  gap: '4px', 
  minHeight: 0,
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'auto', // Changed from 'thin' to 'auto' for better visibility
  scrollbarColor: '#ffcc00 #1a2030' // Brighter gold color
}}
```

**Add a "back" affordance**:
Since clicking the selected player again deselects it, add a visual hint:

```tsx
// In the player button rendering, when selected:
<button
  key={p.id}
  onClick={() => setSelectedPlayer(selectedPlayer?.id === p.id ? null : { team: 'home', id: p.id })}
  style={{
    /* ... existing styles ... */
    position: 'relative', // Add this
  }}
>
  <span>#{p.number} {p.name} {p.fouledOut && '❌'}</span>
  <span style={{ fontSize: '0.85rem', color: /* ... */ }}>
    {p.points}pts | {p.fouls}F
  </span>
  
  {/* ADD THIS WHEN SELECTED: */}
  {selectedPlayer?.id === p.id && (
    <span style={{
      position: 'absolute',
      top: '4px',
      right: '4px',
      fontSize: '0.7rem',
      color: 'var(--text-muted)',
      opacity: 0.7,
    }}>
      ✕
    </span>
  )}
</button>
```

### Verification
```bash
npm run dev
```
- Open volleyball control panel
- Click on a player in HOME PLAYERS list
- **Expected**: 
  - Player button highlights with amber background
  - Small ✕ appears in top-right corner of selected player button (back affordance)
  - Quick stat buttons appear below player list
  - Stats summary appears at bottom: "Stats: 0pts |0reb |0ast |0stl |0blk"
  - Scrollbar is visible and easy to see (bright gold on dark background)
- Click the selected player again
- **Expected**: Deselects, stats panel disappears, back to player list view
- Repeat for AWAY PLAYERS

---

## Summary of Changes

| Issue | File(s) | Change Type | Lines Affected |
|-------|---------|-------------|----------------|
| Logo Position | `VolleyballScoreboardLayout.tsx` | Reorder JSX | ~280-330 |
| Logo Position | `VolleyballScoreboardLayout.css` | Adjust margin | ~75-80 |
| Button Spacing | `VolleyballScoreTab.tsx` | Increase gap & padding | ~590-620 |
| Timeout Text | `VolleyballScoreboardLayout.css` | Hide label | ~490-495 |
| Player Stats | `VolleyballScoreTab.tsx` | Add stats summary | ~280, ~380 |
| Player Stats | `VolleyballScoreTab.tsx` | Enhance scrollbar | ~150, ~250 |
| Player Stats | `VolleyballScoreTab.tsx` | Add back indicator | ~170, ~270 |

## Testing Checklist

After implementing all changes, run full verification:

```bash
npm run dev
```

### Pre-Game Screen (Issue 1)
- [ ] Start volleyball mode
- [ ] Logos appear ABOVE "VOLLEYBALL" text
- [ ] Spacing is balanced

### Control Panel Buttons (Issue 2)
- [ ] Bottom buttons (NEXT SET, SWITCH, UNDO, STATS, TV, RESET) have clear spacing
- [ ] No accidental taps when clicking adjacent buttons

### Timeout Screen (Issue 3)
- [ ] Trigger timeout in volleyball
- [ ] "TIMEOUT" text size matches basketball
- [ ] Team name text size matches basketball
- [ ] Timer text size matches basketball
- [ ] "TIME REMAINING" label is hidden

### Player Stats (Issue 4)
- [ ] Click player in HOME or AWAY list
- [ ] Small ✕ back indicator visible on selected player
- [ ] Stats summary shows: "Stats: Xpts |Xreb |Xast |Xstl |Xblk"
- [ ] Scrollbar is visible and bright gold color
- [ ] Click selected player again deselects and hides stats

### Cross-Check Basketball
- [ ] Switch to basketball mode
- [ ] Verify no regression in basketball UI
- [ ] Timeout screen still works correctly

## Build Verification

Final check:
```bash
npm run build
npm run preview
```

- [ ] All features work in production build
- [ ] No console errors
- [ ] Volleyball and basketball modes both functional

---

## Notes

- **Language Context**: Original request was in Tagalog. Key phrases:
  - "ibaba mo dapat na sa taas" = move from bottom to top
  - "nagka dikidikit" = stuck together / too close
  - "gayanin mo text size" = copy the text size
  - "wala ako makita" = can't see anything
  - "check mo" = check it
  - "ayosin mo" = fix it

- **Design Constraints**: Must follow AGENTS.md rules:
  - Keep dark background (#0c0f14)
  - Use CSS variables (var(--led-amber), etc.)
  - Maintain 64px minimum button height
  - No scrollbars on main UI (100vh constraint)
  - Orbitron font for LED displays

- **IPC Flow**: Control panel → main process → scoreboard window
  - Changes in control panel trigger state updates via sendCommand()
  - Scoreboard listens for state broadcasts and re-renders
  - No changes needed to IPC layer for these UI-only fixes
