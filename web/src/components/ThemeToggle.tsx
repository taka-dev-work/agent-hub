import { useEffect, useState } from 'react'
import { applyTheme, nextPreference, readPreference, resolveTheme, systemPrefersDark, writePreference, type ThemePreference } from '../theme.ts'

const LABEL: Record<ThemePreference, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }
const ICON: Record<ThemePreference, string> = { system: '◐', light: '☀', dark: '☾' }

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => readPreference(localStorage))

  useEffect(() => {
    applyTheme(document.documentElement, resolveTheme(preference, systemPrefersDark()))
    if (preference !== 'system') return
    // Only follow the OS while the user hasn't picked a side.
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => applyTheme(document.documentElement, resolveTheme('system', query.matches))
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [preference])

  function cycle() {
    const next = nextPreference(preference)
    writePreference(localStorage, next)
    setPreference(next)
  }

  return (
    <button onClick={cycle} title={`Theme: ${LABEL[preference]} — click to change`} aria-label={`Theme: ${LABEL[preference]}`}>
      {ICON[preference]} {LABEL[preference]}
    </button>
  )
}
