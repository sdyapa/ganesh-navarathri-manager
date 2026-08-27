import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
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
}

export async function deleteDonation(id: string): Promise<void> {
  await db.donations.delete(id)
}
