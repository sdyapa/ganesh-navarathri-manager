import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import type { Profile, ProfileKind } from '@/types'

export async function listProfiles(kind?: ProfileKind): Promise<Profile[]> {
  const all = await db.profiles.toArray()
  return all.filter((p) => (kind ? p.kind === kind : true)).sort((a, b) => a.order - b.order)
}

export async function renameProfile(id: string, name: string): Promise<void> {
  await db.profiles.update(id, { name: name.trim() })
}

export async function deleteProfile(id: string): Promise<void> {
  // Always safe — no other record stores a foreign key to a Profile (see its doc comment in
  // types/index.ts), so unlike Category/Unit there's no "in use" check needed here.
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
