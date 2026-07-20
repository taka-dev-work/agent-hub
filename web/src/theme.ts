export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'agent-hub:theme'

/** Minimal slice of Storage, so this stays testable and tolerant of hostile environments. */
interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

export function readPreference(storage: StorageLike): ThemePreference {
  let stored: string | null = null
  try { stored = storage.getItem(THEME_KEY) } catch { return 'system' }
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function writePreference(storage: StorageLike, preference: ThemePreference): void {
  try {
    if (preference === 'system') storage.removeItem(THEME_KEY)
    else storage.setItem(THEME_KEY, preference)
  } catch {
    // Private browsing or a full quota shouldn't break the toggle.
  }
}

export function nextPreference(preference: ThemePreference): ThemePreference {
  return preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system'
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

/**
 * The stylesheet only ever reads `data-theme`, so JS resolves "system" to a
 * concrete value here. That keeps one dark palette in CSS instead of two.
 */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.dataset.theme = theme
  root.style.colorScheme = theme
}
