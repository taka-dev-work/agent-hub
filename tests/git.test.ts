import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { gitFacts } from '../server/scan/git.ts'

describe('gitFacts', () => {
  it('returns branch and last commit time', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-'))
    execSync('git init -b main && git -c user.email=t@t -c user.name=t commit --allow-empty -m x', { cwd: dir, stdio: 'ignore' })
    const f = await gitFacts(dir)
    expect(f.branch).toBe('main')
    expect(new Date(f.lastCommitAt!).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })
  it('returns nulls for non-repo', async () => {
    const f = await gitFacts(mkdtempSync(join(tmpdir(), 'nogit-')))
    expect(f).toEqual({ branch: null, lastCommitAt: null })
  })
  it('does not inherit an enclosing parent repo (parent repo hazard)', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'parent-'))
    execSync('git init -b parent-branch && git -c user.email=t@t -c user.name=t commit --allow-empty -m x', { cwd: parent, stdio: 'ignore' })
    const child = join(parent, 'child-proj')
    mkdirSync(child)
    writeFileSync(join(child, 'package.json'), '{}')   // no own .git, inside a parent repo
    const f = await gitFacts(child)
    expect(f).toEqual({ branch: null, lastCommitAt: null })
  })
})
