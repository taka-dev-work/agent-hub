import { describe, it, expect } from 'vitest'
import { parseClaudeLines } from '../server/usage/claude.ts'

const assistantLine = JSON.stringify({
  type: 'assistant', timestamp: '2026-07-19T10:00:00.000Z', cwd: '/home/dev/demo-app',
  message: { usage: { input_tokens: 3, cache_creation_input_tokens: 13010, cache_read_input_tokens: 11876, output_tokens: 791 } },
})

describe('parseClaudeLines', () => {
  it('extracts usage events from assistant lines', () => {
    const { events, parsed, failed } = parseClaudeLines([
      assistantLine,
      JSON.stringify({ type: 'user', timestamp: '2026-07-19T10:00:01.000Z' }),
      'not-json-garbage',
    ])
    expect(events).toHaveLength(1)
    expect(events[0].projectPath).toBe('/home/dev/demo-app')
    expect(events[0].date).toBe(new Date('2026-07-19T10:00:00.000Z').toLocaleDateString('sv-SE'))
    expect(events[0].tokens.total).toBe(3 + 13010 + 11876 + 791)
    expect(parsed).toBe(2)
    expect(failed).toBe(1)
  })
})
