import React, { useEffect, useRef, useState } from 'react'

interface EditableTextProps {
  /** Stable label id used to persist the override. */
  id: string
  /** Current text value (from the store). */
  value: string
  /** Whether the board is in edit mode. */
  editing: boolean
  /** Called with the new text when the user finishes editing. */
  onChange: (id: string, text: string) => void
  className?: string
  style?: React.CSSProperties
}

/**
 * A text span that becomes editable (inline) when the board is in Edit mode.
 * Outside edit mode it renders as plain text so the scoreboard stays clean.
 */
export function EditableText({ id, value, editing, onChange, className, style }: EditableTextProps): React.ReactElement {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the local draft in sync when the stored value changes externally.
  useEffect(() => {
    setDraft(value)
  }, [value])

  if (!editing) {
    return <span className={className} style={style}>{value}</span>
  }

  function commit(): void {
    const next = draft.trim()
    // Allow empty string (e.g. removing a label entirely).
    onChange(id, next)
  }

  return (
    <input
      ref={inputRef}
      className={`tv-editable-text ${className ?? ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          inputRef.current?.blur()
        }
      }}
      // Prevent the widget drag handler from hijacking clicks while typing.
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  )
}
