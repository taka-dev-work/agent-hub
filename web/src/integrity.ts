export function mergeVisibleOrder(fullIds: string[], visibleIds: string[]): string[] {
  const fullSet = new Set(fullIds)
  const reordered = visibleIds.filter(id => fullSet.has(id))
  const visibleSet = new Set(reordered)
  let nextVisible = 0
  return fullIds.map(id => visibleSet.has(id) ? reordered[nextVisible++] : id)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function projectStartCommand(path: string): string {
  const quotedPath = path === '~'
    ? '"$HOME"'
    : path.startsWith('~/')
      ? `"$HOME"/${shellQuote(path.slice(2))}`
      : shellQuote(path)
  return `cd ${quotedPath} && claude`
}

export function deadlineDays(deadline: string | null, now = Date.now()): number | null {
  if (!deadline) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline)
  if (!match) return null
  const endOfDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime()
  return Number.isFinite(endOfDay) ? Math.ceil((endOfDay - now) / 86400000) : null
}

export function isDeadlineSoon(deadline: string | null, warnDays: number, now = Date.now()): boolean {
  const days = deadlineDays(deadline, now)
  return days !== null && days <= warnDays
}
