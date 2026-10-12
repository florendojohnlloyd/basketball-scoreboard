/**
 * Timeout Layout Store — controls the appearance and layout of the
 * TV timeout overlay screen. Settings are stored in localStorage and
 * consumed by ScoreboardLayout.tsx.
 *
 * Settings are intentionally simple so they work from both the TV window
 * (read) and the control panel (write).  Both run in the same renderer
 * process (or at minimum share the same localStorage origin) so this is safe.
 */
import { create } from 'zustand'

export type TimeoutMode =
  | 'split'       // default: left panel + right video
  | 'full-left'   // timeout info fills the whole screen (no video)
  | 'full-video'  // video fills the whole screen, countdown overlaid

const STORAGE_KEY = 'timeout-layout-v1'

export interface TimeoutLayout {
  /** Layout mode of the timeout screen */
  mode: TimeoutMode
  /** Width of the info panel as percentage (only for 'split' mode, 20–80) */
  panelWidthPct: number
  /** Background opacity of the info panel (0–1) */
  panelBgOpacity: number
  /** Colour of the countdown ring stroke */
  ringColor: string
  /** TIMEOUT flash text colour */
  flashColor: string
  /** Show / hide the bottom score bar */
  showScoreBar: boolean
}

const DEFAULTS: TimeoutLayout = {
  mode: 'split',
  panelWidthPct: 38,
  panelBgOpacity: 0.95,
  ringColor: '#4dc9f6',
  flashColor: '#f4d03f',
  showScoreBar: true,
}

function load(): TimeoutLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Always force mode back to 'split' so video panel is visible by default
      parsed.mode = 'split'
      return { ...DEFAULTS, ...parsed }
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

function save(layout: TimeoutLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
}

interface TimeoutLayoutStore extends TimeoutLayout {
  set: (partial: Partial<TimeoutLayout>) => void
  reset: () => void
}

export type { TimeoutLayoutStore }

export const useTimeoutLayoutStore = create<TimeoutLayoutStore>((setState) => ({
  ...load(),
  set: (partial) => setState((state) => {
    const updated = { ...state, ...partial }
    save({
      mode: updated.mode,
      panelWidthPct: updated.panelWidthPct,
      panelBgOpacity: updated.panelBgOpacity,
      ringColor: updated.ringColor,
      flashColor: updated.flashColor,
      showScoreBar: updated.showScoreBar,
    })
    return updated
  }),
  reset: () => setState(() => {
    save(DEFAULTS)
    return { ...DEFAULTS }
  }),
}))
