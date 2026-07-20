import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { localDate, type UsageEvent, type CodexRateLimits } from '../types.ts'

export interface CodexFileState {
  cwd: string | null
  prev: { input: number; cached: number; output: number; total: number }
}
const ZERO = { input: 0, cached: 0, output: 0, total: 0 }

export function parseCodexLines(lines: string[], state?: CodexFileState) {
  const s: CodexFileState = state ?? { cwd: null, prev: { ...ZERO } }
  const events: UsageEvent[] = []
  let rateLimits: CodexRateLimits | null = null
  let parsed = 0, failed = 0
  for (const line of lines) {
    if (!line.trim()) continue
    let d: any
    try { d = JSON.parse(line); parsed++ } catch { failed++; continue }
    const p = d?.payload
    if (d?.type === 'session_meta' || d?.type === 'turn_context') {
      if (p?.cwd) s.cwd = p.cwd
      continue
    }
    if (d?.type !== 'event_msg' || p?.type !== 'token_count') continue
    const rl = p.rate_limits
    if (rl && d.timestamp) {
      rateLimits = {
        primaryUsedPercent: rl.primary?.used_percent ?? null,
        secondaryUsedPercent: rl.secondary?.used_percent ?? null,
        planType: rl.plan_type ?? null,
        asOf: d.timestamp,
      }
    }
    const t = p.info?.total_token_usage
    if (!t || !d.timestamp) continue
    const cur = { input: t.input_tokens ?? 0, cached: t.cached_input_tokens ?? 0, output: t.output_tokens ?? 0, total: t.total_tokens ?? 0 }
    const prev = cur.total < s.prev.total ? ZERO : s.prev
    const delta = {
      input: Math.max(0, cur.input - prev.input),
      cached: Math.max(0, cur.cached - prev.cached),
      output: Math.max(0, cur.output - prev.output),
      total: Math.max(0, cur.total - prev.total),
    }
    s.prev = cur
    if (delta.total > 0 && s.cwd) {
      events.push({
        date: localDate(d.timestamp),
        projectPath: s.cwd,
        tokens: { input: delta.input, output: delta.output, cacheRead: delta.cached, cacheCreation: 0, total: delta.total },
      })
    }
  }
  return { events, state: s, rateLimits, parsed, failed }
}

export async function codexSessionFiles(codexDir: string = join(homedir(), '.codex')): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.name.endsWith('.jsonl')) out.push(full)
    }
  }
  await walk(join(codexDir, 'sessions'))
  return out
}
