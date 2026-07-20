import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectUsage, rollup, weeklyByProject } from '../server/usage/aggregate.ts'

function claudeLine(ts: string, cwd: string, out: number) {
  return JSON.stringify({ type: 'assistant', timestamp: ts, cwd, message: { usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: out } } }) + '\n'
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'agg-'))
  const claudeDir = join(root, 'claude'); mkdirSync(join(claudeDir, 'projects', 'p1'), { recursive: true })
  const codexDir = join(root, 'codex'); mkdirSync(join(codexDir, 'sessions'), { recursive: true })
  return { root, claudeDir, codexDir, cachePath: join(root, 'cache.json') }
}

describe('aggregate', () => {
  it('collects, rolls up daily/weekly/monthly, splits by project', async () => {
    const { claudeDir, codexDir, cachePath } = setup()
    const f = join(claudeDir, 'projects', 'p1', 's.jsonl')
    const now = new Date('2026-07-20T12:00:00')
    writeFileSync(f,
      claudeLine('2026-07-20T10:00:00', '/x/a', 100) +
      claudeLine('2026-07-15T10:00:00', '/x/b', 40) +
      claudeLine('2026-06-01T10:00:00', '/x/a', 7))
    const cache = await collectUsage(cachePath, { claudeDir, codexDir })
    const t = rollup(cache, 'claude', now)
    expect(t.daily).toBe(100)
    expect(t.weekly).toBe(100)
    expect(t.monthly).toBe(140)
    expect(weeklyByProject(cache, 'claude', now)).toEqual({ '/x/a': 100 })
  })
  it('incremental append only adds new lines (no double count)', async () => {
    const { claudeDir, codexDir, cachePath } = setup()
    const f = join(claudeDir, 'projects', 'p1', 's.jsonl')
    writeFileSync(f, claudeLine('2026-07-20T10:00:00', '/x/a', 100))
    await collectUsage(cachePath, { claudeDir, codexDir })
    appendFileSync(f, claudeLine('2026-07-20T11:00:00', '/x/a', 50))
    const cache2 = await collectUsage(cachePath, { claudeDir, codexDir })
    expect(rollup(cache2, 'claude', new Date('2026-07-20T12:00:00')).daily).toBe(150)
  })
  it('rebuilds from scratch when a file shrinks', async () => {
    const { claudeDir, codexDir, cachePath } = setup()
    const f = join(claudeDir, 'projects', 'p1', 's.jsonl')
    writeFileSync(f, claudeLine('2026-07-20T10:00:00', '/x/a', 100) + claudeLine('2026-07-20T10:01:00', '/x/a', 100))
    await collectUsage(cachePath, { claudeDir, codexDir })
    writeFileSync(f, claudeLine('2026-07-20T10:00:00', '/x/a', 30))
    const cache2 = await collectUsage(cachePath, { claudeDir, codexDir })
    expect(rollup(cache2, 'claude', new Date('2026-07-20T12:00:00')).daily).toBe(30)
  })
  it('rebuilds from scratch when a cached session file disappears', async () => {
    const { claudeDir, codexDir, cachePath } = setup()
    const f = join(claudeDir, 'projects', 'p1', 's.jsonl')
    writeFileSync(f, claudeLine('2026-07-20T10:00:00', '/x/a', 100))
    await collectUsage(cachePath, { claudeDir, codexDir })

    unlinkSync(f)
    const cache = await collectUsage(cachePath, { claudeDir, codexDir })

    expect(rollup(cache, 'claude', new Date('2026-07-20T12:00:00')).daily).toBe(0)
    expect(cache.files).not.toHaveProperty(f)
  })
  it('rebuilds from scratch when a session file is rewritten at the same size', async () => {
    const { claudeDir, codexDir, cachePath } = setup()
    const f = join(claudeDir, 'projects', 'p1', 's.jsonl')
    const original = claudeLine('2026-07-20T10:00:00', '/x/a', 100)
    const rewritten = claudeLine('2026-07-20T10:00:00', '/x/a', 200)
    expect(rewritten).toHaveLength(original.length)
    writeFileSync(f, original)
    await collectUsage(cachePath, { claudeDir, codexDir })

    writeFileSync(f, rewritten)
    const changed = new Date(Date.now() + 5_000)
    utimesSync(f, changed, changed)
    const cache = await collectUsage(cachePath, { claudeDir, codexDir })

    expect(rollup(cache, 'claude', new Date('2026-07-20T12:00:00')).daily).toBe(200)
  })
  it('serializes concurrent collections for the same cache without double counting', async () => {
    const { claudeDir, codexDir, cachePath } = setup()
    const f = join(claudeDir, 'projects', 'p1', 's.jsonl')
    writeFileSync(f, claudeLine('2026-07-20T10:00:00', '/x/a', 100))

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => collectUsage(cachePath, { claudeDir, codexDir })),
    )

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    const cache = await collectUsage(cachePath, { claudeDir, codexDir })
    expect(rollup(cache, 'claude', new Date('2026-07-20T12:00:00')).daily).toBe(100)
  })
  it('allows a later collection after a queued collection rejects', async () => {
    const { root, claudeDir, codexDir } = setup()
    const cacheDir = join(root, 'later')
    const cachePath = join(cacheDir, 'cache.json')

    await expect(collectUsage(cachePath, { claudeDir, codexDir })).rejects.toThrow()
    mkdirSync(cacheDir)

    await expect(collectUsage(cachePath, { claudeDir, codexDir })).resolves.toMatchObject({ version: 1 })
  })
})
