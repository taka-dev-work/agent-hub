import type { ToolId } from '../types.ts'

const TABS: Array<{ id: ToolId | 'all'; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex' }, { id: 'gemini', label: 'Gemini' },
]

export function FilterTabs({ value, onChange }: { value: ToolId | 'all'; onChange: (v: ToolId | 'all') => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={value === t.id ? { background: 'var(--text)', color: 'var(--surface)', borderColor: 'var(--text)' } : {}}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
