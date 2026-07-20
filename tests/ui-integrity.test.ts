import { describe, expect, it } from 'vitest'
import { deadlineDays, isDeadlineSoon, mergeVisibleOrder, projectStartCommand } from '../web/src/integrity.ts'

describe('mergeVisibleOrder', () => {
  it('reorders visible projects in their full active-order slots', () => {
    expect(mergeVisibleOrder(['a', 'b', 'c', 'd'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b'])
  })
})

describe('projectStartCommand', () => {
  it('shell-quotes spaces and single quotes while preserving home expansion', () => {
    expect(projectStartCommand("~/client's project")).toBe(`cd "$HOME"/'client'"'"'s project' && claude`)
    expect(projectStartCommand('/tmp/a b')).toBe("cd '/tmp/a b' && claude")
  })
})

describe('deadline helpers', () => {
  it('uses local end-of-day consistently for card days and header warning state', () => {
    const now = new Date(2026, 6, 20, 12).getTime()
    expect(deadlineDays('2026-07-21', now)).toBe(2)
    expect(isDeadlineSoon('2026-07-21', 1, now)).toBe(false)
    expect(isDeadlineSoon('2026-07-21', 2, now)).toBe(true)
  })
})
