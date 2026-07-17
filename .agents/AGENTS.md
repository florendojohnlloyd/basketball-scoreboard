# Scoreboard App — Default Design Rules

## Design Identity: Dark Hardware Scoreboard Console

This project follows a **physical scoreboard controller aesthetic** — dark, high-contrast,
LED-inspired design. This is the **canonical default design** for this workspace.
**Always preserve and apply these tokens and patterns** when modifying or creating UI.

---

## Color Palette and CSS Variables (theme.css)

These variables are defined in `src/renderer/controlPanel/theme.css` and must be respected:

`css
/* Backgrounds */
--cp-bg:         #0c0f14;
--cp-bg2:        #141820;
--cp-panel:      #1a2030;
--cp-led-bg:     #060a10;

/* LED Colors */
--led-amber:     #ffcc00;
--led-green:     #22ff55;
--led-red:       #ff3030;
--led-glow:      rgba(255, 204, 0, 0.4);

/* Buttons */
--btn-green:     #2d9420;
--btn-amber:     #b06010;
--btn-ctrl:      #1e2836;
--btn-switch:    #c03010;

/* Text */
--text-primary:  #d0dce8;
--text-muted:    #5a7090;
--text-label:    #f0a020;

/* Accents */
--accent-orange: #cc6600;
--accent-gold:   #f0a020;
--accent-cyan:   #17a2b8;

/* Fonts */
--font-led:      'Orbitron', 'Courier New', monospace;
--font-ui:       'Segoe UI', system-ui, sans-serif;
`

---

## Design Principles

1. **Background**: Always deep charcoal/black (#0a0a0a to #1e1e1e) with subtle dot-grid or scanline texture.
2. **LED Displays**: Use amber/yellow (#ffcc00) with glow effects for score and timer displays.
3. **Buttons**: Large, touch-friendly (min 64px height). Color-coded by function:
   - Green (#2d9420) -> Score actions (START, +points)
   - Red (#c03010) -> SWITCH / dangerous actions
   - Purple (#6b3fa0) -> HORN / signal actions
   - Amber (#b06010) -> POSSESSION / secondary actions
   - Teal/Cyan -> SUB / neutral actions
4. **Borders**: Subtle orange accent lines (#cc6600) for panel framing.
5. **Typography**: Orbitron (bold/900) for scores and LED readouts; Segoe UI for labels.
6. **No Scroll**: The control panel must fit within 100vh — no scrollbars on the main UI.
7. **Team colors**: Home team uses blue border (#1a4fd6), Away team uses red border (#c0392b).

---

## Layout Reference (Control Panel)

The control panel follows this structure:
- **Top bar**: Header with team names, logos, score displays, period, shot clock
- **Center**: Large control buttons (START, HORN, PAUSE, POSS, SWITCH, REPLAY, SUB)
- **Left panel**: Home team player roster with stat buttons (+REB, +AST, +FOUL, +STL, +BLK, +TO)
- **Right panel**: Away team player roster (mirrored)
- **Bottom**: Timeout indicators, Team Foul display, UNDO SCORE, RESET

---

## Key Files

| File | Purpose |
|------|---------|
| src/renderer/controlPanel/theme.css | CSS design tokens (source of truth) |
| src/renderer/controlPanel/App.css | Main control panel styles |
| src/renderer/controlPanel/App.tsx | Main control panel component |
| src/renderer/controlPanel/store.ts | Game state management |

---

## Rules for AI Agents

- DO NOT change the dark background to light mode unless explicitly instructed.
- DO NOT replace amber/LED colors with generic blue or gray palettes.
- DO NOT add scroll to the control panel layout.
- ALWAYS use the CSS variables from theme.css instead of hardcoded hex values.
- ALWAYS keep buttons large and touch-friendly (min ~64px height).
- When adding new buttons, match the existing color-coding system above.
- When adding new panels or UI sections, maintain the metallic dark aesthetic.
- Font for any digital/numeric display = Orbitron (from Google Fonts, already imported).
