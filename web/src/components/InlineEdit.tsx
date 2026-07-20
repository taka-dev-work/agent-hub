import { useState } from 'react'

export function InlineEdit({ value, placeholder, onSave, type = 'text' }: {
  value: string; placeholder: string; onSave: (v: string) => void; type?: 'text' | 'date'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <span onClick={() => { setDraft(value); setEditing(true) }}
        style={{ cursor: 'text', color: value ? 'inherit' : 'var(--text-3)' }}>
        {value || placeholder}
      </span>
    )
  }
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft) }
  return (
    <input className="inline" type={type} value={draft} autoFocus
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} />
  )
}
