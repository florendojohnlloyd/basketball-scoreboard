/**
 * TV Layout Store � per-element drag/resize for the TV scoreboard display.
 * Uses zustand for shared state. Positions saved to localStorage.
 */
import { create } from 'zustand'

export interface WidgetRect {
  x: number
  y: number
  w: number
  h: number
  hidden?: boolean
  fontScale?: number
}

const STORAGE_KEY = 'tv-layout-v60'

const DEFAULTS: Record<string, WidgetRect> = {
  // -- Header � hidden by default --
  'tv-header-sport': { x: 4,   y: 1,  w: 44, h: 10, hidden: true },
  'tv-header-title': { x: 52,  y: 1,  w: 44, h: 10, hidden: true },
  // -- HOME box --
  'tv-home-logo':    { x: 1,   y: 5,  w: 10, h: 14, hidden: true },
  'tv-home-name':    { x: 1,   y: 1,  w: 35, h: 27, fontScale: 1 },
  'tv-home-score':   { x: 1,   y: 10, w: 34, h: 88, fontScale: 1.35 },
  'tv-home-scorers': { x: 1,   y: 18, w: 26, h: 6,  hidden: true },
  // -- AWAY box --
  'tv-away-name':    { x: 62,  y: 1,  w: 37, h: 27, fontScale: 1 },
  'tv-away-logo':    { x: 89,  y: 5,  w: 10, h: 14, hidden: true },
  'tv-away-score':   { x: 65,  y: 10, w: 34, h: 88, fontScale: 1.35 },
  'tv-away-scorers': { x: 70,  y: 18, w: 26, h: 6,  hidden: true },
  // -- Center column --
  'tv-period':           { x: 37,  y: 2,  w: 26, h: 20, fontScale: 1.2 },
  'tv-clock':            { x: 31,  y: 23, w: 38, h: 26 },
  'tv-shot-clock-label': { x: 30,  y: 45, w: 40, h: 8 },
  'tv-shot-clock':       { x: 28,  y: 52, w: 44, h: 34 },
  'tv-possession':       { x: 33,  y: 58, w: 34, h: 20 },
  // -- Footer � HOME timeout section --
  'tv-home-to-title':   { x: 2,   y: 72, w: 18, h: 7,  hidden: true },
  'tv-home-to-f-label': { x: 2,   y: 74, w: 8,  h: 26 },
  'tv-home-to-f-val':   { x: 10,  y: 74, w: 8,  h: 26 },
  'tv-home-to-t-label': { x: 19,  y: 74, w: 8,  h: 26 },
  'tv-home-to-t-val':   { x: 27,  y: 74, w: 8,  h: 26 },
  // -- Footer � AWAY timeout section --
  'tv-away-to-title':   { x: 80,  y: 72, w: 18, h: 7,  hidden: true },
  'tv-away-to-f-label': { x: 65,  y: 74, w: 8,  h: 26 },
  'tv-away-to-f-val':   { x: 73,  y: 74, w: 8,  h: 26 },
  'tv-away-to-t-label': { x: 82,  y: 74, w: 8,  h: 26 },
  'tv-away-to-t-val':   { x: 90,  y: 74, w: 8,  h: 26 },
  // Legacy combined widgets � always hidden
  'tv-home-to':      { x: 5,   y: 85, w: 38, h: 12, hidden: true },
  'tv-away-to':      { x: 57,  y: 85, w: 38, h: 12, hidden: true },
  'tv-home-to-stats':{ x: 5,   y: 91, w: 38, h: 7,  hidden: true },
  'tv-away-to-stats':{ x: 57,  y: 91, w: 38, h: 7,  hidden: true },
  // -- Hidden by default --
  'tv-event':    { x: 0,   y: 96,  w: 100, h: 4, hidden: true },
  'tv-sponsors': { x: 0,   y: 100, w: 100, h: 4, hidden: true },
}

// -- File export/import helpers ----------------------------------------------

