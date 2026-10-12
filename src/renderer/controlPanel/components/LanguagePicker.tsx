/**
 * LanguagePicker — inline implementation using only localStorage.
 * Does NOT import from the scoreboard bundle to avoid cross-bundle crashes.
 */
import React, { useState, useCallback } from 'react'

type AppLanguage = 'en' | 'tl'
const KEY = 'app-language-v1'

const OPTIONS: { value: AppLanguage; flag: string; label: string; sub: string }[] = [
  { value: 'en', flag: '🇺🇸', label: 'English',  sub: 'All labels in English' },
  { value: 'tl', flag: '🇵🇭', label: 'Filipino', sub: 'Lahat ng label sa Filipino' },
]

// Translations to apply on the scoreboard via localStorage
const TRANSLATIONS: Record<AppLanguage, Record<string, string>> = {
  en: {
    'header-sport': 'BASKETBALL', 'header-title': 'SCOREBOARD',
    'shot-clock': 'SHOT CLOCK', 'timeouts-h': 'TIME OUTS', 'timeouts-a': 'TIME OUTS',
    'to-f-label-h': 'F', 'to-t-label-h': 'T', 'to-f-label-a': 'F', 'to-t-label-a': 'T',
    'event': 'EVENT', 'partners': 'PARTNERS',
  },
  tl: {
    'header-sport': 'BASKETBOL', 'header-title': 'ISKORBOARD',
    'shot-clock': 'SHOT CLOCK', 'timeouts-h': 'TIME OUTS', 'timeouts-a': 'TIME OUTS',
    'to-f-label-h': 'F', 'to-t-label-h': 'T', 'to-f-label-a': 'F', 'to-t-label-a': 'T',
    'event': 'KAGANAPAN', 'partners': 'MGA KASOSYO',
  },
}

export function LanguagePicker(): React.ReactElement {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try { const r = localStorage.getItem(KEY); if (r === 'en' || r === 'tl') return r } catch {}
    return 'en'
  })

  const setLang = useCallback((l: AppLanguage) => {
    try { localStorage.setItem(KEY, l) } catch {}
    // Push translations to the scoreboard's label store via localStorage
    try {
      const labelsRaw = localStorage.getItem('tv-labels-v1')
      const labels = labelsRaw ? JSON.parse(labelsRaw) : {}
      const trans = TRANSLATIONS[l]
      const otherTrans = TRANSLATIONS[l === 'en' ? 'tl' : 'en']
      const updated = { ...labels }
      for (const [k, v] of Object.entries(trans)) {
        const cur = labels[k]
        if (!cur || cur === otherTrans[k] || cur === trans[k]) updated[k] = v
      }
      localStorage.setItem('tv-labels-v1', JSON.stringify(updated))
    } catch {}
    setLangState(l)
  }, [])

  return (
    <section className="lang-picker">
      <h3 className="lang-picker__title">🌐 Language / Wika</h3>
      <p className="lang-picker__hint">Changes default labels on the TV display.</p>
      <div className="lang-picker__options">
        {OPTIONS.map(opt => (
          <button key={opt.value}
            className={`lang-picker__btn${lang === opt.value ? ' lang-picker__btn--active' : ''}`}
            onClick={() => setLang(opt.value)}>
            <span className="lang-picker__flag">{opt.flag}</span>
            <span className="lang-picker__name">{opt.label}</span>
            <span className="lang-picker__sub">{opt.sub}</span>
            {lang === opt.value && <span className="lang-picker__check">✓</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
