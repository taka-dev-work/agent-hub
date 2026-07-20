import { describe, it, expect } from 'vitest'
import { parseCodexLines } from '../server/usage/codex.ts'

function tc(ts: string, totals: { input: number; cached: number; output: number; total: number }, rate = true) {
  return JSON.stringify({
    timestamp: ts, type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: totals.input, cached_input_tokens: totals.cached, output_tokens: totals.output, total_tokens: totals.total } },
      ...(rate ? { rate_limits: { primary: { used_percent: 84 }, secondary: { used_percent: 36 }, plan_type: 'plus' } } : {}),
    },
  })
}
const meta = JSON.stringify({ timestamp: '2026-07-19T00:00:00Z', type: 'session_meta', payload: { cwd: '/home/dev/demo-app' } })

describe('parseCodexLines', () => {
  it('emits deltas of cumulative totals attributed to session cwd', () => {
    const { events, rateLimits } = parseCodexLines([
      meta,
      tc('2026-07-19T10:00:00Z', { input: 1000, cached: 800, output: 100, total: 1100 }),
      tc('2026-07-19T11:00:00Z', { input: 3000, cached: 2000, output: 400, total: 3400 }),
    ])
    expect(events).toHaveLength(2)
    expect(events[0].tokens.total).toBe(1100)
    expect(events[1].tokens.total).toBe(2300)
    expect(events[1].tokens.input).toBe(2000)
    expect(events[1].projectPath).toBe('/home/dev/demo-app')
    expect(rateLimits).toEqual({ primaryUsedPercent: 84, secondaryUsedPercent: 36, planType: 'plus', asOf: '2026-07-19T11:00:00Z' })
  })
  it('treats decreasing cumulative as reset', () => {
    const { events } = parseCodexLines([
      meta,
      tc('2026-07-19T10:00:00Z', { input: 5000, cached: 0, output: 500, total: 5500 }),
      tc('2026-07-19T10:30:00Z', { input: 200, cached: 0, output: 20, total: 220 }),
    ])
    expect(events[1].tokens.total).toBe(220)
  })
  it('resumes from provided state (incremental read)', () => {
    const state = { cwd: '/home/dev/demo-app', prev: { input: 1000, cached: 800, output: 100, total: 1100 } }
    const { events } = parseCodexLines([tc('2026-07-19T12:00:00Z', { input: 1500, cached: 900, output: 200, total: 1700 })], state)
    expect(events[0].tokens.total).toBe(600)
  })
  it('retains later rate limits when token usage totals are absent', () => {
    const laterRateLimits = JSON.stringify({
      timestamp: '2026-07-19T12:00:00Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: null,
        rate_limits: { primary: { used_percent: 91 }, secondary: { used_percent: 42 }, plan_type: 'pro' },
      },
    })

    const { events, rateLimits } = parseCodexLines([
      meta,
      tc('2026-07-19T11:00:00Z', { input: 1000, cached: 800, output: 100, total: 1100 }),
      laterRateLimits,
    ])

    expect(events).toHaveLength(1)
    expect(rateLimits).toEqual({ primaryUsedPercent: 91, secondaryUsedPercent: 42, planType: 'pro', asOf: '2026-07-19T12:00:00Z' })
  })
})
