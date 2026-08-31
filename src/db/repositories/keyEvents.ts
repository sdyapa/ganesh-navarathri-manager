import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import type { KeyEvent } from '@/types'
import type { KeyEventInput } from '@/lib/validation'

export async function listKeyEventsForYear(yearProfileId: string): Promise<KeyEvent[]> {
  return db.keyEvents.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function insertKeyEvent(yearProfileId: string, input: KeyEventInput): Promise<KeyEvent> {
  const now = nowIso()
  const event: KeyEvent = {
    id: generateId(),
    yearProfileId,
    name: input.name.trim(),
    date: input.date,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  await db.keyEvents.add(event)
  return event
}

export async function updateKeyEvent(id: string, input: KeyEventInput): Promise<void> {
  await db.keyEvents.update(id, {
    name: input.name.trim(),
    date: input.date,
    notes: input.notes?.trim() || undefined,
    updatedAt: nowIso(),
  })
}

export async function deleteKeyEvent(id: string): Promise<void> {
  await db.keyEvents.delete(id)
}
