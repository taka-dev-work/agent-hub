import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { matchPlans } from '../server/scan/plans.ts'

describe('matchPlans', () => {
  it('matches by path mention, counts checkboxes, picks latest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plans-'))
    writeFileSync(join(dir, 'old-slug.md'), '# old plan\n`~/demo-app` work\n- [x] a\n- [ ] b\n')
    writeFileSync(join(dir, 'new-slug.md'), '# new plan\npath: ~/demo-app\n- [x] a\n- [X] b\n- [ ] c\n- [ ] d\n')
    const old = new Date(Date.now() - 86400_000)
    utimesSync(join(dir, 'old-slug.md'), old, old)
    const projects = [{ id: 'demo-app', path: '~/demo-app', absPath: '/home/dev/demo-app' }]
    const m = await matchPlans(projects, dir)
    expect(m.get('demo-app')).toEqual({ planFile: 'new-slug.md', done: 2, total: 4 })
  })
  it('returns empty map when plansDir missing', async () => {
    const m = await matchPlans([{ id: 'a', path: '~/a', absPath: '/x/a' }], '/nonexistent-dir-xyz')
    expect(m.size).toBe(0)
  })
})
