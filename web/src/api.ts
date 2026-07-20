import { useEffect, useState, useCallback } from 'react'
import type { DashboardResponse, ProjectMeta } from './types.ts'

function requireOk(response: Response): Response {
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response
}

export function useDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    fetch('/api/dashboard').then(requireOk).then(r => r.json()).then(setData).catch(e => setError(String(e)))
  }, [])
  useEffect(() => { reload() }, [reload])
  return { data, error, reload }
}

export async function patchProject(id: string, patch: Partial<ProjectMeta>) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  requireOk(response)
}
export async function putOrder(ids: string[]) {
  const response = await fetch('/api/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
  requireOk(response)
}

export function fmtTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}
