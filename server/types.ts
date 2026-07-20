export type ToolId = 'claude' | 'codex' | 'gemini'

export interface ProjectMeta {
  path: string          // "~/name" form
  rank: number          // 1 = top priority; unranked discoveries default to 9999
  deadline: string | null   // "YYYY-MM-DD"
  impact: string
  nextAction: string
  archived: boolean
}

export interface Store { version: 1; projects: Record<string, ProjectMeta> }

export interface ToolLimits { daily: number; weekly: number; monthly: number }
export interface ToolConfig { label: string; plan: string | null; limits: ToolLimits | null }
export interface Config {
  tools: Record<ToolId, ToolConfig>
  scanRoots: string[]
  staleDays: number
  deadlineWarnDays: number
}

export interface PlanFacts { planFile: string; done: number; total: number }
export interface ProjectFacts {
  id: string            // directory name
  path: string          // "~/name" form
  branch: string | null
  lastCommitAt: string | null   // ISO
  plan: PlanFacts | null
}

export interface TokenBreakdown { input: number; output: number; cacheRead: number; cacheCreation: number; total: number }
export interface UsageEvent { date: string; projectPath: string; tokens: TokenBreakdown }

export interface UsageTotals { daily: number; weekly: number; monthly: number }
export interface CodexRateLimits { primaryUsedPercent: number | null; secondaryUsedPercent: number | null; planType: string | null; asOf: string | null }

export interface DashboardProject extends ProjectFacts {
  meta: ProjectMeta | null
  weeklyTokensByTool: Partial<Record<ToolId, number>>
}
export interface DashboardTool {
  config: ToolConfig
  totals: UsageTotals
  parseWarning: boolean
  rateLimits?: CodexRateLimits
  noData?: boolean
}
export interface DashboardResponse {
  scannedAt: string
  projects: DashboardProject[]
  tools: Record<ToolId, DashboardTool>
  staleDays: number
  deadlineWarnDays: number
}

export function emptyBreakdown(): TokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 }
}
export function addBreakdown(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheCreation: a.cacheCreation + b.cacheCreation, total: a.total + b.total }
}
export function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE')   // "YYYY-MM-DD" in local TZ
}
