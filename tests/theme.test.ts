import { describe, expect, it } from 'vitest'
import { nextPreference, readPreference, resolveTheme, writePreference } from '../web/src/theme.ts'

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
  }
}

describe('resolveTheme', () => {
  it('follows the system signal only when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('readPreference', () => {
  it('defaults to system and rejects unknown stored values', () => {
    expect(readPreference(fakeStorage())).toBe('system')
    expect(readPreference(fakeStorage({ 'agent-hub:theme': 'dark' }))).toBe('dark')
    expect(readPreference(fakeStorage({ 'agent-hub:theme': 'solarized' }))).toBe('system')
  })

  it('survives storage that throws (private mode, disabled cookies)', () => {
    const hostile = { getItem: () => { throw new Error('denied') }, setItem: () => {}, removeItem: () => {} }
    expect(readPreference(hostile)).toBe('system')
  })
})

describe('writePreference', () => {
  it('clears the key for system and stores explicit choices', () => {
    const storage = fakeStorage({ 'agent-hub:theme': 'dark' })
    writePreference(storage, 'system')
    expect(storage.getItem('agent-hub:theme')).toBeNull()
    writePreference(storage, 'light')
    expect(storage.getItem('agent-hub:theme')).toBe('light')
  })

  it('does not throw when storage refuses writes', () => {
    const hostile = { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('denied') } }
    expect(() => writePreference(hostile, 'dark')).not.toThrow()
    expect(() => writePreference(hostile, 'system')).not.toThrow()
  })
})

describe('nextPreference', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextPreference('system')).toBe('light')
    expect(nextPreference('light')).toBe('dark')
    expect(nextPreference('dark')).toBe('system')
  })
})
