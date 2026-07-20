import type { DashboardTool, ToolId, UsageTotals } from '../types.ts'
import { fmtTokens } from '../api.ts'

function Bar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0
  const color = !limit ? 'var(--text-3)' : pct > 90 ? 'var(--red)' : pct > 75 ? 'var(--amber)' : 'var(--accent)'
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
        <span>{label}</span>
        <span>{fmtTokens(used)} / {limit ? fmtTokens(limit) : '—'}</span>
      </div>
      <div className="bar"><div style={{ width: `${limit ? pct : used > 0 ? 8 : 0}%`, background: color }} /></div>
    </div>
  )
}

export function TokenPanel({ tools }: { tools: Record<ToolId, DashboardTool> }) {
  const periods: Array<[keyof UsageTotals, string]> = [['daily', 'Today'], ['weekly', 'This week'], ['monthly', 'This month']]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
      {(Object.entries(tools) as Array<[ToolId, DashboardTool]>).map(([id, t]) => (
        <div key={id} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{t.config.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {t.noData ? 'No data' : t.config.plan ? `${t.config.plan} (est.)` : 'no budget set'}
            </span>
          </div>
          {t.parseWarning && <div className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red-fg)', marginBottom: 8 }}>Log format changed?</div>}
          {t.noData
            ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No session logs found</div>
            : periods.map(([k, label]) => <Bar key={k} label={label} used={t.totals[k]} limit={t.config.limits?.[k] ?? null} />)}
          {t.rateLimits && (t.rateLimits.secondaryUsedPercent != null || t.rateLimits.primaryUsedPercent != null) && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
              Provider-reported: weekly {t.rateLimits.secondaryUsedPercent == null ? '—' : `${Math.round(t.rateLimits.secondaryUsedPercent)}%`} / 5h {t.rateLimits.primaryUsedPercent == null ? '—' : `${Math.round(t.rateLimits.primaryUsedPercent)}%`}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
