import { readdir, access } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import type { ProjectMeta } from '../types.ts'

export interface FoundProject { id: string; path: string; absPath: string }

function expand(p: string, home: string): string {
  return p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p
}
function contract(abs: string, home: string): string {
  const rel = relative(home, abs)
  const insideHome = rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  return rel === '' ? '~' : insideHome ? join('~', rel) : abs
}
async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

export async function scanProjects(
  scanRoots: string[],
  storeProjects: Record<string, ProjectMeta>,
  home: string = homedir(),
): Promise<FoundProject[]> {
  const byId = new Map<string, FoundProject>()
  for (const root of scanRoots) {
    const rootAbs = expand(root, home)
    let entries: string[] = []
    try { entries = await readdir(rootAbs) } catch { continue }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const abs = join(rootAbs, name)
      if (await exists(join(abs, '.git')) || await exists(join(abs, 'package.json'))) {
        if (!byId.has(name)) byId.set(name, { id: name, path: contract(abs, home), absPath: abs })
      }
    }
  }
  for (const [id, meta] of Object.entries(storeProjects)) {
    byId.set(id, { id, path: meta.path, absPath: expand(meta.path, home) })
  }
  return [...byId.values()]
}
