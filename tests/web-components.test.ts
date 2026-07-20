import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InlineEdit } from '../web/src/components/InlineEdit.tsx'
import { FilterTabs } from '../web/src/components/FilterTabs.tsx'
import { TokenPanel } from '../web/src/components/TokenPanel.tsx'
import type { DashboardTool, ToolId } from '../server/types.ts'

describe('InlineEdit', () => {
  it('renders the initial value and placeholder as spans', () => {
    const valueMarkup = renderToStaticMarkup(createElement(InlineEdit, { value: 'delivery', placeholder: 'Not set', onSave: () => {} }))
    const placeholderMarkup = renderToStaticMarkup(createElement(InlineEdit, { value: '', placeholder: 'Not set', onSave: () => {} }))
    expect(valueMarkup).toContain('<span')
    expect(valueMarkup).toContain('delivery</span>')
    expect(placeholderMarkup).toContain('<span')
    expect(placeholderMarkup).toContain('Not set</span>')
  })
})

describe('FilterTabs', () => {
  it('renders all tool labels and marks the selected tab in the markup', () => {
    const markup = renderToStaticMarkup(createElement(FilterTabs, { value: 'codex', onChange: () => {} }))
    expect(markup).toContain('All')
    expect(markup).toContain('Claude Code')
    expect(markup).toContain('Codex')
    expect(markup).toContain('Gemini')
    expect(markup).toContain('<button style="background:var(--text);color:var(--surface);border-color:var(--text)">Codex</button>')
  })
})

describe('TokenPanel', () => {
  it('shows available Codex rate limits and uses a dash for a missing window', () => {
    const base: DashboardTool = {
      config: { label: 'Tool', plan: null, limits: null },
      totals: { daily: 0, weekly: 0, monthly: 0 },
      parseWarning: false,
    }
    const tools: Record<ToolId, DashboardTool> = {
      claude: base,
      codex: {
        ...base,
        config: { ...base.config, label: 'Codex' },
        rateLimits: { primaryUsedPercent: 57, secondaryUsedPercent: null, planType: 'plus', asOf: '2026-07-20T00:00:00Z' },
      },
      gemini: { ...base, config: { ...base.config, label: 'Gemini CLI' }, noData: true },
    }

    const markup = renderToStaticMarkup(createElement(TokenPanel, { tools }))
    expect(markup).toContain('Provider-reported: weekly — / 5h 57%')
  })
})
