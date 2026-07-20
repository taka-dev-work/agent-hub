import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmtTokens, patchProject, putOrder } from '../web/src/api.ts'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('fmtTokens', () => {
  it('formats plain, K, M, and B token values', () => {
    expect(fmtTokens(999)).toBe('999')
    expect(fmtTokens(1_000)).toBe('1.0K')
    expect(fmtTokens(4_200_000)).toBe('4.2M')
    expect(fmtTokens(1_500_000_000)).toBe('1.5B')
  })
})

describe('API mutations', () => {
  it('encodes project IDs and throws on an unsuccessful patch response', async () => {
    const fetchStub = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('', { status: 500 }))
    globalThis.fetch = fetchStub as typeof fetch

    await expect(patchProject('team/a b', { impact: 'x' })).rejects.toThrow('500')
    expect(fetchStub.mock.calls[0][0]).toBe('/api/projects/team%2Fa%20b')
  })

  it('throws on an unsuccessful order response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 503 })) as typeof fetch
    await expect(putOrder(['a'])).rejects.toThrow('503')
  })
})
