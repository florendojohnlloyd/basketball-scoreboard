import React, { useState, useRef, useCallback, useEffect } from 'react'
import './DraggableWidget.css'

export interface WidgetLayout {
  id: string
  x: number
  y: number
  w: number
  h: number
}

interface DraggableWidgetProps {
  id: string
  layout: WidgetLayout
  editing: boolean
  onLayoutChange: (id: string, layout: Partial<WidgetLayout>) => void
  children: React.ReactNode
  label?: string
}

export function DraggableWidget({
  id,
  layout,
  editing,
  onLayoutChange,
  children,
  label,
}: DraggableWidgetProps): React.ReactElement {
  const elRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const startRef = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 })

  // ── DRAG ──
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
    startRef.current = { mx: e.clientX, my: e.clientY, x: layout.x, y: layout.y, w: layout.w, h: layout.h }
  }, [editing, layout])

  // ── RESIZE ──
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    startRef.current = { mx: e.clientX, my: e.clientY, x: layout.x, y: layout.y, w: layout.w, h: layout.h }
  }, [editing, layout])

  useEffect(() => {
    if (!dragging && !resizing) return

    function onMove(e: MouseEvent): void {
      const dx = e.clientX - startRef.current.mx
      const dy = e.clientY - startRef.current.my
      if (dragging) {
        onLayoutChange(id, {
          x: Math.max(0, startRef.current.x + dx),
          y: Math.max(0, startRef.current.y + dy),
        })
      }
      if (resizing) {
        onLayoutChange(id, {
          w: Math.max(40, startRef.current.w + dx),
          h: Math.max(24, startRef.current.h + dy),
        })
      }
    }

    function onUp(): void {
      setDragging(false)
      setResizing(false)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, resizing, id, onLayoutChange])

  const style: React.CSSProperties = {
    position: 'absolute',
    left: layout.x,
    top: layout.y,
    width: layout.w,
    height: layout.h,
  }

  return (
    <div
      ref={elRef}
      className={`dw ${editing ? 'dw--editing' : ''} ${dragging ? 'dw--dragging' : ''}`}
      style={style}
      onMouseDown={onDragStart}
    >
      {editing && label && <span className="dw__label">{label}</span>}
      <div className="dw__content">{children}</div>
      {editing && (
        <div className="dw__resize" onMouseDown={onResizeStart} />
      )}
    </div>
  )
}
