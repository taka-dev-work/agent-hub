import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PlanFacts } from '../types.ts'
import type { FoundProject } from './projects.ts'

const DEFAULT_PLANS_DIR = join(homedir(), '.claude', 'plans')

export async function matchPlans(
  projects: FoundProject[],
  plansDir: string = DEFAULT_PLANS_DIR,
): Promise<Map<string, PlanFacts>> {
  const result = new Map<string, PlanFacts>()
  let files: string[] = []
  try { files = (await readdir(plansDir)).filter(f => f.endsWith('.md')) } catch { return result }

  const best = new Map<string, { mtime: number; facts: PlanFacts }>()
  for (const file of files) {
    const full = join(plansDir, file)
    let content: string, mtime: number
    try {
      content = await readFile(full, 'utf8')
      mtime = (await stat(full)).mtimeMs
    } catch { continue }
    const done = (content.match(/^\s*- \[[xX]\]/gm) ?? []).length
    const open = (content.match(/^\s*- \[ \]/gm) ?? []).length
    for (const p of projects) {
      if (!content.includes(p.path) && !content.includes(p.absPath)) continue
      const prev = best.get(p.id)
      if (!prev || mtime > prev.mtime) best.set(p.id, { mtime, facts: { planFile: file, done, total: done + open } })
    }
  }
  for (const [id, { facts }] of best) result.set(id, facts)
  return result
}
