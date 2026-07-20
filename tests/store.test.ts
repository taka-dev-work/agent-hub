import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readStore, readConfig, patchProject, setOrder } from '../server/store.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hub-'))
  writeFileSync(join(dir, 'store.json'), JSON.stringify({ version: 1, projects: {} }))
  writeFileSync(join(dir, 'config.json'), JSON.stringify({
    tools: { claude: { label: 'Claude Code', plan: null, limits: null }, codex: { label: 'Codex', plan: null, limits: null }, gemini: { label: 'Gemini CLI', plan: null, limits: null } },
    scanRoots: ['~'], staleDays: 14, deadlineWarnDays: 14
  }))
})

describe('store', () => {
  it('reads store and config', async () => {
    expect((await readStore(dir)).version).toBe(1)
    expect((await readConfig(dir)).staleDays).toBe(14)
  })
  it('falls back to built-in defaults when files are missing (fresh clone)', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'hub-empty-'))
    const store = await readStore(empty)
    expect(store).toEqual({ version: 1, projects: {} })
    const config = await readConfig(empty)
    expect(config.scanRoots).toEqual(['~'])
    expect(config.staleDays).toBe(14)
    expect(config.tools.claude.limits).toBeNull()
    expect(Object.keys(config.tools).sort()).toEqual(['claude', 'codex', 'gemini'])
  })
  it('patchProject creates missing project with defaults then applies patch', async () => {
    const s = await patchProject('demo-app', { impact: 'client delivery' }, dir)
    expect(s.projects['demo-app'].impact).toBe('client delivery')
    expect(s.projects['demo-app'].path).toBe('~/demo-app')
    expect(s.projects['demo-app'].rank).toBe(9999)
    expect(s.projects['demo-app'].archived).toBe(false)
  })
  it('patchProject ignores path while applying an allowed field', async () => {
    const s = await patchProject('demo-app', { path: '/tmp/hijacked', impact: 'important' }, dir)
    expect(s.projects['demo-app'].path).toBe('~/demo-app')
    expect(s.projects['demo-app'].impact).toBe('important')
  })
  it('setOrder assigns rank by array position', async () => {
    await patchProject('a', {}, dir); await patchProject('b', {}, dir)
    const s = await setOrder(['b', 'a'], dir)
    expect(s.projects.b.rank).toBe(1)
    expect(s.projects.a.rank).toBe(2)
  })
  it('serializes concurrent mutations without losing fields', async () => {
    await Promise.all([
      patchProject('demo-app', { impact: 'important' }, dir),
      patchProject('demo-app', { nextAction: 'ship it' }, dir),
    ])
    expect((await readStore(dir)).projects['demo-app']).toMatchObject({ impact: 'important', nextAction: 'ship it' })
  })
})
