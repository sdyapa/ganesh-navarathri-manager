// Converts an Expected Donation / Expected Expense into its actual counterpart. This never
// mutates the expected record into an actual one in place — it creates a brand-new actual
// record and marks the expected one as "converted" with a pointer to it, so the relationship
// between the two stays auditable (see spec "Audit / History Consideration").
import { insertDonation, deleteDonation, sumDonationAmounts } from '@/db/repositories/donations'
import {
  insertExpectedDonation,
  getExpectedDonation,
  markExpectedDonationConverted,
  updateExpectedDonationPaymentState,
} from '@/db/repositories/expectedDonations'
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

/** Records one installment payment against a pledge without necessarily marking it fully
 *  converted — this *is* convertExpectedDonationToDonation's generalization to N payments
 *  instead of exactly 1, for donors/auction winners who pay in installments rather than all at
 *  once. Creates a real Donation for the installment amount (auditable, hits the actual balance
 *  immediately, exactly like a one-shot conversion) and updates the source ExpectedDonation's
 *  status to 'partially-paid' — or 'converted', if this installment brings the running total to
 *  the full pledge amount, at which point it behaves identically to a plain one-shot
 *  conversion (same convertedDonationId semantics). Only meaningful for monetary pledges. */
export async function recordPartialPayment(
  expectedDonationId: string,
  yearProfileId: string,
  input: DonationInput,
): Promise<Donation> {
  const expected = await getExpectedDonation(expectedDonationId)
  if (!expected) throw new Error('Expected donation not found')

  const donation = await insertDonation(yearProfileId, input, expectedDonationId)
  const installmentDonationIds = [...(expected.installmentDonationIds ?? []), donation.id]
  const totalPaid = await sumDonationAmounts(installmentDonationIds)
  const fullyPaid = expected.type === 'monetary' && expected.amount !== undefined && totalPaid >= expected.amount

  await updateExpectedDonationPaymentState(expectedDonationId, {
    status: fullyPaid ? 'converted' : 'partially-paid',
    installmentDonationIds,
    convertedDonationId: fullyPaid ? donation.id : expected.convertedDonationId ?? null,
  })
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
 *  the Actual record and flips the source Expected record back to pending — or, for one
 *  installment of a multi-installment pledge (installmentDonationIds has more than one entry),
 *  back to 'partially-paid' instead, since the other installments are still real money already
 *  collected and shouldn't be un-recorded just because one installment is being undone. */
export async function revertDonationToExpected(donation: Donation): Promise<void> {
  if (!donation.sourceExpectedDonationId) return
  const sourceId = donation.sourceExpectedDonationId
  const expected = await getExpectedDonation(sourceId)
  await deleteDonation(donation.id)

  const remainingInstallmentIds = (expected?.installmentDonationIds ?? []).filter((id) => id !== donation.id)
  if (expected?.installmentDonationIds && remainingInstallmentIds.length > 0) {
    await updateExpectedDonationPaymentState(sourceId, {
      status: 'partially-paid',
      installmentDonationIds: remainingInstallmentIds,
      convertedDonationId: null,
    })
  } else {
    await db.expectedDonations.update(sourceId, {
      status: 'pending',
      convertedDonationId: null,
      installmentDonationIds: [],
      updatedAt: nowIso(),
    })
  }
}

export async function revertExpenseToExpected(expense: Expense): Promise<void> {
  if (!expense.sourceExpectedExpenseId) return
  const sourceId = expense.sourceExpectedExpenseId
  await deleteExpense(expense.id)
  await db.expectedExpenses.update(sourceId, { status: 'pending', convertedExpenseId: null, updatedAt: nowIso() })
}
