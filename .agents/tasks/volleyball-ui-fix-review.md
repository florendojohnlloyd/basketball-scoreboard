# Volleyball UI improvements - logo position, button spacing, timeout text, player stats panel

Commit b7f7519 addresses four layout issues in the volleyball control panel. The logo was moved above the "VOLLEYBALL" text, control panel buttons were given more spacing, timeout button text was reformatted to match basketball's style, and the player stats panel received scrollbar and summary improvements. Two issues remain incomplete: the volleyball player stats panel lacks a "← Back" button present in basketball, and the scrollbar visibility change was subtle rather than emphatic.

**Watch for:** Missing "← Back" button in volleyball player stats (confirmed — present in basketball but absent in volleyball), timeout text size mismatch (confirmed — volleyball uses 1.4rem, basketball uses 0.7rem), scrollbar change insufficient (confirmed — changed from 'thin' to 'auto' but task asked for visibility emphasis).

**Verdict**: CHANGES_REQUESTED

## High-level view

The logo relocation works correctly: moved from below to above the "VOLLEYBALL" text using negative margin and new DOM ordering. The control panel buttons gained 50% more spacing (12px → 18px gap) and slightly more horizontal padding (6px → 10px), which should reduce touch collision. The timeout buttons still use 1.4rem font size while basketball uses 0.7rem, creating a 2x text size difference rather than matching as requested. The player stats panel adds a stats summary line at the bottom and changes the scrollbar from 'thin' to 'auto', but lacks the "← Back" button that basketball implements as a dedicated UI element in the stats header.

<details>
<summary>Issues (4)</summary>

1. **Missing "← Back" button in volleyball player stats** — Basketball has a visible "← Back" button (`onClick={() => setSelectedPlayer(null)}`) in the stats header next to the player name. Volleyball has only a small "✕" indicator on the selected player card. Add a "← Back" button matching basketball's implementation.

2. **Timeout text size goes opposite direction** — Basketball timeout buttons use `fontSize: '0.7rem'` (with `<br/>` line break). Volleyball timeout buttons use `fontSize: '1.4rem'` (also with `<br/>`). The task asked to match volleyball TO text to basketball TO text, but volleyball's text is 2x larger.

3. **Scrollbar visibility change insufficient** — Changed from `scrollbarWidth: 'thin'` to `scrollbarWidth: 'auto'`, but 'auto' is browser-default (often thin on modern browsers). For emphatic visibility, use `scrollbarWidth: 'thick'` or explicit `::-webkit-scrollbar` width.

4. **Scrollbar color contrast reduced** — Changed from `scrollbarColor: '#ffaa00 #1a2030'` (bright amber) to `scrollbarColor: '#ffcc00 #1a2030'` (lighter yellow). This improves contrast slightly but wasn't part of the stated requirements and might have been unintentional.

</details>

<details>
<summary>Details</summary>

## Logo repositioned above "VOLLEYBALL" text

In VolleyballScoreboardLayout.tsx, the `<div className="vb-pre__title">` line moved from above the matchup to below it. In VolleyballScoreboardLayout.css, `.vb-pre__title` changed from `margin-bottom: 60px` to `margin-top: 40px`, placing vertical space above instead of below. The control panel also gained a "VOLLEYBALL" label below the logo (matching basketball's pattern).

## Control panel button spacing increased

The action control row (NEXT SET, SWITCH, UNDO, STATS, TV, RESET) changed from `gap: '12px'` to `gap: '18px'` (50% increase), and button horizontal padding increased from `14px 6px` to `14px 10px`. This reduces touch collision risk between adjacent buttons.

## Timeout text size goes opposite direction

The task asked to match volleyball timeout text to basketball timeout text size. Basketball uses `fontSize: '0.7rem'`, volleyball uses `fontSize: '1.4rem'` — exactly double. The commit adds `lineHeight: 1.4` and a `<br/>` line break to volleyball's timeout buttons, matching basketball's line break pattern, but leaves the font size at 1.4rem instead of reducing it to 0.7rem. The underlying flex container also changed from `flex: 0.3` to `flex: 0.25`, reducing vertical space by 17%, which doesn't compensate for the 2x text size difference.

## Missing "← Back" button and scrollbar changes

Basketball's player stats section has a visible "← Back" button (`onClick={() => setSelectedPlayer(null)}`) in a flex row with the player name. Volleyball lacks this button entirely. Instead, it adds a small "✕" indicator in the top-right corner of selected player cards (position: absolute, top/right: 4px, opacity: 0.7), which is informational, not interactive. Clicking the player card again deselects them, but there's no labeled "Back" button.

The scrollbar changed from `scrollbarWidth: 'thin'` to `scrollbarWidth: 'auto'`, which is browser-default (often still thin). The task emphasized visibility, suggesting 'thick' or explicit webkit-scrollbar styling might have been intended. The scrollbar color changed from `#ffaa00` (amber) to `#ffcc00` (lighter yellow), which wasn't in the requirements.

A new stats summary line appears at the bottom: "Stats: Xpts | Xreb | Xast | Xstl | Xblk" in a bordered box with amber values, matching the requirement.

## Player panel flex allocation reduced

The player selection row changed from `flex: 0.4` to `flex: 0.35`, the score controls row from `flex: 0.45` to `flex: 0.40`, and the timeout row from `flex: 0.3` to `flex: 0.25`. These reductions compress the player list area slightly, making the scrollbar concern more acute, but they accommodate the new sport label and stats summary without causing layout collapse.

</details>

---

## File map

<details>
<summary>3 files changed</summary>

- **src/renderer/controlPanel/components/VolleyballScoreTab.tsx** — Added sport label below logo, increased button spacing (gap 12px→18px, padding 6px→10px), added stats summary line, changed scrollbar from thin to auto, added small "✕" indicator on selected player cards, reduced flex allocations across player/control/timeout rows, reformatted timeout text with line breaks.

- **src/renderer/scoreboard/components/VolleyballScoreboardLayout.css** — Changed `.vb-pre__title` margin from `margin-bottom: 60px` to `margin-top: 40px` to move logo above text, hid `.tv-timeout__remaining-label` to match basketball timeout layout.

- **src/renderer/scoreboard/components/VolleyballScoreboardLayout.tsx** — Reordered JSX: moved `<div className="vb-pre__title">VOLLEYBALL</div>` from before matchup section to after it, placing logo above the title.

Full diff: `git show b7f7519`

</details>
