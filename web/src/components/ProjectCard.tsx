import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DashboardProject, ToolId } from '../types.ts'
import { patchProject, fmtTokens } from '../api.ts'
import { deadlineDays, projectStartCommand } from '../integrity.ts'
import { InlineEdit } from './InlineEdit.tsx'

const TOOL_SHORT: Record<ToolId, string> = { claude: 'CC', codex: 'CX', gemini: 'GM' }

function daysAgo(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - +new Date(iso)) / 86400000) : null
}
export function ProjectCard({ p, index, staleDays, deadlineWarnDays, onChanged }: {
  p: DashboardProject; index: number; staleDays: number; deadlineWarnDays: number; onChanged: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: p.id })
  const stale = daysAgo(p.lastCommitAt)
  const isStale = stale !== null && stale > staleDays
  const dl = deadlineDays(p.meta?.deadline ?? null)
  const save = (patch: Parameters<typeof patchProject>[1]) => patchProject(p.id, patch).then(onChanged)
  const startCmd = projectStartCommand(p.path)

  return (
    <div ref={setNodeRef} className="card"
      style={{ transform: CSS.Transform.toString(transform), transition, borderColor: isStale ? 'var(--red)' : 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-3)', touchAction: 'none' }}>⠿</span>
        <span style={{ fontSize: 20, fontWeight: 500, minWidth: 20, textAlign: 'center' }}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{p.id}</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8, fontFamily: 'monospace' }}>
            {p.path}{p.branch ? ` · ${p.branch}` : ''}
          </span>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
            <span className="badge" style={isStale ? { background: 'var(--red-bg)', color: 'var(--red-fg)' } : { background: 'var(--green-bg)', color: 'var(--green-fg)' }}>
              {stale === null ? '—' : stale === 0 ? 'today' : isStale ? `stale ${stale}d` : `${stale}d ago`}
            </span>
            {p.meta?.deadline && (
              <span className="badge" style={dl !== null && dl <= deadlineWarnDays ? { background: 'var(--amber-bg)', color: 'var(--amber-fg)' } : { background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                Due {p.meta.deadline}{dl !== null ? ` (${dl}d left)` : ''}
              </span>
            )}
            {(Object.entries(p.weeklyTokensByTool) as Array<[ToolId, number]>).map(([t, n]) => (
              <span key={t} className="badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent-fg)' }}>{TOOL_SHORT[t]} {fmtTokens(n)}/wk</span>
            ))}
            <span style={{ color: 'var(--text-2)' }}>
              <InlineEdit value={p.meta?.impact ?? ''} placeholder="No impact note" onSave={v => save({ impact: v })} />
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
            {p.plan && p.plan.total > 0 ? `${p.plan.done}/${p.plan.total} tasks · ${Math.round(p.plan.done / p.plan.total * 100)}%` : 'No plan'}
          </div>
          <div className="bar" style={{ height: 6 }}>
            {p.plan && p.plan.total > 0 && <div style={{ width: `${Math.round(p.plan.done / p.plan.total * 100)}%` }} />}
          </div>
        </div>
        <button onClick={() => save({ archived: true })} title="Archive">📦</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>Next action</span>
        <span style={{ flex: 1, fontSize: 13, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>
          <InlineEdit value={p.meta?.nextAction ?? ''} placeholder="Not set — click to edit" onSave={v => save({ nextAction: v })} />
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          Due: <InlineEdit type="date" value={p.meta?.deadline ?? ''} placeholder="none" onSave={v => save({ deadline: v || null } as any)} />
        </span>
        <button onClick={() => navigator.clipboard.writeText(startCmd).then(() => alert(`Copied:\n${startCmd}`))}>▶ Start</button>
      </div>
    </div>
  )
}
