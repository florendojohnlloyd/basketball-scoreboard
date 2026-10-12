import React from 'react'
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useScoreboardStore, sendCommand } from '../store'
import { useTvLayoutStore } from '../tvLayoutStore'
import { exportLayoutToFile, importLayoutFromFile } from '../tvLayoutStore'
import { useTimeoutLayoutStore } from '../timeoutLayoutStore'
import type { TimeoutLayoutStore } from '../timeoutLayoutStore'
import { useLanguageStore, useT, TRANSLATIONS } from '../../shared/languageStore'
import { EditableWidget } from './EditableWidget'
import { EditableText } from './EditableText'
import { formatClockDisplay, formatClockPrecise } from '@renderer/shared/clockUtils'
import { formatPeriodLabel } from '@renderer/shared/periodUtils'
import { getImageUrl, readFileAsDataUrl } from '../../shared/imageUtils'
import './ScoreboardLayout.css'
import timeoutVideo from '../../shared/vid/FitnessExclusive.mp4'

// ---------------------------------------------------------------------------
// FitText — shrinks font-size so text always fits inside the container.
// Uses font-size reduction (NOT scaleX) so it never overflows its bounds.
// Pass fill=true to flex-grow and fill remaining space in a flex row.
// Pass baseFontPx to start from a fixed size instead of the inherited one.
// ---------------------------------------------------------------------------
function FitText({
  text,
  color,
  align = 'left',
  fill = false,
  baseFontPx,
}: {
  text: string
  color?: string
  align?: 'left' | 'right' | 'center'
  fill?: boolean
  baseFontPx?: number
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  const measure = useCallback(() => {
    const container = containerRef.current
    const inner = textRef.current
    if (!container || !inner) return

    // Reset to base size
    inner.style.fontSize = baseFontPx ? `${baseFontPx}px` : ''

    // Temporarily allow overflow so scrollWidth gives true natural width
    const prevOverflow = container.style.overflow
    container.style.overflow = 'visible'

    // Force reflow
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    container.offsetWidth

    const containerW = container.clientWidth
    const naturalW = inner.scrollWidth

    // Restore overflow
    container.style.overflow = prevOverflow

    if (containerW <= 0) {
      requestAnimationFrame(measure)
      return
    }

    if (naturalW > containerW) {
      const currentFs = parseFloat(getComputedStyle(inner).fontSize)
      // Extra margin: letter-spacing on last char is not in scrollWidth + 4px buffer
      const letterSpacing = parseFloat(getComputedStyle(inner).letterSpacing) || 0
      const extraPx = letterSpacing + 4
      const ratio = (containerW - extraPx) / naturalW
      const newFs = Math.max(currentFs * ratio, 8)
      inner.style.fontSize = `${newFs}px`
    }
  }, [baseFontPx])

  useLayoutEffect(() => { measure() }, [text, measure])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const justification =
    align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'

  return (
    <div
      ref={containerRef}
      style={{
        flex: fill ? '1 1 0' : undefined,
        width: fill ? undefined : '100%',
        height: '100%',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: justification,
        overflow: 'hidden',
        fontFamily: "'Arial Black', Impact, sans-serif",
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: color ?? 'inherit',
      }}
    >
      <span
        ref={textRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          color: 'inherit',
        }}
      >
        {text}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScoreboardName — renders a team name that always fits its container.
// Uses canvas.measureText() for pixel-perfect width measurement (no DOM
// layout timing issues). Font size starts at a large value then shrinks.
// ---------------------------------------------------------------------------
const SCOREBOARD_FONT_FAMILY = "'Arial Black', Impact, sans-serif"
const SCOREBOARD_BASE_FONT_PX = 500

function measureTextWidth(text: string, fontPx: number): number {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 9999
    ctx.font = `900 ${fontPx}px ${SCOREBOARD_FONT_FAMILY}`
    // letter-spacing isn't supported by canvas measureText, approximate it
    const letterSpacingPx = fontPx * 0.06 // matches letterSpacing: '0.06em'
    const metrics = ctx.measureText(text.toUpperCase())
    return metrics.width + letterSpacingPx * text.length
  } catch {
    return 9999
  }
}

function ScoreboardName({
  text,
  color,
  align = 'left',
  maxFontSize = 300,
}: {
  text: string
  color: string
  align?: 'left' | 'right' | 'center'
  maxFontSize?: number
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState(120)
  const [lines, setLines] = useState<string[]>([text])

  const MAX_FONT_PX = maxFontSize

  // Split words into N balanced lines minimising max-line-width
  const splitIntoLines = useCallback((words: string[], n: number): string[] => {
    if (n >= words.length) return words.map(w => w)
    if (n === 1) return [words.join(' ')]
    // Try all combinations for 2 lines; for 3 lines do greedy balanced
    if (n === 2) {
      let bestSplit = 1, bestDiff = Infinity
      for (let i = 1; i < words.length; i++) {
        const d = Math.abs(
          measureTextWidth(words.slice(0, i).join(' '), 1) -
          measureTextWidth(words.slice(i).join(' '), 1)
        )
        if (d < bestDiff) { bestDiff = d; bestSplit = i }
      }
      return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')]
    }
    // 3 lines: find two split points
    let best: string[] = [words.join(' ')]
    let bestMax = Infinity
    for (let i = 1; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const l1 = words.slice(0, i).join(' ')
        const l2 = words.slice(i, j).join(' ')
        const l3 = words.slice(j).join(' ')
        const maxW = Math.max(
          measureTextWidth(l1, 1),
          measureTextWidth(l2, 1),
          measureTextWidth(l3, 1)
        )
        if (maxW < bestMax) { bestMax = maxW; best = [l1, l2, l3] }
      }
    }
    return best
  }, [])

  const compute = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const containerW = el.clientWidth
    const containerH = el.clientHeight
    if (containerW <= 0 || containerH <= 0) { requestAnimationFrame(compute); return }

    const words = text.trim().toUpperCase().split(/\s+/)
    let bestScore = -1
    let bestFontSize = 36
    let bestLines: string[] = [text]

    const maxN = Math.min(2, words.length)
    for (let n = 1; n <= maxN; n++) {
      const ls = splitIntoLines(words, n)
      const maxLineW = Math.max(...ls.map(l => measureTextWidth(l, SCOREBOARD_BASE_FONT_PX)))
      const widthPx = Math.floor((SCOREBOARD_BASE_FONT_PX * (containerW - 12)) / maxLineW)
      const heightPx = Math.floor((containerH - (n - 1) * 6) / (n * 1.05))
      const px = Math.min(widthPx, heightPx, MAX_FONT_PX)

      let score = px
      if (n === 1 && words.length > 1) {
        score = px * 0.65
      }

      if (score > bestScore) {
        bestScore = score
        bestFontSize = px
        bestLines = ls
      }
    }

    setFontSize(Math.max(bestFontSize, 24))
    setLines(bestLines)
  }, [text, splitIntoLines])

  useLayoutEffect(() => { compute() }, [compute])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compute])

  const isWrapped = lines.length > 1

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '0 4px',
        boxSizing: 'border-box',
        gap: isWrapped ? '0.05em' : 0,
      }}
    >
      {lines.map((line, i) => (
        <span key={i} style={{
          fontFamily: SCOREBOARD_FONT_FAMILY,
          fontSize: `${fontSize}px`,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
          lineHeight: 1.05,
          color,
          display: 'block',
          textAlign: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
          width: '100%',
        }}>
          {line}
        </span>
      ))}
    </div>
  )
}

