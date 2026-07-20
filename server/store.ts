import { readFile, writeFile, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Store, Config, ProjectMeta } from './types.ts'

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

export const DEFAULT_CONFIG: Config = {
  tools: {
    claude: { label: 'Claude Code', plan: null, limits: null },
    codex: { label: 'Codex', plan: null, limits: null },
    gemini: { label: 'Gemini CLI', plan: null, limits: null },
  },
  scanRoots: ['~'],
  staleDays: 14,
  deadlineWarnDays: 14,
}

export async function readStore(dataDir: string = DATA_DIR): Promise<Store> {
  try {
    return JSON.parse(await readFile(join(dataDir, 'store.json'), 'utf8'))
  } catch {
    return { version: 1, projects: {} }
  }
}
export async function writeStore(store: Store, dataDir: string = DATA_DIR): Promise<void> {
  const target = join(dataDir, 'store.json')
  const tmp = join(dataDir, `.store.${randomUUID()}.tmp`)
  await writeFile(tmp, JSON.stringify(store, null, 2) + '\n')
  await rename(tmp, target)
}
export async function readConfig(dataDir: string = DATA_DIR): Promise<Config> {
  try {
    return JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'))
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

function defaultMeta(id: string, canonicalPath?: string): ProjectMeta {
  return { path: canonicalPath ?? `~/${id}`, rank: 9999, deadline: null, impact: '', nextAction: '', archived: false }
}

const mutationQueues = new Map<string, Promise<void>>()

async function mutateStore(dataDir: string, mutate: (store: Store) => void): Promise<Store> {
  const previous = mutationQueues.get(dataDir) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(async () => {
    const store = await readStore(dataDir)
    mutate(store)
    await writeStore(store, dataDir)
    return store
  })
  const tail = operation.then(() => undefined, () => undefined)
  mutationQueues.set(dataDir, tail)
  try {
    return await operation
  } finally {
    if (mutationQueues.get(dataDir) === tail) mutationQueues.delete(dataDir)
  }
}

export async function patchProject(id: string, patch: Partial<ProjectMeta>, dataDir: string = DATA_DIR, canonicalPath?: string): Promise<Store> {
  const allowedPatch: Partial<ProjectMeta> = {}
  if ('deadline' in patch) allowedPatch.deadline = patch.deadline
  if ('impact' in patch) allowedPatch.impact = patch.impact
  if ('nextAction' in patch) allowedPatch.nextAction = patch.nextAction
  if ('rank' in patch) allowedPatch.rank = patch.rank
  if ('archived' in patch) allowedPatch.archived = patch.archived
  return mutateStore(dataDir, store => {
    store.projects[id] = { ...(store.projects[id] ?? defaultMeta(id, canonicalPath)), ...allowedPatch }
  })
}

export async function setOrder(ids: string[], dataDir: string = DATA_DIR, canonicalPaths: ReadonlyMap<string, string> = new Map()): Promise<Store> {
  return mutateStore(dataDir, store => {
    ids.forEach((id, i) => {
      store.projects[id] = { ...(store.projects[id] ?? defaultMeta(id, canonicalPaths.get(id))), rank: i + 1 }
    })
  })
}