export async function exportLayoutToFile(name: string): Promise<string | null> {
  try {
    const layout = useTvLayoutStore.getState().layouts
    const blob = new Blob([JSON.stringify({ name, layout }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/\s+/g, '-')}-layout.json`
    a.click()
    URL.revokeObjectURL(url)
    return name
  } catch {
    return null
  }
}

export async function importLayoutFromFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string)
          const name = data.name ?? file.name
          const layout = data.layout ?? data
          const merged = { ...DEFAULTS, ...layout }
          useTvLayoutStore.getState().loadTemplate(name, merged)
          resolve(name)
        } catch { resolve(null) }
      }
      reader.readAsText(file)
    }
    input.click()
  })
}

// -- Store --------------------------------------------------------------------

export interface TvLayoutStore {
  layouts: Record<string, WidgetRect>
  labels: Record<string, string>
  customTexts: Array<{ id: string; text: string; label?: string }>
  editing: boolean
  history: Record<string, WidgetRect>[]
  currentTemplate: string | null
  setEditing: (v: boolean) => void
  updateWidget: (id: string, partial: Partial<WidgetRect>) => void
  removeWidget: (id: string) => void
  setLabel: (id: string, value: string) => void
  undo: () => void
  resetLayout: () => void
  addCustomText: () => void
  deleteCustomText: (id: string) => void
  saveTemplate: (name: string) => void
  loadTemplate: (name: string, layout?: Record<string, WidgetRect>) => void
  getTemplateNames: () => string[]
}

function loadLayout(): Record<string, WidgetRect> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Always force-override score + shot clock + possession from defaults
      parsed['tv-shot-clock-label'] = { ...DEFAULTS['tv-shot-clock-label'] }
      parsed['tv-shot-clock'] = { ...DEFAULTS['tv-shot-clock'] }
      parsed['tv-home-score'] = { ...DEFAULTS['tv-home-score'] }
      parsed['tv-away-score'] = { ...DEFAULTS['tv-away-score'] }
      parsed['tv-possession'] = { ...DEFAULTS['tv-possession'] }
      parsed['tv-home-to-f-label'] = { ...DEFAULTS['tv-home-to-f-label'] }
      parsed['tv-home-to-f-val']   = { ...DEFAULTS['tv-home-to-f-val'] }
      parsed['tv-home-to-t-label'] = { ...DEFAULTS['tv-home-to-t-label'] }
      parsed['tv-home-to-t-val']   = { ...DEFAULTS['tv-home-to-t-val'] }
      parsed['tv-away-to-f-label'] = { ...DEFAULTS['tv-away-to-f-label'] }
      parsed['tv-away-to-f-val']   = { ...DEFAULTS['tv-away-to-f-val'] }
      parsed['tv-away-to-t-label'] = { ...DEFAULTS['tv-away-to-t-label'] }
      parsed['tv-away-to-t-val']   = { ...DEFAULTS['tv-away-to-t-val'] }
      // Force-override name widgets so new font scale + size always applies
      parsed['tv-home-name'] = { ...DEFAULTS['tv-home-name'] }
      parsed['tv-away-name'] = { ...DEFAULTS['tv-away-name'] }
      // Force-override period widget so new size always applies
      parsed['tv-period'] = { ...DEFAULTS['tv-period'] }
      // Strip fontScale from all except score/name widgets
      const keepFontScale = new Set(['tv-home-score', 'tv-away-score', 'tv-home-name', 'tv-away-name'])
      for (const key of Object.keys(parsed)) {
        if (parsed[key] && typeof parsed[key] === 'object' && !keepFontScale.has(key)) {
          delete parsed[key].fontScale
        }
      }
      const merged = { ...DEFAULTS, ...parsed }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      return merged
    }
  } catch {}
  return { ...DEFAULTS }
}

function saveLayout(layout: Record<string, WidgetRect>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
}

export const useTvLayoutStore = create<TvLayoutStore>((set, get) => ({
  layouts: loadLayout(),
  labels: JSON.parse(localStorage.getItem('tv-labels') || '{}'),
  customTexts: JSON.parse(localStorage.getItem('tv-custom-texts') || '[]'),
  editing: false,
  history: [],
  currentTemplate: localStorage.getItem('tv-current-template') || null,

  setEditing: (v) => set({ editing: v }),

  updateWidget: (id, partial) => set((state) => {
    const prev = state.layouts
    const updated = { ...prev, [id]: { ...prev[id], ...partial } }
    saveLayout(updated)
    return { layouts: updated, history: [...state.history.slice(-19), prev] }
  }),

  removeWidget: (id) => set((state) => {
    const prev = state.layouts
    const updated = { ...prev, [id]: { ...prev[id], hidden: true } }
    saveLayout(updated)
    return { layouts: updated, history: [...state.history.slice(-19), prev] }
  }),

  setLabel: (id, value) => set((state) => {
    const updated = { ...state.labels, [id]: value }
    localStorage.setItem('tv-labels', JSON.stringify(updated))
    return { labels: updated }
  }),

  undo: () => set((state) => {
    if (state.history.length === 0) return state
    const history = [...state.history]
    const prev = history.pop()!
    saveLayout(prev)
    return { layouts: prev, history }
  }),

  resetLayout: () => {
    saveLayout(DEFAULTS)
    set({ layouts: { ...DEFAULTS }, history: [], currentTemplate: null })
    localStorage.removeItem('tv-current-template')
  },

  addCustomText: () => set((state) => {
    const id = `custom-text-${Date.now()}`
    const newText = { id, text: 'TEXT' }
    const updated = [...state.customTexts, newText]
    localStorage.setItem('tv-custom-texts', JSON.stringify(updated))
    // Add a default widget rect for the new custom text
    const newLayouts = {
      ...state.layouts,
      [id]: { x: 40, y: 50, w: 20, h: 8 }
    }
    saveLayout(newLayouts)
    return { customTexts: updated, layouts: newLayouts }
  }),

  deleteCustomText: (id) => set((state) => {
    const updated = state.customTexts.filter(t => t.id !== id)
    localStorage.setItem('tv-custom-texts', JSON.stringify(updated))
    const { [id]: _removed, ...restLayouts } = state.layouts
    saveLayout(restLayouts)
    return { customTexts: updated, layouts: restLayouts }
  }),

  saveTemplate: (name) => {
    const templates = JSON.parse(localStorage.getItem('tv-templates') || '{}')
    templates[name] = get().layouts
    localStorage.setItem('tv-templates', JSON.stringify(templates))
    localStorage.setItem('tv-current-template', name)
    set({ currentTemplate: name })
  },

  loadTemplate: (name, layout) => {
    const merged = layout ?? (() => {
      const templates = JSON.parse(localStorage.getItem('tv-templates') || '{}')
      return templates[name] ? { ...DEFAULTS, ...templates[name] } : { ...DEFAULTS }
    })()
    saveLayout(merged)
    localStorage.setItem('tv-current-template', name)
    set({ layouts: merged, currentTemplate: name })
  },

  getTemplateNames: () => {
    return Object.keys(JSON.parse(localStorage.getItem('tv-templates') || '{}'))
  },
}))
