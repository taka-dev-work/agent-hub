// Generates a self-contained fixture of fake projects, plans and agent session
// logs so the dashboard can be run (and screenshotted) without touching real data.
//
//   node scripts/demo-fixture.mjs
//   npm run demo
//
// Everything lands in .demo/, which is gitignored.

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '.demo')
const HOME = join(ROOT, 'home')
const DATA = join(ROOT, 'data')
const PLANS = join(ROOT, 'plans')
const CLAUDE = join(ROOT, 'claude')
const CODEX = join(ROOT, 'codex')

const DAY = 86_400_000
const now = new Date()
const monday = new Date(now)
monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
monday.setHours(9, 0, 0, 0)

/** A day inside the current week, clamped so it never lands in the future. */
const thisWeek = offset => new Date(Math.min(+monday + offset * DAY, +now - 3600_000))
const daysAgo = n => new Date(+now - n * DAY)
/** Earlier in the same calendar month — counts toward the monthly bar, not the weekly one. */
const earlierThisMonth = n => {
  const d = daysAgo(n)
  return d.getMonth() === now.getMonth() ? d : new Date(now.getFullYear(), now.getMonth(), 1, 10)
}
const iso = d => d.toISOString()
const ymd = d => new Date(+d).toLocaleDateString('sv-SE')

const PROJECTS = [
  {
    id: 'checkout-redesign', lastCommit: daysAgo(0), branch: 'feat/one-page-checkout',
    plan: { done: 18, total: 26 },
    meta: { rank: 1, deadline: ymd(new Date(+now + 3 * DAY)), impact: 'Client launch — revenue depends on it', nextAction: 'Wire the payment webhook retry path' },
    claude: [[0, 12_400_000], [2, 18_900_000], [4, 11_200_000]],
    codex: [[3, 9_800_000], [4, 8_600_000]],
    older: { claude: [[9, 31_000_000], [15, 24_500_000]], codex: [[11, 18_200_000]] },
  },
  {
    id: 'billing-service', lastCommit: daysAgo(1), branch: 'main',
    plan: { done: 9, total: 14 },
    meta: { rank: 2, deadline: null, impact: 'Unblocks invoicing for every other project', nextAction: 'Backfill the proration tests' },
    claude: [[1, 15_600_000], [3, 10_800_000]],
    codex: [],
    older: { claude: [[10, 22_800_000]], codex: [[13, 9_400_000]] },
  },
  {
    id: 'mobile-app', lastCommit: daysAgo(4), branch: 'release/2.1',
    plan: { done: 22, total: 31 },
    meta: { rank: 3, deadline: ymd(new Date(+now + 19 * DAY)), impact: 'App store submission window', nextAction: 'Fix the cold-start crash on Android 13' },
    claude: [],
    codex: [[2, 11_300_000]],
    older: { claude: [[12, 8_700_000]], codex: [[16, 14_100_000]] },
  },
  {
    id: 'docs-site', lastCommit: daysAgo(8), branch: 'main',
    plan: null,
    meta: { rank: 4, deadline: null, impact: 'Nice to have', nextAction: '' },
    claude: [[1, 4_100_000]],
    codex: [],
  },
  {
    id: 'data-pipeline', lastCommit: daysAgo(21), branch: 'spike/dedupe',
    plan: { done: 4, total: 19 },
    meta: { rank: 5, deadline: null, impact: 'Blocks the Q3 analytics launch', nextAction: '' },
    claude: [],
    codex: [],
  },
  {
    id: 'legacy-import', lastCommit: daysAgo(34), branch: 'main',
    plan: null,
    meta: { rank: 6, deadline: null, impact: '', nextAction: '' },
    claude: [],
    codex: [],
  },
]

rmSync(ROOT, { recursive: true, force: true })
for (const dir of [HOME, DATA, PLANS, join(CLAUDE, 'projects'), join(CODEX, 'sessions')]) mkdirSync(dir, { recursive: true })

