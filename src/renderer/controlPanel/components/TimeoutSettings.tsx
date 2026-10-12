/**
 * TimeoutSettings — inline implementation using only localStorage.
 * Does NOT import from the scoreboard bundle to avoid cross-bundle crashes.
 */
import React, { useState, useCallback } from 'react'

type TimeoutMode = 'split' | 'full-left' | 'full-video'

interface TL {
  mode: TimeoutMode
  panelWidthPct: number
  panelBgOpacity: number
  ringColor: string
  flashColor: string
  showScoreBar: boolean
}

const KEY = 'timeout-layout-v1'
const DEF: TL = { mode: 'split', panelWidthPct: 38, panelBgOpacity: 0.95, ringColor: '#4dc9f6', flashColor: '#f4d03f', showScoreBar: true }

function load(): TL {
  try { const r = localStorage.getItem(KEY); if (r) return { ...DEF, ...JSON.parse(r) } } catch {}
  return { ...DEF }
}
function save(v: TL) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }

const MODES: { value: TimeoutMode; label: string; desc: string }[] = [
  { value: 'split',      label: '⬛ Split',     desc: 'Info + video' },
  { value: 'full-left',  label: '📋 Info Only', desc: 'No video' },
  { value: 'full-video', label: '🎥 Full Video', desc: 'Video + overlay' },
]

export function TimeoutSettings(): React.ReactElement {
  const [tl, setTl] = useState<TL>(load)

  const set = useCallback((partial: Partial<TL>) => {
    setTl(prev => { const next = { ...prev, ...partial }; save(next); return next })
  }, [])

  const reset = useCallback(() => { save(DEF); setTl({ ...DEF }) }, [])

  return (
    <section className="to-settings">
      <h3 className="to-settings__title">⏱ Timeout Screen</h3>

      <div className="to-settings__group">
        <label className="to-settings__label">Layout Mode</label>
        <div className="to-settings__mode-row">
          {MODES.map(opt => (
            <button key={opt.value}
              className={`to-settings__mode-btn${tl.mode === opt.value ? ' to-settings__mode-btn--active' : ''}`}
              onClick={() => set({ mode: opt.value })}
            >
              {opt.label}<span className="to-settings__mode-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {tl.mode === 'split' && (
        <div className="to-settings__group">
          <label className="to-settings__label">Panel Width &nbsp;<strong style={{ color: '#ffd21c' }}>{tl.panelWidthPct}%</strong></label>
          <input type="range" min={20} max={80} step={2} value={tl.panelWidthPct}
            onChange={e => set({ panelWidthPct: Number(e.target.value) })} className="to-settings__range" />
        </div>
      )}

      <div className="to-settings__group">
        <label className="to-settings__label">Background Opacity &nbsp;<strong style={{ color: '#ffd21c' }}>{Math.round(tl.panelBgOpacity * 100)}%</strong></label>
        <input type="range" min={0} max={1} step={0.05} value={tl.panelBgOpacity}
          onChange={e => set({ panelBgOpacity: Number(e.target.value) })} className="to-settings__range" />
      </div>

      <div className="to-settings__group to-settings__group--inline">
        <label className="to-settings__label">Ring Colour</label>
        <input type="color" value={tl.ringColor} onChange={e => set({ ringColor: e.target.value })} className="to-settings__color" />
        <span className="to-settings__color-val">{tl.ringColor}</span>
      </div>

      <div className="to-settings__group to-settings__group--inline">
        <label className="to-settings__label">Flash Colour</label>
        <input type="color" value={tl.flashColor} onChange={e => set({ flashColor: e.target.value })} className="to-settings__color" />
        <span className="to-settings__color-val">{tl.flashColor}</span>
      </div>

      <div className="to-settings__group to-settings__group--inline">
        <label className="to-settings__label">Score Bar</label>
        <button className={`to-settings__toggle${tl.showScoreBar ? ' to-settings__toggle--on' : ''}`}
          onClick={() => set({ showScoreBar: !tl.showScoreBar })}>
          {tl.showScoreBar ? '🟢 ON' : '⚫ OFF'}
        </button>
      </div>

      <button className="to-settings__reset" onClick={reset}>↺ Reset defaults</button>
    </section>
  )
}
