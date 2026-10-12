/**
 * Language Store — app-wide English / Tagalog toggle.
 * Persisted to localStorage. Consumed by any component that shows user-facing labels.
 */
import { create } from 'zustand'

export type AppLanguage = 'en' | 'tl'

const STORAGE_KEY = 'app-language-v1'

function loadLang(): AppLanguage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'en' || raw === 'tl') return raw
  } catch { /* ignore */ }
  return 'en'
}

// ── Translation map ───────────────────────────────────────────────────────
// Keys match the label IDs used in tvLayoutStore DEFAULT_LABELS
// and other places in the UI.
export const TRANSLATIONS: Record<AppLanguage, Record<string, string>> = {
  en: {
    // Scoreboard header
    'header-sport':       'BASKETBALL',
    'header-title':       'SCOREBOARD',
    // Timeout section
    'timeouts-h':         'TIME OUTS',
    'timeouts-a':         'TIME OUTS',
    'to-f-label-h':       'F',
    'to-t-label-h':       'T',
    'to-f-label-a':       'F',
    'to-t-label-a':       'T',
    // Clock / period
    'shot-clock':         'SHOT CLOCK',
    // Event / partners
    'event':              'EVENT',
    'partners':           'PARTNERS',
    // Timeout overlay
    'to-flash-label':     'TIMEOUT',
    'to-remaining-label': 'TIME REMAINING',
    // General UI labels (control panel)
    'ui.score':           'SCORE',
    'ui.roster':          'ROSTER',
    'ui.branding':        'BRANDING',
    'ui.history':         'HISTORY',
    'ui.season':          'SEASON',
    'ui.leaders':         'LEADERS',
    'ui.audit':           'AUDIT',
    'ui.settings':        'SETTINGS',
    'ui.tournament':      'TOURNAMENT',
    'ui.home':            'HOME',
    'ui.away':            'AWAY',
    'ui.quarter':         'QUARTER',
    'ui.halftime':        'HALFTIME',
    'ui.overtime':        'OVERTIME',
    'ui.fouls':           'FOULS',
    'ui.timeouts':        'TIMEOUTS',
    'ui.possession':      'POSSESSION',
    'ui.gameover':        'GAME OVER',
    'ui.pregame':         'PRE-GAME',
  },
  tl: {
    // Scoreboard header
    'header-sport':       'BASKETBOL',
    'header-title':       'ISKORBOARD',
    // Timeout section
    'timeouts-h':         'TIME OUTS',
    'timeouts-a':         'TIME OUTS',
    'to-f-label-h':       'F',
    'to-t-label-h':       'T',
    'to-f-label-a':       'F',
    'to-t-label-a':       'T',
    // Clock / period
    'shot-clock':         'SHOT CLOCK',
    // Event / partners
    'event':              'KAGANAPAN',
    'partners':           'MGA KASOSYO',
    // Timeout overlay
    'to-flash-label':     'TIMEOUT',
    'to-remaining-label': 'NATITIRANG ORAS',
    // General UI labels (control panel)
    'ui.score':           'ISKOR',
    'ui.roster':          'ROSTER',
    'ui.branding':        'BRANDING',
    'ui.history':         'KASAYSAYAN',
    'ui.season':          'SEASON',
    'ui.leaders':         'NANGUNGUNA',
    'ui.audit':           'AUDIT',
    'ui.settings':        'MGA SETTING',
    'ui.tournament':      'TORNEO',
    'ui.home':            'TAHANAN',
    'ui.away':            'BISITA',
    'ui.quarter':         'QUARTER',
    'ui.halftime':        'KALAHATI',
    'ui.overtime':        'OVERTIME',
    'ui.fouls':           'MGA FOUL',
    'ui.timeouts':        'MGA TIMEOUT',
    'ui.possession':      'HAWAK',
    'ui.gameover':        'TAPOS NA ANG LARO',
    'ui.pregame':         'BAGO ANG LARO',
  },
}

interface LanguageStore {
  lang: AppLanguage
  setLang: (lang: AppLanguage) => void
  /** Get a translated string by key, falls back to key if not found. */
  t: (key: string) => string
}

export const useLanguageStore = create<LanguageStore>((set, get) => ({
  lang: loadLang(),
  setLang: (lang) => {
    localStorage.setItem(STORAGE_KEY, lang)
    set({ lang })
  },
  t: (key: string) => {
    const { lang } = get()
    return TRANSLATIONS[lang][key] ?? TRANSLATIONS['en'][key] ?? key
  },
}))

/** Convenience hook — returns the translate function directly. */
export function useT(): (key: string) => string {
  return useLanguageStore(s => s.t)
}
