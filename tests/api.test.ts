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
