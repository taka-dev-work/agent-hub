import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import type { DashboardProject } from '../types.ts'
import { putOrder } from '../api.ts'
import { mergeVisibleOrder } from '../integrity.ts'
import { ProjectCard } from './ProjectCard.tsx'

export function ProjectList({ projects, fullOrderIds, staleDays, deadlineWarnDays, onChanged }: {
  projects: DashboardProject[]; fullOrderIds: string[]; staleDays: number; deadlineWarnDays: number; onChanged: () => void
}) {
  const [items, setItems] = useState(projects)
  useEffect(() => setItems(projects), [projects])

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const next = arrayMove(items, items.findIndex(i => i.id === active.id), items.findIndex(i => i.id === over.id))
    setItems(next)
    putOrder(mergeVisibleOrder(fullOrderIds, next.map(i => i.id))).then(onChanged)
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((p, i) => (
            <ProjectCard key={p.id} p={p} index={i} staleDays={staleDays} deadlineWarnDays={deadlineWarnDays} onChanged={onChanged} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
