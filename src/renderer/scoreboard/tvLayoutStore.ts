/**
 * TV Layout Store — per-element drag/resize for the TV scoreboard display.
 * Uses zustand for shared state. Positions saved to localStorage.
 */
import { create } from 'zustand'

export interface WidgetRect {
  x: number
  y: number
  w: number
  h: number
}

const STORAGE_KEY = 'tv-layout-v1'

const DEFAULTS: Record<string, WidgetRect> = {
  'tv-header':      { x: 0,   y: 0,  w: 100, h: 7  },
  'tv-home-score':  { x: 0,   y: 8,  w: 20,  h: 20 },
  'tv-home-logo':   { x: 0,   y: 29, w: 10,  h: 12 },
  'tv-home-name':   { x: 0,   y: 42, w: 35,  h: 6  },
  'tv-home-to':     { x: 0,   y: 49, w: 35,  h: 4  },
  'tv-home-scorers':{ x: 0,   y: 54, w: 35,  h: 14 },
  'tv-away-score':  { x: 80,  y: 8,  w: 20,  h: 20 },
  'tv-away-logo':   { x: 90,  y: 29, w: 10,  h: 12 },
  'tv-away-name':   { x: 65,  y: 42, w: 35,  h: 6  },
  'tv-away-to':     { x: 65,  y: 49, w: 35,  h: 4  },
  'tv-away-scorers':{ x: 65,  y: 54, w: 35,  h: 14 },
  'tv-clock':       { x: 30,  y: 10, w: 40,  h: 22 },
  'tv-period':      { x: 38,  y: 8,  w: 24,  h: 6  },
  'tv-shot-clock':  { x: 42,  y: 33, w: 16,  h: 12 },
  'tv-possession':  { x: 40,  y: 46, w: 20,  h: 5  },
  'tv-event':       { x: 0,   y: 70, w: 100, h: 6  },
  'tv-sponsors':    { x: 0,   y: 77, w: 100, h: 7  },
}

function loadLayout(): Record<string, WidgetRect> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

function saveLayout(layout: Record<string, WidgetRect>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
}

interface TvLayoutStore {
  layouts: Record<string, WidgetRect>
  editing: boolean
  setEditing: (v: boolean) => void
  updateWidget: (id: string, partial: Partial<WidgetRect>) => void
  resetLayout: () => void
}

export const useTvLayoutStore = create<TvLayoutStore>((set) => ({
  layouts: loadLayout(),
  editing: false,
  setEditing: (v) => set({ editing: v }),
  updateWidget: (id, partial) => set((state) => {
    const updated = { ...state.layouts, [id]: { ...(state.layouts[id] || { x: 0, y: 0, w: 10, h: 10 }), ...partial } }
    saveLayout(updated)
    return { layouts: updated }
  }),
  resetLayout: () => {
    saveLayout(DEFAULTS)
    set({ layouts: { ...DEFAULTS } })
  },
}))
