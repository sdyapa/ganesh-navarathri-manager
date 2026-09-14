import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso, todayDateOnly } from '@/lib/date'
import { upsertProfileFromName } from './profiles'
import type { InventoryItem } from '@/types'
import type { InventoryItemInput } from '@/lib/validation'

export async function listInventoryItemsForYear(yearProfileId: string): Promise<InventoryItem[]> {
  return db.inventoryItems.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
  return db.inventoryItems.get(id)
}

/** Batch lookup used to resolve a carried-forward item's source year for display (see
 *  InventoryPage.tsx's "Carried from {year}" line) — one bulkGet instead of N single gets. */
export async function getInventoryItemsByIds(ids: string[]): Promise<InventoryItem[]> {
  if (ids.length === 0) return []
  const records = await db.inventoryItems.bulkGet(ids)
  return records.filter((r): r is InventoryItem => r !== undefined)
}

export async function insertInventoryItem(
  yearProfileId: string,
  input: InventoryItemInput,
  sourceInventoryItemId?: string | null,
): Promise<InventoryItem> {
  const now = nowIso()
  const item: InventoryItem = {
    id: generateId(),
    yearProfileId,
    itemName: input.itemName.trim(),
    quantity: input.quantity,
    keptWith: input.keptWith.trim(),
    notes: input.notes?.trim() || undefined,
    status: 'stored',
    storedDate: input.storedDate,
    returnedDate: null,
    sourceInventoryItemId: sourceInventoryItemId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await db.inventoryItems.add(item)
  await upsertProfileFromName('person', item.keptWith)
  return item
}

export async function updateInventoryItem(id: string, input: InventoryItemInput): Promise<void> {
  await db.inventoryItems.update(id, {
    itemName: input.itemName.trim(),
    quantity: input.quantity,
    keptWith: input.keptWith.trim(),
    notes: input.notes?.trim() || undefined,
    storedDate: input.storedDate,
    updatedAt: nowIso(),
  })
  await upsertProfileFromName('person', input.keptWith)
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await db.inventoryItems.delete(id)
}

export async function markInventoryItemReturned(id: string): Promise<void> {
  await db.inventoryItems.update(id, { status: 'returned', returnedDate: todayDateOnly(), updatedAt: nowIso() })
}

/** Undoes an accidental "Mark Returned" — mirrors setTaskDone's toggle shape. */
export async function markInventoryItemStored(id: string): Promise<void> {
  await db.inventoryItems.update(id, { status: 'stored', returnedDate: null, updatedAt: nowIso() })
}
