// Converts an Expected Donation / Expected Expense into its actual counterpart. This never
// mutates the expected record into an actual one in place — it creates a brand-new actual
// record and marks the expected one as "converted" with a pointer to it, so the relationship
// between the two stays auditable (see spec "Audit / History Consideration").
import { insertDonation } from '@/db/repositories/donations'
import { markExpectedDonationConverted } from '@/db/repositories/expectedDonations'
import { insertExpense } from '@/db/repositories/expenses'
import { markExpectedExpenseConverted } from '@/db/repositories/expectedExpenses'
import type { Donation, Expense } from '@/types'
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
