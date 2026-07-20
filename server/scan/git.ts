import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpath } from 'node:fs/promises'
const run = promisify(execFile)

export async function gitFacts(absPath: string): Promise<{ branch: string | null; lastCommitAt: string | null }> {
  try {
    // A project dir without its own .git would otherwise inherit facts from an
    // enclosing parent repo — verify the repo toplevel is the project path itself
    const top = await run('git', ['-C', absPath, 'rev-parse', '--show-toplevel'])
    if (await realpath(top.stdout.trim()) !== await realpath(absPath)) {
      return { branch: null, lastCommitAt: null }
    }
    const [log, br] = await Promise.all([
      run('git', ['-C', absPath, 'log', '-1', '--format=%ct']),
      run('git', ['-C', absPath, 'rev-parse', '--abbrev-ref', 'HEAD']),
    ])
    const ct = parseInt(log.stdout.trim(), 10)
    return {
      branch: br.stdout.trim() || null,
      lastCommitAt: Number.isFinite(ct) ? new Date(ct * 1000).toISOString() : null,
    }
  } catch {
    return { branch: null, lastCommitAt: null }
  }
}
