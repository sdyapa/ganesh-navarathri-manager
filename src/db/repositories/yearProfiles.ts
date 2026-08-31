import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import type { YearProfile } from '@/types'

export async function listYearProfiles(): Promise<YearProfile[]> {
  const all = await db.yearProfiles.toArray()
  return all.sort((a, b) => b.year - a.year)
}

export async function getYearProfile(id: string): Promise<YearProfile | undefined> {
  return db.yearProfiles.get(id)
}

export async function insertYearProfile(
  data: Pick<YearProfile, 'year' | 'name' | 'openingBalance' | 'carryForward' | 'carryForwardSourceYearId'>,
): Promise<YearProfile> {
  const now = nowIso()
  const profile: YearProfile = {
    id: generateId(),
    year: data.year,
    name: data.name,
    openingBalance: data.openingBalance,
    carryForward: data.carryForward,
    carryForwardSourceYearId: data.carryForwardSourceYearId ?? null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  await db.yearProfiles.add(profile)
  return profile
}

export async function updateYearProfile(
  id: string,
  patch: Partial<Pick<YearProfile, 'name' | 'status' | 'openingBalance' | 'carryForward' | 'carryForwardSourceYearId'>>,
): Promise<void> {
  await db.yearProfiles.update(id, { ...patch, updatedAt: nowIso() })
}

export async function deleteYearProfileCascade(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.yearProfiles, db.donations, db.expectedDonations, db.expenses, db.expectedExpenses, db.auctions],
    async () => {
      await db.donations.where('yearProfileId').equals(id).delete()
      await db.expectedDonations.where('yearProfileId').equals(id).delete()
      await db.expenses.where('yearProfileId').equals(id).delete()
      await db.expectedExpenses.where('yearProfileId').equals(id).delete()
      await db.auctions.where('yearProfileId').equals(id).delete()
      await db.yearProfiles.delete(id)
    },
  )
}

export async function yearExists(year: number, excludeId?: string): Promise<boolean> {
  const matches = await db.yearProfiles.where('year').equals(year).toArray()
  return matches.some((m) => m.id !== excludeId)
}