const git = (cwd, args, date) => execFileSync('git', args, {
  cwd,
  stdio: 'ignore',
  env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.com', GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.com' },
})

const claudeLine = (cwd, date, total) => JSON.stringify({
  type: 'assistant', timestamp: iso(date), cwd,
  message: { usage: { input_tokens: Math.round(total * 0.04), output_tokens: Math.round(total * 0.06), cache_read_input_tokens: Math.round(total * 0.75), cache_creation_input_tokens: Math.round(total * 0.15) } },
}) + '\n'

let lastCodexFile = null

for (const project of PROJECTS) {
  const abs = join(HOME, project.id)
  mkdirSync(abs, { recursive: true })
  writeFileSync(join(abs, 'README.md'), `# ${project.id}\n`)
  git(abs, ['init', '-b', project.branch], iso(project.lastCommit))
  git(abs, ['add', '-A'], iso(project.lastCommit))
  git(abs, ['commit', '-m', 'work'], iso(project.lastCommit))

  if (project.plan) {
    const boxes = '- [x] done\n'.repeat(project.plan.done) + '- [ ] todo\n'.repeat(project.plan.total - project.plan.done)
    writeFileSync(join(PLANS, `${project.id}-plan.md`), `# ${project.id} plan\n\nTarget: ${abs}\n\n${boxes}`)
  }

  const claudeEntries = [
    ...project.claude.map(([offset, total]) => [thisWeek(offset), total]),
    ...(project.older?.claude ?? []).map(([back, total]) => [earlierThisMonth(back), total]),
  ]
  if (claudeEntries.length) {
    const dir = join(CLAUDE, 'projects', project.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.jsonl'), claudeEntries.map(([date, total]) => claudeLine(abs, date, total)).join(''))
  }

  const codexEntries = [
    ...project.codex.map(([offset, total]) => [thisWeek(offset), total]),
    ...(project.older?.codex ?? []).map(([back, total]) => [earlierThisMonth(back), total]),
  ]
  let codexSeq = 0
  for (const [date, total] of codexEntries) {
    const offset = codexSeq++
    const file = join(CODEX, 'sessions', `rollout-${project.id}-${offset}.jsonl`)
    writeFileSync(file, [
      JSON.stringify({ timestamp: iso(date), type: 'session_meta', payload: { cwd: abs } }),
      JSON.stringify({
        timestamp: iso(date), type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: { input_tokens: Math.round(total * 0.1), cached_input_tokens: Math.round(total * 0.8), output_tokens: Math.round(total * 0.1), total_tokens: total } },
          rate_limits: { primary: { used_percent: 41 }, secondary: { used_percent: 63 }, plan_type: 'pro' },
        },
      }),
    ].join('\n') + '\n')
    lastCodexFile = file
  }
}

if (!lastCodexFile) throw new Error('demo fixture produced no codex sessions')

writeFileSync(join(DATA, 'store.json'), JSON.stringify({
  version: 1,
  projects: Object.fromEntries(PROJECTS.map(p => [p.id, { path: `~/${p.id}`, archived: false, ...p.meta }])),
}, null, 2) + '\n')

writeFileSync(join(DATA, 'config.json'), JSON.stringify({
  tools: {
    claude: { label: 'Claude Code', plan: 'Max', limits: { daily: 100_000_000, weekly: 220_000_000, monthly: 600_000_000 } },
    codex: { label: 'Codex', plan: 'Pro', limits: { daily: 45_000_000, weekly: 90_000_000, monthly: 260_000_000 } },
    gemini: { label: 'Gemini CLI', plan: null, limits: null },
  },
  scanRoots: ['~'], staleDays: 14, deadlineWarnDays: 14,
}, null, 2) + '\n')

console.log(`demo fixture ready: ${ROOT}`)
console.log(`${PROJECTS.length} projects, ${PROJECTS.filter(p => p.plan).length} plans`)
