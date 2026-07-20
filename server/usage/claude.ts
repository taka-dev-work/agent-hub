import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { localDate, type UsageEvent } from '../types.ts'

export function parseClaudeLines(lines: string[]): { events: UsageEvent[]; parsed: number; failed: number } {
  const events: UsageEvent[] = []
  let parsed = 0, failed = 0
  for (const line of lines) {
    if (!line.trim()) continue
    let d: any
    try { d = JSON.parse(line); parsed++ } catch { failed++; continue }
    const u = d?.message?.usage
    if (d?.type !== 'assistant' || !u || !d.timestamp || !d.cwd) continue
    const input = u.input_tokens ?? 0
    const output = u.output_tokens ?? 0
    const cacheRead = u.cache_read_input_tokens ?? 0
    const cacheCreation = u.cache_creation_input_tokens ?? 0
    events.push({
      date: localDate(d.timestamp),
      projectPath: d.cwd,
      tokens: { input, output, cacheRead, cacheCreation, total: input + output + cacheRead + cacheCreation },
    })
  }
  return { events, parsed, failed }
}

export async function claudeSessionFiles(claudeDir: string = join(homedir(), '.claude')): Promise<string[]> {
  const root = join(claudeDir, 'projects')
  const out: string[] = []
  let dirs: string[] = []
  try { dirs = await readdir(root) } catch { return out }
  for (const d of dirs) {
    try {
      for (const f of await readdir(join(root, d))) {
        if (f.endsWith('.jsonl')) out.push(join(root, d, f))
      }
    } catch { /* skip */ }
  }
  return out
}