function ScoreboardLayout(): React.ReactElement {
  const gs = useScoreboardStore(s => s.gameState)
  const replayActive = useScoreboardStore(s => s.replayActive)
  const videoSrc = timeoutVideo
  const { home, away, gameClock, shotClock, period, gameConfig, possession, gamePhase } = gs

  async function handleLogoUpload(team: 'home' | 'away', e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      sendCommand({
        type: 'SET_TEAM_CONFIG',
        team,
        config: { logoPath: dataUrl }
      })
    } catch {
      // Fallback to file path if FileReader fails
      const filePath = (file as File & { path?: string }).path ?? file.name
      sendCommand({
        type: 'SET_TEAM_CONFIG',
        team,
        config: { logoPath: filePath }
      })
    }
  }

  const clockDisplay = formatClockPrecise(gameClock.displayMs)
  const shotSec = Math.ceil(shotClock.displayMs / 1000)
  const periodLabel = formatPeriodLabel(period, gameConfig)
  const isFlashing = gameClock.displayMs <= 10000 && (gameClock.running || gameClock.displayMs === 0)

  // Top 2 scorers per team
  const homeScorers = home.players.filter(p => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 2)
  const awayScorers = away.players.filter(p => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 2)

  // MVP
  const allP = [...home.players, ...away.players].sort((a, b) => b.points - a.points)
  const mvp = allP[0]?.points > 0 ? allP[0] : null


  // TV Layout store (must be called before any conditional returns — Rules of Hooks)
  const { layouts: tvLayouts, labels: tvLabels, editing: tvEditing, setEditing: setTvEditing, updateWidget: updateTvWidget, setLabel: setTvLabel, removeWidget: removeTvWidget, undo: undoTvLayout, resetLayout: resetTvLayout, addCustomText, deleteCustomText, customTexts, saveTemplate: saveTvTemplate, loadTemplate: loadTvTemplate, getTemplateNames: getTvTemplateNames, currentTemplate: tvCurrentTemplate } = useTvLayoutStore()
  const tvHistoryLen = useTvLayoutStore(s => s.history.length)

  // Timeout overlay layout config
  const toLayout = useTimeoutLayoutStore() as TimeoutLayoutStore

  // Language store — when language changes, push translated defaults into tvLabels
  const lang = useLanguageStore(s => s.lang)
  const t = useT()
  useEffect(() => {
    const translations = TRANSLATIONS[lang]
    // Apply translated defaults for any label the user hasn't manually overridden
    // We only push if the current stored value matches the other language's default
    // (i.e. the user hasn't customised it), so manual edits are preserved.
    const otherLang = lang === 'en' ? 'tl' : 'en'
    const otherTranslations = TRANSLATIONS[otherLang]
    const currentLabels = useTvLayoutStore.getState().labels
    const updates: Record<string, string> = {}
    for (const [key, translated] of Object.entries(translations)) {
      const current = currentLabels[key]
      const otherDefault = otherTranslations[key]
      // update if: never set, equals other-lang default, or equals current-lang default (already correct but ensure)
      if (!current || current === otherDefault || current === translations[key]) {
        updates[key] = translated
      }
    }
    if (Object.keys(updates).length > 0) {
      const store = useTvLayoutStore.getState()
      for (const [k, v] of Object.entries(updates)) {
        store.setLabel(k, v)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  // Fullscreen / windowed toggle
  const [isFullscreen, setIsFullscreen] = useState(true)

  useEffect(() => {
    async function syncFullscreen(): Promise<void> {
      try {
        const result = await window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'GET_WINDOW_STATE' }) as { isFullscreen?: boolean } | undefined
        if (result && typeof result.isFullscreen === 'boolean') {
          setIsFullscreen(result.isFullscreen)
        }
      } catch { /* ignore */ }
    }
    syncFullscreen()

    // Re-sync state when OS fullscreen actually changes (handles async delay)
    function onFullscreenChange(): void { syncFullscreen() }
    window.electron.ipcRenderer.on('window:fullscreen-change', onFullscreenChange)
    return () => { /* cleanup handled by renderer lifecycle */ }
  }, [])

  async function toggleFullscreen(): Promise<void> {
    try {
      const next = !isFullscreen
      setIsFullscreen(next) // optimistic update
      await window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: next ? 'SET_WINDOW_FULLSCREEN' : 'SET_WINDOW_WINDOWED',
      })
      // Re-sync after delay to confirm actual state
      setTimeout(async () => {
        try {
          const result = await window.electron.ipcRenderer.invoke('scoreboard:query', { type: 'GET_WINDOW_STATE' }) as { isFullscreen?: boolean } | undefined
          if (result && typeof result.isFullscreen === 'boolean') setIsFullscreen(result.isFullscreen)
        } catch { /* ignore */ }
      }, 600)
    } catch { /* ignore */ }
  }
  // Save/Load template modal state
  const [showTvTemplateModal, setShowTvTemplateModal] = useState<'save' | 'load' | 'export' | null>(null)
  const [tvTemplateName, setTvTemplateName] = useState('')
  // Alignment grid overlay (edit-mode helper)
  const [showGrid, setShowGrid] = useState(false)
  // Tools dropdown menu (collapses the edit-mode toolbar buttons)
  const [toolsOpen, setToolsOpen] = useState(false)

  // ESC key — exit / close the fullscreen TV window
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      // If editing, first press just leaves edit mode; otherwise close the window.
      if (tvEditing) {
        setTvEditing(false)
        return
      }
      try {
        window.close()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tvEditing, setTvEditing])

  // ═══ PRE-GAME ═══
  if (gamePhase === 'pre-game') {
    return (
      <div className="tv tv--pregame">
        <div className="tv-pre">
          <div className="tv-pre__liga">{gs.ligaName ?? 'BASKETBALL SCOREBOARD'}</div>
          <div className="tv-pre__matchup">
            <div className="tv-pre__team">
              <div className="tv-pre__logo-circle">{home.config.logoPath ? <img src={getImageUrl(home.config.logoPath)} alt="" /> : <span>A</span>}</div>
              <div className="tv-pre__name">{home.config.name}</div>
              <div className="tv-pre__players">{home.players.filter(p => p.active).slice(0, 5).map(p => <div key={p.id}>#{p.number} {p.name}</div>)}</div>
            </div>
            <div className="tv-pre__vs">VS</div>
            <div className="tv-pre__team">
              <div className="tv-pre__logo-circle">{away.config.logoPath ? <img src={getImageUrl(away.config.logoPath)} alt="" /> : <span>B</span>}</div>
              <div className="tv-pre__name">{away.config.name}</div>
              <div className="tv-pre__players">{away.players.filter(p => p.active).slice(0, 5).map(p => <div key={p.id}>#{p.number} {p.name}</div>)}</div>
            </div>
          </div>
          {home.config.playerImagePath && <img className="tv-pre__cutout tv-pre__cutout--left" src={getImageUrl(home.config.playerImagePath)} alt="" />}
          {away.config.playerImagePath && <img className="tv-pre__cutout tv-pre__cutout--right" src={getImageUrl(away.config.playerImagePath)} alt="" />}
        </div>
      </div>
    )
  }

  // ═══ GAME OVER ═══
  if (gamePhase === 'post-game') {
    const winner = home.score > away.score ? home : away.score > home.score ? away : null
    return (
      <div className="tv tv--gameover">
        <div className="tv-go__title">GAME OVER</div>
        <div className="tv-go__scores">
          <div><div className="tv-go__name" style={{ color: home.config.color }}>{home.config.name}</div><div className="tv-go__score">{home.score}</div></div>
          <div className="tv-go__sep">—</div>
          <div><div className="tv-go__name" style={{ color: away.config.color }}>{away.config.name}</div><div className="tv-go__score">{away.score}</div></div>
        </div>
        {winner && <div className="tv-go__winner">🏆 {winner.config.name} WINS!</div>}
        {mvp && <div className="tv-go__mvp">⭐ MVP: #{mvp.number} {mvp.name} — {mvp.points} PTS</div>}
      </div>
    )
  }

  // ═══ LIVE ═══

  return (
    <div className={`tv tv--live${tvEditing ? ' tv--editing' : ''}${!isFullscreen ? ' tv--windowed' : ''}`} style={{ position: 'relative' }}>

      {/* Drag handle — only shown in windowed mode, allows dragging the window */}
      {!isFullscreen && (
        <div className="tv-drag-handle">
          <span className="tv-drag-handle__icon">⠿</span>
          <span className="tv-drag-handle__text">Scoreboard — drag to move</span>
          <button
            className="tv-drag-handle__close"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => toggleFullscreen()}
            title="Back to fullscreen"
          >⛶</button>
        </div>
      )}

      {/* Alignment grid overlay (edit-mode helper) */}
      {tvEditing && showGrid && (
        <div className="tv-grid-overlay" aria-hidden="true">
          <div className="tv-grid-overlay__center-v" />
          <div className="tv-grid-overlay__center-h" />
        </div>
      )}

      {/* Invisible hover trigger zone — top-right corner reveals the edit toggle */}
      {!gs.timeout && <div className="tv-edit-trigger" aria-hidden="true" />}

      {/* Edit toggle button — hidden until hover over trigger zone */}
      {!gs.timeout && (
      <div className="tv-edit-toggle">
        <button className={`tv-edit-toggle__btn${tvEditing ? ' tv-edit-toggle__btn--active' : ''}`} onClick={() => { setTvEditing(!tvEditing); setToolsOpen(false) }}>
          {tvEditing ? '🔓 Lock' : '✏️ Edit'}
        </button>
        <button
          className="tv-edit-toggle__btn tv-edit-toggle__btn--screen"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Switch to windowed mode (draggable)' : 'Switch to fullscreen'}
        >
          {isFullscreen ? '⊡ Window' : '⛶ Fullscreen'}
        </button>

        {/* All edit tools collapsed into a single dropdown */}
        {tvEditing && (
          <div className="tv-tools-dropdown">
            <button
              className={`tv-edit-toggle__btn tv-tools-dropdown__trigger${toolsOpen ? ' tv-edit-toggle__btn--active' : ''}`}
              onClick={() => setToolsOpen(o => !o)}
              title="Mga tools para sa pag-edit"
            >
              🛠 Tools {toolsOpen ? '▲' : '▼'}
            </button>
            {toolsOpen && (
              <div className="tv-tools-dropdown__menu">
                <button className={`tv-tools-dropdown__item${showGrid ? ' is-active' : ''}`} onClick={() => setShowGrid(g => !g)}># Grid</button>
                <button className="tv-tools-dropdown__item" onClick={() => { addCustomText(); setToolsOpen(false) }}>+ Text</button>
                <button className="tv-tools-dropdown__item" onClick={() => undoTvLayout()} disabled={tvHistoryLen === 0}>↶ Undo</button>
                <button className="tv-tools-dropdown__item tv-tools-dropdown__item--warn" onClick={() => { resetTvLayout(); setToolsOpen(false) }}>↺ Reset</button>
                <div className="tv-tools-dropdown__sep" />
                {tvCurrentTemplate && <button className="tv-tools-dropdown__item tv-tools-dropdown__item--save" onClick={() => { saveTvTemplate(tvCurrentTemplate); setToolsOpen(false) }}>💾 Save "{tvCurrentTemplate}"</button>}
                <button className="tv-tools-dropdown__item tv-tools-dropdown__item--save" onClick={() => { setTvTemplateName(''); setShowTvTemplateModal('save'); setToolsOpen(false) }}>💾 Save As…</button>
                <button className="tv-tools-dropdown__item" onClick={() => { setTvTemplateName(''); setShowTvTemplateModal('load'); setToolsOpen(false) }}>📂 Load</button>
                <div className="tv-tools-dropdown__sep" />
                <button className="tv-tools-dropdown__item tv-tools-dropdown__item--save" onClick={() => { setTvTemplateName(''); setShowTvTemplateModal('export'); setToolsOpen(false) }}>⬇ Export File</button>
                <button className="tv-tools-dropdown__item" onClick={async () => { setToolsOpen(false); const name = await importLayoutFromFile(); if (name) alert(`✓ Loaded: ${name}`) }}>⬆ Import File</button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Save/Load template modal */}
      {showTvTemplateModal && (
        <div className="tv-template-modal" onClick={e => e.target === e.currentTarget && setShowTvTemplateModal(null)}>
          <div className="tv-template-modal__content">
            <h3>{showTvTemplateModal === 'save' ? '💾 Save Layout' : showTvTemplateModal === 'export' ? '⬇ Export Layout to File' : '📂 Load Layout'}</h3>
            {(showTvTemplateModal === 'save' || showTvTemplateModal === 'export') && (
              <>
                <input
                  className="tv-template-modal__input"
                  placeholder="Layout name (e.g. Game Day)"
                  value={tvTemplateName}
                  onChange={e => setTvTemplateName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && tvTemplateName.trim()) {
                      if (showTvTemplateModal === 'save') {
                        saveTvTemplate(tvTemplateName.trim())
                        setShowTvTemplateModal(null)
                      } else {
                        exportLayoutToFile(tvTemplateName.trim()).then(path => {
                          if (path) setShowTvTemplateModal(null)
                        })
                      }
                    }
                  }}
                  autoFocus
                />
                <div className="tv-template-modal__actions">
                  <button
                    className="tv-template-modal__btn tv-template-modal__btn--primary"
                    disabled={!tvTemplateName.trim()}
                    onClick={() => {
                      if (showTvTemplateModal === 'save') {
                        saveTvTemplate(tvTemplateName.trim())
                        setShowTvTemplateModal(null)
                      } else {
                        exportLayoutToFile(tvTemplateName.trim()).then(path => {
                          if (path) setShowTvTemplateModal(null)
                        })
                      }
                    }}
                  >{showTvTemplateModal === 'save' ? 'Save' : 'Export'}</button>
                  <button className="tv-template-modal__btn" onClick={() => setShowTvTemplateModal(null)}>Cancel</button>
                </div>
              </>
            )}
            {showTvTemplateModal === 'load' && (
              <>
                {getTvTemplateNames().length === 0
                  ? <p className="tv-template-modal__empty">Walang saved layouts pa.</p>
                  : <div className="tv-template-modal__list">
                      {getTvTemplateNames().map(name => (
                        <button
                          key={name}
                          className="tv-template-modal__item"
                          onClick={() => { loadTvTemplate(name); setShowTvTemplateModal(null) }}
                        >
                          📐 {name}
                        </button>
                      ))}
                    </div>
                }
                <button className="tv-template-modal__btn" style={{ marginTop: 12 }} onClick={() => setShowTvTemplateModal(null)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sport Title (e.g. BASKETBALL) */}
      <EditableWidget id="tv-header-sport" rect={tvLayouts['tv-header-sport']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Sport Title">
        <div className="tv-hdr" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <EditableText
            id="header-sport"
            value={tvLabels['header-sport'] ?? t('header-sport')}
            editing={tvEditing}
            onChange={setTvLabel}
            className="tv-hdr__text tv-hdr__text--sport"
          />
        </div>
      </EditableWidget>

      {/* Header Title (e.g. SCOREBOARD) */}
      <EditableWidget id="tv-header-title" rect={tvLayouts['tv-header-title']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Header Title">
        <div className="tv-hdr" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <EditableText
            id="header-title"
            value={tvLabels['header-title'] ?? t('header-title')}
            editing={tvEditing}
            onChange={setTvLabel}
            className="tv-hdr__text tv-hdr__text--title"
          />
        </div>
      </EditableWidget>

      {/* Home Score */}
      <EditableWidget id="tv-home-score" rect={tvLayouts['tv-home-score']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home Score">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span className="tv-side__score tv-side__score--home">{home.score}</span>
        </div>
      </EditableWidget>

      {/* Home Logo */}
      <EditableWidget id="tv-home-logo" rect={tvLayouts['tv-home-logo']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home Logo">
        <div className="tv-logo-container" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
          {home.config.logoPath ? (
            <img src={getImageUrl(home.config.logoPath)} alt="Home Logo" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:'8px'}} />
          ) : (
            <svg viewBox="0 0 100 100" style={{width:'85%',height:'85%',maxHeight:'100%',objectFit:'contain',filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.5))'}}>
              <circle cx="50" cy="50" r="45" fill="rgba(3,10,20,0.85)" stroke={home.config.color || '#2f8bff'} strokeWidth="4" />
              <circle cx="50" cy="50" r="38" fill="none" stroke={home.config.color || '#2f8bff'} strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />
              <circle cx="50" cy="50" r="25" fill="none" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              <path d="M 25 50 L 75 50" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              <path d="M 50 25 L 50 75" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              <path d="M 33 30 C 44 40 44 60 33 70" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.8" />
              <path d="M 67 30 C 56 40 56 60 67 70" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.8" />
            </svg>
          )}

          {/* Upload Logo button on hover/edit */}
          <label className="tv-logo-upload-btn" title="Click to upload Home Logo" onMouseDown={(e) => e.stopPropagation()}>
            <input type="file" accept="image/*" onChange={(e) => handleLogoUpload('home', e)} style={{display:'none'}} />
            <span>📷 Upload</span>
          </label>
        </div>
      </EditableWidget>

      {/* Away Score */}
      <EditableWidget id="tv-away-score" rect={tvLayouts['tv-away-score']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away Score">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span className="tv-side__score tv-side__score--away">{away.score}</span>
        </div>
      </EditableWidget>

      {/* Away Logo */}
      <EditableWidget id="tv-away-logo" rect={tvLayouts['tv-away-logo']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away Logo">
        <div className="tv-logo-container" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
          {away.config.logoPath ? (
            <img src={getImageUrl(away.config.logoPath)} alt="Away Logo" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:'8px'}} />
          ) : (
            <svg viewBox="0 0 100 100" style={{width:'85%',height:'85%',maxHeight:'100%',objectFit:'contain',filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.5))'}}>
              <circle cx="50" cy="50" r="45" fill="rgba(3,10,20,0.85)" stroke={away.config.color || '#ff2f4d'} strokeWidth="4" />
              <circle cx="50" cy="50" r="38" fill="none" stroke={away.config.color || '#ff2f4d'} strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />
              <circle cx="50" cy="50" r="25" fill="none" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              <path d="M 25 50 L 75 50" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              <path d="M 50 25 L 50 75" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
              <path d="M 33 30 C 44 40 44 60 33 70" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.8" />
              <path d="M 67 30 C 56 40 56 60 67 70" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.8" />
            </svg>
          )}

          {/* Upload Logo button on hover/edit */}
          <label className="tv-logo-upload-btn" title="Click to upload Away Logo" onMouseDown={(e) => e.stopPropagation()}>
            <input type="file" accept="image/*" onChange={(e) => handleLogoUpload('away', e)} style={{display:'none'}} />
            <span>📷 Upload</span>
          </label>
        </div>
      </EditableWidget>

      {/* Home Name */}
      <EditableWidget id="tv-home-name" rect={tvLayouts['tv-home-name']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home Name">
        <ScoreboardName
          text={home.config.name}
          color={home.config.color || '#2f8bff'}
          align="left"
        />
      </EditableWidget>

      {/* Away Name */}
      <EditableWidget id="tv-away-name" rect={tvLayouts['tv-away-name']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away Name">
        <ScoreboardName
          text={away.config.name}
          color={away.config.color || '#ff2f4d'}
          align="right"
        />
      </EditableWidget>

      {/* ── HOME TIMEOUT SECTION — 5 individual widgets ── */}

      {/* Home TO Title */}
      <EditableWidget id="tv-home-to-title" rect={tvLayouts['tv-home-to-title']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home: TIME OUTS">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'flex-start'}}>
          <EditableText id="timeouts-h" value={tvLabels['timeouts-h'] ?? t('timeouts-h')} editing={tvEditing} onChange={setTvLabel} className="tv-side__to-title" />
        </div>
      </EditableWidget>

      {/* Home F label */}
      <EditableWidget id="tv-home-to-f-label" rect={tvLayouts['tv-home-to-f-label']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home: F label">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingRight:'0.15em'}}>
          <EditableText id="to-f-label-h" value={(tvLabels['to-f-label-h'] ?? t('to-f-label-h')).replace(/:/g, '')} editing={tvEditing} onChange={setTvLabel} className="tv-side__to-key" />
        </div>
      </EditableWidget>

      {/* Home F value (fouls used) */}
      <EditableWidget id="tv-home-to-f-val" rect={tvLayouts['tv-home-to-f-val']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home: F value">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:'0.15em',paddingRight:'0.4em'}}>
          <span className="tv-side__to-val">{home.fouls}</span>
        </div>
      </EditableWidget>

      {/* Home T label */}
      <EditableWidget id="tv-home-to-t-label" rect={tvLayouts['tv-home-to-t-label']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home: T label">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:'0.4em',paddingRight:'0.15em'}}>
          <EditableText id="to-t-label-h" value={(tvLabels['to-t-label-h'] ?? t('to-t-label-h')).replace(/:/g, '')} editing={tvEditing} onChange={setTvLabel} className="tv-side__to-key" />
        </div>
      </EditableWidget>

      {/* Home T value (timeouts remaining) */}
      <EditableWidget id="tv-home-to-t-val" rect={tvLayouts['tv-home-to-t-val']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home: T value">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:'0.15em'}}>
          <span className="tv-side__to-val">{home.timeouts.fullRemaining}</span>
        </div>
      </EditableWidget>

      {/* ── AWAY TIMEOUT SECTION — 5 individual widgets ── */}

      {/* Away TO Title */}
      <EditableWidget id="tv-away-to-title" rect={tvLayouts['tv-away-to-title']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away: TIME OUTS">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'flex-end'}}>
          <EditableText id="timeouts-a" value={tvLabels['timeouts-a'] ?? t('timeouts-a')} editing={tvEditing} onChange={setTvLabel} className="tv-side__to-title" />
        </div>
      </EditableWidget>

      {/* Away F label */}
      <EditableWidget id="tv-away-to-f-label" rect={tvLayouts['tv-away-to-f-label']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away: F label">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingRight:'0.15em'}}>
          <EditableText id="to-f-label-a" value={(tvLabels['to-f-label-a'] ?? t('to-f-label-a')).replace(/:/g, '')} editing={tvEditing} onChange={setTvLabel} className="tv-side__to-key" />
        </div>
      </EditableWidget>

      {/* Away F value (fouls used) */}
      <EditableWidget id="tv-away-to-f-val" rect={tvLayouts['tv-away-to-f-val']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away: F value">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:'0.15em',paddingRight:'0.4em'}}>
          <span className="tv-side__to-val">{away.fouls}</span>
        </div>
      </EditableWidget>

      {/* Away T label */}
      <EditableWidget id="tv-away-to-t-label" rect={tvLayouts['tv-away-to-t-label']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away: T label">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:'0.4em',paddingRight:'0.15em'}}>
          <EditableText id="to-t-label-a" value={(tvLabels['to-t-label-a'] ?? t('to-t-label-a')).replace(/:/g, '')} editing={tvEditing} onChange={setTvLabel} className="tv-side__to-key" />
        </div>
      </EditableWidget>

      {/* Away T value (timeouts remaining) */}
      <EditableWidget id="tv-away-to-t-val" rect={tvLayouts['tv-away-to-t-val']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away: T value">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',paddingLeft:'0.15em'}}>
          <span className="tv-side__to-val">{away.timeouts.fullRemaining}</span>
        </div>
      </EditableWidget>

      {/* Home Scorers */}
      <EditableWidget id="tv-home-scorers" rect={tvLayouts['tv-home-scorers']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Home Scorers">
        <div className="tv-side__scorers" style={{width:'100%',height:'100%'}}>
          {homeScorers.map(p => <div key={p.id} className="tv-side__scorer"><span>{p.name}</span><span className="tv-side__scorer-pts">{p.points}</span></div>)}
        </div>
      </EditableWidget>

      {/* Away Scorers */}
      <EditableWidget id="tv-away-scorers" rect={tvLayouts['tv-away-scorers']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Away Scorers">
        <div className="tv-side__scorers tv-side__scorers--right" style={{width:'100%',height:'100%'}}>
          {awayScorers.map(p => <div key={p.id} className="tv-side__scorer"><span>{p.name}</span><span className="tv-side__scorer-pts">{p.points}</span></div>)}
        </div>
      </EditableWidget>

      {/* Clock */}
      <EditableWidget id="tv-clock" rect={tvLayouts['tv-clock']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Clock">
        <div className={`tv-mid__clock${isFlashing ? ' tv-mid__clock--flash' : ''}`} style={{display:'flex',alignItems:'center',justifyContent:'center'}}>{clockDisplay}</div>
      </EditableWidget>

      {/* Period */}
      <EditableWidget id="tv-period" rect={tvLayouts['tv-period']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Period">
        <div className="tv-mid__period" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>{periodLabel}</div>
      </EditableWidget>

      {/* Shot Clock LABEL — separate draggable widget */}
      <EditableWidget id="tv-shot-clock-label" rect={tvLayouts['tv-shot-clock-label']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Shot Clock Label">
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <EditableText id="shot-clock" value={tvLabels['shot-clock'] ?? t('shot-clock')} editing={tvEditing} onChange={setTvLabel} className="tv-mid__shot-label-standalone" />
        </div>
      </EditableWidget>

      {/* Shot Clock NUMBER — separate draggable widget */}
      <EditableWidget id="tv-shot-clock" rect={tvLayouts['tv-shot-clock']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Shot Clock Number">
        <div className={`tv-mid__shot-num-widget${shotSec <= 5 ? ' tv-mid__shot--warn' : ''}`} style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'0.1em'}}>
          <span className="tv-mid__shot-num">{shotClock.enabled ? shotSec : ''}</span>
          {shotClock.enabled && (
            <span style={{
              fontFamily: "'Cursed Timer ULiL', 'Courier New', monospace",
              fontSize: '0.45em',
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '0.08em',
              lineHeight: 1
            }}>
              .{Math.floor((shotClock.displayMs % 1000) / 10).toString().padStart(2, '0')}
            </span>
          )}
        </div>
      </EditableWidget>

      {/* Possession — arrows flanking the shot clock (always visible; active side highlighted) */}
      <EditableWidget id="tv-possession" rect={tvLayouts['tv-possession']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Possession">
        <div className="tv-mid__poss" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span className={`tv-mid__shot-arrow tv-mid__shot-arrow--left${possession === 'home' ? ' is-active' : ''}`}>◀</span>
          <span className={`tv-mid__shot-arrow tv-mid__shot-arrow--right${possession === 'away' ? ' is-active' : ''}`}>▶</span>
        </div>
      </EditableWidget>

      {/* Event Row */}
      <EditableWidget id="tv-event" rect={tvLayouts['tv-event']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Event">
        <div className="tv-event" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'1.5vw'}}>
          <EditableText id="event" value={tvLabels['event'] ?? 'EVENT'} editing={tvEditing} onChange={setTvLabel} className="tv-event__label" />
          <span className="tv-event__item">Date: <strong>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</strong></span>
        </div>
      </EditableWidget>

      {/* Sponsors */}
      <EditableWidget id="tv-sponsors" rect={tvLayouts['tv-sponsors']} editing={tvEditing} onUpdate={updateTvWidget} onRemove={removeTvWidget} label="Sponsors">
        <div className="tv-partners" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'2vw'}}>
          <EditableText id="partners" value={tvLabels['partners'] ?? 'PARTNERS'} editing={tvEditing} onChange={setTvLabel} className="tv-partners__label" />
          <div className="tv-partners__logos">
            {(gs.sponsorLogos || []).length > 0
              ? (gs.sponsorLogos || []).map((path, i) => (
                  <img key={i} className="tv-partners__img" src={getImageUrl(path)} alt={`Sponsor ${i + 1}`} />
                ))
              : <span className="tv-partners__placeholder">No sponsors uploaded</span>
            }
          </div>
        </div>
      </EditableWidget>

      {/* Custom free-text widgets (added via "Add Text" in edit mode) */}
      {customTexts.map(ct => (
        <EditableWidget
          key={ct.id}
          id={ct.id}
          rect={tvLayouts[ct.id] || { x: 30, y: 45, w: 40, h: 8 }}
          editing={tvEditing}
          onUpdate={updateTvWidget}
          onRemove={(id) => deleteCustomText(id)}
          label={`📝 ${ct.label}`}
        >
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EditableText
              id={ct.id}
              value={tvLabels[ct.id] ?? 'Your Text Here'}
              editing={tvEditing}
              onChange={(id, text) => {
                setTvLabel(id, text)
                // update the widget label to match the text for readability
                useTvLayoutStore.setState(s => ({
                  customTexts: s.customTexts.map(t => t.id === id ? { ...t, label: text.slice(0, 20) || 'Custom Text' } : t)
                }))
              }}
              className="tv-custom-text"
            />
          </div>
        </EditableWidget>
      ))}

      {/* Timeout overlay — layout driven by TimeoutLayoutStore, with its own edit mode */}
      {gs.timeout && (
        <TimeoutOverlay
          gs={gs}
          home={home}
          away={away}
          period={period}
          gameClock={gameClock}
          videoSrc={videoSrc}
          toLayout={toLayout}
        />
      )}

      {/* Replay overlay */}
      {replayActive && (
        <div className="tv-replay">
          <div className="tv-replay__bg" />
          <div className="tv-replay__content">
            <div className="tv-replay__label">REPLAY</div>
          </div>
        </div>
      )}

    </div>
  )
}

export default ScoreboardLayout

// ─────────────────────────────────────────────────────────────────────────────
// TimeoutOverlay — self-contained timeout screen with its own drag/edit mode
// ─────────────────────────────────────────────────────────────────────────────

const TO_LAYOUT_KEY = 'tv-timeout-widget-layout-v7'
const TO_LABELS_KEY = 'tv-timeout-labels-v1'
const TO_CUSTOM_IMG_KEY = 'tv-timeout-custom-img-v1'

const TO_WIDGET_DEFAULTS: Record<string, { x: number; y: number; w: number; h: number; fontScale?: number; hidden?: boolean }> = {
  'to-flash':      { x: 5,  y: 12, w: 40, h: 12, fontScale: 1.0 },  // Large TIMEOUT text (volleyball style)
  'to-team':       { x: 5,  y: 26, w: 40, h: 10, fontScale: 1.0, hidden: false },  // Large team name (volleyball style)
  'to-ring':       { x: 6,  y: 38, w: 38, h: 40 },  // Countdown timer
  'to-label':      { x: 6,  y: 80, w: 38, h: 6  },  // TIME REMAINING label (hidden via CSS)
  'to-video':      { x: 50, y: 0,  w: 50, h: 88 },
  'to-custom-img': { x: 50, y: 0,  w: 50, h: 88, hidden: true },
  // Bottom bar — continuous, touching (no gaps), full width
  'to-bar-home':   { x: 0,  y: 88, w: 34, h: 12 },
  'to-bar-center': { x: 34, y: 88, w: 32, h: 12 },
  'to-bar-away':   { x: 66, y: 88, w: 34, h: 12 },
}

const TO_LABEL_DEFAULTS: Record<string, string> = {
  'to-remaining-label': 'TIME REMAINING',
}

function loadToLayout(): Record<string, { x: number; y: number; w: number; h: number; fontScale?: number; hidden?: boolean }> {
  // Clear old versions
  localStorage.removeItem('tv-timeout-widget-layout-v4')
  localStorage.removeItem('tv-timeout-widget-layout-v5')
  localStorage.removeItem('tv-timeout-widget-layout-v6')
  
  try {
    const raw = localStorage.getItem(TO_LAYOUT_KEY)
    if (raw) return { ...TO_WIDGET_DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...TO_WIDGET_DEFAULTS }
}
function saveToLayout(l: Record<string, { x: number; y: number; w: number; h: number; fontScale?: number; hidden?: boolean }>) {
  localStorage.setItem(TO_LAYOUT_KEY, JSON.stringify(l))
}
function loadToLabels() {
  try {
    const raw = localStorage.getItem(TO_LABELS_KEY)
    if (raw) return { ...TO_LABEL_DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...TO_LABEL_DEFAULTS }
}
function saveToLabels(l: Record<string, string>) {
  localStorage.setItem(TO_LABELS_KEY, JSON.stringify(l))
}

function TimeoutOverlay({ gs, home, away, period, gameClock, videoSrc, toLayout }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gs: any; home: any; away: any; period: any; gameClock: any
  videoSrc: string
  toLayout: TimeoutLayoutStore
}): React.ReactElement {
  const [editing, setEditing] = React.useState(false)
  const [layouts, setLayouts] = React.useState<Record<string, { x: number; y: number; w: number; h: number; fontScale?: number; hidden?: boolean }>>(loadToLayout)
  const [labels, setLabels] = React.useState<Record<string, string>>(loadToLabels)
  const [customImg, setCustomImg] = React.useState<string | null>(() => {
    try { return localStorage.getItem(TO_CUSTOM_IMG_KEY) || null } catch { return null }
  })

  function updateWidget(id: string, partial: Partial<{ x: number; y: number; w: number; h: number; fontScale?: number; hidden?: boolean }>) {
    setLayouts(prev => {
      const next = { ...prev, [id]: { ...(prev[id] ?? TO_WIDGET_DEFAULTS[id] ?? { x: 0, y: 0, w: 20, h: 10 }), ...partial } }
      saveToLayout(next)
      return next
    })
  }
  function removeWidget(id: string) {
    updateWidget(id, { hidden: true })
  }
  function setLabel(id: string, text: string) {
    setLabels(prev => {
      const next = { ...prev, [id]: text }
      saveToLabels(next)
      return next
    })
  }
  function resetLayout() {
    saveToLayout(TO_WIDGET_DEFAULTS)
    saveToLabels(TO_LABEL_DEFAULTS)
    setLayouts({ ...TO_WIDGET_DEFAULTS })
    setLabels({ ...TO_LABEL_DEFAULTS })
  }

  async function handleCustomImgUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      localStorage.setItem(TO_CUSTOM_IMG_KEY, dataUrl)
      setCustomImg(dataUrl)
      // show the image widget, hide video widget
      updateWidget('to-custom-img', { hidden: false })
      updateWidget('to-video', { hidden: true })
    } catch {
      const path = (file as File & { path?: string }).path ?? file.name
      localStorage.setItem(TO_CUSTOM_IMG_KEY, path)
      setCustomImg(path)
      updateWidget('to-custom-img', { hidden: false })
      updateWidget('to-video', { hidden: true })
    }
  }

  function handleRemoveCustomImg(): void {
    localStorage.removeItem(TO_CUSTOM_IMG_KEY)
    setCustomImg(null)
    updateWidget('to-custom-img', { hidden: true })
    updateWidget('to-video', { hidden: false })
  }

  const rect = (id: string) => layouts[id] ?? TO_WIDGET_DEFAULTS[id] ?? { x: 0, y: 0, w: 20, h: 10 }
  const remainingMs = gs.timeout?.remainingMs ?? 0
  const teamName = gs.timeout ? gs[gs.timeout.team].config.name : ''
  const timeStr = `${String(Math.floor(remainingMs / 60000)).padStart(2, '0')}:${String(Math.ceil((remainingMs % 60000) / 1000)).padStart(2, '0')}`
  const ringPct = remainingMs / 60000
  const ringCircum = 2 * Math.PI * 90

  return (
    <div className="tv-timeout tv-timeout--canvas" style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 100 }}>

      {/* Invisible hover trigger zone */}
      <div className="tv-edit-trigger" aria-hidden="true" />

      {/* Edit toggle — hidden by default, shows on hover */}
      <div className="tv-edit-toggle" style={{ zIndex: 600 }}>
        <button
          className={`tv-edit-toggle__btn${editing ? ' tv-edit-toggle__btn--active' : ''}`}
          onClick={() => setEditing(e => !e)}
        >
          {editing ? '🔓 Lock' : '✏️ Edit Timeout'}
        </button>
        {editing && (
          <button className="tv-edit-toggle__btn tv-edit-toggle__btn--warn" onClick={resetLayout}>↺ Reset</button>
        )}
        {editing && (
          <label className="tv-edit-toggle__btn tv-edit-toggle__btn--save" title="Mag-upload ng PNG/image para sa ad panel" style={{ cursor: 'pointer' }}>
            📷 Upload Ads PNG
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCustomImgUpload} />
          </label>
        )}
        {editing && customImg && (
          <button className="tv-edit-toggle__btn" style={{ color: '#f88' }} onClick={handleRemoveCustomImg} title="Alisin ang uploaded image, ibalik ang video">✕ Remove Image</button>
        )}
      </div>

      {/* TIMEOUT flash text */}
      <EditableWidget id="to-flash" rect={rect('to-flash')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="TIMEOUT Text">
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="tv-timeout__flash" style={{ color: toLayout.flashColor }}>
            <EditableText id="to-flash-label" value={labels['to-flash-label'] ?? 'TIMEOUT'} editing={editing} onChange={setLabel} className="tv-timeout__flash" />
          </span>
        </div>
      </EditableWidget>

      {/* Team name */}
      <EditableWidget id="to-team" rect={rect('to-team')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="Team Name">
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="tv-timeout__team">{teamName}</span>
        </div>
      </EditableWidget>

      {/* Countdown time */}
      <EditableWidget id="to-ring" rect={rect('to-ring')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="Countdown Ring">
        <div className="tv-timeout__ring" style={{ width: '100%', height: '100%' }}>
          <div className="tv-timeout__ring-time">{timeStr}</div>
        </div>
      </EditableWidget>

      {/* "TIME REMAINING" label */}
      <EditableWidget id="to-label" rect={rect('to-label')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="Remaining Label">
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EditableText id="to-remaining-label" value={labels['to-remaining-label'] ?? 'TIME REMAINING'} editing={editing} onChange={setLabel} className="tv-timeout__remaining-label" />
        </div>
      </EditableWidget>

      {/* Video / Ad panel */}
      {(toLayout.mode === 'split' || toLayout.mode === 'full-video') && (
        <EditableWidget id="to-video" rect={rect('to-video')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="Video / Ad">
          <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 8, background: '#000' }}>
            <video className="tv-timeout__video" autoPlay loop muted playsInline src={videoSrc} />
          </div>
        </EditableWidget>
      )}

      {/* Custom PNG / Image panel (replaces video when uploaded) */}
      {customImg && (
        <EditableWidget id="to-custom-img" rect={rect('to-custom-img')} editing={editing} onUpdate={updateWidget} onRemove={(id) => { removeWidget(id); handleRemoveCustomImg() }} label="📷 Custom Image">
          <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 8, background: '#000', position: 'relative' }}>
            <img
              src={getImageUrl(customImg)}
              alt="Timeout Ad"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        </EditableWidget>
      )}

      {/* Bottom bar — one continuous bar (home | center | away), no logos */}
      {toLayout.showScoreBar && (
        <>
          <EditableWidget id="to-bar-home" rect={rect('to-bar-home')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="Bar: Home">
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'flex-start', gap: '0.4em', padding: '0 1.2vw', background: '#0a1020',
              borderTop: gs.timeout?.team === 'home' ? '3px solid #4a9eff' : '3px solid #17a2b8',
              overflow: 'hidden',
            }}>
              <span className="tv-timeout__bar-score" style={{ flexShrink: 0, color: '#fff', fontSize: '2rem' }}>{home.score}</span>
              <FitText
                text={home.config.name}
                align="left"
                fill={true}
                baseFontPx={34}
                color={gs.timeout?.team === 'home' ? '#4a9eff' : (home.config.color || '#4a9eff')}
              />
            </div>
          </EditableWidget>

          <EditableWidget id="to-bar-center" rect={rect('to-bar-center')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="Bar: Center">
            <div className="tv-timeout__bar-center" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a1020', borderTop: '3px solid #17a2b8' }}>
              <span className="tv-timeout__bar-period">Q{period.current}</span>
              <span className="tv-timeout__bar-clock">{formatClockDisplay(gameClock.displayMs)}</span>
            </div>
          </EditableWidget>

          <EditableWidget id="to-bar-away" rect={rect('to-bar-away')} editing={editing} onUpdate={updateWidget} onRemove={removeWidget} label="Bar: Away">
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'flex-end', gap: '0.4em', padding: '0 1.2vw', background: '#0a1020',
              borderTop: gs.timeout?.team === 'away' ? '3px solid #ff4a4a' : '3px solid #17a2b8',
              overflow: 'hidden',
            }}>
              <FitText
                text={away.config.name}
                align="right"
                fill={true}
                baseFontPx={34}
                color={gs.timeout?.team === 'away' ? '#ff4a4a' : (away.config.color || '#ff4a4a')}
              />
              <span className="tv-timeout__bar-score" style={{ flexShrink: 0, color: '#fff', fontSize: '2rem' }}>{away.score}</span>
            </div>
          </EditableWidget>
        </>
      )}
    </div>
  )
}
