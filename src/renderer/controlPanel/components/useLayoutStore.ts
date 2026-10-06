/**
 * useLayoutStore � global layout state using zustand.
 * Shared between App.tsx (edit toggle) and ScoreTab (widget positions).
 */
import { create } from 'zustand'

export interface WidgetRect {
  x: number
  y: number
  w: number
  h: number
  hidden?: boolean
}

const STORAGE_KEY = 'score-tab-layout-v26'

const DEFAULTS: Record<string, WidgetRect> = {
  // ── TOP BAR ──────────────────────────────────────────────
  'home-label':      { x: 0,   y: 0,  w: 13, h: 6,  hidden: true },
  'sponsor-banner':  { x: 30,  y: 0,  w: 26, h: 7  },
  'away-label':      { x: 72,  y: 0,  w: 14, h: 6,  hidden: true },

  // ── SCORE / CLOCK ROW — hidden in control panel (shown on TV only) ──
  'home-score':      { x: 5,   y: 7,  w: 10, h: 16, hidden: true },
  'period':          { x: 22,  y: 7,  w: 8,  h: 10, hidden: true },
  'clock':           { x: 30,  y: 7,  w: 27, h: 16, hidden: true },
  'shot-clock':      { x: 58,  y: 7,  w: 9,  h: 10, hidden: true },
  'away-score':      { x: 72,  y: 7,  w: 10, h: 16, hidden: true },

  // ── CLOCK CONTROL ROW (y 8–16) ──
  'next-q':          { x: 20,  y: 8,  w: 11, h: 8  },
  'btn-reset':       { x: 32,  y: 8,  w: 13, h: 8  },
  'shot-24':         { x: 46,  y: 8,  w: 7,  h: 8  },
  'shot-14':         { x: 54,  y: 8,  w: 7,  h: 8  },
  'shot-reset':      { x: 62,  y: 8,  w: 7,  h: 8  },
  'shot-toggle':     { x: 70,  y: 8,  w: 10, h: 8  },

  // ── PLAYER PANELS (y 17–64) ───────────────────────────────
  'home-players':    { x: 0,   y: 17, w: 19, h: 47 },
  'away-players':    { x: 67,  y: 17, w: 19, h: 47 },

  // Home stat buttons — HIDDEN for Liga mode
  'btn-reb':         { x: 19,  y: 17, w: 5,  h: 7, hidden: true },
  'btn-ast':         { x: 19,  y: 25, w: 5,  h: 7, hidden: true },
  'btn-foul':        { x: 19,  y: 33, w: 5,  h: 7, hidden: true },
  'btn-stl':         { x: 19,  y: 41, w: 5,  h: 7, hidden: true },
  'btn-blk':         { x: 19,  y: 49, w: 5,  h: 7, hidden: true },
  'btn-to':          { x: 19,  y: 57, w: 5,  h: 7, hidden: true },
  'btn-score-minus-h': { x: 19, y: 65, w: 6, h: 9 },

  // Away stat buttons — HIDDEN for Liga mode
  'btn-reb-a':       { x: 62,  y: 17, w: 5,  h: 7, hidden: true },
  'btn-ast-a':       { x: 62,  y: 25, w: 5,  h: 7, hidden: true },
  'btn-foul-a':      { x: 62,  y: 33, w: 5,  h: 7, hidden: true },
  'btn-stl-a':       { x: 62,  y: 41, w: 5,  h: 7, hidden: true },
  'btn-blk-a':       { x: 62,  y: 49, w: 5,  h: 7, hidden: true },
  'btn-to-a':        { x: 62,  y: 57, w: 5,  h: 7, hidden: true },
  'btn-score-minus-a': { x: 62, y: 65, w: 5, h: 9 },

  // ── CENTER ZONE ──────────────────────────────────────────
  // Row 1 (y17-29): START (big) | TV
  'btn-start':       { x: 24,  y: 17, w: 30, h: 14 },
  'btn-horn':        { x: 55,  y: 17, w: 11, h: 14, hidden: true },
  'btn-tv':          { x: 56,  y: 17, w: 10, h: 14 },

  // Row 2 (y31-41): POSS HOME | SWITCH | POSS AWAY
  'btn-poss-home':   { x: 24,  y: 32, w: 13, h: 11 },
  'btn-switch':      { x: 38,  y: 32, w: 18, h: 11 },
  'btn-poss-away':   { x: 57,  y: 32, w: 9,  h: 11 },

  // Row 3 (y43-53): UNDO Q | GAME RESET | SUB
  'btn-replay':      { x: 24,  y: 44, w: 13, h: 10, hidden: true },
  'btn-undo-period': { x: 24,  y: 44, w: 18, h: 10 },
  'btn-game-reset':  { x: 43,  y: 44, w: 13, h: 10 },
  'btn-sub':         { x: 57,  y: 44, w: 9,  h: 10 },

  // ── MINI SCOREBOARD (y55-68) ──────────────────────────────
  'mini-scoreboard': { x: 24,  y: 55, w: 42, h: 15 },

  // ── SCORE BUTTONS (y65-74) ──────────────────────────────
  'home-plus3':      { x: 0,   y: 65, w: 7,  h: 9  },
  'home-plus2':      { x: 7,   y: 65, w: 7,  h: 9  },
  'home-plus1':      { x: 14,  y: 65, w: 5,  h: 9  },
  'away-plus1':      { x: 67,  y: 65, w: 5,  h: 9  },
  'away-plus2':      { x: 72,  y: 65, w: 7,  h: 9  },
  'away-plus3':      { x: 79,  y: 65, w: 7,  h: 9  },

  // ── FOOTER (y75-100) ─────────────────────────────────────
  'home-timeout':    { x: 0,   y: 75, w: 16, h: 20 },
  'away-timeout':    { x: 70,  y: 75, w: 16, h: 20 },
  'bonus-h-foul':    { x: 17,  y: 75, w: 15, h: 17 },
  'bonus-a-foul':    { x: 54,  y: 75, w: 15, h: 17 },
  'bonus-h-plus':    { x: 17,  y: 93, w: 7,  h: 6  },
  'bonus-h-minus':   { x: 25,  y: 93, w: 7,  h: 6  },
  'bonus-a-plus':    { x: 54,  y: 93, w: 7,  h: 6  },
  'bonus-a-minus':   { x: 62,  y: 93, w: 7,  h: 6  },
  'bonus-h':         { x: 0,   y: 96, w: 10, h: 6  },
  'bonus-a':         { x: 76,  y: 96, w: 10, h: 6  },

  // Tab nav — HIDDEN
  'tab-nav':         { x: 77,  y: 96, w: 22, h: 6, hidden: true },

  // Hidden legacy
  'btn-undo':        { x: 0,   y: 0,  w: 0,  h: 0,  hidden: true },
  'btn-pause':       { x: 0,   y: 0,  w: 0,  h: 0,  hidden: true },
}
function loadLayout(): Record<string, WidgetRect> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

