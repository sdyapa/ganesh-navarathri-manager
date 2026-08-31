// Converts an Expected Donation / Expected Expense into its actual counterpart. This never
// mutates the expected record into an actual one in place — it creates a brand-new actual
// record and marks the expected one as "converted" with a pointer to it, so the relationship
// between the two stays auditable (see spec "Audit / History Consideration").
import { insertDonation } from '@/db/repositories/donations'
import { insertExpectedDonation, markExpectedDonationConverted } from '@/db/repositories/expectedDonations'
import { insertExpense } from '@/db/repositories/expenses'
import { markExpectedExpenseConverted } from '@/db/repositories/expectedExpenses'
import { markAuctionConverted } from '@/db/repositories/auctions'
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
