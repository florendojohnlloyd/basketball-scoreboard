import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import type { WidgetRect } from '../tvLayoutStore'
import './EditableWidget.css'

interface EditableWidgetProps {
  id: string
  rect: WidgetRect
  editing: boolean
  onUpdate: (id: string, partial: Partial<WidgetRect>) => void
  onRemove?: (id: string) => void
  children: React.ReactNode
  label?: string
}

const FONT_SCALE_MIN = 0.4
const FONT_SCALE_MAX = 4
const FONT_SCALE_STEP = 0.1

export function EditableWidget({ id, rect, editing, onUpdate, onRemove, children, label }: EditableWidgetProps): React.ReactElement | null {
  const safeRect = rect || { x: 0, y: 0, w: 10, h: 8 }
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const startRef = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0, parentW: 1, parentH: 1 })

  const getParentSize = useCallback(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return { pw: 1, ph: 1 }
    return { pw: parent.clientWidth, ph: parent.clientHeight }
  }, [])

  // ── Start drag (mouse + touch) ──
  const startDrag = useCallback((clientX: number, clientY: number) => {
    const { pw, ph } = getParentSize()
    startRef.current = { mx: clientX, my: clientY, x: safeRect.x, y: safeRect.y, w: safeRect.w, h: safeRect.h, parentW: pw, parentH: ph }
    setDragging(true)
  }, [safeRect, getParentSize])

  const startResize = useCallback((clientX: number, clientY: number) => {
    const { pw, ph } = getParentSize()
    startRef.current = { mx: clientX, my: clientY, x: safeRect.x, y: safeRect.y, w: safeRect.w, h: safeRect.h, parentW: pw, parentH: ph }
    setResizing(true)
  }, [safeRect, getParentSize])

  // Mouse handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editing) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input')) return
    e.preventDefault()
    startDrag(e.clientX, e.clientY)
  }, [editing, startDrag])

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    startResize(e.clientX, e.clientY)
  }, [editing, startResize])

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!editing) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input')) return
    e.preventDefault()
    const touch = e.touches[0]
    startDrag(touch.clientX, touch.clientY)
  }, [editing, startDrag])

  const onResizeTouchStart = useCallback((e: React.TouchEvent) => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    const touch = e.touches[0]
    startResize(touch.clientX, touch.clientY)
  }, [editing, startResize])

  useEffect(() => {
    if (!dragging && !resizing) return

    function onMove(clientX: number, clientY: number): void {
      const s = startRef.current
      const dxPct = ((clientX - s.mx) / s.parentW) * 100
      const dyPct = ((clientY - s.my) / s.parentH) * 100

      if (dragging) {
        onUpdate(id, {
          x: Math.max(0, Math.min(95, s.x + dxPct)),
          y: Math.max(0, Math.min(95, s.y + dyPct)),
        })
      }
      if (resizing) {
        onUpdate(id, {
          w: Math.max(3, Math.min(100 - s.x, s.w + dxPct)),
          h: Math.max(3, Math.min(100 - s.y, s.h + dyPct)),
        })
      }
    }

    function onMouseMove(e: MouseEvent): void { onMove(e.clientX, e.clientY) }
    function onTouchMove(e: TouchEvent): void {
      e.preventDefault()
      onMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    function onEnd(): void {
      setDragging(false)
      setResizing(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [dragging, resizing, id, onUpdate])

  const fontScale = safeRect.fontScale ?? 1
  const hidden = safeRect.hidden === true

  // Track parent pixel size in state so any change triggers a re-render
  const [parentSize, setParentSize] = useState({ pw: window.innerWidth, ph: window.innerHeight })

  useLayoutEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return
    // Set immediately so first render has correct size
    setParentSize({ pw: parent.clientWidth, ph: parent.clientHeight })
    const ro = new ResizeObserver(() => {
      setParentSize({ pw: parent.clientWidth, ph: parent.clientHeight })
    })
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  // Compute font size every render — immediate response to w/h/fontScale/parentSize changes
  const computedFontPx = (() => {
    const widgetW = (safeRect.w / 100) * parentSize.pw
    const widgetH = (safeRect.h / 100) * parentSize.ph
    const px = Math.min(widgetW, widgetH) * 0.55 * (safeRect.fontScale ?? 1)
    return Math.max(8, Math.min(px, 400))
  })()

  const handleRemove = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onRemove?.(id)
  }, [id, onRemove])

  const changeFontScale = useCallback((delta: number) => {
    const current = (rect?.fontScale ?? 1)
    const next = Math.round(Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, current + delta)) * 10) / 10
    onUpdate(id, { fontScale: next })
  }, [id, rect, onUpdate])

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${safeRect.x}%`,
    top: `${safeRect.y}%`,
    width: `${safeRect.w}%`,
    height: `${safeRect.h}%`,
  }

  const contentStyle: React.CSSProperties = {
    '--ew-font-scale': fontScale,
    '--ew-font-px': `${computedFontPx}px`,
    fontSize: `${computedFontPx}px`,
  } as React.CSSProperties

  // When removed and NOT editing, don't render at all.
  if (hidden && !editing) return null

  return (
    <div
      ref={containerRef}
      className={`ew ${editing ? 'ew--editing' : ''} ${dragging ? 'ew--dragging' : ''} ${hidden ? 'ew--hidden' : ''}`}
      style={style}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {editing && label && <span className="ew__label">{label}</span>}
      {editing && (
        <div className="ew__font-controls">
          <button
            type="button"
            className="ew__font-btn"
            title="Liitan ang text"
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); changeFontScale(-FONT_SCALE_STEP) }}
            onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); changeFontScale(-FONT_SCALE_STEP) }}
          >A−</button>
          <span className="ew__font-value">{Math.round(fontScale * 100)}%</span>
          <button
            type="button"
            className="ew__font-btn"
            title="Lakihan ang text"
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); changeFontScale(FONT_SCALE_STEP) }}
            onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); changeFontScale(FONT_SCALE_STEP) }}
          >A+</button>
          <button
            type="button"
            className="ew__remove-btn"
            title={hidden ? 'Click to show this element again' : 'Hide this element (can undo)'}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              if (hidden) {
                // Unhide — set hidden: false directly
                onUpdate(id, { hidden: false })
              } else {
                onRemove?.(id)
              }
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
              e.preventDefault()
              if (hidden) {
                onUpdate(id, { hidden: false })
              } else {
                onRemove?.(id)
              }
            }}
          >{hidden ? '👁 Show' : '×'}</button>
        </div>
      )}
      <div className="ew__content" style={contentStyle}>
        {children}
      </div>
      {editing && !hidden && (
        <div
          className="ew__resize"
          onMouseDown={onResizeMouseDown}
          onTouchStart={onResizeTouchStart}
        />
      )}
    </div>
  )
}