function saveLayout(layout: Record<string, WidgetRect>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
}

interface LayoutStore {
  layouts: Record<string, WidgetRect>
  editing: boolean
  currentTemplate: string | null
  setEditing: (v: boolean) => void
  updateWidget: (id: string, partial: Partial<WidgetRect>) => void
  resetLayout: () => void
  saveTemplate: (name: string) => void
  loadTemplate: (name: string) => void
  getTemplateNames: () => string[]
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  layouts: loadLayout(),
  editing: false,
  currentTemplate: localStorage.getItem('layout-current-template') || null,
  setEditing: (v) => set({ editing: v }),
  updateWidget: (id, partial) => set((state) => {
    const updated = { ...state.layouts, [id]: { ...state.layouts[id], ...partial } }
    saveLayout(updated)
    return { layouts: updated }
  }),
  resetLayout: () => {
    saveLayout(DEFAULTS)
    localStorage.removeItem('score-tab-layout-v1')
    localStorage.removeItem('score-tab-layout-v2')
    localStorage.removeItem('score-tab-layout-v25')
    set({ layouts: { ...DEFAULTS }, currentTemplate: null })
    localStorage.removeItem('layout-current-template')
  },
  saveTemplate: (name: string) => {
    const templates = JSON.parse(localStorage.getItem('layout-templates') || '{}')
    templates[name] = get().layouts
    localStorage.setItem('layout-templates', JSON.stringify(templates))
    localStorage.setItem('layout-current-template', name)
    set({ currentTemplate: name })
  },
  loadTemplate: (name: string) => {
    const templates = JSON.parse(localStorage.getItem('layout-templates') || '{}')
    if (templates[name]) {
      const merged = { ...DEFAULTS, ...templates[name] }
      saveLayout(merged)
      localStorage.setItem('layout-current-template', name)
      set({ layouts: merged, currentTemplate: name })
    }
  },
  getTemplateNames: () => {
    return Object.keys(JSON.parse(localStorage.getItem('layout-templates') || '{}'))
  },
}))
