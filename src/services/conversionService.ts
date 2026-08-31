// Converts an Expected Donation / Expected Expense into its actual counterpart. This never
// mutates the expected record into an actual one in place — it creates a brand-new actual
// record and marks the expected one as "converted" with a pointer to it, so the relationship
// between the two stays auditable (see spec "Audit / History Consideration").
import { insertDonation, deleteDonation } from '@/db/repositories/donations'
import { insertExpectedDonation, markExpectedDonationConverted } from '@/db/repositories/expectedDonations'
import { insertExpense, deleteExpense } from '@/db/repositories/expenses'
import { markExpectedExpenseConverted } from '@/db/repositories/expectedExpenses'
import { markAuctionConverted } from '@/db/repositories/auctions'
import { db } from '@/db/db'
import { nowIso } from '@/lib/date'
import type { Donation, Expense, ExpectedDonation } from '@/types'
import type { DonationInput, ExpenseInput } from '@/lib/validation'

export async function convertExpectedDonationToDonation(
  expectedDonationId: string,
  yearProfileId: string,
  input: DonationInput,
): Promise<Donation> {
  const donation = await insertDonation(yearProfileId, input, expectedDonationId)
  await markExpectedDonationConverted(expectedDonationId, donation.id)
  return donation
}

export async function moveExpectedExpenseToExpense(
  expectedExpenseId: string,
  yearProfileId: string,
  input: ExpenseInput,
): Promise<Expense> {
  const expense = await insertExpense(yearProfileId, input, expectedExpenseId)
  await markExpectedExpenseConverted(expectedExpenseId, expense.id)
  return expense
}

/** An auction winner typically pays the *following* year's festival, not on the spot — so
 *  winning an auction becomes a pending Expected Donation for next year, not an actual
 *  Donation immediately. Mirrors convertExpectedDonationToDonation's shape: create the new
 *  record, then mark the source as converted with a pointer to it. */
export async function convertAuctionToExpectedDonation(
  auctionId: string,
  targetYearProfileId: string,
  input: DonationInput,
): Promise<ExpectedDonation> {
  const expectedDonation = await insertExpectedDonation(targetYearProfileId, input, auctionId)
  await markAuctionConverted(auctionId, expectedDonation.id)
  return expectedDonation
}

/** Undoes an accidental "Convert to Donation"/"Move to Expenses" click — only possible for a
 *  record that actually came from a conversion (sourceExpectedDonationId/sourceExpectedExpenseId
 *  set); a manually-entered Actual record has no Expected counterpart to restore into. Deletes
 *  the Actual record and flips the source Expected record back to pending. */
export async function revertDonationToExpected(donation: Donation): Promise<void> {
  if (!donation.sourceExpectedDonationId) return
  const sourceId = donation.sourceExpectedDonationId
  await deleteDonation(donation.id)
  await db.expectedDonations.update(sourceId, { status: 'pending', convertedDonationId: null, updatedAt: nowIso() })
}

export async function revertExpenseToExpected(expense: Expense): Promise<void> {
  if (!expense.sourceExpectedExpenseId) return
  const sourceId = expense.sourceExpectedExpenseId
  await deleteExpense(expense.id)
  await db.expectedExpenses.update(sourceId, { status: 'pending', convertedExpenseId: null, updatedAt: nowIso() })
}
