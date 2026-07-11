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
  'home-label':      { x: 0,   y: 0,  w: 18, h: 8 },
  'home-score':      { x: 18,  y: 0,  w: 8,  h: 8 },
  'sponsor-banner':  { x: 30,  y: 0,  w: 20, h: 7 },
  'away-label':      { x: 50,  y: 0,  w: 18, h: 8 },
  'away-score':      { x: 68,  y: 0,  w: 8,  h: 8 },
  'home-plus3':      { x: 28,  y: 0,  w: 5,  h: 7 },
  'home-plus2':      { x: 33,  y: 0,  w: 5,  h: 7 },
  'home-plus1':      { x: 38,  y: 0,  w: 5,  h: 7 },
  'away-plus1':      { x: 78,  y: 0,  w: 5,  h: 7 },
  'away-plus2':      { x: 83,  y: 0,  w: 5,  h: 7 },
  'away-plus3':      { x: 88,  y: 0,  w: 5,  h: 7 },
  'shot-clock':      { x: 0,   y: 10, w: 12, h: 14 },
  'period':          { x: 14,  y: 10, w: 12, h: 14 },
  'bonus-h':         { x: 28,  y: 10, w: 10, h: 12 },
  'bonus-h-foul':    { x: 28,  y: 23, w: 10, h: 12 },
  'bonus-a':         { x: 42,  y: 10, w: 10, h: 12 },
  'bonus-a-foul':    { x: 42,  y: 23, w: 10, h: 12 },
  'shot-play':       { x: 0,   y: 25, w: 5,  h: 5 },
  'shot-reset':      { x: 5,   y: 25, w: 5,  h: 5 },
  'next-q':          { x: 14,  y: 25, w: 10, h: 5 },
  'bonus-h-plus':    { x: 28,  y: 25, w: 5,  h: 5 },
  'bonus-h-minus':   { x: 33,  y: 25, w: 5,  h: 5 },
  'bonus-a-plus':    { x: 42,  y: 25, w: 5,  h: 5 },
  'bonus-a-minus':   { x: 47,  y: 25, w: 5,  h: 5 },
  'clock':           { x: 25,  y: 32, w: 40, h: 16 },
  'btn-start':       { x: 28,  y: 49, w: 10, h: 6 },
  'btn-pause':       { x: 39,  y: 49, w: 10, h: 6 },
  'btn-reset':       { x: 50,  y: 49, w: 10, h: 6 },
  'btn-switch':      { x: 25,  y: 56, w: 40, h: 7 },
  'home-players':    { x: 0,   y: 32, w: 23, h: 35 },
  'away-players':    { x: 67,  y: 32, w: 23, h: 35 },
  'btn-reb':         { x: 0,   y: 68, w: 7,  h: 6 },
  'btn-ast':         { x: 7,   y: 68, w: 7,  h: 6 },
  'btn-foul':        { x: 14,  y: 68, w: 7,  h: 6 },
  'btn-stl':         { x: 0,   y: 75, w: 7,  h: 6 },
  'btn-blk':         { x: 7,   y: 75, w: 7,  h: 6 },
  'btn-to':          { x: 14,  y: 75, w: 7,  h: 6 },
  'btn-reb-a':       { x: 56,  y: 68, w: 7,  h: 6 },
  'btn-ast-a':       { x: 63,  y: 68, w: 7,  h: 6 },
  'btn-foul-a':      { x: 70,  y: 68, w: 7,  h: 6 },
  'btn-stl-a':       { x: 56,  y: 75, w: 7,  h: 6 },
  'btn-blk-a':       { x: 63,  y: 75, w: 7,  h: 6 },
  'btn-to-a':        { x: 70,  y: 75, w: 7,  h: 6 },
  'btn-sub':         { x: 42,  y: 68, w: 7,  h: 6 },
  'btn-undo':        { x: 49,  y: 68, w: 7,  h: 6 },
  'btn-poss-home':   { x: 58,  y: 68, w: 10, h: 6 },
  'btn-poss-away':   { x: 69,  y: 68, w: 10, h: 6 },
  'home-timeout':    { x: 80,  y: 68, w: 20, h: 6 },
  'away-timeout':    { x: 80,  y: 75, w: 20, h: 6 },
  'btn-horn':        { x: 0,   y: 76, w: 10, h: 7 },
  'btn-game-reset':  { x: 11,  y: 76, w: 10, h: 7 },
  'btn-sub-horn':    { x: 22,  y: 76, w: 10, h: 7 },
  'btn-replay':      { x: 33,  y: 76, w: 10, h: 7 },
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
