import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanProjects } from '../server/scan/projects.ts'

describe('scanProjects', () => {
  it('detects .git / package.json dirs, merges store, skips hidden', async () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    mkdirSync(join(home, 'proj-a', '.git'), { recursive: true })
    mkdirSync(join(home, 'proj-b')); writeFileSync(join(home, 'proj-b', 'package.json'), '{}')
    mkdirSync(join(home, 'plain'))
    mkdirSync(join(home, '.hidden', '.git'), { recursive: true })
    const store = { manual: { path: '~/somewhere/manual', rank: 1, deadline: null, impact: '', nextAction: '', archived: false } }
    const res = await scanProjects(['~'], store, home)
    const ids = res.map(r => r.id).sort()
    expect(ids).toEqual(['manual', 'proj-a', 'proj-b'])
    expect(res.find(r => r.id === 'proj-a')!.path).toBe('~/proj-a')
    expect(res.find(r => r.id === 'proj-a')!.absPath).toBe(join(home, 'proj-a'))
  })

  it('keeps absolute paths for scan roots that only share the home prefix', async () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    const siblingRoot = `${home}-other`
    mkdirSync(join(siblingRoot, 'proj', '.git'), { recursive: true })

    const res = await scanProjects([siblingRoot], {}, home)

    expect(res[0]!.path).toBe(join(siblingRoot, 'proj'))
  })
})
