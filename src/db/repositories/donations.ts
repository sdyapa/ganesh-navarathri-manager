import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import { upsertProfileFromName } from './profiles'
import type { Donation } from '@/types'
import type { DonationInput } from '@/lib/validation'

export async function listDonationsForYear(yearProfileId: string): Promise<Donation[]> {
  return db.donations.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function getDonation(id: string): Promise<Donation | undefined> {
  return db.donations.get(id)
}

export async function insertDonation(
  yearProfileId: string,
  input: DonationInput,
  sourceExpectedDonationId?: string | null,
): Promise<Donation> {
  const now = nowIso()
  const donation: Donation = {
    id: generateId(),
    yearProfileId,
    donorName: input.donorName.trim(),
    type: input.type,
    date: input.date,
    categoryId: input.categoryId,
    notes: input.notes?.trim() || undefined,
    amount: input.type === 'monetary' ? input.amount : undefined,
    commodityName: input.type === 'commodity' ? input.commodityName?.trim() : undefined,
    quantity: input.type === 'commodity' ? input.quantity : undefined,
    unitId: input.type === 'commodity' ? input.unitId : undefined,
    sourceExpectedDonationId: sourceExpectedDonationId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await db.donations.add(donation)
  await upsertProfileFromName('person', donation.donorName)
  return donation
}

export async function updateDonation(id: string, input: DonationInput): Promise<void> {
  await db.donations.update(id, {
    donorName: input.donorName.trim(),
    type: input.type,
    date: input.date,
    categoryId: input.categoryId,
    notes: input.notes?.trim() || undefined,
    amount: input.type === 'monetary' ? input.amount : undefined,
    commodityName: input.type === 'commodity' ? input.commodityName?.trim() : undefined,
    quantity: input.type === 'commodity' ? input.quantity : undefined,
    unitId: input.type === 'commodity' ? input.unitId : undefined,
    updatedAt: nowIso(),
  })
  await upsertProfileFromName('person', input.donorName)
}

export async function deleteDonation(id: string): Promise<void> {
  await db.donations.delete(id)
}

/** Sums the monetary amount of a specific set of Donations by id — used to compute how much of
 *  a pledge has been collected so far from its installmentDonationIds (see ExpectedDonation's
 *  doc comment and conversionService.ts's recordPartialPayment). Missing ids (shouldn't happen,
 *  but a deleted Donation would otherwise silently corrupt the running total) are skipped. */
export async function sumDonationAmounts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const records = await db.donations.bulkGet(ids)
  return records.reduce((sum, d) => sum + (d?.amount ?? 0), 0)
}
