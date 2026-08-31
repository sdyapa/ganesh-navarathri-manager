import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import type { PoojaAssignment } from '@/types'
import type { PoojaAssignmentInput } from '@/lib/validation'

export async function listPoojaAssignmentsForYear(yearProfileId: string): Promise<PoojaAssignment[]> {
  return db.poojaAssignments.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function insertPoojaAssignment(yearProfileId: string, input: PoojaAssignmentInput): Promise<PoojaAssignment> {
  const now = nowIso()
  const record: PoojaAssignment = {
    id: generateId(),
    yearProfileId,
    date: input.date,
    familyNames: input.familyNames.trim(),
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
  await db.poojaAssignments.add(record)
  return record
}

export async function updatePoojaAssignment(id: string, input: PoojaAssignmentInput): Promise<void> {
  await db.poojaAssignments.update(id, {
    date: input.date,
    familyNames: input.familyNames.trim(),
    notes: input.notes?.trim() || undefined,
    updatedAt: nowIso(),
  })
}

export async function deletePoojaAssignment(id: string): Promise<void> {
  await db.poojaAssignments.delete(id)
}
