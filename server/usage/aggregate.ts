import { readFile, writeFile, stat, open, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { emptyBreakdown, addBreakdown, type TokenBreakdown, type ToolId, type UsageTotals, type CodexRateLimits, type UsageEvent } from '../types.ts'
import { parseClaudeLines, claudeSessionFiles } from './claude.ts'
import { parseCodexLines, codexSessionFiles, type CodexFileState } from './codex.ts'
import { DATA_DIR } from '../store.ts'

export interface UsageCache {
  version: 1
  files: Record<string, { mtimeMs: number; size: number; offset: number; state?: CodexFileState }>
  days: Record<string, Partial<Record<ToolId, Record<string, TokenBreakdown>>>>
  parseStats: Record<string, { parsed: number; failed: number }>
  codexRateLimits: CodexRateLimits | null
}

function emptyCache(): UsageCache {
  return { version: 1, files: {}, days: {}, parseStats: {}, codexRateLimits: null }
}

async function readNewLines(path: string, offset: number): Promise<{ lines: string[]; newOffset: number }> {
  const fh = await open(path, 'r')
  try {
    const { size } = await fh.stat()
    if (size <= offset) return { lines: [], newOffset: offset }
    const buf = Buffer.alloc(size - offset)
    await fh.read(buf, 0, buf.length, offset)
    const text = buf.toString('utf8')
    const lastNl = text.lastIndexOf('\n')
    if (lastNl < 0) return { lines: [], newOffset: offset }
    return { lines: text.slice(0, lastNl).split('\n'), newOffset: offset + Buffer.byteLength(text.slice(0, lastNl + 1)) }
  } finally { await fh.close() }
}

function applyEvents(cache: UsageCache, tool: ToolId, events: UsageEvent[]) {
  for (const e of events) {
    const day = (cache.days[e.date] ??= {})
    const byProject = (day[tool] ??= {})
    byProject[e.projectPath] = addBreakdown(byProject[e.projectPath] ?? emptyBreakdown(), e.tokens)
  }
}

function bumpStats(cache: UsageCache, tool: ToolId, parsed: number, failed: number) {
  const s = (cache.parseStats[tool] ??= { parsed: 0, failed: 0 })
  s.parsed += parsed; s.failed += failed
}

const collectionQueues = new Map<string, Promise<void>>()

export async function collectUsage(
  cachePath: string = join(DATA_DIR, 'usage-cache.json'),
  opts: { claudeDir?: string; codexDir?: string } = {},
): Promise<UsageCache> {
  const previous = collectionQueues.get(cachePath) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(() => collectUsageNow(cachePath, opts))
  const tail = operation.then(() => undefined, () => undefined)
  collectionQueues.set(cachePath, tail)
  try {
    return await operation
  } finally {
    if (collectionQueues.get(cachePath) === tail) collectionQueues.delete(cachePath)
  }
}

async function collectUsageNow(
  cachePath: string,
  opts: { claudeDir?: string; codexDir?: string },
): Promise<UsageCache> {
  let cache: UsageCache
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')) } catch { cache = emptyCache() }

  const targets: Array<{ tool: ToolId; files: string[] }> = [
    { tool: 'claude', files: await claudeSessionFiles(opts.claudeDir) },
    { tool: 'codex', files: await codexSessionFiles(opts.codexDir) },
  ]

  const currentFiles = new Set(targets.flatMap(({ files }) => files))
  let rebuild = Object.keys(cache.files).some(f => !currentFiles.has(f))
  checkKnownFiles: for (const { files } of targets) {
    for (const f of files) {
      const known = cache.files[f]
      if (!known) continue
      try {
        const st = await stat(f)
        if (st.size < known.size || (st.size === known.size && st.mtimeMs !== known.mtimeMs)) {
          rebuild = true
          break checkKnownFiles
        }
      } catch {
        rebuild = true
        break checkKnownFiles
      }
    }
  }
  if (rebuild) cache = emptyCache()

  for (const { tool, files } of targets) {
    for (const f of files) {
      let st
      try { st = await stat(f) } catch { continue }
      const known = cache.files[f]
      if (known && known.mtimeMs === st.mtimeMs && known.size === st.size) continue
      const offset = known?.offset ?? 0
      const { lines, newOffset } = await readNewLines(f, offset)
      if (tool === 'claude') {
        const { events, parsed, failed } = parseClaudeLines(lines)
        applyEvents(cache, tool, events); bumpStats(cache, tool, parsed, failed)
        cache.files[f] = { mtimeMs: st.mtimeMs, size: st.size, offset: newOffset }
      } else {
        const { events, state, rateLimits, parsed, failed } = parseCodexLines(lines, known?.state)
        applyEvents(cache, tool, events); bumpStats(cache, tool, parsed, failed)
        if (rateLimits && (!cache.codexRateLimits || rateLimits.asOf! > cache.codexRateLimits.asOf!)) cache.codexRateLimits = rateLimits
        cache.files[f] = { mtimeMs: st.mtimeMs, size: st.size, offset: newOffset, state }
      }
    }
  }

  const tmp = join(dirname(cachePath), `.usage-cache.${randomUUID()}.tmp`)
  await writeFile(tmp, JSON.stringify(cache))
  await rename(tmp, cachePath)
  return cache
}

function fmt(d: Date): string { return d.toLocaleDateString('sv-SE') }
function mondayOf(d: Date): Date {
  const x = new Date(d); const dow = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - dow); return x
}

export function rollup(cache: UsageCache, tool: ToolId, now: Date = new Date()): UsageTotals {
  const today = fmt(now), monday = fmt(mondayOf(now)), first = fmt(new Date(now.getFullYear(), now.getMonth(), 1))
  const totals = { daily: 0, weekly: 0, monthly: 0 }
  for (const [date, byTool] of Object.entries(cache.days)) {
    const sum = Object.values(byTool[tool] ?? {}).reduce((a, b) => a + b.total, 0)
    if (date === today) totals.daily += sum
    if (date >= monday && date <= today) totals.weekly += sum
    if (date >= first && date <= today) totals.monthly += sum
  }
  return totals
}

export function weeklyByProject(cache: UsageCache, tool: ToolId, now: Date = new Date()): Record<string, number> {
  const today = fmt(now), monday = fmt(mondayOf(now))
  const out: Record<string, number> = {}
  for (const [date, byTool] of Object.entries(cache.days)) {
    if (date < monday || date > today) continue
    for (const [proj, tb] of Object.entries(byTool[tool] ?? {})) out[proj] = (out[proj] ?? 0) + tb.total
  }
  return out
}

export function parseWarning(cache: UsageCache, tool: ToolId): boolean {
  const s = cache.parseStats[tool]
  if (!s || s.parsed + s.failed === 0) return false
  return s.failed / (s.parsed + s.failed) > 0.5
}
