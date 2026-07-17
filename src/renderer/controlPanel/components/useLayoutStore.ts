/**
 * useLayoutStore — global layout state using zustand.
 * Shared between App.tsx (edit toggle) and ScoreTab (widget positions).
 */
import { create } from 'zustand'

export interface WidgetRect {
  x: number
  y: number
  w: number
  h: number
}

const STORAGE_KEY = 'score-tab-layout-v3'

const DEFAULTS: Record<string, WidgetRect> = {
  'home-label':      { x: 0,   y: 0,  w: 28, h: 5 },
  'sponsor-banner':  { x: 32,  y: 0,  w: 18, h: 5 },
  'away-label':      { x: 62,  y: 0,  w: 28, h: 5 },
  'home-score':      { x: 8,   y: 6,  w: 6,  h: 9 },
  'period':          { x: 20,  y: 6,  w: 8,  h: 9 },
  'clock':           { x: 29,  y: 6,  w: 24, h: 12 },
  'shot-clock':      { x: 55,  y: 6,  w: 10, h: 9 },
  'away-score':      { x: 86,  y: 6,  w: 6,  h: 9 },
  'next-q':          { x: 20,  y: 19, w: 10, h: 5 },
  'btn-reset':       { x: 32,  y: 19, w: 14, h: 5 },
  'shot-play':       { x: 55,  y: 19, w: 6,  h: 5 },
  'shot-reset':      { x: 61,  y: 19, w: 6,  h: 5 },
  'home-players':    { x: 0,   y: 19, w: 18, h: 45 },
  'away-players':    { x: 72,  y: 19, w: 18, h: 45 },
  'btn-reb':         { x: 19,  y: 25, w: 5,  h: 7 },
  'btn-ast':         { x: 19,  y: 33, w: 5,  h: 7 },
  'btn-foul':        { x: 19,  y: 41, w: 5,  h: 7 },
  'btn-stl':         { x: 19,  y: 49, w: 5,  h: 7 },
  'btn-blk':         { x: 19,  y: 57, w: 5,  h: 7 },
  'btn-to':          { x: 19,  y: 65, w: 5,  h: 7 },
  'btn-reb-a':       { x: 67,  y: 25, w: 5,  h: 7 },
  'btn-ast-a':       { x: 67,  y: 33, w: 5,  h: 7 },
  'btn-foul-a':      { x: 67,  y: 41, w: 5,  h: 7 },
  'btn-stl-a':       { x: 67,  y: 49, w: 5,  h: 7 },
  'btn-blk-a':       { x: 67,  y: 57, w: 5,  h: 7 },
  'btn-to-a':        { x: 67,  y: 65, w: 5,  h: 7 },
  'btn-start':       { x: 25,  y: 26, w: 10, h: 10 },
  'btn-horn':        { x: 36,  y: 26, w: 16, h: 10 },
  'btn-pause':       { x: 53,  y: 26, w: 10, h: 10 },
  'btn-poss-home':   { x: 25,  y: 38, w: 10, h: 10 },
  'btn-switch':      { x: 36,  y: 38, w: 16, h: 10 },
  'btn-poss-away':   { x: 53,  y: 38, w: 10, h: 10 },
  'btn-replay':      { x: 25,  y: 50, w: 10, h: 10 },
  'btn-sub-horn':    { x: 36,  y: 50, w: 16, h: 10 },
  'btn-sub':         { x: 53,  y: 50, w: 10, h: 10 },
  'home-plus3':      { x: 0,   y: 66, w: 5,  h: 7 },
  'home-plus2':      { x: 6,   y: 66, w: 5,  h: 7 },
  'home-plus1':      { x: 12,  y: 66, w: 5,  h: 7 },
  'away-plus1':      { x: 78,  y: 66, w: 5,  h: 7 },
  'away-plus2':      { x: 84,  y: 66, w: 5,  h: 7 },
  'away-plus3':      { x: 90,  y: 66, w: 5,  h: 7 },
  'home-timeout':    { x: 0,   y: 75, w: 14, h: 16 },
  'away-timeout':    { x: 78,  y: 75, w: 14, h: 16 },
  'bonus-h':         { x: 0,   y: 92, w: 8,  h: 6 },
  'bonus-h-foul':    { x: 16,  y: 75, w: 12, h: 14 },
  'bonus-a':         { x: 92,  y: 92, w: 8,  h: 6 },
  'bonus-a-foul':    { x: 56,  y: 75, w: 12, h: 14 },
  'bonus-h-plus':    { x: 16,  y: 90, w: 5,  h: 5 },
  'bonus-h-minus':   { x: 21,  y: 90, w: 5,  h: 5 },
  'bonus-a-plus':    { x: 62,  y: 90, w: 5,  h: 5 },
  'bonus-a-minus':   { x: 67,  y: 90, w: 5,  h: 5 },
  'btn-undo':        { x: 30,  y: 75, w: 12, h: 12 },
  'btn-game-reset':  { x: 44,  y: 75, w: 12, h: 12 },
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
