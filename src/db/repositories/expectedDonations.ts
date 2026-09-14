import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import { upsertProfileFromName } from './profiles'
import type { ExpectedDonation } from '@/types'
import type { ExpectedDonationInput } from '@/lib/validation'

export async function listExpectedDonationsForYear(yearProfileId: string): Promise<ExpectedDonation[]> {
  return db.expectedDonations.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function getExpectedDonation(id: string): Promise<ExpectedDonation | undefined> {
  return db.expectedDonations.get(id)
}

export async function insertExpectedDonation(
  yearProfileId: string,
  input: ExpectedDonationInput,
  sourceAuctionId?: string | null,
): Promise<ExpectedDonation> {
  const now = nowIso()
  const record: ExpectedDonation = {
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
    status: 'pending',
    convertedDonationId: null,
    sourceAuctionId: sourceAuctionId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await db.expectedDonations.add(record)
  await upsertProfileFromName('person', record.donorName)
  return record
}

export async function updateExpectedDonation(id: string, input: ExpectedDonationInput): Promise<void> {
  await db.expectedDonations.update(id, {
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

export async function deleteExpectedDonation(id: string): Promise<void> {
  await db.expectedDonations.delete(id)
}

export async function markExpectedDonationConverted(id: string, donationId: string): Promise<void> {
  await db.expectedDonations.update(id, {
    status: 'converted',
    convertedDonationId: donationId,
    updatedAt: nowIso(),
  })
}

/** Updates the fields recordPartialPayment (conversionService.ts) needs to touch after each
 *  installment — kept as its own narrow function (rather than reusing updateExpectedDonation,
 *  which takes a full form-shaped ExpectedDonationInput) since this only ever changes
 *  payment-tracking fields, never the donor/amount/category fields a form edit would. */
export async function updateExpectedDonationPaymentState(
  id: string,
  patch: { status: ExpectedDonation['status']; installmentDonationIds: string[]; convertedDonationId: string | null },
): Promise<void> {
  await db.expectedDonations.update(id, { ...patch, updatedAt: nowIso() })
}
