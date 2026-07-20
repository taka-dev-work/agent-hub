import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDashboard } from '../server/dashboard.ts'
import { createApp } from '../server/index.ts'
import { readStore } from '../server/store.ts'

function apiFixture() {
  const root = mkdtempSync(join(tmpdir(), 'hub-api-'))
  const home = join(root, 'home')
  const dataDir = join(root, 'data')
  mkdirSync(join(home, 'workspace', 'nested'), { recursive: true })
  mkdirSync(dataDir)
  writeFileSync(join(home, 'workspace', 'nested', 'package.json'), '{}')
  writeFileSync(join(dataDir, 'store.json'), JSON.stringify({ version: 1, projects: {} }))
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({
    tools: { claude: { label: 'Claude', plan: null, limits: null }, codex: { label: 'Codex', plan: null, limits: null }, gemini: { label: 'Gemini', plan: null, limits: null } },
    scanRoots: ['~/workspace'], staleDays: 14, deadlineWarnDays: 14,
  }))
  return { app: createApp({ dataDir, home }), dataDir }
}

describe('buildDashboard', () => {
  it('merges facts, meta and usage; sorts by rank then recency; maps weekly tokens via absPath', async () => {
    const res = await buildDashboard({
      config: {
        tools: {
          claude: { label: 'Claude Code', plan: 'Max 20x', limits: { daily: 10, weekly: 100, monthly: 1000 } },
          codex: { label: 'Codex', plan: null, limits: null },
          gemini: { label: 'Gemini CLI', plan: null, limits: null },
        },
        scanRoots: ['~'], staleDays: 14, deadlineWarnDays: 14,
      },
      store: { version: 1, projects: { b: { path: '~/b', rank: 1, deadline: null, impact: '', nextAction: '', archived: false } } },
      found: [
        { id: 'a', path: '~/a', absPath: '/h/a' },
        { id: 'b', path: '~/b', absPath: '/h/b' },
      ],
      gitFactsFn: async (abs) => ({ branch: 'main', lastCommitAt: abs === '/h/a' ? '2026-07-19T00:00:00Z' : '2026-07-01T00:00:00Z' }),
      plans: new Map([['a', { planFile: 'x.md', done: 2, total: 4 }]]),
      usage: {
        totals: { claude: { daily: 5, weekly: 50, monthly: 500 }, codex: { daily: 0, weekly: 0, monthly: 0 }, gemini: { daily: 0, weekly: 0, monthly: 0 } },
        weeklyByProject: { claude: { '/h/a': 42 }, codex: {}, gemini: {} },
        parseWarnings: { claude: false, codex: false, gemini: false },
        codexRateLimits: null,
      },
    })
    expect(res.projects.map(p => p.id)).toEqual(['b', 'a'])   // rank=1 first, unranked last
    expect(res.projects[1].plan).toEqual({ planFile: 'x.md', done: 2, total: 4 })
    expect(res.projects[1].weeklyTokensByTool.claude).toBe(42)
    expect(res.tools.claude.totals.weekly).toBe(50)
    expect(res.tools.gemini.noData).toBe(true)
  })
})

describe('source isolation', () => {
  it('reads plans and usage from injected directories instead of the real home', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hub-iso-'))
    const home = join(root, 'home')
    const dataDir = join(root, 'data')
    const plansDir = join(root, 'plans')
    const claudeDir = join(root, 'claude')
    const codexDir = join(root, 'codex')
    const projectAbs = join(home, 'demo-app')
    mkdirSync(projectAbs, { recursive: true })
    mkdirSync(dataDir); mkdirSync(plansDir)
    mkdirSync(join(claudeDir, 'projects', 'demo'), { recursive: true })
    mkdirSync(join(codexDir, 'sessions'), { recursive: true })
    writeFileSync(join(projectAbs, 'package.json'), '{}')
    writeFileSync(join(dataDir, 'store.json'), JSON.stringify({ version: 1, projects: {} }))
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({
      tools: { claude: { label: 'Claude', plan: null, limits: null }, codex: { label: 'Codex', plan: null, limits: null }, gemini: { label: 'Gemini', plan: null, limits: null } },
      scanRoots: ['~'], staleDays: 14, deadlineWarnDays: 14,
    }))
    writeFileSync(join(plansDir, 'demo.md'), `# demo\npath: ${projectAbs}\n- [x] a\n- [ ] b\n`)
    writeFileSync(join(claudeDir, 'projects', 'demo', 's.jsonl'), JSON.stringify({
      type: 'assistant', timestamp: new Date().toISOString(), cwd: projectAbs,
      message: { usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    }) + '\n')

    const app = createApp({ dataDir, home, plansDir, claudeDir, codexDir })
    const res = await (await app.request('/api/dashboard')).json()
    const demo = res.projects.find((p: { id: string }) => p.id === 'demo-app')
    expect(demo.plan).toMatchObject({ done: 1, total: 2 })
    expect(demo.weeklyTokensByTool.claude).toBe(1500)
    expect(res.tools.claude.totals.weekly).toBe(1500)
  })
})

describe('API mutations', () => {
  it('preserves canonical nested-root paths for first PATCH and order writes', async () => {
    const { app, dataDir } = apiFixture()
    const patchResponse = await app.request('/api/projects/nested', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ impact: 'important' }),
    })
    expect(patchResponse.status).toBe(200)
    expect((await readStore(dataDir)).projects.nested.path).toBe('~/workspace/nested')

    writeFileSync(join(dataDir, 'store.json'), JSON.stringify({ version: 1, projects: {} }))
    const orderResponse = await app.request('/api/order', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['nested'] }),
    })
    expect(orderResponse.status).toBe(200)
    expect((await readStore(dataDir)).projects.nested).toMatchObject({ path: '~/workspace/nested', rank: 1 })
  })

  it('returns 400 for invalid PATCH payloads', async () => {
    const { app } = apiFixture()
    for (const body of [
      { impact: 42 }, { nextAction: {} }, { deadline: '2026/07/20' }, { archived: 'yes' }, { rank: Number.NaN }, { path: '/tmp/hijacked' },
    ]) {
      const response = await app.request('/api/projects/nested', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
    }
  })

  it('returns 400 for malformed or duplicate order ids', async () => {
    const { app } = apiFixture()
    for (const body of [{ ids: 'nested' }, { ids: [''] }, { ids: ['nested', 'nested'] }]) {
      const response = await app.request('/api/order', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
    }
  })
})
