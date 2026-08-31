import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import type { Profile, ProfileKind } from '@/types'
import type { Table } from 'dexie'

export async function listProfiles(kind?: ProfileKind): Promise<Profile[]> {
  const all = await db.profiles.toArray()
  return all.filter((p) => (kind ? p.kind === kind : true)).sort((a, b) => a.order - b.order)
}

// Donor/vendor/person names are plain free text on every record (see the Profile type's doc
// comment) rather than a foreign key — that's what makes the datalist-autocomplete UX possible
// without a migration. The tradeoff: renaming a Profile has to actively find-and-replace the
// old name across every table it can appear in, across every year, or historical records would
// silently keep the stale name forever.
async function renameFieldAcross<T extends { id: string }>(
  table: Table<T, string>,
  field: keyof T,
  oldName: string,
  newName: string,
): Promise<void> {
  const all = await table.toArray()
  const target = oldName.trim().toLowerCase()
  const matches = all.filter((r) => typeof r[field] === 'string' && (r[field] as unknown as string).trim().toLowerCase() === target)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await Promise.all(matches.map((r) => (table as any).update(r.id, { [field]: newName, updatedAt: nowIso() })))
}

export async function renameProfile(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await db.profiles.get(id)
  if (!existing) return
  const oldName = existing.name

  await db.transaction(
    'rw',
    [db.profiles, db.donations, db.expectedDonations, db.auctions, db.expenses, db.expectedExpenses],
    async () => {
      await db.profiles.update(id, { name: trimmed })
      if (oldName.trim().toLowerCase() === trimmed.toLowerCase()) return
      if (existing.kind === 'person') {
        await renameFieldAcross(db.donations, 'donorName', oldName, trimmed)
        await renameFieldAcross(db.expectedDonations, 'donorName', oldName, trimmed)
        await renameFieldAcross(db.auctions, 'person', oldName, trimmed)
      } else {
        await renameFieldAcross(db.expenses, 'vendorName', oldName, trimmed)
        await renameFieldAcross(db.expectedExpenses, 'vendorName', oldName, trimmed)
      }
    },
  )
}

export async function deleteProfile(id: string): Promise<void> {
  // Deletion stays a simple, safe removal — historical records keep whatever name they already
  // have (matching how Category/Unit "in use" records are never touched by the registry side
  // either); only a *rename* needs the cascade above, since a stale name left behind after a
  // rename would be confusing while a still-accurate name left behind after a delete isn't.
  await db.profiles.delete(id)
}

export async function reorderProfiles(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    await Promise.all(orderedIds.map((id, index) => db.profiles.update(id, { order: index })))
  })
}

/** Silently registers a name for future autocomplete suggestions — called from the
 *  donation/expense/auction repositories whenever a record is saved, so every name ever typed
 *  becomes available next time without the user needing a separate "add this person" step.
 *  Case-insensitive dedupe by kind+name; a no-op if a matching profile already exists. */
export async function upsertProfileFromName(kind: ProfileKind, name: string | undefined | null): Promise<void> {
  const trimmed = name?.trim()
  if (!trimmed) return
  const existing = await listProfiles(kind)
  const match = existing.find((p) => p.name.toLowerCase() === trimmed.toLowerCase())
  if (match) return
  await db.profiles.add({ id: generateId(), kind, name: trimmed, order: existing.length })
}
