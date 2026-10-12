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

const STORAGE_KEY = 'score-tab-layout-v27'

const DEFAULTS: Record<string, WidgetRect> = {
  // ── TOP BAR ──────────────────────────────────────────────
  'home-label':      { x: 0,   y: 0,  w: 13, h: 6,  hidden: true },
  'sponsor-banner':  { x: 28,  y: 0,  w: 30, h: 8  },
  'away-label':      { x: 72,  y: 0,  w: 14, h: 6,  hidden: true },

  // ── SCORE / CLOCK ROW — hidden in control panel (shown on TV only) ──
  'home-score':      { x: 5,   y: 9,  w: 10, h: 16, hidden: true },
  'period':          { x: 22,  y: 9,  w: 8,  h: 10, hidden: true },
  'clock':           { x: 30,  y: 9,  w: 27, h: 16, hidden: true },
  'shot-clock':      { x: 58,  y: 9,  w: 9,  h: 10, hidden: true },
  'away-score':      { x: 72,  y: 9,  w: 10, h: 16, hidden: true },

  // ── CLOCK CONTROL ROW — BIGGER for touchscreen ──
  'next-q':          { x: 18,  y: 9,  w: 13, h: 9  },
  'btn-reset':       { x: 32,  y: 9,  w: 15, h: 9  },
  'shot-24':         { x: 48,  y: 9,  w: 8,  h: 9  },
  'shot-14':         { x: 57,  y: 9,  w: 8,  h: 9  },
  'shot-reset':      { x: 66,  y: 9,  w: 8,  h: 9  },
  'shot-toggle':     { x: 75,  y: 9,  w: 11, h: 9  },

  // ── PLAYER PANELS (y 19–64) ───────────────────────────────
  'home-players':    { x: 0,   y: 19, w: 17, h: 45 },
  'away-players':    { x: 69,  y: 19, w: 17, h: 45 },

  // Home stat buttons — HIDDEN for Liga mode
  'btn-reb':         { x: 17,  y: 19, w: 5,  h: 7, hidden: true },
  'btn-ast':         { x: 17,  y: 27, w: 5,  h: 7, hidden: true },
  'btn-foul':        { x: 17,  y: 35, w: 5,  h: 7, hidden: true },
  'btn-stl':         { x: 17,  y: 43, w: 5,  h: 7, hidden: true },
  'btn-blk':         { x: 17,  y: 51, w: 5,  h: 7, hidden: true },
  'btn-to':          { x: 17,  y: 59, w: 5,  h: 7, hidden: true },
  'btn-score-minus-h': { x: 0, y: 65, w: 8, h: 10 },

  // Away stat buttons — HIDDEN for Liga mode
  'btn-reb-a':       { x: 64,  y: 19, w: 5,  h: 7, hidden: true },
  'btn-ast-a':       { x: 64,  y: 27, w: 5,  h: 7, hidden: true },
  'btn-foul-a':      { x: 64,  y: 35, w: 5,  h: 7, hidden: true },
  'btn-stl-a':       { x: 64,  y: 43, w: 5,  h: 7, hidden: true },
  'btn-blk-a':       { x: 64,  y: 51, w: 5,  h: 7, hidden: true },
  'btn-to-a':        { x: 64,  y: 59, w: 5,  h: 7, hidden: true },
  'btn-score-minus-a': { x: 78, y: 65, w: 8, h: 10 },

  // ── CENTER ZONE — EXTRA LARGE for touchscreen ──────────────
  // Row 1: START button - HUGE and centered
  'btn-start':       { x: 22,  y: 19, w: 34, h: 16 },
  'btn-horn':        { x: 57,  y: 19, w: 12, h: 16, hidden: true },
  'btn-tv':          { x: 57,  y: 19, w: 12, h: 16 },

  // Row 2: POSS and SWITCH - bigger spacing
  'btn-poss-home':   { x: 22,  y: 36, w: 15, h: 12 },
  'btn-switch':      { x: 38,  y: 36, w: 20, h: 12 },
  'btn-poss-away':   { x: 59,  y: 36, w: 10, h: 12 },

  // Row 3: UNDO, RESET, SUB - bigger for easier tapping
  'btn-replay':      { x: 22,  y: 49, w: 15, h: 11, hidden: true },
  'btn-undo-period': { x: 22,  y: 49, w: 20, h: 11 },
  'btn-game-reset':  { x: 43,  y: 49, w: 16, h: 11 },
  'btn-sub':         { x: 60,  y: 49, w: 9,  h: 11 },

  // ── MINI SCOREBOARD ──────────────────────────────────────
  'mini-scoreboard': { x: 22,  y: 61, w: 47, h: 14 },

  // ── SCORE BUTTONS — BIGGER for touchscreen ──────────────
  'home-plus3':      { x: 9,   y: 65, w: 9,  h: 10 },
  'home-plus2':      { x: 0,   y: 76, w: 9,  h: 10 },
  'home-plus1':      { x: 9,   y: 76, w: 9,  h: 10 },
  'away-plus1':      { x: 69,  y: 65, w: 9,  h: 10 },
  'away-plus2':      { x: 78,  y: 76, w: 8,  h: 10 },
  'away-plus3':      { x: 69,  y: 76, w: 9,  h: 10 },

  // ── FOOTER ─────────────────────────────────────────────
  'home-timeout':    { x: 0,   y: 87, w: 18, h: 13 },
  'away-timeout':    { x: 68,  y: 87, w: 18, h: 13 },
  'bonus-h-foul':    { x: 19,  y: 76, w: 16, h: 12 },
  'bonus-a-foul':    { x: 51,  y: 76, w: 16, h: 12 },
  'bonus-h-plus':    { x: 19,  y: 89, w: 8,  h: 6  },
  'bonus-h-minus':   { x: 28,  y: 89, w: 8,  h: 6  },
  'bonus-a-plus':    { x: 51,  y: 89, w: 8,  h: 6  },
  'bonus-a-minus':   { x: 60,  y: 89, w: 8,  h: 6  },
  'bonus-h':         { x: 0,   y: 96, w: 12, h: 6  },
  'bonus-a':         { x: 74,  y: 96, w: 12, h: 6  },

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
