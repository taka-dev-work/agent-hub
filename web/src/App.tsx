import { useState } from 'react'
import { useDashboard, patchProject } from './api.ts'
import { TokenPanel } from './components/TokenPanel.tsx'
import { ProjectList } from './components/ProjectList.tsx'
import { FilterTabs } from './components/FilterTabs.tsx'
import { ThemeToggle } from './components/ThemeToggle.tsx'
import { isDeadlineSoon } from './integrity.ts'
import type { ToolId } from './types.ts'

export default function App() {
  const { data, error, reload } = useDashboard()
  const [filter, setFilter] = useState<ToolId | 'all'>('all')
  const [showArchived, setShowArchived] = useState(false)
  if (error) return <p>Failed to load: {error}</p>
  if (!data) return <p style={{ color: 'var(--text-3)' }}>Scanning… (the first run parses all session logs and can take a while)</p>

  const active = data.projects.filter(p => !p.meta?.archived)
  const archived = data.projects.filter(p => p.meta?.archived)
  const visible = filter === 'all' ? active : active.filter(p => (p.weeklyTokensByTool[filter] ?? 0) > 0)
  const staleCount = active.filter(p => p.lastCommitAt && (Date.now() - +new Date(p.lastCommitAt)) / 86400000 > data.staleDays).length
  const dlSoon = active.filter(p => isDeadlineSoon(p.meta?.deadline ?? null, data.deadlineWarnDays)).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Agent hub</h1>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>scanned {new Date(data.scannedAt).toLocaleString()}</span>
          <button onClick={reload}>Rescan</button>
          <ThemeToggle />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red-fg)' }}>Stale {staleCount}</span>
          <span className="badge" style={{ background: 'var(--amber-bg)', color: 'var(--amber-fg)' }}>Due soon {dlSoon}</span>
        </div>
      </div>
      <TokenPanel tools={data.tools} />
      <FilterTabs value={filter} onChange={setFilter} />
      <ProjectList projects={visible} fullOrderIds={active.map(p => p.id)} staleDays={data.staleDays} deadlineWarnDays={data.deadlineWarnDays} onChanged={reload} />
      {filter !== 'all' && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Showing only projects with tokens spent this week via this tool ({active.length - visible.length} hidden)</p>}
      {archived.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 16px', border: '0.5px dashed var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text-2)' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '▼' : '▶'} Archived ({archived.length})
          </span>
          {showArchived && archived.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span>{p.id} <span style={{ color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 12 }}>{p.path}</span></span>
              <button onClick={() => patchProject(p.id, { archived: false }).then(reload)}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
