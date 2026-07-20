import type { Config, Store, DashboardResponse, DashboardProject, ToolId, UsageTotals, CodexRateLimits } from './types.ts'
import type { FoundProject } from './scan/projects.ts'
import type { PlanFacts } from './types.ts'

export interface DashboardDeps {
  config: Config
  store: Store
  found: FoundProject[]
  gitFactsFn: (absPath: string) => Promise<{ branch: string | null; lastCommitAt: string | null }>
  plans: Map<string, PlanFacts>
  usage: {
    totals: Record<ToolId, UsageTotals>
    weeklyByProject: Record<ToolId, Record<string, number>>
    parseWarnings: Record<ToolId, boolean>
    codexRateLimits: CodexRateLimits | null
  }
}

export async function buildDashboard(deps: DashboardDeps): Promise<DashboardResponse> {
  const { config, store, found, gitFactsFn, plans, usage } = deps
  const projects: DashboardProject[] = await Promise.all(found.map(async f => {
    const git = await gitFactsFn(f.absPath)
    const weeklyTokensByTool: Partial<Record<ToolId, number>> = {}
    for (const tool of Object.keys(usage.weeklyByProject) as ToolId[]) {
      const v = usage.weeklyByProject[tool][f.absPath]
      if (v) weeklyTokensByTool[tool] = v
    }
    return { ...f, ...git, plan: plans.get(f.id) ?? null, meta: store.projects[f.id] ?? null, weeklyTokensByTool }
  }))

  projects.sort((a, b) => {
    const ra = a.meta?.rank ?? 9999, rb = b.meta?.rank ?? 9999
    if (ra !== rb) return ra - rb
    return (b.lastCommitAt ?? '').localeCompare(a.lastCommitAt ?? '')
  })

  const tools = {} as DashboardResponse['tools']
  for (const tool of Object.keys(config.tools) as ToolId[]) {
    tools[tool] = {
      config: config.tools[tool],
      totals: usage.totals[tool] ?? { daily: 0, weekly: 0, monthly: 0 },
      parseWarning: usage.parseWarnings[tool] ?? false,
      ...(tool === 'codex' && usage.codexRateLimits ? { rateLimits: usage.codexRateLimits } : {}),
      ...(tool === 'gemini' ? { noData: true } : {}),
    }
  }

  return { scannedAt: new Date().toISOString(), projects, tools, staleDays: config.staleDays, deadlineWarnDays: config.deadlineWarnDays }
}
