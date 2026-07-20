import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, readConfig, readStore, patchProject, setOrder } from './store.ts'
import { scanProjects } from './scan/projects.ts'
import { gitFacts } from './scan/git.ts'
import { matchPlans } from './scan/plans.ts'
import { collectUsage, rollup, weeklyByProject, parseWarning } from './usage/aggregate.ts'
import { buildDashboard } from './dashboard.ts'
import type { ProjectMeta, ToolId, UsageTotals } from './types.ts'

const TOOLS: ToolId[] = ['claude', 'codex', 'gemini']

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function validPatch(value: unknown): value is Partial<ProjectMeta> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const patch = value as Record<string, unknown>
  const allowed = new Set(['deadline', 'impact', 'nextAction', 'rank', 'archived'])
  if (Object.keys(patch).some(key => !allowed.has(key))) return false
  if ('deadline' in patch && patch.deadline !== null && (typeof patch.deadline !== 'string' || !isValidDate(patch.deadline))) return false
  if ('impact' in patch && typeof patch.impact !== 'string') return false
  if ('nextAction' in patch && typeof patch.nextAction !== 'string') return false
  if ('rank' in patch && (typeof patch.rank !== 'number' || !Number.isInteger(patch.rank) || patch.rank < 1)) return false
  if ('archived' in patch && typeof patch.archived !== 'boolean') return false
  return true
}

function validIds(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every(id => typeof id === 'string' && id.trim().length > 0)
    && new Set(value).size === value.length
}

export function createApp(options: { dataDir?: string; home?: string } = {}) {
  const dataDir = options.dataDir ?? DATA_DIR
  const home = options.home ?? homedir()
  const app = new Hono()

  async function canonicalPaths() {
    const [config, store] = await Promise.all([readConfig(dataDir), readStore(dataDir)])
    const discovered = await scanProjects(config.scanRoots, {}, home)
    const paths = new Map(discovered.map(project => [project.id, project.path]))
    for (const [id, meta] of Object.entries(store.projects)) if (!paths.has(id)) paths.set(id, meta.path)
    return paths
  }

  app.get('/api/dashboard', async c => {
    const [config, store] = await Promise.all([readConfig(dataDir), readStore(dataDir)])
    const found = await scanProjects(config.scanRoots, store.projects, home)
    const [plans, cache] = await Promise.all([matchPlans(found), collectUsage(join(dataDir, 'usage-cache.json'))])
    const totals = {} as Record<ToolId, UsageTotals>
    const weekly = {} as Record<ToolId, Record<string, number>>
    const warns = {} as Record<ToolId, boolean>
    for (const t of TOOLS) {
      totals[t] = rollup(cache, t)
      weekly[t] = weeklyByProject(cache, t)
      warns[t] = parseWarning(cache, t)
    }
    const res = await buildDashboard({
      config, store, found, gitFactsFn: gitFacts, plans,
      usage: { totals, weeklyByProject: weekly, parseWarnings: warns, codexRateLimits: cache.codexRateLimits },
    })
    return c.json(res)
  })

  app.patch('/api/projects/:id', async c => {
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
    if (!validPatch(body)) return c.json({ error: 'Invalid project patch' }, 400)
    const id = c.req.param('id')
    const paths = await canonicalPaths()
    await patchProject(id, body, dataDir, paths.get(id))
    return c.json({ ok: true })
  })

  app.put('/api/order', async c => {
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
    const ids = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).ids : undefined
    if (!validIds(ids)) return c.json({ error: 'Invalid project order' }, 400)
    await setOrder(ids, dataDir, await canonicalPaths())
    return c.json({ ok: true })
  })

  return app
}

export function startServer() {
  const app = createApp()
  serve({ fetch: app.fetch, port: 5178, hostname: '127.0.0.1' })
  console.log('agent-hub api on http://127.0.0.1:5178')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer()
