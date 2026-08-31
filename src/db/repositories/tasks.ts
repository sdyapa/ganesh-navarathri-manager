import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import type { Task, TaskChecklistItem } from '@/types'
import type { TaskInput } from '@/lib/validation'

export async function listTasksForYear(yearProfileId: string): Promise<Task[]> {
  return db.tasks.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function insertTask(yearProfileId: string, input: TaskInput): Promise<Task> {
  const now = nowIso()
  const task: Task = {
    id: generateId(),
    yearProfileId,
    title: input.title.trim(),
    dueDate: input.dueDate,
    notes: input.notes?.trim() || undefined,
    done: false,
    checklist: input.checklistItems
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => ({ id: generateId(), label, done: false })),
    createdAt: now,
    updatedAt: now,
  }
  await db.tasks.add(task)
  return task
}

export async function updateTask(id: string, input: TaskInput): Promise<void> {
  await db.tasks.update(id, {
    title: input.title.trim(),
    dueDate: input.dueDate,
    notes: input.notes?.trim() || undefined,
    updatedAt: nowIso(),
  })
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  await db.tasks.update(id, { done, updatedAt: nowIso() })
}

export async function addChecklistItem(taskId: string, label: string): Promise<void> {
  const trimmed = label.trim()
  if (!trimmed) return
  const task = await db.tasks.get(taskId)
  if (!task) return
  const item: TaskChecklistItem = { id: generateId(), label: trimmed, done: false }
  await db.tasks.update(taskId, { checklist: [...task.checklist, item], updatedAt: nowIso() })
}

export async function toggleChecklistItem(taskId: string, itemId: string): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  const checklist = task.checklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i))
  await db.tasks.update(taskId, { checklist, updatedAt: nowIso() })
}

export async function removeChecklistItem(taskId: string, itemId: string): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  const checklist = task.checklist.filter((i) => i.id !== itemId)
  await db.tasks.update(taskId, { checklist, updatedAt: nowIso() })
}
